// Thiết bị offline + trạng thái vault (QUALITY-FINAL-1 S05 — DATA-CONTRACTS §3, DATA-MIGRATIONS §3).
//
// Bất biến:
// - Proof trình duyệt = 32 byte ngẫu nhiên trong cookie HttpOnly; server CHỈ lưu SHA-256 (proof
//   entropy cao nên băm thẳng là đủ). Proof là ràng buộc trình duyệt, KHÔNG phải credential: mọi
//   thao tác vẫn cần phiên đúng chủ. Một trình duyệt có thể mang bản ghi của A lẫn B (unique
//   theo user/org/proof) — đăng ký B không ghi đè bản ghi của A.
// - Đăng ký luôn shared-safe; chỉ Admin cùng org (CAN.manageUsers + 2FA, kiểm ở route) đổi
//   profile/duyệt/thu hồi. Không đổi owner/org/proof. Thu hồi là một chiều.
// - Mọi truy vấn chạy trong withTransaction để GUC actor (app.user_id/org_id/role) có mặt cho RLS
//   của 0163; thiếu/lệch ngữ cảnh actor → throw (fail-closed) thay vì chạy không GUC.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "@/lib/db";
import { getRequestContext } from "@/lib/nen/request-context";
import { log } from "@/lib/nen/log";
import { docKeyringKek, OfflineKekConfigError, type KekKeyring } from "@/lib/nen/offline-crypto";

export const PROOF_COOKIE = "xboss_offline_proof";
/** Cookie proof chỉ đi kèm request tới /api/offline/* — không lộ ra mọi request khác. */
export const PROOF_COOKIE_PATH = "/api/offline";
/** Trình duyệt giới hạn Max-Age cookie ~400 ngày. */
export const PROOF_COOKIE_MAX_AGE = 400 * 86_400;
/** Trần bản ghi thiết bị CHƯA thu hồi mỗi người — chống tạo vô hạn bằng cách xoá cookie. */
export const MAX_THIET_BI_MOI_NGUOI = 20;

export type HoSoOffline = "shared-safe" | "field-personal";

/** Lỗi nghiệp vụ của luồng offline — route trả nguyên `status` + `{ error, code }`. */
export class LoiOffline extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LoiOffline";
  }
}

// ── Trạng thái tính năng (KEK) ────────────────────────────────────────────────────────────

export type TrangThaiVault =
  | { bat: true; keyring: KekKeyring }
  | { bat: false; code: "offline_vault_disabled" | "offline_vault_misconfigured" };

/** Đọc keyring mỗi lần gọi (đổi env khi xoay KEK có hiệu lực ngay). Thiếu → tắt; sai → tắt + log. */
export function trangThaiVault(): TrangThaiVault {
  try {
    const keyring = docKeyringKek(process.env.XBOSS_OFFLINE_KEK, process.env.XBOSS_SECRET);
    return keyring ? { bat: true, keyring } : { bat: false, code: "offline_vault_disabled" };
  } catch (e) {
    if (!(e instanceof OfflineKekConfigError)) throw e;
    log.error("Cấu hình XBOSS_OFFLINE_KEK không hợp lệ — vault offline bị tắt", { loi: e.message });
    return { bat: false, code: "offline_vault_misconfigured" };
  }
}

// ── Proof trình duyệt ─────────────────────────────────────────────────────────────────────

/** Proof hợp lệ = đúng 43 ký tự base64url (32 byte); khác đi → null (coi như chưa có). */
export function docProof(raw: string | undefined | null): Buffer | null {
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  const buf = Buffer.from(raw, "base64url");
  return buf.length === 32 ? buf : null;
}

export const taoProof = (): string => randomBytes(32).toString("base64url");

export const bamProof = (proof: Buffer): Buffer => createHash("sha256").update(proof).digest();

// ── Ngữ cảnh actor cho RLS ────────────────────────────────────────────────────────────────

type Actor = { id: number; orgId: number; role?: string };

/** GUC RLS lấy từ ngữ cảnh request (getCurrentUser) — phải khớp actor mà service đang phục vụ. */
export function damBaoNguCanhActor(user: Actor, projectId?: number): void {
  const ctx = getRequestContext();
  if (!ctx || ctx.userId !== user.id || ctx.orgId !== user.orgId)
    throw new Error("Thiếu/lệch ngữ cảnh actor cho thao tác offline");
  if (projectId !== undefined && ctx.projectId !== projectId)
    throw new Error("Lệch ngữ cảnh dự án cho thao tác offline");
}

