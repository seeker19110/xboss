// Khôi phục vault offline khi mất proof trình duyệt (M131 §3 — đóng "Cần quyết (3)" S05/S07).
//
// Luồng: chủ dữ liệu (trên thiết bị MỚI đã đăng ký, proof hợp lệ) gửi yêu cầu chỉ ra thiết bị CŨ của
// chính mình → Admin cùng org (CAN.manageUsers + 2FA, route kiểm; KHÔNG phải chính người yêu cầu)
// duyệt/từ chối; duyệt = thu hồi thiết bị cũ cùng transaction → chủ dữ liệu trên ĐÚNG thiết bị mới
// gọi hoàn tất: khoá của thiết bị cũ được bọc lại thành khoá mới của thiết bị mới (cùng DEK), dự án
// nào mất quyền thì bỏ qua + đếm.
//
// Bất biến (M131 §0):
// - Không phản hồi nào ở đây chứa vật liệu khoá (wrapped/DEK) — chỉ id/trạng thái/số đếm. Admin không
//   nhận khoá/draft; DEK chỉ ra ngoài qua `vault/unlock` như cũ (proof + context của thiết bị mới).
// - xboss_app không UPDATE/DELETE offline_vault_keys: khoá mới là dòng INSERT, khoá cũ giữ nguyên.
// - Mọi truy vấn trong withTransaction/withProjectScope để GUC actor có mặt cho RLS 0170.
import { query, queryOne, run, withTransaction } from "@/lib/db";
import type { User } from "@/lib/bao-mat/auth";
import {
  capNhatThietBi,
  damBaoNguCanhActor,
  LoiOffline,
  type ThietBiOffline,
} from "@/lib/bao-mat/offline-devices";
import { chuyenKhoaDuAn, demKhoaDuAnMatQuyen, type KhoaChuyen } from "@/lib/bao-mat/offline-vault";
import { visibleProjectIds } from "@/lib/ha-tang/projects";
import type { KekKeyring } from "@/lib/nen/offline-crypto";

export type TrangThaiKhoiPhuc = "pending" | "approved" | "rejected" | "completed" | "expired";

/** Loại notification báo Admin cùng org có yêu cầu chờ duyệt. */
export const LOAI_THONG_BAO_KHOI_PHUC = "offline_recovery_pending";
/** Độ dài tối đa lý do/ghi chú (khớp CHECK reason của 0170). */
export const MAX_GHI_CHU = 500;

export type YeuCauKhoiPhuc = {
  id: string;
  userId: number;
  userName: string;
  oldDeviceId: string;
  newDeviceId: string;
  status: TrangThaiKhoiPhuc;
  reason: string | null;
  decidedBy: number | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decideNote: string | null;
  completedAt: string | null;
  keysRecovered: number | null;
  keysSkipped: number | null;
  requestedAt: string;
};

type Dong = Omit<YeuCauKhoiPhuc, "decidedAt" | "completedAt" | "requestedAt"> & {
  decidedAt: Date | null;
  completedAt: Date | null;
  requestedAt: Date;
};

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function ra(d: Dong): YeuCauKhoiPhuc {
  return {
    ...d,
    decidedAt: iso(d.decidedAt),
    completedAt: iso(d.completedAt),
    requestedAt: iso(d.requestedAt) as string,
  };
}

const COT = `r.id, r.user_id AS "userId", u.name AS "userName", r.old_device_id AS "oldDeviceId",
  r.new_device_id AS "newDeviceId", r.status, r.reason, r.decided_by AS "decidedBy",
  d.name AS "decidedByName", r.decided_at AS "decidedAt", r.decide_note AS "decideNote",
  r.completed_at AS "completedAt", r.keys_recovered AS "keysRecovered",
  r.keys_skipped AS "keysSkipped", r.requested_at AS "requestedAt"`;
const NGUON = `offline_vault_recovery_requests r JOIN users u ON u.id = r.user_id
  LEFT JOIN users d ON d.id = r.decided_by`;

