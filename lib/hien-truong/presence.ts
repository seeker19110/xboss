// Theo dõi người dùng đang online (in-memory, TTL 2 phút).
// Mỗi instance process giữ map riêng — đủ tốt cho deployment 1 instance;
// muốn chính xác khi chạy nhiều instance cần chuyển sang Redis/DB.

const TTL_MS = 2 * 60_000; // 2 phút không heartbeat → coi là offline

export type PresenceEntry = {
  userId: number;
  name: string;
  role: string;
  lastSeen: number; // Date.now()
  orgId?: number;
};

const g = globalThis as unknown as { __xbossPresence?: Map<number, PresenceEntry> };
const store = () => (g.__xbossPresence ??= new Map());

export function heartbeat(user: { id: number; name: string; role: string; orgId?: number }): void {
  store().set(user.id, {
    userId: user.id,
    name: user.name,
    role: user.role,
    lastSeen: Date.now(),
    orgId: user.orgId,
  });
}

// orgId: chỉ trả người cùng tổ chức (AUD-SEC-008 — Map dùng chung toàn process, trước đây
// admin tổ chức A thấy tên/vai trò người online của tổ chức B). Bỏ trống = không lọc (test).
export function getOnlineUsers(orgId?: number): PresenceEntry[] {
  const now = Date.now();
  const result: PresenceEntry[] = [];
  for (const [id, e] of store()) {
    if (now - e.lastSeen > TTL_MS) {
      store().delete(id);
      continue;
    }
    if (orgId === undefined || e.orgId === orgId) result.push(e);
  }
  result.sort((a, b) => b.lastSeen - a.lastSeen);
  return result;
}
