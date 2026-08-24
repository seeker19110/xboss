// OTP dùng chung (V1 — đợt "nâng tầm" 2026-08-24).
//
// VÌ SAO CÓ FILE NÀY: trước đây mỗi luồng liên kết (Telegram M76, Zalo M86, e-Sign M84) tự
// chế OTP riêng và mỗi chỗ dính một kiểu lỗi khác nhau — lưu plaintext, quên so hạn dùng,
// so sánh bằng `=` trong SQL nên không gắn được chủ thể. Gom về đây để chỉ còn MỘT cách làm.
//
// RÀNG BUỘC THIẾT KẾ: file này chỉ chứa hàm THUẦN, KHÔNG chạm DB — vừa đúng tầng 3 của
// ADR-0007 (lib/bao-mat chỉ import xuống lib/nen), vừa để test được mà không cần Postgres.
// Việc lưu/tra OTP là của từng miền nghiệp vụ (lib/ky-thuat/...), không phải của file này.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** Số chữ số của mã OTP gửi cho người dùng. */
export const OTP_DO_DAI = 6;

/** Hạn dùng mặc định của OTP liên kết (phút) — dùng chung cho mọi luồng liên kết. */
export const OTP_HAN_PHUT = 15;

/**
 * Sinh mã OTP 6 chữ số bằng nguồn ngẫu nhiên mã hoá (`crypto.randomInt`).
 * KHÔNG dùng `Math.random()`: bộ sinh của V8 đoán trước được, không dùng cho bí mật.
 */
export function sinhOtp(): string {
  const min = 10 ** (OTP_DO_DAI - 1); // 100000
  const max = 10 ** OTP_DO_DAI; // 1000000 (loại trừ)
  return String(randomInt(min, max));
}

/**
 * Băm OTP trước khi lưu DB — SHA-256 hex (64 ký tự).
 * Không cần bcrypt/scrypt như mật khẩu: OTP sống 15 phút, không gian 10^6, và đã có
 * rate-limit chặn dò; chi phí băm chậm ở đây chỉ làm chậm chính hệ thống chứ không tăng an
 * toàn thực tế. Mục tiêu của băm là để rò rỉ bản sao DB không lộ mã đang chờ dùng.
 */
export function hashOtp(otp: string): string {
  return createHash("sha256").update(otp.trim(), "utf8").digest("hex");
}

/**
 * So OTP người dùng nhập với hash đã lưu, theo kiểu constant-time.
 * `hashLuu` null/rỗng (bản ghi không còn OTP chờ) → luôn false.
 */
export function kiemOtp(otpNhap: string, hashLuu: string | null | undefined): boolean {
  if (!hashLuu || !otpNhap) return false;
  const a = Buffer.from(hashOtp(otpNhap), "utf8");
  const b = Buffer.from(hashLuu, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
