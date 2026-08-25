# ADR-0009: Bộ component nền `app/components/ui/` + quy ước hình thức giao diện

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-08-25

## Bối cảnh

Giao diện XBoss đã có hệ màu/theme chặt chẽ (dark-first, 5 theme, đảo màu bằng biến CSS,
kèm cả ghi chú tương phản WCAG trong `app/globals.css`) nhưng **không có bộ component nền**.
Hệ quả sau ~90 trang:

- Cùng một cái nút được viết lại hàng trăm lần với 4-5 biến thể lệch nhau
  (`bg-emerald-700 hover:bg-emerald-600` vs `bg-emerald-600 hover:bg-emerald-700`,
  `py-1.5` vs `py-2` vs `py-2.5` — có chỗ vùng chạm chỉ 26px, dưới ngưỡng mobile).
- Bo góc dùng lẫn lộn: đếm được 1.453 `rounded-lg`, 887 `rounded-xl`, 169 `rounded-2xl`
  không theo quy luật nào — thẻ và control cùng độ bo, nhìn không ra thứ bậc.
- Mặt thẻ có ít nhất 3 kiểu song song (`bg-zinc-900`, `bg-zinc-950/80`, `.bento-card`).
- Tiêu đề khối có 3 kiểu (nhãn nhỏ IN HOA / `text-base` + icon / `<h2>` trơn) nên trang
  dài (Dashboard) đọc rối, mắt không bám được thứ bậc.
- Màu nhấn không thống nhất: sidebar dùng emerald cho mục đang chọn, HubShell dùng amber
  cho tab đang chọn, Dashboard dùng amber cho hover link — amber vốn là màu **cảnh báo**
  theo `lib/tien-do/status.ts`, dùng cho trạng thái "đang chọn" làm loãng nghĩa màu.

## Quyết định

**Thêm `app/components/ui/` làm bộ component nền dùng chung** (`Button`/`ButtonLink`,
`Card`/`CardLink`, `Chip`, `Section`, `StatCard`) và chốt các quy ước hình thức:

1. **Bo góc:** `rounded-xl` cho mặt thẻ, `rounded-lg` cho control (nút/input/select),
   `rounded-2xl` chỉ cho khối hero. `rounded-full` cho chip tròn/thanh tiến độ.
2. **Mặt thẻ:** đúng 2 tông — `raised` (`bg-zinc-900`, thẻ nội dung chính) và
   `sunken` (`bg-zinc-950/70`, thẻ phụ/lồng trong thẻ khác).
3. **Màu nhấn:** **emerald = trạng thái đang chọn / hành động chính** ở mọi nơi
   (sidebar, tab, nút primary, focus ring). Amber/đỏ **chỉ** dành cho cảnh báo và trạng
   thái trễ. Tím/lam vẫn dùng để phân loại phân hệ, không dùng cho trạng thái.
4. **Vùng chạm:** mọi nút ≥ 40px chiều cao ở mọi cỡ (`min-h-10`), kể cả cỡ `sm`.
5. **Tiêu đề khối:** một kiểu duy nhất qua `Section` — nhãn nhỏ IN HOA + icon tuỳ chọn,
   mô tả một dòng bên dưới, hành động canh phải cùng hàng.

Quy tắc màu theo theme của `globals.css` **không đổi**: component nền vẫn chỉ dùng token
tự đảo (`zinc-*`, `-300/-400`), nền mờ ghép chữ `-300`, nền đặc ghép `text-on-accent`.

## Các phương án đã cân nhắc

- **Kéo shadcn/ui (Radix) vào:** thêm ~20 dependency + lớp CSS variable riêng chồng lên
  cơ chế đảo theme đang chạy tốt; phần lớn component (dialog, toast, select) dự án đã tự
  có (`dialogs.tsx`, `Toast.tsx`). Chi phí đổi mới lớn hơn lợi ích rõ rệt.
- **Chỉ thêm class tiện ích trong `globals.css`** (kiểu `.bento-card` đang có): không ép
  được vùng chạm/cấu trúc bên trong (icon, nhãn ẩn trên mobile), và không có kiểu dữ liệu
  để TypeScript canh biến thể — vẫn phải chép tay JSX.
- **Giữ nguyên, chỉ sửa từng trang khi đụng tới:** đúng nguyên tắc diff nhỏ nhưng không
  hội tụ — chính cách làm này đã tạo ra 5 biến thể nút hiện tại.

## Hệ quả

- **Tích cực:** trang mới viết nhanh và nhất quán hơn; sửa một chỗ (vùng chạm, bo góc,
  màu nhấn) áp cho toàn app; các lỗi a11y lặp lại (vùng chạm nhỏ, chữ `zinc-500` mờ,
  chip nền mờ sai công thức màu) bị chặn ngay trong component thay vì bắt lại từng trang.
- **Đánh đổi:** trong giai đoạn chuyển tiếp, các trang cũ vẫn còn markup tự vẽ — không
  chuyển đổi hàng loạt (diff khổng lồ, rủi ro cao). Chuyển dần theo nguyên tắc "trang nào
  đụng tới thì đổi trang đó".
- **Việc tiếp theo:** áp bộ component cho các nhóm trang nghiệp vụ còn lại theo từng đợt;
  cân nhắc thêm cổng CI chặn nút/thẻ viết tay mới (bắt `rounded-2xl` trên control,
  `py-0.5`/`py-1` trên nút) nếu tình trạng lệch chuẩn tái diễn.
