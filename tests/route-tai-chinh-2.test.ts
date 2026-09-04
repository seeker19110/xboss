import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm TÀI CHÍNH/PHÁP LÝ còn chưa có test — cùng
// khuôn với tests/route-tai-chinh.test.ts. Route:
//   - app/api/claims/route.ts               (GET/POST claim chi phí/EOT — M34)
//   - app/api/claims/[id]/route.ts          (GET/PATCH/DELETE 1 claim)
//   - app/api/insurance-bonds/route.ts      (GET/POST bảo hiểm/bảo lãnh — M28)
//   - app/api/insurance-bonds/[id]/route.ts (GET/PATCH/DELETE 1 bảo hiểm/bảo lãnh)
//   - app/api/legal-documents/route.ts      (GET/POST hồ sơ pháp lý — M23)
//   - app/api/legal-documents/[id]/route.ts (GET/PATCH/DELETE 1 hồ sơ pháp lý)
//   - app/api/env-permits/route.ts          (GET/POST giấy phép môi trường)
//   - app/api/env-permits/[id]/route.ts     (GET/PATCH/DELETE 1 giấy phép môi trường)
//   - app/api/certifications/route.ts       (GET/POST chứng chỉ nhân sự — M24)
//   - app/api/certifications/[id]/route.ts  (GET/PATCH/DELETE 1 chứng chỉ)
//
// Trọng tâm: 401/403 theo vai trò, cách ly dự án (đặc biệt route [id] có kèm file đính
// kèm — lớp lỗi rò rỉ xuyên dự án đã tìm thấy thật ở /api/documents/:id), validate định
// dạng ngày YYYY-MM-DD.

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `TC2 route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `tc2-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-tc2-route', ?, ?)`,
    `TC2 ${ten}`,
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

async function taoHopDong(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, project_id)
     VALUES (?, 'nhan_thau', ?, 'CĐT test', 0, ?)`,
    `HD-${uniq(ten)}`,
    `Hợp đồng ${ten}`,
    projectId,
  );
}

async function taoPersonnel(projectId: number, ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO personnel (project_id, full_name) VALUES (?, ?)`,
    projectId,
    `Nhân sự ${uniq(ten)}`,
  );
}

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// GET/POST /api/claims
// ============================================================================

