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

// Trần số nhóm được TỰ ĐỘNG mở khi lọc task (?task=). Đo trên sheet ODNN Zone 1 (nặng nhất):
// 28 nhóm × 28 task × 22 cột dimension = 616 ô tick/nhóm, mỗi nhóm mở gọi riêng 1 request
// GET /api/workpackages/:id/dimensions. Lọc một trạng thái phổ biến có thể khớp cả 28 nhóm →
// nếu mở hết cùng lúc sẽ bắn 28 request song song + mount ~17.000 ô tick (~52.000 node DOM)
// trên điện thoại ngoài công trường. Giới hạn số nhóm tự mở, phần còn lại người dùng tự bấm.
export const GIOI_HAN_NHOM_TU_MO = 8;

// Trong các nhóm khớp bộ lọc task, chọn tối đa `gioiHan` nhóm ĐANG GẬP để tự mở thêm — tính cả
// những nhóm khớp lọc đã mở sẵn (do người dùng tự bấm trước đó) vào trần, để tổng số lưới nặng
// hiển thị cùng lúc luôn bị chặn đúng `gioiHan`, không chỉ chặn phần tự động.
export function nhomTuMoTheoLoc<T extends { id: number; tasks: { status: string }[] }>(
  packages: T[],
  taskFilter: string,
  daMo: Record<number, boolean>,
  gioiHan: number = GIOI_HAN_NHOM_TU_MO,
): { moThem: number[]; boQua: number } {
  if (!taskFilter) return { moThem: [], boQua: 0 };
  const nhomKhop = packages.filter((p) => p.tasks.some((t) => taskKhopLoc(t.status, taskFilter)));
  let dangMo = 0;
  for (const p of nhomKhop) {
    if (daMo[p.id]) dangMo++;
  }
  const moThem: number[] = [];
  let boQua = 0;
  for (const p of nhomKhop) {
    if (daMo[p.id]) continue;
    if (dangMo + moThem.length < gioiHan) {
      moThem.push(p.id);
    } else {
      boQua++;
    }
  }
  return { moThem, boQua };
}
