// M134 — vô hiệu hoá / kích hoạt lại tài khoản (thay cho xoá khi user còn dữ liệu kiểm toán).
// Route `PATCH /api/users/:id { disabled }` chỉ bọc HTTP; luật nằm ở đây (ADR-0008).
import { query, queryOne, run, withTransaction } from "@/lib/db";

/**
 * Số Admin ĐANG HOẠT ĐỘNG của tổ chức, khoá dòng của họ (`FOR NO KEY UPDATE`, thứ tự id cố định) —
 * dùng cho mọi guard "Admin cuối cùng" (hạ cấp, xoá, khoá, đồng bộ role SSO). PHẢI gọi trong
 * transaction: hai thao tác đồng thời trên hai Admin khác nhau xếp hàng tại đây, thao tác sau đếm
 * lại sau khi thao tác trước commit → không cùng lọt guard để tổ chức còn 0 Admin.
 * KHÔNG dùng `FOR UPDATE`: mức đó xung đột với khoá KEY SHARE mà Postgres đặt khi một transaction
 * khác ghi dòng có FK tới Admin (`created_by`, `user_id`…) → guard treo tới statement_timeout hoặc
 * deadlock. `FOR NO KEY UPDATE` vẫn loại trừ lẫn nhau giữa các guard và với UPDATE dòng users.
 */
export async function khoaVaDemAdminHoatDong(orgId: number): Promise<number> {
  const admins = await query<{ id: number }>(
    `SELECT id FROM users WHERE org_id = ? AND role = 'admin' AND disabled_at IS NULL
      ORDER BY id FOR NO KEY UPDATE`,
    orgId,
  );
  return admins.length;
}

export type KetQuaKhoaTaiKhoan =
  { ok: true; disabledAt: Date | null } | { ok: false; status: 400 | 404; error: string };

/**
 * Đặt trạng thái khoá. Khoá: `disabled_at = now()`, `session_version + 1` (cắt mọi phiên, kể cả
 * ngữ cảnh offline), xoá push subscription (thiết bị không còn nhận tên task/dự án). Mở: `NULL` +
 * `session_version + 1`.
 * Idempotent: đã ở đúng trạng thái → không ghi gì (giữ mốc khoá gốc, không tăng phiên thêm).
 * Khoá: đếm Admin qua `khoaVaDemAdminHoatDong` — hai Admin khoá nhau đồng thời không thể cùng lọt
 * guard "Admin cuối cùng".
 */
export async function datKhoaTaiKhoan(
  targetId: number,
  khoa: boolean,
  actor: { id: number; orgId: number },
): Promise<KetQuaKhoaTaiKhoan> {
  if (khoa && targetId === actor.id)
    return { ok: false, status: 400, error: "Không thể tự vô hiệu hoá tài khoản đang đăng nhập" };

  return withTransaction(async () => {
    // Chỉ nhánh khoá mới cần đếm Admin; mở khoá không làm giảm số Admin hoạt động.
    const soAdmin = khoa ? await khoaVaDemAdminHoatDong(actor.orgId) : 0;
    const t = await queryOne<{ role: string; disabledAt: Date | null }>(
      `SELECT role, disabled_at AS "disabledAt" FROM users
        WHERE id = ? AND org_id = ? FOR NO KEY UPDATE`,
      targetId,
      actor.orgId,
    );
    if (!t) return { ok: false, status: 404, error: "Không tìm thấy người dùng" };
    if ((t.disabledAt != null) === khoa) return { ok: true, disabledAt: t.disabledAt };

    if (!khoa) {
      // Tăng phiên cả khi mở: cookie lỡ được đúc trong lúc đang khoá (route đổi mật khẩu/xác nhận 2FA
      // đọc lại session_version sau khi khoá) không được sống lại — mở khoá = đăng nhập lại.
      await run(
        `UPDATE users SET disabled_at = NULL, session_version = session_version + 1
          WHERE id = ? AND org_id = ?`,
        targetId,
        actor.orgId,
      );
      return { ok: true, disabledAt: null };
    }
    if (t.role === "admin" && soAdmin <= 1)
      return { ok: false, status: 400, error: "Không thể vô hiệu hoá Admin cuối cùng" };
    const r = await queryOne<{ disabledAt: Date }>(
      `UPDATE users SET disabled_at = now(), session_version = session_version + 1
        WHERE id = ? AND org_id = ? RETURNING disabled_at AS "disabledAt"`,
      targetId,
      actor.orgId,
    );
    await run(`DELETE FROM push_subscriptions WHERE user_id = ?`, targetId);
    return { ok: true, disabledAt: r?.disabledAt ?? null };
  });
}
