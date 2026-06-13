import { query, queryOne, run, todayISO } from "@/lib/db";
import { sendPushToUsers } from "@/lib/push";

// ===== Phân công theo hệ (sheet) với kế thừa tự động =====
//
// Quy tắc:
// - sheet_types.manager_id      : người quản lý cả hệ.
// - work_packages.assigned_to   : người phụ trách nhóm; assigned_manual = FALSE nghĩa là
//                                 đang kế thừa từ quản lý hệ (đổi quản lý hệ sẽ ghi đè).
// - tasks.assigned_to           : người làm task; assigned_manual = FALSE = kế thừa từ nhóm.
// - Gán thủ công (manual) ở cấp nào thì cấp đó "thoát" khỏi chuỗi kế thừa cho đến khi
//   được đưa về kế thừa (userId = null ở API phân công).
// Mọi cascade đều cập nhật tasks.updated_at để watermark sheetVersion đổi → client refresh.

// --- Helpers nội bộ ---

async function logAssignment(
  level: string, targetId: number, targetLabel: string,
  prevUserId: number | null, newUserId: number | null,
  changedBy: number, isManual: boolean,
): Promise<void> {
  if (prevUserId === newUserId) return;
  await run(
    `INSERT INTO assignment_log (level, target_id, target_label, prev_user_id, new_user_id, changed_by, is_manual)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    level, targetId, targetLabel, prevUserId, newUserId, changedBy, isManual);
}

async function notifyAssigned(userIds: number[], message: string, url?: string): Promise<void> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) return;
  for (const uid of uniqueIds) {
    // UNIQUE(user_id, task_id, type) không bắt trùng khi task_id NULL (Postgres coi
    // NULL khác nhau) → tự dedup: bỏ qua nếu đã có thông báo 'assigned' chưa đọc cùng nội dung.
    await run(
      `INSERT INTO notifications (user_id, task_id, type, message)
       SELECT ?, NULL, 'assigned', ?
        WHERE NOT EXISTS (SELECT 1 FROM notifications
                           WHERE user_id = ? AND type = 'assigned' AND message = ? AND is_read = 0)`,
      uid, message, uid, message);
  }
  await sendPushToUsers(uniqueIds, { title: "Phân công mới", body: message, url });
}

// Gán quản lý cả hệ; cascade xuống nhóm + task chưa gán thủ công.
export async function assignSheetManager(
  sheetId: number, userId: number | null, changedBy: number,
): Promise<void> {
  const prev = await queryOne<{ manager_id: number | null; code: string; slug: string | null }>(
    `SELECT manager_id, code, slug FROM sheet_types WHERE id = ?`, sheetId);
  await run(`UPDATE sheet_types SET manager_id = ? WHERE id = ?`, userId, sheetId);
  await logAssignment("sheet", sheetId, prev?.code ?? `sheet#${sheetId}`, prev?.manager_id ?? null, userId, changedBy, userId !== null);

  // Đếm nhóm + task sẽ bị ảnh hưởng trước khi cascade.
  const affected = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
      WHERE wp.sheet_type_id = ? AND wp.assigned_manual = FALSE AND t.assigned_manual = FALSE`,
    sheetId);
  const count = Number(affected?.n ?? 0);

  await run(
    `UPDATE work_packages SET assigned_to = ?
      WHERE sheet_type_id = ? AND assigned_manual = FALSE`, userId, sheetId);
  await run(
    `UPDATE tasks SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP
      FROM work_packages wp
     WHERE tasks.package_id = wp.id AND wp.sheet_type_id = ?
       AND wp.assigned_manual = FALSE AND tasks.assigned_manual = FALSE`, userId, sheetId);

  if (userId) {
    const msg = count > 0
      ? `Bạn được giao quản lý hệ ${prev?.code ?? ""}${count > 0 ? ` (${count} task kế thừa)` : ""}`
      : `Bạn được giao quản lý hệ ${prev?.code ?? ""}`;
    await notifyAssigned([userId], msg, prev?.slug ? `/tracking/${prev.slug}` : "/");
  }
}

// Gán người phụ trách nhóm (thủ công); cascade xuống task chưa gán thủ công.
// userId = null → đưa nhóm về kế thừa từ quản lý hệ.
export async function assignPackage(
  packageId: number, userId: number | null, changedBy: number,
): Promise<void> {
  const prev = await queryOne<{ assigned_to: number | null; code: string; name: string; sheet_slug: string | null }>(
    `SELECT wp.assigned_to, wp.code, wp.name, st.slug AS sheet_slug
       FROM work_packages wp JOIN sheet_types st ON wp.sheet_type_id = st.id WHERE wp.id = ?`, packageId);

  let effective = userId;
  if (userId === null) {
    const r = await queryOne<{ manager_id: number | null }>(
      `SELECT st.manager_id FROM work_packages wp
        JOIN sheet_types st ON wp.sheet_type_id = st.id WHERE wp.id = ?`, packageId);
    effective = r?.manager_id ?? null;
  }
  await run(
    `UPDATE work_packages SET assigned_to = ?, assigned_manual = ? WHERE id = ?`,
    effective, userId !== null, packageId);
  await run(
    `UPDATE tasks SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP
      WHERE package_id = ? AND assigned_manual = FALSE`, effective, packageId);

  await logAssignment("package", packageId, prev?.code ?? `pkg#${packageId}`, prev?.assigned_to ?? null, effective, changedBy, userId !== null);

  if (effective) {
    const taskCount = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tasks WHERE package_id = ? AND assigned_manual = FALSE`, packageId);
    const n = Number(taskCount?.n ?? 0);
    await notifyAssigned(
      [effective],
      `Bạn được giao nhóm "${prev?.name ?? prev?.code}" (${n} task kế thừa)`,
      prev?.sheet_slug ? `/tracking/${prev.sheet_slug}` : "/",
    );
  }
}

// Gán người làm task (thủ công). userId = null → về kế thừa từ nhóm.
export async function assignTask(
  taskId: number, userId: number | null, changedBy: number,
): Promise<void> {
  const prev = await queryOne<{ assigned_to: number | null; code: string; name: string; sheet_slug: string | null }>(
    `SELECT t.assigned_to, t.code, t.name, st.slug AS sheet_slug
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.id = ?`, taskId);

  let effective = userId;
  if (userId === null) {
    const r = await queryOne<{ assigned_to: number | null }>(
      `SELECT wp.assigned_to FROM tasks t
        JOIN work_packages wp ON t.package_id = wp.id WHERE t.id = ?`, taskId);
    effective = r?.assigned_to ?? null;
  }
  await run(
    `UPDATE tasks SET assigned_to = ?, assigned_manual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    effective, userId !== null, taskId);

  await logAssignment("task", taskId, prev?.code ?? `task#${taskId}`, prev?.assigned_to ?? null, effective, changedBy, userId !== null);

  if (effective) {
    await notifyAssigned(
      [effective],
      `Bạn được giao task "${prev?.name ?? prev?.code}"`,
      prev?.sheet_slug ? `/tracking/${prev.sheet_slug}` : "/",
    );
  }
}

// Người được kế thừa cho task mới tạo trong 1 nhóm.
export async function inheritedAssigneeFor(packageId: number): Promise<number | null> {
  const r = await queryOne<{ assigned_to: number | null }>(
    `SELECT assigned_to FROM work_packages WHERE id = ?`, packageId);
  return r?.assigned_to ?? null;
}

// Thống kê khối lượng cho mỗi user (dùng cho dropdown workload).
export async function userWorkloads(): Promise<Map<number, { total: number; delayed: number }>> {
  const rows = await query<{ userId: number; total: number; delayed: number }>(
    `SELECT t.assigned_to AS "userId",
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE t.end_date IS NOT NULL AND t.end_date < ?
                                    AND t.progress_percent < 1
                                    AND t.status NOT IN ('hoan_thanh','nghiem_thu')) AS delayed
       FROM tasks t
      WHERE t.assigned_to IS NOT NULL
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      GROUP BY t.assigned_to`, todayISO());
  const m = new Map<number, { total: number; delayed: number }>();
  for (const r of rows) m.set(Number(r.userId), { total: Number(r.total), delayed: Number(r.delayed) });
  return m;
}
