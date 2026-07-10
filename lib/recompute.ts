import { query, queryOne, run, todayISO, withTransaction } from "@/lib/db";
import type { StatusSlug } from "@/lib/status";

export function deriveStatus(
  progress: number,
  endDate: string | null,
  current?: string | null,
): StatusSlug {
  if (current === "nghiem_thu") return "nghiem_thu";
  if (progress >= 1) return "hoan_thanh";
  if (endDate && endDate < todayISO()) return "tre";
  if (progress > 0) return "dang_thi_cong";
  return "chuan_bi";
}

// Tính lại % của task từ dimensions (nếu có), cập nhật task + work package cha.
// changedBy: tên người thao tác — nếu % thay đổi sẽ ghi vào task_history.
export async function recomputeTask(
  taskId: number,
  changedBy?: string,
): Promise<{ progress: number; status: StatusSlug } | null> {
  // FOR UPDATE: khi hàm này chạy trong withTransaction (mọi route gọi recomputeTask đều
  // nên bọc như vậy), khoá row task tới hết transaction — 2 recompute đồng thời trên
  // cùng task sẽ serialize thay vì cùng đọc 1 snapshot rồi ghi đè lẫn nhau (lost update).
  const task = await queryOne<{
    id: number;
    package_id: number;
    end_date: string | null;
    status: string | null;
    progress_percent: number | null;
  }>(
    `SELECT id, package_id, end_date, status, progress_percent FROM tasks WHERE id = ? FOR UPDATE`,
    taskId,
  );
  if (!task) return null;

  const dimCount = await queryOne<{ checked: number; total: number }>(
    `SELECT COUNT(*) FILTER (WHERE installed = 1) AS checked, COUNT(*) AS total
       FROM progress_dimensions WHERE task_id = ?`,
    taskId,
  );
  let progress = task.progress_percent ?? 0;
  if (dimCount && dimCount.total > 0) {
    // Chỉ = 1 (100%, "hoàn thành") khi TẤT CẢ ô đã tick — làm tròn 2 chữ số bình
    // thường sẽ đưa 199/200 = 0.995 lên đúng 1.00 (Math.round nửa làm tròn lên),
    // báo "hoàn thành" sai trong khi còn 1 ô chưa tick (mở khoá nghiệm thu sai —
    // approve/route.ts chỉ chặn progress < 1). Ghim trần 0.99 cho mọi ca chưa đủ.
    progress =
      dimCount.checked === dimCount.total
        ? 1
        : Math.min(0.99, Math.round((dimCount.checked / dimCount.total) * 100) / 100);
  }
  const status = deriveStatus(progress, task.end_date, task.status);
  await run(
    `UPDATE tasks SET progress_percent = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    progress,
    status,
    taskId,
  );

  const old = task.progress_percent ?? 0;
  if (progress !== old) {
    await run(
      `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      taskId,
      old,
      progress,
      status,
      "Cập nhật từ lưới checkbox",
      changedBy ?? "web",
    );
  }

  await recomputePackage(task.package_id);
  return { progress, status };
}

// % work package = trung bình % các sub-task.
export async function recomputePackage(packageId: number): Promise<void> {
  // Tự bọc transaction (withTransaction giờ reentrant — tái dùng transaction ngoài nếu
  // có, vd gọi từ recomputeTask). Nhiều route gọi hàm này đứng riêng ngoài transaction
  // (xem PROGRESS.md/audit) — không tự bọc thì FOR UPDATE bên dưới chỉ khoá đúng 1 câu
  // lệnh rồi nhả ngay (mỗi query() tự động COMMIT khi không có transaction bao ngoài),
  // 2 lần gọi đồng thời trên cùng nhóm có thể đọc snapshot cũ rồi ghi đè lẫn nhau.
  await withTransaction(async () => {
    // Khoá row work_packages TRƯỚC khi đọc AVG — lần gọi thứ 2 đồng thời phải đợi lần
    // đầu COMMIT xong mới đọc được aggregate mới nhất (không phải snapshot giữa chừng).
    const wp = await queryOne<{ end_date: string | null; status: string | null }>(
      `SELECT end_date, status FROM work_packages WHERE id = ? FOR UPDATE`,
      packageId,
    );
    if (!wp) return;
    const r = await queryOne<{ avg: number | null; cnt: number; notDone: number }>(
      `SELECT AVG(progress_percent) AS avg, COUNT(*) AS cnt,
              COUNT(*) FILTER (WHERE progress_percent < 1) AS "notDone"
         FROM tasks WHERE package_id = ?`,
      packageId,
    );
    // Nhóm hết task (xoá task cuối) → về 0%, không giữ % cũ (nếu không sẽ "chặn" nhầm các
    // nhóm phụ thuộc trong /gantt vì tưởng nhóm rỗng vẫn đang dở dang).
    // Chỉ = 1 khi mọi sub-task đã đúng 100% — tránh trung bình kiểu 0.995 làm tròn lên
    // 1.00 báo nhóm "hoàn thành" sai trong khi còn task chưa xong (cùng lỗi làm tròn
    // đã sửa ở recomputeTask).
    let progress = 0;
    if (r && Number(r.cnt) > 0) {
      progress = Number(r.notDone) === 0 ? 1 : Math.min(0.99, Math.round((r.avg ?? 0) * 100) / 100);
    }
    await run(
      `UPDATE work_packages SET progress = ?, status = ? WHERE id = ?`,
      progress,
      deriveStatus(progress, wp.end_date, wp.status),
      packageId,
    );
  });
}
