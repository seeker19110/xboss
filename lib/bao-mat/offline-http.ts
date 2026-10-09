// Ranh giới HTTP dùng chung cho /api/offline/* (QUALITY-FINAL-1 S05). Cùng tiền lệ requireApiKey
// (lib/bao-mat/api-keys.ts): helper trả sẵn NextResponse lỗi để mỗi route chỉ còn bọc dịch vụ.
// Thứ tự cố định: phiên (401, route tự gọi getCurrentUser) → Origin chặt (403) → tính năng bật
// (503) → rate limit (429).
// Mọi phản hồi `private, no-store` — thiết bị/context/khoá không bao giờ vào cache HTTP/SW.
import { NextRequest, NextResponse } from "next/server";
import { CAN, type User } from "@/lib/bao-mat/auth";
import { queryOne } from "@/lib/db";
import { isStrictSameOrigin } from "@/lib/bao-mat/csrf";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import {
  bamProof,
  docProof,
  LoiOffline,
  PROOF_COOKIE,
  timThietBi,
  trangThaiVault,
  type ThietBiOffline,
} from "@/lib/bao-mat/offline-devices";
import { CONTEXT_HEADER, kiemNguCanh, kiemNguCanhHangDoi } from "@/lib/bao-mat/offline-context";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import type { KekKeyring } from "@/lib/nen/offline-crypto";
import { log } from "@/lib/nen/log";

export const KHONG_LUU = { "Cache-Control": "private, no-store" } as const;

export function jsonOffline(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: KHONG_LUU });
}

export function loiOffline(
  status: number,
  code: string,
  error: string,
  headers?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ error, code }, { status, headers: { ...KHONG_LUU, ...headers } });
}

/** LoiOffline → phản hồi đúng mã; lỗi khác → 500 thông điệp chung (không lộ chi tiết). */
export function phanHoiLoiOffline(e: unknown): NextResponse {
  if (e instanceof LoiOffline) return loiOffline(e.status, e.code, e.message);
  log.error("Lỗi xử lý /api/offline", { loi: e instanceof Error ? e.message : String(e) });
  return loiOffline(500, "internal_error", "Lỗi máy chủ khi xử lý offline");
}

type MoDau =
  | { ok: false; res: NextResponse }
  | { ok: true; keyring: KekKeyring | null; proofHash: Buffer | null };

/**
 * Mở đầu mọi route offline SAU khi route đã getCurrentUser() (401). `canVault` → tính năng phải
 * bật (thiếu/sai XBOSS_OFFLINE_KEK → 503 fail-closed). `gioiHan` → rate limit theo user (đếm
 * trước, chặn sau như hitRateLimit).
 */
export async function moDauOffline(
  req: NextRequest,
  user: User,
  opts: {
    kiemOrigin: boolean;
    canVault: boolean;
    /** `phut` = cửa sổ đếm (mặc định 15 phút). */
    gioiHan?: { ten: string; max: number; phut?: number };
  },
): Promise<MoDau> {
  if (opts.kiemOrigin && !isStrictSameOrigin(req))
    return {
      ok: false,
      res: loiOffline(403, "origin_rejected", "Yêu cầu phải xuất phát từ chính ứng dụng"),
    };
  let keyring: KekKeyring | null = null;
  if (opts.canVault) {
    const st = trangThaiVault();
    if (!st.bat)
      return {
        ok: false,
        res: loiOffline(503, st.code, "Tính năng lưu offline an toàn chưa được bật trên máy chủ"),
      };
    keyring = st.keyring;
  }
  if (opts.gioiHan) {
    const CUA_SO_PHUT = opts.gioiHan.phut ?? 15;
    if (await hitRateLimit(`offline-${opts.gioiHan.ten}:${user.id}`, opts.gioiHan.max, CUA_SO_PHUT))
      return {
        ok: false,
        res: loiOffline(429, "rate_limited", "Thao tác quá nhiều lần, thử lại sau", {
          "Retry-After": String(CUA_SO_PHUT * 60),
        }),
      };
  }
  const proof = docProof(req.cookies.get(PROOF_COOKIE)?.value);
  return { ok: true, keyring, proofHash: proof ? bamProof(proof) : null };
}