async function docMot(id: string, orgId: number): Promise<YeuCauKhoiPhuc | null> {
  const row = await queryOne<Dong>(
    `SELECT ${COT} FROM ${NGUON} WHERE r.id = ?::uuid AND r.org_id = ?`,
    id,
    orgId,
  );
  return row ? ra(row) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chủ dữ liệu tạo yêu cầu từ thiết bị hiện tại (`thietBiMoi` — đã kiểm proof, chưa thu hồi). Thiết
 * bị cũ phải thuộc CHÍNH actor + org (không thì 404 — không lộ thiết bị người khác). Đã có yêu cầu
 * đang mở (pending|approved) cho thiết bị cũ → 409 recovery_exists (unique một phần của 0170 chặn
 * cả hai request đồng thời). Trả yêu cầu mới + id Admin cùng org cần báo (route gửi push).
 */
export async function taoYeuCauKhoiPhuc(
  user: User,
  thietBiMoi: ThietBiOffline,
  oldDeviceId: string,
  reason: string | null,
): Promise<{ yeuCau: YeuCauKhoiPhuc; adminIds: number[] }> {
  damBaoNguCanhActor(user);
  if (!UUID_RE.test(oldDeviceId))
    throw new LoiOffline(404, "device_not_found", "Không tìm thấy thiết bị cũ");
  if (oldDeviceId.toLowerCase() === thietBiMoi.id.toLowerCase())
    throw new LoiOffline(
      422,
      "same_device",
      "Thiết bị cũ phải khác trình duyệt đang dùng — chọn thiết bị đã mất quyền truy cập",
    );
  return withTransaction(async () => {
    const cu = await queryOne<{ id: string }>(
      `SELECT id FROM offline_devices WHERE id = ?::uuid AND user_id = ? AND org_id = ?`,
      oldDeviceId,
      user.id,
      user.orgId,
    );
    if (!cu) throw new LoiOffline(404, "device_not_found", "Không tìm thấy thiết bị cũ");
    const moi = await queryOne<{ id: string }>(
      `INSERT INTO offline_vault_recovery_requests
         (org_id, user_id, old_device_id, new_device_id, reason)
       VALUES (?, ?, ?::uuid, ?::uuid, ?)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      user.orgId,
      user.id,
      cu.id,
      thietBiMoi.id,
      reason,
    );
    if (!moi)
      throw new LoiOffline(
        409,
        "recovery_exists",
        "Thiết bị này đã có yêu cầu khôi phục đang chờ xử lý",
      );
    const admins = await query<{ id: number }>(
      `SELECT id FROM users WHERE role = 'admin' AND org_id = ? AND id <> ? ORDER BY id`,
      user.orgId,
      user.id,
    );
    const adminIds = admins.map((a) => a.id);
    if (adminIds.length > 0) {
      const values = adminIds.map(() => `(?, ?, ?)`).join(", ");
      await run(
        `INSERT INTO notifications (user_id, type, message) VALUES ${values}`,
        ...adminIds.flatMap((id) => [
          id,
          LOAI_THONG_BAO_KHOI_PHUC,
          `${user.name} yêu cầu khôi phục dữ liệu ngoại tuyến từ thiết bị cũ — cần Admin duyệt`,
        ]),
      );
    }
    const yeuCau = await docMot(moi.id, user.orgId);
    if (!yeuCau) throw new Error("Không đọc lại được yêu cầu khôi phục vừa tạo");
    return { yeuCau, adminIds };
  });
}

/** Danh sách: `caToChuc` (Admin + CAN.manageUsers, route kiểm) → cả org; còn lại của chính mình. */
export async function danhSachYeuCauKhoiPhuc(
  user: User,
  caToChuc: boolean,
): Promise<YeuCauKhoiPhuc[]> {
  damBaoNguCanhActor(user);
  const rows = await withTransaction(
    () =>
      query<Dong>(
        `SELECT ${COT} FROM ${NGUON}
          WHERE r.org_id = ? AND (?::boolean OR r.user_id = ?)
          ORDER BY (r.status IN ('pending', 'approved')) DESC, r.requested_at DESC, r.id
          LIMIT 200`,
        user.orgId,
        caToChuc,
        user.id,
      ),
    { readOnly: true },
  );
  return rows.map(ra);
}

export type QuyetDinh = "approve" | "reject";

/**
 * Admin cùng org quyết định yêu cầu `pending` (route đã kiểm CAN.manageUsers + 2FA). Người yêu cầu
 * không tự quyết (403 — kể cả từ chối; CHECK SoD của 0170 là lưới cuối). Duyệt = thu hồi thiết bị
 * cũ CÙNG transaction (đúng ngữ nghĩa `capNhatThietBi` revoke: tăng session_version của chủ thiết
 * bị → mọi phiên cũ, kể cả trên thiết bị mới, phải đăng nhập lại) rồi mới đặt `approved`.
 */
export async function quyetDinhYeuCau(
  admin: User,
  id: string,
  quyetDinh: QuyetDinh,
  note: string | null,
): Promise<YeuCauKhoiPhuc> {
  damBaoNguCanhActor(admin);
  if (!UUID_RE.test(id))
    throw new LoiOffline(404, "recovery_not_found", "Không tìm thấy yêu cầu khôi phục");
  return withTransaction(async () => {
    const hienTai = await queryOne<{ userId: number; status: string; oldDeviceId: string }>(
      `SELECT user_id AS "userId", status, old_device_id AS "oldDeviceId"
         FROM offline_vault_recovery_requests WHERE id = ?::uuid AND org_id = ? FOR UPDATE`,
      id,
      admin.orgId,
    );
    if (!hienTai)
      throw new LoiOffline(404, "recovery_not_found", "Không tìm thấy yêu cầu khôi phục");
    if (hienTai.userId === admin.id)
      throw new LoiOffline(
        403,
        "self_decision_forbidden",
        "Không được tự duyệt yêu cầu khôi phục của chính mình — nhờ Admin khác",
      );
    if (hienTai.status !== "pending")
      throw new LoiOffline(409, "recovery_not_pending", "Yêu cầu đã được xử lý trước đó");
    if (quyetDinh === "approve") {
      const cu = await queryOne<{ revoked: boolean }>(
        `SELECT revoked_at IS NOT NULL AS revoked FROM offline_devices
          WHERE id = ?::uuid AND org_id = ?`,
        hienTai.oldDeviceId,
        admin.orgId,
      );
      if (!cu) throw new LoiOffline(404, "device_not_found", "Không tìm thấy thiết bị cũ");
      if (!cu.revoked) await capNhatThietBi(admin, hienTai.oldDeviceId, { revoke: true });
    }
    const doi = await run(
      `UPDATE offline_vault_recovery_requests
          SET status = ?, decided_by = ?, decided_at = now(), decide_note = ?
        WHERE id = ?::uuid AND status = 'pending'`,
      quyetDinh === "approve" ? "approved" : "rejected",
      admin.id,
      note,
      id,
    );
    if (doi.changes !== 1)
      throw new LoiOffline(409, "recovery_not_pending", "Yêu cầu đã được xử lý trước đó");
    const kq = await docMot(id, admin.orgId);
    if (!kq) throw new Error("Không đọc lại được yêu cầu khôi phục");
    return kq;
  });
}

/**
 * Chủ dữ liệu hoàn tất trên ĐÚNG thiết bị mới (proof hiện tại = `new_device_id`, khác → 403).
 * Yêu cầu phải `approved`. Duyệt từng dự án cùng org trong transaction riêng (GUC app.project_id
 * của dự án đó — RLS khoá chỉ theo đúng dự án GUC): dự án actor còn thấy → `chuyenKhoaDuAn`; dự án
 * đã mất quyền → chỉ đếm vào bỏ qua. Cuối cùng đặt `completed` + số đếm.
 *
 * Không nguyên tử xuyên dự án (GUC dự án không đổi được giữa chừng một transaction — A1-AC04): lỗi
 * giữa chừng để yêu cầu ở `approved`, gọi lại sẽ bọc lại từ đầu — khoá trùng (nếu có) mang CÙNG DEK
 * nên vô hại, mapping lần gọi sau vẫn đầy đủ.
 */
export async function hoanTatKhoiPhuc(
  user: User,
  thietBi: ThietBiOffline,
  keyring: KekKeyring,
  id: string,
): Promise<{ mapping: KhoaChuyen[]; skipped: number }> {
  damBaoNguCanhActor(user);
  if (!UUID_RE.test(id))
    throw new LoiOffline(404, "recovery_not_found", "Không tìm thấy yêu cầu khôi phục");
  const yc = await withTransaction(
    () =>
      queryOne<{ status: string; oldDeviceId: string; newDeviceId: string }>(
        `SELECT status, old_device_id AS "oldDeviceId", new_device_id AS "newDeviceId"
           FROM offline_vault_recovery_requests
          WHERE id = ?::uuid AND org_id = ? AND user_id = ?`,
        id,
        user.orgId,
        user.id,
      ),
    { readOnly: true },
  );
  if (!yc) throw new LoiOffline(404, "recovery_not_found", "Không tìm thấy yêu cầu khôi phục");
  if (yc.newDeviceId.toLowerCase() !== thietBi.id.toLowerCase())
    throw new LoiOffline(
      403,
      "wrong_device",
      "Chỉ hoàn tất được trên đúng trình duyệt đã gửi yêu cầu khôi phục",
    );
  if (yc.status !== "approved")
    throw new LoiOffline(409, "recovery_not_approved", "Yêu cầu chưa được Admin duyệt");

  const conThay = new Set(await withTransaction(() => visibleProjectIds(user), { readOnly: true }));
  const duAnOrg = await withTransaction(
    () => query<{ id: number }>(`SELECT id FROM projects WHERE org_id = ? ORDER BY id`, user.orgId),
    { readOnly: true },
  );
  const mapping: KhoaChuyen[] = [];
  let skipped = 0;
  for (const { id: projectId } of duAnOrg) {
    if (!conThay.has(projectId)) {
      skipped += await demKhoaDuAnMatQuyen(user, yc.oldDeviceId, projectId);
      continue;
    }
    const kq = await chuyenKhoaDuAn(user, yc.oldDeviceId, thietBi, projectId, keyring);
    mapping.push(...kq.mapping);
    skipped += kq.skipped;
  }

  const xong = await withTransaction(() =>
    run(
      `UPDATE offline_vault_recovery_requests
          SET status = 'completed', completed_at = now(), keys_recovered = ?, keys_skipped = ?
        WHERE id = ?::uuid AND user_id = ? AND status = 'approved' AND new_device_id = ?::uuid`,
      mapping.length,
      skipped,
      id,
      user.id,
      thietBi.id,
    ),
  );
  if (xong.changes !== 1)
    throw new LoiOffline(409, "recovery_not_approved", "Yêu cầu đã đổi trạng thái — tải lại");
  return { mapping, skipped };
}
