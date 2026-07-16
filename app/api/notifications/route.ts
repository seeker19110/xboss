import { NextResponse } from "next/server";
import { query, queryOne, run, todayISO, daysFromTodayISO } from "@/lib/db";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/auth";
import { costSummary, getCostSettings } from "@/lib/cost";
import { poLateList, vehicleLateList } from "@/lib/procurement";
import { missingDiaryDates } from "@/lib/diary";
import { expiringContracts } from "@/lib/contracts";
import { pendingVariations } from "@/lib/vo";
import { overContractCerts, pendingCerts } from "@/lib/paymentcerts";
import { dueCorrespondences } from "@/lib/correspondence";
import { stageMissingList } from "@/lib/constructionStages";
import { calibrationDueList } from "@/lib/equipment";
import { overNormItems, NORM_OVER_THRESHOLD_PCT } from "@/lib/norms";
import { openHseActions } from "@/lib/hse";
import { overdueMeetingActions } from "@/lib/meetings";
import { formatDateTimeVN } from "@/lib/date";
import { pendingProposalsOver } from "@/lib/proposals";
import { expiringLegalDocs } from "@/lib/kickoff";
import { expiringCertifications } from "@/lib/hr";
import { expiringInsuranceBonds } from "@/lib/insurance";
import { expiringEnvPermits, exceededMonitoring } from "@/lib/environment";
import { alarmingPoints } from "@/lib/monitoring";
import { overduePunch } from "@/lib/handover";
import { expiringWarranties, overdueClaims } from "@/lib/warranty";
import { advanceOverdueList, ADVANCE_OVERDUE_DAYS } from "@/lib/finance";
import { getCurrentProjectId } from "@/lib/projects";
import { EXPIRY_WARN_DAYS } from "@/lib/contracts";
import { CERT_PENDING_DAYS } from "@/lib/paymentcerts";
import { VO_PENDING_DAYS } from "@/lib/vo";
import { CALIBRATION_WARN_DAYS } from "@/lib/equipment";
import { PROPOSAL_PENDING_DAYS } from "@/lib/proposals";
import { pendingDesignChanges } from "@/lib/designchanges";
import { pendingClaims } from "@/lib/claims";
import { getAlertThreshold } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// GET /api/notifications?limit=<n>
// Đồng bộ task trễ → notifications cho user hiện tại, rồi trả về danh sách + số chưa đọc.
// `limit` mặc định 50 (đủ cho dropdown chuông); trang `/notifications/all` truyền limit lớn
// hơn để không bị cắt bớt trong lúc lọc/tìm kiếm/phân trang phía client.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const limitParam = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 50;

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

  // Sắp đến hạn: deadline còn ≤N ngày mà tiến độ < ngưỡng → cảnh báo sớm trước khi
  // thành trễ. Ngưỡng đọc từ alert_rules (M47 PR4, lib/alerts.ts); không có rule →
  // default cũ y hệt (3 ngày / 70%).
  const dueSoonDays = await getAlertThreshold("due_soon_days", projectId);
  const dueSoonProgress = await getAlertThreshold("due_soon_progress", projectId);
  const soon = daysFromTodayISO(dueSoonDays);
  const DUE_SOON_COND = `t.end_date IS NOT NULL AND t.end_date >= ? AND t.end_date <= ?
        AND t.progress_percent < ? AND t.status NOT IN ('hoan_thanh','nghiem_thu')`;
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
    ...(isSubcon ? [today, soon, dueSoonProgress, user.id] : [today, soon, dueSoonProgress]),
    ...projectParam,
  );

  if (dueSoon.length > 0) {
    const values = dueSoon.map(() => `(?, ?, 'due_soon', ?)`).join(", ");
    const params = dueSoon.flatMap((t) => [
      user.id,
      t.id,
      `⏳ [${t.sheetType}] ${t.code} — ${t.name} sắp đến hạn ${t.endDate} (tiến độ < ${Math.round(dueSoonProgress * 100)}%)`,
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
    ...(isSubcon
      ? [user.id, today, soon, dueSoonProgress, user.id]
      : [user.id, today, soon, dueSoonProgress]),
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
    // Ngưỡng vượt định mức đọc từ alert_rules (M47 PR4); default 0% → hệt điều kiện cũ
    // `qty_used > qty_planned` (không đổi hành vi mặc định).
    const materialOverPct = await getAlertThreshold("material_over_pct", projectId);
    // ?::numeric bắt buộc — nếu không Postgres suy luận kiểu tham số là integer (vì vế
    // phải "100" là literal integer) và làm TRÒN NGUYÊN phép chia (vd 20/100 = 0), khiến
    // ngưỡng % vô hiệu (đã phát hiện qua tests/alerts.test.ts khi verify bất biến PR4).
    const materialOverCond =
      "m.qty_planned > 0 AND m.qty_used > m.qty_planned * (1 + ?::numeric / 100)";
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
        WHERE ${materialOverCond}${matProjectFilter}`,
      materialOverPct,
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
            SELECT id FROM materials m WHERE ${materialOverCond}${matProjectFilter})`,
      user.id,
      materialOverPct,
      ...projectParam,
    );
  }

  // Vượt ngân sách theo hệ → cảnh báo Admin/PM/BCH (subcon/cdt/viewer/engineer không xem chi phí).
  if (CAN.viewPayments(user.role)) {
    const settings = await getCostSettings();
    const rows = await costSummary("system", true, projectId ?? undefined);
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

    // Bảo hiểm/bảo lãnh sắp/đã hết hiệu lực mà chưa đổi trạng thái → cảnh báo (M28).
    const expiringInsurance = await expiringInsuranceBonds();
    if (expiringInsurance.length > 0) {
      const values = expiringInsurance.map(() => `(?, ?, 'insurance_expiry', ?)`).join(", ");
      const params = expiringInsurance.flatMap((b) => [
        user.id,
        b.id,
        b.expired
          ? `🛡 Bảo hiểm/bảo lãnh ${b.code ?? b.title} — ${b.title} đã quá hạn hiệu lực (${b.expiryDate})`
          : `🛡 Bảo hiểm/bảo lãnh ${b.code ?? b.title} — ${b.title} sắp hết hiệu lực (${b.expiryDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, insurance_bond_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, insurance_bond_id) WHERE insurance_bond_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const expiringInsuranceIds = expiringInsurance.map((b) => b.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'insurance_expiry' AND is_read = 0 AND insurance_bond_id <> ALL(?)`,
      user.id,
      expiringInsuranceIds,
    );
  }

  // Hồ sơ pháp lý (giấy phép XD, phê duyệt QH/TK, HĐ chính...) sắp/đã hết hạn mà chưa
  // đổi trạng thái → cảnh báo Admin/PM (M23).
  if (isAdminOrPm(user.role)) {
    const expiringLegal = await expiringLegalDocs();
    if (expiringLegal.length > 0) {
      const values = expiringLegal.map(() => `(?, ?, 'legal_expiry', ?)`).join(", ");
      const params = expiringLegal.flatMap((d) => [
        user.id,
        d.id,
        d.expired
          ? `📜 Hồ sơ pháp lý ${d.code ?? d.title} — ${d.title} đã quá hạn (${d.expiryDate})`
          : `📜 Hồ sơ pháp lý ${d.code ?? d.title} — ${d.title} sắp hết hạn (${d.expiryDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, legal_document_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, legal_document_id) WHERE legal_document_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const expiringLegalIds = expiringLegal.map((d) => d.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'legal_expiry' AND is_read = 0 AND legal_document_id <> ALL(?)`,
      user.id,
      expiringLegalIds,
    );
  }

  // Chứng chỉ nhân sự (thẻ an toàn, chứng chỉ nghề, vận hành...) sắp/đã hết hạn →
  // cảnh báo Admin/PM (M24, tái dùng cho HSE huấn luyện/thẻ an toàn).
  if (isAdminOrPm(user.role)) {
    const expiringCerts = await expiringCertifications();
    if (expiringCerts.length > 0) {
      const values = expiringCerts.map(() => `(?, ?, 'cert_expiry', ?)`).join(", ");
      const params = expiringCerts.flatMap((c) => [
        user.id,
        c.id,
        c.expired
          ? `🪪 Chứng chỉ ${c.kind}${c.personnelName ? ` — ${c.personnelName}` : ""} đã quá hạn (${c.expiryDate})`
          : `🪪 Chứng chỉ ${c.kind}${c.personnelName ? ` — ${c.personnelName}` : ""} sắp hết hạn (${c.expiryDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, certification_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, certification_id) WHERE certification_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const expiringCertIds = expiringCerts.map((c) => c.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'cert_expiry' AND is_read = 0 AND certification_id <> ALL(?)`,
      user.id,
      expiringCertIds,
    );
  }

  // Mốc quan trắc (lún/chuyển vị/nghiêng) có kỳ đo gần nhất vượt ngưỡng báo động →
  // cảnh báo Admin/PM/kỹ sư (M26). Tự dọn khi kỳ đo mới về normal/warn.
  if (user.role === "admin" || user.role === "pm" || user.role === "engineer") {
    const alarming = await alarmingPoints();
    if (alarming.length > 0) {
      const values = alarming.map(() => `(?, ?, 'monitoring_alarm', ?)`).join(", ");
      const params = alarming.flatMap((p) => [
        user.id,
        p.id,
        `🚨 Mốc quan trắc ${p.code} vượt ngưỡng báo động ngày ${p.measuredAt} (${p.cumulative ?? p.value})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, monitoring_point_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, monitoring_point_id) WHERE monitoring_point_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const alarmingIds = alarming.map((p) => p.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'monitoring_alarm' AND is_read = 0 AND monitoring_point_id <> ALL(?)`,
      user.id,
      alarmingIds,
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

  // Thay đổi thiết kế đã trình quá hạn chưa được quyết định → nhắc Admin/PM (M32).
  if (isAdminOrPm(user.role)) {
    const projectId = await getCurrentProjectId(user);
    const pendingDc = await pendingDesignChanges(undefined, projectId);
    if (pendingDc.length > 0) {
      const values = pendingDc.map(() => `(?, ?, 'design_change_pending', ?)`).join(", ");
      const params = pendingDc.flatMap((dc) => [
        user.id,
        dc.id,
        `📐 Thay đổi thiết kế ${dc.code} — ${dc.title} đã trình từ ${dc.createdAt}, chưa được quyết định`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, design_change_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, design_change_id) WHERE design_change_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const pendingDcIds = pendingDc.map((dc) => dc.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'design_change_pending' AND is_read = 0
          AND design_change_id <> ALL(?)`,
      user.id,
      pendingDcIds,
    );
  }

  // Claim chi phí/EOT đang mở quá hạn xử lý → nhắc Admin/PM (M34, mirror vo_pending).
  if (isAdminOrPm(user.role)) {
    const projectId = await getCurrentProjectId(user);
    const pendingClaimsList = await pendingClaims(undefined, projectId);
    if (pendingClaimsList.length > 0) {
      const values = pendingClaimsList.map(() => `(?, ?, 'claim_pending', ?)`).join(", ");
      const params = pendingClaimsList.flatMap((c) => [
        user.id,
        c.id,
        `⚖️ Claim ${c.code} — ${c.title} đã thông báo từ ${c.noticeDate}, chưa xử lý xong`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, claim_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, claim_id) WHERE claim_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const pendingClaimIds = pendingClaimsList.map((c) => c.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'claim_pending' AND is_read = 0 AND claim_id <> ALL(?)`,
      user.id,
      pendingClaimIds,
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

  // Punch list quá hạn xử lý chưa đóng → cảnh báo người được gán; Admin/PM thấy mọi punch
  // quá hạn (quản lý chung bàn giao, M29). Mirror ncr_overdue — "quá hạn xử lý" chứ
  // không phải "sắp hết hạn giấy tờ" như legal_expiry/contract_expiry.
  {
    const isPrivileged = user.role === "admin" || user.role === "pm";
    const overduePunches = await overduePunch(isPrivileged ? undefined : user.id);
    if (overduePunches.length > 0) {
      const values = overduePunches.map(() => `(?, ?, 'punch_overdue', ?)`).join(", ");
      const params = overduePunches.flatMap((p) => [
        user.id,
        p.id,
        `🔧 Tồn tại "${p.description}" quá hạn xử lý (${p.dueDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, punch_item_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, punch_item_id) WHERE punch_item_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const overduePunchIds = overduePunches.map((p) => p.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'punch_overdue' AND is_read = 0 AND punch_item_id <> ALL(?)`,
      user.id,
      overduePunchIds,
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
        `🚛 Xe ${v.plate}${v.supplierName ? ` (${v.supplierName})` : ""} quá giờ dự kiến ${formatDateTimeVN(v.expectedAt)} chưa vào cổng`,
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

  // Tầng chưa sẵn sàng mặt bằng (công tác cuối chưa bàn giao) mà task sắp/đã tới ngày bắt
  // đầu → cảnh báo Admin/PM (M14 bản mới, tầng×công tác — thay cho front_missing cũ theo
  // sheet, đã ngừng nuôi vì trang /work-fronts không còn ghi vào model cũ).
  if (isAdminOrPm(user.role)) {
    const missingStages = await stageMissingList(projectId ?? undefined);
    if (missingStages.length > 0) {
      const values = missingStages.map(() => `(?, ?, 'stage_missing', ?)`).join(", ");
      const params = missingStages.flatMap((f) => [
        user.id,
        f.floorStageFrontId,
        `🚧 Tầng ${f.floorLabel} chưa hoàn tất mặt bằng (${f.stageName}) — chờ ${f.waitingDays} ngày`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, floor_stage_front_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, floor_stage_front_id, type) WHERE floor_stage_front_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const missingStageIds = missingStages.map((f) => f.floorStageFrontId);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'stage_missing' AND is_read = 0 AND floor_stage_front_id <> ALL(?)`,
      user.id,
      missingStageIds,
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

  // Giấy phép môi trường (ĐTM, giấy phép MT, giấy phép xả thải) sắp/đã hết hạn mà chưa
  // đổi trạng thái → cảnh báo Admin/PM/kỹ sư (M25).
  if (CAN.manageEnv(user.role)) {
    const expiringEnv = await expiringEnvPermits();
    if (expiringEnv.length > 0) {
      const values = expiringEnv.map(() => `(?, ?, 'env_permit_expiry', ?)`).join(", ");
      const params = expiringEnv.flatMap((d) => [
        user.id,
        d.id,
        d.expired
          ? `🌱 Hồ sơ môi trường ${d.code ?? d.title} — ${d.title} đã quá hạn (${d.expiryDate})`
          : `🌱 Hồ sơ môi trường ${d.code ?? d.title} — ${d.title} sắp hết hạn (${d.expiryDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, env_permit_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, env_permit_id) WHERE env_permit_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const expiringEnvIds = expiringEnv.map((d) => d.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'env_permit_expiry' AND is_read = 0 AND env_permit_id <> ALL(?)`,
      user.id,
      expiringEnvIds,
    );

    // Chỉ tiêu quan trắc vượt ngưỡng ở kỳ gần nhất (mỗi tổ hợp category/indicator/location)
    // → cảnh báo Admin/PM/kỹ sư (M25).
    const exceeded = await exceededMonitoring();
    if (exceeded.length > 0) {
      const values = exceeded.map(() => `(?, ?, 'env_monitoring_over', ?)`).join(", ");
      const params = exceeded.flatMap((m) => [
        user.id,
        m.id,
        `⚠ Quan trắc ${m.indicator}${m.location ? ` (${m.location})` : ""} vượt ngưỡng: ${m.value ?? "—"}/${m.threshold ?? "—"}${m.unit ? ` ${m.unit}` : ""} (${m.measuredAt})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, env_monitoring_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, env_monitoring_id) WHERE env_monitoring_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const exceededIds = exceeded.map((m) => m.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'env_monitoring_over' AND is_read = 0 AND env_monitoring_id <> ALL(?)`,
      user.id,
      exceededIds,
    );
  }

  // Bảo hành sắp/đã hết hạn (warranty_from + warranty_months) mà chưa đổi trạng thái →
  // cảnh báo Admin/PM/kỹ sư (M30). Scope theo project_id đang chọn (M22 PR3 đã lọc mọi
  // notification khác theo dự án — module mới phải nhất quán ngay từ đầu).
  if (CAN.manageWarranty(user.role)) {
    const expiringWarranty = await expiringWarranties(30, projectId ?? undefined);
    if (expiringWarranty.length > 0) {
      const values = expiringWarranty.map(() => `(?, ?, 'warranty_expiry', ?)`).join(", ");
      const params = expiringWarranty.flatMap((w) => [
        user.id,
        w.id,
        w.expired
          ? `🛠 Bảo hành "${w.title}" đã quá hạn (${w.expiry})`
          : `🛠 Bảo hành "${w.title}" sắp hết hạn (${w.expiry})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, warranty_item_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, warranty_item_id) WHERE warranty_item_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const expiringWarrantyIds = expiringWarranty.map((w) => w.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'warranty_expiry' AND is_read = 0 AND warranty_item_id <> ALL(?)`,
      user.id,
      expiringWarrantyIds,
    );

    // Claim lỗi sau bàn giao quá hạn xử lý chưa đóng → cảnh báo người được gán; Admin/PM
    // thấy mọi claim quá hạn (mirror overduePunch/overdueMeetingActions — "quá hạn xử lý"
    // chứ không phải "sắp hết hạn giấy tờ" như warranty_expiry).
    const isPrivilegedWarranty = user.role === "admin" || user.role === "pm";
    const overdueWarrantyClaims = await overdueClaims(
      isPrivilegedWarranty ? undefined : user.id,
      projectId ?? undefined,
    );
    if (overdueWarrantyClaims.length > 0) {
      const values = overdueWarrantyClaims
        .map(() => `(?, ?, 'warranty_claim_overdue', ?)`)
        .join(", ");
      const params = overdueWarrantyClaims.flatMap((c) => [
        user.id,
        c.id,
        `🛠 Claim bảo hành "${c.description}" quá hạn xử lý (${c.dueDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, warranty_claim_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, warranty_claim_id) WHERE warranty_claim_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const overdueWarrantyClaimIds = overdueWarrantyClaims.map((c) => c.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'warranty_claim_overdue' AND is_read = 0 AND warranty_claim_id <> ALL(?)`,
      user.id,
      overdueWarrantyClaimIds,
    );
  }

  // Tạm ứng quá hạn hoàn ứng (advance_date quá ADVANCE_OVERDUE_DAYS ngày mà vẫn chưa
  // 'settled') → cảnh báo Admin/PM (M27, nhạy cảm tiền = manageFinance).
  if (CAN.manageFinance(user.role)) {
    const overdueAdvances = await advanceOverdueList(ADVANCE_OVERDUE_DAYS, projectId ?? undefined);
    if (overdueAdvances.length > 0) {
      const values = overdueAdvances.map(() => `(?, ?, 'advance_overdue', ?)`).join(", ");
      const params = overdueAdvances.flatMap((a) => [
        user.id,
        a.id,
        `💸 Tạm ứng ${a.code ?? `#${a.id}`}${a.recipient ? ` — ${a.recipient}` : ""} quá hạn hoàn ứng (tạm ứng ${a.advanceDate})`,
      ]);
      await run(
        `INSERT INTO notifications (user_id, advance_id, type, message) VALUES ${values}
         ON CONFLICT (user_id, type, advance_id) WHERE advance_id IS NOT NULL DO NOTHING`,
        ...params,
      );
    }
    const overdueAdvanceIds = overdueAdvances.map((a) => a.id);
    await run(
      `DELETE FROM notifications
        WHERE user_id = ? AND type = 'advance_overdue' AND is_read = 0 AND advance_id <> ALL(?)`,
      user.id,
      overdueAdvanceIds,
    );
  }

  // JOIN thêm sheet slug + tầng của task liên quan (khi có task_id) để chuông thông báo/
  // trang thông báo dựng được link click-through đúng `/tracking/<slug>?floor=<floorLabel>`
  // (cùng pattern GlobalSearch). LEFT JOIN vì phần lớn loại thông báo không gắn với task
  // (contract_id, ncr_id, ...) — sheetSlug/floorLabel sẽ là null, client tự bỏ qua link.
  const items = await query<{
    id: number;
    taskId: number | null;
    type: string;
    message: string;
    isRead: number;
    createdAt: string;
    sheetSlug: string | null;
    floorLabel: string | null;
  }>(
    `SELECT n.id, n.task_id AS "taskId", n.type, n.message, n.is_read AS "isRead",
            n.created_at AS "createdAt", st.slug AS "sheetSlug", wp.floor_label AS "floorLabel"
       FROM notifications n
       LEFT JOIN tasks t ON t.id = n.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
       LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
      WHERE n.user_id = ?
      ORDER BY n.is_read ASC, n.created_at DESC, n.id DESC LIMIT ?`,
    user.id,
    limit,
  );

  // Đếm riêng tổng số chưa đọc (không giới hạn LIMIT 50 của `items`) — nếu đếm trên chính
  // `items` thì badge sẽ bị "kẹt cứng" ở tối đa 50 khi user có >50 thông báo chưa đọc (đã
  // gặp thật khi verify tay M40: 388 chưa đọc nhưng badge chỉ hiện 50).
  const unread = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = ? AND is_read = 0`,
    user.id,
  );
  return NextResponse.json({ notifications: items, unread: unread?.count ?? 0 });
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
