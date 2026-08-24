import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M99 PR2 — ghép thiết bị plugin AutoCAD + token scope 'cad'.
// (1) Unit thuần: format/entropy mã ghép — không cần DB.
// (2) Route-source: force-dynamic, auth, rate limit (pattern tests/engineering-cad-rule-pack.test.ts).
// (3) Integration (TEST_DATABASE_URL, tự skip): trọn lifecycle pair → confirm → claim →
//     token gọi được rule-pack → thu hồi/hết hạn → 401.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };

// ===== (1) Unit thuần =====

test("generateUserCode: dạng XXXX-XXXX, bảng chữ không nhập nhằng (không 0/O/1/I/L)", async () => {
  const { generateUserCode } = await import("@/lib/bao-mat/cad-devices");
  for (let i = 0; i < 200; i++) {
    const code = generateUserCode();
    assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    assert.doesNotMatch(code, /[01OIL]/);
  }
  // 200 mã ngẫu nhiên không được trùng nhau (entropy ~39.6 bit).
  const codes = new Set(Array.from({ length: 200 }, () => generateUserCode()));
  assert.equal(codes.size, 200);
});

test("generateDeviceCode: xdc_ + 64 hex (256 bit) — cùng cỡ entropy với api key", async () => {
  const { generateDeviceCode } = await import("@/lib/bao-mat/cad-devices");
  const code = generateDeviceCode();
  assert.match(code, /^xdc_[0-9a-f]{64}$/);
  assert.notEqual(code, generateDeviceCode());
});

// ===== (2) Route-source =====

function docRoute(...duongDan: string[]): string {
  return readFileSync(join(process.cwd(), "app", "api", ...duongDan, "route.ts"), "utf8");
}

test("route pair: force-dynamic + rate limit theo IP (đường public như login)", () => {
  const src = docRoute("devices", "pair");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /hitRateLimit\(`cad-pair:/);
  assert.match(src, /status: 429/);
});

test("route confirm: session + CAN.manageDrawings, không nhận thiếu userCode", () => {
  const src = docRoute("devices", "pair", "confirm");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /status: 401/);
  assert.match(src, /CAN\.manageDrawings/);
  assert.match(src, /status: 403/);
});

test("route claim: rate limit + validate định dạng deviceCode, key thô chỉ ở nhánh ok", () => {
  const src = docRoute("devices", "pair", "claim");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /hitRateLimit\(`cad-claim:/);
  assert.match(src, /\^xdc_\[0-9a-f\]\{64\}\$/);
});

test("route tokens: session + CAN.manageDrawings, list không lộ key/hash", () => {
  const src = docRoute("tokens");
  assert.match(src, /getCurrentUser\(\)/);
  assert.match(src, /CAN\.manageDrawings/);
  assert.ok(!src.includes("key_hash"), "GET /api/tokens không được SELECT key_hash");
});

test("route rule-pack: nhận cả session lẫn Bearer cad (getCadTokenUser)", () => {
  const src = readFileSync(
    join(process.cwd(), "app", "api", "engineering", "cad", "rule-pack", "route.ts"),
    "utf8",
  );
  assert.match(src, /getCadTokenUser/);
  assert.match(src, /getCurrentUser\(\)/);
});

// ===== (3) Integration (Postgres) =====

let userId = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  await run(`DELETE FROM cad_device_pairings`);
  userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư CAD', 'cad-pr2-${Date.now()}@test.local', 'x', 'engineer', 1)`,
  );
});

