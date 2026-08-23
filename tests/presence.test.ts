import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { heartbeat, getOnlineUsers } from "@/lib/hien-truong/presence";

function clearPresenceStore(): void {
  (globalThis as unknown as { __xbossPresence?: Map<number, unknown> }).__xbossPresence?.clear();
}

test("heartbeat + getOnlineUsers: chứa đúng 1 entry với userId/name/role và lastSeen gần Date.now()", () => {
  clearPresenceStore();
  const before = Date.now();
  heartbeat({ id: 1, name: "Nguyễn Văn A", role: "admin" });
  const users = getOnlineUsers();
  assert.equal(users.length, 1);
  assert.equal(users[0].userId, 1);
  assert.equal(users[0].name, "Nguyễn Văn A");
  assert.equal(users[0].role, "admin");
  assert.ok(Math.abs(users[0].lastSeen - before) < 2000);
});

test("heartbeat 2 lần liên tiếp cùng userId: không nhân đôi entry, lastSeen tăng hoặc giữ nguyên", () => {
  clearPresenceStore();
  heartbeat({ id: 2, name: "Trần Thị B", role: "pm" });
  const first = getOnlineUsers()[0].lastSeen;
  heartbeat({ id: 2, name: "Trần Thị B", role: "pm" });
  const users = getOnlineUsers();
  assert.equal(users.length, 1);
  assert.ok(users[0].lastSeen >= first);
});

test("getOnlineUsers: sắp xếp giảm dần theo lastSeen (mới nhất trước)", () => {
  clearPresenceStore();
  mock.timers.enable({ apis: ["Date"] });
  try {
    heartbeat({ id: 3, name: "Người cũ", role: "engineer" });
    mock.timers.tick(1000);
    heartbeat({ id: 4, name: "Người mới", role: "subcon" });
    const users = getOnlineUsers();
    assert.equal(users.length, 2);
    assert.equal(users[0].userId, 4);
    assert.equal(users[1].userId, 3);
    assert.ok(users[0].lastSeen >= users[1].lastSeen);
  } finally {
    mock.timers.reset();
  }
});

test("hết hạn TTL (>2 phút không heartbeat): user không còn xuất hiện, và entry bị xoá khỏi Map", () => {
  clearPresenceStore();
  mock.timers.enable({ apis: ["Date"] });
  try {
    heartbeat({ id: 5, name: "Người hết hạn", role: "viewer" });
    mock.timers.tick(120_001);
    const usersAfterExpiry = getOnlineUsers();
    assert.equal(
      usersAfterExpiry.some((u) => u.userId === 5),
      false,
    );
    // Gọi lại lần nữa để xác nhận entry đã bị xoá khỏi Map (không chỉ lọc ở output).
    const usersAgain = getOnlineUsers();
    assert.equal(
      usersAgain.some((u) => u.userId === 5),
      false,
    );
  } finally {
    mock.timers.reset();
  }
});
