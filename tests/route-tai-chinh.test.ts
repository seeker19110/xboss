import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm TÀI CHÍNH (vùng rủi ro cao — tiền thật, xem
// docs/audit.md) — cùng khuôn với tests/route-baselines.test.ts. Route:
//   - app/api/payment-certs/route.ts             (GET/POST đợt IPC)
//   - app/api/payment-certs/[id]/route.ts        (GET/PATCH 1 đợt IPC)
//   - app/api/contracts/route.ts                 (GET/POST hợp đồng)
//   - app/api/contracts/[id]/route.ts             (GET/PATCH/DELETE 1 hợp đồng)
//   - app/api/variations/route.ts                (GET/POST phát sinh/VO)
//   - app/api/variations/[id]/decide/route.ts    (POST quyết định VO)

const S = { skip: !HAS_TEST_DB };

// PHỤ THUỘC CHÉO GIỮA CÁC FILE TEST — đã dính thật: `visibleProjectIds` (lib/ha-tang/projects.ts)
// chỉ trả "mọi dự án" khi bảng `user_projects` RỖNG; hễ bảng đó có dòng thì user không được gán
// sẽ không thấy dự án nào, và route trả "Hợp đồng không tồn tại" thay vì lỗi nghiệp vụ đang kiểm.
// Nhiều file test khác chèn `user_projects` mà không dọn, nên file này xanh khi chạy riêng và đỏ
// trong bộ đầy đủ. Thay vì phụ thuộc vào trạng thái toàn cục đó, mỗi user ở đây được GÁN THẲNG
// vào dự án của nó (dangNhapDuAn) — test tự chủ, chạy đúng ở mọi thứ tự.
async function dangNhapDuAn(
  user: { id: number; passwordHash: string },
  projectId: number | null,
): Promise<void> {
  if (projectId != null) {
    const { run } = await import("@/lib/db");
    await run(
      `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      user.id,
      projectId,
    );
  }
  dangNhap(user, projectId);
}
const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TC route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `tc-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-tc-route', ?, ?)`,
    `TC ${ten}`,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

/** Hợp đồng "nhận thầu" (partyName tự do, không cần supplier) — đủ cho mọi test IPC/VO. */
async function taoHopDong(
  projectId: number,
  ten: string,
  overrides: {
    value?: number;
    advancePct?: number;
    retentionPct?: number;
    kind?: string;
    partySupplierId?: number | null;
  } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO contracts (code, kind, title, party_name, party_supplier_id, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, ?, ?, 'CĐT test', ?, ?, ?, ?, 'active', ?)`,
    `HD-${uniq(ten)}`,
    overrides.kind ?? "nhan_thau",
    `Hợp đồng ${ten}`,
    overrides.partySupplierId ?? null,
    overrides.value ?? 0,
    overrides.advancePct ?? 0,
    overrides.retentionPct ?? 0,
    projectId,
  );
}

async function taoBoqItem(
  contractId: number | null,
  ten: string,
  overrides: { qtyContract?: number; unitPrice?: number } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
     VALUES (?, ?, 'm', ?, ?, ?)`,
    `BOQ-${uniq(ten)}`,
    `Dòng BOQ ${ten}`,
    overrides.qtyContract ?? 100,
    overrides.unitPrice ?? 1000000,
    contractId,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// GET/POST /api/payment-certs
// ============================================================================

test("GET /api/payment-certs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payment-certs/route");
  const res = await GET(jreq("/api/payment-certs?contractId=1", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/payment-certs: vai trò không xem được thanh toán (engineer) → 403", S, async () => {
  // engineer KHÔNG nằm trong PAYMENT_VIEW_ROLES (admin/pm/bch) — bất biến bảo mật cốt lõi
  // của cụm tài chính: phải bị chặn TỪ SERVER, không chỉ ẩn trên UI.
  const projectId = await taoDuAn("eng403");
  const eng = await taoUser("engineer", "eng403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/payment-certs/route");
  const res = await GET(jreq("/api/payment-certs?contractId=1", undefined, "GET"));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /không có quyền xem/);
});

test("GET /api/payment-certs: thiếu contractId → 422", S, async () => {
  const projectId = await taoDuAn("noct");
  const pm = await taoUser("pm", "noct");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payment-certs/route");
  const res = await GET(jreq("/api/payment-certs", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/payment-certs: hợp đồng thuộc dự án KHÁC → 422 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("ipcA");
  const projectB = await taoDuAn("ipcB");
  const contractB = await taoHopDong(projectB, "ipcB");
  const pmA = await taoUser("pm", "ipcA");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/payment-certs/route");
  const res = await GET(jreq(`/api/payment-certs?contractId=${contractB}`, undefined, "GET"));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Hợp đồng không tồn tại/);
});

test("POST /api/payment-certs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/payment-certs/route");
  const res = await POST(jreq("/api/payment-certs", { contractId: 1 }));
  assert.equal(res.status, 401);
});

test("POST /api/payment-certs: vai trò không được lập đợt (engineer) → 403", S, async () => {
  const projectId = await taoDuAn("post403");
  const eng = await taoUser("engineer", "post403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/payment-certs/route");
  const res = await POST(jreq("/api/payment-certs", { contractId: 1 }));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /chỉ Admin\/PM/i);
});

test("POST /api/payment-certs: thiếu contractId → 422", S, async () => {
  const projectId = await taoDuAn("nocid");
  const pm = await taoUser("pm", "nocid");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/route");
  const res = await POST(jreq("/api/payment-certs", {}));
  assert.equal(res.status, 422);
});

test("POST /api/payment-certs: hợp đồng thuộc dự án khác → 422", S, async () => {
  const projectA = await taoDuAn("crossA");
  const projectB = await taoDuAn("crossB");
  const contractB = await taoHopDong(projectB, "crossB");
  const pmA = await taoUser("pm", "crossA");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/payment-certs/route");
  const res = await POST(jreq("/api/payment-certs", { contractId: contractB }));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Hợp đồng không tồn tại/);
});

test(
  "POST /api/payment-certs: hợp đồng chưa gán dòng BOQ nào → 422, không tạo đợt rỗng",
  S,
  async () => {
    const projectId = await taoDuAn("noboq");
    const pm = await taoUser("pm", "noboq");
    const contractId = await taoHopDong(projectId, "noboq");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/payment-certs/route");
    const res = await POST(jreq("/api/payment-certs", { contractId }));
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /chưa có dòng BOQ nào/);
  },
);