/**
 * Thao tác quản trị thiết bị/khôi phục offline (DATA-CONTRACTS §3, M131 §3): chỉ Admin có
 * CAN.manageUsers VÀ đã bật 2FA. Trả phản hồi lỗi (403) hoặc null khi được phép.
 */
export async function requireAdminOffline2FA(
  user: User,
  thongDiep: string,
): Promise<NextResponse | null> {
  if (user.role !== "admin" || !CAN.manageUsers(user.role))
    return loiOffline(403, "forbidden", thongDiep);
  const tfa = await queryOne<{ on: boolean }>(
    `SELECT totp_enabled_at IS NOT NULL AS on FROM users WHERE id = ?`,
    user.id,
  );
  if (!tfa?.on)
    return loiOffline(
      403,
      "two_factor_required",
      "Cần bật xác thực 2 lớp trước khi duyệt/thu hồi thiết bị",
    );
  return null;
}

/** Thiết bị của chính actor trên trình duyệt này — chưa đăng ký/đã thu hồi → LoiOffline 403. */
export async function thietBiCuaToi(user: User, proofHash: Buffer | null): Promise<ThietBiOffline> {
  const tb = proofHash ? await timThietBi(user, proofHash) : null;
  if (!tb)
    throw new LoiOffline(403, "device_unregistered", "Trình duyệt này chưa đăng ký dùng offline");
  if (tb.revokedAt)
    throw new LoiOffline(403, "device_revoked", "Thiết bị này đã bị thu hồi quyền offline");
  return tb;
}

const THONG_DIEP_NGU_CANH = {
  context_invalid: "Thiếu hoặc sai ngữ cảnh offline — xác minh lại",
  context_expired: "Ngữ cảnh offline đã hết hạn — xác minh lại khi có mạng",
  context_changed: "Ngữ cảnh đã thay đổi (tài khoản/dự án/quyền/thiết bị) — tải lại",
} as const;

/**
 * Chốt bối cảnh cho route khoá vault: thiết bị của chính actor + dự án hiện hành (resolver A1,
 * không fallback) + header X-XBoss-Context còn khớp trạng thái hiện hành. Lệch → 409 (A2-FR03).
 */
export async function chotBoiCanhVault(
  req: NextRequest,
  user: User,
  proofHash: Buffer | null,
): Promise<{ user: User; thietBi: ThietBiOffline; projectId: number }> {
  const thietBi = await thietBiCuaToi(user, proofHash);
  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    throw new LoiOffline(409, "context_changed", THONG_DIEP_NGU_CANH.context_changed);
  const kq = await kiemNguCanh(req.headers.get(CONTEXT_HEADER), user, thietBi, projectId);
  if (!kq.ok) throw new LoiOffline(409, kq.code, THONG_DIEP_NGU_CANH[kq.code]);
  return { user, thietBi, projectId };
}

/**
 * Chốt context cho request HÀNG ĐỢI trên endpoint nghiệp vụ (S06, A2-FR03): header
 * X-XBoss-Context phải còn khớp actor/org/dự án hiện hành/sessionVersion/vân tay quyền/thiết bị —
 * lệch → 409 để client xác minh lại, KHÔNG ghi request cũ sang dự án của cookie mới.
 */
export async function chotNguCanhHangDoi(
  raw: string | null,
  user: User,
  projectId: number | null,
): Promise<void> {
  if (projectId == null)
    throw new LoiOffline(409, "context_changed", THONG_DIEP_NGU_CANH.context_changed);
  const kq = await kiemNguCanhHangDoi(raw, user, projectId);
  if (!kq.ok) throw new LoiOffline(409, kq.code, THONG_DIEP_NGU_CANH[kq.code]);
}

/** Route nghiệp vụ (S06): LoiOffline → `{ error, code }` đúng mã; lỗi khác ném tiếp cho đường cũ. */
export function traLoiOfflineHoacNem(e: unknown): NextResponse {
  if (e instanceof LoiOffline) return loiOffline(e.status, e.code, e.message);
  throw e;
}
