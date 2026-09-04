import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm BOQ & VẬT TƯ (khuôn theo tests/route-baselines.test.ts).
// Đây là hai cụm route chạm tới bất biến tiền/khối lượng nhạy cảm nhất trong hệ:
//   - BOQCODE duy nhất xuyên 4 bảng (tasks/work_packages/materials/boq_items), qua boqTakenBy()
//     + trigger boq_codes_sync (lưới an toàn cuối cùng, xem migrations/0029_boq_codes.sql).
//   - Σ tỷ trọng map task↔BOQ > 1 là lỗi tiền thật (thanh toán vượt khối lượng hợp đồng) — phải
//     bị CHẶN, không chỉ cảnh báo.
//   - /api/boq/coverage mở cho MỌI vai trò xem BOQ nên tuyệt đối không được rò số tiền.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

type Ctx = {
  userId: number;
  pwHash: string;
  projectId: number;
  towerId: number;
  sheetTypeId: number;
  packageId: number;
  taskId: number;
};

/** Dựng đủ 1 dự án + tháp + sheet + nhóm + task + user với vai trò cho trước. */
async function dungDuLieu(role: string, ten: string): Promise<Ctx> {
  const { insertId, queryOne } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `BV route ${ten}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp BV')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet BV')`,
    towerId,
    `BVR${ten}`,
  );
  const packageId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'B1', 'Nhóm BV')`,
    sheetTypeId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'B1,01', 'Task BV', 0.5)`,
    packageId,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-bv-route', ?, 1)`,
    `BV ${ten}`,
    `bv-${ten}-${RUN}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  return { userId, pwHash: u!.password_hash, projectId, towerId, sheetTypeId, packageId, taskId };
}

/** Tạo thêm 1 task khác trong CÙNG dự án (dùng cho case map nhiều task). */
async function taoTaskThem(packageId: number, code: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, 'Task phụ BV', 0.2)`,
    packageId,
    code,
  );
}

const req = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ---------------------------------------------------------------------------
// GET /api/boq
// ---------------------------------------------------------------------------

test("GET /api/boq: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/boq/route");
  const res = await GET(req("http://localhost/api/boq", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/boq: chỉ thấy dòng BOQ của đúng dự án đang chọn — cách ly dự án", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("pm", `boqA${RUN}`);
  const b = await dungDuLieu("pm", `boqB${RUN}`);
  await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Ống thép A', 'm', 100, 50000, ?)`,
    `BOQA-${RUN}`,
    a.projectId,
  );
  await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Ống thép B', 'm', 100, 50000, ?)`,
    `BOQB-${RUN}`,
    b.projectId,
  );

  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { GET } = await import("@/app/api/boq/route");
  const resA = await GET(req("http://localhost/api/boq", undefined, "GET"));
  assert.equal(resA.status, 200);
  const jsonA = await resA.json();
  assert.equal(jsonA.items.length, 1);
  assert.equal(jsonA.items[0].code, `BOQA-${RUN}`);

  // Dự án B không được thấy dòng của A — bất biến cách ly dự án chỉ kiểm được thật khi
  // route thực sự chạy dưới phiên B.
  dangNhap({ id: b.userId, passwordHash: b.pwHash }, b.projectId);
  const resB = await GET(req("http://localhost/api/boq", undefined, "GET"));
  const jsonB = await resB.json();
  assert.equal(jsonB.items.length, 1);
  assert.equal(jsonB.items[0].code, `BOQB-${RUN}`);
});

test(
  "GET /api/boq: lọc theo hệ (?system=) + tổng executedValue tính từ boq_task_map",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `sys${RUN}`);
    const systemId = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'Hệ điện BV')`,
      `HDBV${RUN}`,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, project_id) VALUES (?, 'Cáp điện', 'm', ?, 200, 10000, ?)`,
      `BOQSYS-${RUN}`,
      systemId,
      ctx.projectId,
    );
    await run(
      `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
      boqId,
      ctx.taskId,
    );

    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { GET } = await import("@/app/api/boq/route");
    const res = await GET(req(`http://localhost/api/boq?system=HDBV${RUN}`, undefined, "GET"));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.items.length, 1);
    // task tiến độ 0.5, weight 1 → executedQty = 200 * 0.5 = 100; executedValue = 100*10000.
    assert.equal(json.items[0].executedQty, 100);
    assert.equal(json.totals.executedValue, 1_000_000);
  },
);

// ---------------------------------------------------------------------------
// POST /api/boq
// ---------------------------------------------------------------------------

