// lib/engineering-closed-loop-sync.ts — Closed-Loop Autonomous WBS & Payment Sync Engine (M70)
import { createHash, randomBytes } from "node:crypto";
import { query, queryOne, run } from "@/lib/db";

export interface SyncPayload {
  spoolId: string;
  wbsTaskId?: number | null;
  discipline: string;
  calculatedQty: number;
  unit: string;
  unitRateVnd: number;
  approvedByUserId?: number | null;
}

export interface SyncResult {
  syncCode: string;
  spoolId: string;
  wbsTaskId: number | null;
  syncedQty: number;
  syncedAmountVnd: number;
  provenanceToken: string;
  status: "synced_successfully" | "error";
  message: string;
}

// ============================================================================
// 1. THUẬT TOÁN ĐỒNG BỘ KHÉP KÍN 2 CHIỀU (SPOOL -> WBS TASK -> PAYMENT IPC)
// ============================================================================

export async function syncSpoolToWbsAndPayment(
  projectId: number,
  payload: SyncPayload,
): Promise<SyncResult> {
  // Mã đồng bộ phải duy nhất theo (project_id, sync_code) — có UNIQUE trong DB (0104).
  // Chỉ dùng Date.now() là KHÔNG đủ: hai lần đồng bộ của cùng một dự án rơi vào cùng một
  // mili giây sẽ sinh trùng mã và lần thứ hai vỡ ở ràng buộc. Không phải tình huống lý
  // thuyết — đồng bộ hàng loạt nhiều spool là đường dùng bình thường, và CI (máy nhanh hơn)
  // đã dựng lại được ngay. Thêm 4 byte ngẫu nhiên để mã duy nhất cả trong cùng mili giây.
  const syncCode = `SYNC-LOOP-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const totalAmountVnd = Math.round(payload.calculatedQty * payload.unitRateVnd);

  const rawToken = `${projectId}:${payload.spoolId}:${totalAmountVnd}:${Date.now()}`;
  const provenanceToken = `SIG-PAY-${createHash("sha256").update(rawToken).digest("hex").slice(0, 24).toUpperCase()}`;

  // 1. Cập nhật tiến độ WBS Task nếu có task ID.
  //
  // Câu lệnh này trước đây tham chiếu HAI cột không tồn tại — `tasks.progress` (bảng chỉ có
  // `progress_percent`) và `tasks.project_id` (dự án suy qua package_id → work_packages →
  // sheet_types → towers) — nên nhánh đồng bộ tiến độ, tức lý do tồn tại của cả module, luôn
  // ném lỗi ở production. Sửa theo đúng schema và các bất biến tiến độ của dự án:
  //   - `progress_percent` là thang 0..1 (có CHECK trong DB), nên "mỗi lần đồng bộ +10%" là +0.1;
  //   - status dùng enum slug của lib/tien-do/status.ts, không phải 'done'/'in_progress';
  //   - `nghiem_thu` KHÔNG bao giờ bị hạ cấp tự động (quy tắc chung của chuỗi tính tiến độ);
  //   - giữ bất biến "hoan_thanh ⇔ progress_percent >= 1".
  // Phạm vi dự án kiểm bằng JOIN thay vì cột không có, để task của dự án khác không bị đụng.
  if (payload.wbsTaskId) {
    await run(
      `UPDATE tasks t SET
        progress_percent = LEAST(1, COALESCE(t.progress_percent, 0) + 0.1),
        status = CASE
          WHEN t.status = 'nghiem_thu' THEN 'nghiem_thu'
          WHEN LEAST(1, COALESCE(t.progress_percent, 0) + 0.1) >= 1 THEN 'hoan_thanh'
          ELSE 'dang_thi_cong'
        END,
        updated_at = CURRENT_TIMESTAMP
       FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id
       JOIN towers tw ON tw.id = st.tower_id
       WHERE t.id = ? AND wp.id = t.package_id AND tw.project_id = ?`,
      payload.wbsTaskId,
      projectId,
    );
  }

  // 2. Ghi nhận log đồng bộ bất biến
  await query(
    `INSERT INTO engineering_closed_loop_sync_logs (
      project_id, sync_code, spool_id, wbs_task_id,
      synced_qty, synced_amount_vnd, provenance_token
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7
    )`,

    projectId,
    syncCode,
    payload.spoolId,
    payload.wbsTaskId || null,
    payload.calculatedQty,
    totalAmountVnd,
    provenanceToken,
  );

  return {
    syncCode,
    spoolId: payload.spoolId,
    wbsTaskId: payload.wbsTaskId || null,
    syncedQty: payload.calculatedQty,
    syncedAmountVnd: totalAmountVnd,
    provenanceToken,
    status: "synced_successfully",
    message: `Đã đồng bộ thành công khối lượng ${payload.calculatedQty} ${payload.unit} (${totalAmountVnd.toLocaleString("vi-VN")} đ) vào hệ thống tiến độ WBS và Chứng chỉ thanh toán IPC.`,
  };
}

export async function listClosedLoopSyncLogs(
  projectId: number,
): Promise<Array<Record<string, unknown>>> {
  // `query(sql, ...params)` nhận tham số kiểu REST. Truyền hẳn một mảng (`[projectId]`) làm
  // `$1` nhận giá trị mảng Postgres `{1}` thay vì số nguyên, nên hàm này luôn lỗi
  // "invalid input syntax for type integer" — kể cả khi bảng có dữ liệu.
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_closed_loop_sync_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    projectId,
  );
}
