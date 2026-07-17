// Webhook ra ngoài (M49 PR2). Đẩy sự kiện nghiệp vụ quan trọng của XBoss tới hệ ngoài qua
// HTTP POST có ký HMAC-SHA256. Hai pha tách bạch:
//   - emitWebhook(): gọi TỪ route nghiệp vụ, fire-and-forget — chỉ INSERT webhook_deliveries
//     cho mọi webhook active khớp sự kiện + dự án. KHÔNG gọi HTTP (không chặn request nghiệp
//     vụ), nuốt mọi lỗi để phát webhook hỏng không làm hỏng nghiệp vụ.
//   - deliverDueWebhooks(): gọi TỪ cron — gửi thật các delivery đến hạn, retry theo backoff.
// Xem migrations/0060_webhooks.sql + docs/nang-cap/M49-api-mo-sso.md (PR2).
import { createHmac } from "node:crypto";
import { query, run, withTransaction } from "@/lib/db";
import { log } from "@/lib/log";

// Danh sách đóng các sự kiện được phép phát (whitelist). UI chọn sự kiện từ đây.
export const WEBHOOK_EVENTS = [
  "task.approved",
  "variation.approved",
  "payment_cert.approved",
  "material.over_norm",
  "inspection.requested",
  "ping",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// Backoff giữa các lần thử lại (theo số lần đã thử): lần 1 lỗi → +5 phút, lần 2 → +30 phút,
// lần 3/4 → +2 giờ. attempts >= 5 → bỏ cuộc (status='failed'), không lên lịch lại.
const BACKOFF: string[] = ["5 minutes", "30 minutes", "2 hours", "2 hours", "2 hours"];
const MAX_ATTEMPTS = 5;
const SEND_TIMEOUT_MS = 10_000;
const DELIVER_BATCH = 50;

// Chống SSRF: chặn URL trỏ về nội bộ/loopback/link-local. Chỉ literal IP mới bị chặn ở đây
// (theo đặc tả) — domain thường được cho qua (validate ở API quản lý lúc tạo/sửa webhook,
// KHÔNG lúc gửi để không chặn nhầm khi DNS đổi).
function isPrivateIp(host: string): boolean {
  if (host === "::1") return true; // IPv6 loopback
  if (host.startsWith("fe80:")) return true; // IPv6 link-local
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // IPv6 unique-local
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false; // không phải literal IPv4 → domain, cho qua
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

// Validate URL webhook lúc tạo/sửa (API quản lý). https bắt buộc; http chỉ khi không phải
// production (dev test). Hostname không được là IP nội bộ/loopback/link-local/localhost.
export function validateWebhookUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "URL webhook không hợp lệ" };
  }
  const isProd = process.env.NODE_ENV === "production";
  const httpsOk = u.protocol === "https:";
  const httpOk = u.protocol === "http:" && !isProd;
  if (!httpsOk && !httpOk)
    return {
      ok: false,
      error: isProd
        ? "URL webhook phải dùng https://"
        : "URL webhook phải dùng http:// hoặc https://",
    };
  // hostname của IPv6 giữ nguyên dấu ngoặc vuông (vd "[::1]") — bỏ ngoặc để so khớp literal IP.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || isPrivateIp(host))
    return { ok: false, error: "URL webhook không được trỏ tới địa chỉ nội bộ/loopback" };
  return { ok: true, url: u.toString() };
}

// Payload chuẩn gửi ra: { event, sentAt, projectId, data }.
export type WebhookPayload = {
  event: WebhookEvent;
  sentAt: string;
  projectId: number | null;
  data: Record<string, unknown>;
};

