// Ring buffer lưu traffic gần nhất — chạy trong Node.js runtime, không chia sẻ với Edge.
// Restart process → buffer xoá. Đủ cho realtime monitor; không cần persist.

export type TrafficEntry = {
  id: number;
  ts: number;      // Date.now()
  method: string;
  path: string;
  ip: string;
  ua: string;      // user-agent (rút gọn)
};

const MAX = 500;
let seq = 0;
const buf: TrafficEntry[] = [];
// Danh sách callback của các SSE kết nối đang mở.
let listeners: Array<(e: TrafficEntry) => void> = [];

export function recordTraffic(e: Omit<TrafficEntry, 'id'>): TrafficEntry {
  const entry: TrafficEntry = { id: ++seq, ...e };
  if (buf.length >= MAX) buf.shift();
  buf.push(entry);
  for (const fn of listeners) {
    try { fn(entry); } catch { /* subscriber đã đóng */ }
  }
  return entry;
}

/** Trả về các entry có id > since (hoặc toàn bộ nếu since không truyền). */
export function getRecent(since?: number): TrafficEntry[] {
  if (since == null) return [...buf];
  return buf.filter(e => e.id > since);
}

/** Đăng ký nhận entry mới theo thời gian thực. Trả về hàm huỷ đăng ký. */
export function subscribeTraffic(fn: (e: TrafficEntry) => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

export function latestId(): number { return seq; }
