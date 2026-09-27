// Web Push qua VAPID — gửi thông báo đẩy tới điện thoại/máy tính đã đăng ký,
// kể cả khi không mở app. Không cấu hình VAPID key → mọi hàm gửi là no-op.
import webpush from "web-push";
import { Agent } from "node:https";
import { query, run } from "@/lib/db";
import { log } from "@/lib/nen/log";
import { safeLookup, validateWebhookUrl } from "@/lib/bao-mat/webhooks";

export type PushPayload = { title: string; body: string; url?: string };

type SubRow = { id: number; endpoint: string; p256dh: string; auth: string };

// Endpoint do trình duyệt gửi lên vẫn là dữ liệu không tin cậy. Kiểm cả lúc đăng ký
// lẫn lúc gửi để subscription cũ không thể gọi tới dịch vụ nội bộ.
export function isSafePushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" && !url.username && !url.password && validateWebhookUrl(endpoint).ok
    );
  } catch {
    return false;
  }
}

// Ghim kiểm DNS ngay ở tầng connect, không resolve trước rồi để client resolve lại.
// HTTPS giữ nguyên kiểm chứng chỉ/SNI; web-push không tự theo redirect.
const pushAgent = new Agent({ lookup: safeLookup });

export function pushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@xboss.vn",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidReady = true;
}

async function sendToSubs(subs: SubRow[], payload: PushPayload): Promise<number> {
  ensureVapid();
  const body = JSON.stringify(payload);
  let sent = 0;
  for (const s of subs) {
    if (!isSafePushEndpoint(s.endpoint)) continue;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { agent: pushAgent, timeout: 10_000 },
      );
      sent++;
    } catch (err) {
      // 404/410 = subscription chết (user gỡ quyền/đổi trình duyệt) → dọn khỏi DB.
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410)
        await run(`DELETE FROM push_subscriptions WHERE id = ?`, s.id);
      // Lỗi khác (VAPID sai, quota, timeout...) không nên bị nuốt im lặng — dự án chưa
      // có observability (Sentry), nên đây là dấu vết duy nhất để phát hiện push gửi hỏng.
      else
        log.error("Gửi web push thất bại", {
          route: "lib/push.ts",
          subscriptionId: s.id,
          errorCode: code ?? null,
          err: err instanceof Error ? err.message : String(err),
        });
    }
  }
  return sent;
}

// Gửi cho danh sách user cụ thể (vd: người liên quan tới bình luận).
export async function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<number> {
  if (!pushConfigured() || userIds.length === 0) return 0;
  const placeholders = userIds.map(() => "?").join(",");
  const subs = await query<SubRow>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id IN (${placeholders})`,
    ...userIds,
  );
  return sendToSubs(subs, payload);
}

// Gửi cho mọi thiết bị đã đăng ký (vd: tóm tắt báo cáo ngày).
export async function sendPushToAll(payload: PushPayload): Promise<number> {
  if (!pushConfigured()) return 0;
  const subs = await query<SubRow>(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions`);
  return sendToSubs(subs, payload);
}