test(
  "POST rồi GET /api/payment-certs: PM lập được đợt 1 rồi đợt 2, period_no tăng dần",
  S,
  async () => {
    const projectId = await taoDuAn("2dot");
    const pm = await taoUser("pm", "2dot");
    const contractId = await taoHopDong(projectId, "2dot");
    await taoBoqItem(contractId, "2dot");
    await dangNhapDuAn(pm, projectId);
    const { POST, GET } = await import("@/app/api/payment-certs/route");

    const dot1 = await POST(jreq("/api/payment-certs", { contractId, periodLabel: "Đợt 1" }));
    assert.equal(dot1.status, 201);
    const j1 = await dot1.json();
    assert.match(j1.code, /^IPC-/);

    const dot2 = await POST(jreq("/api/payment-certs", { contractId }));
    assert.equal(dot2.status, 201);

    const ds = await GET(jreq(`/api/payment-certs?contractId=${contractId}`, undefined, "GET"));
    assert.equal(ds.status, 200);
    const { certs } = await ds.json();
    assert.equal(certs.length, 2);
    assert.deepEqual(certs.map((c: { periodNo: number }) => c.periodNo).sort(), [1, 2]);
  },
);

test(
  "GET /api/payment-certs: đợt của dự án khác không lộ ra khi liệt kê theo contractId của mình",
  S,
  async () => {
    // Bất biến cách ly dự án ở tầng danh sách: cho dù DB có cert khác dự án, route chỉ
    // trả cert của contract thuộc dự án đang chọn.
    const projectId = await taoDuAn("isolist");
    const pm = await taoUser("pm", "isolist");
    const contractId = await taoHopDong(projectId, "isolist");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/payment-certs/route");
    const res = await GET(jreq(`/api/payment-certs?contractId=${contractId}`, undefined, "GET"));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).certs, []);
  },
);

// ============================================================================
// GET/PATCH /api/payment-certs/[id]
// ============================================================================

