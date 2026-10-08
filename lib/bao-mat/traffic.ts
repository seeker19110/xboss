// Ring buffer lưu traffic gần nhất — chạy trong Node.js runtime, không chia sẻ với Edge.
// Restart process → buffer xoá. Đủ cho realtime monitor; không cần persist.
//
// S02e: mỗi entry gắn `orgId` của phiên đã ký (proxy suy từ cookie, null = ẩn danh/không phiên
// hợp lệ). Màn admin CHỈ đọc qua `getRecentOfOrg`/`subscribeTrafficOfOrg` — traffic org khác và
// traffic ẩn danh không hiện cho admin org nào. `getRecent`/`subscribeTraffic` (không lọc) chỉ
// dành cho nội bộ/test.

export type TrafficEntry = {
  id: number;
  ts: number; // Date.now()
  method: string;
  path: string;
  ip: string;
  ua: string; // user-agent (rút gọn)
  orgId: number | null; // tổ chức của phiên gửi request; null = ẩn danh
};

const MAX = 500;
let seq = 0;
const buf: TrafficEntry[] = [];
// Danh sách callback của các SSE kết nối đang mở.
let listeners: Array<(e: TrafficEntry) => void> = [];

export function recordTraffic(e: Omit<TrafficEntry, "id">): TrafficEntry {
  const entry: TrafficEntry = { id: ++seq, ...e };
  if (buf.length >= MAX) buf.shift();
  buf.push(entry);
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      /* subscriber đã đóng */
    }
  }
  return entry;
}

/** Trả về các entry có id > since (hoặc toàn bộ nếu since không truyền). Không lọc org. */
export function getRecent(since?: number): TrafficEntry[] {
  if (since == null) return [...buf];
  return buf.filter((e) => e.id > since);
}

/** Như `getRecent` nhưng chỉ entry của tổ chức `orgId` (không gồm ẩn danh). */
export function getRecentOfOrg(orgId: number, since?: number): TrafficEntry[] {
  return getRecent(since).filter((e) => e.orgId === orgId);
}

/** Đăng ký nhận entry mới theo thời gian thực. Trả về hàm huỷ đăng ký. Không lọc org. */
export function subscribeTraffic(fn: (e: TrafficEntry) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/** Như `subscribeTraffic` nhưng chỉ chuyển entry của tổ chức `orgId`. */
export function subscribeTrafficOfOrg(orgId: number, fn: (e: TrafficEntry) => void): () => void {
  return subscribeTraffic((e) => {
    if (e.orgId === orgId) fn(e);
  });
}

export function latestId(): number {
  return seq;
}