test("POST /api/boq: vai trò không phải Admin/PM → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `post403${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/boq/route");
  const res = await POST(
    req("http://localhost/api/boq", { code: `X-${RUN}`, name: "X", unit: "m" }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/boq: thiếu mã/tên/đơn vị → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `post422${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/boq/route");
  const res = await POST(req("http://localhost/api/boq", { code: "", name: "", unit: "" }));
  assert.equal(res.status, 422);
});

test("POST /api/boq: hệ (systemId) không tồn tại → 422", S, async () => {
  const ctx = await dungDuLieu("pm", `postsys${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/boq/route");
  const res = await POST(
    req("http://localhost/api/boq", {
      code: `SYSBAD-${RUN}`,
      name: "X",
      unit: "m",
      systemId: 999999,
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/boq: trùng BOQCODE với TASK đã có → 409, không tạo dòng BOQ", S, async () => {
  // Bất biến cốt lõi: BOQCODE duy nhất XUYÊN 4 bảng (boqTakenBy), không chỉ trong nội bộ
  // boq_items — đây là hàng rào chống đặt hàng/nghiệm thu nhầm mã.
  const { run } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `trung${RUN}`);
  const maTrung = `TRUNGTASK-${RUN}`;
  await run(`UPDATE tasks SET boq_code = ? WHERE id = ?`, maTrung, ctx.taskId);

  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/boq/route");
  const res = await POST(req("http://localhost/api/boq", { code: maTrung, name: "X", unit: "m" }));
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /task/);
});

test("POST /api/boq: PM tạo dòng BOQ hợp lệ → 201", S, async () => {
  const ctx = await dungDuLieu("pm", `posok${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/boq/route");
  const res = await POST(
    req("http://localhost/api/boq", {
      code: `OK-${RUN}`,
      name: "Ống nhựa PVC",
      unit: "m",
      qtyContract: 500,
      unitPrice: 12000,
      note: "ghi chú",
      sortOrder: 3,
    }),
  );
  assert.equal(res.status, 201);
  assert.ok((await res.json()).id > 0);
});

test(
  "GET /api/boq: chưa có dự án nào (projectId null) → trả rỗng, không lỗi (điều kiện FALSE)",
  S,
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `getnodu${RUN}`);
    const nguoiKhac = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('BV khac3', ?, 'hash-test-bv-route', 'pm', 1)`,
      `bv-khac3-${RUN}@test.local`,
    );
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
      dangNhap({ id: ctx.userId, passwordHash: u!.password_hash }, null);
      const { GET } = await import("@/app/api/boq/route");
      const res = await GET(req("http://localhost/api/boq", undefined, "GET"));
      assert.equal(res.status, 200);
      assert.deepEqual((await res.json()).items, []);
    } finally {
      await run(`DELETE FROM user_projects WHERE user_id = ?`, nguoiKhac);
    }
  },
);

test(
  "POST /api/boq: đụng ràng buộc UNIQUE lower(code) dù boqTakenBy không thấy trùng (race an toàn) → 409",
  S,
  async () => {
    // boqTakenBy so khớp CHÍNH XÁC (phân biệt hoa/thường) nên không thấy trùng giữa "CASE-x"
    // và "case-x" — nhưng index `uniq_boq_items_code_lower` ở tầng DB vẫn chặn, đúng vai trò
    // lưới an toàn cuối cùng khi có race giữa 2 request đồng thời.
    const ctx = await dungDuLieu("pm", `caserace${RUN}`);
    const ma = `CASE-${RUN}`;
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST } = await import("@/app/api/boq/route");
    const r1 = await POST(req("http://localhost/api/boq", { code: ma, name: "X", unit: "m" }));
    assert.equal(r1.status, 201);
    const r2 = await POST(
      req("http://localhost/api/boq", { code: ma.toLowerCase(), name: "Y", unit: "m" }),
    );
    assert.equal(r2.status, 409);
  },
);

