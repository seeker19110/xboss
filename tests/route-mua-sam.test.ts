import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm MUA SẮM & NHÀ CUNG CẤP — cùng khuôn với
// tests/route-tai-chinh.test.ts. Route:
//   - app/api/purchase-orders/route.ts               (GET/POST đơn hàng)
//   - app/api/purchase-orders/[id]/route.ts           (GET/PATCH/DELETE 1 đơn hàng)
//   - app/api/purchase-orders/[id]/receive/route.ts   (POST nhập kho — idempotency)
//   - app/api/suppliers/route.ts                      (GET/POST nhà cung cấp)
//   - app/api/suppliers/[id]/route.ts                 (PATCH/DELETE 1 nhà cung cấp)
//   - app/api/tenders/route.ts                        (GET/POST gói thầu)
//   - app/api/tenders/[id]/route.ts                   (GET/PATCH 1 gói thầu)

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `MS route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `ms-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-ms-route', ?, ?)`,
    `MS ${ten}`,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash, orgId };
}

async function taoOrg(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO organizations (name, slug) VALUES (?, ?)`,
    `Org ${uniq(ten)}`,
    `org-${uniq(ten)}`,
  );
}

async function taoVatTu(
  ten: string,
  overrides: { projectId?: number | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO materials (name, unit, boq_code, project_id) VALUES (?, 'cái', ?, ?)`,
    `Vật tư ${uniq(ten)}`,
    `VT-${uniq(ten)}`,
    overrides.projectId ?? null,
  );
}

async function taoNCC(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO suppliers (name, org_id) VALUES (?, ?)`, `NCC ${uniq(ten)}`, orgId);
}

// projectId: BẮT BUỘC (Đợt 6, Việc G — POST /api/tenders giờ lọc boq_items.project_id, vá lỗ
// hổng "kiểm tồn tại không lọc dự án"). Dòng BOQ project_id NULL không khớp bất kỳ dự án nào.
async function taoBoqItem(ten: string, projectId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id) VALUES (?, ?, 'm', 100, 1000, ?)`,
    `BOQ-${uniq(ten)}`,
    `Dòng BOQ ${ten}`,
    projectId,
  );
}

/** Tạo đơn hàng qua route POST thật (không tự chèn SQL) — dùng cho các test tiếp theo cần
 *  sẵn 1 PO. Trả về id + poCode. */
async function taoPO(
  pm: { id: number; passwordHash: string },
  projectId: number,
  materialId: number,
  overrides: { qtyOrdered?: number; unitPrice?: number; supplierId?: number } = {},
): Promise<{ id: number; poCode: string }> {
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-orders/route");
  const res = await POST(
    jreq("/api/purchase-orders", {
      supplierId: overrides.supplierId,
      items: [
        {
          materialId,
          qtyOrdered: overrides.qtyOrdered ?? 10,
          unitPrice: overrides.unitPrice ?? 100000,
        },
      ],
    }),
  );
  const json = await res.json();
  assert.equal(res.status, 201, `taoPO thất bại: ${JSON.stringify(json)}`);
  return json;
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });

// ============================================================================
// GET/POST /api/purchase-orders
// ============================================================================

test("GET /api/purchase-orders: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/purchase-orders/route");
  const res = await GET(jreq("/api/purchase-orders", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/purchase-orders: subcon không có quyền xem → 403", S, async () => {
  // canView chỉ admin/pm/engineer — subcon không cần thấy PO nội bộ.
  const projectId = await taoDuAn("gpo403");
  const sub = await taoUser("subcon", "gpo403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/purchase-orders/route");
  const res = await GET(jreq("/api/purchase-orders", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/purchase-orders: cách ly dự án — không thấy PO của dự án khác", S, async () => {
  const projectA = await taoDuAn("gpoisoA");
  const projectB = await taoDuAn("gpoisoB");
  const pmA = await taoUser("pm", "gpoisoA");
  const pmB = await taoUser("pm", "gpoisoB");
  const matB = await taoVatTu("gpoisoB", { projectId: projectB });
  await taoPO(pmB, projectB, matB);

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/purchase-orders/route");
  const res = await GET(jreq("/api/purchase-orders", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).orders, []);
});

test("POST /api/purchase-orders: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/purchase-orders/route");
  const res = await POST(jreq("/api/purchase-orders", { items: [] }));
  assert.equal(res.status, 401);
});

