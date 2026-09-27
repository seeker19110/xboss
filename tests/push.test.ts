import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import webpush from "web-push";

// Mock đúng biên gửi HTTP: mọi endpoint ở đây là hostname public, còn chặn địa chỉ
// nội bộ/DNS rebinding được kiểm riêng trong audit-push-ssrf.test.ts. Giữ nguyên
// các assertion DB cho subscription chết, lỗi tạm thời và số người nhận.
async function moPushService(status: number) {
  const handle = mock.method(webpush, "sendNotification", async () => {
    if (status >= 400) throw Object.assign(new Error(`HTTP ${status}`), { statusCode: status });
    return { statusCode: status, body: "", headers: {} };
  });
  return { server: handle.mock, url: "https://push.example.test/push" };
}

const dongServer = async (server: { restore(): void }) => server.restore();

test("pushConfigured + gửi khi CHƯA cấu hình VAPID: no-op, trả 0", async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  try {
    const { pushConfigured, sendPushToUsers, sendPushToAll } = await import("@/lib/van-hanh/push");
    assert.equal(pushConfigured(), false);
    // Không chạm DB, không throw — kể cả khi có danh sách người nhận.
    assert.equal(await sendPushToUsers([1, 2], { title: "t", body: "b" }), 0);
    assert.equal(await sendPushToAll({ title: "t", body: "b" }), 0);
  } finally {
    if (VAPID_PUBLIC_KEY) process.env.VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;
    if (VAPID_PRIVATE_KEY) process.env.VAPID_PRIVATE_KEY = VAPID_PRIVATE_KEY;
  }
});

test("sendPushToUsers: danh sách người nhận rỗng là no-op ngay cả khi đã cấu hình", async () => {
  const webpush = (await import("web-push")).default;
  const keys = webpush.generateVAPIDKeys();
  process.env.VAPID_PUBLIC_KEY = keys.publicKey;
  process.env.VAPID_PRIVATE_KEY = keys.privateKey;
  const { pushConfigured, sendPushToUsers } = await import("@/lib/van-hanh/push");
  assert.equal(pushConfigured(), true);
  assert.equal(await sendPushToUsers([], { title: "t", body: "b" }), 0);
});

test(
  "sendToSubs: 410 dọn subscription chết, 500 giữ lại, 201 tính là đã gửi",
  { skip: !HAS_TEST_DB },
  async () => {
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@xboss.vn";

    const { insertId, queryOne, run } = await import("@/lib/db");
    const { sendPushToUsers } = await import("@/lib/van-hanh/push");

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Push Test', ?, 'x', 'pm')`,
      `push-${Date.now()}@test.vn`,
    );

    // Khoá p256dh/auth phải là khoá thật thì web-push mới mã hoá được payload; sinh bằng
    // chính thư viện thay vì bịa chuỗi base64 (bịa sẽ lỗi ở bước mã hoá, chưa tới HTTP).
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    void privateKey;
    const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");

    const dangKy = async (url: string) =>
      insertId(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)`,
        userId,
        url,
        publicKey,
        auth,
      );

    // (a) 410 Gone → phải xoá khỏi DB.
    const goner = await moPushService(410);
    const idChet = await dangKy(goner.url);
    const sent410 = await sendPushToUsers([userId], { title: "t", body: "b" });
    await dongServer(goner.server);
    assert.equal(sent410, 0, "410 không tính là đã gửi");
    assert.equal(
      await queryOne(`SELECT id FROM push_subscriptions WHERE id = ?`, idChet),
      undefined,
      "subscription chết phải bị dọn khỏi DB",
    );

    // (b) 500 → lỗi tạm thời, KHÔNG được xoá.
    const loi = await moPushService(500);
    const idLoi = await dangKy(loi.url);
    const sent500 = await sendPushToUsers([userId], { title: "t", body: "b" });
    await dongServer(loi.server);
    assert.equal(sent500, 0);
    assert.ok(
      await queryOne(`SELECT id FROM push_subscriptions WHERE id = ?`, idLoi),
      "lỗi 500 là tạm thời — không được xoá subscription",
    );
    await run(`DELETE FROM push_subscriptions WHERE id = ?`, idLoi);

    // (c) 201 Created → đếm là đã gửi.
    const ok = await moPushService(201);
    const idOk = await dangKy(ok.url);
    const sentOk = await sendPushToUsers([userId], { title: "t", body: "b" });
    await dongServer(ok.server);
    assert.equal(sentOk, 1);
    await run(`DELETE FROM push_subscriptions WHERE id = ?`, idOk);
  },
);

test(
  "sendPushToAll: gửi cho mọi thiết bị đã đăng ký, không lọc theo user",
  { skip: !HAS_TEST_DB },
  async () => {
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;

    const { insertId, run } = await import("@/lib/db");
    const { sendPushToAll } = await import("@/lib/van-hanh/push");

    await run(`DELETE FROM push_subscriptions`);
    const ok = await moPushService(201);
    const { publicKey } = webpush.generateVAPIDKeys();
    const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
    for (const ten of ["a", "b"]) {
      const uid = await insertId(
        `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'x', 'pm')`,
        `Push ${ten}`,
        `push-all-${ten}-${Date.now()}@test.vn`,
      );
      await insertId(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)`,
        uid,
        `${ok.url}/${ten}`,
        publicKey,
        auth,
      );
    }
    const sent = await sendPushToAll({ title: "Báo cáo ngày", body: "tóm tắt" });
    await dongServer(ok.server);
    assert.equal(sent, 2, "phải gửi tới cả 2 thiết bị của 2 người khác nhau");
    await run(`DELETE FROM push_subscriptions`);
  },
);
