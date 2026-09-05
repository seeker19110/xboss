import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật (theo khuôn tests/route-baselines.test.ts) cho cụm
// route QUẢN TRỊ & NGƯỜI DÙNG — bề mặt phân quyền rủi ro cao nhất của XBoss: ai được tạo/
// sửa/xoá người dùng, dự án, sheet; ai thấy thông báo của ai. Phủ 401/403 ở MỌI route,
// không lộ password_hash, cách ly theo tổ chức (org)/dự án, và các ràng buộc nghiệp vụ
// (không hạ/xoá Admin cuối cùng, xoá dự án/sheet phải rỗng dữ liệu con...).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Tạo 1 tổ chức + user với vai trò cho trước, trả kèm password_hash thật để đăng nhập. */
async function dungUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; pwHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-qt-route', ?, ?)`,
    `QT ${ten}`,
    `qt-${ten}-${RUN}@test.local`,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  return { id: userId, pwHash: u!.password_hash, orgId };
}

/** Tạo 1 dự án trống (không tower) thuộc org cho trước. */
async function dungDuAn(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, ?)`, `QT DA ${ten}`, orgId);
}

/** Tạo 1 sheet đầy đủ WBS (tower → sheet → package → task → dimension) để test copy/xoá. */
async function dungSheetDayDu(
  ten: string,
  projectId?: number,
): Promise<{ sheetId: number; towerId: number; taskId: number; projectId: number }> {
  const { insertId, run } = await import("@/lib/db");
  const pid = projectId ?? (await dungDuAn(`sheet-${ten}`));
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp QT')`,
    pid,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'Sheet QT', ?)`,
    towerId,
    `QT${ten}`,
    `qt-sheet-${ten.toLowerCase()}-${RUN}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'A1', 'Nhóm QT')`,
    sheetId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'A1,01', 'Task QT', 0.2)`,
    pkgId,
  );
  await run(
    `INSERT INTO progress_dimensions (task_id, dimension_label, installed) VALUES (?, 'D1', 0)`,
    taskId,
  );
  return { sheetId, towerId, taskId, projectId: pid };
}

// ============================================================================
// app/api/users/route.ts — GET (danh sách) / POST (tạo user)
// ============================================================================

test("GET /api/users: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/users/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/users: engineer (không quản lý, không gán việc) → 403", S, async () => {
  // BẤT BIẾN: chỉ admin (manageUsers) và pm (assign — cần danh sách để gán task) được
  // xem danh sách người dùng. Vai trò khác phải bị chặn ở tầng route.
  const eng = await dungUser("engineer", `eng${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { GET } = await import("@/app/api/users/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test(
  "GET /api/users: admin thấy danh sách, KHÔNG lộ password_hash, chỉ user cùng org",
  S,
  async () => {
    const orgB = await (async () => {
      const { insertId } = await import("@/lib/db");
      return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org B ${RUN}`);
    })();
    const admin = await dungUser("admin", `admin${RUN}`, 1);
    const nguoiOrgKhac = await dungUser("engineer", `orgb${RUN}`, orgB);
    dangNhap({ id: admin.id, passwordHash: admin.pwHash, orgId: 1 });
    const { GET } = await import("@/app/api/users/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const bodyText = await res.text();
    // Kiểm bằng cách đọc TOÀN BỘ body thô — không chỉ field đã biết tên, để bắt cả
    // trường hợp lỡ thêm password_hash vào response sau này.
    assert.doesNotMatch(bodyText, /password_hash/);
    assert.doesNotMatch(bodyText, /hash-qt-route/);
    const json = JSON.parse(bodyText);
    const ids: number[] = json.users.map((u: { id: number }) => u.id);
    assert.ok(ids.includes(admin.id));
    assert.ok(!ids.includes(nguoiOrgKhac.id), "không được thấy user org khác");
  },
);

