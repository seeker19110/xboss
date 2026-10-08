// Context offline do server ký (QUALITY-FINAL-1 S05 — DATA-CONTRACTS §3, A2-FR03/FR04, D02).
//
// Context = bằng chứng "lúc issuedAt, actor/org/dự án/sessionVersion/vân tay quyền/thiết bị này đã
// được server xác minh online", kèm lease 15 phút (shared-safe) hoặc 8 giờ (field-personal đã
// duyệt). Nó KHÔNG thay phiên: mọi request vẫn cần cookie phiên hợp lệ; server so context với
// trạng thái HIỆN HÀNH, lệch bất kỳ trường nào → 409 context_changed (client xác minh lại).
// generation lấy từ sequence Postgres (tăng đơn điệu, không dựa đồng hồ client).
//
// Ký bằng HMAC phiên (`sign` của session-token, tách miền bằng tiền tố riêng) — context không phải
// khoá mã hoá; KEK của vault là secret khác hẳn (XBOSS_OFFLINE_KEK).
import { createHash, timingSafeEqual } from "node:crypto";
import { queryOne } from "@/lib/db";
import { sign } from "@/lib/bao-mat/session-token";
import { CAN, PERM_KEYS, type User } from "@/lib/bao-mat/auth";
import {
  damBaoNguCanhActor,
  hoSoHieuLuc,
  timThietBiTheoId,
  type HoSoOffline,
  type ThietBiOffline,
} from "@/lib/bao-mat/offline-devices";

/** Lease theo profile (D02): shared-safe 15 phút, field-personal 8 giờ. */
export const LEASE_MS: Record<HoSoOffline, number> = {
  "shared-safe": 15 * 60_000,
  "field-personal": 8 * 3_600_000,
};
/** Phiên bản lược đồ snapshot đọc offline mà client được phép giữ (S08 tăng khi đổi định dạng). */
export const CACHE_SCHEMA_VERSION = 1;
/** Header client gửi context hiện hành (A2-FR03). */
export const CONTEXT_HEADER = "x-xboss-context";

const MIEN_KY = "xboss-offline-ctx-v1.";
const MAX_CONTEXT_LEN = 2048;

type PayloadNguCanh = {
  v: 1;
  d: string; // deviceId
  u: number; // userId
  o: number; // orgId
  p: number; // projectId
  s: number; // sessionVersion
  f: string; // permissionFingerprint
  g: number; // generation
  pr: HoSoOffline;
  i: number; // issuedAt (ms, giờ server)
  x: number; // expiresAt (ms, giờ server)
};

export type NguCanhOffline = {
  contextId: string;
  generation: number;
  deviceId: string;
  projectId: number;
  profile: HoSoOffline;
  issuedAt: string;
  expiresAt: string;
  cacheSchemaVersion: number;
  serverTime: string;
};

/**
 * Vân tay quyền: SHA-256 của actor/org/vai trò/dự án + tập quyền CAN đang mở (đã áp override theo
 * dự án của request). Đổi vai trò/override/dự án → vân tay đổi → context cũ hết hiệu lực.
 */
export function vanTayQuyen(user: User, projectId: number): string {
  const perms = PERM_KEYS.filter((k) => CAN[k](user.role)).sort();
  return createHash("sha256")
    .update(JSON.stringify({ v: 1, u: user.id, o: user.orgId, r: user.role, p: projectId, perms }))
    .digest("hex");
}

async function sessionVersionHienTai(userId: number): Promise<number | null> {
  const row = await queryOne<{ sv: number }>(
    `SELECT session_version AS sv FROM users WHERE id = ?`,
    userId,
  );
  return row ? Number(row.sv) : null;
}

