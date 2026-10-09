// Mật mã vault offline (QUALITY-FINAL-1 S05 — DATA-MIGRATIONS §5, DATA-CONTRACTS §4, D03).
//
// THUẦN, chỉ dùng WebCrypto (`globalThis.crypto.subtle`) nên chạy y hệt ở server Node lẫn trình
// duyệt — server dùng để bọc/mở DEK, client (S07) dùng cùng hàm để mã hoá payload hàng đợi.
//
// Thiết kế:
// - DEK 256 bit từ CSPRNG; mọi lần mã hoá AES-256-GCM dùng IV 96 bit ngẫu nhiên MỚI, tag 128 bit.
// - KEK có version, DẪN XUẤT bằng HKDF-SHA256 từ secret riêng `XBOSS_OFFLINE_KEK` (keyring
//   "v2:<secret>,v1:<secret>" — mục đầu là bản đang dùng để bọc, các mục sau chỉ để mở khoá cũ).
//   Không dùng XBOSS_SECRET/mật khẩu: keyring trùng XBOSS_SECRET bị từ chối.
// - Bọc DEK: AAD gắn keyId/manifestHash/owner/org/project/device/keyVersion/kekVersion — sửa
//   bất kỳ trường nào (kể cả đổi manifest trong DB) là mở khoá thất bại, không có fallback.
// - Payload: AAD gắn thêm operation/kind/sequence (A2-FR05) — S07 dùng `maHoaPayload`.
// Không hàm nào log hay đưa khoá/payload vào thông điệp lỗi.

const IV_BYTES = 12;
const DEK_BYTES = 32;
const TAG_BYTES = 16;
const WRAP_FORMAT_V1 = 0x01;
/** Độ dài wrapped_key định dạng v1: 1 byte định dạng + IV + DEK đã mã hoá + tag. */
export const WRAPPED_KEY_BYTES = 1 + IV_BYTES + DEK_BYTES + TAG_BYTES;
/** Trần ciphertext payload (ảnh 10MB + metadata) — chặn chuỗi base64 khổng lồ trước khi giải mã. */
export const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;

const KEK_SALT = "xboss-offline-kek-v1";
const KEK_MIN_SECRET = 32;
const VERSION_RE = /^[A-Za-z0-9_-]{1,32}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

/** Lỗi mật mã — thông điệp cố định, không mang dữ liệu khoá/payload. */
export class OfflineCryptoError extends Error {
  constructor(readonly code: "format" | "auth" | "input") {
    super(`offline_crypto_${code}`);
    this.name = "OfflineCryptoError";
  }
}

/** Cấu hình KEK sai (có giá trị nhưng không hợp lệ) — fail-fast, không mang secret. */
export class OfflineKekConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineKekConfigError";
  }
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("WebCrypto không khả dụng trong môi trường này");
  return s;
}

