// QUALITY-FINAL-1 S16 — chạy việc HỆ THỐNG (cron gọi bằng CRON_SECRET, script vận hành) theo TỪNG
// tổ chức. Từ migration 0165 các bảng theo tổ chức (users, projects, alert_rules, integrations…)
// không còn nhánh RLS "GUC rỗng → cho qua": câu lệnh không có app.org_id thấy 0 dòng. Thay vì mở
// '*' cho cả job, job chạy lần lượt trong ngữ cảnh request CHỈ mang orgId (không actor) — lib/db
// tự gắn app.org_id cho câu lệnh ngoài transaction và withTransaction đặt GUC từ ngữ cảnh đó, nên
// mỗi vòng chỉ thấy đúng dữ liệu một tổ chức (D01: không có ngữ cảnh "nhìn mọi org").
// Bảng `organizations` không bật RLS nên liệt kê được khi chưa có ngữ cảnh.
import { query } from "@/lib/db";
import { log } from "@/lib/nen/log";
import { getRequestContext, runWithRequestContext } from "@/lib/nen/request-context";

/** Id mọi tổ chức, tăng dần. */
async function danhSachToChuc(): Promise<number[]> {
  const rows = await query<{ id: number }>(`SELECT id FROM organizations ORDER BY id`);
  return rows.map((r) => r.id);
}

/** Chạy fn trong ngữ cảnh chỉ mang tổ chức `orgId` (giữ request-id để tương quan log). */
export function trongToChuc<T>(orgId: number, fn: () => Promise<T>): Promise<T> {
  return runWithRequestContext({ requestId: getRequestContext()?.requestId, orgId }, fn);
}

/**
 * Chạy fn lần lượt cho từng tổ chức (tuần tự — job cron không cần song song), gom kết quả.
 * Cách ly lỗi giữa tenant: một tổ chức ném lỗi thì ghi log kèm orgId và CHẠY TIẾP các tổ chức
 * sau (báo cáo/webhook của tenant khác không bị một tenant hỏng kéo theo); chạy xong mới ném
 * một lỗi tổng hợp liệt kê các tổ chức lỗi — không nuốt lỗi im lặng, caller vẫn trả 500.
 */
export async function theoTungToChuc<T>(fn: (orgId: number) => Promise<T>): Promise<T[]> {
  const ketQua: T[] = [];
  const loi: { orgId: number; error: unknown }[] = [];
  for (const orgId of await danhSachToChuc()) {
    try {
      ketQua.push(await trongToChuc(orgId, () => fn(orgId)));
    } catch (error) {
      log.error("Job theo tổ chức lỗi — bỏ qua tổ chức này, chạy tiếp", {
        orgId,
        err: error instanceof Error ? error.message : String(error),
      });
      loi.push({ orgId, error });
    }
  }
  if (loi.length > 0)
    throw Object.assign(
      new Error(
        `Job theo tổ chức lỗi ở ${loi.length}/${loi.length + ketQua.length} tổ chức: ` +
          loi.map((l) => l.orgId).join(", "),
      ),
      { loi },
    );
  return ketQua;
}
