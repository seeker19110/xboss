// Ngưỡng dùng chung cho đường CAD — đặt ở lib/ chứ không ở route, vì cả route nạp lên lẫn
// route lưu đều cần cùng một con số (ADR-0008: route chỉ là ranh giới HTTP).

/**
 * Trần dung lượng tệp CAD nạp lên và lưu lại (byte).
 *
 * Vì sao cần: cả đường nạp lên lẫn đường lưu đều KHÔNG có giới hạn nào — client đọc trọn tệp
 * thành ArrayBuffer → base64 (phình 1,33×) → nhét vào một body JSON → `Buffer.from` trên máy chủ.
 * Đối chiếu phần còn lại của hệ thống: ảnh hiện trường 10 MB, biên bản nghiệm thu 20 MB; riêng
 * CAD — loại tệp lớn nhất trong cả app — thì bỏ ngỏ (audit 2026-08-24).
 *
 * Chọn 150 MB: bản vẽ MEPF thật của dự án đo được **~50 MB** (người dùng xác nhận 2026-08-24), nên
 * trần này để 3× dư địa. Đây là van an toàn chống tràn bộ nhớ máy chủ, không phải chính sách
 * nghiệp vụ — con số chưa có căn cứ từ đặc tả, cần chủ spec chốt lại.
 */
export const GIOI_HAN_TEP_CAD = 150 * 1024 * 1024;

/**
 * Ước lượng số byte thật của một chuỗi base64 mà KHÔNG giải mã nó.
 *
 * Phải ước lượng trước: giải mã rồi mới đo thì đã tốn đúng số bộ nhớ đang muốn tránh. Base64 mã
 * 3 byte thành 4 ký tự, và `=` ở cuối là ký tự đệm không mang dữ liệu.
 */
export function uocLuongByteTuBase64(chuoi: string): number {
  if (!chuoi) return 0;
  const demDem = chuoi.endsWith("==") ? 2 : chuoi.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((chuoi.length * 3) / 4) - demDem);
}
