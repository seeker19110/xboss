import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M99 PR2 — token thiết bị plugin AutoCAD + luồng ghép thiết bị. Integration (cần
// Postgres qua TEST_DATABASE_URL, không có thì tự skip). Kiểm: pairing đủ vòng đời
// (pending → confirmed → consumed, token thô chỉ phát 1 lần), secret sai, hết hạn,
// verify token (hợp lệ / thu hồi / hết hạn / tiền tố lạ), token mang đúng user (AC7).
import { test, before } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

let U = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  // Upsert idempotent — test DB dùng lại giữa các lần chạy, email UNIQUE.
  const { query } = await import("@/lib/db");
  const rows = await query<{ id: number }>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('TokenTest','api-token-test@x.vn','engineer','x')
     ON CONFLICT (email) DO UPDATE SET role = 'engineer'
     RETURNING id`,
  );
  U = rows[0].id;
});

test("pairing: pending → confirm → poll phát token đúng 1 lần → consumed", S, async () => {
  const { createPairing, confirmPairing, pollPairing } = await import("@/lib/bao-mat/api-tokens");
  const p = await createPairing("May tram test");
  assert.equal(p.deviceCode.length, 8);
  assert.ok(p.deviceSecret.startsWith("xbp_"));

  // Chưa duyệt → pending.
  assert.deepEqual(await pollPairing(p.deviceCode, p.deviceSecret), { status: "pending" });

  // Duyệt trên web (atomic — duyệt lần 2 phải fail).
  const kq = await confirmPairing(p.deviceCode, U);
  assert.equal(kq?.deviceName, "May tram test");
  assert.equal(await confirmPairing(p.deviceCode, U), null);

  // Poll sau duyệt → token thô, đúng 1 lần.
  const ready = await pollPairing(p.deviceCode, p.deviceSecret);
  assert.equal(ready.status, "ready");
  if (ready.status !== "ready") return;
  assert.ok(ready.token.startsWith("xbt_"));
  assert.ok(ready.expiresAt > new Date().toISOString());

  // Poll lần nữa → not_found (token không bao giờ phát lại).
  assert.deepEqual(await pollPairing(p.deviceCode, p.deviceSecret), { status: "not_found" });

  // Token nhận được xác thực ra ĐÚNG user đã duyệt, scope cad.
  const { verifyDeviceToken } = await import("@/lib/bao-mat/api-tokens");
  const auth = await verifyDeviceToken(`Bearer ${ready.token}`);
  assert.equal(auth?.user.id, U);
  assert.equal(auth?.user.role, "engineer");
  assert.equal(auth?.scopes, "cad");
});

test(
  "pairing: secret sai → not_found (không lộ mã tồn tại), mã hết hạn → not_found",
  S,
  async () => {
    const { createPairing, pollPairing } = await import("@/lib/bao-mat/api-tokens");
    const { run } = await import("@/lib/db");
    const p = await createPairing("");
    assert.deepEqual(await pollPairing(p.deviceCode, "xbp_" + "0".repeat(64)), {
      status: "not_found",
    });

    // Ép hết hạn → poll đúng secret cũng not_found; confirm cũng fail.
    await run(
      `UPDATE device_pairings SET expires_at = NOW() - INTERVAL '1 minute' WHERE device_code = ?`,
      p.deviceCode,
    );
    assert.deepEqual(await pollPairing(p.deviceCode, p.deviceSecret), { status: "not_found" });
    const { confirmPairing } = await import("@/lib/bao-mat/api-tokens");
    assert.equal(await confirmPairing(p.deviceCode, U), null);
  },
);

test("verify: token thu hồi/hết hạn/tiền tố lạ → null (AC7)", S, async () => {
  const { generateDeviceToken, hashToken, verifyDeviceToken } =
    await import("@/lib/bao-mat/api-tokens");
  const { run, insertId } = await import("@/lib/db");

  const tokThuHoi = generateDeviceToken();
  await insertId(
    `INSERT INTO api_tokens (user_id, name, token_hash, expires_at, revoked_at)
     VALUES (?, 'thu-hoi', ?, NOW() + INTERVAL '90 days', NOW())`,
    U,
    hashToken(tokThuHoi),
  );
  assert.equal(await verifyDeviceToken(`Bearer ${tokThuHoi}`), null);

  const tokHetHan = generateDeviceToken();
  await insertId(
    `INSERT INTO api_tokens (user_id, name, token_hash, expires_at)
     VALUES (?, 'het-han', ?, NOW() - INTERVAL '1 minute')`,
    U,
    hashToken(tokHetHan),
  );
  assert.equal(await verifyDeviceToken(`Bearer ${tokHetHan}`), null);

  // Header sai dạng / tiền tố api key xbk_ không đi lọt đường token thiết bị.
  assert.equal(await verifyDeviceToken(null), null);
  assert.equal(await verifyDeviceToken(`Bearer xbk_${"a".repeat(64)}`), null);

  // Token hợp lệ vẫn xác thực được (đối chứng cùng ca).
  const tokSong = generateDeviceToken();
  await insertId(
    `INSERT INTO api_tokens (user_id, name, token_hash, expires_at)
     VALUES (?, 'song', ?, NOW() + INTERVAL '90 days')`,
    U,
    hashToken(tokSong),
  );
  const auth = await verifyDeviceToken(`Bearer ${tokSong}`);
  assert.equal(auth?.user.id, U);

  // Thu hồi (đường DELETE /api/tokens/:id đặt revoked_at) → verify chết ngay.
  await run(`UPDATE api_tokens SET revoked_at = NOW() WHERE token_hash = ?`, hashToken(tokSong));
  assert.equal(await verifyDeviceToken(`Bearer ${tokSong}`), null);
});
