import { TRAFFIC_TOKEN_HEADER } from "@/lib/bao-mat/traffic-token";

// Gom lô telemetry traffic của proxy: thay vì 1 POST ingest cho MỖI request /api, đẩy entry vào
// mảng module-level rồi flush 1 POST (body là mảng) mỗi ~1s hoặc khi đủ 50 entry. Không gọi
// recordTraffic trực tiếp vì bundle proxy và route có thể không chung instance module.
// Tiến trình chết giữa 2 lần flush mất ≤1s telemetry (chấp nhận được, ring buffer vốn mất khi restart).

export type TrafficPayload = {
  method: string;
  path: string;
  ip: string;
  ua: string;
  ts: number;
  orgId: number | null;
};
type Target = { url: string; token: string };

export const TRAFFIC_BATCH_MAX = 50;
export const TRAFFIC_BATCH_MS = 1_000;

let queue: TrafficPayload[] = [];
let target: Target | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Gửi ngay toàn bộ lô đang chờ (1 POST). Lỗi mạng bị nuốt — telemetry không được làm hỏng request. */
export function flushTraffic(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  if (queue.length === 0 || !target) return;
  const batch = queue;
  const { url, token } = target;
  queue = [];
  target = null;
  fetch(url, {
    method: "POST",
    redirect: "error", // Không chuyển tiếp token nội bộ sang đích redirect.
    headers: { "Content-Type": "application/json", [TRAFFIC_TOKEN_HEADER]: token },
    body: JSON.stringify(batch),
  }).catch(() => {});
}

/** Xếp 1 entry vào lô; đích (URL/token) đổi giữa chừng thì flush lô cũ trước. */
export function enqueueTraffic(entry: TrafficPayload, next: Target): void {
  if (target && (target.url !== next.url || target.token !== next.token)) flushTraffic();
  target = next;
  queue.push(entry);
  if (queue.length >= TRAFFIC_BATCH_MAX) {
    flushTraffic();
    return;
  }
  if (timer === undefined) {
    timer = setTimeout(flushTraffic, TRAFFIC_BATCH_MS);
    timer.unref?.();
  }
}
