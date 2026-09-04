import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật (không tái hiện SQL, không grep mã nguồn) — nhờ helper
// tests/helpers/phien.ts mock next/headers và ký cookie phiên bằng chính makeToken() của sản
// phẩm. Đây là file mẫu cho toàn bộ app/api/**: nếu cách này đứng vững thì hơn 450 route còn
// lại đều test được theo cùng khuôn.
//
// Chọn /api/baselines làm mẫu vì nó có đủ mọi tầng đáng kiểm của một route điển hình: 401 chưa
// đăng nhập, 400 chưa chọn dự án, 403 sai vai trò, 422 dữ liệu không hợp lệ, và một đường ghi
// có transaction + phạm vi dự án.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

type Ctx = { userId: number; pwHash: string; projectId: number; taskId: number };

/** Dựng dự án + tháp + sheet + nhóm + task + user với vai trò cho trước. */
async function dungDuLieu(role: string, ten: string): Promise<Ctx> {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `BL route ${ten}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp BL')`,
    projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet BL')`,
    towerId,
    `BLR${ten}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'B1', 'Nhóm BL')`,
    stId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'B1,01', 'Task BL', 0.4)`,
    pkgId,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-baseline-route', ?, 1)`,
    `BL ${ten}`,
    `bl-${ten}-${RUN}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  return { userId, pwHash: u!.password_hash, projectId, taskId };
}

const req = (body?: unknown) =>
  new NextRequest("http://localhost/api/baselines", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test("GET /api/baselines: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/baselines/route");
  const res = await GET();
  assert.equal(res.status, 401);
  assert.match((await res.json()).error, /Chưa đăng nhập/);
});

test(
  "GET /api/baselines: thiếu cookie dự án thì tự chọn dự án đầu — KHÔNG trả 400",
  S,
  async () => {
    // Hành vi thiết kế của resolveProjectId: cookie thiếu/không hợp lệ → lấy dự án ĐẦU TIÊN
    // mà user nhìn thấy. Nhánh 400 "Chưa chọn dự án" chỉ dành cho user không thấy dự án nào
    // (ca dưới), chứ không phải cho lần đăng nhập đầu chưa kịp chọn. Ghi lại đúng như vậy để
    // sau này không ai "sửa" nhầm theo kỳ vọng sai.
    const ctx = await dungDuLieu("pm", `nodu${RUN}`);
    // Gán dự án TRƯỚC rồi mới đăng nhập KHÔNG kèm cookie chọn dự án: đúng kịch bản "user có
    // dự án nhưng chưa chọn". (Gán qua dangNhapDuAn với projectId rồi xoá cookie — nếu chỉ
    // truyền null thì user không được gán dự án nào và rơi vào nhánh 400 của ca kế tiếp.)
    await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, null);
    const { GET } = await import("@/app/api/baselines/route");
    const res = await GET();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray((await res.json()).baselines));
  },
);

test("GET /api/baselines: user không được gán dự án nào → 400 'Chưa chọn dự án'", S, async () => {
  // Khi bảng user_projects ĐÃ có dữ liệu, user không nằm trong đó sẽ không thấy dự án nào —
  // đây mới là đường thật dẫn tới 400.
  const { insertId, queryOne, run } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `khonggan${RUN}`);
  const nguoiKhac = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('BL khac', ?, 'hash-test-baseline-route', 'pm', 1)`,
    `bl-khac-${RUN}@test.local`,
  );
  // Gán dự án cho NGƯỜI KHÁC → bảng user_projects khác rỗng, còn ctx.userId không có dòng nào.
  await run(
    `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`,
    nguoiKhac,
    ctx.projectId,
  );
  try {
    const u = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      ctx.userId,
    );
    await dangNhapDuAn({ id: ctx.userId, passwordHash: u!.password_hash }, null);
    const { GET } = await import("@/app/api/baselines/route");
    const res = await GET();
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Chưa chọn dự án/);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, nguoiKhac);
  }
});

test("POST /api/baselines: vai trò không được chốt baseline → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `ky${RUN}`);
  await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/baselines/route");
  const res = await POST(req({ name: "Không được phép" }));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /Chỉ Admin\/PM/);
});

test(
  "POST rồi GET /api/baselines: PM chốt được baseline, chỉ thấy baseline của dự án mình",
  S,
  async () => {
    const a = await dungDuLieu("pm", `pmA${RUN}`);
    const b = await dungDuLieu("pm", `pmB${RUN}`);

    // PM của dự án A chốt baseline.
    await dangNhapDuAn({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
    const { POST, GET } = await import("@/app/api/baselines/route");
    const tao = await POST(req({ name: "Baseline A", note: "ghi chú" }));
    assert.equal(tao.status, 201);
    const jsonTao = await tao.json();
    assert.equal(jsonTao.name, "Baseline A");
    assert.equal(jsonTao.taskCount, 1, "snapshot đúng 1 task của dự án A");

    const dsA = await GET();
    assert.equal(dsA.status, 200);
    const listA = (await dsA.json()).baselines;
    assert.equal(listA.length, 1);
    assert.equal(listA[0].name, "Baseline A");
    assert.equal(Number(listA[0].taskCount), 1);

    // PM của dự án B KHÔNG được thấy baseline của A — đây là bất biến cách ly dự án, và nó
    // chỉ kiểm được thật khi route thực sự chạy với phiên của B.
    await dangNhapDuAn({ id: b.userId, passwordHash: b.pwHash }, b.projectId);
    const dsB = await GET();
    assert.deepEqual((await dsB.json()).baselines, []);
  },
);

test("POST /api/baselines: dự án chưa có task nào → 422, không tạo baseline rỗng", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `BL rong ${RUN}`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('BL rong', ?, 'hash-test-baseline-route', 'pm', 1)`,
    `bl-rong-${RUN}@test.local`,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  await dangNhapDuAn({ id: userId, passwordHash: u!.password_hash }, projectId);
  const { POST } = await import("@/app/api/baselines/route");
  const res = await POST(req({}));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Chưa có task nào/);
});

test("GET /api/baselines: cookie phiên bị sửa chữ ký → 401", S, async () => {
  const ctx = await dungDuLieu("pm", `giamao${RUN}`);
  await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { datCookie } = await import("./helpers/phien");
  const { COOKIE } = await import("@/lib/bao-mat/session-token");
  // Đổi một ký tự trong phần chữ ký — toàn bộ đường xác thực THẬT vẫn chạy, nên phải bị từ chối.
  datCookie(COOKIE, `${ctx.userId}.${Date.now() + 86400000}.hash-test-b.0.0.1.deadbeef`);
  const { GET } = await import("@/app/api/baselines/route");
  assert.equal((await GET()).status, 401);
});
