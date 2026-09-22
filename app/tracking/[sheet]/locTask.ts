import type { StatusSlug } from "@/lib/tien-do/status";

// Giá trị bộ lọc cấp task trên URL (?task=). Rỗng = không lọc.
export type TaskFilterValue = "" | StatusSlug;

// Nhãn hiển thị riêng cho select lọc task — khác STATUS_LABEL ở mục "hoan_thanh":
// trong ngữ cảnh lọc, task đạt progress 100% nhưng CHƯA được duyệt nghiệm thu gọi là
// "Chờ nghiệm thu" (rõ nghĩa hơn "Hoàn thành" khi đặt cạnh "Đã nghiệm thu").
export const TASK_FILTER_OPTIONS: { value: TaskFilterValue; label: string }[] = [
  { value: "", label: "Tất cả task" },
  { value: "tre", label: "Trễ" },
  { value: "chuan_bi", label: "Chưa bắt đầu" },
  { value: "dang_thi_cong", label: "Đang thi công" },
  { value: "hoan_thanh", label: "Chờ nghiệm thu" },
  { value: "nghiem_thu", label: "Đã nghiệm thu" },
];

// Một task có khớp bộ lọc cấp task hay không. Dùng chung cho cả việc ẩn/hiện nhóm
// (locNhomTheoTask) lẫn ẩn hàng task trong lưới (TrackingGrid) — để hai nơi luôn
// đồng nhất tiêu chí, tránh nhóm hiện ra nhưng bên trong lại không còn hàng nào khớp.
export function taskKhopLoc(status: string, taskFilter: string): boolean {
  return !taskFilter || status === taskFilter;
}

// Lọc danh sách nhóm (package) theo trạng thái các TASK bên trong nó: nhóm không còn
// task nào khớp bộ lọc thì bị loại khỏi danh sách hiển thị. Khác `statusFilter` cấp
// nhóm hiện có (lọc theo p.status) — filter này xét vào từng p.tasks[].status.
export function locNhomTheoTask<T extends { tasks: { status: string }[] }>(
  packages: T[],
  taskFilter: string,
): T[] {
  if (!taskFilter) return packages;
  return packages.filter((p) => p.tasks.some((t) => taskKhopLoc(t.status, taskFilter)));
}