test("GET /api/users: pm cũng xem được (dùng để gán task)", S, async () => {
  const pm = await dungUser("pm", `pm${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { GET } = await import("@/app/api/users/route");
  const res = await GET();
  assert.equal(res.status, 200);
});

test("POST /api/users: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/users/route");
  const res = await POST(req("http://localhost/api/users", "POST", { name: "x" }));
  assert.equal(res.status, 401);
});

test("POST /api/users: pm không được tạo user → 403", S, async () => {
  const pm = await dungUser("pm", `pmtao${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/users/route");
  const res = await POST(
    req("http://localhost/api/users", "POST", {
      name: "X",
      email: `x-${RUN}@test.local`,
      password: "123456",
      role: "engineer",
    }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/users: admin, thiếu tên/email/mật khẩu → 400", S, async () => {
  const admin = await dungUser("admin", `admin400${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { POST } = await import("@/app/api/users/route");
  const res = await POST(req("http://localhost/api/users", "POST", { name: "X" }));
  assert.equal(res.status, 400);
});

test("POST /api/users: mật khẩu dưới 6 ký tự → 400", S, async () => {
  const admin = await dungUser("admin", `adminpw${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { POST } = await import("@/app/api/users/route");
  const res = await POST(
    req("http://localhost/api/users", "POST", {
      name: "X",
      email: `x2-${RUN}@test.local`,
      password: "123",
      role: "engineer",
    }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/users: vai trò không hợp lệ → 400", S, async () => {
  const admin = await dungUser("admin", `adminrole${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { POST } = await import("@/app/api/users/route");
  const res = await POST(
    req("http://localhost/api/users", "POST", {
      name: "X",
      email: `x3-${RUN}@test.local`,
      password: "123456",
      role: "sieu-admin",
    }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/users: email trùng → 409", S, async () => {
  const admin = await dungUser("admin", `admindup${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { POST } = await import("@/app/api/users/route");
  const email = `dup-${RUN}@test.local`;
  const first = await POST(
    req("http://localhost/api/users", "POST", {
      name: "Dup",
      email,
      password: "123456",
      role: "engineer",
    }),
  );
  assert.equal(first.status, 201);
  const second = await POST(
    req("http://localhost/api/users", "POST", {
      name: "Dup 2",
      email,
      password: "123456",
      role: "engineer",
    }),
  );
  assert.equal(second.status, 409);
});

test("POST /api/users: admin tạo user mới thuộc ĐÚNG org của mình", S, async () => {
  const { insertId } = await import("@/lib/db");
  const orgC = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org C ${RUN}`);
  const admin = await dungUser("admin", `adminorg${RUN}`, orgC);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash, orgId: orgC });
  const { POST } = await import("@/app/api/users/route");
  const res = await POST(
    req("http://localhost/api/users", "POST", {
      name: "Org C User",
      email: `orgc-${RUN}@test.local`,
      password: "123456",
      role: "engineer",
    }),
  );
  assert.equal(res.status, 201);
  const { queryOne } = await import("@/lib/db");
  const created = await queryOne<{ orgId: number }>(
    `SELECT org_id AS "orgId" FROM users WHERE id = ?`,
    (await res.json()).user.id,
  );
  assert.equal(
    created?.orgId,
    orgC,
    "user mới không tự dựa DEFAULT org_id=1 mà theo org admin tạo",
  );
});

// ============================================================================
// app/api/users/[id]/route.ts — PATCH / DELETE
// ============================================================================

test("PATCH /api/users/:id: chưa đăng nhập → 401", { ...S }, async () => {
  // Route này từng dùng `if (!me || !CAN.manageUsers(me.role))` nên chưa đăng nhập cũng ra
  // 403. Gộp như vậy khiến client không phân biệt được "phiên hết hạn, đăng nhập lại" với
  // "tài khoản không đủ quyền" — hai tình huống cần hai cách xử lý khác hẳn. Đã tách.
  dangXuat();
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(req("http://localhost/api/users/1", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/users/:id: engineer không được sửa (kể cả chính mình) → 403", S, async () => {
  const eng = await dungUser("engineer", `engpatch${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(req(`http://localhost/api/users/${eng.id}`, "PATCH", { role: "admin" }), {
    params: Promise.resolve({ id: String(eng.id) }),
  });
  // BẤT BIẾN: không ai tự nâng vai trò mình lên admin qua PATCH — engineer bị chặn ngay
  // ở tầng quyền (403) trước khi chạm tới logic đổi role.
  assert.equal(res.status, 403);
});

test("PATCH /api/users/:id: admin, id không tồn tại → 404", S, async () => {
  const admin = await dungUser("admin", `admin404${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(req("http://localhost/api/users/999999999", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/users/:id: admin, id không phải số → 400", S, async () => {
  const admin = await dungUser("admin", `adminnan${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(req("http://localhost/api/users/abc", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/users/:id: vai trò mới không hợp lệ → 400", S, async () => {
  const admin = await dungUser("admin", `adminrole2${RUN}`);
  const target = await dungUser("engineer", `target1${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/users/${target.id}`, "PATCH", { role: "sieu-nhan" }),
    { params: Promise.resolve({ id: String(target.id) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/users/:id: không thể hạ cấp Admin cuối cùng", S, async () => {
  // Cô lập: xoá hết admin khác trong org trước khi kiểm — bảng đếm admin không phân biệt
  // org nên phải đảm bảo đúng 1 admin tồn tại lúc test chạy.
  const { run, queryOne } = await import("@/lib/db");
  const before = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM users WHERE role='admin'`,
  );
  const admin = await dungUser("admin", `adminlast${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  if (Number(before?.n) > 0) {
    // Đã có admin khác từ ca trước trong cùng tiến trình test — không cản test này vì
    // COUNT thực tế >1, phải hạ hết xuống trước khi kiểm ca "admin cuối cùng".
    await run(`UPDATE users SET role = 'engineer' WHERE role = 'admin' AND id <> ?`, admin.id);
  }
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/users/${admin.id}`, "PATCH", { role: "engineer" }),
    { params: Promise.resolve({ id: String(admin.id) }) },
  );
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /Admin cuối cùng/);
});

test("PATCH /api/users/:id: tên rỗng → 400", S, async () => {
  const admin = await dungUser("admin", `adminname${RUN}`);
  const target = await dungUser("engineer", `target2${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(req(`http://localhost/api/users/${target.id}`, "PATCH", { name: "  " }), {
    params: Promise.resolve({ id: String(target.id) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/users/:id: mật khẩu mới dưới 6 ký tự → 400", S, async () => {
  const admin = await dungUser("admin", `adminpw2${RUN}`);
  const target = await dungUser("engineer", `target3${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/users/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/users/${target.id}`, "PATCH", { password: "123" }),
    { params: Promise.resolve({ id: String(target.id) }) },
  );
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/users/:id: admin sửa tên/role/mật khẩu/tắt 2FA thành công, KHÔNG lộ password_hash",
  S,
  async () => {
    const admin = await dungUser("admin", `adminok${RUN}`);
    const target = await dungUser("engineer", `target4${RUN}`);
    const { run } = await import("@/lib/db");
    await run(
      `UPDATE users SET totp_secret = 'ABC', totp_enabled_at = NOW() WHERE id = ?`,
      target.id,
    );
    dangNhap({ id: admin.id, passwordHash: admin.pwHash });
    const { PATCH } = await import("@/app/api/users/[id]/route");
    const res = await PATCH(
      req(`http://localhost/api/users/${target.id}`, "PATCH", {
        name: "Tên mới",
        role: "pm",
        password: "matkhaumoi",
        disable2fa: true,
      }),
      { params: Promise.resolve({ id: String(target.id) }) },
    );
    assert.equal(res.status, 200);
    const bodyText = await res.text();
    assert.doesNotMatch(bodyText, /password_hash/);
    const json = JSON.parse(bodyText);
    assert.equal(json.user.name, "Tên mới");
    assert.equal(json.user.role, "pm");

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne<{ totpSecret: string | null }>(
      `SELECT totp_secret AS "totpSecret" FROM users WHERE id = ?`,
      target.id,
    );
    assert.equal(row?.totpSecret, null, "disable2fa phải xoá totp_secret");
  },
);

test("DELETE /api/users/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(req("http://localhost/api/users/1", "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/users/:id: engineer không được xoá → 403", S, async () => {
  const eng = await dungUser("engineer", `engdel${RUN}`);
  const target = await dungUser("engineer", `target5${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(req(`http://localhost/api/users/${target.id}`, "DELETE"), {
    params: Promise.resolve({ id: String(target.id) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/users/:id: không thể tự xoá tài khoản đang đăng nhập", S, async () => {
  const admin = await dungUser("admin", `adminself${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(req(`http://localhost/api/users/${admin.id}`, "DELETE"), {
    params: Promise.resolve({ id: String(admin.id) }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/users/:id: id không tồn tại → 404", S, async () => {
  const admin = await dungUser("admin", `admindel404${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(req("http://localhost/api/users/999999998", "DELETE"), {
    params: Promise.resolve({ id: "999999998" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/users/:id: id không phải số → 400", S, async () => {
  const admin = await dungUser("admin", `admindelnan${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(req("http://localhost/api/users/xyz", "DELETE"), {
    params: Promise.resolve({ id: "xyz" }),
  });
  assert.equal(res.status, 400);
});

test(
  "DELETE /api/users/:id: xoá admin khi CÒN admin khác trong hệ (không phải cuối) → 200",
  S,
  async () => {
    // GHI CHÚ PHÁT HIỆN (báo report, KHÔNG tự sửa route): nhánh "Không thể xoá Admin cuối
    // cùng" trong DELETE dường như KHÔNG THỂ chạm tới qua API thật. Để rơi vào đó cần
    // target.role==='admin' VÀ tổng số admin toàn hệ <=1 — nghĩa là target là admin DUY
    // NHẤT. Nhưng người gọi DELETE bắt buộc cũng phải là admin (CAN.manageUsers), và nếu
    // người gọi CHÍNH LÀ target thì bị chặn sớm hơn bởi check "không thể tự xoá tài khoản
    // đang đăng nhập" (id === me.id, đứng trước trong route). Nếu người gọi là admin KHÁC
    // target thì tổng số admin đã >= 2, không rơi vào <=1. Vậy nhánh admin-cuối trong DELETE
    // là code chết — khác PATCH (nơi admin có thể tự hạ cấp CHÍNH MÌNH nên nhánh đó có
    // đường chạm thật, xem ca PATCH "không thể hạ cấp Admin cuối cùng" ở trên).
    // Ca dưới đây kiểm đúng hành vi THẬT: 2 admin trong hệ, một admin xoá admin còn lại —
    // phải cho phép (không việc gì phải chặn, vẫn còn 1 admin sau khi xoá).
    const { run, queryOne } = await import("@/lib/db");
    const runner = await dungUser("admin", `admindelrunner${RUN}`);
    const target = await dungUser("admin", `admindeltarget${RUN}`);
    // Hạ hết admin khác (nếu có từ ca trước trong cùng tiến trình) để phép đếm dưới đây
    // phản ánh đúng đúng 2 admin: runner + target.
    await run(
      `UPDATE users SET role = 'engineer' WHERE role = 'admin' AND id NOT IN (?, ?)`,
      runner.id,
      target.id,
    );
    const admins = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE role='admin'`,
    );
    assert.equal(Number(admins?.n), 2);
    dangNhap({ id: runner.id, passwordHash: runner.pwHash });
    const { DELETE } = await import("@/app/api/users/[id]/route");
    const res = await DELETE(req(`http://localhost/api/users/${target.id}`, "DELETE"), {
      params: Promise.resolve({ id: String(target.id) }),
    });
    assert.equal(res.status, 200);
  },
);

test("DELETE /api/users/:id: admin xoá thành công, gỡ liên kết task/notification", S, async () => {
  const admin = await dungUser("admin", `admindelok${RUN}`);
  const target = await dungUser("engineer", `targetdel${RUN}`);
  const { insertId, run, queryOne } = await import("@/lib/db");
  const { sheetId } = await dungSheetDayDu(`del${RUN}`);
  const pkg = await queryOne<{ id: number }>(
    `SELECT id FROM work_packages WHERE sheet_type_id = ?`,
    sheetId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, assigned_to) VALUES (?, 'A1,02', 'Task gan', ?)`,
    pkg!.id,
    target.id,
  );
  await run(
    `INSERT INTO notifications (user_id, task_id, type, message) VALUES (?, ?, 'delayed', 'msg')`,
    target.id,
    taskId,
  );
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { DELETE } = await import("@/app/api/users/[id]/route");
  const res = await DELETE(req(`http://localhost/api/users/${target.id}`, "DELETE"), {
    params: Promise.resolve({ id: String(target.id) }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const gone = await queryOne(`SELECT id FROM users WHERE id = ?`, target.id);
  assert.equal(gone, undefined);
  const taskAfter = await queryOne<{ assignedTo: number | null }>(
    `SELECT assigned_to AS "assignedTo" FROM tasks WHERE id = ?`,
    taskId,
  );
  assert.equal(taskAfter?.assignedTo, null, "task được gán phải gỡ liên kết trước khi xoá user");
});

// ============================================================================
// app/api/projects/route.ts — GET / POST
// ============================================================================

test("GET /api/projects: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/projects/route");
  const res = await GET(req("http://localhost/api/projects", "GET"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/projects: cách ly dự án — chỉ thấy dự án được gán qua user_projects",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const projA = await dungDuAn(`isoA${RUN}`);
    const projB = await dungDuAn(`isoB${RUN}`);
    const eng = await dungUser("engineer", `isoeng${RUN}`);
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, eng.id, projA);
    // Gán cho người khác dự án B để bảng user_projects khác rỗng toàn hệ (nếu không,
    // hành vi "bảng rỗng = thấy hết" sẽ che mất phép thử cách ly).
    const nguoiKhac = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('QT khac', ?, 'h', 'pm', 1)`,
      `qt-khac-${RUN}@test.local`,
    );
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, nguoiKhac, projB);
    dangNhap({ id: eng.id, passwordHash: eng.pwHash });
    const { GET } = await import("@/app/api/projects/route");
    const res = await GET(req("http://localhost/api/projects", "GET"));
    assert.equal(res.status, 200);
    const ids: number[] = (await res.json()).projects.map((p: { id: number }) => p.id);
    assert.ok(ids.includes(projA));
    assert.ok(!ids.includes(projB), "không được thấy dự án chưa được gán");
  },
);

test("GET /api/projects: lọc theo ?org=", S, async () => {
  const { insertId } = await import("@/lib/db");
  const orgD = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org D ${RUN}`);
  const admin = await dungUser("admin", `adminorgfilter${RUN}`);
  const projD = await dungDuAn(`orgD${RUN}`, orgD);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { GET } = await import("@/app/api/projects/route");
  const res = await GET(req(`http://localhost/api/projects?org=${orgD}`, "GET"));
  const ids: number[] = (await res.json()).projects.map((p: { id: number }) => p.id);
  assert.ok(ids.includes(projD));
});

test("POST /api/projects: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/projects/route");
  const res = await POST(req("http://localhost/api/projects", "POST", { name: "x" }));
  assert.equal(res.status, 401);
});

test("POST /api/projects: pm không được tạo dự án → 403", S, async () => {
  const pm = await dungUser("pm", `pmproj${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/projects/route");
  const res = await POST(req("http://localhost/api/projects", "POST", { name: "Du an moi" }));
  assert.equal(res.status, 403);
});

test("POST /api/projects: thiếu tên → 400", S, async () => {
  const admin = await dungUser("admin", `adminprojname${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { POST } = await import("@/app/api/projects/route");
  const res = await POST(req("http://localhost/api/projects", "POST", {}));
  assert.equal(res.status, 400);
});

test("POST /api/projects: mã dự án trùng → 409", S, async () => {
  const admin = await dungUser("admin", `adminprojdup${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { POST } = await import("@/app/api/projects/route");
  const code = `PRJ${RUN}`;
  const first = await POST(req("http://localhost/api/projects", "POST", { name: "A", code }));
  assert.equal(first.status, 201);
  const second = await POST(req("http://localhost/api/projects", "POST", { name: "B", code }));
  assert.equal(second.status, 409);
});

test("POST /api/projects: admin tạo thành công → 201", S, async () => {
  const admin = await dungUser("admin", `adminprojok${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { POST } = await import("@/app/api/projects/route");
  const res = await POST(
    req("http://localhost/api/projects", "POST", {
      name: "Dự án OK",
      investor: "CĐT",
      contractor: "NT",
      color: "#000",
    }),
  );
  assert.equal(res.status, 201);
  assert.ok((await res.json()).id > 0);
});

// ============================================================================
// app/api/projects/[id]/route.ts — PATCH / DELETE
// ============================================================================

test("PATCH /api/projects/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(req("http://localhost/api/projects/1", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/projects/:id: pm không được sửa dự án → 403", S, async () => {
  const pm = await dungUser("pm", `pmpatch${RUN}`);
  const proj = await dungDuAn(`patch403${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(req(`http://localhost/api/projects/${proj}`, "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: String(proj) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/projects/:id: id không phải số → 400", S, async () => {
  const admin = await dungUser("admin", `adminpatchnan${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(req("http://localhost/api/projects/abc", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/projects/:id: không tồn tại → 404", S, async () => {
  const admin = await dungUser("admin", `adminpatch404${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(req("http://localhost/api/projects/999999997", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "999999997" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/projects/:id: tên rỗng → 400", S, async () => {
  const admin = await dungUser("admin", `adminpatchname${RUN}`);
  const proj = await dungDuAn(`patchname${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(req(`http://localhost/api/projects/${proj}`, "PATCH", { name: "  " }), {
    params: Promise.resolve({ id: String(proj) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/projects/:id: mã trùng dự án khác → 409", S, async () => {
  const admin = await dungUser("admin", `adminpatchdup${RUN}`);
  const code = `PPX${RUN}`;
  const { insertId } = await import("@/lib/db");
  await insertId(`INSERT INTO projects (name, code) VALUES (?, ?)`, "Đã có mã", code);
  const proj = await dungDuAn(`patchdup${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(req(`http://localhost/api/projects/${proj}`, "PATCH", { code }), {
    params: Promise.resolve({ id: String(proj) }),
  });
  assert.equal(res.status, 409);
});

test("PATCH /api/projects/:id: trạng thái không hợp lệ → 422", S, async () => {
  const admin = await dungUser("admin", `adminpatchstatus${RUN}`);
  const proj = await dungDuAn(`patchstatus${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/projects/${proj}`, "PATCH", { status: "khong-hop-le" }),
    { params: Promise.resolve({ id: String(proj) }) },
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/projects/:id: admin sửa đủ trường thành công", S, async () => {
  const admin = await dungUser("admin", `adminpatchok${RUN}`);
  const proj = await dungDuAn(`patchok${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { PATCH } = await import("@/app/api/projects/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/projects/${proj}`, "PATCH", {
      name: "Tên mới",
      code: `PNEW${RUN}`,
      investor: "CĐT mới",
      contractor: "NT mới",
      color: "#fff",
      status: "handover",
    }),
    { params: Promise.resolve({ id: String(proj) }) },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("DELETE /api/projects/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/projects/[id]/route");
  const res = await DELETE(req("http://localhost/api/projects/1", "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/projects/:id: pm không được xoá → 403", S, async () => {
  const pm = await dungUser("pm", `pmdel${RUN}`);
  const proj = await dungDuAn(`del403${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { DELETE } = await import("@/app/api/projects/[id]/route");
  const res = await DELETE(req(`http://localhost/api/projects/${proj}`, "DELETE"), {
    params: Promise.resolve({ id: String(proj) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/projects/:id: id không phải số → 400", S, async () => {
  const admin = await dungUser("admin", `admindelnan2${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { DELETE } = await import("@/app/api/projects/[id]/route");
  const res = await DELETE(req("http://localhost/api/projects/abc", "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/projects/:id: không tồn tại → 404", S, async () => {
  const admin = await dungUser("admin", `admindel4042${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { DELETE } = await import("@/app/api/projects/[id]/route");
  const res = await DELETE(req("http://localhost/api/projects/999999996", "DELETE"), {
    params: Promise.resolve({ id: "999999996" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/projects/:id: còn tower → 409, không xoá", S, async () => {
  const admin = await dungUser("admin", `admindeltower${RUN}`);
  const { towerId, sheetId } = await dungSheetDayDu(`deltower${RUN}`);
  void sheetId;
  const { queryOne } = await import("@/lib/db");
  const tower = await queryOne<{ projectId: number }>(
    `SELECT project_id AS "projectId" FROM towers WHERE id = ?`,
    towerId,
  );
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { DELETE } = await import("@/app/api/projects/[id]/route");
  const res = await DELETE(req(`http://localhost/api/projects/${tower!.projectId}`, "DELETE"), {
    params: Promise.resolve({ id: String(tower!.projectId) }),
  });
  assert.equal(res.status, 409);
});

test(
  "DELETE /api/projects/:id: rỗng tower nhưng còn dữ liệu scoped (materials) → 409",
  S,
  async () => {
    const admin = await dungUser("admin", `admindelmat${RUN}`);
    const proj = await dungDuAn(`delmat${RUN}`);
    const { insertId } = await import("@/lib/db");
    await insertId(`INSERT INTO materials (project_id, name) VALUES (?, 'Vật tư QT')`, proj);
    dangNhap({ id: admin.id, passwordHash: admin.pwHash });
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(req(`http://localhost/api/projects/${proj}`, "DELETE"), {
      params: Promise.resolve({ id: String(proj) }),
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /materials/);
  },
);

test(
  "DELETE /api/projects/:id: dự án rỗng → xoá thành công, dọn user_projects/nav_settings",
  S,
  async () => {
    const admin = await dungUser("admin", `admindelok2${RUN}`);
    const proj = await dungDuAn(`delok${RUN}`);
    const { run, queryOne } = await import("@/lib/db");
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, admin.id, proj);
    await run(
      `INSERT INTO nav_settings (node_key, project_id, enabled) VALUES ('dash.test', ?, true)`,
      proj,
    );
    dangNhap({ id: admin.id, passwordHash: admin.pwHash });
    const { DELETE } = await import("@/app/api/projects/[id]/route");
    const res = await DELETE(req(`http://localhost/api/projects/${proj}`, "DELETE"), {
      params: Promise.resolve({ id: String(proj) }),
    });
    assert.equal(res.status, 200);
    const gone = await queryOne(`SELECT id FROM projects WHERE id = ?`, proj);
    assert.equal(gone, undefined);
    const up = await queryOne(`SELECT * FROM user_projects WHERE project_id = ?`, proj);
    assert.equal(up, undefined);
  },
);

// ============================================================================
// app/api/sheets/route.ts — GET / POST / PUT
// ============================================================================

test("GET /api/sheets: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/sheets/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/sheets: đã đăng nhập → 200 trả danh sách sheet + KPI", S, async () => {
  const admin = await dungUser("admin", `admingetsheet${RUN}`);
  dangNhap({ id: admin.id, passwordHash: admin.pwHash });
  const { GET } = await import("@/app/api/sheets/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray((await res.json()).sheets));
});

test("POST /api/sheets: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(req("http://localhost/api/sheets", "POST", { name: "x" }));
  assert.equal(res.status, 401);
});

test("POST /api/sheets: engineer không được tạo sheet → 403", S, async () => {
  const eng = await dungUser("engineer", `engsheet${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(req("http://localhost/api/sheets", "POST", { name: "Sheet X" }));
  assert.equal(res.status, 403);
});

test("POST /api/sheets: thiếu tên → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetname${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(req("http://localhost/api/sheets", "POST", {}));
  assert.equal(res.status, 400);
});

test("POST /api/sheets: slug không hợp lệ → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetslug${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(
    req("http://localhost/api/sheets", "POST", { name: "Sheet Y", slug: "SLUG SAI!" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/sheets: slug đã dùng → 409", S, async () => {
  const pm = await dungUser("pm", `pmsheetslugdup${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/sheets/route");
  const slug = `slugdup-${RUN}`;
  const first = await POST(
    req("http://localhost/api/sheets", "POST", { name: `Sheet A ${RUN}`, slug }),
  );
  assert.equal(first.status, 201);
  const second = await POST(
    req("http://localhost/api/sheets", "POST", { name: `Sheet B ${RUN}`, slug }),
  );
  assert.equal(second.status, 409);
});

test("POST /api/sheets: mã sheet đã tồn tại → 409", S, async () => {
  const pm = await dungUser("pm", `pmsheetcodedup${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/sheets/route");
  const code = `SHCODE${RUN}`;
  const first = await POST(
    req("http://localhost/api/sheets", "POST", { name: `Sheet C1 ${RUN}`, code }),
  );
  assert.equal(first.status, 201);
  const second = await POST(
    req("http://localhost/api/sheets", "POST", { name: `Sheet C2 ${RUN}`, code }),
  );
  assert.equal(second.status, 409);
});

test("POST /api/sheets: copyFromId không tồn tại → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetcopybad${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(
    req("http://localhost/api/sheets", "POST", { name: "Sheet D", copyFromId: 999999995 }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/sheets: systemId không hợp lệ → 422", S, async () => {
  const pm = await dungUser("pm", `pmsheetsysbad${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { POST } = await import("@/app/api/sheets/route");
  const res = await POST(
    req("http://localhost/api/sheets", "POST", { name: "Sheet E", systemId: 999999994 }),
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/sheets: tạo mới thành công (không copy) — tự tạo tower nếu DB trống",
  S,
  async () => {
    const pm = await dungUser("pm", `pmsheetok${RUN}`);
    dangNhap({ id: pm.id, passwordHash: pm.pwHash });
    const { POST } = await import("@/app/api/sheets/route");
    const res = await POST(req("http://localhost/api/sheets", "POST", { name: `Sheet OK ${RUN}` }));
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.copiedTasks, 0);
  },
);

test(
  "POST /api/sheets: copyFromId hợp lệ → copy nguyên cấu trúc (package/task/dimension)",
  S,
  async () => {
    const pm = await dungUser("pm", `pmsheetcopyok${RUN}`);
    const { sheetId, projectId } = await dungSheetDayDu(`copysrc${RUN}`);
    // Đợt 6, Việc G: POST /api/sheets giờ lọc copyFromId theo visibleProjectIds — pm phải
    // được gán vào dự án chứa sheet nguồn (dangNhapDuAn), `dangNhap` trần không đủ nữa vì
    // bảng user_projects không còn rỗng khi chạy cả bộ test.
    await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
    const { POST } = await import("@/app/api/sheets/route");
    const res = await POST(
      req("http://localhost/api/sheets", "POST", {
        name: `Sheet Copy ${RUN}`,
        copyFromId: sheetId,
      }),
    );
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.copiedTasks, 1);
    const { queryOne } = await import("@/lib/db");
    const newTask = await queryOne<{ progressPercent: number }>(
      `SELECT t.progress_percent AS "progressPercent" FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id WHERE wp.sheet_type_id = ?`,
      json.sheet.id,
    );
    assert.equal(newTask?.progressPercent, 0, "task copy phải reset tiến độ về 0");
  },
);

test("PUT /api/sheets: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(req("http://localhost/api/sheets", "PUT", { ids: [1, 2] }));
  assert.equal(res.status, 401);
});

test("PUT /api/sheets: engineer không được sắp xếp → 403", S, async () => {
  const eng = await dungUser("engineer", `engput${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(req("http://localhost/api/sheets", "PUT", { ids: [1, 2] }));
  assert.equal(res.status, 403);
});

test("PUT /api/sheets: ids rỗng → 400", S, async () => {
  const pm = await dungUser("pm", `pmputempty${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(req("http://localhost/api/sheets", "PUT", { ids: [] }));
  assert.equal(res.status, 400);
});

test("PUT /api/sheets: ids không phải số nguyên → 422", S, async () => {
  const pm = await dungUser("pm", `pmputnan${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(req("http://localhost/api/sheets", "PUT", { ids: ["a", "b"] }));
  assert.equal(res.status, 422);
});

test("PUT /api/sheets: sắp xếp lại thành công", S, async () => {
  const pm = await dungUser("pm", `pmputok${RUN}`);
  const s1 = await dungSheetDayDu(`put1-${RUN}`);
  const s2 = await dungSheetDayDu(`put2-${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { PUT } = await import("@/app/api/sheets/route");
  const res = await PUT(
    req("http://localhost/api/sheets", "PUT", { ids: [s2.sheetId, s1.sheetId] }),
  );
  assert.equal(res.status, 200);
  const { queryOne } = await import("@/lib/db");
  const st = await queryOne<{ sortOrder: number }>(
    `SELECT sort_order AS "sortOrder" FROM sheet_types WHERE id = ?`,
    s2.sheetId,
  );
  assert.equal(st?.sortOrder, 1);
});

// ============================================================================
// app/api/sheets/[id]/route.ts — PATCH / DELETE
// ============================================================================

test("PATCH /api/sheets/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(req("http://localhost/api/sheets/1", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/sheets/:id: engineer không được sửa → 403", S, async () => {
  const eng = await dungUser("engineer", `engsheetpatch${RUN}`);
  const { sheetId } = await dungSheetDayDu(`shpatch403-${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(req(`http://localhost/api/sheets/${sheetId}`, "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: String(sheetId) }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/sheets/:id: không tồn tại → 404", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatch404${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(req("http://localhost/api/sheets/999999993", "PATCH", { name: "x" }), {
    params: Promise.resolve({ id: "999999993" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/sheets/:id: body không hợp lệ (null) → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchnull${RUN}`);
  const { sheetId, projectId } = await dungSheetDayDu(`shpatchnull-${RUN}`);
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(
    new NextRequest(`http://localhost/api/sheets/${sheetId}`, {
      method: "PATCH",
      body: "not-json",
    }),
    { params: Promise.resolve({ id: String(sheetId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sheets/:id: tên rỗng → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchname${RUN}`);
  const { sheetId, projectId } = await dungSheetDayDu(`shpatchname-${RUN}`);
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(req(`http://localhost/api/sheets/${sheetId}`, "PATCH", { name: " " }), {
    params: Promise.resolve({ id: String(sheetId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/sheets/:id: mã trùng sheet khác → 409", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchdup${RUN}`);
  const a = await dungSheetDayDu(`shpatchdupA-${RUN}`);
  const b = await dungSheetDayDu(`shpatchdupB-${RUN}`, a.projectId);
  const { queryOne } = await import("@/lib/db");
  const codeA = (await queryOne<{ code: string }>(
    `SELECT code FROM sheet_types WHERE id = ?`,
    a.sheetId,
  ))!.code;
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, a.projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/sheets/${b.sheetId}`, "PATCH", { code: codeA }),
    {
      params: Promise.resolve({ id: String(b.sheetId) }),
    },
  );
  assert.equal(res.status, 409);
});

test("PATCH /api/sheets/:id: slug không hợp lệ → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchslugbad${RUN}`);
  const { sheetId, projectId } = await dungSheetDayDu(`shpatchslugbad-${RUN}`);
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/sheets/${sheetId}`, "PATCH", { slug: "Slug Sai!" }),
    { params: Promise.resolve({ id: String(sheetId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sheets/:id: slug trùng sheet khác → 409", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchslugdup${RUN}`);
  const a = await dungSheetDayDu(`shpatchslugdupA-${RUN}`);
  const b = await dungSheetDayDu(`shpatchslugdupB-${RUN}`, a.projectId);
  const { queryOne } = await import("@/lib/db");
  const slugA = (await queryOne<{ slug: string }>(
    `SELECT slug FROM sheet_types WHERE id = ?`,
    a.sheetId,
  ))!.slug;
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, a.projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/sheets/${b.sheetId}`, "PATCH", { slug: slugA }),
    {
      params: Promise.resolve({ id: String(b.sheetId) }),
    },
  );
  assert.equal(res.status, 409);
});

test("PATCH /api/sheets/:id: managerId không tồn tại → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchmgr${RUN}`);
  const { sheetId, projectId } = await dungSheetDayDu(`shpatchmgr-${RUN}`);
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/sheets/${sheetId}`, "PATCH", { managerId: 999999992 }),
    { params: Promise.resolve({ id: String(sheetId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/sheets/:id: không có gì để cập nhật → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchempty${RUN}`);
  const { sheetId, projectId } = await dungSheetDayDu(`shpatchempty-${RUN}`);
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(req(`http://localhost/api/sheets/${sheetId}`, "PATCH", {}), {
    params: Promise.resolve({ id: String(sheetId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/sheets/:id: sửa đủ trường thành công", S, async () => {
  const pm = await dungUser("pm", `pmsheetpatchok${RUN}`);
  const { sheetId, projectId } = await dungSheetDayDu(`shpatchok-${RUN}`);
  await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
  const { PATCH } = await import("@/app/api/sheets/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/sheets/${sheetId}`, "PATCH", {
      name: "Sheet đã sửa",
      code: `SHOK${RUN}`,
      slug: `sh-ok-${RUN}`,
      responsible: "Ông A",
      managerId: pm.id,
    }),
    { params: Promise.resolve({ id: String(sheetId) }) },
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.sheet.name, "Sheet đã sửa");
  assert.equal(json.sheet.managerId, pm.id);
});

test("DELETE /api/sheets/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/sheets/[id]/route");
  const res = await DELETE(req("http://localhost/api/sheets/1", "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/sheets/:id: engineer không được xoá → 403", S, async () => {
  const eng = await dungUser("engineer", `engsheetdel${RUN}`);
  const { sheetId } = await dungSheetDayDu(`shdel403-${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { DELETE } = await import("@/app/api/sheets/[id]/route");
  const res = await DELETE(req(`http://localhost/api/sheets/${sheetId}`, "DELETE"), {
    params: Promise.resolve({ id: String(sheetId) }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/sheets/:id: id không phải số → 400", S, async () => {
  const pm = await dungUser("pm", `pmsheetdelnan${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { DELETE } = await import("@/app/api/sheets/[id]/route");
  const res = await DELETE(req("http://localhost/api/sheets/abc", "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/sheets/:id: không tồn tại → 404", S, async () => {
  const pm = await dungUser("pm", `pmsheetdel404${RUN}`);
  dangNhap({ id: pm.id, passwordHash: pm.pwHash });
  const { DELETE } = await import("@/app/api/sheets/[id]/route");
  const res = await DELETE(req("http://localhost/api/sheets/999999991", "DELETE"), {
    params: Promise.resolve({ id: "999999991" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/sheets/:id: xoá kéo theo toàn bộ dữ liệu con (package/task/dimension/photo/comment/material)",
  S,
  async () => {
    const pm = await dungUser("pm", `pmsheetdelok${RUN}`);
    const { sheetId, taskId, projectId } = await dungSheetDayDu(`shdelok-${RUN}`);
    const { insertId, queryOne } = await import("@/lib/db");
    await insertId(`INSERT INTO task_photos (task_id, file_name) VALUES (?, 'a.jpg')`, taskId);
    await insertId(
      `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, 'binh luan')`,
      taskId,
      pm.id,
    );
    await insertId(
      `INSERT INTO notifications (user_id, task_id, type, message) VALUES (?, ?, 'delayed', 'msg')`,
      pm.id,
      taskId,
    );
    await insertId(
      `INSERT INTO materials (sheet_type_id, name) VALUES (?, 'Vật tư sheet')`,
      sheetId,
    );
    await dangNhapDuAn({ id: pm.id, passwordHash: pm.pwHash }, projectId);
    const { DELETE } = await import("@/app/api/sheets/[id]/route");
    const res = await DELETE(req(`http://localhost/api/sheets/${sheetId}`, "DELETE"), {
      params: Promise.resolve({ id: String(sheetId) }),
    });
    assert.equal(res.status, 200);
    const st = await queryOne(`SELECT id FROM sheet_types WHERE id = ?`, sheetId);
    assert.equal(st, undefined);
    const task = await queryOne(`SELECT id FROM tasks WHERE id = ?`, taskId);
    assert.equal(task, undefined, "task con phải bị xoá theo");
    const photo = await queryOne(`SELECT id FROM task_photos WHERE task_id = ?`, taskId);
    assert.equal(photo, undefined, "ảnh gắn task phải bị xoá theo");
    const mat = await queryOne(`SELECT id FROM materials WHERE sheet_type_id = ?`, sheetId);
    assert.equal(mat, undefined, "vật tư gắn sheet phải bị xoá theo");
  },
);

// ============================================================================
// app/api/notifications/route.ts — GET / POST
// ============================================================================

test("GET /api/notifications: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/notifications/route");
  const res = await GET(new Request("http://localhost/api/notifications"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/notifications: chỉ thấy thông báo CỦA CHÍNH MÌNH, không lộ của người khác",
  S,
  async () => {
    const a = await dungUser("engineer", `notiA${RUN}`);
    const b = await dungUser("engineer", `notiB${RUN}`);
    const { insertId } = await import("@/lib/db");
    await insertId(
      `INSERT INTO notifications (user_id, type, message) VALUES (?, 'comment', ?)`,
      a.id,
      `Thông báo riêng của A ${RUN}`,
    );
    await insertId(
      `INSERT INTO notifications (user_id, type, message) VALUES (?, 'comment', ?)`,
      b.id,
      `Thông báo riêng của B ${RUN}`,
    );
    dangNhap({ id: a.id, passwordHash: a.pwHash });
    const { GET } = await import("@/app/api/notifications/route");
    const res = await GET(new Request("http://localhost/api/notifications"));
    assert.equal(res.status, 200);
    const bodyText = await res.text();
    assert.match(bodyText, /Thông báo riêng của A/);
    assert.doesNotMatch(bodyText, /Thông báo riêng của B/, "không được lộ thông báo của user khác");
  },
);

test("GET /api/notifications: tôn trọng ?limit=", S, async () => {
  const eng = await dungUser("engineer", `notilimit${RUN}`);
  const { insertId } = await import("@/lib/db");
  for (let i = 0; i < 3; i++) {
    await insertId(
      `INSERT INTO notifications (user_id, type, message) VALUES (?, 'comment', ?)`,
      eng.id,
      `Thông báo limit ${i} ${RUN}`,
    );
  }
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { GET } = await import("@/app/api/notifications/route");
  const res = await GET(new Request("http://localhost/api/notifications?limit=2"));
  const json = await res.json();
  assert.equal(json.notifications.length, 2);
});

test("POST /api/notifications: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/notifications/route");
  const res = await POST(
    new Request("http://localhost/api/notifications", {
      method: "POST",
      body: JSON.stringify({ markAllRead: true }),
    }),
  );
  assert.equal(res.status, 401);
});

test("POST /api/notifications: thiếu hành động → 400", S, async () => {
  const eng = await dungUser("engineer", `notiaction${RUN}`);
  dangNhap({ id: eng.id, passwordHash: eng.pwHash });
  const { POST } = await import("@/app/api/notifications/route");
  const res = await POST(
    new Request("http://localhost/api/notifications", { method: "POST", body: JSON.stringify({}) }),
  );
  assert.equal(res.status, 400);
});

test(
  "POST /api/notifications markAllRead: chỉ đánh dấu đã đọc thông báo CỦA CHÍNH MÌNH",
  S,
  async () => {
    const a = await dungUser("engineer", `markA${RUN}`);
    const b = await dungUser("engineer", `markB${RUN}`);
    const { insertId, queryOne } = await import("@/lib/db");
    const notiA = await insertId(
      `INSERT INTO notifications (user_id, type, message) VALUES (?, 'comment', 'A chua doc')`,
      a.id,
    );
    const notiB = await insertId(
      `INSERT INTO notifications (user_id, type, message) VALUES (?, 'comment', 'B chua doc')`,
      b.id,
    );
    dangNhap({ id: a.id, passwordHash: a.pwHash });
    const { POST } = await import("@/app/api/notifications/route");
    const res = await POST(
      new Request("http://localhost/api/notifications", {
        method: "POST",
        body: JSON.stringify({ markAllRead: true }),
      }),
    );
    assert.equal(res.status, 200);
    const rowA = await queryOne<{ isRead: number }>(
      `SELECT is_read AS "isRead" FROM notifications WHERE id = ?`,
      notiA,
    );
    const rowB = await queryOne<{ isRead: number }>(
      `SELECT is_read AS "isRead" FROM notifications WHERE id = ?`,
      notiB,
    );
    assert.equal(Number(rowA?.isRead), 1);
    assert.equal(Number(rowB?.isRead), 0, "không được đánh dấu đã đọc thông báo của người khác");
  },
);
