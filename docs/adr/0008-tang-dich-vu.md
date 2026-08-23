# ADR-0008: Tầng dịch vụ `lib/dich-vu/` cho logic phối hợp nhiều miền

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-08-23
- **Nối tiếp:** ADR-0007 (chia `lib/` theo miền)

## Bối cảnh

ADR-0007 chia `lib/` thành các miền và bật cổng CI canh hướng phụ thuộc. Ngay khi bật,
cổng lộ ra một lớp vấn đề mà trước đó không ai thấy: **có những hàm không thuộc về miền nào**.

- `payrollFromAttendance()` nằm trong `lib/tai-chinh/finance.ts` nhưng cần chấm công từ
  `lib/hien-truong/hr.ts`. Đặt ở tài chính thì tài chính phải biết về hiện trường; đẩy sang
  hiện trường thì ngược lại. Kết quả: chu trình `hien-truong ↔ tai-chinh`, phải khai làm nợ
  trong `_baseline_cycles` vì không có chỗ nào đúng để đặt nó.
- `app/api/notifications/route.ts` dài **1.166 dòng**, trong đó một hàm
  `syncAndListNotifications()` chiếm ~1.080 dòng và import **hơn 20 miền**. Logic này không
  test đơn vị được (phải dựng HTTP request), không tái dùng được từ cron, và nằm ngoài mọi
  ranh giới mà ADR-0007 vừa dựng — vì nó nằm trong `app/`, không phải `lib/`.

Điểm chung: đây là logic **phối hợp** (orchestration), không phải logic của một miền.

## Quyết định

**Thêm `lib/dich-vu/` — tầng 5, trên tất cả các miền nghiệp vụ.** Nó được import xuống mọi
tầng thấp hơn; không miền nào được import ngược lên nó (cổng `check:lib-layers` canh).

Đặt vào `lib/dich-vu/` khi và chỉ khi hàm **cần từ hai miền nghiệp vụ trở lên**. Còn lại vẫn
ở đúng miền của nó — tầng này không phải chỗ chứa những gì lười phân loại.

**Route handler chỉ còn là ranh giới HTTP**: kiểm phiên/quyền, đọc tham số, gọi dịch vụ, bọc
`NextResponse`. Dịch vụ **không biết gì về HTTP** — trả dữ liệu thuần, không trả `NextResponse`.
Điều này không đổi ranh giới bảo mật: `getCurrentUser()` vẫn ở route đúng như CLAUDE.md yêu cầu.

Áp dụng trong đợt này:

- `lib/dich-vu/luong.ts` ← `payrollFromAttendance()`. **Chu trình `hien-truong ↔ tai-chinh`
  biến mất, `_baseline_cycles` đã xoá** — cổng nay xanh mà không còn miễn trừ nào.
- `lib/dich-vu/thong-bao.ts` ← `syncAndListNotifications()`. Route từ **1.166 → 47 dòng**.

## Lý do

- **Chu trình được phá bằng cách đảo hướng, không phải bằng cách chuyển file.** Chuyển hàm
  giữa hai miền chỉ đổi chiều mũi tên; thêm một tầng trên biết về cả hai, còn hai miền không
  biết về nhau, mới thật sự cắt được vòng.
- **Cổng CI được kiểm chứng bằng chính việc phá nợ nó chỉ ra.** Xoá `_baseline_cycles` rồi
  chạy lại: nếu chu trình chưa thật sự mất, cổng đỏ. Đây là bằng chứng chứ không phải khai báo.
- **Logic ra khỏi `app/` thì mới nằm trong hệ thống ranh giới.** Chừng nào 1.080 dòng còn ở
  trong route, ADR-0007 không chạm tới được nó.

## Các phương án đã cân nhắc

- **Truyền phụ thuộc vào bằng tham số (dependency injection):** `payrollFromAttendance(period,
fetchAttendance)`. Cắt được chu trình mà không thêm tầng. Loại bỏ vì nó đẩy việc "biết lấy
  chấm công ở đâu" lên mọi nơi gọi (route, cron, test) — nhân bản kiến thức phối hợp ra nhiều
  chỗ, đúng thứ tầng dịch vụ sinh ra để gom lại.
- **Gộp `hien-truong` và `tai-chinh` làm một miền:** chu trình biến mất theo định nghĩa. Loại
  bỏ vì đó là giấu vấn đề — hai miền này khác nhau về người dùng, quyền và nhịp thay đổi;
  gộp lại sẽ kéo theo việc gộp tiếp khi có cặp phụ thuộc chéo mới.
- **Để `syncAndListNotifications` nguyên trong route:** rẻ nhất, không rủi ro. Loại bỏ vì
  1.080 dòng logic nghiệp vụ trong route là lý do bộ test tích hợp phải gánh phần việc lẽ ra
  của test đơn vị (xem `docs/audit-kien-truc.md` §4.3).

## Hệ quả

- **Tích cực:** không còn chu trình nào giữa các miền và không còn miễn trừ trong cổng CI;
  logic thông báo test đơn vị được; route mỏng nên đọc ra ngay ranh giới bảo mật.
- **Đánh đổi:** thêm một tầng để hiểu, và có rủi ro `lib/dich-vu/` phình thành sọt rác nếu
  quy tắc "từ hai miền trở lên" không được giữ khi review.
- **Việc tiếp theo:** 24 file còn > 1000 LOC (nặng nhất `TrackingGrid.tsx` 94KB) và phần lớn
  trong ~500 route vẫn còn nghiệp vụ nằm trong handler — Đợt 4, áp cùng khuôn mẫu này.
