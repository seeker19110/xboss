// Khoá chống chạy chồng dùng chung (tái dùng bảng sync_locks, M18) — cùng pattern
// acquireLock/releaseLock đã có ở lib/material-sync.ts và lib/integrations/core.ts (2 chỗ
// đó giữ nguyên, không refactor lại — tránh diff không cần thiết); module này cho call
// site MỚI (M53 PR4: daily-report/weekly-report) dùng chung thay vì copy lần 3.
import { queryOne, run } from "@/lib/db";

/** Giữ khoá tên `name`; tự coi là "hết hạn" (chiếm lại được) sau `staleMinutes` không
 *  release — chống treo khoá vĩnh viễn khi process crash giữa chừng. */
export async function acquireSyncLock(name: string, staleMinutes = 10): Promise<boolean> {
  const row = await queryOne<{ name: string }>(
    `INSERT INTO sync_locks (name, locked_at) VALUES (?, NOW())
     ON CONFLICT (name) DO UPDATE SET locked_at = NOW()
       WHERE sync_locks.locked_at IS NULL OR sync_locks.locked_at < NOW() - (? || ' minutes')::interval
     RETURNING name`,
    name,
    staleMinutes,
  );
  return !!row;
}

export async function releaseSyncLock(name: string): Promise<void> {
  await run(`UPDATE sync_locks SET locked_at = NULL WHERE name = ?`, name);
}