// ── Bản ghi thiết bị ──────────────────────────────────────────────────────────────────────

export type ThietBiOffline = {
  id: string;
  userId: number;
  profile: HoSoOffline;
  approvedBy: number | null;
  approvedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type DongThietBi = {
  id: string;
  userId: number;
  profile: HoSoOffline;
  approvedBy: number | null;
  approvedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

const COT = `id, user_id AS "userId", profile, approved_by AS "approvedBy",
  approved_at AS "approvedAt", revoked_at AS "revokedAt", created_at AS "createdAt"`;

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function ra(d: DongThietBi): ThietBiOffline {
  return {
    id: d.id,
    userId: d.userId,
    profile: d.profile,
    approvedBy: d.approvedBy,
    approvedAt: iso(d.approvedAt),
    revokedAt: iso(d.revokedAt),
    createdAt: iso(d.createdAt) as string,
  };
}

/** Profile THỰC THI: field-personal chỉ khi đã được duyệt và chưa thu hồi; còn lại shared-safe. */
export function hoSoHieuLuc(t: ThietBiOffline): HoSoOffline {
  return t.profile === "field-personal" && t.approvedBy != null && t.approvedAt && !t.revokedAt
    ? "field-personal"
    : "shared-safe";
}

/** Bản ghi thiết bị của CHÍNH actor trên trình duyệt mang proof này (null nếu chưa đăng ký). */
export async function timThietBi(user: Actor, proofHash: Buffer): Promise<ThietBiOffline | null> {
  damBaoNguCanhActor(user);
  const row = await withTransaction(
    () =>
      queryOne<DongThietBi>(
        `SELECT ${COT} FROM offline_devices WHERE user_id = ? AND org_id = ? AND proof_hash = ?`,
        user.id,
        user.orgId,
        proofHash,
      ),
    { readOnly: true },
  );
  return row ? ra(row) : null;
}

/** Đăng ký idempotent: cùng actor + cùng proof → trả bản ghi cũ; bản ghi đã thu hồi → 403. */
export async function dangKyThietBi(
  user: Actor,
  proofHash: Buffer,
): Promise<{ thietBi: ThietBiOffline; moi: boolean }> {
  damBaoNguCanhActor(user);
  return withTransaction(async () => {
    const tim = () =>
      queryOne<DongThietBi>(
        `SELECT ${COT} FROM offline_devices WHERE user_id = ? AND org_id = ? AND proof_hash = ?`,
        user.id,
        user.orgId,
        proofHash,
      );
    const co = await tim();
    if (co) {
      if (co.revokedAt)
        throw new LoiOffline(403, "device_revoked", "Thiết bị này đã bị thu hồi quyền offline");
      return { thietBi: ra(co), moi: false };
    }
    const dem = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM offline_devices
        WHERE user_id = ? AND org_id = ? AND revoked_at IS NULL`,
      user.id,
      user.orgId,
    );
    if ((dem?.n ?? 0) >= MAX_THIET_BI_MOI_NGUOI)
      throw new LoiOffline(
        409,
        "device_limit",
        `Đã đạt tối đa ${MAX_THIET_BI_MOI_NGUOI} thiết bị offline — nhờ Admin thu hồi thiết bị cũ`,
      );
    const moi = await queryOne<DongThietBi>(
      `INSERT INTO offline_devices (id, user_id, org_id, proof_hash) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, org_id, proof_hash) DO NOTHING
       RETURNING ${COT}`,
      randomUUID(),
      user.id,
      user.orgId,
      proofHash,
    );
    if (moi) return { thietBi: ra(moi), moi: true };
    // Hai request đăng ký chạy song song: request kia đã chèn trước — trả bản ghi đó.
    const lai = await tim();
    if (!lai) throw new Error("Không đọc lại được bản ghi thiết bị vừa đăng ký");
    return { thietBi: ra(lai), moi: false };
  });
}

export type ThietBiTrongDanhSach = ThietBiOffline & { userName: string; thisBrowser: boolean };

/**
 * Danh sách thiết bị: `caToChuc` (Admin + CAN.manageUsers, route kiểm) → mọi thiết bị cùng org;
 * còn lại chỉ thiết bị của chính mình. Không bao giờ trả proof_hash/khoá/manifest.
 */
export async function danhSachThietBi(
  user: Actor,
  proofHash: Buffer | null,
  caToChuc: boolean,
): Promise<ThietBiTrongDanhSach[]> {
  damBaoNguCanhActor(user);
  const rows = await withTransaction(
    () =>
      query<DongThietBi & { userName: string; thisBrowser: boolean | null }>(
        `SELECT d.id, d.user_id AS "userId", d.profile, d.approved_by AS "approvedBy",
                d.approved_at AS "approvedAt", d.revoked_at AS "revokedAt",
                d.created_at AS "createdAt", u.name AS "userName",
                (d.user_id = ? AND d.proof_hash = ?::bytea) AS "thisBrowser"
           FROM offline_devices d JOIN users u ON u.id = d.user_id
          WHERE d.org_id = ? AND (?::boolean OR d.user_id = ?)
          ORDER BY d.created_at DESC, d.id
          LIMIT 500`,
        user.id,
        proofHash,
        user.orgId,
        caToChuc,
        user.id,
      ),
    { readOnly: true },
  );
  return rows.map((r) => ({ ...ra(r), userName: r.userName, thisBrowser: r.thisBrowser === true }));
}

export type ThayDoiThietBi = { profile: HoSoOffline } | { revoke: true };

/**
 * Admin đổi profile / thu hồi thiết bị cùng org (route đã kiểm CAN.manageUsers + 2FA).
 * field-personal: ghi người duyệt + thời điểm; từ chối nếu proof đang có bản ghi CHƯA thu hồi của
 * người khác trong org (thiết bị dùng chung → không phải "đúng một chủ sử dụng", D02).
 * shared-safe: xoá thông tin duyệt. Đã thu hồi → 409 (không mở lại).
 */
export async function capNhatThietBi(
  admin: Actor,
  id: string,
  thayDoi: ThayDoiThietBi,
): Promise<ThietBiOffline> {
  damBaoNguCanhActor(admin);
  return withTransaction(async () => {
    const hienTai = await queryOne<DongThietBi>(
      `SELECT ${COT} FROM offline_devices WHERE id = ?::uuid AND org_id = ? FOR UPDATE`,
      id,
      admin.orgId,
    );
    if (!hienTai) throw new LoiOffline(404, "device_not_found", "Không tìm thấy thiết bị");
    if (hienTai.revokedAt)
      throw new LoiOffline(409, "device_revoked", "Thiết bị đã bị thu hồi — không thể thay đổi");

    let sql: string;
    let params: unknown[];
    if ("revoke" in thayDoi) {
      sql = `UPDATE offline_devices SET revoked_at = now() WHERE id = ?::uuid RETURNING ${COT}`;
      params = [id];
    } else if (thayDoi.profile === "field-personal") {
      if (hienTai.profile === "field-personal") return ra(hienTai);
      const dungChung = await queryOne<{ id: string }>(
        `SELECT o.id FROM offline_devices o
           JOIN offline_devices d ON d.id = ?::uuid
          WHERE o.org_id = ? AND o.proof_hash = d.proof_hash
            AND o.user_id <> d.user_id AND o.revoked_at IS NULL
          LIMIT 1`,
        id,
        admin.orgId,
      );
      if (dungChung)
        throw new LoiOffline(
          409,
          "shared_browser",
          "Trình duyệt này đang được tài khoản khác dùng offline — không duyệt hồ sơ cá nhân",
        );
      sql = `UPDATE offline_devices
                SET profile = 'field-personal', approved_by = ?, approved_at = now()
              WHERE id = ?::uuid RETURNING ${COT}`;
      params = [admin.id, id];
    } else {
      sql = `UPDATE offline_devices
                SET profile = 'shared-safe', approved_by = NULL, approved_at = NULL
              WHERE id = ?::uuid RETURNING ${COT}`;
      params = [id];
    }
    const row = await queryOne<DongThietBi>(sql, ...params);
    if (!row) throw new LoiOffline(404, "device_not_found", "Không tìm thấy thiết bị");
    return ra(row);
  });
}