// Phát sự kiện từ route nghiệp vụ (fire-and-forget). Chỉ INSERT webhook_deliveries cho mọi
// webhook active có event khớp + (project_id IS NULL OR = projectId). Nuốt mọi lỗi.
export async function emitWebhook(
  event: WebhookEvent,
  projectId: number | null,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const payload: WebhookPayload = {
      event,
      sentAt: new Date().toISOString(),
      projectId,
      data,
    };
    // 1 câu lệnh: chèn đúng 1 delivery cho mỗi webhook khớp. next_retry_at mặc định now()
    // nên delivery đến hạn ngay, cron kế tiếp sẽ gửi. projectId NULL → chỉ khớp webhook toàn
    // cục (project_id IS NULL) vì `project_id = NULL` luôn false.
    await run(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload)
         SELECT id, ?, ?::jsonb FROM webhooks
          WHERE active = TRUE AND ? = ANY(events)
            AND (project_id IS NULL OR project_id = ?)`,
      event,
      JSON.stringify(payload),
      event,
      projectId,
    );
  } catch (err) {
    // Phát webhook hỏng KHÔNG được làm hỏng nghiệp vụ — chỉ log.
    log.error("emitWebhook lỗi", {
      event,
      projectId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

type DueDelivery = {
  id: number;
  event: string;
  payload: WebhookPayload;
  attempts: number;
  url: string;
  secret: string;
};

// Gửi 1 delivery thật + cập nhật trạng thái. Trả true nếu 2xx (thành công).
async function sendOne(d: DueDelivery): Promise<boolean> {
  const body = JSON.stringify(d.payload); // stringify đúng 1 lần — ký & gửi trên cùng chuỗi
  const signature = createHmac("sha256", d.secret).update(body).digest("hex");
  let ok = false;
  let lastError: string | null = null;
  try {
    const res = await fetch(d.url, {
      method: "POST",
      body,
      redirect: "manual", // KHÔNG follow redirect — 3xx tính là lỗi (chống chuyển về nội bộ)
      headers: {
        "Content-Type": "application/json",
        "X-Xboss-Event": d.event,
        "X-Xboss-Delivery": String(d.id),
        "X-Xboss-Signature": `sha256=${signature}`,
      },
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.status >= 200 && res.status < 300) ok = true;
    else lastError = `HTTP ${res.status}`;
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  if (ok) {
    await run(
      `UPDATE webhook_deliveries SET status = 'ok', attempts = attempts + 1, last_error = NULL WHERE id = ?`,
      d.id,
    );
    return true;
  }

  const nextAttempts = d.attempts + 1;
  if (nextAttempts >= MAX_ATTEMPTS) {
    // Hết lượt thử → dừng hẳn.
    await run(
      `UPDATE webhook_deliveries SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?`,
      nextAttempts,
      lastError,
      d.id,
    );
  } else {
    const backoff = BACKOFF[nextAttempts - 1];
    await run(
      `UPDATE webhook_deliveries
          SET attempts = ?, last_error = ?, status = 'pending', next_retry_at = now() + ?::interval
        WHERE id = ?`,
      nextAttempts,
      lastError,
      backoff,
      d.id,
    );
  }
  return false;
}

// Cron gọi: lấy tối đa 50 delivery pending đến hạn (FOR UPDATE SKIP LOCKED nên nhiều instance
// cron không giành nhau), gửi tuần tự từng cái. Trả số thành công/thất bại trong lượt này.
export async function deliverDueWebhooks(): Promise<{ sent: number; failed: number }> {
  return withTransaction(async () => {
    const due = await query<DueDelivery>(
      `SELECT d.id, d.event, d.payload, d.attempts, w.url, w.secret
         FROM webhook_deliveries d
         JOIN webhooks w ON w.id = d.webhook_id
        WHERE d.status = 'pending' AND d.next_retry_at <= now()
        ORDER BY d.id
        LIMIT ${DELIVER_BATCH}
        FOR UPDATE OF d SKIP LOCKED`,
    );
    let sent = 0;
    let failed = 0;
    for (const d of due) {
      if (await sendOne(d)) sent++;
      else failed++;
    }
    return { sent, failed };
  });
}