test("POST /api/boq: chưa có dự án nào để chọn → 422 (user không thấy dự án)", S, async () => {
  const { insertId, queryOne, run } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `khongco${RUN}`);
  const nguoiKhac = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('BV khac', ?, 'hash-test-bv-route', 'pm', 1)`,
    `bv-khac-${RUN}@test.local`,
  );
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
    dangNhap({ id: ctx.userId, passwordHash: u!.password_hash }, null);
    const { POST } = await import("@/app/api/boq/route");
    const res = await POST(
      req("http://localhost/api/boq", { code: `NODU-${RUN}`, name: "X", unit: "m" }),
    );
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, nguoiKhac);
  }
});

// ---------------------------------------------------------------------------
// PATCH /DELETE /api/boq/:id
// ---------------------------------------------------------------------------

test("PATCH /api/boq/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/boq/[id]/route");
  const res = await PATCH(req("http://localhost/api/boq/1", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/boq/:id: vai trò không phải Admin/PM → 403", S, async () => {
  const ctx = await dungDuLieu("subcon", `pat403${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/boq/[id]/route");
  const res = await PATCH(req("http://localhost/api/boq/1", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/boq/:id: id không phải số → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `patnan${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/boq/[id]/route");
  const res = await PATCH(req("http://localhost/api/boq/abc", { name: "x" }), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/boq/:id: dòng BOQ của dự án KHÁC → 404 (cách ly dự án khi sửa)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("pm", `patisoA${RUN}`);
  const b = await dungDuLieu("pm", `patisoB${RUN}`);
  const boqIdB = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'Của B', 'm', 10, 1000, ?)`,
    `ISOB-${RUN}`,
    b.projectId,
  );
  // A cố sửa dòng BOQ của B.
  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { PATCH } = await import("@/app/api/boq/[id]/route");
  const res = await PATCH(req(`http://localhost/api/boq/${boqIdB}`, { name: "Hack" }), {
    params: Promise.resolve({ id: String(boqIdB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/boq/:id: đổi code trùng với dòng BOQ khác → 409", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `patdup${RUN}`);
  const other = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'A', 'm', 10, 1000, ?)`,
    `DUPA-${RUN}`,
    ctx.projectId,
  );
  const target = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'B', 'm', 10, 1000, ?)`,
    `DUPB-${RUN}`,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/boq/[id]/route");
  const res = await PATCH(req(`http://localhost/api/boq/${target}`, { code: `DUPA-${RUN}` }), {
    params: Promise.resolve({ id: String(target) }),
  });
  assert.equal(res.status, 409);
  void other;
});

test("PATCH /api/boq/:id: code rỗng / hệ không hợp lệ / số âm → 422", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `pat422${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'C', 'm', 10, 1000, ?)`,
    `V422-${RUN}`,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/boq/[id]/route");

  assert.equal(
    (
      await PATCH(req(`http://localhost/api/boq/${boqId}`, { code: "  " }), {
        params: Promise.resolve({ id: String(boqId) }),
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await PATCH(req(`http://localhost/api/boq/${boqId}`, { name: "  " }), {
        params: Promise.resolve({ id: String(boqId) }),
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await PATCH(req(`http://localhost/api/boq/${boqId}`, { unit: "  " }), {
        params: Promise.resolve({ id: String(boqId) }),
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await PATCH(req(`http://localhost/api/boq/${boqId}`, { systemId: 999999 }), {
        params: Promise.resolve({ id: String(boqId) }),
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await PATCH(req(`http://localhost/api/boq/${boqId}`, { qtyContract: -5 }), {
        params: Promise.resolve({ id: String(boqId) }),
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await PATCH(req(`http://localhost/api/boq/${boqId}`, { sortOrder: 1.5 }), {
        params: Promise.resolve({ id: String(boqId) }),
      })
    ).status,
    422,
  );
});

test(
  "PATCH /api/boq/:id: cập nhật hợp lệ (systemId null, note, không trường nào) → 200",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `patok${RUN}`);
    const systemId = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'Hệ patok')`,
      `SPATOK${RUN}`,
    );
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'D', 'm', 10, 1000, ?)`,
      `OKPAT-${RUN}`,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/boq/[id]/route");
    // Trước tiên gán một hệ HỢP LỆ + đổi khối lượng/đơn giá — bao phủ nhánh systemId số hợp
    // lệ và nhánh qty/unitPrice >= 0 hợp lệ (không chỉ nhánh lỗi âm ở ca khác).
    const res0 = await PATCH(
      req(`http://localhost/api/boq/${boqId}`, {
        systemId,
        qtyContract: 20,
        unitPrice: 2000,
      }),
      { params: Promise.resolve({ id: String(boqId) }) },
    );
    assert.equal(res0.status, 200);
    const res1 = await PATCH(
      req(`http://localhost/api/boq/${boqId}`, {
        systemId: null,
        note: "ghi chú mới",
        qtySub: 2,
        subUnitPrice: 500,
      }),
      { params: Promise.resolve({ id: String(boqId) }) },
    );
    assert.equal(res1.status, 200);
    // Không có trường nào trong body → nhánh sớm trả ok mà không UPDATE.
    const res2 = await PATCH(req(`http://localhost/api/boq/${boqId}`, {}), {
      params: Promise.resolve({ id: String(boqId) }),
    });
    assert.equal(res2.status, 200);
  },
);

test("DELETE /api/boq/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/boq/[id]/route");
  const res = await DELETE(req("http://localhost/api/boq/1", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/boq/:id: vai trò không phải Admin/PM → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `del403${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/boq/[id]/route");
  const res = await DELETE(req("http://localhost/api/boq/1", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/boq/:id: id không phải số → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `delnan${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/boq/[id]/route");
  const res = await DELETE(req("http://localhost/api/boq/abc", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/boq/:id: không tìm thấy (đã xoá/dự án khác) → 404", S, async () => {
  const ctx = await dungDuLieu("pm", `del404${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/boq/[id]/route");
  const res = await DELETE(req("http://localhost/api/boq/999999999", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/boq/:id: xoá thành công (cascade map) → 200", S, async () => {
  const { insertId, run, queryOne } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `delok${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'E', 'm', 10, 1000, ?)`,
    `DELOK-${RUN}`,
    ctx.projectId,
  );
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    boqId,
    ctx.taskId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/boq/[id]/route");
  const res = await DELETE(req(`http://localhost/api/boq/${boqId}`, undefined, "DELETE"), {
    params: Promise.resolve({ id: String(boqId) }),
  });
  assert.equal(res.status, 200);
  const map = await queryOne(`SELECT 1 FROM boq_task_map WHERE boq_item_id = ?`, boqId);
  assert.equal(map, undefined, "cascade phải xoá luôn map task đi kèm");
});

// ---------------------------------------------------------------------------
// PUT /api/boq/:id/map — bất biến Σ tỷ trọng
// ---------------------------------------------------------------------------

test("PUT /api/boq/:id/map: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/boq/[id]/map/route");
  const res = await PUT(req("http://localhost/api/boq/1/map", { map: [] }, "PUT"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PUT /api/boq/:id/map: vai trò không phải Admin/PM → 403", S, async () => {
  const ctx = await dungDuLieu("engineer", `map403${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PUT } = await import("@/app/api/boq/[id]/map/route");
  const res = await PUT(req("http://localhost/api/boq/1/map", { map: [] }, "PUT"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PUT /api/boq/:id/map: id không phải số → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `mapnan${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PUT } = await import("@/app/api/boq/[id]/map/route");
  const res = await PUT(req("http://localhost/api/boq/abc/map", { map: [] }, "PUT"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PUT /api/boq/:id/map: dòng BOQ của dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("pm", `mapisoA${RUN}`);
  const b = await dungDuLieu("pm", `mapisoB${RUN}`);
  const boqIdB = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'B', 'm', 10, 1000, ?)`,
    `MAPISOB-${RUN}`,
    b.projectId,
  );
  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { PUT } = await import("@/app/api/boq/[id]/map/route");
  const res = await PUT(
    req(
      `http://localhost/api/boq/${boqIdB}/map`,
      { map: [{ taskId: a.taskId, weight: 1 }] },
      "PUT",
    ),
    { params: Promise.resolve({ id: String(boqIdB) }) },
  );
  assert.equal(res.status, 404);
});

test("PUT /api/boq/:id/map: taskId không hợp lệ / weight ≤ 0 → 422", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `mapval${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'F', 'm', 10, 1000, ?)`,
    `MAPVAL-${RUN}`,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PUT } = await import("@/app/api/boq/[id]/map/route");

  const res1 = await PUT(
    req(`http://localhost/api/boq/${boqId}/map`, { map: [{ taskId: -1, weight: 1 }] }, "PUT"),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(res1.status, 422);

  const res2 = await PUT(
    req(
      `http://localhost/api/boq/${boqId}/map`,
      { map: [{ taskId: ctx.taskId, weight: 0 }] },
      "PUT",
    ),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(res2.status, 422);

  const res3 = await PUT(
    req(
      `http://localhost/api/boq/${boqId}/map`,
      {
        map: [
          { taskId: ctx.taskId, weight: 0.5 },
          { taskId: ctx.taskId, weight: 0.5 },
        ],
      },
      "PUT",
    ),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(res3.status, 422, "task lặp trong map phải bị chặn");
});

test("PUT /api/boq/:id/map: task không tồn tại → 422", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `mapmiss${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'G', 'm', 10, 1000, ?)`,
    `MAPMISS-${RUN}`,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PUT } = await import("@/app/api/boq/[id]/map/route");
  const res = await PUT(
    req(
      `http://localhost/api/boq/${boqId}/map`,
      { map: [{ taskId: 999999999, weight: 1 }] },
      "PUT",
    ),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /không tồn tại/);
});

test(
  "PUT /api/boq/:id/map: Σ tỷ trọng > 1 → 422, KHÔNG ghi map (chặn thanh toán vượt KL)",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `mapover${RUN}`);
    const task2 = await taoTaskThem(ctx.packageId, `B1,02-${RUN}`);
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'H', 'm', 10, 1000, ?)`,
      `MAPOVER-${RUN}`,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PUT } = await import("@/app/api/boq/[id]/map/route");
    const res = await PUT(
      req(
        `http://localhost/api/boq/${boqId}/map`,
        {
          map: [
            { taskId: ctx.taskId, weight: 0.7 },
            { taskId: task2, weight: 0.5 },
          ],
        },
        "PUT",
      ),
      { params: Promise.resolve({ id: String(boqId) }) },
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /vượt 1/);
    const rows = await queryOne(`SELECT 1 FROM boq_task_map WHERE boq_item_id = ?`, boqId);
    assert.equal(rows, undefined, "map sai KHÔNG được ghi vào DB dù chỉ 1 phần");
  },
);

test(
  "PUT /api/boq/:id/map: Σ tỷ trọng < 1 → 200 kèm warning, KHÔNG chặn (đang map dở)",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `mapwarn${RUN}`);
    const boqId = await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'I', 'm', 10, 1000, ?)`,
      `MAPWARN-${RUN}`,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PUT } = await import("@/app/api/boq/[id]/map/route");
    const res = await PUT(
      req(
        `http://localhost/api/boq/${boqId}/map`,
        { map: [{ taskId: ctx.taskId, weight: 0.3 }] },
        "PUT",
      ),
      { params: Promise.resolve({ id: String(boqId) }) },
    );
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.warning, "phải trả warning khi Σ < 1");
  },
);

test("PUT /api/boq/:id/map: Σ tỷ trọng = 1 → 200, không warning, ghi đè map cũ", S, async () => {
  const { insertId, query } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `mapexact${RUN}`);
  const task2 = await taoTaskThem(ctx.packageId, `B1,03-${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'J', 'm', 10, 1000, ?)`,
    `MAPEXACT-${RUN}`,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PUT } = await import("@/app/api/boq/[id]/map/route");

  const res1 = await PUT(
    req(
      `http://localhost/api/boq/${boqId}/map`,
      { map: [{ taskId: ctx.taskId, weight: 1 }] },
      "PUT",
    ),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(res1.status, 200);
  assert.equal((await res1.json()).warning, null);

  // Gọi lại lần 2 với map khác → PHẢI ghi đè hoàn toàn (không cộng dồn).
  const res2 = await PUT(
    req(
      `http://localhost/api/boq/${boqId}/map`,
      {
        map: [
          { taskId: ctx.taskId, weight: 0.6 },
          { taskId: task2, weight: 0.4 },
        ],
      },
      "PUT",
    ),
    { params: Promise.resolve({ id: String(boqId) }) },
  );
  assert.equal(res2.status, 200);
  const rows = await query(`SELECT task_id FROM boq_task_map WHERE boq_item_id = ?`, boqId);
  assert.equal(rows.length, 2, "map lần 2 phải thay hoàn toàn map lần 1, không cộng dồn");
});

// ---------------------------------------------------------------------------
// GET /api/boq/coverage
// ---------------------------------------------------------------------------

test("GET /api/boq/coverage: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/boq/coverage/route");
  const res = await GET(req("http://localhost/api/boq/coverage", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/boq/coverage: chỉ trả số đếm/tỷ lệ, TUYỆT ĐỐI không rò số tiền", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const ctx = await dungDuLieu("engineer", `cov${RUN}`);
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'K', 'm', 10, 999999999, ?)`,
    `COV-${RUN}`,
    ctx.projectId,
  );
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    boqId,
    ctx.taskId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { GET } = await import("@/app/api/boq/coverage/route");
  const res = await GET(req("http://localhost/api/boq/coverage", undefined, "GET"));
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.tong, 1);
  assert.equal(json.daMap, 1);
  assert.equal(json.tyLe, 1);
  // Toàn bộ payload không được chứa số tiền (đơn giá 999999999 dùng để bẫy).
  const raw = JSON.stringify(json);
  assert.ok(!raw.includes("999999999"), "coverage không được rò đơn giá/thành tiền");
  assert.ok(!("unitPrice" in json) && !("contractValue" in json));
});

test("GET /api/boq/coverage: cách ly dự án — dự án khác không cộng vào tổng", S, async () => {
  const a = await dungDuLieu("viewer", `covisoA${RUN}`);
  const b = await dungDuLieu("viewer", `covisoB${RUN}`);
  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { GET } = await import("@/app/api/boq/coverage/route");
  const resA = await GET(req("http://localhost/api/boq/coverage", undefined, "GET"));
  const jsonA = await resA.json();
  assert.equal(jsonA.tong, 1, "chỉ đếm 1 task của dự án A, không lẫn task của B");
  void b;
});

// ---------------------------------------------------------------------------
// GET/POST /api/materials
// ---------------------------------------------------------------------------

test("GET /api/materials: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/materials/route");
  const res = await GET(req("http://localhost/api/materials", undefined, "GET"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/materials: chưa chọn dự án nào (projectId null) → trả rỗng, không lỗi",
  S,
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `matnodu${RUN}`);
    const nguoiKhac = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('BV khac2', ?, 'hash-test-bv-route', 'pm', 1)`,
      `bv-khac2-${RUN}@test.local`,
    );
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
      dangNhap({ id: ctx.userId, passwordHash: u!.password_hash }, null);
      const { GET } = await import("@/app/api/materials/route");
      const res = await GET(req("http://localhost/api/materials", undefined, "GET"));
      assert.equal(res.status, 200);
      assert.deepEqual((await res.json()).materials, []);
    } finally {
      await run(`DELETE FROM user_projects WHERE user_id = ?`, nguoiKhac);
    }
  },
);