test("POST /api/purchase-orders: engineer không được tạo đơn (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("ppo403");
  const eng = await taoUser("engineer", "ppo403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/purchase-orders/route");
  const res = await POST(jreq("/api/purchase-orders", { items: [] }));
  assert.equal(res.status, 403);
});

test("POST /api/purchase-orders: chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("ppnoproj");
  const pm = await taoUser("pm", "ppnoproj");
  const other = await taoUser("pm", "ppnoprojOther");
  // Gán dự án cho NGƯỜI KHÁC (bảng user_projects khác rỗng) → pm hiện tại không thấy
  // dự án nào (cùng kỹ thuật với route-tai-chinh.test.ts).
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/purchase-orders/route");
    const res = await POST(
      jreq("/api/purchase-orders", { items: [{ materialId: 1, qtyOrdered: 1 }] }),
    );
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/purchase-orders: đơn không có dòng nào → 400", S, async () => {
  const projectId = await taoDuAn("ppempty");
  const pm = await taoUser("pm", "ppempty");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-orders/route");
  const res = await POST(jreq("/api/purchase-orders", { items: [] }));
  assert.equal(res.status, 400);
});

test("POST /api/purchase-orders: ngày dự kiến sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("ppdate");
  const pm = await taoUser("pm", "ppdate");
  const matId = await taoVatTu("ppdate", { projectId });
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/purchase-orders/route");
  const res = await POST(
    jreq("/api/purchase-orders", {
      expectedDate: "01/09/2026",
      items: [{ materialId: matId, qtyOrdered: 1 }],
    }),
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/purchase-orders: đặt hàng theo yêu cầu mua (prId) → PR liên quan chuyển 'ordered'",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("ppr");
    const pm = await taoUser("pm", "ppr");
    const matId = await taoVatTu("ppr", { projectId });
    const prId = await insertId(
      `INSERT INTO purchase_requests (material_id, qty_requested, requested_by) VALUES (?, ?, ?)`,
      matId,
      10,
      pm.id,
    );
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/purchase-orders/route");
    const res = await POST(
      jreq("/api/purchase-orders", {
        items: [{ materialId: matId, prId, qtyOrdered: 10 }],
      }),
    );
    assert.equal(res.status, 201);
    const pr = await queryOne<{ status: string }>(
      `SELECT status FROM purchase_requests WHERE id = ?`,
      prId,
    );
    assert.equal(pr?.status, "ordered");
  },
);

