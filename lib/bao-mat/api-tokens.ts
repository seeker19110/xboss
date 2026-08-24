// Token thiết bị cho plugin AutoCAD (M99 PR2) — khác api_keys (M49: key hệ thống do
// Admin tạo cho bên thứ ba): api_tokens GẮN VÀO MỘT USER, mọi request bằng token đi qua
// đúng CAN/quyền của user đó, scope hẹp 'cad', có hạn dùng, thu hồi được.
// Luồng ghép thiết bị (device pairing):
//   1. Plugin POST /api/devices/pair → { deviceCode (hiện cho người dùng), deviceSecret
//      (chỉ plugin giữ), expiresIn }.
//   2. Kỹ sư đăng nhập web, vào /engineering/thiet-bi-plugin gõ deviceCode xác nhận
//      (POST /api/devices/pair/confirm — cần CAN.manageDrawings).
//   3. Plugin poll POST /api/devices/pair/poll { deviceCode, deviceSecret } → khi đã
//      confirmed thì token MỚI ĐƯỢC SINH tại đây, trả thô đúng 1 lần, DB chỉ giữ hash.
// Token thô không bao giờ nằm trong DB (kể cả tạm) — an toàn hơn lưu-rồi-xoá.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { query, queryOne, run, insertId } from "@/lib/db";
import type { User } from "@/lib/bao-mat/auth";

export const TOKEN_TTL_DAYS = 90; // hạn token thiết bị — hết hạn phải ghép lại
export const PAIRING_TTL_MINUTES = 10; // mã ghép sống 10 phút

// Sinh token thô: `xbt_` + 32 byte hex — phân biệt tiền tố với api key `xbk_`.
export function generateDeviceToken(): string {
  return "xbt_" + randomBytes(32).toString("hex");
}

// Secret poll của plugin: `xbp_` + 32 byte hex (chống kẻ biết deviceCode poll trộm token).
export function generatePairingSecret(): string {
  return "xbp_" + randomBytes(32).toString("hex");
}

// Mã ghép ngắn cho người gõ trên web: 8 ký tự, bỏ ký tự dễ nhầm (0/O/1/I).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateDeviceCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

// Băm sha256 hex — dùng chung cho token lẫn secret (không lưu bản thô).
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// ===== Ghép thiết bị =====

export async function createPairing(deviceName: string): Promise<{
  deviceCode: string;
  deviceSecret: string;
  expiresIn: number; // giây
}> {
  const deviceCode = generateDeviceCode();
  const deviceSecret = generatePairingSecret();
  await insertId(
    `INSERT INTO device_pairings (device_code, secret_hash, device_name, expires_at)
     VALUES (?, ?, ?, NOW() + make_interval(mins => ?))`,
    deviceCode,
    hashToken(deviceSecret),
    deviceName.slice(0, 100),
    PAIRING_TTL_MINUTES,
  );
  return { deviceCode, deviceSecret, expiresIn: PAIRING_TTL_MINUTES * 60 };
}

// Người dùng duyệt trên web (đã qua getCurrentUser + CAN.manageDrawings ở route).
// Trả về tên thiết bị khi thành công; null khi mã sai/hết hạn/đã dùng.
export async function confirmPairing(
  deviceCode: string,
  userId: number,
): Promise<{ deviceName: string } | null> {
  // UPDATE có điều kiện = atomic: 2 người cùng duyệt 1 mã thì chỉ 1 lần ăn.
  const rows = await query<{ device_name: string }>(
    `UPDATE device_pairings
        SET status = 'confirmed', user_id = ?, confirmed_at = NOW()
      WHERE device_code = ? AND status = 'pending' AND expires_at > NOW()
      RETURNING device_name`,
    userId,
    deviceCode.trim().toUpperCase(),
  );
  return rows[0] ? { deviceName: rows[0].device_name } : null;
}