/** Cấp context cho actor + thiết bị (đã xác minh proof, chưa thu hồi) + dự án đã chốt bởi A1. */
export async function capNguCanh(
  user: User,
  thietBi: ThietBiOffline,
  projectId: number,
): Promise<NguCanhOffline> {
  damBaoNguCanhActor(user, projectId);
  if (thietBi.userId !== user.id || thietBi.revokedAt) throw new Error("Thiết bị không hợp lệ");
  const sv = await sessionVersionHienTai(user.id);
  if (sv == null) throw new Error("Không đọc được session_version");
  const gen = await queryOne<{ g: number }>(
    `SELECT nextval('offline_context_generation_seq') AS g`,
  );
  const profile = hoSoHieuLuc(thietBi);
  const issuedAt = Date.now();
  const payload: PayloadNguCanh = {
    v: 1,
    d: thietBi.id,
    u: user.id,
    o: user.orgId,
    p: projectId,
    s: sv,
    f: vanTayQuyen(user, projectId),
    g: Number(gen?.g),
    pr: profile,
    i: issuedAt,
    x: issuedAt + LEASE_MS[profile],
  };
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    contextId: `${b64}.${sign(MIEN_KY + b64)}`,
    generation: payload.g,
    deviceId: thietBi.id,
    projectId,
    profile,
    issuedAt: new Date(issuedAt).toISOString(),
    expiresAt: new Date(payload.x).toISOString(),
    cacheSchemaVersion: CACHE_SCHEMA_VERSION,
    serverTime: new Date().toISOString(),
  };
}

export type KetQuaKiemNguCanh =
  | { ok: true; generation: number; expiresAt: number }
  | { ok: false; code: "context_invalid" | "context_expired" | "context_changed" };

function docPayload(raw: string | null | undefined): PayloadNguCanh | null {
  if (typeof raw !== "string" || raw.length > MAX_CONTEXT_LEN) return null;
  const phan = raw.split(".");
  if (phan.length !== 2) return null;
  const [b64, mac] = phan;
  if (!/^[A-Za-z0-9_-]+$/.test(b64) || !/^[0-9a-f]{64}$/.test(mac)) return null;
  const mong = Buffer.from(sign(MIEN_KY + b64), "hex");
  const nhan = Buffer.from(mac, "hex");
  if (nhan.length !== mong.length || !timingSafeEqual(nhan, mong)) return null;
  let p: unknown;
  try {
    p = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const o = p as Partial<PayloadNguCanh> | null;
  const so = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (
    !o ||
    o.v !== 1 ||
    typeof o.d !== "string" ||
    typeof o.f !== "string" ||
    (o.pr !== "shared-safe" && o.pr !== "field-personal") ||
    ![o.u, o.o, o.p, o.s, o.g, o.i, o.x].every(so)
  )
    return null;
  return o as PayloadNguCanh;
}

/**
 * Kiểm context client gửi với trạng thái HIỆN HÀNH: chữ ký, hạn, actor/org/thiết bị/dự án,
 * sessionVersion, profile thực thi của thiết bị và vân tay quyền.
 */
export async function kiemNguCanh(
  raw: string | null | undefined,
  user: User,
  thietBi: ThietBiOffline,
  projectId: number,
): Promise<KetQuaKiemNguCanh> {
  const p = docPayload(raw);
  if (!p) return { ok: false, code: "context_invalid" };
  if (p.x <= Date.now()) return { ok: false, code: "context_expired" };
  if (
    p.u !== user.id ||
    p.o !== user.orgId ||
    p.d !== thietBi.id ||
    p.p !== projectId ||
    p.pr !== hoSoHieuLuc(thietBi) ||
    p.f !== vanTayQuyen(user, projectId) ||
    p.s !== (await sessionVersionHienTai(user.id))
  )
    return { ok: false, code: "context_changed" };
  return { ok: true, generation: p.g, expiresAt: p.x };
}

/**
 * Kiểm context của request HÀNG ĐỢI (S06) trên endpoint nghiệp vụ, nơi trình duyệt không gửi cookie
 * proof: thiết bị lấy theo id ký trong context, của chính actor (RLS + WHERE user/org). Thiết bị
 * không còn/đã thu hồi → context_changed (client xác minh lại qua /api/offline/context, nơi kiểm
 * proof và trả lỗi thiết bị cụ thể). Phần còn lại y hệt kiemNguCanh.
 */
export async function kiemNguCanhHangDoi(
  raw: string | null | undefined,
  user: User,
  projectId: number,
): Promise<KetQuaKiemNguCanh> {
  const p = docPayload(raw);
  if (!p) return { ok: false, code: "context_invalid" };
  const thietBi = await timThietBiTheoId(user, p.d);
  if (!thietBi || thietBi.revokedAt) return { ok: false, code: "context_changed" };
  return kiemNguCanh(raw, user, thietBi, projectId);
}
