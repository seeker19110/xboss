// Ghép thiết bị plugin AutoCAD + token scope 'cad' (M99 PR2 — luồng OAuth device flow).
//
// Nguyên tắc (M99 §12 + docs/audit.md §8):
//   - Key thô KHÔNG BAO GIỜ nằm trong DB: chỉ sinh tại thời điểm claim, trả đúng 1 lần;
//     DB giữ sha256 (tái dùng api_keys của 0061).
//   - device_code là bí mật đủ entropy (32 byte) chỉ plugin giữ, DB lưu hash — lộ DB không
//     giả claim được; user_code ngắn cho người gõ nhưng CHỈ dùng để duyệt (cần session +
//     CAN.manageDrawings), không đổi được ra key.
//   - Mã ghép sống 10 phút; claim atomic (UPDATE ... WHERE status='confirmed') chống double-claim.
//   - Token thiết bị scope hẹp {cad}, có hạn 90 ngày, thu hồi được qua /api/tokens (revoked_at).
import { randomBytes, randomInt } from "node:crypto";
import { queryOne, run, insertId, withTransaction } from "@/lib/db";
import { hashApiKey, generateApiKey } from "@/lib/bao-mat/api-keys";
import type { User } from "@/lib/bao-mat/auth";

/** Mã ghép sống 10 phút (M99 §6.1: trạng thái "hết hạn" là một nhánh chuẩn của journey). */
export const PAIRING_TTL_MINUTES = 10;
/** Token thiết bị hết hạn sau 90 ngày — kỹ sư ghép lại, không có token vĩnh viễn (M99 §12). */
export const CAD_TOKEN_TTL_DAYS = 90;

// Bảng chữ cái không nhập nhằng (bỏ 0/O/1/I/L) — kỹ sư đọc mã trên màn hình AutoCAD rồi gõ
// vào web, nhầm 1 ký tự là duyệt hụt.
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Mã cho người: dạng XXXX-XXXX, 8 ký tự từ bảng 31 ký tự (~39.6 bit) — đủ cho mã sống 10
 * phút chỉ dùng để DUYỆT sau đăng nhập (không đổi ra key được), va chạm chặn bởi UNIQUE. */
export function generateUserCode(): string {
  const pick = () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  const half = () => pick() + pick() + pick() + pick();
  return `${half()}-${half()}`;
}

/** Bí mật cho plugin poll: xdc_ + 32 byte hex — cùng cỡ entropy với api key. */
export function generateDeviceCode(): string {
  return "xdc_" + randomBytes(32).toString("hex");
}

export type PairingStart = { userCode: string; deviceCode: string; expiresInSeconds: number };

/** Plugin xin mã ghép. Trả cả 2 mã (deviceCode chỉ lần này — DB giữ hash). */
export async function createPairing(deviceName: string): Promise<PairingStart> {
  const userCode = generateUserCode();
  const deviceCode = generateDeviceCode();
  await run(
    `INSERT INTO cad_device_pairings (user_code, device_code_hash, device_name, expires_at)
     VALUES (?, ?, ?, now() + make_interval(mins => ?))`,
    userCode,
    hashApiKey(deviceCode),
    deviceName,
    PAIRING_TTL_MINUTES,
  );
  return { userCode, deviceCode, expiresInSeconds: PAIRING_TTL_MINUTES * 60 };
}

export type ConfirmResult = "ok" | "khong-tim-thay" | "het-han" | "da-xu-ly";

/** Kỹ sư duyệt (approve=true) hoặc từ chối mã ghép trên web — caller đã kiểm session +
 * CAN.manageDrawings. Chỉ mã đang pending và còn hạn mới chuyển trạng thái được. */
export async function confirmPairing(
  userCode: string,
  user: User,
  approve: boolean,
): Promise<ConfirmResult> {
  const row = await queryOne<{ id: number; status: string; expired: boolean }>(
    `SELECT id, status, (expires_at <= now()) AS expired
       FROM cad_device_pairings WHERE user_code = ?`,
    userCode.trim().toUpperCase(),
  );
  if (!row) return "khong-tim-thay";
  if (row.status !== "pending") return "da-xu-ly";
  if (row.expired) return "het-han";
  await run(
    `UPDATE cad_device_pairings SET status = ?, confirmed_by = ?
      WHERE id = ? AND status = 'pending'`,
    approve ? "confirmed" : "denied",
    user.id,
    row.id,
  );
  return "ok";
}