test("GET /api/payment-certs/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/payment-certs/:id: engineer không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("g403");
  const eng = await taoUser("engineer", "g403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/payment-certs/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("gbad");
  const pm = await taoUser("pm", "gbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/payment-certs/:id: đợt thuộc hợp đồng dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("gisoA");
  const projectB = await taoDuAn("gisoB");
  const pmA = await taoUser("pm", "gisoA");
  const pmB = await taoUser("pm", "gisoB");
  const contractB = await taoHopDong(projectB, "gisoB");
  await taoBoqItem(contractB, "gisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/payment-certs/route");
  const created = await POST(jreq("/api/payment-certs", { contractId: contractB }));
  const { id: certId } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/payment-certs/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/payment-certs/:id: tổng tiền đợt chính xác tuyệt đối (tạm ứng/giữ lại/đề nghị)",
  S,
  async () => {
    // Quy ước M45: tiền tính trong SQL — kiểm giá trị CHÍNH XÁC, không chỉ "có số".
    // unitPrice=1.000.000, qty=10 → period=10.000.000; advance 10% = 1.000.000;
    // retention 5% = 500.000; approved = 8.500.000.
    const projectId = await taoDuAn("tien");
    const pm = await taoUser("pm", "tien");
    const contractId = await taoHopDong(projectId, "tien", { advancePct: 10, retentionPct: 5 });
    const boqId = await taoBoqItem(contractId, "tien", { qtyContract: 100, unitPrice: 1000000 });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/payment-certs/route");
    const created = await POST(jreq("/api/payment-certs", { contractId }));
    const { id: certId } = await created.json();

    const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
    const patchRes = await PATCH(
      jreq("/x", { items: [{ boqItemId: boqId, qtyPeriod: 10 }] }, "PATCH"),
      { params: Promise.resolve({ id: String(certId) }) },
    );
    assert.equal(patchRes.status, 200);

    const { GET } = await import("@/app/api/payment-certs/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(certId) }),
    });
    assert.equal(res.status, 200);
    const { totals, approvalStatus } = await res.json();
    assert.equal(totals.periodValue, 10000000);
    assert.equal(totals.advanceDeduct, 1000000);
    assert.equal(totals.retentionDeduct, 500000);
    assert.equal(totals.approvedValue, 8500000);
    // Không có approval flow cấu hình cho payment_cert → dormant, trả null.
    assert.equal(approvalStatus, null);
  },
);

test("PATCH /api/payment-certs/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/payment-certs/:id: engineer không được sửa (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("p403");
  const eng = await taoUser("engineer", "p403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/payment-certs/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("pbad");
  const pm = await taoUser("pm", "pbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/payment-certs/:id: không tìm thấy đợt (dự án khác/không tồn tại) → 404",
  S,
  async () => {
    const projectId = await taoDuAn("p404");
    const pm = await taoUser("pm", "p404");
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
    const res = await PATCH(jreq("/x", {}, "PATCH"), {
      params: Promise.resolve({ id: "999999999" }),
    });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/payment-certs/:id: đợt đã trình (không còn nháp) → 409", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("p409");
  const pm = await taoUser("pm", "p409");
  const contractId = await taoHopDong(projectId, "p409");
  await taoBoqItem(contractId, "p409");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/route");
  const created = await POST(jreq("/api/payment-certs", { contractId }));
  const { id: certId } = await created.json();
  await run(`UPDATE payment_certs SET status = 'submitted' WHERE id = ?`, certId);

  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const res = await PATCH(jreq("/x", { periodLabel: "x" }, "PATCH"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error, /trạng thái nháp/);
});

test("PATCH /api/payment-certs/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("pbody");
  const pm = await taoUser("pm", "pbody");
  const contractId = await taoHopDong(projectId, "pbody");
  await taoBoqItem(contractId, "pbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/route");
  const created = await POST(jreq("/api/payment-certs", { contractId }));
  const { id: certId } = await created.json();

  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const res = await PATCH(
    new NextRequest("http://localhost/x", { method: "PATCH", body: "khong-phai-json" }),
    { params: Promise.resolve({ id: String(certId) }) },
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/payment-certs/:id: dòng KL không hợp lệ (qty âm) → 422", S, async () => {
  const projectId = await taoDuAn("pinv");
  const pm = await taoUser("pm", "pinv");
  const contractId = await taoHopDong(projectId, "pinv");
  const boqId = await taoBoqItem(contractId, "pinv");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/route");
  const created = await POST(jreq("/api/payment-certs", { contractId }));
  const { id: certId } = await created.json();

  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const res = await PATCH(jreq("/x", { items: [{ boqItemId: boqId, qtyPeriod: -5 }] }, "PATCH"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/payment-certs/:id: dòng BOQ không thuộc hợp đồng của đợt → 422 (checkCertLinesBelongToContract)",
  S,
  async () => {
    const projectId = await taoDuAn("pxref");
    const pm = await taoUser("pm", "pxref");
    const contractA = await taoHopDong(projectId, "pxrefA");
    const contractB = await taoHopDong(projectId, "pxrefB");
    await taoBoqItem(contractA, "pxrefA");
    const boqB = await taoBoqItem(contractB, "pxrefB");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/payment-certs/route");
    const created = await POST(jreq("/api/payment-certs", { contractId: contractA }));
    const { id: certId } = await created.json();

    const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
    const res = await PATCH(jreq("/x", { items: [{ boqItemId: boqB, qtyPeriod: 1 }] }, "PATCH"), {
      params: Promise.resolve({ id: String(certId) }),
    });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /không thuộc hợp đồng này/);
  },
);

test(
  "PATCH /api/payment-certs/:id: KL vượt khối lượng hợp đồng vẫn LƯU nhưng phải CẢNH BÁO rõ từng dòng",
  S,
  async () => {
    // Quyết định nghiệp vụ (người dùng, 2026-09-04): cảnh báo chứ KHÔNG chặn. Thi công vượt
    // khối lượng trong khi phụ lục/VO còn chờ duyệt là tình huống thật, chặn cứng sẽ cản quy
    // trình. Nhưng im lặng cho qua thì người ký duyệt IPC không có cách nào biết — mà đây là
    // tiền thật. Trước đợt này KHÔNG lớp nào so khối lượng với hợp đồng: validateCertItems chỉ
    // kiểm qty >= 0 và không trùng dòng, saveCertItems ghi thẳng, overContractCerts chỉ so giá
    // trị tiền cả hợp đồng và không được route gọi. Nhập gấp 10 lần vẫn lưu, không dấu hiệu nào.
    const projectId = await taoDuAn("pover");
    const pm = await taoUser("pm", "pover");
    const contractId = await taoHopDong(projectId, "pover");
    const boqId = await taoBoqItem(contractId, "pover", { qtyContract: 10, unitPrice: 1000 });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/payment-certs/route");
    const created = await POST(jreq("/api/payment-certs", { contractId }));
    const { id: certId } = await created.json();

    const { PATCH, GET } = await import("@/app/api/payment-certs/[id]/route");
    const res = await PATCH(
      jreq("/x", { items: [{ boqItemId: boqId, qtyPeriod: 100 }] }, "PATCH"),
      { params: Promise.resolve({ id: String(certId) }) },
    );
    assert.equal(res.status, 200, "vẫn lưu được — cảnh báo chứ không chặn");

    const jsonPatch = await res.json();
    assert.equal(jsonPatch.vuotHopDong.length, 1, "PATCH phải trả kèm dòng vượt");
    assert.equal(jsonPatch.vuotHopDong[0].boqItemId, boqId);
    assert.equal(Number(jsonPatch.vuotHopDong[0].qtyCumulative), 100);
    assert.equal(Number(jsonPatch.vuotHopDong[0].qtyContract), 10);

    // GET cũng phải trả cảnh báo — người ký duyệt thường mở lại đợt để xem, không phải người lập.
    const chiTiet = await GET(jreq(`/api/payment-certs/${certId}`), {
      params: Promise.resolve({ id: String(certId) }),
    });
    const jsonGet = await chiTiet.json();
    assert.equal(jsonGet.vuotHopDong.length, 1);
    assert.equal(jsonGet.vuotHopDong[0].code, jsonPatch.vuotHopDong[0].code);
  },
);

test(
  "PATCH /api/payment-certs/:id: KL trong hạn mức hợp đồng thì KHÔNG có cảnh báo nào",
  S,
  async () => {
    // Mặt còn lại của bất biến: cảnh báo phải im khi mọi thứ bình thường, nếu không người
    // dùng sẽ học cách phớt lờ nó và cảnh báo thật cũng chìm theo.
    const projectId = await taoDuAn("punder");
    const pm = await taoUser("pm", "punder");
    const contractId = await taoHopDong(projectId, "punder");
    const boqId = await taoBoqItem(contractId, "punder", { qtyContract: 10, unitPrice: 1000 });
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/payment-certs/route");
    const created = await POST(jreq("/api/payment-certs", { contractId }));
    const { id: certId } = await created.json();

    const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
    const res = await PATCH(jreq("/x", { items: [{ boqItemId: boqId, qtyPeriod: 10 }] }, "PATCH"), {
      params: Promise.resolve({ id: String(certId) }),
    });
    assert.equal(res.status, 200);
    // Đúng bằng khối lượng hợp đồng vẫn là hợp lệ — chỉ VƯỢT mới cảnh báo.
    assert.deepEqual((await res.json()).vuotHopDong, []);
  },
);

test("PATCH /api/payment-certs/:id: sửa periodLabel thành công (không đụng items)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("plabel");
  const pm = await taoUser("pm", "plabel");
  const contractId = await taoHopDong(projectId, "plabel");
  await taoBoqItem(contractId, "plabel");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/payment-certs/route");
  const created = await POST(jreq("/api/payment-certs", { contractId }));
  const { id: certId } = await created.json();

  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const res = await PATCH(jreq("/x", { periodLabel: "Tháng 9/2026" }, "PATCH"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ period_label: string }>(
    `SELECT period_label FROM payment_certs WHERE id = ?`,
    certId,
  );
  assert.equal(row?.period_label, "Tháng 9/2026");

  // periodLabel = null → xoá nhãn (nhánh "body.periodLabel === null").
  const res2 = await PATCH(jreq("/x", { periodLabel: null }, "PATCH"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res2.status, 200);
  const row2 = await queryOne<{ period_label: string | null }>(
    `SELECT period_label FROM payment_certs WHERE id = ?`,
    certId,
  );
  assert.equal(row2?.period_label, null);
});

// ============================================================================
// GET/POST /api/contracts
// ============================================================================

test("GET /api/contracts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/contracts/route");
  const res = await GET(jreq("/api/contracts", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/contracts: engineer không có quyền xem hợp đồng → 403", S, async () => {
  const projectId = await taoDuAn("c403");
  const eng = await taoUser("engineer", "c403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/contracts/route");
  const res = await GET(jreq("/api/contracts", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/contracts: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("ckind");
  const pm = await taoUser("pm", "ckind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/contracts/route");
  const res = await GET(jreq("/api/contracts?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/contracts: cách ly dự án — không thấy hợp đồng của dự án khác", S, async () => {
  const projectA = await taoDuAn("cisoA");
  const projectB = await taoDuAn("cisoB");
  const pmA = await taoUser("pm", "cisoA");
  await taoHopDong(projectB, "cisoB");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/contracts/route");
  const res = await GET(jreq("/api/contracts", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).contracts, []);
});

test(
  "GET /api/contracts: ?includeDeleted=1 chỉ có hiệu lực với admin — PM vẫn chỉ thấy hợp đồng còn sống",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("cdel");
    const pm = await taoUser("pm", "cdel");
    const admin = await taoUser("admin", "cdel");
    const contractId = await taoHopDong(projectId, "cdel");
    await run(`UPDATE contracts SET deleted_at = now() WHERE id = ?`, contractId);

    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/contracts/route");
    const asPm = await GET(jreq("/api/contracts?includeDeleted=1", undefined, "GET"));
    assert.deepEqual((await asPm.json()).contracts, []);

    await dangNhapDuAn(admin, projectId);
    const asAdmin = await GET(jreq("/api/contracts?includeDeleted=1", undefined, "GET"));
    const { contracts } = await asAdmin.json();
    assert.equal(contracts.length, 1);
    assert.equal(contracts[0].id, contractId);
  },
);

test("POST /api/contracts: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/contracts/route");
  const res = await POST(jreq("/api/contracts", {}));
  assert.equal(res.status, 401);
});

test("POST /api/contracts: engineer không được tạo hợp đồng (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("cp403");
  const eng = await taoUser("engineer", "cp403");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/contracts/route");
  const res = await POST(jreq("/api/contracts", {}));
  assert.equal(res.status, 403);
});

test("POST /api/contracts: body rỗng → 400", S, async () => {
  const projectId = await taoDuAn("cbody");
  const pm = await taoUser("pm", "cbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/route");
  const res = await POST(
    new NextRequest("http://localhost/api/contracts", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/contracts: thiếu số hợp đồng → 422 (validateContractInput)", S, async () => {
  const projectId = await taoDuAn("cval");
  const pm = await taoUser("pm", "cval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/route");
  const res = await POST(
    jreq("/api/contracts", { kind: "nhan_thau", title: "HĐ thiếu số", partyName: "CĐT" }),
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/contracts: đối tác (supplier) không tồn tại → 422 (checkContractRefs)",
  S,
  async () => {
    const projectId = await taoDuAn("cref");
    const pm = await taoUser("pm", "cref");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/contracts/route");
    const res = await POST(
      jreq("/api/contracts", {
        code: `HD-${uniq("cref")}`,
        kind: "giao_thau",
        title: "HĐ giao thầu",
        partySupplierId: 999999999,
      }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /Đối tác/);
  },
);

test(
  "POST /api/contracts: thành công → project_id do SERVER suy (dự án đang chọn), không tin client",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("cok");
    const pm = await taoUser("pm", "cok");
    await dangNhapDuAn(pm, projectId);
    const code = `HD-${uniq("cok")}`;
    const { POST } = await import("@/app/api/contracts/route");
    const res = await POST(
      jreq("/api/contracts", {
        code,
        kind: "nhan_thau",
        title: "HĐ hợp lệ",
        partyName: "CĐT ABC",
        value: 500000000,
        advancePct: 20,
        retentionPct: 5,
        // projectId lạ cố tình gửi kèm — route KHÔNG được tin trường này.
        projectId: 999999,
      }),
    );
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const row = await queryOne<{ project_id: number }>(
      `SELECT project_id FROM contracts WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
  },
);

test("POST /api/contracts: trùng số hợp đồng → 409", S, async () => {
  const projectId = await taoDuAn("cdup");
  const pm = await taoUser("pm", "cdup");
  const code = `HD-${uniq("cdup")}`;
  await taoHopDong(projectId, "cdupSetup"); // hợp đồng nền, không dùng cùng code
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/contracts/route");
  const first = await POST(
    jreq("/api/contracts", { code, kind: "nhan_thau", title: "A", partyName: "CĐT" }),
  );
  assert.equal(first.status, 201);
  const second = await POST(
    jreq("/api/contracts", { code, kind: "nhan_thau", title: "B", partyName: "CĐT" }),
  );
  assert.equal(second.status, 409);
});

test(
  "POST /api/contracts: lỗi DB KHÔNG PHẢI trùng mã (tràn NUMERIC) được ném lại nguyên vẹn, không nuốt lỗi",
  S,
  async () => {
    // Nhánh `throw err` (không phải 23505) — value vượt NUMERIC(15,2) (tối đa ~10^13)
    // gây lỗi Postgres khác hẳn unique violation; route không được biến nó thành 409
    // giả trùng mã mà phải để lỗi lộ ra (nuốt nhầm lỗi sẽ che mất sự cố thật ở DB).
    const projectId = await taoDuAn("coverr");
    const pm = await taoUser("pm", "coverr");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/contracts/route");
    await assert.rejects(() =>
      POST(
        jreq("/api/contracts", {
          code: `HD-${uniq("coverr")}`,
          kind: "nhan_thau",
          title: "Tràn số",
          partyName: "CĐT",
          value: 1e20,
        }),
      ),
    );
  },
);

// ============================================================================
// GET/PATCH/DELETE /api/contracts/[id]
// ============================================================================

test("GET /api/contracts/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/contracts/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/contracts/:id: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("gid403");
  const eng = await taoUser("engineer", "gid403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/contracts/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/contracts/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("gidbad");
  const pm = await taoUser("pm", "gidbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/contracts/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("GET /api/contracts/:id: hợp đồng của dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("gidisoA");
  const projectB = await taoDuAn("gidisoB");
  const pmA = await taoUser("pm", "gidisoA");
  const contractB = await taoHopDong(projectB, "gidisoB");
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/contracts/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(contractB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "GET /api/contracts/:id: thành công trả đủ khối phụ lục/tài liệu/thanh toán/PO/giao thầu tầng",
  S,
  async () => {
    const projectId = await taoDuAn("gidok");
    const pm = await taoUser("pm", "gidok");
    const contractId = await taoHopDong(projectId, "gidok", { value: 100 });
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/contracts/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.contract.id, contractId);
    assert.deepEqual(body.addenda, []);
    assert.deepEqual(body.documents, []);
    assert.deepEqual(body.bills, []);
    assert.deepEqual(body.purchaseOrders, []);
    assert.deepEqual(body.floorContracts, []);
  },
);

test("PATCH /api/contracts/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/contracts/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/contracts/:id: engineer không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("pid403");
  const eng = await taoUser("engineer", "pid403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/contracts/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/contracts/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("pidbad");
  const pm = await taoUser("pm", "pidbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/contracts/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/contracts/:id: không tìm thấy (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("pidisoA");
  const projectB = await taoDuAn("pidisoB");
  const pmA = await taoUser("pm", "pidisoA");
  const contractB = await taoHopDong(projectB, "pidisoB");
  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/contracts/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), {
    params: Promise.resolve({ id: String(contractB) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/contracts/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("pidbody");
  const pm = await taoUser("pm", "pidbody");
  const contractId = await taoHopDong(projectId, "pidbody");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/contracts/[id]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/contracts/:id: custom field chưa định nghĩa → 422 (validateCustom)",
  S,
  async () => {
    const projectId = await taoDuAn("pidcustombad");
    const pm = await taoUser("pm", "pidcustombad");
    const contractId = await taoHopDong(projectId, "pidcustombad");
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/contracts/[id]/route");
    const res = await PATCH(jreq("/x", { custom: { truong_la: "x" } }, "PATCH"), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    assert.equal(res.status, 422);
  },
);

test(
  "PATCH /api/contracts/:id: sửa thành công (merge field không gửi giữ nguyên) + custom rỗng",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("pidok");
    const pm = await taoUser("pm", "pidok");
    const contractId = await taoHopDong(projectId, "pidok", { value: 100 });
    await dangNhapDuAn(pm, projectId);
    const { PATCH } = await import("@/app/api/contracts/[id]/route");
    const res = await PATCH(jreq("/x", { value: 999, custom: {} }, "PATCH"), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ value: number; title: string }>(
      `SELECT value, title FROM contracts WHERE id = ?`,
      contractId,
    );
    assert.equal(Number(row?.value), 999);
    assert.equal(row?.title, "Hợp đồng pidok"); // field không gửi giữ nguyên
  },
);

test("PATCH /api/contracts/:id: đổi số hợp đồng trùng số khác → 409", S, async () => {
  const projectId = await taoDuAn("piddup");
  const pm = await taoUser("pm", "piddup");
  const codeA = `HD-${uniq("piddupA")}`;
  const codeB = `HD-${uniq("piddupB")}`;
  const { insertId } = await import("@/lib/db");
  const contractA = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, project_id) VALUES (?, 'nhan_thau', 'A', 'CĐT', ?)`,
    codeA,
    projectId,
  );
  await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, project_id) VALUES (?, 'nhan_thau', 'B', 'CĐT', ?)`,
    codeB,
    projectId,
  );
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/contracts/[id]/route");
  const res = await PATCH(jreq("/x", { code: codeB }, "PATCH"), {
    params: Promise.resolve({ id: String(contractA) }),
  });
  assert.equal(res.status, 409);
});

test("DELETE /api/contracts/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/contracts/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/contracts/:id: chỉ Admin được xoá — PM bị 403", S, async () => {
  const projectId = await taoDuAn("del403");
  const pm = await taoUser("pm", "del403");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/contracts/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /Chỉ Admin/);
});

test("DELETE /api/contracts/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("delbad");
  const admin = await taoUser("admin", "delbad");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/contracts/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("DELETE /api/contracts/:id: không tìm thấy (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("deliso404A");
  const projectB = await taoDuAn("deliso404B");
  const adminA = await taoUser("admin", "deliso404A", 1);
  const contractB = await taoHopDong(projectB, "deliso404B");
  await dangNhapDuAn(adminA, projectA);
  const { DELETE } = await import("@/app/api/contracts/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(contractB) }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/contracts/:id: còn dòng BOQ gắn vào → 409, không mất dấu vết tiền đã chi",
  S,
  async () => {
    const projectId = await taoDuAn("dellinked");
    const admin = await taoUser("admin", "dellinked");
    const contractId = await taoHopDong(projectId, "dellinked");
    await taoBoqItem(contractId, "dellinked");
    await dangNhapDuAn(admin, projectId);
    const { DELETE } = await import("@/app/api/contracts/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(contractId) }),
    });
    assert.equal(res.status, 409);
  },
);

test("DELETE /api/contracts/:id: thành công → soft-delete (deleted_at được set)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("delok");
  const admin = await taoUser("admin", "delok");
  const contractId = await taoHopDong(projectId, "delok");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/contracts/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(contractId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM contracts WHERE id = ?`,
    contractId,
  );
  assert.ok(row?.deleted_at != null);
});

// ============================================================================
// GET/POST /api/variations
// ============================================================================

test("GET /api/variations: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/variations/route");
  const res = await GET(jreq("/api/variations", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/variations: subcon không có quyền xem phát sinh/VO → 403", S, async () => {
  const projectId = await taoDuAn("v403");
  const sub = await taoUser("subcon", "v403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/variations/route");
  const res = await GET(jreq("/api/variations", undefined, "GET"));
  assert.equal(res.status, 403);
});

test(
  "GET /api/variations: status lọc không hợp lệ bị bỏ qua (không lỗi, trả tất cả)",
  S,
  async () => {
    const projectId = await taoDuAn("vstatus");
    const pm = await taoUser("pm", "vstatus");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/variations/route");
    const res = await GET(jreq("/api/variations?status=khong_hop_le", undefined, "GET"));
    assert.equal(res.status, 200);
  },
);

test("GET /api/variations: cách ly dự án — không thấy VO của dự án khác", S, async () => {
  const projectA = await taoDuAn("visoA");
  const projectB = await taoDuAn("visoB");
  const pmA = await taoUser("pm", "visoA");
  const pmB = await taoUser("pm", "visoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST, GET } = await import("@/app/api/variations/route");
  await POST(
    jreq("/api/variations", {
      title: "VO của B",
      reason: "other",
      lines: [{ code: `VOC-${uniq("visoB")}`, name: "Dòng", unit: "m", qty: 1, unitPrice: 100 }],
    }),
  );
  await dangNhapDuAn(pmA, projectA);
  const res = await GET(jreq("/api/variations", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).items, []);
});

test(
  "GET /api/variations: engineer XEM được VO (viewVariations) nhưng KHÔNG thấy giá trị/đơn giá (thiếu viewPayments)",
  S,
  async () => {
    const projectId = await taoDuAn("vmask");
    const pm = await taoUser("pm", "vmask");
    const eng = await taoUser("engineer", "vmask");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/route");
    const created = await POST(
      jreq("/api/variations", {
        title: "VO che tiền",
        reason: "other",
        lines: [
          { code: `VOM-${uniq("vmask")}`, name: "Dòng", unit: "m", qty: 5, unitPrice: 20000 },
        ],
      }),
    );
    assert.equal(created.status, 201);

    const { GET } = await import("@/app/api/variations/route");
    // PM (có viewPayments) thấy giá trị thật.
    const asPm = await GET(jreq("/api/variations", undefined, "GET"));
    const itemsPm = (await asPm.json()).items;
    assert.equal(itemsPm.length, 1);
    assert.equal(Number(itemsPm[0].proposedValue), 100000);
    assert.equal(Number(itemsPm[0].lines[0].unitPrice), 20000);

    // engineer thấy được VO nhưng proposedValue/approvedValue/lines.unitPrice bị che null.
    await dangNhapDuAn(eng, projectId);
    const asEng = await GET(jreq("/api/variations", undefined, "GET"));
    assert.equal(asEng.status, 200);
    const itemsEng = (await asEng.json()).items;
    assert.equal(itemsEng.length, 1);
    assert.equal(itemsEng[0].proposedValue, null);
    assert.equal(itemsEng[0].approvedValue, null);
    assert.equal(itemsEng[0].lines[0].unitPrice, null);
    // Trường không nhạy cảm vẫn còn nguyên (mã/tên dòng, không phải chỉ mỗi tiền bị ẩn).
    assert.equal(itemsEng[0].lines[0].name, "Dòng");
  },
);

test("POST /api/variations: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/variations/route");
  const res = await POST(jreq("/api/variations", {}));
  assert.equal(res.status, 401);
});

test(
  "POST /api/variations: bch xem được VO nhưng KHÔNG được tạo (createVariation loại bch) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("vp403");
    const bch = await taoUser("bch", "vp403");
    await dangNhapDuAn(bch, projectId);
    const { POST } = await import("@/app/api/variations/route");
    const res = await POST(jreq("/api/variations", {}));
    assert.equal(res.status, 403);
  },
);

test("POST /api/variations: chưa có dự án nào → 422", S, async () => {
  const { insertId, queryOne, run } = await import("@/lib/db");
  const projectId = await taoDuAn("vnoproj");
  const pm = await taoUser("pm", "vnoproj");
  const other = await taoUser("pm", "vnoprojOther");
  // Gán dự án cho NGƯỜI KHÁC (bảng user_projects khác rỗng) → pm hiện tại không thấy
  // dự án nào (cùng kỹ thuật với route-baselines.test.ts).
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { POST } = await import("@/app/api/variations/route");
    const res = await POST(jreq("/api/variations", {}));
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
  void insertId;
  void queryOne;
});

test("POST /api/variations: body rỗng → 422", S, async () => {
  const projectId = await taoDuAn("vbody");
  const pm = await taoUser("pm", "vbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/route");
  const res = await POST(
    new NextRequest("http://localhost/api/variations", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/variations: thiếu dòng khối lượng → 422 (validateVoInput)", S, async () => {
  const projectId = await taoDuAn("vval");
  const pm = await taoUser("pm", "vval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/route");
  const res = await POST(
    jreq("/api/variations", { title: "Thiếu dòng", reason: "other", lines: [] }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/variations: hệ (systemId) không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("vsysbad");
  const pm = await taoUser("pm", "vsysbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/route");
  const res = await POST(
    jreq("/api/variations", {
      title: "Hệ sai",
      reason: "other",
      systemId: 999999999,
      lines: [{ code: `VOS-${uniq("vsysbad")}`, name: "D", unit: "m", qty: 1, unitPrice: 1 }],
    }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Hệ không hợp lệ/);
});

test(
  "POST /api/variations: mã dòng KL trùng BOQCODE đã dùng (task khác) → 409 (checkVoLinesTaken)",
  S,
  async () => {
    const projectId = await taoDuAn("vtaken");
    const pm = await taoUser("pm", "vtaken");
    const code = `VOT-${uniq("vtaken")}`;
    // Tạo VO đầu tiên chiếm mã (trigger boq_codes_sync tự đăng ký boq_items.code).
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/route");
    const first = await POST(
      jreq("/api/variations", {
        title: "VO chiếm mã",
        reason: "other",
        lines: [{ code, name: "D1", unit: "m", qty: 1, unitPrice: 1 }],
      }),
    );
    assert.equal(first.status, 201);

    const second = await POST(
      jreq("/api/variations", {
        title: "VO trùng mã",
        reason: "other",
        lines: [{ code, name: "D2", unit: "m", qty: 1, unitPrice: 1 }],
      }),
    );
    assert.equal(second.status, 409);
    assert.match((await second.json()).error, /đã được dùng bởi/);
  },
);

test(
  "POST /api/variations: lỗi DB KHÔNG PHẢI trùng mã (tràn NUMERIC đơn giá) được ném lại nguyên vẹn",
  S,
  async () => {
    // Nhánh `throw err` (không phải 23505) của catch trong POST — đơn giá vượt
    // NUMERIC(15,2) gây lỗi Postgres khác hẳn unique violation; route không được nuốt
    // nhầm thành 409 "trùng mã do tạo đồng thời".
    const projectId = await taoDuAn("voverr");
    const pm = await taoUser("pm", "voverr");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/route");
    await assert.rejects(() =>
      POST(
        jreq("/api/variations", {
          title: "Tràn đơn giá",
          reason: "other",
          lines: [{ code: `VOE-${uniq("voverr")}`, name: "D", unit: "m", qty: 1, unitPrice: 1e20 }],
        }),
      ),
    );
  },
);

test(
  "POST /api/variations: tạo thành công → mã VO- tự sinh, dòng KL ghi vào boq_items(vo_id)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("vok");
    const pm = await taoUser("pm", "vok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/variations/route");
    const res = await POST(
      jreq("/api/variations", {
        title: "VO hợp lệ",
        reason: "design_change",
        lines: [{ code: `VOK-${uniq("vok")}`, name: "D", unit: "m", qty: 3, unitPrice: 50000 }],
      }),
    );
    assert.equal(res.status, 201);
    const { id, code } = await res.json();
    assert.match(code, /^VO-/);
    const row = await queryOne<{ vo_id: number }>(
      `SELECT vo_id FROM boq_items WHERE vo_id = ?`,
      id,
    );
    assert.equal(row?.vo_id, id);
  },
);

// ============================================================================
// POST /api/variations/[id]/decide
// ============================================================================

/** Trình VO nháp → 'submitted' trực tiếp qua SQL (route /submit đã có test riêng ở
 *  chỗ khác — ở đây chỉ cần trạng thái đúng để test route decide). */
async function trinhVo(id: number): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `UPDATE variation_orders SET status = 'submitted', submitted_at = current_date WHERE id = ?`,
    id,
  );
}

async function taoVoDaTrinh(
  projectId: number,
  nguoiTao: { id: number; passwordHash: string },
  ten: string,
  overrides: { qty?: number; unitPrice?: number } = {},
): Promise<{ id: number; code: string }> {
  await dangNhapDuAn(nguoiTao, projectId);
  const { POST } = await import("@/app/api/variations/route");
  const res = await POST(
    jreq("/api/variations", {
      title: `VO ${ten}`,
      reason: "other",
      lines: [
        {
          code: `VOD-${uniq(ten)}`,
          name: "Dòng",
          unit: "m",
          qty: overrides.qty ?? 10,
          unitPrice: overrides.unitPrice ?? 100000,
        },
      ],
    }),
  );
  const { id, code } = await res.json();
  await trinhVo(id);
  return { id, code };
}

test("POST /api/variations/:id/decide: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/variations/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/variations/:id/decide: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("dbad");
  const pm = await taoUser("pm", "dbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("POST /api/variations/:id/decide: decision không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("ddec422");
  const pm = await taoUser("pm", "ddec422");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/variations/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "huh" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 422);
});

test("POST /api/variations/:id/decide: VO thuộc dự án khác → 404", S, async () => {
  const projectA = await taoDuAn("d404A");
  const projectB = await taoDuAn("d404B");
  const pmA = await taoUser("pm", "d404A");
  const pmB = await taoUser("pm", "d404B");
  const vo = await taoVoDaTrinh(projectB, pmB, "d404");
  await dangNhapDuAn(pmA, projectA);
  const { POST } = await import("@/app/api/variations/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(vo.id) }),
  });
  assert.equal(res.status, 404);
});

test("POST /api/variations/:id/decide: VO còn nháp (chưa trình) → 409", S, async () => {
  const projectId = await taoDuAn("d409");
  const pm = await taoUser("pm", "d409");
  await dangNhapDuAn(pm, projectId);
  const { POST: createVo } = await import("@/app/api/variations/route");
  const created = await createVo(
    jreq("/api/variations", {
      title: "VO nháp",
      reason: "other",
      lines: [{ code: `VON-${uniq("d409")}`, name: "D", unit: "m", qty: 1, unitPrice: 1 }],
    }),
  );
  const { id } = await created.json();
  const { POST } = await import("@/app/api/variations/[id]/decide/route");
  const res = await POST(jreq("/x", { decision: "approved" }), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 409);
});

test(
  "POST /api/variations/:id/decide: không có flow duyệt cấu hình, engineer không được duyệt (chỉ Admin/PM) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("d403eng");
    const pm = await taoUser("pm", "d403eng");
    const eng = await taoUser("engineer", "d403eng");
    const vo = await taoVoDaTrinh(projectId, pm, "d403eng");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /Chỉ Admin\/PM/);
  },
);

test(
  "POST /api/variations/:id/decide: decision=rejected → status=rejected, KHÔNG đụng qty_approved",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("drej");
    const pm = await taoUser("pm", "drej");
    const pm2 = await taoUser("pm", "drej2");
    const vo = await taoVoDaTrinh(projectId, pm, "drej");
    await dangNhapDuAn(pm2, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "rejected" }), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ status: string }>(
      `SELECT status FROM variation_orders WHERE id = ?`,
      vo.id,
    );
    assert.equal(row?.status, "rejected");
    const line = await queryOne<{ qty_approved: number | null }>(
      `SELECT qty_approved FROM boq_items WHERE vo_id = ?`,
      vo.id,
    );
    assert.equal(line?.qty_approved, null);
  },
);

test(
  "POST /api/variations/:id/decide: decision=approved → qty_approved = qty_contract mọi dòng, phát webhook (không lỗi)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("dapp");
    const pm = await taoUser("pm", "dapp");
    const pm2 = await taoUser("pm", "dapp2"); // SoD: người quyết khác người tạo
    const vo = await taoVoDaTrinh(projectId, pm, "dapp", { qty: 7 });
    await dangNhapDuAn(pm2, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.decided, vo.id);
    assert.equal(body.decision, "approved");
    const line = await queryOne<{ qty_approved: number; qty_contract: number }>(
      `SELECT qty_approved, qty_contract FROM boq_items WHERE vo_id = ?`,
      vo.id,
    );
    assert.equal(Number(line?.qty_approved), Number(line?.qty_contract));
  },
);

test(
  "POST /api/variations/:id/decide: partially_approved thiếu qtyApproved cho 1 dòng → 422",
  S,
  async () => {
    const projectId = await taoDuAn("dpartmiss");
    const pm = await taoUser("pm", "dpartmiss");
    const pm2 = await taoUser("pm", "dpartmiss2");
    const vo = await taoVoDaTrinh(projectId, pm, "dpartmiss");
    await dangNhapDuAn(pm2, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "partially_approved", lines: [] }), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /Thiếu khối lượng duyệt/);
  },
);

