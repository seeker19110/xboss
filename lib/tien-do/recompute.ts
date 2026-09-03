import { query, queryOne, run, todayISO, withTransaction } from "@/lib/db";
import type { StatusSlug } from "@/lib/tien-do/status";

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

// % task từ lưới checkbox — QUY TẮC DÙNG CHUNG cho mọi đường ghi % (tick checkbox qua
// recomputeTask lẫn import Excel, xem lib/import.ts). Chỉ = 1 (100%, "hoàn thành") khi
// TẤT CẢ ô đã tick — làm tròn 2 chữ số bình thường sẽ đưa 199/200 = 0.995 lên đúng 1.00
// (Math.round nửa làm tròn lên), báo "hoàn thành" sai trong khi còn 1 ô chưa tick (mở
// khoá nghiệm thu sai — approve/route.ts chỉ chặn progress < 1). Ghim trần 0.99 cho mọi
// ca chưa đủ. Hai đường ghi % dùng chung hàm này để không cho ra 2 con số khác nhau
// trên cùng dữ liệu.
export function progressFromChecks(checked: number, total: number): number {
  if (total <= 0) return 0;
  return checked >= total ? 1 : Math.min(0.99, Math.round((checked / total) * 100) / 100);
}

// Bất biến "hoan_thanh ⇔ progress_percent >= 1" phải đúng ở MỌI đường ghi status thủ
// công (PATCH /tasks/:id, /tasks/batch, /tasks/:id/progress) — không chỉ ở recomputeTask.
// Trước đây các route này nhận status rời khỏi progress, cho phép set status='hoan_thanh'
// dù progress còn dở (hoặc ngược lại) — vá theo mục audit 2026-07-21 (PROGRESS.md).
// status='nghiem_thu' không đi qua hàm này (route riêng /approve tự kiểm 100%).
export function statusConsistentWithProgress(status: StatusSlug, progressPercent: number): boolean {
  if (progressPercent >= 1) return status === "hoan_thanh";
  return status !== "hoan_thanh";
}

