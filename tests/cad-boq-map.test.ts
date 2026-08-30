import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M101 PR4 — mã BOQ theo dự án + đối chiếu BOQ chỉ-đọc.
// (1) Unit thuần: gán mã vào items không đụng rule pack dùng chung.
// (2) Route-source: force-dynamic, 401/403, và boq-snapshot CHỈ có GET (không mở đường ghi).
// (3) Integration (TEST_DATABASE_URL, tự skip): ghi/đọc map idempotent, chốt dự án theo phiên,
//     route rule-pack ?project= + boq-snapshot qua handler thật, và RLS chéo dự án bằng role
//     `xboss_app` (NOBYPASSRLS) như production.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { Pool } from "pg";

const S = { skip: !HAS_TEST_DB };

// ===== (1) Unit thuần =====

test("ganMaBoqVaoItems: gán đúng item, KHÔNG sửa rule pack dùng chung", async () => {
  const { ganMaBoqVaoItems } = await import("@/lib/ky-thuat/cad/dashboard");
  const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");

  const pack = getCurrentRulePack();
  const goc = pack.takeoff.items[0];
  const items = ganMaBoqVaoItems(pack.takeoff.items, [
    { takeoffItemId: goc.id, boqCode: "HVAC-01" },
    { takeoffItemId: "item-khong-ton-tai", boqCode: "RAC" },
  ]);

  assert.equal(items[0].boqCode, "HVAC-01");
  assert.equal(
    items[1].boqCode,
    pack.takeoff.items[1].boqCode,
    "item không có trong map giữ nguyên",
  );
  // Singleton rule pack là đối tượng dùng chung cho MỌI request — sửa tại chỗ là rò mã BOQ của
  // dự án này sang dự án khác.
  assert.equal(
    getCurrentRulePack().takeoff.items[0].boqCode,
    goc.boqCode,
    "rule pack gốc không được đổi",
  );
  // Trường khác của item phải còn nguyên (chỉ thay boqCode).
  assert.deepEqual(items[0].layerMatchAny, goc.layerMatchAny);
});

test("ETag rule pack theo dự án: khác dự án hoặc khác map ⇒ khác ETag", async () => {
  const { getCurrentRulePack, getRulePackEtag, getRulePackEtagChoDuAn } =
    await import("@/lib/ky-thuat/cad/rule-pack");
  const pack = getCurrentRulePack();
  const map = [{ takeoffItemId: "duct-supp", boqCode: "HVAC-01" }];

  const e1 = getRulePackEtagChoDuAn(pack, 1, map);
  const e2 = getRulePackEtagChoDuAn(pack, 2, map);
  const e3 = getRulePackEtagChoDuAn(pack, 1, [{ takeoffItemId: "duct-supp", boqCode: "HVAC-02" }]);
  assert.notEqual(e1, e2, "hai dự án không được dùng chung bản cache");
  assert.notEqual(e1, e3, "đổi mã BOQ phải làm plugin tải lại");
  assert.equal(e1, getRulePackEtagChoDuAn(pack, 1, map), "cùng đầu vào ⇒ ETag ổn định");
  assert.notEqual(e1, getRulePackEtag(pack), "bản toàn cục giữ nguyên ETag riêng");
});

// ===== (2) Route-source =====

function nguon(...phan: string[]): string {
  return readFileSync(join(process.cwd(), "app", "api", ...phan, "route.ts"), "utf8");
}

