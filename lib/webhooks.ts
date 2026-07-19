// Webhook ra ngoài (M49 PR2). Đẩy sự kiện nghiệp vụ quan trọng của XBoss tới hệ ngoài qua
// HTTP POST có ký HMAC-SHA256. Hai pha tách bạch:
//   - emitWebhook(): gọi TỪ route nghiệp vụ, fire-and-forget — chỉ INSERT webhook_deliveries
//     cho mọi webhook active khớp sự kiện + dự án. KHÔNG gọi HTTP (không chặn request nghiệp
//     vụ), nuốt mọi lỗi để phát webhook hỏng không làm hỏng nghiệp vụ.
//   - deliverDueWebhooks(): gọi TỪ cron — gửi thật các delivery đến hạn, retry theo backoff.
// Xem migrations/0064_webhooks.sql + docs/nang-cap/M49-api-mo-sso.md (PR2).
import { createHmac } from "node:crypto";
import dns, { type LookupAddress, type LookupOptions } from "node:dns";
import { isIP } from "node:net";
import { Agent } from "undici";
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

// Chống SSRF: chặn IP trỏ về nội bộ/loopback/link-local/CGNAT/multicast/reserved. Dùng
// net.isIP để xác định họ địa chỉ + parse số từng octet/group (không so chuỗi thô) — chuẩn
// hoá trước khi so để không bỏ sót biến thể viết tắt (vd fe80::1 vs FE80:0000:...).
function isPrivateIpv4(a: number, b: number, c: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18.0.0/15
  if (a >= 224) return true; // multicast 224.0.0.0/4 + reserved 240.0.0.0/4 + 255.255.255.255
  return false;
}

// Nối 8 group IPv6 (số 0-65535) từ chuỗi địa chỉ đã chuẩn hoá bởi net.isIP === 6. Hỗ trợ nén
// "::" và địa chỉ IPv4-mapped/embedded ở cuối (vd "::ffff:127.0.0.1"). Trả null nếu không
// parse được (không nên xảy ra vì net.isIP đã xác nhận hợp lệ).
function expandIPv6(raw: string): number[] | null {
  let addr = raw.split("%")[0]; // bỏ zone id (vd "fe80::1%eth0")
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".") && isIP(tail) === 4) {
    const [a, b, c, d] = tail.split(".").map(Number);
    const hi = ((a << 8) | b).toString(16);
    const lo = ((c << 8) | d).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":").filter(Boolean) : [];
  let groups: string[];
  if (halves.length === 2) {
    const tailGroups = halves[1] ? halves[1].split(":").filter(Boolean) : [];
    const missing = 8 - head.length - tailGroups.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tailGroups];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  return groups.map((g) => parseInt(g || "0", 16));
}

// Chống SSRF: chặn IP nội bộ/loopback/link-local/CGNAT/multicast/reserved cho cả IPv4 lẫn
// IPv6 (kể cả IPv4-mapped `::ffff:x.x.x.x` — bóc IPv4 ra kiểm lại bằng nhánh IPv4). Chuỗi
// không phải IP hợp lệ (domain) → false, cho qua (validate domain ở lúc tạo/sửa webhook).
export function isPrivateIp(host: string): boolean {
  const family = isIP(host);
  if (family === 4) {
    const [a, b, c] = host.split(".").map(Number);
    return isPrivateIpv4(a, b, c);
  }
  if (family === 6) {
    const groups = expandIPv6(host);
    if (!groups) return false;
    // ::ffff:x.x.x.x (IPv4-mapped) → bóc IPv4 ra kiểm lại bằng nhánh IPv4.
    if (
      groups[0] === 0 &&
      groups[1] === 0 &&
      groups[2] === 0 &&
      groups[3] === 0 &&
      groups[4] === 0 &&
      groups[5] === 0xffff
    ) {
      const a = groups[6] >> 8;
      const b = groups[6] & 0xff;
      const c = groups[7] >> 8;
      return isPrivateIpv4(a, b, c);
    }
    const leadingSeven = groups.slice(0, 7);
    if (leadingSeven.every((g) => g === 0) && (groups[7] === 0 || groups[7] === 1)) return true; // :: hoặc ::1
    if ((groups[0] & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((groups[0] & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
    return false;
  }
  return false; // không phải IP → domain, cho qua
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

// Chống SSRF DNS rebinding: resolve TẤT CẢ IP của hostname rồi kiểm private ngay trong hàm
// lookup dùng để connect — không "resolve → kiểm → fetch bằng hostname" (DNS có thể đổi giữa
// 2 bước, rebinding đúng nghĩa). Fail-closed: có 1 IP private trong danh sách là chặn hết,
// không tự chọn IP public còn lại. Chữ ký tương thích `dns.lookup` để dùng làm
// `connect: { lookup }` của undici Agent (pin IP tại tầng connect, TLS/SNI/Host header vẫn
// theo hostname gốc nên chứng chỉ verify đúng domain).
export function safeLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  dns.promises
    .lookup(hostname, { all: true })
    .then((addresses) => {
      const bad = addresses.find((addr) => isPrivateIp(addr.address));
      if (bad) {
        callback(
          Object.assign(new Error(`DNS trỏ về địa chỉ nội bộ: ${bad.address}`), {
            code: "EAI_SSRF_BLOCKED",
          }),
          "",
        );
        return;
      }
      if (options.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    })
    .catch((err: unknown) => {
      callback(err instanceof Error ? err : new Error(String(err)), "");
    });
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

// Agent undici pin IP qua safeLookup cho MỌI lần gửi thật (M63) — tạo 1 lần module-level để
// tái dùng connection pool, không tạo mới mỗi lần gửi. Chỉ áp cho sendOne; validateWebhookUrl
// (lúc tạo/sửa webhook) giữ nguyên hành vi cũ (không resolve DNS).
const webhookAgent = new Agent({ connect: { lookup: safeLookup } });

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
      // @ts-expect-error dispatcher là tuỳ chọn của undici, chưa có trong type chuẩn lib.dom fetch
      dispatcher: webhookAgent,
    });
    if (res.status >= 200 && res.status < 300) ok = true;
    else lastError = `HTTP ${res.status}`;
  } catch (err) {
    // fetch của Node (undici) bọc lỗi tầng connect (kể cả lỗi safeLookup chặn SSRF) thành
    // TypeError "fetch failed" với `cause` mang lỗi gốc — lấy cause để last_error có ý nghĩa
    // thay vì chỉ "fetch failed" chung chung.
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : null;
    lastError = cause ? cause.message : err instanceof Error ? err.message : String(err);
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
