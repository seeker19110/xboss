# ADR-0010: Tương phản màu — sửa ở TOKEN, nút đậm dần khi rê chuột, hai cổng CI canh

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-08-25
- **Nối tiếp:** ADR-0009 (bộ component nền UI)

## Bối cảnh

Đợt đo bằng axe trên bản production có dữ liệu thật (2.543 task) phát hiện một lớp lỗi
tương phản lặp lại ở quy mô lớn, không phải vài chỗ lẻ:

- `text-zinc-500` — màu chữ phụ dùng ở **gần 700 chỗ** — chỉ đạt 3,5-4,1:1 trên mặt thẻ của
  **cả 4 theme tối** (`dark/kingblue/darkblue/navy`). Riêng Dashboard đếm ~95 nút DOM vi phạm.
- Mặt thẻ King Blue/Dark Blue sáng hơn các theme tối khác nên **8 họ màu nhấn** dùng làm chữ
  ở mức `-400` tụt xuống 3,1-4,4:1.
- Ô 100% của bản đồ nhiệt dùng chữ trắng trên `bg-emerald-600` (3,65:1) — sai chính luật
  "chọn chữ theo độ sáng của nền" đã ghi ở đầu `globals.css`.
- Mẫu **nút chính** dùng khắp app (`bg-emerald-700 hover:bg-emerald-600 text-on-accent`) đạt
  5,36:1 lúc nghỉ nhưng tụt còn **3,65:1 ngay khi rê chuột** — 215 chỗ.
- Chưa có trang 404 riêng nên Next dùng trang mặc định nền **trắng cắm cứng**, trong khi
  footer/chữ của app vẫn theo theme tối → 1,6-2,6:1.

Các cổng sẵn có không bắt được: `check:mau-accent` chỉ xét `text-white` (bỏ sót
`text-on-accent` — cùng là #ffffff) và chỉ xét nền ở trạng thái nghỉ; axe trong e2e chỉ
quét phần tử đang hiển thị với dữ liệu seed mẫu (nhẹ hơn thật nhiều) và gần như không bao
giờ bắt được trạng thái `hover:`.

## Quyết định

1. **Lỗi ở mức TOKEN thì sửa ở token, không sửa tay từng class.** `--color-zinc-500` được
   ghi đè sáng hơn cho từng theme tối trong `app/globals.css`; `-400` của các họ màu hụt
   ngưỡng ở King Blue/Dark Blue lấy giá trị `-300`. Giữ nguyên thứ bậc 3 mức chữ
   (300 > 400 > 500) để không mất phân cấp thị giác.
2. **Nút nền màu đặc ĐẬM DẦN khi rê chuột** (`-700 → -800`), không sáng dần như mẫu cũ.
3. **Hai cổng CI** canh cả hai lớp lỗi, chạy trong vài giây, không cần trình duyệt:
   - `npm run check:contrast` (`scripts/check-contrast.ts`) — đọc **thẳng** bảng token trong
     `globals.css`, chặn khi mức chữ 300/400/500 (zinc + accent) không đạt AA trên
     `--background`/`zinc-950`/`zinc-900` của bất kỳ theme nào.
   - `npm run check:mau-accent` — mở rộng: coi `text-on-accent` như `text-white`, xét cả
     `hover:`/`focus:`/`active:`, và quét **mọi chuỗi class** chứ không chỉ `className="…"`
     (bảng biến thể của `app/components/ui/Button.tsx` trước đây lọt lưới).

## Các phương án đã cân nhắc

- **Đổi `text-zinc-500` → `text-zinc-400` ở cả ~700 chỗ:** diff khổng lồ không review nổi,
  và làm **mất hẳn** một mức trong thang chữ (400 và 500 hoá cùng màu).
- **Làm tối mặt thẻ King Blue** để mọi màu nhấn tự đạt ngưỡng: hỏng đúng thứ tạo nên bản sắc
  theme ("xanh hoàng gia rực rỡ, mặt thẻ nổi bật").
- **Chỉ dựa vào axe trong e2e:** đã chứng minh không đủ — seed mẫu nhẹ nên phần lớn node
  vi phạm không render, và trạng thái `hover:` gần như không bao giờ được quét.
- **Đổi chữ nút sang `text-on-accent-dark` khi rê chuột:** chữ lật từ trắng sang gần đen
  giữa chừng, nhìn giật; đậm dần nền là cách chuẩn và không đổi màu chữ.

## Hệ quả

- **Tích cực:** một lớp lỗi a11y lặp đi lặp lại nay không thể quay lại lặng lẽ — hai cổng
  chặn ngay lúc CI, kèm thông báo chỉ rõ phải sửa ở token nào. Toàn bộ 5 theme × 8 trang dày
  dữ liệu × 2 khổ màn hình đo lại bằng axe: **0 vi phạm serious/critical**.
- **Đánh đổi:** mức chữ phụ ở các theme tối sáng hơn trước một chút (chênh lệch với `-400`
  hẹp lại); nút chính khi rê chuột đậm hơn thay vì sáng hơn — khác thói quen cũ nhưng nhất
  quán toàn app. Bảng giá trị mặc định Tailwind v4 trong `check-contrast.ts` là hex sRGB
  chép từ oklch, có thể lệch nếu Tailwind đổi bảng màu — khi đó axe (e2e) vẫn là trọng tài.
- **Việc tiếp theo:** cổng hiện chỉ **cảnh báo** (không chặn) với nền `zinc-800` — nền của
  control (ô nhập, chip). Nếu sau này có chữ phụ đặt lên control, cần siết mức đó lên chặn.