test("route boq-snapshot: CHỈ ĐỌC — không export đường ghi nào", () => {
  const src = nguon("engineering", "cad", "boq-snapshot");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /export async function GET/);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(
      !new RegExp(`export async function ${method}`).test(src),
      `boq-snapshot không được mở ${method} — đường ghi sổ khối lượng duy nhất là upload có kiểm định`,
    );
  }
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /getCadTokenUser/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.viewEngineeringGraph/);
  assert.match(src, /status: 403/);
  assert.match(src, /chotProjectIdChoDoc/);
  assert.match(src, /hitRateLimit\(`cad-boq-snapshot:/);
});

test("route boq-map: 401 + chỉ Admin/PM được PUT + không nhận token thiết bị", () => {
  const src = nguon("engineering", "cad", "boq-map");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /isAdminOrPm\(user\.role\)/);
  assert.match(src, /status: 403/);
  assert.match(src, /getCurrentProjectId\(user\)/);
  assert.ok(
    !src.includes("getCadTokenUser"),
    "sửa cấu hình mã BOQ là việc quản trị trên web, không nhận token máy trạm AutoCAD",
  );
});

test("route rule-pack: ?project= đi qua chotProjectIdChoDoc, không tin id client gửi", () => {
  const src = nguon("engineering", "cad", "rule-pack");
  assert.match(src, /chotProjectIdChoDoc\(user, thamSoDuAn\)/);
  assert.ok(
    !/searchParams\.get\("project"\)[^\n]*\bprojectId\s*=/.test(src),
    "không được lấy thẳng id từ query làm projectId",
  );
});

// ===== (3) Integration (Postgres) =====

let duAnA = 0;
let duAnB = 0;
let pmId = 0;
let subconId = 0;
let orgKhacId = 0;
let duAnOrgKhac = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  const dau = Date.now();
  duAnA = await insertId(`INSERT INTO projects (name, org_id) VALUES ('BOQ map A', 1)`);
  duAnB = await insertId(`INSERT INTO projects (name, org_id) VALUES ('BOQ map B', 1)`);
  orgKhacId = await insertId(`INSERT INTO organizations (name) VALUES ('Org khác ${dau}')`);
  duAnOrgKhac = await insertId(
    `INSERT INTO projects (name, org_id) VALUES ('BOQ map org khác', ?)`,
    orgKhacId,
  );
  pmId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('PM map BOQ', 'boqmap-pm-${dau}@test.local', 'x', 'pm', 1)`,
  );
  subconId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Thầu phụ', 'boqmap-sub-${dau}@test.local', 'x', 'subcon', 1)`,
  );
  // Gán PM vào ĐÚNG dự án A + dự án org khác → bảng user_projects không rỗng nên quy tắc lọc bật
  // lên (rỗng = mọi user thấy mọi dự án, nhánh "bị từ chối" sẽ không bao giờ chạy tới).
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pmId, duAnA);
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, pmId, duAnOrgKhac);
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, subconId, duAnA);
});

after(async () => {
  if (!HAS_TEST_DB || !pmId) return;
  const { run } = await import("@/lib/db");
  // Dọn SẠCH: nhiều file test dùng chung database của worker — để lại dòng trong user_projects là
  // phá quy tắc "bảng rỗng = mọi user thấy mọi dự án" và làm file khác đỏ oan.
  await run(`DELETE FROM user_projects WHERE user_id IN (?, ?)`, pmId, subconId);
  await run(
    `DELETE FROM cad_takeoff_boq_map WHERE project_id IN (?, ?, ?)`,
    duAnA,
    duAnB,
    duAnOrgKhac,
  );
  await run(`DELETE FROM boq_items WHERE project_id IN (?, ?)`, duAnA, duAnB);
  await run(`DELETE FROM api_keys WHERE created_by IN (?, ?)`, pmId, subconId);
  await run(`DELETE FROM users WHERE id IN (?, ?)`, pmId, subconId);
  await run(`DELETE FROM projects WHERE id IN (?, ?, ?)`, duAnA, duAnB, duAnOrgKhac);
  await run(`DELETE FROM organizations WHERE id = ?`, orgKhacId);
});