test(
  "POST /api/purchase-orders: thành công → project_id do SERVER suy, mã PO-YYYYMM-NNN",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("ppok");
    const pm = await taoUser("pm", "ppok");
    const matId = await taoVatTu("ppok", { projectId });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/purchase-orders/route");
    const res = await POST(
      jreq("/api/purchase-orders", {
        items: [{ materialId: matId, qtyOrdered: 5, unitPrice: 1000 }],
      }),
    );
    assert.equal(res.status, 201);
    const { id, poCode } = await res.json();
    assert.match(poCode, /^PO-\d{6}-\d+$/);
    const row = await queryOne<{ project_id: number }>(
      `SELECT project_id FROM purchase_orders WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
  },
);

// ============================================================================
// GET/PATCH/DELETE /api/purchase-orders/[id]
// ============================================================================

test("GET /api/purchase-orders/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/purchase-orders/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/purchase-orders/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("gpobad");
  const pm = await taoUser("pm", "gpobad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/purchase-orders/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/purchase-orders/:id: PO thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("gpoisoA2");
  const projectB = await taoDuAn("gpoisoB2");
  const pmA = await taoUser("pm", "gpoisoA2");
  const pmB = await taoUser("pm", "gpoisoB2");
  const matB = await taoVatTu("gpoisoB2", { projectId: projectB });
  const { id: poId } = await taoPO(pmB, projectB, matB);

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/purchase-orders/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(poId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/purchase-orders/:id: engineer XEM được PO nhưng KHÔNG thấy đơn giá (stripSensitive)",
  S,
  async () => {
    const projectId = await taoDuAn("gpomask");
    const pm = await taoUser("pm", "gpomask");
    const eng = await taoUser("engineer", "gpomask");
    const matId = await taoVatTu("gpomask", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId, { unitPrice: 250000 });

    const { GET } = await import("@/app/api/purchase-orders/[id]/route");
    const asPm = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    const jsonPm = await asPm.json();
    assert.equal(Number(jsonPm.items[0].unitPrice), 250000);

    await dangNhapDuAn(eng, projectId);
    const asEng = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    assert.equal(asEng.status, 200);
    const jsonEng = await asEng.json();
    assert.equal(jsonEng.items[0].unitPrice, null);
    // Trường không nhạy cảm vẫn còn nguyên.
    assert.equal(Number(jsonEng.items[0].qtyOrdered), 10);
  },
);

test("PATCH /api/purchase-orders/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/purchase-orders/:id: engineer không được sửa (chỉ Admin/PM) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ppatch403");
    const eng = await taoUser("engineer", "ppatch403");
    await dangNhapDuAn(eng, projectId);
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
    assert.equal(res.status, 403);
  },
);

test(
  "PATCH /api/purchase-orders/:id: chuyển trạng thái nhảy cóc (draft → received) → 409",
  S,
  async () => {
    const projectId = await taoDuAn("pjump");
    const pm = await taoUser("pm", "pjump");
    const matId = await taoVatTu("pjump", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId);
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    const res = await PATCH(jreq("/x", { status: "received" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    assert.equal(res.status, 409);
  },
);

test(
  "PATCH /api/purchase-orders/:id: status không nằm trong danh mục hợp lệ → 400",
  S,
  async () => {
    const projectId = await taoDuAn("pbadenum");
    const pm = await taoUser("pm", "pbadenum");
    const matId = await taoVatTu("pbadenum", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId);
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    const res = await PATCH(jreq("/x", { status: "khong_ton_tai" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    assert.equal(res.status, 400);
  },
);

test("PATCH /api/purchase-orders/:id: không có trường cập nhật → 400", S, async () => {
  const projectId = await taoDuAn("pnofield");
  const pm = await taoUser("pm", "pnofield");
  const matId = await taoVatTu("pnofield", { projectId });
  const { id: poId } = await taoPO(pm, projectId, matId);
  const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: String(poId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/purchase-orders/:id: chuyển draft → confirmed hợp lệ, ghi lịch sử",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("pok");
    const pm = await taoUser("pm", "pok");
    const matId = await taoVatTu("pok", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId);
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    const res = await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    assert.equal(res.status, 200);
    const history = await query(
      `SELECT from_status, to_status FROM po_status_history WHERE po_id = ?`,
      poId,
    );
    assert.equal(history.length, 1);
  },
);

test("DELETE /api/purchase-orders/:id: chỉ Admin được xoá — PM bị 403", S, async () => {
  const projectId = await taoDuAn("pdel403");
  const pm = await taoUser("pm", "pdel403");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/purchase-orders/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test(
  "DELETE /api/purchase-orders/:id: đã nhập kho một phần → 409, không tạo tồn ảo",
  S,
  async () => {
    const projectId = await taoDuAn("pdelrecv");
    const pm = await taoUser("pm", "pdelrecv");
    const admin = await taoUser("admin", "pdelrecv");
    const matId = await taoVatTu("pdelrecv", { projectId });
    const { id: poId, poCode: _poCode } = await taoPO(pm, projectId, matId, { qtyOrdered: 10 });
    void _poCode;

    // Xác nhận rồi nhận 1 phần hàng qua route thật.
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    const { query: q } = await import("@/lib/db");
    const items = await q<{ id: number }>(`SELECT id FROM po_items WHERE po_id = ?`, poId);
    const { POST: receive } = await import("@/app/api/purchase-orders/[id]/receive/route");
    await receive(jreq("/x", { items: [{ poItemId: items[0].id, qtyReceived: 5 }] }, "POST"), {
      params: Promise.resolve({ id: String(poId) }),
    });

    await dangNhapDuAn(admin, projectId);
    const { DELETE } = await import("@/app/api/purchase-orders/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    assert.equal(res.status, 409);
  },
);

test("DELETE /api/purchase-orders/:id: chưa nhập kho → xoá thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("pdelok");
  const pm = await taoUser("pm", "pdelok");
  const admin = await taoUser("admin", "pdelok");
  const matId = await taoVatTu("pdelok", { projectId });
  const { id: poId } = await taoPO(pm, projectId, matId);
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/purchase-orders/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(poId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM purchase_orders WHERE id = ?`, poId);
  assert.equal(row, undefined);
});