test("GET /api/claims: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/claims/route");
  const res = await GET(jreq("/api/claims", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/claims: subcon không có quyền xem claim → 403", S, async () => {
  // viewClaims chỉ admin/pm/engineer/bch — subcon và cdt/viewer không được xem claim
  // (nhạy cảm thương mại, cùng nhóm với VO/thanh toán).
  const projectId = await taoDuAn("cl403");
  const sub = await taoUser("subcon", "cl403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/claims/route");
  const res = await GET(jreq("/api/claims", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/claims: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("clkind");
  const pm = await taoUser("pm", "clkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/claims/route");
  const res = await GET(jreq("/api/claims?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/claims: cách ly dự án — không thấy claim của dự án khác", S, async () => {
  const projectA = await taoDuAn("cliA");
  const projectB = await taoDuAn("cliB");
  const pmA = await taoUser("pm", "cliA");
  const pmB = await taoUser("pm", "cliB");
  await dangNhapDuAn(pmB, projectB);
  const { POST, GET } = await import("@/app/api/claims/route");
  const created = await POST(
    jreq("/api/claims", {
      kind: "cost",
      title: "Claim của B",
      noticeDate: "2026-01-01",
      cause: "Chờ mặt bằng",
      amountRequested: 1000,
    }),
  );
  assert.equal(created.status, 201);
  await dangNhapDuAn(pmA, projectA);
  const res = await GET(jreq("/api/claims", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).items, []);
});

test("POST /api/claims: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/claims/route");
  const res = await POST(jreq("/api/claims", {}));
  assert.equal(res.status, 401);
});

test("POST /api/claims: bch xem được nhưng KHÔNG được ghi nhận claim → 403", S, async () => {
  // manageClaims chỉ admin/pm/engineer — bch có viewClaims nhưng không có manageClaims.
  const projectId = await taoDuAn("clp403");
  const bch = await taoUser("bch", "clp403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/claims/route");
  const res = await POST(jreq("/api/claims", {}));
  assert.equal(res.status, 403);
});

test("POST /api/claims: claim chi phí thiếu amountRequested > 0 → 422", S, async () => {
  const projectId = await taoDuAn("clval");
  const pm = await taoUser("pm", "clval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/route");
  const res = await POST(
    jreq("/api/claims", {
      kind: "cost",
      title: "Thiếu tiền",
      noticeDate: "2026-01-01",
      cause: "Thay đổi thiết kế",
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/claims: claim EOT thiếu daysRequested > 0 → 422", S, async () => {
  const projectId = await taoDuAn("cleot");
  const pm = await taoUser("pm", "cleot");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/route");
  const res = await POST(
    jreq("/api/claims", {
      kind: "eot",
      title: "Thiếu số ngày",
      noticeDate: "2026-01-01",
      cause: "Chờ mặt bằng",
    }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/claims: hợp đồng gắn kèm không tồn tại → 422 (checkClaimRefs)", S, async () => {
  const projectId = await taoDuAn("clref");
  const pm = await taoUser("pm", "clref");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/route");
  const res = await POST(
    jreq("/api/claims", {
      kind: "cost",
      title: "HĐ ma",
      noticeDate: "2026-01-01",
      cause: "Chờ mặt bằng",
      amountRequested: 1000,
      contractId: 999999999,
    }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Hợp đồng gắn kèm không tồn tại/);
});

test(
  "POST /api/claims: engineer ghi nhận thành công — mã CLM- tự sinh, project_id do server suy",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("clok");
    const eng = await taoUser("engineer", "clok");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/claims/route");
    const res = await POST(
      jreq("/api/claims", {
        kind: "eot",
        title: "Chờ mặt bằng tầng 5",
        noticeDate: "2026-02-01",
        cause: "CĐT chưa bàn giao mặt bằng",
        daysRequested: 10,
        // projectId lạ cố tình gửi kèm — route KHÔNG được tin trường này.
        projectId: 999999,
      }),
    );
    assert.equal(res.status, 201);
    const { id, code } = await res.json();
    assert.match(code, /^CLM-/);
    const row = await queryOne<{ project_id: number }>(
      `SELECT project_id FROM claims WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
  },
);

// ============================================================================
// GET/PATCH/DELETE /api/claims/[id]
// ============================================================================

test("GET /api/claims/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/claims/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/claims/:id: subcon không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("clg403");
  const sub = await taoUser("subcon", "clg403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/claims/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("GET /api/claims/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("clgbad");
  const pm = await taoUser("pm", "clgbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/claims/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test(
  "GET /api/claims/:id: claim thuộc dự án khác → 404 (KHÔNG lặp lại lỗ hổng rò rỉ xuyên dự án)",
  S,
  async () => {
    // Đúng kịch bản đã gây bug thật ở /api/documents/:id: 2 dự án, claim ở B, user ở A.
    const projectA = await taoDuAn("clgisoA");
    const projectB = await taoDuAn("clgisoB");
    const pmA = await taoUser("pm", "clgisoA");
    const pmB = await taoUser("pm", "clgisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/claims/route");
    const created = await POST(
      jreq("/api/claims", {
        kind: "cost",
        title: "Claim B",
        noticeDate: "2026-01-01",
        cause: "Điều kiện công trường",
        amountRequested: 5000,
      }),
    );
    const { id: claimId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/claims/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(claimId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/claims/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/claims/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/claims/:id: không tìm thấy (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("clpisoA");
  const projectB = await taoDuAn("clpisoB");
  const pmA = await taoUser("pm", "clpisoA");
  const pmB = await taoUser("pm", "clpisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/claims/route");
  const created = await POST(
    jreq("/api/claims", {
      kind: "cost",
      title: "Claim B",
      noticeDate: "2026-01-01",
      cause: "Điều kiện công trường",
      amountRequested: 5000,
    }),
  );
  const { id: claimId } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/claims/[id]/route");
  const res = await PATCH(jreq("/x", { title: "Sửa lén" }, "PATCH"), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/claims/:id: chốt/từ chối phải qua /settle /reject — status='settled' bị chặn ở PATCH",
  S,
  async () => {
    const projectId = await taoDuAn("clsettle");
    const pm = await taoUser("pm", "clsettle");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/claims/route");
    const created = await POST(
      jreq("/api/claims", {
        kind: "cost",
        title: "Claim chờ chốt",
        noticeDate: "2026-01-01",
        cause: "Chờ mặt bằng",
        amountRequested: 2000,
      }),
    );
    const { id: claimId } = await created.json();

    const { PATCH } = await import("@/app/api/claims/[id]/route");
    const res = await PATCH(jreq("/x", { status: "settled" }, "PATCH"), {
      params: Promise.resolve({ id: String(claimId) }),
    });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /\/settle|\/reject/);
  },
);

test(
  "PATCH /api/claims/:id: claim khác người tạo — engineer không phải Admin/PM/người tạo → 403",
  S,
  async () => {
    // canEditClaim: chỉ người tạo hoặc Admin/PM được sửa — engineer khác không được.
    const projectId = await taoDuAn("clowner");
    const eng1 = await taoUser("engineer", "clowner1");
    const eng2 = await taoUser("engineer", "clowner2");
    await dangNhapDuAn(eng1, projectId);
    const { POST } = await import("@/app/api/claims/route");
    const created = await POST(
      jreq("/api/claims", {
        kind: "cost",
        title: "Claim của eng1",
        noticeDate: "2026-01-01",
        cause: "Điều kiện công trường",
        amountRequested: 3000,
      }),
    );
    const { id: claimId } = await created.json();

    await dangNhapDuAn(eng2, projectId);
    const { PATCH } = await import("@/app/api/claims/[id]/route");
    const res = await PATCH(jreq("/x", { title: "Sửa của người khác" }, "PATCH"), {
      params: Promise.resolve({ id: String(claimId) }),
    });
    assert.equal(res.status, 403);
  },
);

test("DELETE /api/claims/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/claims/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/claims/:id: thành công → soft-delete (deleted_at được set)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cldelok");
  const pm = await taoUser("pm", "cldelok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/claims/route");
  const created = await POST(
    jreq("/api/claims", {
      kind: "cost",
      title: "Claim sẽ xoá",
      noticeDate: "2026-01-01",
      cause: "Điều kiện công trường",
      amountRequested: 1500,
    }),
  );
  const { id: claimId } = await created.json();

  const { DELETE } = await import("@/app/api/claims/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(claimId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM claims WHERE id = ?`,
    claimId,
  );
  assert.ok(row?.deleted_at != null);
});

// ============================================================================
// GET/POST /api/insurance-bonds
// ============================================================================

test("GET /api/insurance-bonds: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/insurance-bonds/route");
  const res = await GET(jreq("/api/insurance-bonds", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/insurance-bonds: engineer không có quyền xem (viewPayments) → 403", S, async () => {
  const projectId = await taoDuAn("ib403");
  const eng = await taoUser("engineer", "ib403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/insurance-bonds/route");
  const res = await GET(jreq("/api/insurance-bonds", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/insurance-bonds: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("ibkind");
  const pm = await taoUser("pm", "ibkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/insurance-bonds/route");
  const res = await GET(jreq("/api/insurance-bonds?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/insurance-bonds: chưa chọn dự án → trả rỗng (không lỗi 500)", S, async () => {
  // visibleProjectIds chỉ trả rỗng cho user chưa gán khi bảng user_projects đã có
  // dòng khác (không rỗng toàn hệ thống) — gán một user KHÁC để đảm bảo pm dưới đây
  // thấy đúng "không có dự án nào", bất kể thứ tự chạy các test khác trong tiến trình.
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("ibnoprojOwner");
  const pm = await taoUser("pm", "ibnoproj");
  const other = await taoUser("pm", "ibnoprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { GET } = await import("@/app/api/insurance-bonds/route");
    const res = await GET(jreq("/api/insurance-bonds", undefined, "GET"));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).bonds, []);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/insurance-bonds: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const res = await POST(jreq("/api/insurance-bonds", {}));
  assert.equal(res.status, 401);
});

test(
  "POST /api/insurance-bonds: pm(bch)/engineer không được tạo (chỉ Admin/PM) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ibp403");
    const bch = await taoUser("bch", "ibp403");
    await dangNhapDuAn(bch, projectId);
    const { POST } = await import("@/app/api/insurance-bonds/route");
    const res = await POST(jreq("/api/insurance-bonds", {}));
    assert.equal(res.status, 403);
  },
);

test("POST /api/insurance-bonds: ngày hết hạn sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("ibdate");
  const pm = await taoUser("pm", "ibdate");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const res = await POST(
    jreq("/api/insurance-bonds", {
      kind: "car",
      title: "Bảo hiểm công trình",
      expiryDate: "31/12/2026", // sai định dạng — phải là YYYY-MM-DD
    }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /YYYY-MM-DD/);
});

test("POST /api/insurance-bonds: ngày cấp sau ngày hết hạn → 422", S, async () => {
  const projectId = await taoDuAn("ibdateorder");
  const pm = await taoUser("pm", "ibdateorder");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const res = await POST(
    jreq("/api/insurance-bonds", {
      kind: "car",
      title: "Bảo hiểm ngày ngược",
      issuedDate: "2026-06-01",
      expiryDate: "2026-01-01",
    }),
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/insurance-bonds: hợp đồng gắn kèm thuộc dự án KHÁC → 422 (không cho gán chéo dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("ibrefA");
    const projectB = await taoDuAn("ibrefB");
    const pmA = await taoUser("pm", "ibrefA");
    const contractB = await taoHopDong(projectB, "ibrefB");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/insurance-bonds/route");
    const res = await POST(
      jreq("/api/insurance-bonds", {
        kind: "bao_lanh_thuc_hien",
        title: "Bảo lãnh chéo dự án",
        contractId: contractB,
      }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /không thuộc dự án/);
  },
);

test("POST /api/insurance-bonds: tạo thành công → project_id do server suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ibok");
  const pm = await taoUser("pm", "ibok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const res = await POST(
    jreq("/api/insurance-bonds", {
      kind: "tnbt",
      title: "Bảo hiểm trách nhiệm bên thứ ba",
      projectId: 999999, // client gửi kèm — route không được tin
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM insurance_bonds WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/insurance-bonds/[id]
// ============================================================================

test("GET /api/insurance-bonds/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/insurance-bonds/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "GET /api/insurance-bonds/:id: bảo hiểm/bảo lãnh thuộc dự án khác → 404 (cách ly dự án — kịch bản 2 dự án)",
  S,
  async () => {
    // Route tra "WHERE b.id = ? AND b.project_id = ?" — kiểm chắc chắn không lộ như
    // lỗ hổng đã tìm thấy ở /api/documents/:id (chỉ tra theo id).
    const projectA = await taoDuAn("ibgisoA");
    const projectB = await taoDuAn("ibgisoB");
    const pmA = await taoUser("pm", "ibgisoA");
    const pmB = await taoUser("pm", "ibgisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/insurance-bonds/route");
    const created = await POST(jreq("/api/insurance-bonds", { kind: "car", title: "Bảo hiểm B" }));
    const { id: bondId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/insurance-bonds/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(bondId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/insurance-bonds/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/insurance-bonds/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/insurance-bonds/:id: không tìm thấy (dự án khác) → 404, không sửa lén được",
  S,
  async () => {
    const projectA = await taoDuAn("ibpisoA");
    const projectB = await taoDuAn("ibpisoB");
    const pmA = await taoUser("pm", "ibpisoA");
    const pmB = await taoUser("pm", "ibpisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/insurance-bonds/route");
    const created = await POST(jreq("/api/insurance-bonds", { kind: "car", title: "Bảo hiểm B" }));
    const { id: bondId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { PATCH } = await import("@/app/api/insurance-bonds/[id]/route");
    const res = await PATCH(jreq("/x", { title: "Sửa lén" }, "PATCH"), {
      params: Promise.resolve({ id: String(bondId) }),
    });
    assert.equal(res.status, 404);
  },
);

test(
  "PATCH /api/insurance-bonds/:id: field không gửi giữ nguyên giá trị cũ (merge)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("ibmerge");
    const pm = await taoUser("pm", "ibmerge");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/insurance-bonds/route");
    const created = await POST(
      jreq("/api/insurance-bonds", {
        kind: "car",
        title: "Bảo hiểm gốc",
        provider: "Bảo Việt",
      }),
    );
    const { id: bondId } = await created.json();

    const { PATCH } = await import("@/app/api/insurance-bonds/[id]/route");
    const res = await PATCH(jreq("/x", { value: 500000000 }, "PATCH"), {
      params: Promise.resolve({ id: String(bondId) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ title: string; provider: string; value: number }>(
      `SELECT title, provider, value FROM insurance_bonds WHERE id = ?`,
      bondId,
    );
    assert.equal(row?.title, "Bảo hiểm gốc");
    assert.equal(row?.provider, "Bảo Việt");
    assert.equal(Number(row?.value), 500000000);
  },
);

test("DELETE /api/insurance-bonds/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/insurance-bonds/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test(
  "DELETE /api/insurance-bonds/:id: engineer không được xoá (chỉ Admin/PM) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ibdel403");
    const eng = await taoUser("engineer", "ibdel403");
    await dangNhapDuAn(eng, projectId);
    const { DELETE } = await import("@/app/api/insurance-bonds/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: "1" }),
    });
    assert.equal(res.status, 403);
  },
);

test("DELETE /api/insurance-bonds/:id: thành công → soft-delete", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ibdelok");
  const pm = await taoUser("pm", "ibdelok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const created = await POST(jreq("/api/insurance-bonds", { kind: "car", title: "Xoá tôi" }));
  const { id: bondId } = await created.json();

  const { DELETE } = await import("@/app/api/insurance-bonds/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(bondId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ deleted_at: string | null }>(
    `SELECT deleted_at FROM insurance_bonds WHERE id = ?`,
    bondId,
  );
  assert.ok(row?.deleted_at != null);
});

// ============================================================================
// GET/POST /api/legal-documents
// ============================================================================

test("GET /api/legal-documents: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/legal-documents/route");
  const res = await GET(jreq("/api/legal-documents", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/legal-documents: mọi vai trò đăng nhập đều xem được (subcon)", S, async () => {
  const projectId = await taoDuAn("ldview");
  const sub = await taoUser("subcon", "ldview");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/legal-documents/route");
  const res = await GET(jreq("/api/legal-documents", undefined, "GET"));
  assert.equal(res.status, 200);
});

test("GET /api/legal-documents: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("ldkind");
  const pm = await taoUser("pm", "ldkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/legal-documents/route");
  const res = await GET(jreq("/api/legal-documents?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/legal-documents: cách ly dự án — không thấy hồ sơ của dự án khác", S, async () => {
  const projectA = await taoDuAn("ldisoA");
  const projectB = await taoDuAn("ldisoB");
  const pmA = await taoUser("pm", "ldisoA");
  const pmB = await taoUser("pm", "ldisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/legal-documents/route");
  await POST(jreq("/api/legal-documents", { kind: "giay_phep_xd", title: "GPXD của B" }));
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/legal-documents/route");
  const res = await GET(jreq("/api/legal-documents", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).documents, []);
});

test(
  "POST /api/legal-documents: subcon không được tạo (chỉ Admin/PM — manageKickoff) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ldp403");
    const sub = await taoUser("subcon", "ldp403");
    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/legal-documents/route");
    const res = await POST(jreq("/api/legal-documents", {}));
    assert.equal(res.status, 403);
  },
);

test("POST /api/legal-documents: ngày hết hạn sai định dạng → 422", S, async () => {
  // Lưu ý: DATE_RE chỉ kiểm HÌNH DẠNG chuỗi (\d{4}-\d{2}-\d{2}), không kiểm ngày có
  // thực trong lịch hay không — dùng chuỗi sai HÌNH DẠNG (không khớp regex) ở đây để
  // test đúng đường 422 hiện có; xem BÁO CÁO CUỐI về trường hợp "đúng hình dạng nhưng
  // không phải ngày thật" (vd 2026-13-40) lọt qua validate và vỡ ở tầng DB.
  const projectId = await taoDuAn("lddate");
  const pm = await taoUser("pm", "lddate");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/legal-documents/route");
  const res = await POST(
    jreq("/api/legal-documents", {
      kind: "giay_phep_xd",
      title: "GPXD",
      expiryDate: "40/13/2026",
    }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /YYYY-MM-DD/);
});

test("POST /api/legal-documents: tạo thành công → project_id do server suy", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ldok");
  const pm = await taoUser("pm", "ldok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/legal-documents/route");
  const res = await POST(
    jreq("/api/legal-documents", {
      kind: "phe_duyet_qh",
      title: "Phê duyệt quy hoạch 1/500",
      projectId: 999999,
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number }>(
    `SELECT project_id FROM legal_documents WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
});

// ============================================================================
// GET/PATCH/DELETE /api/legal-documents/[id]
// ============================================================================

test(
  "GET /api/legal-documents/:id: hồ sơ pháp lý thuộc dự án khác → 404 (kịch bản 2 dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("ldgisoA");
    const projectB = await taoDuAn("ldgisoB");
    const pmA = await taoUser("pm", "ldgisoA");
    const pmB = await taoUser("pm", "ldgisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/legal-documents/route");
    const created = await POST(
      jreq("/api/legal-documents", { kind: "giay_phep_xd", title: "GPXD của B" }),
    );
    const { id: docId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/legal-documents/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 404);
  },
);

test(
  "PATCH /api/legal-documents/:id: engineer không được sửa (chỉ Admin/PM) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ldp2_403");
    const eng = await taoUser("engineer", "ldp2_403");
    await dangNhapDuAn(eng, projectId);
    const { PATCH } = await import("@/app/api/legal-documents/[id]/route");
    const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
    assert.equal(res.status, 403);
  },
);

test(
  "PATCH /api/legal-documents/:id: không tìm thấy (dự án khác) → 404, không sửa lén",
  S,
  async () => {
    const projectA = await taoDuAn("ldpisoA");
    const projectB = await taoDuAn("ldpisoB");
    const pmA = await taoUser("pm", "ldpisoA");
    const pmB = await taoUser("pm", "ldpisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/legal-documents/route");
    const created = await POST(
      jreq("/api/legal-documents", { kind: "giay_phep_xd", title: "GPXD của B" }),
    );
    const { id: docId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { PATCH } = await import("@/app/api/legal-documents/[id]/route");
    const res = await PATCH(jreq("/x", { title: "Sửa lén" }, "PATCH"), {
      params: Promise.resolve({ id: String(docId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("DELETE /api/legal-documents/:id: thành công → xoá cứng khỏi DB", S, async () => {
  // Khác claims/insurance-bonds: legal_documents KHÔNG có deleted_at (không soft-delete).
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("lddelok");
  const pm = await taoUser("pm", "lddelok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/legal-documents/route");
  const created = await POST(jreq("/api/legal-documents", { kind: "khac", title: "Xoá tôi" }));
  const { id: docId } = await created.json();

  const { DELETE } = await import("@/app/api/legal-documents/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(docId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM legal_documents WHERE id = ?`, docId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/env-permits
// ============================================================================

test("GET /api/env-permits: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/env-permits/route");
  const res = await GET(jreq("/api/env-permits", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/env-permits: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("epkind");
  const pm = await taoUser("pm", "epkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/env-permits/route");
  const res = await GET(jreq("/api/env-permits?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/env-permits: cách ly dự án — không thấy giấy phép của dự án khác", S, async () => {
  const projectA = await taoDuAn("episoA");
  const projectB = await taoDuAn("episoB");
  const pmA = await taoUser("pm", "episoA");
  const pmB = await taoUser("pm", "episoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/env-permits/route");
  await POST(jreq("/api/env-permits", { kind: "dtm", title: "ĐTM của B" }));
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/env-permits/route");
  const res = await GET(jreq("/api/env-permits", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).permits, []);
});

test("POST /api/env-permits: subcon không được tạo (chỉ Admin/PM/kỹ sư) → 403", S, async () => {
  const projectId = await taoDuAn("epp403");
  const sub = await taoUser("subcon", "epp403");
  await dangNhapDuAn(sub, projectId);
  const { POST } = await import("@/app/api/env-permits/route");
  const res = await POST(jreq("/api/env-permits", {}));
  assert.equal(res.status, 403);
});

test("POST /api/env-permits: engineer tạo được (manageEnv gồm kỹ sư)", S, async () => {
  const projectId = await taoDuAn("epeng");
  const eng = await taoUser("engineer", "epeng");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/env-permits/route");
  const res = await POST(
    jreq("/api/env-permits", { kind: "giay_phep_mt", title: "Giấy phép môi trường" }),
  );
  assert.equal(res.status, 201);
});

test("POST /api/env-permits: ngày cấp sau ngày hết hạn → 422", S, async () => {
  const projectId = await taoDuAn("epdateorder");
  const pm = await taoUser("pm", "epdateorder");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/env-permits/route");
  const res = await POST(
    jreq("/api/env-permits", {
      kind: "dtm",
      title: "ĐTM ngày ngược",
      issuedDate: "2026-06-01",
      expiryDate: "2026-01-01",
    }),
  );
  assert.equal(res.status, 422);
});

// ============================================================================
// GET/PATCH/DELETE /api/env-permits/[id]
// ============================================================================

test(
  "GET /api/env-permits/:id: giấy phép thuộc dự án khác → 404 (kịch bản 2 dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("epgisoA");
    const projectB = await taoDuAn("epgisoB");
    const pmA = await taoUser("pm", "epgisoA");
    const pmB = await taoUser("pm", "epgisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/env-permits/route");
    const created = await POST(jreq("/api/env-permits", { kind: "dtm", title: "ĐTM của B" }));
    const { id: permitId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/env-permits/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(permitId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/env-permits/:id: subcon không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("epp2_403");
  const sub = await taoUser("subcon", "epp2_403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/env-permits/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test(
  "PATCH /api/env-permits/:id: không tìm thấy (dự án khác) → 404, không sửa lén",
  S,
  async () => {
    const projectA = await taoDuAn("eppisoA");
    const projectB = await taoDuAn("eppisoB");
    const pmA = await taoUser("pm", "eppisoA");
    const pmB = await taoUser("pm", "eppisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/env-permits/route");
    const created = await POST(jreq("/api/env-permits", { kind: "dtm", title: "ĐTM của B" }));
    const { id: permitId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { PATCH } = await import("@/app/api/env-permits/[id]/route");
    const res = await PATCH(jreq("/x", { title: "Sửa lén" }, "PATCH"), {
      params: Promise.resolve({ id: String(permitId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("DELETE /api/env-permits/:id: engineer xoá được (manageEnv gồm kỹ sư)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("epdelok");
  const eng = await taoUser("engineer", "epdelok");
  await dangNhapDuAn(eng, projectId);
  const { POST } = await import("@/app/api/env-permits/route");
  const created = await POST(jreq("/api/env-permits", { kind: "dtm", title: "Xoá tôi" }));
  const { id: permitId } = await created.json();

  const { DELETE } = await import("@/app/api/env-permits/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(permitId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM env_permits WHERE id = ?`, permitId);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/certifications
// ============================================================================

test("GET /api/certifications: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/certifications/route");
  const res = await GET(jreq("/api/certifications", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/certifications: chưa chọn dự án → trả rỗng (không lỗi 500)", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("certnoprojOwner");
  const pm = await taoUser("pm", "certnoproj");
  const other = await taoUser("pm", "certnoprojOther");
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    await dangNhapDuAn(pm, null);
    const { GET } = await import("@/app/api/certifications/route");
    const res = await GET(jreq("/api/certifications", undefined, "GET"));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).certifications, []);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test(
  "GET /api/certifications: cách ly dự án — không thấy chứng chỉ của dự án khác",
  S,
  async () => {
    const projectA = await taoDuAn("certisoA");
    const projectB = await taoDuAn("certisoB");
    const pmA = await taoUser("pm", "certisoA");
    const pmB = await taoUser("pm", "certisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/certifications/route");
    await POST(jreq("/api/certifications", { kind: "An toàn lao động" }));
    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/certifications/route");
    const res = await GET(jreq("/api/certifications", undefined, "GET"));
    assert.equal(res.status, 200);
    assert.deepEqual((await res.json()).certifications, []);
  },
);

test(
  "POST /api/certifications: engineer không được tạo (chỉ Admin/PM — manageHr) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("certp403");
    const eng = await taoUser("engineer", "certp403");
    await dangNhapDuAn(eng, projectId);
    const { POST } = await import("@/app/api/certifications/route");
    const res = await POST(jreq("/api/certifications", {}));
    assert.equal(res.status, 403);
  },
);

test("POST /api/certifications: thiếu loại chứng chỉ → 422", S, async () => {
  const projectId = await taoDuAn("certval");
  const pm = await taoUser("pm", "certval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/certifications/route");
  const res = await POST(jreq("/api/certifications", { expiryDate: "2027-01-01" }));
  assert.equal(res.status, 422);
});

test("POST /api/certifications: ngày hết hạn sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("certdate");
  const pm = await taoUser("pm", "certdate");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/certifications/route");
  const res = await POST(
    jreq("/api/certifications", { kind: "An toàn lao động", expiryDate: "01-01-2027" }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /YYYY-MM-DD/);
});

test(
  "POST /api/certifications: gán nhân sự thuộc dự án KHÁC → 422 (không cho gán chéo dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("certrefA");
    const projectB = await taoDuAn("certrefB");
    const pmA = await taoUser("pm", "certrefA");
    const personnelB = await taoPersonnel(projectB, "certrefB");
    await dangNhapDuAn(pmA, projectA);
    const { POST } = await import("@/app/api/certifications/route");
    const res = await POST(
      jreq("/api/certifications", { kind: "An toàn lao động", personnelId: personnelB }),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /Không tìm thấy nhân sự/);
  },
);

test("POST /api/certifications: tạo thành công gắn đúng nhân sự cùng dự án", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("certok");
  const pm = await taoUser("pm", "certok");
  const personnelId = await taoPersonnel(projectId, "certok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/certifications/route");
  const res = await POST(
    jreq("/api/certifications", {
      kind: "Chứng chỉ hàn",
      personnelId,
      projectId: 999999, // không được tin
    }),
  );
  assert.equal(res.status, 201);
  const { id } = await res.json();
  const row = await queryOne<{ project_id: number; personnel_id: number }>(
    `SELECT project_id, personnel_id FROM certifications WHERE id = ?`,
    id,
  );
  assert.equal(row?.project_id, projectId);
  assert.equal(row?.personnel_id, personnelId);
});

// ============================================================================
// GET/PATCH/DELETE /api/certifications/[id]
// ============================================================================

test(
  "GET /api/certifications/:id: chứng chỉ thuộc dự án khác → 404 (kịch bản 2 dự án)",
  S,
  async () => {
    const projectA = await taoDuAn("certgisoA");
    const projectB = await taoDuAn("certgisoB");
    const pmA = await taoUser("pm", "certgisoA");
    const pmB = await taoUser("pm", "certgisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/certifications/route");
    const created = await POST(jreq("/api/certifications", { kind: "Chứng chỉ của B" }));
    const { id: certId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/certifications/[id]/route");
    const res = await GET(jreq("/x", undefined, "GET"), {
      params: Promise.resolve({ id: String(certId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("PATCH /api/certifications/:id: engineer không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("certp2_403");
  const eng = await taoUser("engineer", "certp2_403");
  await dangNhapDuAn(eng, projectId);
  const { PATCH } = await import("@/app/api/certifications/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test(
  "PATCH /api/certifications/:id: không tìm thấy (dự án khác) → 404, không sửa lén",
  S,
  async () => {
    const projectA = await taoDuAn("certpisoA");
    const projectB = await taoDuAn("certpisoB");
    const pmA = await taoUser("pm", "certpisoA");
    const pmB = await taoUser("pm", "certpisoB");
    await dangNhapDuAn(pmB, projectB);
    const { POST } = await import("@/app/api/certifications/route");
    const created = await POST(jreq("/api/certifications", { kind: "Chứng chỉ của B" }));
    const { id: certId } = await created.json();

    await dangNhapDuAn(pmA, projectA);
    const { PATCH } = await import("@/app/api/certifications/[id]/route");
    const res = await PATCH(jreq("/x", { kind: "Sửa lén" }, "PATCH"), {
      params: Promise.resolve({ id: String(certId) }),
    });
    assert.equal(res.status, 404);
  },
);

test("DELETE /api/certifications/:id: thành công → xoá cứng khỏi DB", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("certdelok");
  const pm = await taoUser("pm", "certdelok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/certifications/route");
  const created = await POST(jreq("/api/certifications", { kind: "Xoá tôi" }));
  const { id: certId } = await created.json();

  const { DELETE } = await import("@/app/api/certifications/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(certId) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM certifications WHERE id = ?`, certId);
  assert.equal(row, undefined);
});
