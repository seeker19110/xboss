import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm QUẢN TRỊ HỆ THỐNG (Admin) — bám khuôn
// tests/route-tai-chinh.test.ts. Bề mặt cấu hình toàn hệ, rủi ro cao nếu phân quyền/
// validate hở: sai một chỗ là lộ/ghi đè cấu hình toàn hệ thống. Route phủ:
//   - app/api/admin/feature-flags/route.ts
//   - app/api/admin/role-permissions/route.ts
//   - app/api/admin/webhooks/route.ts + [id]/route.ts + [id]/test/route.ts
//   - app/api/admin/integrations/route.ts
//   - app/api/admin/code-lists/route.ts
//   - app/api/admin/custom-fields/route.ts + [id]/route.ts
//   - app/api/admin/alert-rules/route.ts + [id]/route.ts
//   - app/api/admin/approval-flows/route.ts + [id]/route.ts

const S = { skip: !HAS_TEST_DB };

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/email/domain khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

/** Tạo 1 tổ chức (organizations) mới — dùng cho test cô lập tenant (org mặc định = 1). */
async function taoToChuc(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org ${uniq(ten)}`);
}

async function taoDuAn(ten: string, orgId = 1): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
    `AD route ${uniq(ten)}`,
    orgId,
  );
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string; orgId: number }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `ad-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-ad-route', ?, ?)`,
    `AD ${ten}`,
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

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// GET/PATCH /api/admin/feature-flags
// ============================================================================

test("GET /api/admin/feature-flags: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/feature-flags/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/feature-flags: engineer không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("ffeng");
  const eng = await taoUser("engineer", "ffeng");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/admin/feature-flags/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/feature-flags: PM ĐƯỢC xem ma trận (viewFeatureFlags cho pm)", S, async () => {
  // Bất biến: GET là read-only cho Admin/PM (comment route ghi rõ "Admin/PM xem"); PATCH
  // mới là quyền chỉ Admin — khác nhau, không được nhầm hai quyền này với nhau.
  const projectId = await taoDuAn("ffpm");
  const pm = await taoUser("pm", "ffpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/feature-flags/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { modules, projects } = await res.json();
  assert.ok(Array.isArray(modules) && modules.some((m: { key: string }) => m.key === "tracking"));
  assert.ok(projects.some((p: { projectId: number }) => p.projectId === projectId));
});

test("PATCH /api/admin/feature-flags: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/admin/feature-flags/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"));
  assert.equal(res.status, 401);
});

test("PATCH /api/admin/feature-flags: PM không được sửa (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("ffpmpatch");
  const pm = await taoUser("pm", "ffpmpatch");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/admin/feature-flags/route");
  const res = await PATCH(
    jreq("/x", { moduleKey: "tracking", projectId, enabled: false }, "PATCH"),
  );
  assert.equal(res.status, 403);
});

test("PATCH /api/admin/feature-flags: module không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("ffbadmod");
  const admin = await taoUser("admin", "ffbadmod");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/feature-flags/route");
  const res = await PATCH(
    jreq("/x", { moduleKey: "khong_ton_tai", projectId, enabled: false }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/admin/feature-flags: projectId không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("ffbadproj");
  const admin = await taoUser("admin", "ffbadproj");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/feature-flags/route");
  const res = await PATCH(
    jreq("/x", { moduleKey: "tracking", projectId: "abc", enabled: false }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/admin/feature-flags: enabled không phải boolean → 422", S, async () => {
  const projectId = await taoDuAn("ffbadenabled");
  const admin = await taoUser("admin", "ffbadenabled");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/feature-flags/route");
  const res = await PATCH(
    jreq("/x", { moduleKey: "tracking", projectId, enabled: "khong-phai-bool" }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/admin/feature-flags: bật/tắt đúng phạm vi 1 module cho 1 dự án cụ thể, không ảnh hưởng dự án khác",
  S,
  async () => {
    // Bất biến nghiệp vụ: cờ tính năng lưu theo TỪNG dự án — tắt cho dự án A không được
    // làm ảnh hưởng dự án B (khớp comment lib/ha-tang/feature-flags.ts).
    const projectA = await taoDuAn("ffscopeA");
    const projectB = await taoDuAn("ffscopeB");
    const admin = await taoUser("admin", "ffscope");
    await dangNhapDuAn(admin, projectA);
    const { PATCH } = await import("@/app/api/admin/feature-flags/route");
    const res = await PATCH(
      jreq("/x", { moduleKey: "tracking", projectId: projectA, enabled: false }, "PATCH"),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      moduleKey: "tracking",
      projectId: projectA,
      enabled: false,
    });

    const { isModuleEnabled } = await import("@/lib/ha-tang/feature-flags");
    assert.equal(await isModuleEnabled("tracking", projectA), false);
    assert.equal(await isModuleEnabled("tracking", projectB), true);
  },
);

// ============================================================================
// GET/PATCH /api/admin/role-permissions
// ============================================================================

test("GET /api/admin/role-permissions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/role-permissions/route");
  const res = await GET(jreq("/api/admin/role-permissions", undefined, "GET"));
  assert.equal(res.status, 401);
});

test(
  "GET /api/admin/role-permissions: PM không có quyền (chỉ Admin, manageUsers) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("rppm");
    const pm = await taoUser("pm", "rppm");
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/admin/role-permissions/route");
    const res = await GET(jreq("/api/admin/role-permissions", undefined, "GET"));
    assert.equal(res.status, 403);
  },
);

test("GET /api/admin/role-permissions: projectId lạ (không tồn tại) → 422", S, async () => {
  const projectId = await taoDuAn("rpbadproj");
  const admin = await taoUser("admin", "rpbadproj");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/role-permissions/route");
  const res = await GET(jreq("/api/admin/role-permissions?projectId=999999999", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/admin/role-permissions: trả đủ roles/perms/lockedPerms/defaults", S, async () => {
  const projectId = await taoDuAn("rpok");
  const admin = await taoUser("admin", "rpok");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/role-permissions/route");
  const res = await GET(jreq("/api/admin/role-permissions", undefined, "GET"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.roles) && body.roles.includes("admin"));
  assert.ok(Array.isArray(body.perms) && body.perms.length > 0);
  assert.ok(Array.isArray(body.lockedPerms));
  // manageUsers là quyền ghi → phải nằm trong lockedPerms (không được mở qua ma trận).
  assert.ok(body.lockedPerms.includes("manageUsers"));
});

test("PATCH /api/admin/role-permissions: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"));
  assert.equal(res.status, 401);
});

test("PATCH /api/admin/role-permissions: PM không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("rppatchpm");
  const pm = await taoUser("pm", "rppatchpm");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  const res = await PATCH(
    jreq("/x", { role: "engineer", permKey: "viewFeatureFlags", allowed: true }, "PATCH"),
  );
  assert.equal(res.status, 403);
});