test("ghi map: upsert idempotent, mã rỗng = gỡ, id hạng mục lạ bị từ chối cả lô", S, async () => {
  const { ghiMapBoqTheoDuAn, layMapBoqTheoDuAn, danhSachItemBocTach } =
    await import("@/lib/ky-thuat/cad/dashboard");
  const [it1, it2] = danhSachItemBocTach();

  const l1 = await ghiMapBoqTheoDuAn(duAnA, pmId, [
    { takeoffItemId: it1.id, boqCode: "A-01" },
    { takeoffItemId: it2.id, boqCode: "A-02" },
  ]);
  assert.deepEqual(l1, { ok: true, soGan: 2, soGo: 0 });

  // Gửi lại y nguyên (bấm lưu 2 lần / retry mạng) → vẫn đúng 2 dòng, không đẻ bản đôi.
  await ghiMapBoqTheoDuAn(duAnA, pmId, [
    { takeoffItemId: it1.id, boqCode: "A-01" },
    { takeoffItemId: it2.id, boqCode: "A-02" },
  ]);
  assert.deepEqual(
    await layMapBoqTheoDuAn(duAnA),
    [
      { takeoffItemId: it1.id, boqCode: "A-01" },
      { takeoffItemId: it2.id, boqCode: "A-02" },
    ].sort((a, b) => a.takeoffItemId.localeCompare(b.takeoffItemId)),
  );

  // Mã rỗng = gỡ dòng (không lưu mã rỗng làm rác).
  const l2 = await ghiMapBoqTheoDuAn(duAnA, pmId, [{ takeoffItemId: it2.id, boqCode: "  " }]);
  assert.deepEqual(l2, { ok: true, soGan: 0, soGo: 1 });
  assert.equal((await layMapBoqTheoDuAn(duAnA)).length, 1);

  // Id hạng mục không có trong rule pack → từ chối, KHÔNG ghi phần hợp lệ đứng trước nó.
  const loi = await ghiMapBoqTheoDuAn(duAnA, pmId, [
    { takeoffItemId: it2.id, boqCode: "A-99" },
    { takeoffItemId: "item-bia-ra", boqCode: "X" },
  ]);
  assert.equal(loi.ok, false);
  assert.equal((await layMapBoqTheoDuAn(duAnA)).length, 1, "không ghi dòng nào khi lô có id lạ");

  const dai = await ghiMapBoqTheoDuAn(duAnA, pmId, [
    { takeoffItemId: it1.id, boqCode: "X".repeat(200) },
  ]);
  assert.equal(dai.ok, false);
});

test("chotProjectIdChoDoc: không tin ?project= client gửi, chặn cả dự án org khác", S, async () => {
  const { chotProjectIdChoDoc } = await import("@/lib/ha-tang/projects");
  const pm = { id: pmId, role: "pm" as const, orgId: 1 };

  const duoc = await chotProjectIdChoDoc(pm, String(duAnA));
  assert.deepEqual(duoc, { ok: true, projectId: duAnA });

  // Dự án user KHÔNG được gán.
  const choi = await chotProjectIdChoDoc(pm, String(duAnB));
  assert.equal(choi.ok, false);

  // Dự án được gán nhưng THUỘC ORG KHÁC — visibleProjectIds cho qua, kiểm org phải chặn.
  const khacOrg = await chotProjectIdChoDoc(pm, String(duAnOrgKhac));
  assert.equal(khacOrg.ok, false, "không được nhảy org qua ?project=");

  for (const rac of ["abc", "-1", "0", "1.5"]) {
    assert.equal((await chotProjectIdChoDoc(pm, rac)).ok, false, `giá trị rác ${rac}`);
  }

  // Không truyền project mà chỉ thấy đúng 1 dự án trong org → suy ra được.
  const chiMot = await chotProjectIdChoDoc({ id: subconId, role: "subcon", orgId: 1 }, null);
  assert.deepEqual(chiMot, { ok: true, projectId: duAnA });
});