// Ngày thực tế của task (M120) — SUY TỰ ĐỘNG từ % vừa ghi, không ai nhập tay. Dùng chung cho
// MỌI đường ghi % (recomputeTask từ lưới checkbox lẫn PATCH /api/tasks/:id/progress nhập tay),
// nếu không 2 đường sẽ cho ra 2 bộ ngày khác nhau trên cùng dữ liệu (bài học từ progressFromChecks).
//
// 3 luật (M120 §7 FR5, quyết định D1 chốt 2026-09-03):
//   1. progress > 0  và actual_start_date NULL     → đặt = CURRENT_DATE (mốc bắt đầu thật).
//   2. progress >= 1 và actual_end_date NULL       → đặt = CURRENT_DATE (mốc xong thật).
//   3. progress < 1  và actual_end_date NOT NULL   → xoá về NULL (xong hụt: bỏ tick/thêm cột
//      làm tăng mẫu số → task không còn xong, ngày kết thúc thực tế không còn đúng).
// actual_start_date một khi đã đặt thì KHÔNG BAO GIỜ tự xoá kể cả progress về 0 (D1): công việc
// đã từng bắt đầu là sự thật lịch sử; bỏ tick là sửa sai chứ không phải "chưa từng làm".
//
// Chỉ chạy UPDATE khi thực sự có gì đổi (điều kiện nằm trong WHERE) — không thêm round-trip
// ghi vô ích ở đường nóng nhất của app (NFR1). CURRENT_DATE lấy theo TZ của phiên Postgres,
// đồng bộ với cách todayISO() so sánh ngày ở tầng app.
export async function capNhatNgayThucTe(taskId: number, progress: number): Promise<void> {
  if (progress > 0) {
    await run(
      `UPDATE tasks SET actual_start_date = CURRENT_DATE
        WHERE id = ? AND actual_start_date IS NULL`,
      taskId,
    );
  }
  if (progress >= 1) {
    await run(
      `UPDATE tasks SET actual_end_date = CURRENT_DATE
        WHERE id = ? AND actual_end_date IS NULL`,
      taskId,
    );
  } else {
    await run(
      `UPDATE tasks SET actual_end_date = NULL
        WHERE id = ? AND actual_end_date IS NOT NULL`,
      taskId,
    );
  }
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
  // JOIN work_packages để lấy ngày KT nhóm — task.end_date NULL nghĩa là "kế thừa ngày
  // nhóm" (xem savePkgDates ở app/tracking/[sheet]/page.tsx), phải dùng ngày HIỆU LỰC
  // (task.end_date ?? wp.end_date) để suy trạng thái trễ, không phải end_date thô của
  // riêng task (bug đã sửa: task kế thừa ngày nhóm trước đây không bao giờ lên "tre").
  const task = await queryOne<{
    id: number;
    package_id: number;
    end_date: string | null;
    pkg_end_date: string | null;
    status: string | null;
    progress_percent: number | null;
  }>(
    `SELECT t.id, t.package_id, t.end_date, wp.end_date AS pkg_end_date, t.status, t.progress_percent
       FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
      WHERE t.id = ? FOR UPDATE`,
    taskId,
  );
  if (!task) return null;
  const effectiveEndDate = task.end_date ?? task.pkg_end_date;

  const dimCount = await queryOne<{ checked: number; total: number }>(
    `SELECT COUNT(*) FILTER (WHERE installed = 1) AS checked, COUNT(*) AS total
       FROM progress_dimensions WHERE task_id = ?`,
    taskId,
  );
  let progress = task.progress_percent ?? 0;
  if (dimCount && dimCount.total > 0) {
    progress = progressFromChecks(dimCount.checked, dimCount.total);
  }
  const status = deriveStatus(progress, effectiveEndDate, task.status);
  await run(
    `UPDATE tasks SET progress_percent = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    progress,
    status,
    taskId,
  );
  // Ngày thực tế (M120) — trong CÙNG transaction với việc ghi %, dưới cùng khoá FOR UPDATE ở
  // trên, để không có cửa sổ nào % và ngày thực tế lệch nhau.
  await capNhatNgayThucTe(taskId, progress);

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
    // Trung bình + làm tròn 2 chữ số làm TRONG SQL trên NUMERIC (không phải float8):
    // cộng dồn % kiểu float làm lệch ở ca nửa-làm-tròn — vd 9 task 100% + 0.25 + 4×0.19
    // có trung bình thập phân đúng bằng 0.715 (→ 0.72) nhưng cộng float ra
    // 0.7149999999999999 (→ 0.71). Đã gặp thật trên dữ liệu gốc (nhóm OGHL H6).
    const r = await queryOne<{ avg: number | null; cnt: number; notDone: number }>(
      `SELECT ROUND(AVG(progress_percent::numeric), 2)::float8 AS avg, COUNT(*) AS cnt,
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
      progress = Number(r.notDone) === 0 ? 1 : Math.min(0.99, r.avg ?? 0);
    }
    await run(
      `UPDATE work_packages SET progress = ?, status = ? WHERE id = ?`,
      progress,
      deriveStatus(progress, wp.end_date, wp.status),
      packageId,
    );
  });
}

// Nhóm đổi ngày BĐ/KT → mọi task con đang KẾ THỪA ngày nhóm (end_date NULL) phải tính lại
// trạng thái trễ theo ngày MỚI. Gọi từ PATCH /api/workpackages/:id khi đổi startDate/endDate
// (KHÔNG gọi từ trong recomputePackage — sẽ đệ quy recomputeTask ⇄ recomputePackage vô hạn
// vì recomputeTask luôn gọi recomputePackage ở cuối).
export async function recomputeTasksInheritingDates(packageId: number): Promise<void> {
  const rows = await query<{ id: number }>(
    `SELECT id FROM tasks WHERE package_id = ? AND end_date IS NULL`,
    packageId,
  );
  for (const r of rows) await recomputeTask(r.id);
}
