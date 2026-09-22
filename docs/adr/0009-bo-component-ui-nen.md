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

## Bổ sung: màn hình chứng từ — M124 (2026-09-21)

Nhóm trang tài chính (IPC, hợp đồng, VO, claim) trước đây dùng chung mẫu "bảng + Modal":
chi tiết chứng từ mở trong `Modal max-w-2xl`, nhập khối lượng nhiều dòng rất chật, nút
hành động `py-2 text-xs` nằm dưới ngưỡng 40px. M124 chốt **mẫu màn hình chứng từ** và bổ
sung 4 component nền (đặc tả: `docs/nang-cap/M124-bo-cuc-man-hinh-chung-tu.md`):

| Component    | Vai trò                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `DocToolbar` | Thanh công cụ trên của chứng từ, `sticky top-0`, có `DocToolbar.Sep` ngăn nhóm nút và slot `trailing` (điều hướng) |
| `DocField`   | Hàng "nhãn — giá trị" (+ `DocFieldGroup` 2 cột) cho phần đầu chứng từ; ô chỉ đọc dùng viền đứt nét                 |
| `DocTotals`  | Khối tổng hợp tiền cuối chứng từ — **chỉ hiển thị**, nhận giá trị đã format (tiền vẫn do SQL tính, quy ước M45)    |
| `Kbd`        | Chip phím tắt đi kèm nhãn nút                                                                                      |

Hai quy ước hình thức kèm theo:

1. **Toolbar trên là `hidden md:flex`, thanh hành động đáy hiện ở MỌI breakpoint.** Thanh
   đáy đi qua prop `bottomActions` của `AppHeader` (đã có `.app-bottombar`), nên trên điện
   thoại ngón tay luôn với tới hành động chính mà không phải cuộn lên đầu chứng từ; desktop
   có cả hai (toolbar dính theo ngữ cảnh + thanh đáy cố định). Quyết định của người dùng
   khi duyệt M124: "toolbar trên & thanh đáy, đáy ưu tiên mobile".
2. **`Kbd` ẩn dưới `md`** (điện thoại công trường không có bàn phím) và dùng biến thể
   `onAccent` khi đặt trên nút primary để không phá công thức màu nền accent của `Button`.

Áp dụng đầu tiên cho `/payment-certs` (master–detail: danh sách đợt trái 320px, chứng từ
phải, `?contractId=&id=` trong URL). Các trang tài chính còn lại chuyển dần theo nguyên tắc
"trang nào đụng tới thì đổi trang đó" như phần Hệ quả ở trên.

## Bổ sung: hàng tab + hàng tiến độ — M125 (2026-09-21)

Trang chủ trước M125 xếp dọc 15 khối với 5 kiểu lưới khác nhau (2/4, 2/3/4/5, 2/3/6,
1/2/4, bảng): mắt không bám được nhịp và phải cuộn ~6 màn hình mới tới bảng trễ — thứ PM
cần nhất mỗi sáng. M125 sắp xếp lại theo khuôn **toolbar → dải số liệu → thân 2 cột**
(đặc tả: `docs/nang-cap/M125-bo-cuc-trang-chu.md`) và bổ sung 2 component nền:

| Component                         | Vai trò                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Tabs` (+ `TabPanel`) trong `ui/` | Hàng tab gom nhiều khối cùng chủ đề vào **một thẻ**; chỉ mount tab đang mở nên panel nặng không tự fetch khi chưa ai xem                               |
| `ProgressRow` (`app/components/`) | Hàng "tên · thanh tiến độ · % · chip trạng thái" dùng chung cho mọi danh sách tiến độ (trang tracking, hệ thi công) — thay các lưới thẻ ngốn chiều dọc |

Ba quy ước hình thức kèm theo:

1. **Tab đang chọn dùng emerald** (`text-emerald-300` + `border-b-2 border-emerald-500`),
   đúng luật màu nhấn ở mục Quyết định — không dùng amber như `HubShell` đời đầu.
2. **Tab là trạng thái của URL**, không phải state ẩn: `?tab=<id>` để reload/chia sẻ link
   giữ nguyên cách nhìn (khuôn `HubShell`: state cục bộ + `router.replace`, `scroll: false`).
   Bàn phím ←/→ (kèm Home/End) đổi tab theo WAI-ARIA "tabs, automatic activation";
   roving tabindex nên Tab chỉ dừng ở tab đang chọn.
3. **Thứ gì là đường vào duy nhất tới một trang thì không giấu sau tab.** Danh sách hệ thi
   công giữ ngoài thẻ tab vì đó là lối vào duy nhất còn lại tới `/system/[code]` từ trang
   chủ (sidebar đã bỏ mục này) — giấu sau tab sẽ thành ngõ cụt điều hướng.

Khác M124 một điểm: **thanh đáy của trang chủ là `md:hidden`** (desktop đã có toolbar trên
với đủ bộ nút). `AppHeader` chỉ tự ẩn thanh đáy dưới `md` khi trang **không** truyền
`bottomActions`, nên trang chủ chỉ truyền bộ nút khi màn hẹp (`matchMedia`) thay vì sửa
`AppHeader`.

## Bổ sung: DocShell cho `/claims`, `/variations`, `/contracts` — M126 (2026-09-21)

Đóng non-goal của M124: 3 trang tài chính còn lại (mẫu "bảng + Modal") chuyển sang master–detail
cùng khuôn `/payment-certs` (đặc tả: `docs/nang-cap/M126-docshell-contracts-variations-claims.md`).
Không thêm component nền mới — dùng lại `DocToolbar`/`DocField`/`DocTotals`/`Kbd`/`Chip`/`Tabs`
của M124/M125. Modal **tạo mới** của cả 3 trang giữ nguyên nội dung (e2e neo text/label/aria vào
đó), chỉ tách file sang `_components/Add<X>Modal.tsx`.

Hai điểm khác biệt đáng ghi lại cho lần áp DocShell tiếp theo:

1. **Bản ghi soft-delete không mở chứng từ.** `/contracts` và `/claims` có xoá mềm + khôi phục;
   khi đang xem danh sách "đã xoá", chọn một dòng chỉ hiện nút Khôi phục ở hàng đó (không phải
   trong chứng từ) và cột phải hiện `EmptyState` nhắc khôi phục trước — tránh vừa vi phạm
   "chứng từ đã xoá không sửa được" vừa phải giấu code chết trong `CertDocument`-tương-tự.
2. **StatCard/segmented-filter phải render trước danh sách trong DOM khi e2e dùng `.first()`
   không scope.** `/variations` có 4 StatCard tên trùng với nhãn trạng thái ("Nháp"/"Đã trình"…)
   cũng xuất hiện trong `Chip` của từng dòng — giữ đúng thứ tự DOM (StatCard trước) để không vỡ
   `getByText(...).first()` của spec cũ.

Cả 3 trang giữ nguyên toàn bộ lời gọi API cũ; chỉ `/variations` nâng cách tính giá trị quyết định
trong `decide()` từ cộng dồn float JS sang `mMul/mSumBy` (cùng chuẩn tiền M45 PR1).

## Bổ sung: Trang chủ 2 chế độ + `Select` — M127 (2026-09-22)

`/` tách 2 chế độ theo vai trò (đặc tả `docs/nang-cap/M127-trang-chu-theo-vai-tro.md`):
`app/components/home/HomeDieuHanh.tsx` (bố cục M125 cho quản lý) và `HomeHienTruong.tsx`
("việc của tôi hôm nay" cho kỹ sư/thầu phụ) — `resolveHomeMode` (`app/lib/homeMode.ts`) chọn
mặc định theo vai trò (`subcon` luôn Hiện trường, `engineer` nhớ lựa chọn qua
`localStorage("xboss_home_mode")`, các vai trò còn lại luôn Điều hành) và chỉ kỹ sư có nút
chuyển qua lại. Bốn quy ước hình thức mới:

1. **`ui/Select`** thay `<select>` viết tay ở bộ lọc bảng trễ: cùng khuôn control của ADR này
   (`rounded-lg`, `min-h-10`, viền `zinc-700`, focus `emerald-500`), props `value/onChange(string)/
options: {v,l}[]`.
2. **Dải `StatCard` 5 cột** (`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, co còn 4 cột khi
   ẩn thẻ "Chờ duyệt" — vai trò không có quyền duyệt) thêm 2 thẻ mới so với M125: "Tiến độ tổng"
   mang `badge` Chip Δ so với tuần trước (`weekDelta`, tone success/danger theo dấu, ẩn khi
   `null`), và "Đến hạn ≤N ngày" (`dueSoon`, tone warning khi > 0) — N đọc từ `alert_rules`, không
   hard-code.
3. **`HomeRail` đổi thứ tự** Pareto (nếu có dữ liệu) → Trung tâm điều hành → Vòng đời (trước là
   rail cố định 320px với Vòng đời cắt lên đầu). Dải "Vòng đời" **`flex flex-wrap` xuống dòng**,
   **không** `overflow-x-auto` cuộn ngang — hàng chip `nowrap` cuộn ngang từng làm Chrome mobile
   nới layout viewport theo bề rộng max-content (~984px), thu nhỏ toàn trang và làm e2e drawer bấm
   lệch phần tử (sự cố thật, xem commit `df9d6939`, M127 việc 2). Bài học chung: **chip xếp hàng
   trong trang chủ/hub luôn `flex-wrap`, không `overflow-x-auto`** trừ khi hàng đó chắc chắn không
   bao giờ chạm mép viewport thật (vd tab cố định số lượng ít).
4. Chế độ Hiện trường **không** import panel nặng (recharts) và chỉ gọi API mà thầu phụ được
   phép (`/api/my-tasks`, `/api/notifications`, `/api/sheets`, `/api/project`) — trang phải mở
   nhanh trên điện thoại sóng yếu; dữ liệu "việc hôm nay" tái dùng `ProgressRow`/`Chip` sẵn có,
   không tự vẽ danh sách kiểu mới.