export type ClaimResult =
  | { status: "pending" }
  | { status: "ok"; key: string; expiresAt: string; deviceName: string }
  | { status: "het-han" }
  | { status: "tu-choi" }
  | { status: "khong-tim-thay" };

/** Plugin poll bằng device_code. Khi đã duyệt: sinh api key scope {cad} TẠI ĐÂY (key thô trả
 * đúng 1 lần, không lưu), đánh dấu claimed atomic — poll lần 2 không nhận key lần nữa. */
export async function claimPairing(deviceCode: string): Promise<ClaimResult> {
  const row = await queryOne<{
    id: number;
    status: string;
    deviceName: string;
    confirmedBy: number | null;
    expired: boolean;
  }>(
    `SELECT id, status, device_name AS "deviceName", confirmed_by AS "confirmedBy",
            (expires_at <= now()) AS expired
       FROM cad_device_pairings WHERE device_code_hash = ?`,
    hashApiKey(deviceCode),
  );
  if (!row) return { status: "khong-tim-thay" };
  if (row.status === "denied" || row.status === "claimed")
    return row.status === "denied" ? { status: "tu-choi" } : { status: "khong-tim-thay" };
  if (row.expired) return { status: "het-han" };
  if (row.status === "pending") return { status: "pending" };

  // status = confirmed → thắng cuộc đua claim bằng UPDATE có điều kiện rồi mới sinh key.
  return withTransaction(async () => {
    const won = await run(
      `UPDATE cad_device_pairings SET status = 'claimed' WHERE id = ? AND status = 'confirmed'`,
      row.id,
    );
    if (won.changes === 0) return { status: "khong-tim-thay" as const }; // thua race — coi như đã claim
    const nguoiDuyet = await queryOne<{ orgId: number }>(
      `SELECT org_id AS "orgId" FROM users WHERE id = ?`,
      row.confirmedBy,
    );
    if (!nguoiDuyet) return { status: "khong-tim-thay" as const };
    const { key, keyId, expiresAt } = await createCadToken(
      row.confirmedBy!,
      nguoiDuyet.orgId,
      `AutoCAD — ${row.deviceName}`,
      row.deviceName,
    );
    await run(`UPDATE cad_device_pairings SET api_key_id = ? WHERE id = ?`, keyId, row.id);
    return { status: "ok" as const, key, expiresAt, deviceName: row.deviceName };
  });
}

/** Sinh token thiết bị scope {cad}: hạn 90 ngày, gắn người duyệt làm chủ (created_by) — quyền
 * của token đi theo vai trò người đó qua CAN như phiên thường (M99 §12: không việc quản trị). */
export async function createCadToken(
  userId: number,
  orgId: number,
  name: string,
  deviceName: string | null,
): Promise<{ key: string; keyId: number; expiresAt: string }> {
  const key = generateApiKey();
  const keyId = await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by, org_id, expires_at, device_name)
     VALUES (?, ?, NULL, '{cad}', ?, ?, now() + make_interval(days => ?), ?)`,
    name,
    hashApiKey(key),
    userId,
    orgId,
    CAD_TOKEN_TTL_DAYS,
    deviceName,
  );
  const row = await queryOne<{ expiresAt: string }>(
    `SELECT expires_at::text AS "expiresAt" FROM api_keys WHERE id = ?`,
    keyId,
  );
  return { key, keyId, expiresAt: row?.expiresAt ?? "" };
}

/** Xác thực Bearer token scope 'cad' → User (đúng shape phiên đăng nhập) để route dùng CAN
 * như thường. Trả null khi sai/thiếu/thu hồi/hết hạn/sai scope — caller tự 401. */
export async function getCadTokenUser(authHeader: string | null): Promise<User | null> {
  // Import cục bộ tránh vòng: api-keys → (không) → cad-devices, còn verifyApiKey đã kiểm
  // revoked + expires (bản vá PR2).
  const { verifyApiKey } = await import("@/lib/bao-mat/api-keys");
  const auth = await verifyApiKey(authHeader);
  if (!auth || !auth.scopes.includes("cad")) return null;
  const user = await queryOne<User>(
    `SELECT u.id, u.name, u.email, u.role, u.org_id AS "orgId"
       FROM users u WHERE u.id = ?`,
    auth.createdBy,
  );
  return user ?? null;
}