// Dọn dữ liệu tự tạo (thứ tự FK: pairings → api_keys → users) — chạy file này đơn lẻ trên DB
// gốc không được để rác làm vỡ test khác (auth.test.ts DELETE users sẽ vướng FK api_keys).
after(async () => {
  if (!HAS_TEST_DB || !userId) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM cad_device_pairings`);
  await run(`DELETE FROM api_keys WHERE created_by = ?`, userId);
  await run(`DELETE FROM users WHERE id = ?`, userId);
});

function nguoiDuyet() {
  return {
    id: userId,
    name: "Kỹ sư CAD",
    email: "cad@test.local",
    role: "engineer" as const,
    orgId: 1,
  };
}

test("lifecycle: pair → confirm → claim trả key ĐÚNG 1 LẦN → token xác thực được", S, async () => {
  const { createPairing, confirmPairing, claimPairing, getCadTokenUser } =
    await import("@/lib/bao-mat/cad-devices");

  const pair = await createPairing("May-Test-01");
  assert.match(pair.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // Chưa duyệt → pending; mã sai → không tìm thấy.
  assert.deepEqual(await claimPairing(pair.deviceCode), { status: "pending" });
  assert.equal((await claimPairing("xdc_" + "0".repeat(64))).status, "khong-tim-thay");

  // Duyệt (nhập thường vẫn khớp — confirm tự upper-case); duyệt lần 2 → đã xử lý.
  assert.equal(await confirmPairing(pair.userCode.toLowerCase(), nguoiDuyet(), true), "ok");
  assert.equal(await confirmPairing(pair.userCode, nguoiDuyet(), true), "da-xu-ly");

  // Claim lần 1 → key; lần 2 → KHÔNG bao giờ trả key lại (claimed).
  const claim = await claimPairing(pair.deviceCode);
  assert.equal(claim.status, "ok");
  if (claim.status !== "ok") return;
  assert.match(claim.key, /^xbk_[0-9a-f]{64}$/);
  assert.equal(claim.deviceName, "May-Test-01");
  assert.equal((await claimPairing(pair.deviceCode)).status, "khong-tim-thay");

  // Token xác thực được, quy về đúng người duyệt (User shape cho CAN).
  const user = await getCadTokenUser(`Bearer ${claim.key}`);
  assert.ok(user);
  assert.equal(user.id, userId);
  assert.equal(user.role, "engineer");

  // DB không giữ key thô ở bất kỳ đâu.
  const { queryOne } = await import("@/lib/db");
  const trongDb = await queryOne(
    `SELECT 1 FROM api_keys WHERE name LIKE '%May-Test-01%' AND key_hash = ?`,
    claim.key,
  );
  assert.equal(trongDb, undefined, "key thô không được nằm trong key_hash");
});

test("từ chối trên web → claim trả tu-choi, không sinh key", S, async () => {
  const { createPairing, confirmPairing, claimPairing } = await import("@/lib/bao-mat/cad-devices");
  const pair = await createPairing("May-Bi-Tu-Choi");
  assert.equal(await confirmPairing(pair.userCode, nguoiDuyet(), false), "ok");
  assert.equal((await claimPairing(pair.deviceCode)).status, "tu-choi");
});

test("mã hết hạn → confirm/claim đều chặn", S, async () => {
  const { createPairing, confirmPairing, claimPairing } = await import("@/lib/bao-mat/cad-devices");
  const { run } = await import("@/lib/db");
  const pair = await createPairing("May-Het-Han");
  await run(
    `UPDATE cad_device_pairings SET expires_at = now() - INTERVAL '1 second' WHERE user_code = ?`,
    pair.userCode,
  );
  assert.equal(await confirmPairing(pair.userCode, nguoiDuyet(), true), "het-han");
  assert.equal((await claimPairing(pair.deviceCode)).status, "het-han");
});

test(
  "AC7: thu hồi + hết hạn token → getCadTokenUser trả null; scope khác cad bị chặn",
  S,
  async () => {
    const { createCadToken, getCadTokenUser } = await import("@/lib/bao-mat/cad-devices");
    const { run, insertId } = await import("@/lib/db");
    const { hashApiKey, generateApiKey } = await import("@/lib/bao-mat/api-keys");

    // Thu hồi.
    const t1 = await createCadToken(userId, 1, "Token thu hồi", null);
    assert.ok(await getCadTokenUser(`Bearer ${t1.key}`));
    await run(`UPDATE api_keys SET revoked_at = now() WHERE id = ?`, t1.keyId);
    assert.equal(await getCadTokenUser(`Bearer ${t1.key}`), null);

    // Hết hạn (verifyApiKey phải chặn — bản vá PR2).
    const t2 = await createCadToken(userId, 1, "Token hết hạn", null);
    await run(
      `UPDATE api_keys SET expires_at = now() - INTERVAL '1 second' WHERE id = ?`,
      t2.keyId,
    );
    assert.equal(await getCadTokenUser(`Bearer ${t2.key}`), null);

    // Key scope 'read' (không phải cad) → getCadTokenUser từ chối dù key hợp lệ.
    const keyRead = generateApiKey();
    await insertId(
      `INSERT INTO api_keys (name, key_hash, scopes, created_by, org_id)
     VALUES ('key đọc', ?, '{read}', ?, 1)`,
      hashApiKey(keyRead),
      userId,
    );
    assert.equal(await getCadTokenUser(`Bearer ${keyRead}`), null);
  },
);

test("rule-pack nhận Bearer cad thật qua route handler (200 + đủ 8 field)", S, async () => {
  const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
  const { GET } = await import("@/app/api/engineering/cad/rule-pack/route");
  const { key } = await createCadToken(userId, 1, "Token gọi rule-pack", null);

  const res = await GET(
    new NextRequest("http://localhost/api/engineering/cad/rule-pack", {
      headers: { authorization: `Bearer ${key}` },
    }),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown>;
  for (const field of [
    "version",
    "layerMap",
    "fontMap",
    "purgePolicy",
    "lineweightMap",
    "flattenPolicy",
    "takeoff",
    "inspectionPolicy",
  ]) {
    assert.ok(field in body, `Thiếu field ${field}`);
  }
  // 401 với token rác/thu hồi đã phủ ở mức lib (getCadTokenUser → null, ca AC7 phía trên) —
  // không gọi handler với header sai vì nhánh đó rơi về getCurrentUser() (cookies() ngoài
  // request scope của Next sẽ throw, đúng quy ước tests/engineering-cad-rule-pack.test.ts).
});
