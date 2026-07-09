import { NextResponse } from "next/server";
import { query, run, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/auth";
import { costSummary, getCostSettings } from "@/lib/cost";
import { poLateList, vehicleLateList } from "@/lib/procurement";
import { missingDiaryDates } from "@/lib/diary";
import { expiringContracts } from "@/lib/contracts";
import { pendingVariations } from "@/lib/vo";
import { overContractCerts, pendingCerts } from "@/lib/paymentcerts";
import { dueCorrespondences } from "@/lib/correspondence";
import { frontMissingList } from "@/lib/workfronts";
import { calibrationDueList } from "@/lib/equipment";
import { overNormItems, NORM_OVER_THRESHOLD_PCT } from "@/lib/norms";
import { openHseActions } from "@/lib/hse";
import { overdueMeetingActions } from "@/lib/meetings";
import { pendingProposalsOver } from "@/lib/proposals";
import { getCurrentProjectId } from "@/lib/projects";
import { EXPIRY_WARN_DAYS } from "@/lib/contracts";
import { CERT_PENDING_DAYS } from "@/lib/paymentcerts";
import { VO_PENDING_DAYS } from "@/lib/vo";
import { CALIBRATION_WARN_DAYS } from "@/lib/equipment";
import { PROPOSAL_PENDING_DAYS } from "@/lib/proposals";

export const dynamic = "force-dynamic";

// GET /api/notifications
// Đồng bộ task trễ → notifications cho user hiện tại, rồi trả về danh sách + số chưa đọc.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Dự án đang chọn — lọc mọi cảnh báo theo dự án để tránh rò rỉ chéo dự án (đa dự án, M22+).
  // null = DB chưa có project nào → giữ hành vi không lọc (tương thích ngược).
  const projectId = await getCurrentProjectId(user);

  const today = todayISO();

  // Task đang trễ mà user này chưa có thông báo → tạo mới (UNIQUE chặn trùng).
  // Sub-con chỉ nhận thông báo cho task được giao.
  const isSubcon = user.role === "subcon";
  const subconFilter = isSubcon ? " AND t.assigned_to = ?" : "";
  // Lọc theo dự án đang chọn (đa dự án, M22+) — SQL thô trên tasks chưa có project_id
  // trực tiếp, suy qua work_packages → sheet_types → towers. null = không lọc (tương
  // thích ngược DB chưa có project nào). Áp đối xứng cho cả tạo mới lẫn dọn dẹp, tránh
  // xoá nhầm thông báo dự án khác.
  const projectJoin = projectId != null ? " JOIN towers tw ON tw.id = st.tower_id" : "";
  const projectFilter = projectId != null ? " AND tw.project_id = ?" : "";
  const projectParam = projectId != null ? [projectId] : [];
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
       JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
      WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')${subconFilter}${projectFilter}`,
    ...(isSubcon ? [today, user.id] : [today]),
    ...projectParam,
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
       JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
      WHERE ${DUE_SOON_COND}${subconFilter}${projectFilter}`,
    ...(isSubcon ? [today, soon, user.id] : [today, soon]),
    ...projectParam,
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
           JOIN work_packages wp ON t.package_id = wp.id
           JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
           WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
             AND t.status NOT IN ('hoan_thanh','nghiem_thu')${subconFilter}${projectFilter})`,
    ...(isSubcon ? [user.id, today, user.id] : [user.id, today]),
    ...projectParam,
  );

  // Task không còn "sắp đến hạn" (đã xong, đã qua hạn thành trễ, hoặc đổi deadline) → dọn tương tự.
  await run(
    `DELETE FROM notifications
      WHERE user_id = ? AND type = 'due_soon' AND is_read = 0
        AND task_id NOT IN (
          SELECT t.id FROM tasks t
           JOIN work_packages wp ON t.package_id = wp.id
           JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
           WHERE ${DUE_SOON_COND}${subconFilter}${projectFilter})`,
    ...(isSubcon ? [user.id, today, soon, user.id] : [user.id, today, soon]),
    ...projectParam,
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
       JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
      WHERE ${STALLED_COND}${subconFilter}${projectFilter}`,
    ...(isSubcon ? [today, user.id] : [today]),
    ...projectParam,
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
          SELECT t.id FROM tasks t
           JOIN work_packages wp ON t.package_id = wp.id
           JOIN sheet_types st ON wp.sheet_type_id = st.id${projectJoin}
           WHERE ${STALLED_COND}${subconFilter}${projectFilter})`,
    ...(isSubcon ? [user.id, today, user.id] : [user.id, today]),
    ...projectParam,
  );

  // Vật tư dùng vượt định mức → cảnh báo cho Admin/PM/Kỹ sư (subcon không quản vật tư).
  // materials có project_id trực tiếp (M22+) — lọc theo dự án đang chọn.
  if (user.role !== "subcon") {
    const matProjectFilter = projectId != null ? " AND m.project_id = ?" : "";
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
        WHERE m.qty_planned > 0 AND m.qty_used > m.qty_planned${matProjectFilter}`,
      ...projectParam,
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
            SELECT id FROM materials m WHERE qty_planned > 0 AND qty_used > qty_planned${matProjectFilter})`,
      user.id,
      ...projectParam,
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
    const expiring = await expiringContracts(EXPIRY_WARN_DAYS, projectId ?? undefined);
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

    // HĐ có đợt IPC đã duyệt mà luỹ kế nghiệm thu vượt giá trị HĐ (gồm phụ lục) → cảnh báo (M17).
    const overCerts = await overContractCerts(projectId ?? undefined);
    if (overCerts.length > 0) {
      const values = overCerts.map(() => `(?, ?, 'cert_over_contract', ?)`).join(", ");
      const params = overCerts.flatMap((c) => [
        user.id,
        c.contractId,
        `📈 Hợp đồng ${c.contractCode} — ${c.contractTitle} luỹ kế nghiệm thu vượt giá trị HĐ (${Math.round((c.cumulativeValue / c.contractValue) * 100)}%)`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, contract_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, contract_id) WHERE contract_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const overCertIds = overCerts.map((c) => c.contractId);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'cert_over_contract' AND is_read = 0 AND contract_id <> ALL(?)`,
      user.id,
      overCertIds,
    );
  }

  // Đợt thanh toán (IPC) đã trình quá hạn chưa quyết định → nhắc Admin/PM (M17).
  if (isAdminOrPm(user.role)) {
    const pendingCertsList = await pendingCerts(CERT_PENDING_DAYS, projectId ?? undefined);
    if (pendingCertsList.length > 0) {
      const values = pendingCertsList.map(() => `(?, ?, 'cert_pending', ?)`).join(", ");
      const params = pendingCertsList.flatMap((c) => [
        user.id,
        c.id,
        `💳 Đợt thanh toán ${c.code} (HĐ ${c.contractCode}) đã trình từ ${c.submittedAt}, chưa được quyết định`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, payment_cert_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, payment_cert_id) WHERE payment_cert_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const pendingCertIds = pendingCertsList.map((c) => c.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'cert_pending' AND is_read = 0 AND payment_cert_id <> ALL(?)`,
      user.id,
      pendingCertIds,
    );
  }

  // Công văn/RFI quá hạn phản hồi chưa 'replied'/'closed' → nhắc Admin/PM (M10).
  if (isAdminOrPm(user.role)) {
    const dueList = await dueCorrespondences(projectId ?? undefined);
    if (dueList.length > 0) {
      const values = dueList.map(() => `(?, ?, 'correspondence_due', ?)`).join(", ");
      const params = dueList.flatMap((c) => [
        user.id,
        c.id,
        `📨 Công văn ${c.code} (${c.counterparty}) — ${c.subject} đã quá hạn phản hồi (${c.dueDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, correspondence_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, correspondence_id) WHERE correspondence_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const dueIds = dueList.map((c) => c.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'correspondence_due' AND is_read = 0 AND correspondence_id <> ALL(?)`,
      user.id,
      dueIds,
    );
  }

  // Phát sinh/VO đã trình quá hạn chưa được quyết định → nhắc Admin/PM (M6).
  if (isAdminOrPm(user.role)) {
    const pending = await pendingVariations(VO_PENDING_DAYS, projectId ?? undefined);
    if (pending.length > 0) {
      const values = pending.map(() => `(?, ?, 'vo_pending', ?)`).join(", ");
      const params = pending.flatMap((v) => [
        user.id,
        v.id,
        `📝 Phát sinh ${v.code} — ${v.title} đã trình từ ${v.submittedAt}, chưa được quyết định`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, vo_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, vo_id) WHERE vo_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const pendingIds = pending.map((v) => v.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'vo_pending' AND is_read = 0 AND vo_id <> ALL(?)`,
      user.id,
      pendingIds,
    );
  }

  // Đề xuất đã trình quá hạn chưa được quyết định → nhắc Admin/PM (M19).
  if (isAdminOrPm(user.role)) {
    const pendingProposals = await pendingProposalsOver(
      PROPOSAL_PENDING_DAYS,
      projectId ?? undefined,
    );
    if (pendingProposals.length > 0) {
      const values = pendingProposals.map(() => `(?, ?, 'proposal_pending', ?)`).join(", ");
      const params = pendingProposals.flatMap((p) => [
        user.id,
        p.id,
        `🖋 Đề xuất ${p.code} — ${p.title} đã trình từ ${p.submittedAt}, chưa được quyết định`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, proposal_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, proposal_id) WHERE proposal_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const pendingProposalIds = pendingProposals.map((p) => p.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'proposal_pending' AND is_read = 0 AND proposal_id <> ALL(?)`,
      user.id,
      pendingProposalIds,
    );
  }

  // NCR quá hạn chưa đóng → cảnh báo người được gán; Admin/PM thấy mọi NCR quá hạn (quản lý chung).
  // ncrs có project_id trực tiếp (M22+) — lọc theo dự án đang chọn.
  {
    const isPrivileged = user.role === "admin" || user.role === "pm";
    const assignedFilter =
      (isPrivileged ? "" : " AND n.assigned_to = ?") +
      (projectId != null ? " AND n.project_id = ?" : "");
    const ncrParams = [
      today,
      ...(isPrivileged ? [] : [user.id]),
      ...(projectId != null ? [projectId] : []),
    ];
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
    const latePos = await poLateList(projectId ?? undefined);
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
    const lateVehicles = await vehicleLateList(projectId ?? undefined);
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
    const missingDates = await missingDiaryDates(7, projectId ?? undefined);
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

  // Tầng chưa bàn giao mặt bằng mà task sắp/đã tới ngày bắt đầu → cảnh báo Admin/PM (M14).
  if (isAdminOrPm(user.role)) {
    const missingFronts = await frontMissingList(projectId ?? undefined);
    if (missingFronts.length > 0) {
      const values = missingFronts.map(() => `(?, ?, 'front_missing', ?)`).join(", ");
      const params = missingFronts.flatMap((f) => [
        user.id,
        f.workFrontId,
        `🚧 [${f.sheetCode}] Tầng ${f.floorLabel} chưa bàn giao mặt bằng — chờ ${f.waitingDays} ngày`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, work_front_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, work_front_id, type) WHERE work_front_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const missingFrontIds = missingFronts.map((f) => f.workFrontId);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'front_missing' AND is_read = 0 AND work_front_id <> ALL(?)`,
      user.id,
      missingFrontIds,
    );
  }

  // Thiết bị sắp/đã hết hạn kiểm định/hiệu chuẩn → cảnh báo Admin/PM (M12).
  if (isAdminOrPm(user.role)) {
    const dueEquipment = await calibrationDueList(CALIBRATION_WARN_DAYS, projectId ?? undefined);
    if (dueEquipment.length > 0) {
      const values = dueEquipment.map(() => `(?, ?, 'calibration_due', ?)`).join(", ");
      const params = dueEquipment.flatMap((e) => [
        user.id,
        e.id,
        `🔧 Thiết bị ${e.code} — ${e.name} ${e.expired ? "đã quá hạn" : "sắp hết hạn"} kiểm định (${e.calibrationDue})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, equipment_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, equipment_id, type) WHERE equipment_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const dueEquipmentIds = dueEquipment.map((e) => e.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'calibration_due' AND is_read = 0 AND equipment_id <> ALL(?)`,
      user.id,
      dueEquipmentIds,
    );
  }

  // Vật tư/nhân công/máy vượt định mức theo hạng mục BOQ → cảnh báo Admin/PM/kỹ sư (M18).
  if (user.role === "admin" || user.role === "pm" || user.role === "engineer") {
    const overNorms = await overNormItems(NORM_OVER_THRESHOLD_PCT, projectId ?? undefined);
    if (overNorms.length > 0) {
      const values = overNorms.map(() => `(?, ?, 'norm_over', ?)`).join(", ");
      const params = overNorms.flatMap((n) => [
        user.id,
        n.normId,
        `📐 [${n.boqCode}] ${n.resourceLabel} vượt định mức ${Math.round(n.variancePct)}% (${n.actual}/${n.expected} ${n.unitLabel})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, boq_norm_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, boq_norm_id) WHERE boq_norm_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const overNormIds = overNorms.map((n) => n.normId);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'norm_over' AND is_read = 0 AND boq_norm_id <> ALL(?)`,
      user.id,
      overNormIds,
    );
  }

  // HSE: action khắc phục quá hạn → nhắc assignee + Admin/PM (M11).
  {
    const isPrivileged = user.role === "admin" || user.role === "pm";
    const overdueHse = await openHseActions(
      isPrivileged ? undefined : user.id,
      projectId ?? undefined,
    );
    if (overdueHse.length > 0) {
      const values = overdueHse.map(() => `(?, ?, 'hse_action_due', ?)`).join(", ");
      const params = overdueHse.flatMap((h) => [
        user.id,
        h.id,
        `🦺 Hành động khắc phục HSE "${h.description}" quá hạn (${h.actionDue})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, hse_record_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, hse_record_id, type) WHERE hse_record_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const overdueHseIds = overdueHse.map((h) => h.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'hse_action_due' AND is_read = 0 AND hse_record_id <> ALL(?)`,
      user.id,
      overdueHseIds,
    );
  }

  // Việc sau họp quá hạn chưa xong → nhắc assignee + Admin/PM (M13).
  {
    const isPrivileged = user.role === "admin" || user.role === "pm";
    const overdueActions = await overdueMeetingActions(
      isPrivileged ? undefined : user.id,
      projectId ?? undefined,
    );
    if (overdueActions.length > 0) {
      const values = overdueActions.map(() => `(?, ?, 'action_overdue', ?)`).join(", ");
      const params = overdueActions.flatMap((a) => [
        user.id,
        a.id,
        `📋 Việc sau họp "${a.content}" (${a.meetingTitle}) đã quá hạn ${a.dueDate}`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, meeting_action_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, meeting_action_id, type) WHERE meeting_action_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const overdueActionIds = overdueActions.map((a) => a.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'action_overdue' AND is_read = 0 AND meeting_action_id <> ALL(?)`,
      user.id,
      overdueActionIds,
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
