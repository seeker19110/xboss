// lib/nen/loi.ts — Lỗi NGHIỆP VỤ có mã trạng thái + helper ánh xạ lỗi → phản hồi HTTP.
//
// VÌ SAO: toàn cụm `app/api/engineering/**` dùng đúng một idiom bắt lỗi:
//
//   } catch (err: unknown) {
//     const msg = err instanceof Error ? err.message : String(err);
//     return NextResponse.json({ error: msg }, { status: 500 });
//   }
//
// nên MỌI lỗi nghiệp vụ do `lib/ky-thuat/*` ném ra (QR sai checksum, bản ghi không thuộc dự
// án, sai trạng thái…) đều tới client dưới dạng **500**, lẫn với lỗi hệ thống thật (mất kết
// nối DB, vi phạm ràng buộc). Client không phân biệt được "bạn gửi sai" với "server hỏng",
// log/Sentry ngập 500 giả. Vài route đã phải chữa cháy bằng cách **so chuỗi thông điệp**
// (`msg.includes("Không tìm thấy") ? 404 : 500`) — cách này mục ruỗng ngay khi ai đó sửa
// câu chữ tiếng Việt của thông điệp.
//
// Cách làm ở đây: hàm lib ném `LoiNghiepVu` mang sẵn mã trạng thái; route chỉ gọi
// `phanHoiLoi(err)`. Lỗi KHÔNG phải `LoiNghiepVu` vẫn ra **500** — nuốt lỗi hệ thống thành
// 4xx là hồi quy nguy hiểm hơn cả bệnh đang chữa.
//
// TẦNG: đặt ở `lib/nen/` (tầng 0, ADR-0007) để mọi miền đều import xuống được — lớp lỗi này
// thuần, không chạm DB. Riêng `phanHoiLoi` có import `next/server`: nó là **tiện ích của
// ranh giới HTTP**, cố ý đặt cạnh lớp lỗi để 98 chỗ `catch` rút gọn còn một lời gọi thay vì
// mỗi route tự map lại (tiền lệ: `assertModuleEnabled` của `lib/ha-tang/feature-flags.ts`
// cũng trả `NextResponse`). Vì vậy **không import module này từ component client**.
//
// ĐẶT TÊN: tiếng Việt, bám `lib/nen/date.ts`/`money.ts` (tên hàm mô tả nghiệp vụ bằng tiếng
// Việt khi khái niệm là của nghiệp vụ, tiếng Anh khi là thuật ngữ kỹ thuật phổ thông).
import { NextResponse } from "next/server";

/**
 * Lỗi nghiệp vụ: đầu vào/trạng thái/quyền của NGƯỜI DÙNG sai, không phải server hỏng.
 * `status` là mã HTTP 4xx mà route sẽ trả về nguyên văn qua `phanHoiLoi`.
 *
 * Dùng các hàm tạo bên dưới thay vì `new LoiNghiepVu(...)` trực tiếp để mã trạng thái được
 * chọn nhất quán trong toàn repo.
 */
export class LoiNghiepVu extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LoiNghiepVu";
  }
}

/** 400 — đầu vào sai cú pháp/định dạng (mã QR hỏng, thiếu trường, kiểu sai). */
export const loiDauVao = (message: string) => new LoiNghiepVu(message, 400);

/** 403 — có đăng nhập nhưng không đủ quyền cho thao tác này. */
export const loiKhongCoQuyen = (message: string) => new LoiNghiepVu(message, 403);

/** 404 — không tìm thấy bản ghi, HOẶC bản ghi không thuộc dự án/tổ chức đang chọn
 *  (dùng 404 chứ không 403 cho ca xuyên dự án: 403 xác nhận bản ghi có tồn tại). */
export const loiKhongTimThay = (message: string) => new LoiNghiepVu(message, 404);

/** 409 — xung đột trạng thái/bất biến nghiệp vụ: bản ghi đang ở trạng thái không cho phép
 *  thao tác (đã xoá mềm, đã duyệt, đã liên kết, thẻ hết hạn…). Khác 422 ở chỗ đầu vào
 *  hoàn toàn hợp lệ — chỉ là *lúc này* không làm được. */
export const loiXungDot = (message: string) => new LoiNghiepVu(message, 409);

/** 422 — đầu vào đúng cú pháp nhưng không thoả điều kiện nghiệp vụ (giá trị ngoài miền cho
 *  phép, thiếu dữ liệu phụ thuộc, không đủ điều kiện tính toán). */
export const loiKhongXuLyDuoc = (message: string) => new LoiNghiepVu(message, 422);

/**
 * Ánh xạ lỗi bắt được trong route → `NextResponse`.
 *
 * - `LoiNghiepVu` (kể cả lớp con) → đúng `status` của nó, thân `{ error: <thông điệp> }`.
 * - Mọi lỗi khác → **500** với thông điệp gốc (giữ nguyên hình dạng cũ `{ error: msg }`
 *   để không hồi quy các test/màn hình đang đọc thông điệp).
 *
 * CỐ Ý chỉ nhận `instanceof` chứ không dò cấu trúc (kiểu "có thuộc tính `status` là số thì
 * coi là lỗi nghiệp vụ"): lỗi của thư viện ngoài đôi khi cũng mang `status`, dò cấu trúc sẽ
 * âm thầm hạ lỗi hệ thống xuống 4xx — đúng thứ hàm này sinh ra để ngăn.
 *
 * @param thongDiepMacDinh thông điệp thay thế khi lỗi hệ thống không có `message`
 *        (giữ nguyên hành vi `error.message || "Lỗi ..."` của vài route cũ).
 */
export function phanHoiLoi(err: unknown, thongDiepMacDinh?: string): NextResponse {
  if (err instanceof LoiNghiepVu) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ error: msg || thongDiepMacDinh || "Lỗi hệ thống" }, { status: 500 });
}
