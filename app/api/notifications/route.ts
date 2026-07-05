import { NextResponse } from "next/server";
import { query, run, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { costSummary, getCostSettings } from "@/lib/cost";
import { poLateList, vehicleLateList } from "@/lib/procurement";
import { missingDiaryDates } from "@/lib/diary";
import { expiringContracts } from "@/lib/contracts";

export const dynamic = "force-dynamic";

// GET /api/notifications
// Đồng bộ task trễ → notifications cho user hiện tại, rồi trả về danh sách + số chưa đọc.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const today = todayISO();

  // Task đang trễ mà user này chưa có thông báo → tạo mới (UNIQUE chặn trùng).
  // Sub-con chỉ nhận thông báo cho task được giao.
  const isSubcon = user.role === "subcon";
  const subconFilter = isSubcon ? " AND t.assigned_to = ?" : "";
  const delayed = await query<{
    id: number;
    code: string;
    name: string;
    endDate: string;
    sheetType: string;
  }>(
    `SELECT t.id, t.code, t.name, t.end_date AS "endDate", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')${subconFilter}`,
    ...(isSubcon ? [today, user.id] : [today]),
  );

  if (delayed.length > 0) {
    const values = delayed.map(() => `(?, ?, 'delayed', ?)`).join(", ");
    const params = delayed.flatMap((t) => [
      user.id,
      t.id,
      `[${t.sheetType}] ${t.code} — ${t.name} đã quá hạn ${t.endDate}`,
    ]);
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message) VALUES ${values}
       ON CONFLICT (user_id, task_id, type) DO NOTHING`,
      ...params,
    );
  }

  // Sắp đến hạn: deadline còn ≤3 ngày mà tiến độ < 70% → cảnh báo sớm trước khi thành trễ.
  const soon = daysFromTodayISO(3);
  const DUE_SOON_COND = `t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        AND t.progress_percent < 0.7 AND t.status NOT IN ('hoan_thanh','nghiem_thu')`;
  const dueSoon = await query<{
    id: number;
    code: string;
    name: string;
    endDate: string;
    sheetType: string;
  }>(
    `SELECT t.id, t.code, t.name, t.end_date AS "endDate", st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE ${DUE_SOON_COND}${subconFilter}`,
    ...(isSubcon ? [today, soon, user.id] : [today, soon]),
  );

  if (dueSoon.length > 0) {
    const values = dueSoon.map(() => `(?, ?, 'due_soon', ?)`).join(", ");
    const params = dueSoon.flatMap((t) => [
      user.id,
      t.id,
      `⏳ [${t.sheetType}] ${t.code} — ${t.name} sắp đến hạn ${t.endDate} (tiến độ < 70%)`,
    ]);
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message) VALUES ${values}
       ON CONFLICT (user_id, task_id, type) DO NOTHING`,
      ...params,
    );
  }

  // Task hết trễ (hoặc không còn được giao cho mình) → dọn thông báo cũ chưa đọc.
  await run(
    `DELETE FROM notifications
      WHERE user_id = ? AND type = 'delayed' AND is_read = 0
        AND task_id NOT IN (
          SELECT t.id FROM tasks t
           WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
             AND t.status NOT IN ('hoan_thanh','nghiem_thu')${subconFilter})`,
    ...(isSubcon ? [user.id, today, user.id] : [user.id, today]),
  );

  // Task không còn "sắp đến hạn" (đã xong, đã qua hạn thành trễ, hoặc đổi deadline) → dọn tương tự.
  await run(
    `DELETE FROM notifications
      WHERE user_id = ? AND type = 'due_soon' AND is_read = 0
        AND task_id NOT IN (
          SELECT t.id FROM tasks t WHERE ${DUE_SOON_COND}${subconFilter})`,
    ...(isSubcon ? [user.id, today, soon, user.id] : [user.id, today, soon]),
  );

  // Task đình trệ: đang thi công, chưa xong, còn hạn (end_date ≥ hôm nay) nhưng KHÔNG có
  // cập nhật tiến độ nào trong 7 ngày → nhắc người liên quan cập nhật. Khác "trễ" (đã quá hạn).
  const STALLED_COND = `t.status = 'dang_thi_cong' AND t.progress_percent < 1
        AND (t.end_date IS NULL OR t.end_date >= ?)
        AND NOT EXISTS (SELECT 1 FROM task_history h
                          WHERE h.task_id = t.id AND h.changed_at > NOW() - INTERVAL '7 days')`;
  const stalled = await query<{ id: number; code: string; name: string; sheetType: string }>(
    `SELECT t.id, t.code, t.name, st.code AS "sheetType"
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE ${STALLED_COND}${subconFilter}`,
    ...(isSubcon ? [today, user.id] : [today]),
  );

  if (stalled.length > 0) {
    const values = stalled.map(() => `(?, ?, 'stalled', ?)`).join(", ");
    const params = stalled.flatMap((t) => [
      user.id,
      t.id,
      `🕒 [${t.sheetType}] ${t.code} — ${t.name} chưa cập nhật tiến độ 7 ngày, hãy kiểm tra`,
    ]);
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message) VALUES ${values}
       ON CONFLICT (user_id, task_id, type) DO NOTHING`,
      ...params,
    );
  }

  // Hết đình trệ (đã cập nhật, đã xong, hoặc đã thành trễ) → dọn thông báo chưa đọc.
  await run(
    `DELETE FROM notifications
      WHERE user_id = ? AND type = 'stalled' AND is_read = 0
        AND task_id NOT IN (
          SELECT t.id FROM tasks t WHERE ${STALLED_COND}${subconFilter})`,
    ...(isSubcon ? [user.id, today, user.id] : [user.id, today]),
  );

  // Vật tư dùng vượt định mức → cảnh báo cho Admin/PM/Kỹ sư (subcon không quản vật tư).
  if (user.role !== "subcon") {
    const overMats = await query<{
      id: number;
      name: string;
      unit: string | null;
      qtyPlanned: number;
      qtyUsed: number;
      sheetCode: string | null;
    }>(
      `SELECT m.id, m.name, m.unit, m.qty_planned AS "qtyPlanned", m.qty_used AS "qtyUsed", st.code AS "sheetCode"
         FROM materials m
         LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
        WHERE m.qty_planned > 0 AND m.qty_used > m.qty_planned`,
    );

    if (overMats.length > 0) {
      const values = overMats.map(() => `(?, ?, 'material_over', ?)`).join(", ");
      const params = overMats.flatMap((m) => [
        user.id,
        m.id,
        `📦 Vật tư "${m.name}"${m.sheetCode ? ` [${m.sheetCode}]` : ""} vượt định mức: ${m.qtyUsed}/${m.qtyPlanned}${m.unit ? ` ${m.unit}` : ""}`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, material_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, material_id, type) WHERE material_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }

    // Đã điều chỉnh định mức/số dùng về ngưỡng an toàn (hoặc vật tư bị xoá) → dọn cảnh báo chưa đọc.
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'material_over' AND is_read = 0
          AND material_id NOT IN (
            SELECT id FROM materials WHERE qty_planned > 0 AND qty_used > qty_planned)`,
      user.id,
    );
  }

  // Vượt ngân sách theo hệ → cảnh báo Admin/PM/BCH (subcon/cdt/viewer/engineer không xem chi phí).
  if (CAN.viewPayments(user.role)) {
    const settings = await getCostSettings();
    const rows = await costSummary("system");
    const over = rows.filter(
      (r) => r.budget > 0 && (r.committed / r.budget) * 100 >= settings.warnPct,
    );

    if (over.length > 0) {
      const values = over.map(() => `(?, ?, 'cost_over', ?)`).join(", ");
      const params = over.flatMap((r) => {
        const pct = Math.round((r.committed / r.budget) * 100);
        return [user.id, r.key, `💰 Hệ "${r.label}" cam kết đạt ${pct}% ngân sách`];
      });
      await run(
        `INSERT INTO notifications (user_id, cost_group, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, cost_group) WHERE cost_group IS NOT NULL DO NOTHING`,
        ...params,
      );
    }

    const overKeys = over.map((r) => r.key);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'cost_over' AND is_read = 0
          AND cost_group <> ALL(?)`,
      user.id,
      overKeys,
    );

    // Hợp đồng sắp hết hiệu lực hoặc đã quá hạn mà chưa đổi trạng thái → cảnh báo (M16).
    const expiring = await expiringContracts();
    if (expiring.length > 0) {
      const values = expiring.map(() => `(?, ?, 'contract_expiry', ?)`).join(", ");
      const params = expiring.flatMap((c) => [
        user.id,
        c.id,
        c.expired
          ? `📄 Hợp đồng ${c.code} — ${c.title} đã quá hạn hiệu lực (${c.validTo})`
          : `📄 Hợp đồng ${c.code} — ${c.title} sắp hết hiệu lực (${c.validTo})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, contract_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, contract_id) WHERE contract_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const expiringIds = expiring.map((c) => c.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'contract_expiry' AND is_read = 0 AND contract_id <> ALL(?)`,
      user.id,
      expiringIds,
    );
  }

  // NCR quá hạn chưa đóng → cảnh báo người được gán; Admin/PM thấy mọi NCR quá hạn (quản lý chung).
  {
    const isPrivileged = user.role === "admin" || user.role === "pm";
    const assignedFilter = isPrivileged ? "" : " AND n.assigned_to = ?";
    const ncrParams = isPrivileged ? [today] : [today, user.id];
    const overdueNcrs = await query<{
      id: number;
      code: string;
      description: string;
      dueDate: string;
    }>(
      `SELECT n.id, n.code, n.description, n.due_date AS "dueDate"
         FROM ncrs n
        WHERE n.status <> 'closed' AND n.due_date IS NOT NULL AND n.due_date < ?${assignedFilter}`,
      ...ncrParams,
    );

    if (overdueNcrs.length > 0) {
      const values = overdueNcrs.map(() => `(?, ?, 'ncr_overdue', ?)`).join(", ");
      const params = overdueNcrs.flatMap((n) => [
        user.id,
        n.id,
        `⚠ NCR ${n.code} quá hạn khắc phục (${n.dueDate}): ${n.description}`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, ncr_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, ncr_id, type) WHERE ncr_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }

    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'ncr_overdue' AND is_read = 0
          AND ncr_id NOT IN (
            SELECT n.id FROM ncrs n
             WHERE n.status <> 'closed' AND n.due_date IS NOT NULL AND n.due_date < ?${assignedFilter})`,
      user.id,
      ...ncrParams,
    );
  }

  // PO trễ giao (quá expected_date, chưa đủ hàng) → cảnh báo người quản lý mua sắm (Admin/PM).
  if (user.role === "admin" || user.role === "pm") {
    const latePos = await poLateList();
    if (latePos.length > 0) {
      const values = latePos.map(() => `(?, ?, 'po_late', ?)`).join(", ");
      const params = latePos.flatMap((po) => [
        user.id,
        po.id,
        `🚚 PO ${po.poCode}${po.supplierName ? ` (${po.supplierName})` : ""} trễ giao — dự kiến ${po.expectedDate}`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, po_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, po_id, type) WHERE po_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const lateIds = latePos.map((po) => po.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'po_late' AND is_read = 0 AND po_id <> ALL(?)`,
      user.id,
      lateIds,
    );

    // Xe NCC quá giờ dự kiến ≥2h chưa vào cổng → cảnh báo Admin/PM.
    const lateVehicles = await vehicleLateList();
    if (lateVehicles.length > 0) {
      const values = lateVehicles.map(() => `(?, ?, 'vehicle_late', ?)`).join(", ");
      const params = lateVehicles.flatMap((v) => [
        user.id,
        v.id,
        `🚛 Xe ${v.plate}${v.supplierName ? ` (${v.supplierName})` : ""} quá giờ dự kiến ${new Date(v.expectedAt).toLocaleString("vi-VN")} chưa vào cổng`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, vehicle_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, vehicle_id, type) WHERE vehicle_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const lateVehicleIds = lateVehicles.map((v) => v.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'vehicle_late' AND is_read = 0 AND vehicle_id <> ALL(?)`,
      user.id,
      lateVehicleIds,
    );
  }

  // Chưa lập nhật ký thi công cho ngày có cập nhật tiến độ → nhắc người lập (Admin/PM/Kỹ sư).
  if (user.role === "admin" || user.role === "pm" || user.role === "engineer") {
    const missingDates = await missingDiaryDates();
    if (missingDates.length > 0) {
      const values = missingDates.map(() => `(?, ?, 'diary_missing', ?)`).join(", ");
      const params = missingDates.flatMap((d) => [
        user.id,
        d,
        `📔 Chưa lập nhật ký thi công ngày ${d} (đã có cập nhật tiến độ)`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, diary_date, type, message) VALUES ${values}
         ON CONFLICT (user_id, diary_date, type) WHERE diary_date IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'diary_missing' AND is_read = 0 AND diary_date <> ALL(?)`,
      user.id,
      missingDates,
    );
  }

  const items = await query<{
    id: number;
    taskId: number | null;
    type: string;
    message: string;
    isRead: number;
    createdAt: string;
  }>(
    `SELECT id, task_id AS "taskId", type, message, is_read AS "isRead", created_at AS "createdAt"
       FROM notifications WHERE user_id = ?
      ORDER BY is_read ASC, created_at DESC, id DESC LIMIT 50`,
    user.id,
  );

  const unread = items.filter((n) => !n.isRead).length;
  return NextResponse.json({ notifications: items, unread });
}

// POST /api/notifications  body: { markAllRead: true } → đánh dấu tất cả đã đọc.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.markAllRead) {
    await run(`UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`, user.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Thiếu hành động" }, { status: 400 });
}