test("PATCH /api/admin/role-permissions: allowed không phải true/false/null → 400", S, async () => {
  const projectId = await taoDuAn("rpbadallowed");
  const admin = await taoUser("admin", "rpbadallowed");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  const res = await PATCH(
    jreq("/x", { role: "engineer", permKey: "viewFeatureFlags", allowed: "x" }, "PATCH"),
  );
  assert.equal(res.status, 400);
});

test("PATCH /api/admin/role-permissions: vai trò không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("rpbadrole");
  const admin = await taoUser("admin", "rpbadrole");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  const res = await PATCH(
    jreq("/x", { role: "khong_ton_tai", permKey: "viewFeatureFlags", allowed: false }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test("PATCH /api/admin/role-permissions: mã quyền không tồn tại → 422", S, async () => {
  const projectId = await taoDuAn("rpbadperm");
  const admin = await taoUser("admin", "rpbadperm");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  const res = await PATCH(
    jreq("/x", { role: "engineer", permKey: "khong_ton_tai", allowed: false }, "PATCH"),
  );
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/admin/role-permissions: KHÔNG cho phép MỞ quyền ghi (LOCKED_PERMS) qua ma trận → 422",
  S,
  async () => {
    // Bất biến bảo mật cốt lõi: quyền ghi (manageXxx) chỉ được SIẾT hoặc để mặc định —
    // không admin nào được vô tình cấp quyền ghi cho vai trò thấp hơn qua ma trận UI.
    const projectId = await taoDuAn("rplockopen");
    const admin = await taoUser("admin", "rplockopen");
    await dangNhapDuAn(admin, projectId);
    const { PATCH } = await import("@/app/api/admin/role-permissions/route");
    const res = await PATCH(
      jreq("/x", { role: "engineer", permKey: "manageFeatureFlags", allowed: true }, "PATCH"),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /chỉ được siết/);
  },
);

test(
  "PATCH /api/admin/role-permissions: chống tự khoá — admin không được tự siết manageUsers của chính admin → 422",
  S,
  async () => {
    // Nếu cho qua, PATCH này khoá mọi admin ra khỏi hệ thống (kể cả trang ma trận này) —
    // chỉ sửa lại được bằng cách vào thẳng DB. Đây là bất biến chống tự khoá hệ thống.
    const projectId = await taoDuAn("rpselflock");
    const admin = await taoUser("admin", "rpselflock");
    await dangNhapDuAn(admin, projectId);
    const { PATCH } = await import("@/app/api/admin/role-permissions/route");
    const res = await PATCH(
      jreq("/x", { role: "admin", permKey: "manageUsers", allowed: false }, "PATCH"),
    );
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /tự khoá/);
  },
);

test(
  "PATCH /api/admin/role-permissions: projectId số nhưng dự án không tồn tại → 422",
  S,
  async () => {
    const projectId = await taoDuAn("rpprojnotexist");
    const admin = await taoUser("admin", "rpprojnotexist");
    await dangNhapDuAn(admin, projectId);
    const { PATCH } = await import("@/app/api/admin/role-permissions/route");
    const res = await PATCH(
      jreq(
        "/x",
        { role: "engineer", permKey: "viewFeatureFlags", allowed: true, projectId: 999999999 },
        "PATCH",
      ),
    );
    assert.equal(res.status, 422);
  },
);

test(
  "PATCH /api/admin/role-permissions: mở quyền XEM (view*) cho 1 vai trò KHÔNG ảnh hưởng vai trò khác",
  S,
  async () => {
    // Bất biến: đổi quyền của 1 (role, permKey) không được rò rỉ sang role khác — kiểm
    // thẳng qua GET sau khi ghi override.
    const projectId = await taoDuAn("rpisolate");
    const admin = await taoUser("admin", "rpisolate");
    await dangNhapDuAn(admin, projectId);
    const { PATCH, GET } = await import("@/app/api/admin/role-permissions/route");
    const res = await PATCH(
      jreq("/x", { role: "engineer", permKey: "viewFeatureFlags", allowed: true }, "PATCH"),
    );
    assert.equal(res.status, 200);

    const ds = await GET(jreq("/api/admin/role-permissions", undefined, "GET"));
    const { overrides } = await ds.json();
    const eng = overrides.find(
      (o: { role: string; permKey: string }) =>
        o.role === "engineer" && o.permKey === "viewFeatureFlags",
    );
    assert.equal(eng?.allowed, true);
    const others = overrides.filter(
      (o: { role: string; permKey: string }) =>
        o.permKey === "viewFeatureFlags" && o.role !== "engineer",
    );
    assert.equal(others.length, 0, "không được tạo override lây sang vai trò khác");

    // Dọn override để không ảnh hưởng test khác cùng tiến trình (CAN.viewFeatureFlags
    // toàn cục có thể bị đọc bởi test khác qua cache).
    await PATCH(
      jreq("/x", { role: "engineer", permKey: "viewFeatureFlags", allowed: null }, "PATCH"),
    );
  },
);

// ============================================================================
// GET/POST /api/admin/webhooks
// ============================================================================

test("GET /api/admin/webhooks: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/webhooks/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/webhooks: PM không được quản lý webhook (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("whpm");
  const pm = await taoUser("pm", "whpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/webhooks/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("POST /api/admin/webhooks: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const res = await POST(jreq("/x", { url: "https://example.com/hook", events: ["ping"] }));
  assert.equal(res.status, 401);
});

test("POST /api/admin/webhooks: PM không được tạo → 403", S, async () => {
  const projectId = await taoDuAn("whpostpm");
  const pm = await taoUser("pm", "whpostpm");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const res = await POST(jreq("/x", { url: "https://example.com/hook", events: ["ping"] }));
  assert.equal(res.status, 403);
});

test("POST /api/admin/webhooks: chống SSRF — URL trỏ localhost bị chặn → 422", S, async () => {
  const projectId = await taoDuAn("whssrf1");
  const admin = await taoUser("admin", "whssrf1");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const res = await POST(jreq("/x", { url: "http://localhost:3000/hook", events: ["ping"] }));
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /nội bộ\/loopback/);
});

test(
  "POST /api/admin/webhooks: chống SSRF — URL trỏ IP nội bộ (10.x/192.168.x/169.254.x) bị chặn → 422",
  S,
  async () => {
    const projectId = await taoDuAn("whssrf2");
    const admin = await taoUser("admin", "whssrf2");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/webhooks/route");
    for (const host of [
      "http://10.0.0.5/hook",
      "http://192.168.1.1/hook",
      "http://169.254.169.254/hook",
    ]) {
      const res = await POST(jreq("/x", { url: host, events: ["ping"] }));
      assert.equal(res.status, 422, `phải chặn ${host}`);
    }
  },
);

test("POST /api/admin/webhooks: chống SSRF — scheme lạ (ftp/file) bị chặn → 422", S, async () => {
  const projectId = await taoDuAn("whssrf3");
  const admin = await taoUser("admin", "whssrf3");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const res = await POST(jreq("/x", { url: "ftp://example.com/hook", events: ["ping"] }));
  assert.equal(res.status, 422);
});

test("POST /api/admin/webhooks: danh sách sự kiện rỗng/không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("whbadevents");
  const admin = await taoUser("admin", "whbadevents");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const res1 = await POST(jreq("/x", { url: "https://example.com/hook", events: [] }));
  assert.equal(res1.status, 422);
  const res2 = await POST(
    jreq("/x", { url: "https://example.com/hook", events: ["khong_ton_tai"] }),
  );
  assert.equal(res2.status, 422);
});

test(
  "POST /api/admin/webhooks: tạo thành công → trả secret 1 LẦN, GET sau đó KHÔNG lộ secret",
  S,
  async () => {
    // Bất biến bảo mật: secret webhook chỉ trả về đúng 1 lần lúc tạo (như API key thật) —
    // mọi lần GET sau không được chứa field secret dưới bất kỳ tên nào.
    const projectId = await taoDuAn("whsecret");
    const admin = await taoUser("admin", "whsecret");
    await dangNhapDuAn(admin, projectId);
    const { POST, GET } = await import("@/app/api/admin/webhooks/route");
    const created = await POST(
      jreq("/x", { url: "https://example.com/hook", events: ["ping"], projectId }),
    );
    assert.equal(created.status, 201);
    const createdJson = await created.json();
    assert.match(createdJson.secret, /^[0-9a-f]{64}$/);

    const list = await GET();
    const { webhooks } = await list.json();
    const found = webhooks.find((w: { id: number }) => w.id === createdJson.id);
    assert.ok(found);
    assert.equal(found.secret, undefined);
    assert.equal(JSON.stringify(found).includes(createdJson.secret), false);
  },
);

test(
  "GET /api/admin/webhooks: cô lập tenant — Admin org khác KHÔNG thấy webhook của org này",
  S,
  async () => {
    // M54 GĐ1 PR2: webhooks.org_id — route GET lọc `WHERE w.org_id = ?`.
    const projectId1 = await taoDuAn("whorg1", 1);
    const admin1 = await taoUser("admin", "whorg1", 1);
    await dangNhapDuAn(admin1, projectId1);
    const { POST } = await import("@/app/api/admin/webhooks/route");
    const created = await POST(
      jreq("/x", { url: "https://example.com/hook-org1", events: ["ping"] }),
    );
    const { id } = await created.json();

    const org2 = await taoToChuc("whorg2");
    const projectId2 = await taoDuAn("whorg2", org2);
    const admin2 = await taoUser("admin", "whorg2", org2);
    await dangNhapDuAn(admin2, projectId2);
    const { GET } = await import("@/app/api/admin/webhooks/route");
    const res = await GET();
    const { webhooks } = await res.json();
    assert.ok(
      !webhooks.some((w: { id: number }) => w.id === id),
      "GET không được lộ webhook của org khác",
    );
  },
);

// ============================================================================
// PATCH/DELETE /api/admin/webhooks/:id
// ============================================================================

test("PATCH /api/admin/webhooks/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/admin/webhooks/:id: PM không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("whpatchpm");
  const pm = await taoUser("pm", "whpatchpm");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/admin/webhooks/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("whpatchbad");
  const admin = await taoUser("admin", "whpatchbad");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await PATCH(jreq("/x", { active: false }, "PATCH"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/admin/webhooks/:id: không có trường nào để cập nhật → 400", S, async () => {
  const projectId = await taoDuAn("whpatchempty");
  const admin = await taoUser("admin", "whpatchempty");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const created = await POST(jreq("/x", { url: "https://example.com/hook", events: ["ping"] }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: String(id) }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/admin/webhooks/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("whpatch404");
  const admin = await taoUser("admin", "whpatch404");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await PATCH(jreq("/x", { active: false }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/admin/webhooks/:id: đổi URL vẫn phải qua validate SSRF → 422", S, async () => {
  const projectId = await taoDuAn("whpatchssrf");
  const admin = await taoUser("admin", "whpatchssrf");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const created = await POST(jreq("/x", { url: "https://example.com/hook", events: ["ping"] }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await PATCH(jreq("/x", { url: "http://127.0.0.1/hook" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/admin/webhooks/:id: sửa active/events thành công (không đổi secret)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("whpatchok");
    const admin = await taoUser("admin", "whpatchok");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/webhooks/route");
    const created = await POST(jreq("/x", { url: "https://example.com/hook", events: ["ping"] }));
    const { id, secret } = await created.json();
    const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
    const res = await PATCH(
      jreq("/x", { active: false, events: ["ping", "task.approved"] }, "PATCH"),
      { params: Promise.resolve({ id: String(id) }) },
    );
    assert.equal(res.status, 200);
    const row = await queryOne<{ active: boolean; events: string[]; secret: string }>(
      `SELECT active, events, secret FROM webhooks WHERE id = ?`,
      id,
    );
    assert.equal(row?.active, false);
    assert.deepEqual([...row!.events].sort(), ["ping", "task.approved"].sort());
    assert.equal(row?.secret, secret, "PATCH không được đổi secret");
  },
);

test("DELETE /api/admin/webhooks/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/admin/webhooks/:id: PM không được xoá → 403", S, async () => {
  const projectId = await taoDuAn("whdelpm");
  const pm = await taoUser("pm", "whdelpm");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/admin/webhooks/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("whdel404");
  const admin = await taoUser("admin", "whdel404");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/admin/webhooks/:id: thành công → xoá khỏi DB", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("whdelok");
  const admin = await taoUser("admin", "whdelok");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/route");
  const created = await POST(jreq("/x", { url: "https://example.com/hook", events: ["ping"] }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/admin/webhooks/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM webhooks WHERE id = ?`, id);
  assert.equal(row, undefined);
});

test(
  "DELETE /api/admin/webhooks/:id: Admin org khác KHÔNG xoá được webhook của org này (cô lập tenant)",
  S,
  async () => {
    // Đặc tả bảo mật: "Xoá webhook phải xoá đúng của tổ chức/dự án mình, không đụng của
    // người khác" — cùng mức cô lập với GET (`WHERE w.org_id = ?`). PATCH/DELETE/test theo
    // :id (app/api/admin/webhooks/[id]/route.ts, .../[id]/test/route.ts) nay đã thêm điều
    // kiện `org_id = ?` giống GET/POST: id thuộc org khác → coi như không tồn tại (404).
    const projectId1 = await taoDuAn("whcross1", 1);
    const admin1 = await taoUser("admin", "whcross1", 1);
    await dangNhapDuAn(admin1, projectId1);
    const { POST } = await import("@/app/api/admin/webhooks/route");
    const created = await POST(
      jreq("/x", { url: "https://example.com/hook-cross", events: ["ping"] }),
    );
    const { id } = await created.json();

    const org2 = await taoToChuc("whcross2");
    const projectId2 = await taoDuAn("whcross2", org2);
    const admin2 = await taoUser("admin", "whcross2", org2);
    await dangNhapDuAn(admin2, projectId2);
    const { DELETE } = await import("@/app/api/admin/webhooks/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 404, "phải trả 404 — webhook không thuộc org của người gọi");

    const { queryOne } = await import("@/lib/db");
    const row = await queryOne(`SELECT id FROM webhooks WHERE id = ?`, id);
    assert.ok(row, "webhook của org khác không bị xoá nhầm");
  },
);

// ============================================================================
// POST /api/admin/webhooks/:id/test
// ============================================================================

test("POST /api/admin/webhooks/:id/test: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/admin/webhooks/[id]/test/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/admin/webhooks/:id/test: PM không được gọi → 403", S, async () => {
  const projectId = await taoDuAn("whtestpm");
  const pm = await taoUser("pm", "whtestpm");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/[id]/test/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("POST /api/admin/webhooks/:id/test: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("whtest404");
  const admin = await taoUser("admin", "whtest404");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/webhooks/[id]/test/route");
  const res = await POST(jreq("/x", undefined, "POST"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "POST /api/admin/webhooks/:id/test: chèn delivery 'ping' + gọi gửi ngay, trả {sent, failed}",
  S,
  async () => {
    const projectId = await taoDuAn("whtestok");
    const admin = await taoUser("admin", "whtestok");
    await dangNhapDuAn(admin, projectId);
    const { POST: createWh } = await import("@/app/api/admin/webhooks/route");
    // Host không giải quyết DNS thật (invalid TLD) — sendOne trả nhanh false, không treo test.
    const created = await createWh(
      jreq("/x", { url: "https://khong-ton-tai.invalid/hook", events: ["ping"] }),
    );
    const { id } = await created.json();
    const { run, queryOne } = await import("@/lib/db");
    void run;

    const { POST } = await import("@/app/api/admin/webhooks/[id]/test/route");
    const res = await POST(jreq("/x", undefined, "POST"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.sent, "number");
    assert.equal(typeof body.failed, "number");

    const delivery = await queryOne<{ event: string }>(
      `SELECT event FROM webhook_deliveries WHERE webhook_id = ? AND event = 'ping'`,
      id,
    );
    assert.ok(delivery, "phải chèn 1 delivery 'ping'");
  },
);

// ============================================================================
// GET/POST /api/admin/integrations
// ============================================================================

test("GET /api/admin/integrations: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/integrations/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/integrations: engineer không có quyền xem → 403", S, async () => {
  const projectId = await taoDuAn("integ403");
  const eng = await taoUser("engineer", "integ403");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/admin/integrations/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/integrations: PM ĐƯỢC xem (viewIntegrations)", S, async () => {
  const projectId = await taoDuAn("integpm");
  const pm = await taoUser("pm", "integpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/integrations/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { integrations } = await res.json();
  assert.ok(Array.isArray(integrations));
});

test("POST /api/admin/integrations: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/admin/integrations/route");
  const res = await POST(jreq("/x", { provider: "khong_ton_tai" }));
  assert.equal(res.status, 401);
});

test("POST /api/admin/integrations: PM không được cấu hình (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("integpmpost");
  const pm = await taoUser("pm", "integpmpost");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/integrations/route");
  const res = await POST(jreq("/x", { provider: "khong_ton_tai" }));
  assert.equal(res.status, 403);
});

test("POST /api/admin/integrations: thiếu provider → 400", S, async () => {
  const projectId = await taoDuAn("integnoprov");
  const admin = await taoUser("admin", "integnoprov");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/integrations/route");
  const res = await POST(jreq("/x", {}));
  assert.equal(res.status, 400);
});

test("POST /api/admin/integrations: provider chưa đăng ký (chưa có adapter) → 422", S, async () => {
  const projectId = await taoDuAn("integbadprov");
  const admin = await taoUser("admin", "integbadprov");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/integrations/route");
  const res = await POST(jreq("/x", { provider: "provider-chua-dang-ky-" + uniq("x") }));
  assert.equal(res.status, 422);
});

test(
  "GET /api/admin/integrations: cô lập tenant — org khác không thấy tích hợp của org này",
  S,
  async () => {
    const { registerAdapter } = await import("@/lib/ha-tang/integrations/core");
    const provider = "test-adapter-" + uniq("p");
    registerAdapter({
      provider,
      pushEntities: [],
      fetchRows: async () => [],
      push: async () => [],
    });

    const projectId1 = await taoDuAn("integorg1", 1);
    const admin1 = await taoUser("admin", "integorg1", 1);
    await dangNhapDuAn(admin1, projectId1);
    const { POST } = await import("@/app/api/admin/integrations/route");
    const created = await POST(jreq("/x", { provider, projectId: projectId1 }));
    assert.equal(created.status, 201);

    const org2 = await taoToChuc("integorg2");
    const projectId2 = await taoDuAn("integorg2", org2);
    const admin2 = await taoUser("admin", "integorg2", org2);
    await dangNhapDuAn(admin2, projectId2);
    const { GET } = await import("@/app/api/admin/integrations/route");
    const res = await GET();
    const { integrations } = await res.json();
    assert.ok(!integrations.some((i: { provider: string }) => i.provider === provider));
  },
);

// ============================================================================
// GET/POST/PATCH/DELETE /api/admin/code-lists
// ============================================================================

test("GET /api/admin/code-lists: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/code-lists/route");
  const res = await GET(jreq("/api/admin/code-lists?domain=delay_reason", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/admin/code-lists: PM không được quản lý danh mục (chỉ Admin) → 403", S, async () => {
  // Khác feature-flags/integrations/custom-fields — code-lists KHÔNG có ngoại lệ PM xem.
  const projectId = await taoDuAn("clpm");
  const pm = await taoUser("pm", "clpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/code-lists/route");
  const res = await GET(jreq("/api/admin/code-lists?domain=delay_reason", undefined, "GET"));
  assert.equal(res.status, 403);
});

test("GET /api/admin/code-lists: thiếu domain → 400", S, async () => {
  const projectId = await taoDuAn("clnodomain");
  const admin = await taoUser("admin", "clnodomain");
  await dangNhapDuAn(admin, projectId);
  const { GET } = await import("@/app/api/admin/code-lists/route");
  const res = await GET(jreq("/api/admin/code-lists", undefined, "GET"));
  assert.equal(res.status, 400);
});

test("POST /api/admin/code-lists: thiếu domain/code/label → 400", S, async () => {
  const projectId = await taoDuAn("clbody");
  const admin = await taoUser("admin", "clbody");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/code-lists/route");
  const res = await POST(jreq("/api/admin/code-lists", { domain: "x" }));
  assert.equal(res.status, 400);
});

test(
  "POST /api/admin/code-lists: domain require_2fa_roles chỉ nhận mã là 1 trong 7 vai trò hợp lệ",
  S,
  async () => {
    // Bất biến: mã không khớp vai trò nào sẽ không bao giờ kích hoạt được — im lặng hỏng.
    // Dọn trước để không lệ thuộc dữ liệu sót lại từ lần chạy trước (domain toàn hệ, không
    // theo dự án/org — có thể bị test khác trong CÙNG tiến trình ghi trước đó).
    const { run } = await import("@/lib/db");
    await run(`DELETE FROM code_lists WHERE domain = 'require_2fa_roles' AND code = 'subcon'`);
    const projectId = await taoDuAn("cl2fabad");
    const admin = await taoUser("admin", "cl2fabad");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/code-lists/route");
    const res = await POST(
      jreq("/api/admin/code-lists", {
        domain: "require_2fa_roles",
        code: "vai_tro_khong_ton_tai",
        label: "x",
      }),
    );
    assert.equal(res.status, 400);

    const ok = await POST(
      jreq("/api/admin/code-lists", { domain: "require_2fa_roles", code: "subcon", label: "x" }),
    );
    assert.equal(ok.status, 201);
  },
);

test("POST /api/admin/code-lists: tạo trùng (domain, code) → 409", S, async () => {
  const projectId = await taoDuAn("cldup");
  const admin = await taoUser("admin", "cldup");
  await dangNhapDuAn(admin, projectId);
  const domain = "delay_reason";
  const code = uniq("cldup");
  const { POST } = await import("@/app/api/admin/code-lists/route");
  const first = await POST(jreq("/api/admin/code-lists", { domain, code, label: "A" }));
  assert.equal(first.status, 201);
  const second = await POST(jreq("/api/admin/code-lists", { domain, code, label: "B" }));
  assert.equal(second.status, 409);
});

test("PATCH /api/admin/code-lists: không tìm thấy mục → 404", S, async () => {
  const projectId = await taoDuAn("clpatch404");
  const admin = await taoUser("admin", "clpatch404");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/code-lists/route");
  const res = await PATCH(jreq("/x", { id: 999999999, label: "x" }, "PATCH"));
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/admin/code-lists: sửa label/active thành công (domain/code bất biến)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("clpatchok");
    const admin = await taoUser("admin", "clpatchok");
    await dangNhapDuAn(admin, projectId);
    const domain = "delay_reason";
    const code = uniq("clpatchok");
    const { POST, PATCH } = await import("@/app/api/admin/code-lists/route");
    const created = await POST(jreq("/api/admin/code-lists", { domain, code, label: "Cũ" }));
    const { id } = await created.json();
    const res = await PATCH(jreq("/x", { id, label: "Mới", active: false }, "PATCH"));
    assert.equal(res.status, 200);
    const row = await queryOne<{ label: string; active: boolean; code: string }>(
      `SELECT label, active, code FROM code_lists WHERE id = ?`,
      id,
    );
    assert.equal(row?.label, "Mới");
    assert.equal(row?.active, false);
    assert.equal(row?.code, code);
  },
);

test(
  "DELETE /api/admin/code-lists: mục đang được tham chiếu (delay_reason trên tasks) → 409, không xoá",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("cldelref");
    const admin = await taoUser("admin", "cldelref");
    await dangNhapDuAn(admin, projectId);
    const domain = "delay_reason";
    const code = uniq("cldelref");
    const { POST } = await import("@/app/api/admin/code-lists/route");
    const created = await POST(jreq("/api/admin/code-lists", { domain, code, label: "x" }));
    const { id } = await created.json();

    // Dựng 1 task tham chiếu code này qua delay_reason (đủ cho countReferences > 0).
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
      projectId,
      "Tháp test",
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, name, code, slug) VALUES (?, 'S', 'S', ?)`,
      towerId,
      uniq("slug"),
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'WP', 'WP')`,
      sheetId,
    );
    await insertId(
      `INSERT INTO tasks (package_id, code, name, delay_reason) VALUES (?, 'T1', 'T1', ?)`,
      wpId,
      code,
    );

    const { DELETE } = await import("@/app/api/admin/code-lists/route");
    const res = await DELETE(jreq(`/api/admin/code-lists?id=${id}`, undefined, "DELETE"));
    assert.equal(res.status, 409);
    const row = await queryOne(`SELECT id FROM code_lists WHERE id = ?`, id);
    assert.ok(row, "mục không bị xoá khi còn tham chiếu");
  },
);

test("DELETE /api/admin/code-lists: mục không ai tham chiếu → xoá được", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cldelok");
  const admin = await taoUser("admin", "cldelok");
  await dangNhapDuAn(admin, projectId);
  const domain = "delay_reason";
  const code = uniq("cldelok");
  const { POST, DELETE } = await import("@/app/api/admin/code-lists/route");
  const created = await POST(jreq("/api/admin/code-lists", { domain, code, label: "x" }));
  const { id } = await created.json();
  const res = await DELETE(jreq(`/api/admin/code-lists?id=${id}`, undefined, "DELETE"));
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM code_lists WHERE id = ?`, id);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/admin/custom-fields, PATCH/DELETE /api/admin/custom-fields/:id
// ============================================================================

test("GET /api/admin/custom-fields: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/custom-fields/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/custom-fields: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("cfeng");
  const eng = await taoUser("engineer", "cfeng");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/admin/custom-fields/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/custom-fields: PM ĐƯỢC xem (viewCustomFields)", S, async () => {
  const projectId = await taoDuAn("cfpm");
  const pm = await taoUser("pm", "cfpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/custom-fields/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { defs } = await res.json();
  assert.ok(Array.isArray(defs));
});

test("POST /api/admin/custom-fields: PM không được tạo (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("cfpostpm");
  const pm = await taoUser("pm", "cfpostpm");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const res = await POST(jreq("/x", { entityType: "task", key: "x", label: "x", type: "text" }));
  assert.equal(res.status, 403);
});

test("POST /api/admin/custom-fields: entityType không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("cfbadentity");
  const admin = await taoUser("admin", "cfbadentity");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const res = await POST(
    jreq("/x", { entityType: "khong_ton_tai", key: "x", label: "x", type: "text" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/admin/custom-fields: type không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("cfbadtype");
  const admin = await taoUser("admin", "cfbadtype");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const res = await POST(
    jreq("/x", { entityType: "task", key: "x", label: "x", type: "khong_ton_tai" }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/admin/custom-fields: key không đúng snake_case → 422", S, async () => {
  const projectId = await taoDuAn("cfbadkey");
  const admin = await taoUser("admin", "cfbadkey");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  for (const key of ["1abc", "Abc", "abc-def", ""]) {
    const res = await POST(jreq("/x", { entityType: "task", key, label: "x", type: "text" }));
    assert.equal(res.status, 422, `key "${key}" phải bị từ chối`);
  }
});

test("POST /api/admin/custom-fields: thiếu label → 422", S, async () => {
  const projectId = await taoDuAn("cfnolabel");
  const admin = await taoUser("admin", "cfnolabel");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const res = await POST(jreq("/x", { entityType: "task", key: "abc", label: "  ", type: "text" }));
  assert.equal(res.status, 422);
});

test("POST /api/admin/custom-fields: type=select nhưng thiếu options → 422", S, async () => {
  const projectId = await taoDuAn("cfselect");
  const admin = await taoUser("admin", "cfselect");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const res = await POST(
    jreq("/x", { entityType: "task", key: "abc", label: "x", type: "select", options: [] }),
  );
  assert.equal(res.status, 422);
});

test("POST /api/admin/custom-fields: trùng (entityType, projectId, key) → 409", S, async () => {
  const projectId = await taoDuAn("cfdup");
  const admin = await taoUser("admin", "cfdup");
  await dangNhapDuAn(admin, projectId);
  const key = uniq("cfdup");
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const first = await POST(
    jreq("/x", { entityType: "task", key, label: "A", type: "text", projectId }),
  );
  assert.equal(first.status, 201);
  const second = await POST(
    jreq("/x", { entityType: "task", key, label: "B", type: "text", projectId }),
  );
  assert.equal(second.status, 409);
});

test(
  "GET /api/admin/custom-fields: cô lập tenant — org khác không thấy định nghĩa của org này",
  S,
  async () => {
    const projectId1 = await taoDuAn("cforg1", 1);
    const admin1 = await taoUser("admin", "cforg1", 1);
    await dangNhapDuAn(admin1, projectId1);
    const key = uniq("cforgkey");
    const { POST } = await import("@/app/api/admin/custom-fields/route");
    const created = await POST(jreq("/x", { entityType: "task", key, label: "x", type: "text" }));
    assert.equal(created.status, 201);

    const org2 = await taoToChuc("cforg2");
    const projectId2 = await taoDuAn("cforg2", org2);
    const admin2 = await taoUser("admin", "cforg2", org2);
    await dangNhapDuAn(admin2, projectId2);
    const { GET } = await import("@/app/api/admin/custom-fields/route");
    const res = await GET();
    const { defs } = await res.json();
    assert.ok(!defs.some((d: { key: string }) => d.key === key));
  },
);

test("PATCH /api/admin/custom-fields/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("cfpatch404");
  const admin = await taoUser("admin", "cfpatch404");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/custom-fields/[id]/route");
  const res = await PATCH(jreq("/x", { label: "x" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/admin/custom-fields/:id: đổi type khi đã có dữ liệu tham chiếu key → 409",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const projectId = await taoDuAn("cftypeused");
    const admin = await taoUser("admin", "cftypeused");
    await dangNhapDuAn(admin, projectId);
    const key = uniq("cftypeused");
    const { POST } = await import("@/app/api/admin/custom-fields/route");
    const created = await POST(jreq("/x", { entityType: "task", key, label: "x", type: "text" }));
    const { id } = await created.json();

    // Dựng 1 task có giá trị custom cho key này.
    const { insertId } = await import("@/lib/db");
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
      projectId,
      "T",
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, name, code, slug) VALUES (?, 'S', 'S', ?)`,
      towerId,
      uniq("slug"),
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'WP', 'WP')`,
      sheetId,
    );
    await run(
      `INSERT INTO tasks (package_id, code, name, custom) VALUES (?, 'T1', 'T1', ?::jsonb)`,
      wpId,
      JSON.stringify({ [key]: "gia_tri" }),
    );

    const { PATCH } = await import("@/app/api/admin/custom-fields/[id]/route");
    const res = await PATCH(jreq("/x", { type: "number" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 409);
  },
);

test("PATCH /api/admin/custom-fields/:id: sửa label/required/active thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cfpatchok");
  const admin = await taoUser("admin", "cfpatchok");
  await dangNhapDuAn(admin, projectId);
  const key = uniq("cfpatchok");
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const created = await POST(jreq("/x", { entityType: "task", key, label: "Cũ", type: "text" }));
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/admin/custom-fields/[id]/route");
  const res = await PATCH(jreq("/x", { label: "Mới", required: true, active: false }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ label: string; required: boolean; active: boolean }>(
    `SELECT label, required, active FROM custom_field_defs WHERE id = ?`,
    id,
  );
  assert.equal(row?.label, "Mới");
  assert.equal(row?.required, true);
  assert.equal(row?.active, false);
});

test("DELETE /api/admin/custom-fields/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("cfdel404");
  const admin = await taoUser("admin", "cfdel404");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/admin/custom-fields/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/admin/custom-fields/:id: thành công → xoá định nghĩa", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("cfdelok");
  const admin = await taoUser("admin", "cfdelok");
  await dangNhapDuAn(admin, projectId);
  const key = uniq("cfdelok");
  const { POST } = await import("@/app/api/admin/custom-fields/route");
  const created = await POST(jreq("/x", { entityType: "task", key, label: "x", type: "text" }));
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/admin/custom-fields/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM custom_field_defs WHERE id = ?`, id);
  assert.equal(row, undefined);
});

// ============================================================================
// GET/POST /api/admin/alert-rules, DELETE /api/admin/alert-rules/:id
// ============================================================================

test("GET /api/admin/alert-rules: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/alert-rules/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/alert-rules: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("areng");
  const eng = await taoUser("engineer", "areng");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/admin/alert-rules/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/alert-rules: PM ĐƯỢC xem (viewAlertRules)", S, async () => {
  const projectId = await taoDuAn("arpm");
  const pm = await taoUser("pm", "arpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/alert-rules/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { rules } = await res.json();
  assert.ok(Array.isArray(rules));
});

test("POST /api/admin/alert-rules: PM không được cấu hình (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("arpostpm");
  const pm = await taoUser("pm", "arpostpm");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/alert-rules/route");
  const res = await POST(jreq("/x", { metric: "due_soon_days", threshold: 5 }));
  assert.equal(res.status, 403);
});

test("POST /api/admin/alert-rules: metric không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("arbadmetric");
  const admin = await taoUser("admin", "arbadmetric");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/alert-rules/route");
  const res = await POST(jreq("/x", { metric: "khong_ton_tai", threshold: 5 }));
  assert.equal(res.status, 422);
});

test("POST /api/admin/alert-rules: threshold âm cho metric tỷ lệ → 422", S, async () => {
  const projectId = await taoDuAn("arnegthresh");
  const admin = await taoUser("admin", "arnegthresh");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/alert-rules/route");
  const res = await POST(jreq("/x", { metric: "material_over_pct", threshold: -5 }));
  assert.equal(res.status, 422);
});

test(
  "POST /api/admin/alert-rules: tạo rồi POST lại cùng (metric, dự án) → UPDATE ngưỡng cũ (không tạo dòng mới)",
  S,
  async () => {
    const { query } = await import("@/lib/db");
    const projectId = await taoDuAn("arupsert");
    const admin = await taoUser("admin", "arupsert");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/alert-rules/route");
    const first = await POST(jreq("/x", { projectId, metric: "due_soon_days", threshold: 5 }));
    assert.equal(first.status, 201);
    const { id: id1 } = await first.json();
    const second = await POST(jreq("/x", { projectId, metric: "due_soon_days", threshold: 7 }));
    const { id: id2 } = await second.json();
    assert.equal(id1, id2, "upsert phải cập nhật cùng dòng, không tạo mới");

    const rows = await query(`SELECT threshold FROM alert_rules WHERE id = ?`, id1);
    assert.equal(Number(rows[0].threshold), 7);
  },
);

test("DELETE /api/admin/alert-rules/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/admin/alert-rules/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/admin/alert-rules/:id: PM không được xoá → 403", S, async () => {
  const projectId = await taoDuAn("ardelpm");
  const pm = await taoUser("pm", "ardelpm");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/admin/alert-rules/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/admin/alert-rules/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("ardelbad");
  const admin = await taoUser("admin", "ardelbad");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/admin/alert-rules/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "abc" }),
  });
  assert.equal(res.status, 400);
});

test(
  "DELETE /api/admin/alert-rules/:id: thành công → rule mất, metric quay lại default",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("ardelok");
    const admin = await taoUser("admin", "ardelok");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/alert-rules/route");
    const created = await POST(jreq("/x", { projectId, metric: "cpi_below", threshold: 0.9 }));
    const { id } = await created.json();
    const { DELETE } = await import("@/app/api/admin/alert-rules/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne(`SELECT id FROM alert_rules WHERE id = ?`, id);
    assert.equal(row, undefined);

    const { getAlertThreshold } = await import("@/lib/van-hanh/alerts");
    assert.equal(await getAlertThreshold("cpi_below", projectId), 1);
  },
);

// ============================================================================
// GET/POST /api/admin/approval-flows, PATCH/DELETE /api/admin/approval-flows/:id
// ============================================================================

test("GET /api/admin/approval-flows: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/admin/approval-flows/route");
  const res = await GET();
  assert.equal(res.status, 401);
});

test("GET /api/admin/approval-flows: engineer không có quyền → 403", S, async () => {
  const projectId = await taoDuAn("afeng");
  const eng = await taoUser("engineer", "afeng");
  await dangNhapDuAn(eng, projectId);
  const { GET } = await import("@/app/api/admin/approval-flows/route");
  const res = await GET();
  assert.equal(res.status, 403);
});

test("GET /api/admin/approval-flows: PM ĐƯỢC xem (viewApprovalFlows)", S, async () => {
  const projectId = await taoDuAn("afpm");
  const pm = await taoUser("pm", "afpm");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/admin/approval-flows/route");
  const res = await GET();
  assert.equal(res.status, 200);
  const { flows } = await res.json();
  assert.ok(Array.isArray(flows));
});

test("POST /api/admin/approval-flows: PM không được tạo (chỉ Admin) → 403", S, async () => {
  const projectId = await taoDuAn("afpostpm");
  const pm = await taoUser("pm", "afpostpm");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/admin/approval-flows/route");
  const res = await POST(
    jreq("/x", { entityType: "payment_cert", name: "x", steps: [{ seq: 1, role: "pm" }] }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/admin/approval-flows: entityType không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("afbadentity");
  const admin = await taoUser("admin", "afbadentity");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/approval-flows/route");
  const res = await POST(
    jreq("/x", { entityType: "khong_ton_tai", name: "x", steps: [{ seq: 1, role: "pm" }] }),
  );
  assert.equal(res.status, 422);
});

test(
  "POST /api/admin/approval-flows: bước duyệt không liên tục/trùng seq → 422 (validateFlowSteps)",
  S,
  async () => {
    const projectId = await taoDuAn("afbadsteps");
    const admin = await taoUser("admin", "afbadsteps");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/approval-flows/route");
    const res = await POST(
      jreq("/x", {
        entityType: "payment_cert",
        name: "x",
        steps: [
          { seq: 1, role: "pm" },
          { seq: 1, role: "admin" },
        ],
      }),
    );
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/admin/approval-flows: vai trò bước không được duyệt (bch/viewer thuộc NON_APPROVER_ROLES) → 422",
  S,
  async () => {
    // Bất biến nghiệp vụ: bch/viewer chỉ-xem không được đứng làm bước duyệt (cdt thì được).
    const projectId = await taoDuAn("afnonapprover");
    const admin = await taoUser("admin", "afnonapprover");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/approval-flows/route");
    const res = await POST(
      jreq("/x", { entityType: "payment_cert", name: "x", steps: [{ seq: 1, role: "bch" }] }),
    );
    assert.equal(res.status, 422);
  },
);

test(
  "POST /api/admin/approval-flows: tạo 2 flow active cùng (entityType, phạm vi dự án) → 409",
  S,
  async () => {
    const projectId = await taoDuAn("afdupactive");
    const admin = await taoUser("admin", "afdupactive");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/approval-flows/route");
    const first = await POST(
      jreq("/x", {
        entityType: "payment_cert",
        name: "Flow 1",
        projectId,
        steps: [{ seq: 1, role: "pm" }],
      }),
    );
    assert.equal(first.status, 201);
    const second = await POST(
      jreq("/x", {
        entityType: "payment_cert",
        name: "Flow 2",
        projectId,
        steps: [{ seq: 1, role: "admin" }],
      }),
    );
    assert.equal(second.status, 409);
  },
);

test("PATCH /api/admin/approval-flows/:id: PM không được sửa → 403", S, async () => {
  const projectId = await taoDuAn("afpatchpm");
  const pm = await taoUser("pm", "afpatchpm");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/admin/approval-flows/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/admin/approval-flows/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("afpatch404");
  const admin = await taoUser("admin", "afpatch404");
  await dangNhapDuAn(admin, projectId);
  const { PATCH } = await import("@/app/api/admin/approval-flows/[id]/route");
  const res = await PATCH(jreq("/x", { name: "x" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "PATCH /api/admin/approval-flows/:id: còn request 'pending' qua flow → 409, không cho sửa bước",
  S,
  async () => {
    // Bất biến toàn vẹn: đổi bước giữa chừng làm currentSeq của request đang chờ trỏ vào
    // bước không còn tồn tại — phải chặn cứng, không âm thầm cho qua.
    const { insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("afpatchpending");
    const admin = await taoUser("admin", "afpatchpending");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/approval-flows/route");
    const created = await POST(
      jreq("/x", {
        entityType: "variation",
        name: "Flow pending",
        projectId,
        steps: [{ seq: 1, role: "pm" }],
      }),
    );
    const { id } = await created.json();
    // entity_id ảo (không tham chiếu bảng thật) — dùng số ngẫu nhiên riêng của lần chạy để
    // không đụng ràng buộc UNIQUE ux_request_live(entity_type, entity_id) WHERE pending với
    // dữ liệu tồn dư từ lần chạy khác trong cùng DB test.
    await insertId(
      `INSERT INTO approval_requests (flow_id, entity_type, entity_id, project_id, current_seq, status, created_by)
       VALUES (?, 'variation', ?, ?, 1, 'pending', ?)`,
      id,
      seq + (Date.now() % 1_000_000),
      projectId,
      admin.id,
    );

    const { PATCH } = await import("@/app/api/admin/approval-flows/[id]/route");
    const res = await PATCH(jreq("/x", { steps: [{ seq: 1, role: "admin" }] }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 409);
  },
);

test("PATCH /api/admin/approval-flows/:id: sửa name/active thành công", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("afpatchok");
  const admin = await taoUser("admin", "afpatchok");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/approval-flows/route");
  const created = await POST(
    jreq("/x", {
      entityType: "proposal",
      name: "Cũ",
      projectId,
      steps: [{ seq: 1, role: "pm" }],
    }),
  );
  const { id } = await created.json();
  const { PATCH } = await import("@/app/api/admin/approval-flows/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Mới", active: false }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ name: string; active: boolean }>(
    `SELECT name, active FROM approval_flows WHERE id = ?`,
    id,
  );
  assert.equal(row?.name, "Mới");
  assert.equal(row?.active, false);
});

test("DELETE /api/admin/approval-flows/:id: PM không được xoá → 403", S, async () => {
  const projectId = await taoDuAn("afdelpm");
  const pm = await taoUser("pm", "afdelpm");
  await dangNhapDuAn(pm, projectId);
  const { DELETE } = await import("@/app/api/admin/approval-flows/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/admin/approval-flows/:id: không tìm thấy → 404", S, async () => {
  const projectId = await taoDuAn("afdel404");
  const admin = await taoUser("admin", "afdel404");
  await dangNhapDuAn(admin, projectId);
  const { DELETE } = await import("@/app/api/admin/approval-flows/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test(
  "DELETE /api/admin/approval-flows/:id: đã có bất kỳ request nào (kể cả xong) → 409, hướng dẫn tắt thay vì xoá",
  S,
  async () => {
    const { insertId } = await import("@/lib/db");
    const projectId = await taoDuAn("afdellinked");
    const admin = await taoUser("admin", "afdellinked");
    await dangNhapDuAn(admin, projectId);
    const { POST } = await import("@/app/api/admin/approval-flows/route");
    const created = await POST(
      jreq("/x", {
        entityType: "task_acceptance",
        name: "Flow linked",
        projectId,
        steps: [{ seq: 1, role: "pm" }],
      }),
    );
    const { id } = await created.json();
    await insertId(
      `INSERT INTO approval_requests (flow_id, entity_type, entity_id, project_id, current_seq, status, created_by)
       VALUES (?, 'task_acceptance', 1, ?, 1, 'approved', ?)`,
      id,
      projectId,
      admin.id,
    );

    const { DELETE } = await import("@/app/api/admin/approval-flows/[id]/route");
    const res = await DELETE(jreq("/x", undefined, "DELETE"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 409);
  },
);

test("DELETE /api/admin/approval-flows/:id: không ai tham chiếu → xoá được", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("afdelok");
  const admin = await taoUser("admin", "afdelok");
  await dangNhapDuAn(admin, projectId);
  const { POST } = await import("@/app/api/admin/approval-flows/route");
  const created = await POST(
    jreq("/x", {
      entityType: "variation",
      name: "Flow xoá được",
      projectId,
      steps: [{ seq: 1, role: "pm" }],
    }),
  );
  const { id } = await created.json();
  const { DELETE } = await import("@/app/api/admin/approval-flows/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne(`SELECT id FROM approval_flows WHERE id = ?`, id);
  assert.equal(row, undefined);
});

void dangNhap;