const utf8 = (s: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(s);

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/** DEK 256 bit mới từ CSPRNG. */
export const taoDek = (): Uint8Array<ArrayBuffer> => randomBytes(DEK_BYTES);

// ── base64url (không padding) — kiểm chặt, không nuốt ký tự lạ ────────────────────────────

export function base64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Giải base64url; sai bảng chữ/độ dài hoặc vượt `maxBytes` → OfflineCryptoError("input"). */
export function base64urlDecode(s: string, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (typeof s !== "string" || !/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1)
    throw new OfflineCryptoError("input");
  if (Math.floor((s.length * 3) / 4) > maxBytes) throw new OfflineCryptoError("input");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(data: Uint8Array<ArrayBuffer> | string): Promise<string> {
  const buf = await subtle().digest("SHA-256", typeof data === "string" ? utf8(data) : data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ── Keyring KEK ───────────────────────────────────────────────────────────────────────────

export type KekKeyring = { active: string; secrets: ReadonlyMap<string, string> };

/**
 * Dấu của KEK giá trị TEST trong `e2e/constants.ts` (công khai trong repo). Secret chứa chuỗi này
 * chỉ hợp lệ khi caller bật `choPhepKekE2E` (server e2e đặt cờ tường minh `XBOSS_E2E=1`) — lỡ
 * chép cấu hình e2e lên production thì vault offline tắt (misconfigured) thay vì dùng khoá ai
 * cũng biết để bọc DEK.
 */
const DAU_KEK_E2E = "e2e-offline-kek";

/**
 * Đọc keyring `XBOSS_OFFLINE_KEK`. Thiếu/rỗng → null (tính năng TẮT, caller fail-closed).
 * Có giá trị mà sai định dạng, secret < 32 ký tự, trùng version/secret, trùng XBOSS_SECRET hoặc
 * là KEK test e2e (khi không có `choPhepKekE2E`) → throw OfflineKekConfigError (fail-fast;
 * thông điệp không chứa secret).
 */
export function docKeyringKek(
  raw: string | undefined,
  xbossSecret: string | undefined,
  opts: { choPhepKekE2E?: boolean } = {},
): KekKeyring | null {
  if (raw == null || raw.trim() === "") return null;
  const secrets = new Map<string, string>();
  const daThay = new Set<string>();
  let active: string | null = null;
  for (const phan of raw.split(",")) {
    const muc = phan.trim();
    const i = muc.indexOf(":");
    if (i <= 0)
      throw new OfflineKekConfigError("XBOSS_OFFLINE_KEK sai định dạng <version>:<secret>");
    const version = muc.slice(0, i);
    const secret = muc.slice(i + 1);
    if (!VERSION_RE.test(version))
      throw new OfflineKekConfigError("XBOSS_OFFLINE_KEK có version không hợp lệ");
    if (secret.length < KEK_MIN_SECRET)
      throw new OfflineKekConfigError("XBOSS_OFFLINE_KEK có secret ngắn hơn 32 ký tự");
    if (secrets.has(version)) throw new OfflineKekConfigError("XBOSS_OFFLINE_KEK lặp version");
    if (daThay.has(secret)) throw new OfflineKekConfigError("XBOSS_OFFLINE_KEK lặp secret");
    if (xbossSecret && secret === xbossSecret.trim())
      throw new OfflineKekConfigError("XBOSS_OFFLINE_KEK không được trùng XBOSS_SECRET");
    if (!opts.choPhepKekE2E && secret.includes(DAU_KEK_E2E))
      throw new OfflineKekConfigError(
        "XBOSS_OFFLINE_KEK đang là khoá TEST của e2e — chỉ dùng được khi XBOSS_E2E=1",
      );
    secrets.set(version, secret);
    daThay.add(secret);
    active ??= version;
  }
  if (!active) throw new OfflineKekConfigError("XBOSS_OFFLINE_KEK rỗng");
  return { active, secrets };
}

/** KEK AES-256-GCM (không xuất được) dẫn xuất HKDF-SHA256 từ secret + version. */
export async function danXuatKek(secret: string, version: string): Promise<CryptoKey> {
  const goc = await subtle().importKey("raw", utf8(secret), "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: utf8(KEK_SALT), info: utf8(`kek:${version}`) },
    goc,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── AAD ───────────────────────────────────────────────────────────────────────────────────

const soNguyenDuong = (n: unknown): n is number =>
  typeof n === "number" && Number.isSafeInteger(n) && n > 0;

export type WrapAadFields = {
  keyId: string;
  manifestHash: string;
  userId: number;
  orgId: number;
  projectId: number;
  deviceId: string;
  keyVersion: number;
  kekVersion: string;
};

/** AAD bọc DEK — chuỗi chuẩn có version, mọi trường được kiểm để không chèn được dấu phân cách. */
export function aadBocKhoa(f: WrapAadFields): Uint8Array<ArrayBuffer> {
  if (
    !UUID_RE.test(f.keyId) ||
    !UUID_RE.test(f.deviceId) ||
    !HEX64_RE.test(f.manifestHash) ||
    !VERSION_RE.test(f.kekVersion) ||
    ![f.userId, f.orgId, f.projectId, f.keyVersion].every(soNguyenDuong)
  )
    throw new OfflineCryptoError("input");
  return utf8(
    [
      "xboss-offline-wrap-v1",
      f.keyId,
      f.manifestHash,
      f.userId,
      f.orgId,
      f.projectId,
      f.deviceId,
      f.keyVersion,
      f.kekVersion,
    ].join("|"),
  );
}

export const OFFLINE_OP_KINDS = ["tick", "tick_batch", "photo", "diary_note"] as const;
export type OfflineOpKind = (typeof OFFLINE_OP_KINDS)[number];

export type PayloadAadFields = {
  keyId: string;
  manifestHash: string;
  ownerUserId: number;
  orgId: number;
  projectId: number;
  deviceId: string;
  keyVersion: number;
  operationId: string;
  kind: OfflineOpKind;
  sequence: number;
};

/** AAD payload hàng đợi (schemaVersion 2, A2-FR05) — S07 dùng cùng hàm ở client. */
export function aadPayload(f: PayloadAadFields): Uint8Array<ArrayBuffer> {
  if (
    !UUID_RE.test(f.keyId) ||
    !UUID_RE.test(f.deviceId) ||
    !UUID_RE.test(f.operationId) ||
    !HEX64_RE.test(f.manifestHash) ||
    !(OFFLINE_OP_KINDS as readonly string[]).includes(f.kind) ||
    ![f.ownerUserId, f.orgId, f.projectId, f.keyVersion, f.sequence].every(soNguyenDuong)
  )
    throw new OfflineCryptoError("input");
  return utf8(
    [
      "xboss-offline-payload-v2",
      f.keyId,
      f.manifestHash,
      f.ownerUserId,
      f.orgId,
      f.projectId,
      f.deviceId,
      f.keyVersion,
      f.operationId,
      f.kind,
      f.sequence,
    ].join("|"),
  );
}

// ── Bọc / mở DEK (server) ─────────────────────────────────────────────────────────────────

export async function bocDek(
  dek: Uint8Array<ArrayBuffer>,
  kek: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (dek.length !== DEK_BYTES) throw new OfflineCryptoError("input");
  const iv = randomBytes(IV_BYTES);
  const ct = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_BYTES * 8 },
      kek,
      dek,
    ),
  );
  const out = new Uint8Array(WRAPPED_KEY_BYTES);
  out[0] = WRAP_FORMAT_V1;
  out.set(iv, 1);
  out.set(ct, 1 + IV_BYTES);
  return out;
}

/** Mở DEK; sai định dạng → "format", AAD/ciphertext/KEK sai → "auth" (không fallback). */
export async function moDek(
  wrapped: Uint8Array,
  kek: CryptoKey,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  if (wrapped.length !== WRAPPED_KEY_BYTES || wrapped[0] !== WRAP_FORMAT_V1)
    throw new OfflineCryptoError("format");
  const iv = new Uint8Array(wrapped.subarray(1, 1 + IV_BYTES));
  const ct = new Uint8Array(wrapped.subarray(1 + IV_BYTES));
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_BYTES * 8 },
        kek,
        ct,
      ),
    );
  } catch {
    throw new OfflineCryptoError("auth");
  }
}

