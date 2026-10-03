## Quy ước chung TypeScript của XBoss (lib/, scripts/)

Chỉ báo lỗi khi chỉ ra được kịch bản cụ thể (input/trạng thái → sai kết quả, lộ dữ liệu, crash). Không báo lỗi văn phong.

- **SQL**: mọi giá trị đi qua helper `lib/db` (`query`/`queryOne`/`run`/`insertId`) với placeholder `?` — cấm nối chuỗi/template literal để chèn giá trị. Đếm số `?` phải khớp đúng số tham số truyền vào (truyền cả mảng cho 1 `?` từng làm chết 43 file — TRAPS.md §4).
- **Ranh giới tầng `lib/` (ADR-0007, `lib/layers.json`)**: chỉ import xuống tầng thấp hơn (`nen` 0 → `db` 1 → `ha-tang` 2 → `bao-mat` 3 → các miền nghiệp vụ 4 → `dich-vu` 5); các miền tầng 4 import chéo được nhưng không tạo chu trình. Import nội bộ dùng alias `@/lib/<miền>/<module>`, không dùng đường dẫn tương đối. `lib/nen/` phải thuần, không chạm DB.
- **Ngày**: cột `DATE` là chuỗi `'YYYY-MM-DD'`; so sánh bằng so sánh chuỗi, mốc "hôm nay" lấy qua `todayISO()`/`daysFromTodayISO()` (`lib/nen/date.ts`, ép `Asia/Ho_Chi_Minh`). `new Date().toISOString().slice(0, 10)` hay `new Date()` tự tính ngày là lỗi lệch 1 ngày lúc 0h–7h sáng giờ VN.
- **Tiền**: NUMERIC được parse thành float JS → cấm cộng/nhân tiền trên `number`. Tổng/tích tiền làm trong SQL; buộc phải tính ở JS thì cast `::text` rồi dùng `lib/nen/money.ts` (`parseMoney`/`addMoney`/`mulRate`/`formatVnd`).
- **Đọc-sửa-ghi** trên cùng bản ghi phải trong `withTransaction` + `SELECT ... FOR UPDATE`; thao tác lặp lại (bấm 2 lần, offline queue gửi lại) không được sinh bản ghi trùng hay cộng dồn sai.
- **Fail-fast cấu hình**: biến môi trường bắt buộc khai trong schema `lib/nen/env.ts`; thiếu thì throw khi dùng, không âm thầm chạy với giá trị rỗng. Không log/trả về secret.
- **Không nuốt lỗi im lặng**: `catch {}` rỗng hoặc chỉ `return null` ở đường ghi dữ liệu phải có ít nhất `console.error`/log để còn dấu vết.
- TypeScript strict: tránh `any` không lý do; xử lý `null`/`undefined` khi truy cập kết quả `queryOne`.

### Quy ước dự án ưu tiên hơn luật chung

- Comment, thông báo lỗi, chuỗi giao diện viết **tiếng Việt** là đúng quy ước — không báo "nên viết tiếng Anh" hay "hardcode chuỗi".
- Không đề xuất thêm ORM, Supabase hay thư viện test khác (ADR-0001, ADR-0002).