// ============================================================================
// POST /api/purchase-orders/[id]/receive — idempotency + tiền tồn kho
// ============================================================================

test("POST /api/purchase-orders/:id/receive: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");
  const res = await POST(jreq("/x", { items: [] }, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/purchase-orders/:id/receive: subcon không có quyền nhập kho → 403", S, async () => {
  const projectId = await taoDuAn("recv403");
  const sub = await taoUser("subcon", "recv403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");
  const res = await POST(jreq("/x", { items: [] }, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/purchase-orders/:id/receive: PO còn ở draft (chưa xác nhận) → 409", S, async () => {
  const projectId = await taoDuAn("recvdraft");
  const pm = await taoUser("pm", "recvdraft");
  const matId = await taoVatTu("recvdraft", { projectId });
  const { id: poId } = await taoPO(pm, projectId, matId);
  const { query: q } = await import("@/lib/db");
  const items = await q<{ id: number }>(`SELECT id FROM po_items WHERE po_id = ?`, poId);
  const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");
  const res = await POST(
    jreq("/x", { items: [{ poItemId: items[0].id, qtyReceived: 1 }] }, "POST"),
    {
      params: Promise.resolve({ id: String(poId) }),
    },
  );
  assert.equal(res.status, 409);
});

test(
  "POST /api/purchase-orders/:id/receive: không có dòng nào có số lượng nhập → 400",
  S,
  async () => {
    const projectId = await taoDuAn("recvempty");
    const pm = await taoUser("pm", "recvempty");
    const matId = await taoVatTu("recvempty", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId);
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");
    const res = await POST(jreq("/x", { items: [{ poItemId: 1, qtyReceived: 0 }] }, "POST"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    assert.equal(res.status, 400);
  },
);

test(
  "POST /api/purchase-orders/:id/receive: nhập vượt số đặt cho 1 dòng → 409, KHÔNG cộng tồn kho (rollback)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("recvover");
    const pm = await taoUser("pm", "recvover");
    const matId = await taoVatTu("recvover", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId, { qtyOrdered: 5 });
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    const { query: q } = await import("@/lib/db");
    const items = await q<{ id: number }>(`SELECT id FROM po_items WHERE po_id = ?`, poId);
    const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");
    const res = await POST(
      jreq("/x", { items: [{ poItemId: items[0].id, qtyReceived: 100 }] }, "POST"),
      { params: Promise.resolve({ id: String(poId) }) },
    );
    assert.equal(res.status, 409);

    const mat = await queryOne<{ qty_stock: number }>(
      `SELECT qty_stock FROM materials WHERE id = ?`,
      matId,
    );
    // Transaction phải rollback toàn bộ — không được cộng dở tồn kho khi 1 dòng vượt.
    assert.equal(Number(mat?.qty_stock ?? 0), 0);
  },
);

test(
  "POST /api/purchase-orders/:id/receive: nhập đủ → cộng đúng qty_stock, PO chuyển 'received'",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("recvok");
    const pm = await taoUser("pm", "recvok");
    const matId = await taoVatTu("recvok", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId, { qtyOrdered: 8 });
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    const { query: q } = await import("@/lib/db");
    const items = await q<{ id: number }>(`SELECT id FROM po_items WHERE po_id = ?`, poId);
    const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");
    const res = await POST(
      jreq("/x", { items: [{ poItemId: items[0].id, qtyReceived: 8 }] }, "POST"),
      { params: Promise.resolve({ id: String(poId) }) },
    );
    assert.equal(res.status, 201);

    const mat = await queryOne<{ qty_stock: number }>(
      `SELECT qty_stock FROM materials WHERE id = ?`,
      matId,
    );
    assert.equal(Number(mat?.qty_stock), 8);
    const po = await queryOne<{ status: string }>(
      `SELECT status FROM purchase_orders WHERE id = ?`,
      poId,
    );
    assert.equal(po?.status, "received");
  },
);

test(
  "POST /api/purchase-orders/:id/receive: gửi lại CÙNG Idempotency-Key → không tạo phiếu trùng, không cộng tồn kho 2 lần",
  S,
  async () => {
    // Bất biến chống double-submit (M4): bấm nhanh 2 lần hoặc mất mạng công trường retry
    // với header Idempotency-Key giống nhau phải trả về ĐÚNG phiếu nhập đã tạo, không
    // tạo phiếu thứ 2 và không cộng tồn kho gấp đôi.
    const { query: q, queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("recvidem");
    const pm = await taoUser("pm", "recvidem");
    const matId = await taoVatTu("recvidem", { projectId });
    const { id: poId } = await taoPO(pm, projectId, matId, { qtyOrdered: 20 });
    const { PATCH } = await import("@/app/api/purchase-orders/[id]/route");
    await PATCH(jreq("/x", { status: "confirmed" }, "PATCH"), {
      params: Promise.resolve({ id: String(poId) }),
    });
    const items = await q<{ id: number }>(`SELECT id FROM po_items WHERE po_id = ?`, poId);
    const { POST } = await import("@/app/api/purchase-orders/[id]/receive/route");
    const key = `idem-${uniq("recvidem")}`;
    const body = { items: [{ poItemId: items[0].id, qtyReceived: 5 }] };

    const req1 = jreq("/x", body, "POST");
    req1.headers.set("Idempotency-Key", key);
    const res1 = await POST(req1, { params: Promise.resolve({ id: String(poId) }) });
    assert.equal(res1.status, 201);
    const j1 = await res1.json();

    const req2 = jreq("/x", body, "POST");
    req2.headers.set("Idempotency-Key", key);
    const res2 = await POST(req2, { params: Promise.resolve({ id: String(poId) }) });
    assert.equal(res2.status, 201);
    const j2 = await res2.json();
    assert.equal(j2.receiptId, j1.receiptId, "phải trả về đúng phiếu đã tạo, không tạo mới");

    const receipts = await q(`SELECT id FROM warehouse_receipts WHERE po_id = ?`, poId);
    assert.equal(receipts.length, 1, "chỉ đúng 1 phiếu nhập được tạo");

    const mat = await queryOne<{ qty_stock: number }>(
      `SELECT qty_stock FROM materials WHERE id = ?`,
      matId,
    );
    // Chỉ cộng 1 lần dù POST 2 lần cùng key — nếu route quên chặn sẽ ra 10 thay vì 5.
    assert.equal(Number(mat?.qty_stock), 5);
  },
);

// ============================================================================
// GET/POST /api/suppliers
// ============================================================================

test("GET /api/suppliers: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/suppliers/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test(
  "GET /api/suppliers: cách ly theo tổ chức (org) — không thấy NCC của org khác",
  S,
  async () => {
    const projectId = await taoDuAn("sisoA");
    const orgB = await taoOrg("sisoB");
    const pmA = await taoUser("pm", "sisoA", 1);
    await taoNCC("sisoB", orgB);
    await dangNhapDuAn(pmA, projectId);
    const { GET } = await import("@/app/api/suppliers/route");
    const res = await GET();
    assert.equal(res.status, 200);
    const { suppliers } = await res.json();
    assert.ok(
      !suppliers.some((s: { name: string }) => s.name.startsWith("NCC sisoB")),
      "không được lộ NCC của org khác",
    );
  },
);

test("POST /api/suppliers: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/suppliers/route");
  const res = await POST(jreq("/api/suppliers", { name: "x" }));
  assert.equal(res.status, 401);
});

test("POST /api/suppliers: engineer không được thêm NCC → 403", S, async () => {
  const projectId = await taoDuAn("sp403");
  const eng = await taoUser("engineer", "sp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/suppliers/route");
  const res = await POST(jreq("/api/suppliers", { name: "x" }));
  assert.equal(res.status, 403);
});

test("POST /api/suppliers: thiếu tên → 400", S, async () => {
  const projectId = await taoDuAn("spname");
  const pm = await taoUser("pm", "spname");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/suppliers/route");
  const res = await POST(jreq("/api/suppliers", {}));
  assert.equal(res.status, 400);
});

test(
  "POST /api/suppliers: thành công → gán org_id theo NGƯỜI TẠO, không phải mặc định 1",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("spok");
    const orgB = await taoOrg("spok");
    const pmB = await taoUser("pm", "spok", orgB);
    await dangNhapDuAn(pmB, projectId);
    const { POST } = await import("@/app/api/suppliers/route");
    const name = `NCC ${uniq("spokname")}`;
    const res = await POST(jreq("/api/suppliers", { name, phone: "0900000000" }));
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const row = await queryOne<{ org_id: number }>(`SELECT org_id FROM suppliers WHERE id = ?`, id);
    assert.equal(row?.org_id, orgB);
  },
);

