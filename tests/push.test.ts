import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:https";
import { AddressInfo } from "node:net";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Web Push có 3 nhánh đáng khoá, và cả 3 đều dựng được BẰNG THẬT — không mock web-push:
//   1. chưa cấu hình VAPID → mọi hàm gửi là no-op (không được throw, không được ghi DB);
//   2. endpoint trả 404/410 (người dùng gỡ quyền / đổi trình duyệt) → subscription phải bị
//      DỌN khỏi bảng, nếu không hàng đợi push sẽ phình mãi bằng thiết bị chết;
//   3. endpoint lỗi khác (500) → KHÔNG được xoá subscription (lỗi tạm thời), chỉ log.
// Dựng một HTTP server cục bộ đóng vai push service để lấy đúng 3 nhánh đó.

// web-push TỪ CHỐI endpoint http:// (đúng như push service thật), nên server giả phải là
// HTTPS. Sinh chứng chỉ tự ký lúc chạy thay vì commit khoá vào repo; thiếu openssl thì
// `chungChi()` trả null và các ca dùng nó tự skip thay vì đỏ oan.
let tlsCache: { key: string; cert: string } | null | undefined;
function chungChi(): { key: string; cert: string } | null {
  if (tlsCache !== undefined) return tlsCache;
  const dir = mkdtempSync(join(tmpdir(), "xboss-push-"));
  try {
    execFileSync(
      "openssl",
      // prettier-ignore
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes",
       "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"),
       "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"],
      { stdio: "ignore" },
    );
    tlsCache = {
      key: readFileSync(join(dir, "k.pem"), "utf8"),
      cert: readFileSync(join(dir, "c.pem"), "utf8"),
    };
  } catch {
    tlsCache = null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return tlsCache;
}

/** Server đóng vai push service, trả về mã trạng thái đặt trước cho mọi request. */
function moPushService(status: number): Promise<{ server: Server; url: string }> {
  const tls = chungChi()!;
  return new Promise((resolve) => {
    const server = createServer(tls, (_req, res) => {
      res.writeHead(status);
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `https://127.0.0.1:${port}/push` });
    });
  });
}

const dongServer = (server: Server) => new Promise((r) => server.close(r));

// Chứng chỉ tự ký ở trên sẽ bị Node từ chối; nới đúng trong tiến trình test này (không phải
// mã sản phẩm) để web-push nói chuyện được với server giả.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

test("pushConfigured + gửi khi CHƯA cấu hình VAPID: no-op, trả 0", async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  try {
    const { pushConfigured, sendPushToUsers, sendPushToAll } =
      await import("@/lib/van-hanh/push?chua-cau-hinh");
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
  const { pushConfigured, sendPushToUsers } = await import("@/lib/van-hanh/push?rong");
  assert.equal(pushConfigured(), true);
  assert.equal(await sendPushToUsers([], { title: "t", body: "b" }), 0);
});

test(
  "sendToSubs: 410 dọn subscription chết, 500 giữ lại, 201 tính là đã gửi",
  { skip: !HAS_TEST_DB || !chungChi() },
  async () => {
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    process.env.VAPID_SUBJECT = "mailto:test@xboss.vn";

    const { insertId, queryOne, run } = await import("@/lib/db");
    const { sendPushToUsers } = await import("@/lib/van-hanh/push?that");

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
  { skip: !HAS_TEST_DB || !chungChi() },
  async () => {
    const webpush = (await import("web-push")).default;
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;

    const { insertId, run } = await import("@/lib/db");
    const { sendPushToAll } = await import("@/lib/van-hanh/push?all");

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