test("GET /api/materials: cách ly dự án + lọc theo sheetTypeId", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("pm", `matisoA${RUN}`);
  const b = await dungDuLieu("pm", `matisoB${RUN}`);
  await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'Vật tư A', 'kg', ?)`,
    a.sheetTypeId,
    a.projectId,
  );
  await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'Vật tư B', 'kg', ?)`,
    b.sheetTypeId,
    b.projectId,
  );
  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { GET } = await import("@/app/api/materials/route");
  const res = await GET(
    req(`http://localhost/api/materials?sheetTypeId=${a.sheetTypeId}`, undefined, "GET"),
  );
  const json = await res.json();
  assert.equal(json.materials.length, 1);
  assert.equal(json.materials[0].name, "Vật tư A");
});

test("GET /api/materials: lọc theo systemId và theo mã hệ (?system=)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `matsys${RUN}`);
  const systemId = await insertId(
    `INSERT INTO systems (code, name) VALUES (?, 'Hệ vật tư')`,
    `MATSYS${RUN}`,
  );
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, system_id, project_id) VALUES (?, 'Có hệ', 'kg', ?, ?)`,
    ctx.sheetTypeId,
    systemId,
    ctx.projectId,
  );
  await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'Không hệ', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { GET } = await import("@/app/api/materials/route");

  const byId = await GET(
    req(`http://localhost/api/materials?systemId=${systemId}`, undefined, "GET"),
  );
  const jsonById = await byId.json();
  assert.equal(jsonById.materials.length, 1);
  assert.equal(jsonById.materials[0].id, matId);

  const byCode = await GET(
    req(`http://localhost/api/materials?system=MATSYS${RUN}`, undefined, "GET"),
  );
  const jsonByCode = await byCode.json();
  assert.equal(jsonByCode.materials.length, 1);
  assert.equal(jsonByCode.materials[0].id, matId);
});

