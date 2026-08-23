// lib/dich-vu/luong.ts — Dịch vụ PHỐI HỢP giữa miền tài chính (kỳ lương) và miền hiện
// trường (chấm công). Nằm ở tầng dịch vụ (ADR-0008) chứ không nằm trong một trong hai
// miền, vì đặt ở đâu cũng khiến miền đó phải biết về miền kia — chính là chu trình
// hien-truong ↔ tai-chinh mà lib/layers.json từng phải khai làm nợ.
import { attendanceSummary } from "@/lib/hien-truong/hr";
import { PERIOD_RE, type PayrollSuggestion } from "@/lib/tai-chinh/finance";

export type { PayrollSuggestion };

// Gợi ý công/lương từ chấm công (M24 attendance) theo kỳ 'YYYY-MM' — chỉ gộp chấm công
// theo NGƯỜI (personnel_id NOT NULL, tái dùng attendanceSummary lib/hien-truong/hr.ts);
// chấm công theo tổ (headcount gộp) không tách được người cụ thể nên không đưa vào gợi ý
// — người dùng nhập tay các trường hợp này (đúng tinh thần "nhập tay nếu cần" của đặc tả).
// KHÔNG ghi vào bảng payroll — chỉ trả gợi ý để người dùng xác nhận/chỉnh trước khi lưu.
export async function payrollFromAttendance(
  period: string,
  projectId?: number,
): Promise<PayrollSuggestion[]> {
  if (!PERIOD_RE.test(period)) throw new Error("Kỳ lương phải đúng định dạng YYYY-MM");
  const [y, m] = period.split("-").map(Number);
  const from = `${period}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = `${period}-${String(lastDay).padStart(2, "0")}`;
  const rows = await attendanceSummary(projectId, from, to);
  return rows.map((r) => ({
    personnelId: r.personnelId,
    personnelName: r.personnelName,
    workdays: r.daysPresent,
  }));
}