// ── Payload (client S07) ──────────────────────────────────────────────────────────────────

/** Nhập DEK thành CryptoKey KHÔNG xuất được, chỉ giữ trong bộ nhớ (không persist). */
export async function nhapDekBoNho(dek: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (dek.length !== DEK_BYTES) throw new OfflineCryptoError("input");
  return subtle().importKey("raw", dek, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export type PayloadEnvelope = { iv: string; ciphertext: string };

export async function maHoaPayload(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
  aad: Uint8Array<ArrayBuffer>,
): Promise<PayloadEnvelope> {
  if (plaintext.length > MAX_PAYLOAD_BYTES) throw new OfflineCryptoError("input");
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_BYTES * 8 },
    key,
    plaintext,
  );
  return { iv: base64urlEncode(iv), ciphertext: base64urlEncode(new Uint8Array(ct)) };
}

export async function giaiMaPayload(
  key: CryptoKey,
  env: PayloadEnvelope,
  aad: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = base64urlDecode(env.iv, IV_BYTES);
  if (iv.length !== IV_BYTES) throw new OfflineCryptoError("format");
  const ct = base64urlDecode(env.ciphertext, MAX_PAYLOAD_BYTES + TAG_BYTES);
  if (ct.length < TAG_BYTES) throw new OfflineCryptoError("format");
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv, additionalData: aad, tagLength: TAG_BYTES * 8 },
        key,
        ct,
      ),
    );
  } catch {
    throw new OfflineCryptoError("auth");
  }
}