test("POST /api/materials: vai trò không được thêm (subcon/viewer) → 403", S, async () => {
  const ctx = await dungDuLieu("subcon", `matpost403${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/route");
  const res = await POST(
    req("http://localhost/api/materials", { name: "X", sheetTypeId: ctx.sheetTypeId }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/materials: thiếu tên hoặc sheet → 400", S, async () => {
  const ctx = await dungDuLieu("engineer", `matpost400${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/route");
  const r1 = await POST(
    req("http://localhost/api/materials", { name: "", sheetTypeId: ctx.sheetTypeId }),
  );
  assert.equal(r1.status, 400);
  const r2 = await POST(req("http://localhost/api/materials", { name: "X" }));
  assert.equal(r2.status, 400);
});

test("POST /api/materials: trùng BOQCODE với dòng BOQ đã có → 409", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("engineer", `matdup${RUN}`);
  const maTrung = `MATDUP-${RUN}`;
  await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, 'X', 'm', 1, 1, ?)`,
    maTrung,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/route");
  const res = await POST(
    req("http://localhost/api/materials", {
      name: "Vật tư trùng",
      sheetTypeId: ctx.sheetTypeId,
      boqCode: maTrung,
    }),
  );
  assert.equal(res.status, 409);
});

test("POST /api/materials: afterId hợp lệ → chèn đúng vị trí (dịch sort_order)", S, async () => {
  const { insertId, queryOne } = await import("@/lib/db");
  const ctx = await dungDuLieu("engineer", `matafter${RUN}`);
  const first = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, sort_order, project_id) VALUES (?, 'Đầu tiên', 'kg', 1, ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/route");
  const res = await POST(
    req("http://localhost/api/materials", {
      name: "Chèn sau",
      sheetTypeId: ctx.sheetTypeId,
      afterId: first,
    }),
  );
  assert.equal(res.status, 201);
  const inserted = await queryOne<{ sort_order: number }>(
    `SELECT sort_order FROM materials WHERE id = ?`,
    (await res.json()).id,
  );
  assert.equal(inserted!.sort_order, 2);
});

test("POST /api/materials: afterId không hợp lệ → 400", S, async () => {
  const ctx = await dungDuLieu("engineer", `matafterbad${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/route");
  const res = await POST(
    req("http://localhost/api/materials", {
      name: "X",
      sheetTypeId: ctx.sheetTypeId,
      afterId: 999999999,
    }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/materials: tạo hợp lệ không afterId → 201, sort_order cuối", S, async () => {
  const ctx = await dungDuLieu("admin", `matok${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/route");
  const res = await POST(
    req("http://localhost/api/materials", {
      name: "Vật tư mới",
      sheetTypeId: ctx.sheetTypeId,
      unit: "kg",
      qtyBoq: 100,
      qtyPlanned: 80,
      note: "ghi chú",
    }),
  );
  assert.equal(res.status, 201);
});

// ---------------------------------------------------------------------------
// PATCH/DELETE /api/materials/:id
// ---------------------------------------------------------------------------

test("PATCH /api/materials/:id: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(req("http://localhost/api/materials/1", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("PATCH /api/materials/:id: vai trò không được sửa → 403", S, async () => {
  const ctx = await dungDuLieu("subcon", `matpat403${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(req("http://localhost/api/materials/1", { name: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("PATCH /api/materials/:id: id không phải số → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `matpatnan${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(req("http://localhost/api/materials/abc", { name: "x" }), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/materials/:id: dự án khác → 404 (cách ly dự án)", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("pm", `matpatisoA${RUN}`);
  const b = await dungDuLieu("pm", `matpatisoB${RUN}`);
  const matIdB = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'B', 'kg', ?)`,
    b.sheetTypeId,
    b.projectId,
  );
  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(req(`http://localhost/api/materials/${matIdB}`, { name: "Hack" }), {
    params: Promise.resolve({ id: String(matIdB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/materials/:id: trạng thái không hợp lệ → 400", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `matstatus${RUN}`);
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/materials/${matId}`, { status: "khong_hop_le" }),
    { params: Promise.resolve({ id: String(matId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/materials/:id: đổi boqCode trùng → 409", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `matboqdup${RUN}`);
  const maTrung = `MATPATDUP-${RUN}`;
  await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, boq_code, project_id) VALUES (?, 'X', 'kg', ?, ?)`,
    ctx.sheetTypeId,
    maTrung,
    ctx.projectId,
  );
  const target = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'Y', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(req(`http://localhost/api/materials/${target}`, { boqCode: maTrung }), {
    params: Promise.resolve({ id: String(target) }),
  });
  assert.equal(res.status, 409);
});

test("PATCH /api/materials/:id: không có trường nào để cập nhật → 400", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `matempty${RUN}`);
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(req(`http://localhost/api/materials/${matId}`, {}), {
    params: Promise.resolve({ id: String(matId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/materials/:id: sửa qtyUsed trực tiếp phải ghi audit vào material_transactions",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `matqtyused${RUN}`);
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, qty_used, project_id) VALUES (?, 'A', 'kg', 10, ?)`,
      ctx.sheetTypeId,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/materials/[id]/route");
    const res = await PATCH(req(`http://localhost/api/materials/${matId}`, { qtyUsed: 25 }), {
      params: Promise.resolve({ id: String(matId) }),
    });
    assert.equal(res.status, 200);
    const tx = await queryOne<{ delta: number; note: string }>(
      `SELECT delta, note FROM material_transactions WHERE material_id = ? ORDER BY id DESC LIMIT 1`,
      matId,
    );
    assert.equal(tx!.delta, 15);
    assert.match(tx!.note, /Sửa trực tiếp/);
  },
);

test(
  "PATCH /api/materials/:id: sửa qtyStock trực tiếp phải ghi audit type=dieu_chinh_kho",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `matqtystock${RUN}`);
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, qty_stock, project_id) VALUES (?, 'A', 'kg', 5, ?)`,
      ctx.sheetTypeId,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/materials/[id]/route");
    const res = await PATCH(req(`http://localhost/api/materials/${matId}`, { qtyStock: 20 }), {
      params: Promise.resolve({ id: String(matId) }),
    });
    assert.equal(res.status, 200);
    const tx = await queryOne<{ delta: number; type: string }>(
      `SELECT delta, type FROM material_transactions WHERE material_id = ? ORDER BY id DESC LIMIT 1`,
      matId,
    );
    assert.equal(tx!.delta, 15);
    assert.equal(tx!.type, "dieu_chinh_kho");
  },
);

test(
  "PATCH /api/materials/:id: qtyUsed KHÔNG đổi (delta=0) → không ghi thêm giao dịch thừa",
  S,
  async () => {
    const { insertId, query } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `matqtysame${RUN}`);
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, qty_used, project_id) VALUES (?, 'A', 'kg', 10, ?)`,
      ctx.sheetTypeId,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/materials/[id]/route");
    const res = await PATCH(req(`http://localhost/api/materials/${matId}`, { qtyUsed: 10 }), {
      params: Promise.resolve({ id: String(matId) }),
    });
    assert.equal(res.status, 200);
    const txs = await query(`SELECT id FROM material_transactions WHERE material_id = ?`, matId);
    assert.equal(txs.length, 0, "delta 0 không được sinh giao dịch rỗng");
  },
);

test(
  "PATCH /api/materials/:id: trường tuỳ biến (custom) không hợp lệ → lỗi từ validateCustom",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const ctx = await dungDuLieu("pm", `matcustom${RUN}`);
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
      ctx.sheetTypeId,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { PATCH } = await import("@/app/api/materials/[id]/route");
    // Chưa định nghĩa trường tuỳ biến nào cho "material" trong dự án này → khoá lạ bị từ chối.
    const res = await PATCH(
      req(`http://localhost/api/materials/${matId}`, { custom: { khong_ton_tai: "x" } }),
      { params: Promise.resolve({ id: String(matId) }) },
    );
    assert.equal(res.status, 422);
  },
);

