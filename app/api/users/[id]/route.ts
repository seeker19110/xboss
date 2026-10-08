import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN, hashPassword, ROLES, type Role } from "@/lib/bao-mat/auth";

export const dynamic = "force-dynamic";

// PATCH /api/users/:id  body: { name?, role?, password? } → sửa user (Admin).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const me = await getCurrentUser();
  // Tách 401 khỏi 403 như quy ước chung của dự án: gộp chung khiến client không phân biệt
  // được "phiên hết hạn, đăng nhập lại" với "tài khoản không đủ quyền".
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(me.role))
    return NextResponse.json({ error: "Chỉ Admin được sửa người dùng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // M54 GĐ1 PR2 / V10: cô lập tenant — chỉ sửa user cùng org với người gọi (khớp lọc org_id
  // của GET /api/users cùng cụm; route này chạy ngoài withTransaction nên RLS không tự áp
  // được, phải lọc tường minh). Thiếu điều kiện này thì admin org A đoán ID đổi được vai
  // trò/mật khẩu/2FA của user org B — chiếm quyền tài khoản xuyên tổ chức.
  const target = await queryOne<{ id: number; role: Role }>(
    `SELECT id, role FROM users WHERE id = ? AND org_id = ?`,
    id,
    me.orgId,
  );
  if (!target) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  if (body.role !== undefined) {
    const role = String(body.role) as Role;
    if (!ROLES.includes(role))
      return NextResponse.json({ error: "Vai trò không hợp lệ" }, { status: 400 });
    // Không cho hạ cấp admin cuối cùng (kể cả tự hạ mình). Đếm THEO ORG — nếu đếm toàn hệ
    // thống, tổ chức khác có admin sẽ khiến guard cho qua dù tổ chức này chỉ còn 1 admin,
    // làm tổ chức đó mất khả năng tự quản trị.
    if (target.role === "admin" && role !== "admin") {
      const admins = await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND org_id = ?`,
        me.orgId,
      );
      if (Number(admins?.n) <= 1)
        return NextResponse.json({ error: "Không thể hạ cấp Admin cuối cùng" }, { status: 400 });
    }
    await run(`UPDATE users SET role = ? WHERE id = ? AND org_id = ?`, role, id, me.orgId);
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "Tên không được trống" }, { status: 400 });
    await run(`UPDATE users SET name = ? WHERE id = ? AND org_id = ?`, name, id, me.orgId);
  }

  if (body.password !== undefined) {
    const pw = String(body.password);
    if (pw.length < 6)
      return NextResponse.json({ error: "Mật khẩu tối thiểu 6 ký tự" }, { status: 400 });
    await run(
      `UPDATE users SET password_hash = ? WHERE id = ? AND org_id = ?`,
      hashPassword(pw),
      id,
      me.orgId,
    );
  }

  // Admin tắt 2FA hộ user khác (M56 PR1) — đường thoát khi user mất máy xác thực.
  // Ghi audit qua trigger sẵn có trên bảng users, không cần log riêng.
  if (body.disable2fa === true) {
    const reset = await withTransaction(async () => {
      // Cùng khoá với setup/confirm/login 2FA; thu hồi mọi phiên khi admin đặt lại MFA.
      const current = await queryOne<{ id: number }>(
        `SELECT id FROM users WHERE id = ? AND org_id = ? FOR UPDATE`,
        id,
        me.orgId,
      );
      if (!current) return false;
      await run(
        `UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL,
                          session_version = session_version + 1 WHERE id = ? AND org_id = ?`,
        id,
        me.orgId,
      );
      await run(`DELETE FROM totp_recovery_codes WHERE user_id = ?`, id);
      return true;
    });
    if (!reset) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
  }

  const user = await queryOne(
    `SELECT id, name, email, role FROM users WHERE id = ? AND org_id = ?`,
    id,
    me.orgId,
  );
  return NextResponse.json({ user });
}

// DELETE /api/users/:id → xoá user (Admin). Không xoá chính mình / admin cuối.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageUsers(me.role))
    return NextResponse.json({ error: "Chỉ Admin được xoá người dùng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  if (id === me.id)
    return NextResponse.json(
      { error: "Không thể tự xoá tài khoản đang đăng nhập" },
      { status: 400 },
    );

  // M54 GĐ1 PR2 / V10: cô lập tenant — chỉ xoá user cùng org với người gọi (khớp lọc org_id
  // của GET /api/users cùng cụm; route này chạy ngoài withTransaction nên RLS không tự áp
  // được, phải lọc tường minh). Thiếu điều kiện này thì admin org A đoán ID xoá được thẳng
  // user org B.
  const target = await queryOne<{ id: number; role: Role }>(
    `SELECT id, role FROM users WHERE id = ? AND org_id = ?`,
    id,
    me.orgId,
  );
  if (!target) return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });

  // Đếm THEO ORG cùng lý do như nhánh PATCH ở trên — đừng để admin của tổ chức khác che lấp
  // việc tổ chức này chỉ còn đúng 1 admin.
  if (target.role === "admin") {
    const admins = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND org_id = ?`,
      me.orgId,
    );
    if (Number(admins?.n) <= 1)
      return NextResponse.json({ error: "Không thể xoá Admin cuối cùng" }, { status: 400 });
  }

  // Gỡ liên kết trước khi xoá (giữ lịch sử/thông báo sạch FK). Cùng 1 transaction: nếu user còn
  // được tham chiếu (người tạo/duyệt hợp đồng, nhật ký, chứng từ…) thì 23503 → rollback hết,
  // không để lại việc đã gỡ giao; trả 409 dependency_conflict thay vì 500 (S13c).
  try {
    await withTransaction(async () => {
      await run(`UPDATE tasks SET assigned_to = NULL WHERE assigned_to = ?`, id);
      await run(`DELETE FROM notifications WHERE user_id = ?`, id);
      await run(`DELETE FROM users WHERE id = ? AND org_id = ?`, id, me.orgId);
    });
  } catch (err) {
    if ((err as { code?: string }).code !== "23503") throw err;
    return NextResponse.json(
      {
        error:
          "Người dùng đang được tham chiếu trong dữ liệu khác (hợp đồng, nhật ký, chứng từ…) — không xoá được, hãy đổi vai trò hoặc thu hồi phiên thay vì xoá",
        code: "dependency_conflict",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
