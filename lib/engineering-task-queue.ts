import { query, queryOne, run, withTransaction } from "@/lib/db";

export interface AsyncTaskRecord {
  id: string;
  project_id: number;
  task_type: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  priority: number;
  payload: Record<string, unknown>;
  progress_percent: number;
  worker_id: string | null;
  lease_expires_at: string | null;
  retry_count: number;
  max_retries: number;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueTaskParams {
  projectId: number;
  taskType: string;
  payload: Record<string, unknown>;
  priority?: number;
  maxRetries?: number;
  createdBy?: number;
}

/**
 * Đẩy tác vụ mới vào hàng đợi bất đồng bộ
 */
export async function enqueueAsyncTask(params: EnqueueTaskParams): Promise<AsyncTaskRecord> {
  const { projectId, taskType, payload, priority = 0, maxRetries = 3, createdBy } = params;

  const rows = await query<AsyncTaskRecord>(
    `INSERT INTO engineering_async_tasks (project_id, task_type, payload, priority, max_retries, created_by)
     VALUES (?, ?, ?::jsonb, ?, ?, ?)
     RETURNING *`,
    projectId,
    taskType,
    JSON.stringify(payload),
    priority,
    maxRetries,
    createdBy ?? null,
  );

  return rows[0];
}

/**
 * Nhận tác vụ tiếp theo để xử lý (Atomic claim với Advisory Lock / Skip Locked)
 */
export async function claimNextAsyncTask(
  workerId: string,
  supportedTypes?: string[],
  leaseMinutes: number = 5,
): Promise<AsyncTaskRecord | null> {
  return withTransaction(async () => {
    let sql = `
      SELECT id FROM engineering_async_tasks
      WHERE status = 'pending'
    `;
    const params: unknown[] = [];

    if (supportedTypes && supportedTypes.length > 0) {
      sql += ` AND task_type = ANY(?::text[])`;
      params.push(supportedTypes);
    }

    sql += ` ORDER BY priority DESC, created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;

    const candidate = await queryOne<{ id: string }>(sql, ...params);
    if (!candidate) return null;

    const leaseInterval = `${Math.max(1, leaseMinutes)} minutes`;
    const updated = await query<AsyncTaskRecord>(
      `UPDATE engineering_async_tasks
       SET status = 'processing',
           worker_id = ?,
           lease_expires_at = CURRENT_TIMESTAMP + ?::interval,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
       RETURNING *`,
      workerId,
      leaseInterval,
      candidate.id,
    );

    return updated[0] ?? null;
  });
}

/**
 * Cập nhật tiến độ % của tác vụ đang chạy và gia hạn lease
 */
export async function updateTaskProgress(
  taskId: string,
  progressPercent: number,
  leaseExtendMinutes: number = 5,
): Promise<boolean> {
  const leaseInterval = `${Math.max(1, leaseExtendMinutes)} minutes`;
  const res = await run(
    `UPDATE engineering_async_tasks
     SET progress_percent = ?,
         lease_expires_at = CURRENT_TIMESTAMP + ?::interval,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'processing'`,
    Math.min(100, Math.max(0, progressPercent)),
    leaseInterval,
    taskId,
  );
  return res.changes > 0;
}

/**
 * Đánh dấu tác vụ đã hoàn tất
 */
export async function completeAsyncTask(
  taskId: string,
  result: Record<string, unknown>,
): Promise<boolean> {
  const res = await run(
    `UPDATE engineering_async_tasks
     SET status = 'completed',
         progress_percent = 100.00,
         result = ?::jsonb,
         error_message = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'processing'`,
    JSON.stringify(result),
    taskId,
  );
  return res.changes > 0;
}

/**
 * Đánh dấu tác vụ bị lỗi và xử lý retry
 */
export async function failAsyncTask(taskId: string, errorMessage: string): Promise<boolean> {
  return withTransaction(async () => {
    const task = await queryOne<AsyncTaskRecord>(
      `SELECT * FROM engineering_async_tasks WHERE id = ? FOR UPDATE`,
      taskId,
    );
    if (!task) return false;

    const newRetryCount = task.retry_count + 1;
    const shouldFailPermanently = newRetryCount >= task.max_retries;

    const newStatus = shouldFailPermanently ? "failed" : "pending";
    const res = await run(
      `UPDATE engineering_async_tasks
       SET status = ?,
           retry_count = ?,
           error_message = ?,
           worker_id = NULL,
           lease_expires_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      newStatus,
      newRetryCount,
      errorMessage,
      taskId,
    );

    return res.changes > 0;
  });
}

/**
 * Hủy tác vụ
 */
export async function cancelAsyncTask(taskId: string, projectId: number): Promise<boolean> {
  const res = await run(
    `UPDATE engineering_async_tasks
     SET status = 'cancelled',
         error_message = 'Tác vụ đã bị người dùng hủy bỏ.',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND project_id = ? AND status IN ('pending', 'processing')`,
    taskId,
    projectId,
  );
  return res.changes > 0;
}

/**
 * Tự động thu hồi các tác vụ bị treo quá hạn lease (Stale Task Reclamation)
 */
export async function reclaimStaleTasks(): Promise<number> {
  const stale = await query<{ id: string; retry_count: number; max_retries: number }>(
    `SELECT id, retry_count, max_retries FROM engineering_async_tasks
     WHERE status = 'processing' AND lease_expires_at < CURRENT_TIMESTAMP`,
  );

  let reclaimed = 0;
  for (const t of stale) {
    const newRetry = t.retry_count + 1;
    const finalStatus = newRetry >= t.max_retries ? "failed" : "pending";
    const err = "Worker lease expired; reclaimed by queue monitor.";

    await run(
      `UPDATE engineering_async_tasks
       SET status = ?, retry_count = ?, error_message = ?, worker_id = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      finalStatus,
      newRetry,
      err,
      t.id,
    );
    reclaimed++;
  }

  return reclaimed;
}

/**
 * Danh sách các tác vụ trong hàng đợi
 */
export async function listAsyncTasks(
  projectId: number,
  options?: { status?: string; limit?: number; offset?: number },
): Promise<AsyncTaskRecord[]> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  if (options?.status) {
    return query<AsyncTaskRecord>(
      `SELECT * FROM engineering_async_tasks
       WHERE project_id = ? AND status = ?
       ORDER BY priority DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      projectId,
      options.status,
      limit,
      offset,
    );
  }

  return query<AsyncTaskRecord>(
    `SELECT * FROM engineering_async_tasks
     WHERE project_id = ?
     ORDER BY priority DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    projectId,
    limit,
    offset,
  );
}
