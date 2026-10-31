import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// Giãn nhịp đồng bộ cảnh báo on-fetch của chuông thông báo (GET /api/notifications):
// trong TTL chỉ đọc danh sách, hết TTL / header X-XBoss-Notif-Sync mới chạy syncAndListNotifications.

const user = (over: Partial<{ id: number; role: string; orgId: number }> = {}) =>
  ({ id: 7, name: "U", email: "u@x", role: "pm", orgId: 1, ...over }) as never;

test("nhịp đồng bộ: trong TTL là fresh, hết TTL thì phải đồng bộ lại", async () => {
  const { notificationSyncKey, notificationSyncFresh, markNotificationSynced } =
    await import("@/lib/dich-vu/thong-bao");
  const key = notificationSyncKey(user({ id: 101 }), 5);
  assert.equal(notificationSyncFresh(key, 1_000, 120_000), false, "chưa đồng bộ lần nào");
  markNotificationSynced(key, 1_000, 120_000);
  assert.equal(notificationSyncFresh(key, 1_000 + 119_999, 120_000), true);
  assert.equal(
    notificationSyncFresh(key, 1_000 + 120_000, 120_000),
    false,
    "đúng mốc TTL → đồng bộ",
  );
});

test("nhịp đồng bộ: TTL = 0 luôn đồng bộ (hành vi cũ)", async () => {
  const { notificationSyncKey, notificationSyncFresh, markNotificationSynced } =
    await import("@/lib/dich-vu/thong-bao");
  const key = notificationSyncKey(user({ id: 102 }), 5);
  markNotificationSynced(key, 5_000, 0);
  assert.equal(notificationSyncFresh(key, 5_000, 0), false);
});

test("nhịp đồng bộ: khoá tách theo tổ chức, user, vai trò, dự án", async () => {
  const { notificationSyncKey, notificationSyncFresh, markNotificationSynced } =
    await import("@/lib/dich-vu/thong-bao");
  const base = user({ id: 103 });
  markNotificationSynced(notificationSyncKey(base, 1), 10_000, 60_000);
  assert.equal(notificationSyncFresh(notificationSyncKey(base, 1), 10_001, 60_000), true);
  for (const k of [
    notificationSyncKey(base, 2), // đổi dự án
    notificationSyncKey(user({ id: 103, role: "engineer" }), 1), // đổi vai trò
    notificationSyncKey(user({ id: 103, orgId: 2 }), 1), // đổi tổ chức
    notificationSyncKey(user({ id: 104 }), 1), // user khác
  ]) {
    assert.equal(notificationSyncFresh(k, 10_001, 60_000), false, k);
  }
});

test("nhịp đồng bộ: môi trường test tắt giãn nhịp (XBOSS_NOTIF_SYNC_TTL_MS=0)", async () => {
  // tests/setup.ts đặt "0" cho môi trường test (đọc qua getServerEnv() khi route chạy — cần
  // DATABASE_URL nên ở đây chỉ kiểm giá trị biến môi trường đã đặt).
  assert.equal(process.env.XBOSS_NOTIF_SYNC_TTL_MS, "0");
});

test("route GET /api/notifications: chuông chỉ ép đồng bộ khi mở (header X-XBoss-Notif-Sync) — kiểm mã nguồn nối đúng", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync("app/api/notifications/route.ts", "utf8");
  assert.match(route, /headers\.get\("x-xboss-notif-sync"\) === "1"/);
  assert.match(route, /!forceSync && notificationSyncFresh\(syncKey\)/);
  assert.match(route, /markNotificationSynced\(syncKey\)/);
  const bell = readFileSync("app/components/NotificationBell.tsx", "utf8");
  assert.match(bell, /"X-XBoss-Notif-Sync": "1"/);
});