export type PollResult =
  | { status: "pending" }
  | { status: "ready"; token: string; tokenId: number; name: string; expiresAt: string }
  | { status: "not_found" };

// Plugin poll: đúng (deviceCode, secret) + đã confirmed → SINH token tại đây, trả thô
// đúng 1 lần, pairing chuyển 'consumed' (poll lần nữa = not_found). Idempotency giao cho
// UPDATE atomic — 2 poll đồng thời chỉ 1 bên nhận token.
export async function pollPairing(deviceCode: string, deviceSecret: string): Promise<PollResult> {
  const row = await queryOne<{
    id: number;
    status: string;
    user_id: number | null;
    device_name: string;
  }>(
    `SELECT id, status, user_id, device_name FROM device_pairings
      WHERE device_code = ? AND secret_hash = ? AND expires_at > NOW()`,
    deviceCode.trim().toUpperCase(),
    hashToken(deviceSecret),
  );
  if (!row || row.status === "consumed") return { status: "not_found" };
  if (row.status === "pending") return { status: "pending" };
  if (row.user_id == null) return { status: "not_found" };

  const claimed = await query<{ id: number }>(
    `UPDATE device_pairings SET status = 'consumed' WHERE id = ? AND status = 'confirmed' RETURNING id`,
    row.id,
  );
  if (!claimed[0]) return { status: "not_found" }; // bên poll song song đã nhận trước

  const token = generateDeviceToken();
  const name = row.device_name || `Thiết bị ${deviceCode.trim().toUpperCase()}`;
  const tokenId = await insertId(
    `INSERT INTO api_tokens (user_id, name, token_hash, scopes, expires_at)
     VALUES (?, ?, ?, 'cad', NOW() + make_interval(days => ?))`,
    row.user_id,
    name,
    hashToken(token),
    TOKEN_TTL_DAYS,
  );
  const exp = await queryOne<{ expires_at: Date }>(
    `SELECT expires_at FROM api_tokens WHERE id = ?`,
    tokenId,
  );
  return {
    status: "ready",
    token,
    tokenId,
    name,
    expiresAt: exp ? new Date(exp.expires_at).toISOString() : "",
  };
}

// ===== Xác thực bằng token thiết bị =====

export type DeviceTokenAuth = { tokenId: number; scopes: string; user: User };

// Đọc `Authorization: Bearer xbt_...` → tra hash, kiểm revoked/expires, nạp user thật
// (token hành xử ĐÚNG BẰNG quyền user — mọi route vẫn kiểm CAN như phiên thường).
// last_used_at ghi có throttle 60s như api_keys (tránh UPDATE mỗi request).
export async function verifyDeviceToken(
  authHeader: string | null,
): Promise<DeviceTokenAuth | null> {
  if (!authHeader) return null;
  const m = /^Bearer\s+(xbt_[0-9a-fA-F]+)$/.exec(authHeader.trim());
  if (!m) return null;
  const row = await queryOne<{
    id: number;
    scopes: string;
    userId: number;
    name: string;
    email: string;
    role: User["role"];
    orgId: number;
  }>(
    `SELECT t.id, t.scopes, u.id AS "userId", u.name, u.email, u.role, u.org_id AS "orgId"
       FROM api_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = ?
        AND t.revoked_at IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > NOW())`,
    hashToken(m[1]),
  );
  if (!row) return null;
  await run(
    `UPDATE api_tokens SET last_used_at = NOW()
      WHERE id = ? AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '60 seconds')`,
    row.id,
  );
  return {
    tokenId: row.id,
    scopes: row.scopes,
    user: { id: row.userId, name: row.name, email: row.email, role: row.role, orgId: row.orgId },
  };
}

// Dọn phiên ghép hết hạn từ lâu — gọi xác suất thấp từ route pair (như login_rate_limits).
export async function cleanupExpiredPairings(): Promise<void> {
  await run(`DELETE FROM device_pairings WHERE expires_at < NOW() - INTERVAL '1 day'`);
}