test(
  "boq-snapshot qua handler thật: KL hợp đồng đúng dự án, 401/403, chéo dự án bị chặn",
  S,
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
    const { ghiMapBoqTheoDuAn } = await import("@/lib/ky-thuat/cad/dashboard");
    const { danhSachItemBocTach } = await import("@/lib/ky-thuat/cad/dashboard");
    const { GET } = await import("@/app/api/engineering/cad/boq-snapshot/route");
    const [it1, it2] = danhSachItemBocTach();

    const maA = `MAP-A-${Date.now()}`;
    const maB = `MAP-B-${Date.now()}`;
    await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
     VALUES (?, 'Ống gió cấp HĐ', 'm', 120.5, 0, ?)`,
      maA,
      duAnA,
    );
    await insertId(
      `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, project_id)
     VALUES (?, 'Dòng BOQ của dự án B', 'm', 999, 0, ?)`,
      maB,
      duAnB,
    );
    // Dự án A gán 2 mã: 1 mã của chính mình + 1 mã THUỘC DỰ ÁN B (kịch bản dò chéo dự án).
    await ghiMapBoqTheoDuAn(duAnA, pmId, [
      { takeoffItemId: it1.id, boqCode: maA },
      { takeoffItemId: it2.id, boqCode: maB },
    ]);

    const token = await createCadToken(pmId, 1, "May test boq-snapshot", null);
    const goi = (url: string, key: string) =>
      GET(new NextRequest(url, { headers: { authorization: `Bearer ${key}` } }));

    const res = await goi(`http://x/api/engineering/cad/boq-snapshot?project=${duAnA}`, token.key);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      projectId: number;
      dong: { takeoffItemId: string; boqCode: string; qtyContract: number | null }[];
    };
    assert.equal(body.projectId, duAnA);
    const theoId = new Map(body.dong.map((d) => [d.takeoffItemId, d]));
    assert.equal(theoId.get(it1.id)?.qtyContract, 120.5);
    // Mã của dự án B: KHÔNG được trả KL của họ — chưa khớp thì null, không phải 999.
    assert.equal(theoId.get(it2.id)?.qtyContract, null, "không được lộ KL hợp đồng chéo dự án");

    // Dự án user không được gán → 403 (không phải trả rỗng im lặng).
    const cheo = await goi(`http://x/api/engineering/cad/boq-snapshot?project=${duAnB}`, token.key);
    assert.equal(cheo.status, 403);

    // Vai trò không có CAN.viewEngineeringGraph → 403 dù token hợp lệ.
    const tokenSub = await createCadToken(subconId, 1, "May thau phu", null);
    const res403 = await goi(
      `http://x/api/engineering/cad/boq-snapshot?project=${duAnA}`,
      tokenSub.key,
    );
    assert.equal(res403.status, 403);

    // Nhánh "không token/phiên → 401" KHÔNG gọi thẳng handler được: `getCurrentUser()` đọc
    // `headers()` của Next, ngoài phạm vi request là ném lỗi chứ không trả null. Nhánh đó được phủ
    // bằng ca route-source ở trên (đối chiếu nguyên văn `status: 401`), giống cách tests/cad-*.
    await run(`DELETE FROM boq_items WHERE code IN (?, ?)`, maA, maB);
  },
);

