// TOTP (RFC 6238) — M56 PR1: lớp xác thực thứ 2 cho tài khoản đăng nhập bằng mật khẩu.
// Thư viện `otplib` (thuần JS, không native dep). Bí mật TOTP lưu MÃ HOÁ trong cột
// users.totp_secret (AES-256-GCM, khoá dẫn xuất từ XBOSS_SECRET) — dump DB không đủ để
// sinh mã OTP hợp lệ. Trade-off: mất XBOSS_SECRET = mọi user phải re-enroll 2FA (chấp
// nhận — cùng blast-radius với cookie phiên hiện tại, xem lib/auth.ts::getSecret).
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";

const PERIOD_SEC = 30;
const DIGITS = 6;

function getSecretKey(): string {
  const s = process.env.XBOSS_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("XBOSS_SECRET chưa được cấu hình — bắt buộc khi chạy production.");
  return "xboss-dev-secret-change-me";
}

// Dẫn xuất khoá AES-256 cố định từ XBOSS_SECRET (scrypt, salt cố định theo mục đích —
// không cần salt ngẫu nhiên vì input entropy đã nằm ở XBOSS_SECRET).
function deriveKey(): Buffer {
  return scryptSync(getSecretKey(), "xboss-totp-secret-v1", 32);
}

// Mã hoá totp_secret trước khi lưu DB — format: iv(hex).authTag(hex).ciphertext(hex).
export function encryptTotpSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${enc.toString("hex")}`;
}

export function decryptTotpSecret(stored: string): string {
  const [ivHex, tagHex, dataHex] = stored.split(".");
  if (!ivHex || !tagHex || !dataHex) throw new Error("totp_secret lưu sai định dạng");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return dec.toString("utf8");
}

// Sinh secret Base32 mới (chưa mã hoá — dùng lúc /setup, mã hoá trước khi lưu DB).
export function generateNewTotpSecret(): string {
  return generateSecret();
}

// URI otpauth:// để client render QR (Google Authenticator/Authy tương thích).
export function totpAuthUri(email: string, secret: string): string {
  return generateURI({ issuer: "XBoss", label: email, secret, algorithm: "sha1", digits: DIGITS, period: PERIOD_SEC });
}

const currentStep = (): number => Math.floor(Date.now() / 1000 / PERIOD_SEC);

export type TotpVerifyResult = { valid: boolean; step: number };

// Verify mã 6 số — window ±1 step (30s) qua epochTolerance. Trả step tuyệt đối thực sự
// khớp (currentStep + delta) để caller chống replay (so với users.totp_last_step).
export async function verifyTotpCode(secret: string, token: string): Promise<TotpVerifyResult> {
  if (!/^\d{6}$/.test(token)) return { valid: false, step: currentStep() };
  const result = await verify({ secret, token, epochTolerance: PERIOD_SEC, digits: DIGITS, period: PERIOD_SEC });
  const step = currentStep() + (result.valid ? (result.delta ?? 0) : 0);
  return { valid: result.valid, step };
}

// 8 recovery code dạng "xxxx-xxxx" (hex ngẫu nhiên, dễ chép tay/nhập lại).
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex"); // 10 ký tự hex
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}