test("PATCH /api/materials/:id: cập nhật hợp lệ → 200, trả lại material", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `matpatok${RUN}`);
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { PATCH } = await import("@/app/api/materials/[id]/route");
  const res = await PATCH(
    req(`http://localhost/api/materials/${matId}`, { name: "Đổi tên", note: "ghi chú" }),
    { params: Promise.resolve({ id: String(matId) }) },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).material.name, "Đổi tên");
});

test("DELETE /api/materials/:id: chưa đăng nhập → 401", { ...S }, async () => {
  // Route này từng gộp `if (!user || user.role !== "admin") return 403`, khác quy ước chung
  // của dự án. Gộp như vậy khiến client không phân biệt được "phiên hết hạn, đăng nhập lại"
  // với "tài khoản không đủ quyền" — hai tình huống cần hai cách xử lý khác hẳn. Đã tách.
  dangXuat();
  const { DELETE } = await import("@/app/api/materials/[id]/route");
  const res = await DELETE(req("http://localhost/api/materials/1", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/materials/:id: không phải Admin → 403", S, async () => {
  const ctx = await dungDuLieu("pm", `matdel403${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/materials/[id]/route");
  const res = await DELETE(req("http://localhost/api/materials/1", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/materials/:id: id không phải số → 400", S, async () => {
  const ctx = await dungDuLieu("admin", `matdelnan${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/materials/[id]/route");
  const res = await DELETE(req("http://localhost/api/materials/abc", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/materials/:id: không tìm thấy (dự án khác) → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("admin", `matdeliso${RUN}`);
  const b = await dungDuLieu("pm", `matdelisob${RUN}`);
  const matIdB = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'B', 'kg', ?)`,
    b.sheetTypeId,
    b.projectId,
  );
  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { DELETE } = await import("@/app/api/materials/[id]/route");
  const res = await DELETE(req(`http://localhost/api/materials/${matIdB}`, undefined, "DELETE"), {
    params: Promise.resolve({ id: String(matIdB) }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/materials/:id: Admin xoá thành công → 200", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("admin", `matdelok${RUN}`);
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { DELETE } = await import("@/app/api/materials/[id]/route");
  const res = await DELETE(req(`http://localhost/api/materials/${matId}`, undefined, "DELETE"), {
    params: Promise.resolve({ id: String(matId) }),
  });
  assert.equal(res.status, 200);
});

// ---------------------------------------------------------------------------
// GET/POST /api/materials/:id/transactions
// ---------------------------------------------------------------------------

test("GET /api/materials/:id/transactions: chưa đăng nhập → 401", { ...S }, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/materials/[id]/transactions/route");
  const res = await GET(req("http://localhost/api/materials/1/transactions", undefined, "GET"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/materials/:id/transactions: id không phải số → 400", S, async () => {
  const ctx = await dungDuLieu("pm", `txnan${RUN}`);
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { GET } = await import("@/app/api/materials/[id]/transactions/route");
  const res = await GET(req("http://localhost/api/materials/abc/transactions", undefined, "GET"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test(
  "GET /api/materials/:id/transactions: vật tư của dự án khác → 404 (cách ly dự án)",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const a = await dungDuLieu("pm", `txisoA${RUN}`);
    const b = await dungDuLieu("pm", `txisoB${RUN}`);
    const matIdB = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'B', 'kg', ?)`,
      b.sheetTypeId,
      b.projectId,
    );
    dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
    const { GET } = await import("@/app/api/materials/[id]/transactions/route");
    const res = await GET(
      req(`http://localhost/api/materials/${matIdB}/transactions`, undefined, "GET"),
      { params: Promise.resolve({ id: String(matIdB) }) },
    );
    assert.equal(res.status, 404);
  },
);

test("GET /api/materials/:id/transactions: liệt kê đúng lịch sử, mới nhất trước", S, async () => {
  const { insertId, run } = await import("@/lib/db");
  const ctx = await dungDuLieu("pm", `txlist${RUN}`);
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  await run(
    `INSERT INTO material_transactions (material_id, delta, qty_after, note, created_by) VALUES (?, 5, 5, 'lần 1', ?)`,
    matId,
    ctx.userId,
  );
  await run(
    `INSERT INTO material_transactions (material_id, delta, qty_after, note, created_by) VALUES (?, 3, 8, 'lần 2', ?)`,
    matId,
    ctx.userId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { GET } = await import("@/app/api/materials/[id]/transactions/route");
  const res = await GET(
    req(`http://localhost/api/materials/${matId}/transactions`, undefined, "GET"),
    { params: Promise.resolve({ id: String(matId) }) },
  );
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.transactions.length, 2);
  assert.equal(json.transactions[0].note, "lần 2", "mới nhất phải đứng đầu");
});

test("POST /api/materials/:id/transactions: vai trò không được ghi → 403", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("subcon", `txpost403${RUN}`);
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/[id]/transactions/route");
  const res = await POST(
    req(`http://localhost/api/materials/${matId}/transactions`, { delta: 5 }, "POST"),
    { params: Promise.resolve({ id: String(matId) }) },
  );
  assert.equal(res.status, 403);
});

test("POST /api/materials/:id/transactions: delta = 0 hoặc không phải số → 400", S, async () => {
  const { insertId } = await import("@/lib/db");
  const ctx = await dungDuLieu("engineer", `txpost400${RUN}`);
  const matId = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'A', 'kg', ?)`,
    ctx.sheetTypeId,
    ctx.projectId,
  );
  dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
  const { POST } = await import("@/app/api/materials/[id]/transactions/route");
  const r1 = await POST(
    req(`http://localhost/api/materials/${matId}/transactions`, { delta: 0 }, "POST"),
    { params: Promise.resolve({ id: String(matId) }) },
  );
  assert.equal(r1.status, 400);
  const r2 = await POST(
    req(`http://localhost/api/materials/${matId}/transactions`, { delta: "abc" }, "POST"),
    { params: Promise.resolve({ id: String(matId) }) },
  );
  assert.equal(r2.status, 400);
});

test("POST /api/materials/:id/transactions: vật tư dự án khác → 404", S, async () => {
  const { insertId } = await import("@/lib/db");
  const a = await dungDuLieu("pm", `txpostisoA${RUN}`);
  const b = await dungDuLieu("pm", `txpostisoB${RUN}`);
  const matIdB = await insertId(
    `INSERT INTO materials (sheet_type_id, name, unit, project_id) VALUES (?, 'B', 'kg', ?)`,
    b.sheetTypeId,
    b.projectId,
  );
  dangNhap({ id: a.userId, passwordHash: a.pwHash }, a.projectId);
  const { POST } = await import("@/app/api/materials/[id]/transactions/route");
  const res = await POST(
    req(`http://localhost/api/materials/${matIdB}/transactions`, { delta: 5 }, "POST"),
    { params: Promise.resolve({ id: String(matIdB) }) },
  );
  assert.equal(res.status, 404);
});

test(
  "POST /api/materials/:id/transactions: ghi nhập kho, tăng qty_used đúng delta",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const ctx = await dungDuLieu("engineer", `txpostok${RUN}`);
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, qty_used, project_id) VALUES (?, 'A', 'kg', 10, ?)`,
      ctx.sheetTypeId,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST } = await import("@/app/api/materials/[id]/transactions/route");
    const res = await POST(
      req(
        `http://localhost/api/materials/${matId}/transactions`,
        { delta: 7, note: "nhập thêm", floorLabel: "Tầng 5", crew: "Tổ điện" },
        "POST",
      ),
      { params: Promise.resolve({ id: String(matId) }) },
    );
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.delta, 7);
    assert.equal(json.qtyAfter, 17);
    const m = await queryOne<{ qty_used: number }>(
      `SELECT qty_used FROM materials WHERE id = ?`,
      matId,
    );
    assert.equal(m!.qty_used, 17);
  },
);

test(
  "POST /api/materials/:id/transactions: delta âm vượt tồn thì bị GHÌM về 0, audit ghi actualDelta thật",
  S,
  async () => {
    // Bất biến: GREATEST(0, qty_used + delta) không cho qty_used âm — nhưng audit phải ghi
    // đúng số THỰC SỰ đã trừ (actualDelta), không phải delta client gửi lên, để không sai lệch
    // lịch sử truy vết.
    const { insertId, queryOne } = await import("@/lib/db");
    const ctx = await dungDuLieu("engineer", `txclip${RUN}`);
    const matId = await insertId(
      `INSERT INTO materials (sheet_type_id, name, unit, qty_used, project_id) VALUES (?, 'A', 'kg', 5, ?)`,
      ctx.sheetTypeId,
      ctx.projectId,
    );
    dangNhap({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const { POST } = await import("@/app/api/materials/[id]/transactions/route");
    const res = await POST(
      req(`http://localhost/api/materials/${matId}/transactions`, { delta: -20 }, "POST"),
      { params: Promise.resolve({ id: String(matId) }) },
    );
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.qtyAfter, 0);
    assert.equal(json.delta, -5, "actualDelta phải là -5 (đã ghìm), không phải -20 client gửi");
  },
);
