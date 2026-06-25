import { queryOne } from "@/lib/db";

// Sinh mã tuần tự (PR/PO/WR...) dạng `<prefix><NNN>` theo mã lớn nhất hiện có.
// Việc "đọc MAX rồi +1" có thể đụng nhau khi tạo đồng thời — luôn dùng kèm
// withUniqueRetry và một ràng buộc UNIQUE trên cột mã để chống trùng thật sự.

// Lỗi vi phạm UNIQUE của Postgres.
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

// Mã kế tiếp cho `prefix` (vd "PR-202606-") trên bảng/cột cho trước.
// table/column là hằng nội bộ (không phải input người dùng) nên nội suy an toàn.
export async function nextSeqCode(table: string, column: string, prefix: string): Promise<string> {
  const last = await queryOne<{ code: string }>(
    `SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`,
    `${prefix}%`);
  const seq = last?.code ? parseInt(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// Chạy lại fn khi đụng UNIQUE (mã trùng do tạo đồng thời) — sinh mã mới ở mỗi lần.
export async function withUniqueRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < tries && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}