// ============================================================================
// PATCH/DELETE /api/suppliers/[id]
// ============================================================================

test("PATCH /api/suppliers/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/suppliers/:id: engineer không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("spp403");
  const eng = await taoUser("engineer", "spp403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/suppliers/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("sppbad");
  const pm = await taoUser("pm", "sppbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/suppliers/:id: không tồn tại → 404", S, async () => {
  const projectId = await taoDuAn("spp404");
  const pm = await taoUser("pm", "spp404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", { name: "y" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/suppliers/:id: không có trường cập nhật → 400", S, async () => {
  const projectId = await taoDuAn("sppnofield");
  const pm = await taoUser("pm", "sppnofield");
  const ncc = await taoNCC("sppnofield");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: String(ncc) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/suppliers/:id: sửa thành công", S, async () => {
  const projectId = await taoDuAn("sppok");
  const pm = await taoUser("pm", "sppok");
  const ncc = await taoNCC("sppok");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/suppliers/[id]/route");
  const res = await PATCH(jreq("/x", { phone: "0912345678" }, "PATCH"), {
    params: Promise.resolve({ id: String(ncc) }),
  });
  assert.equal(res.status, 200);
  const { supplier } = await res.json();
  assert.equal(supplier.phone, "0912345678");
});

test("DELETE /api/suppliers/:id: chỉ Admin được xoá — PM bị 403", S, async () => {
  const projectId = await taoDuAn("spd403");
  const pm = await taoUser("pm", "spd403");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/suppliers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/suppliers/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("spdbad");
  const admin = await taoUser("admin", "spdbad");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/suppliers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/suppliers/:id: đang có đơn hàng gắn vào → 409, giữ dấu vết", S, async () => {
  const projectId = await taoDuAn("spdlinked");
  const pm = await taoUser("pm", "spdlinked");
  const admin = await taoUser("admin", "spdlinked");
  const ncc = await taoNCC("spdlinked");
  const matId = await taoVatTu("spdlinked", { projectId });
  await taoPO(pm, projectId, matId, { supplierId: ncc });

  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/suppliers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(ncc) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/suppliers/:id: không có đơn hàng nào → xoá thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("spdok");
  const admin = await taoUser("admin", "spdok");
  const ncc = await taoNCC("spdok");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/suppliers/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(ncc) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, ncc);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/tenders
// ============================================================================

test("GET /api/tenders: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tenders/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/tenders: subcon không có quyền xem đấu thầu → 403", S, async () => {
  const projectId = await taoDuAn("t403");
  const sub = await taoUser("subcon", "t403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/tenders/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/tenders: cách ly dự án — không thấy gói thầu của dự án khác", S, async () => {
  const projectA = await taoDuAn("tisoA");
  const projectB = await taoDuAn("tisoB");
  const pmA = await taoUser("pm", "tisoA");
  const pmB = await taoUser("pm", "tisoB");
  const boqB = await taoBoqItem("tisoB", projectB);
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/tenders/route");
  await POST(jreq("/api/tenders", { name: "Gói thầu B", items: [{ boqItemId: boqB, qty: 10 }] }));

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/tenders/route");
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).tenders, []);
});

test("POST /api/tenders: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/tenders/route");
  const res = await POST(jreq("/api/tenders", {}));
  assert.equal(res.status, 401);
});

test("POST /api/tenders: engineer XEM được nhưng KHÔNG được tạo gói thầu → 403", S, async () => {
  const projectId = await taoDuAn("tp403");
  const eng = await taoUser("engineer", "tp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/tenders/route");
  const res = await POST(jreq("/api/tenders", {}));
  assert.equal(res.status, 403);
});

test("POST /api/tenders: chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("tnoproj");
  const pm = await taoUser("pm", "tnoproj");
  const other = await taoUser("pm", "tnoprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/tenders/route");
    const res = await POST(jreq("/api/tenders", { name: "x", items: [{ boqItemId: 1, qty: 1 }] }));
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/tenders: body rỗng → 422", S, async () => {
  const projectId = await taoDuAn("tbody");
  const pm = await taoUser("pm", "tbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/route");
  const res = await POST(
    new NextRequest("http://localhost/api/tenders", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/tenders: thiếu dòng BOQ trong phạm vi mời thầu → 422 (validateTenderInput)",
  S,
  async () => {
    const projectId = await taoDuAn("tval");
    const pm = await taoUser("pm", "tval");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tenders/route");
    const res = await POST(jreq("/api/tenders", { name: "Thiếu dòng", items: [] }));
    assert.equal(res.status, 422);
  },
);

test("POST /api/tenders: dòng BOQ tham chiếu không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("tref");
  const pm = await taoUser("pm", "tref");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/route");
  const res = await POST(
    jreq("/api/tenders", { name: "Ref sai", items: [{ boqItemId: 999999999, qty: 1 }] }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /không tồn tại/);
});

test(
  "POST /api/tenders: thành công → project_id do SERVER suy, mã GT- sinh tự động, giữ nguyên khối lượng mời",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("tok");
    const pm = await taoUser("pm", "tok");
    const boqId = await taoBoqItem("tok", projectId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tenders/route");
    const res = await POST(
      jreq("/api/tenders", { name: "Gói thầu OK", items: [{ boqItemId: boqId, qty: 42.5 }] }),
    );
    assert.equal(res.status, 201);
    const { id, code } = await res.json();
    assert.match(code, /^GT-/);
    const row = await queryOne<{ project_id: number }>(
      `SELECT project_id FROM tender_packages WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
    const item = await queryOne<{ qty: number }>(
      `SELECT qty FROM tender_items WHERE tender_id = ? AND boq_item_id = ?`,
      id,
      boqId,
    );
    assert.equal(Number(item?.qty), 42.5);
  },
);

// ============================================================================
// GET/PATCH /api/tenders/[id]
// ============================================================================

test("GET /api/tenders/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/tenders/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/tenders/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("tgbad");
  const pm = await taoUser("pm", "tgbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/tenders/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/tenders/:id: gói thầu của dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("tgisoA");
  const projectB = await taoDuAn("tgisoB");
  const pmA = await taoUser("pm", "tgisoA");
  const pmB = await taoUser("pm", "tgisoB");
  const boqB = await taoBoqItem("tgisoB", projectB);
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/tenders/route");
  const created = await POST(
    jreq("/api/tenders", { name: "B", items: [{ boqItemId: boqB, qty: 1 }] }),
  );
  const { id: tenderId } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/tenders/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(tenderId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/tenders/:id: thành công → trả gói thầu + bảng so sánh giá theo dòng BOQ",
  S,
  async () => {
    const projectId = await taoDuAn("tgok");
    const pm = await taoUser("pm", "tgok");
    const boqId = await taoBoqItem("tgok", projectId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tenders/route");
    const created = await POST(
      jreq("/api/tenders", { name: "Gói xem chi tiết", items: [{ boqItemId: boqId, qty: 3 }] }),
    );
    const { id: tenderId } = await created.json();

    const { GET } = await import("@/app/api/tenders/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(tenderId) }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.tender.id, tenderId);
    assert.equal(body.items.length, 1);
    assert.deepEqual(body.bids, []);
  },
);

test("PATCH /api/tenders/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/tenders/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/tenders/:id: engineer không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("tp403b");
  const eng = await taoUser("engineer", "tp403b");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/tenders/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/tenders/:id: không tìm thấy (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("tpisoA");
  const projectB = await taoDuAn("tpisoB");
  const pmA = await taoUser("pm", "tpisoA");
  const pmB = await taoUser("pm", "tpisoB");
  const boqB = await taoBoqItem("tpisoB", projectB);
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/tenders/route");
  const created = await POST(
    jreq("/api/tenders", { name: "B", items: [{ boqItemId: boqB, qty: 1 }] }),
  );
  const { id: tenderId } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/tenders/[id]/route");
  const res = await PATCH(jreq("/x", { name: "hack" }, "PATCH"), {
    params: Promise.resolve({ id: String(tenderId) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/tenders/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("tpbody");
  const pm = await taoUser("pm", "tpbody");
  const boqId = await taoBoqItem("tpbody", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/route");
  const created = await POST(
    jreq("/api/tenders", { name: "x", items: [{ boqItemId: boqId, qty: 1 }] }),
  );
  const { id: tenderId } = await created.json();
  const { PATCH } = await import("@/app/api/tenders/[id]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: String(tenderId) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/tenders/:id: thiếu tên (xoá trắng) → 422", S, async () => {
  const projectId = await taoDuAn("tpname");
  const pm = await taoUser("pm", "tpname");
  const boqId = await taoBoqItem("tpname", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/route");
  const created = await POST(
    jreq("/api/tenders", { name: "Có tên", items: [{ boqItemId: boqId, qty: 1 }] }),
  );
  const { id: tenderId } = await created.json();
  const { PATCH } = await import("@/app/api/tenders/[id]/route");
  const res = await PATCH(jreq("/x", { name: "   " }, "PATCH"), {
    params: Promise.resolve({ id: String(tenderId) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/tenders/:id: đã trao thầu (awarded) → 409, không sửa được nữa", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("tawarded");
  const pm = await taoUser("pm", "tawarded");
  const boqId = await taoBoqItem("tawarded", projectId);
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/tenders/route");
  const created = await POST(
    jreq("/api/tenders", { name: "Đã trao", items: [{ boqItemId: boqId, qty: 1 }] }),
  );
  const { id: tenderId } = await created.json();
  await run(`UPDATE tender_packages SET status = 'awarded' WHERE id = ?`, tenderId);

  const { PATCH } = await import("@/app/api/tenders/[id]/route");
  const res = await PATCH(jreq("/x", { name: "hack" }, "PATCH"), {
    params: Promise.resolve({ id: String(tenderId) }),
  });
  assert.equal(res.status, 409);
});

test(
  "PATCH /api/tenders/:id: sửa thành công (đổi trạng thái draft → open, giữ nguyên scope không gửi)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("tpok");
    const pm = await taoUser("pm", "tpok");
    const boqId = await taoBoqItem("tpok", projectId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tenders/route");
    const created = await POST(
      jreq("/api/tenders", {
        name: "Gói thầu",
        scope: "Phạm vi gốc",
        items: [{ boqItemId: boqId, qty: 1 }],
      }),
    );
    const { id: tenderId } = await created.json();

    const { PATCH } = await import("@/app/api/tenders/[id]/route");
    const res = await PATCH(jreq("/x", { status: "open" }, "PATCH"), {
      params: Promise.resolve({ id: String(tenderId) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ status: string; scope: string }>(
      `SELECT status, scope FROM tender_packages WHERE id = ?`,
      tenderId,
    );
    assert.equal(row?.status, "open");
    assert.equal(row?.scope, "Phạm vi gốc"); // scope không gửi trong body → giữ nguyên
  },
);

// PATCH status không hợp lệ (không nằm trong TENDER_STATUSES) → giữ nguyên trạng thái cũ,
// không lỗi (nhánh "?" TENDER_STATUSES.includes trả về existing.status).
test(
  "PATCH /api/tenders/:id: status gửi lên không hợp lệ → bị bỏ qua, giữ trạng thái cũ",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("tpbadstatus");
    const pm = await taoUser("pm", "tpbadstatus");
    const boqId = await taoBoqItem("tpbadstatus", projectId);
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/tenders/route");
    const created = await POST(
      jreq("/api/tenders", { name: "Gói thầu", items: [{ boqItemId: boqId, qty: 1 }] }),
    );
    const { id: tenderId } = await created.json();

    const { PATCH } = await import("@/app/api/tenders/[id]/route");
    const res = await PATCH(jreq("/x", { status: "khong_hop_le" }, "PATCH"), {
      params: Promise.resolve({ id: String(tenderId) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM tender_packages WHERE id = ?`,
      tenderId,
    );
    assert.equal(row?.status, "draft");
  },
);