test(
  "POST /api/variations/:id/decide: partially_approved vượt khối lượng đề xuất → 422",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("dpartover");
    const pm = await taoUser("pm", "dpartover");
    const pm2 = await taoUser("pm", "dpartover2");
    const vo = await taoVoDaTrinh(projectId, pm, "dpartover", { qty: 10 });
    const line = await queryOne<{ id: number }>(`SELECT id FROM boq_items WHERE vo_id = ?`, vo.id);
    await dangNhapDuAn(pm2, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const res = await POST(
      jreq("/x", {
        decision: "partially_approved",
        lines: [{ id: line!.id, qtyApproved: 999 }],
      }),
      { params: Promise.resolve({ id: String(vo.id) }) },
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /phải trong khoảng/);
  },
);

test(
  "POST /api/variations/:id/decide: partially_approved hợp lệ → cập nhật đúng từng dòng, status đúng",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("dpartok");
    const pm = await taoUser("pm", "dpartok");
    const pm2 = await taoUser("pm", "dpartok2");
    const vo = await taoVoDaTrinh(projectId, pm, "dpartok", { qty: 10 });
    const line = await queryOne<{ id: number }>(`SELECT id FROM boq_items WHERE vo_id = ?`, vo.id);
    await dangNhapDuAn(pm2, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const res = await POST(
      jreq("/x", {
        decision: "partially_approved",
        lines: [{ id: line!.id, qtyApproved: 4 }],
      }),
      { params: Promise.resolve({ id: String(vo.id) }) },
    );
    assert.equal(res.status, 200);
    const updated = await queryOne<{ qty_approved: number }>(
      `SELECT qty_approved FROM boq_items WHERE id = ?`,
      line!.id,
    );
    assert.equal(Number(updated?.qty_approved), 4);
    const voRow = await queryOne<{ status: string }>(
      `SELECT status FROM variation_orders WHERE id = ?`,
      vo.id,
    );
    assert.equal(voRow?.status, "partially_approved");
  },
);