test(
  "rule-pack ?project=: trả mã BOQ của dự án; không có ?project= giữ hành vi cũ",
  S,
  async () => {
    const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
    const { ghiMapBoqTheoDuAn, danhSachItemBocTach } = await import("@/lib/ky-thuat/cad/dashboard");
    const { GET } = await import("@/app/api/engineering/cad/rule-pack/route");
    const [it1] = danhSachItemBocTach();
    await ghiMapBoqTheoDuAn(duAnA, pmId, [{ takeoffItemId: it1.id, boqCode: "RP-A-01" }]);

    const token = await createCadToken(pmId, 1, "May test rule-pack", null);
    const goi = (url: string) =>
      GET(new Request(url, { headers: { authorization: `Bearer ${token.key}` } }));

    const res = await goi(`http://x/api/engineering/cad/rule-pack?project=${duAnA}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      projectId?: number;
      takeoff: { items: { id: string; boqCode: string }[] };
    };
    assert.equal(body.projectId, duAnA);
    assert.equal(body.takeoff.items.find((i) => i.id === it1.id)?.boqCode, "RP-A-01");

    // Bản toàn cục: không có projectId, mã giữ nguyên như tệp rule pack (thường là rỗng).
    const resToanCuc = await goi("http://x/api/engineering/cad/rule-pack");
    const bodyToanCuc = (await resToanCuc.json()) as {
      projectId?: number;
      takeoff: { items: { id: string; boqCode: string }[] };
    };
    assert.equal(bodyToanCuc.projectId, undefined);
    assert.notEqual(bodyToanCuc.takeoff.items.find((i) => i.id === it1.id)?.boqCode, "RP-A-01");

    // ETag theo dự án: gửi lại đúng ETag → 304 (plugin không tải lại vô cớ).
    const etag = res.headers.get("etag");
    assert.ok(etag);
    const res304 = await GET(
      new Request(`http://x/api/engineering/cad/rule-pack?project=${duAnA}`, {
        headers: { authorization: `Bearer ${token.key}`, "if-none-match": etag! },
      }),
    );
    assert.equal(res304.status, 304);

    // Dự án không được gán → 403.
    const cheo = await goi(`http://x/api/engineering/cad/rule-pack?project=${duAnB}`);
    assert.equal(cheo.status, 403);
  },
);

test("RLS cad_takeoff_boq_map: role ứng dụng chỉ thấy/ghi được dự án trong GUC", S, async () => {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO cad_takeoff_boq_map (project_id, takeoff_item_id, boq_code)
     VALUES (?, 'rls-probe', 'RLS-A') ON CONFLICT DO NOTHING`,
    duAnA,
  );
  await run(
    `INSERT INTO cad_takeoff_boq_map (project_id, takeoff_item_id, boq_code)
     VALUES (?, 'rls-probe', 'RLS-B') ON CONFLICT DO NOTHING`,
    duAnB,
  );

  // TEST_DATABASE_URL trỏ role owner/superuser (chạy migration) — superuser BỎ QUA RLS, nên phải
  // mở pool riêng bằng `xboss_app` (0069 tạo, NOBYPASSRLS) mới kiểm được RLS thật.
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  const pool = new Pool({ connectionString: u.toString(), max: 2 });
  try {
    const chay = async <T>(guc: string, fn: (c: import("pg").PoolClient) => Promise<T>) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query("SELECT set_config('app.project_id', $1, true)", [guc]);
        return await fn(c);
      } finally {
        await c.query("ROLLBACK").catch(() => {});
        c.release();
      }
    };

    const thayA = await chay(String(duAnA), (c) =>
      c.query(
        `SELECT project_id, boq_code FROM cad_takeoff_boq_map WHERE takeoff_item_id = 'rls-probe'`,
      ),
    );
    assert.equal(thayA.rowCount, 1, "GUC dự án A chỉ thấy dòng của A");
    assert.equal(thayA.rows[0].boq_code, "RLS-A");

    // GUC RỖNG (đường đọc quên bọc withProjectScope) → policy nghiêm ngặt trả RỖNG, không lộ.
    const thayRong = await chay("", (c) =>
      c.query(`SELECT 1 FROM cad_takeoff_boq_map WHERE takeoff_item_id = 'rls-probe'`),
    );
    assert.equal(thayRong.rowCount, 0, "thiếu GUC phải trả rỗng, không phải trả hết");

    // WITH CHECK: đang ở ngữ cảnh dự án A mà ghi dòng dự án B → bị chặn.
    await assert.rejects(
      () =>
        chay(String(duAnA), (c) =>
          c.query(
            `INSERT INTO cad_takeoff_boq_map (project_id, takeoff_item_id, boq_code)
             VALUES ($1, 'rls-ghi-lau', 'X')`,
            [duAnB],
          ),
        ),
      /row-level security/i,
    );
  } finally {
    await pool.end();
  }

  await run(`DELETE FROM cad_takeoff_boq_map WHERE takeoff_item_id = 'rls-probe'`);
});