test(
  "POST /api/variations/:id/decide: VO không còn dòng KL nào (đã xoá tay) → 409",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("dnoline");
    const pm = await taoUser("pm", "dnoline");
    const pm2 = await taoUser("pm", "dnoline2");
    const vo = await taoVoDaTrinh(projectId, pm, "dnoline");
    await run(`DELETE FROM boq_items WHERE vo_id = ?`, vo.id);
    await dangNhapDuAn(pm2, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const res = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /không có dòng khối lượng nào/);
  },
);

test(
  "POST /api/variations/:id/decide: flow duyệt 2 cấp cấu hình → bước giữa trả pending, KHÔNG đụng qty_approved; bước cuối mới áp domain logic",
  S,
  async () => {
    // Bao phủ nhánh liveRequest/advanceApproval (M46 PR2) — flow do Admin cấu hình cho
    // entity_type='variation' của đúng dự án này, 2 bước: engineer rồi pm.
    const { insertId, queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("dflow");
    const creator = await taoUser("engineer", "dflowCreator");
    const approverEng = await taoUser("engineer", "dflowEng");
    const approverPm = await taoUser("pm", "dflowPm");
    const flowId = await insertId(
      `INSERT INTO approval_flows (project_id, entity_type, name, active) VALUES (?, 'variation', 'Flow VO test', true)`,
      projectId,
    );
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role) VALUES (?, 1, 'engineer')`,
      flowId,
    );
    await insertId(`INSERT INTO approval_steps (flow_id, seq, role) VALUES (?, 2, 'pm')`, flowId);

    const vo = await taoVoDaTrinh(projectId, creator, "dflow");

    // Bước 1: engineer khác người tạo duyệt → còn pending, chuyển seq=2/nextRole=pm.
    await dangNhapDuAn(approverEng, projectId);
    const { POST } = await import("@/app/api/variations/[id]/decide/route");
    const step1 = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    assert.equal(step1.status, 200);
    const body1 = await step1.json();
    assert.equal(body1.pending, true);
    assert.equal(body1.currentSeq, 2);
    assert.equal(body1.nextRole, "pm");
    // VO vẫn 'submitted' — domain logic (qty_approved/status) CHƯA chạy ở bước giữa.
    const midVo = await queryOne<{ status: string }>(
      `SELECT status FROM variation_orders WHERE id = ?`,
      vo.id,
    );
    assert.equal(midVo?.status, "submitted");
    const midLine = await queryOne<{ qty_approved: number | null }>(
      `SELECT qty_approved FROM boq_items WHERE vo_id = ?`,
      vo.id,
    );
    assert.equal(midLine?.qty_approved, null);

    // Bước 2 (cuối): pm duyệt → domain logic chạy thật, VO chuyển approved.
    await dangNhapDuAn(approverPm, projectId);
    const step2 = await POST(jreq("/x", { decision: "approved" }), {
      params: Promise.resolve({ id: String(vo.id) }),
    });
    assert.equal(step2.status, 200);
    const body2 = await step2.json();
    assert.equal(body2.pending, undefined);
    assert.equal(body2.decision, "approved");
    const finalVo = await queryOne<{ status: string }>(
      `SELECT status FROM variation_orders WHERE id = ?`,
      vo.id,
    );
    assert.equal(finalVo?.status, "approved");
    // Không xoá flow: approval_requests đã sinh ra tham chiếu flow_id (không ON DELETE),
    // xoá sẽ vi phạm FK — flow test chỉ dùng project_id riêng của ca này nên không ảnh
    // hưởng ca khác.
  },
);
