# ADR-0007: Chia `lib/` theo miền, có tầng và cổng CI canh hướng phụ thuộc

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-08-23

## Bối cảnh

`lib/` đã lên 175 module `.ts` nằm phẳng cùng một cấp: `date.ts` và `money.ts` đứng cạnh
70 file `engineering-*` (24.665 LOC). Hệ quả đo được (xem `docs/audit-kien-truc.md`):

- `ls lib/` không cho biết hệ thống gồm những miền gì — muốn hiểu phải đọc từng file.
- Không có ranh giới nào, nên **mọi module import được mọi module**. Khi rà thực tế,
  đã có `lib/db/index.ts` phụ thuộc ngược lên module cấu hình, và các cặp miền phụ thuộc
  vòng tròn — không phải do ai cẩu thả, mà vì không có gì để va vào.
- Không tách được phần nào ra để test/tái dùng độc lập.

Dự án đang ở 222k LOC với ~500 route. Ở quy mô này, quy ước viết trong tài liệu mà không
có máy kiểm thì mục trong vài tuần — đúng bài học đã lặp lại nhiều lần trong `PROGRESS.md`.

## Quyết định

**1. Chia `lib/` thành các thư mục miền, mỗi miền mang một SỐ TẦNG** (`lib/layers.json`):

| Tầng | Thư mục                                                                                                            | Vai trò                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 0    | `lib/nen/`                                                                                                         | Tiện ích **thuần**, không chạm DB (date, money, roles…) |
| 1    | `lib/db/`                                                                                                          | Lớp truy cập DB (giữ nguyên vị trí cũ)                  |
| 2    | `lib/ha-tang/`                                                                                                     | Dịch vụ hạ tầng có chạm DB (feature-flags, projects…)   |
| 3    | `lib/bao-mat/`                                                                                                     | Xác thực, phân quyền, dấu vết kiểm toán                 |
| 4    | `lib/tien-do/` `lib/khoi-luong/` `lib/tai-chinh/` `lib/vat-tu/` `lib/hien-truong/` `lib/ky-thuat/` `lib/van-hanh/` | Các miền nghiệp vụ                                      |

**2. Luật hướng phụ thuộc:** một thư mục chỉ được import **xuống tầng thấp hơn**. Ngoại lệ
duy nhất: các miền nghiệp vụ (cùng tầng 4) được import chéo nhau — chúng vốn phải phối hợp
(tài chính cần khối lượng) — nhưng **không được tạo chu trình**.

**3. Luật được máy canh, không phải chỉ ghi trong tài liệu:** `npm run check:lib-layers`
(`scripts/check-lib-layers.ts`) chạy trong CI, đỏ khi có import sai hướng tầng hoặc chu trình
**mới** giữa các miền. Nợ chu trình cũ khai minh bạch trong `_baseline_cycles` của
`lib/layers.json` — cổng vẫn chặn cái mới, không giả vờ là đã sạch.

## Lý do

- **Ranh giới chỉ có nghĩa khi có thứ cưỡng chế nó.** Chia thư mục mà không có cổng CI thì
  sau vài PR, một module nền lại import ngược lên miền nghiệp vụ và cấu trúc quay về mặt phẳng
  cũ — chỉ khác là giờ nằm rải rác nên khó thấy hơn trước.
- **Luật được suy ra từ code thật, không áp từ trên xuống.** Bản đồ miền được chỉnh đi chỉnh lại
  cho tới khi số vi phạm còn 0 trên code hiện có: `roles.ts` (không có phụ thuộc nào) và
  `sheets.ts` (27 dòng, không import gì) được hạ xuống tầng nền; `projects.ts` (chỉ phụ thuộc
  db + request-context) xếp vào hạ tầng thay vì miền tiến độ. Nhờ vậy cổng bật lên là xanh ngay,
  không phải kèm theo một danh sách miễn trừ dài — thứ khiến cổng mất tác dụng ngay từ ngày đầu.
- **Chi phí một lần, trả bằng máy.** Việc di chuyển do codemod làm (2.481 import trong 861 file),
  được verify bằng typecheck + build + 1084 ca test với Postgres thật + 9/9 cổng mutation.

## Các phương án đã cân nhắc

- **Giữ nguyên `lib/` phẳng, chỉ viết quy ước trong CLAUDE.md.** Rẻ nhất, nhưng đây chính là
  hiện trạng đã dẫn tới vấn đề — quy ước không có máy kiểm thì không tồn tại.
- **Chia theo _loại kỹ thuật_ (`lib/services/`, `lib/utils/`, `lib/types/`).** Loại bỏ vì nó
  nhóm theo cái mà code _là_, chứ không theo cái mà code _nói về_: `utils/` sẽ lại thành một
  mặt phẳng 80 file trong 6 tháng, và không giúp trả lời "sửa nghiệm thu thì đụng những gì".
- **Chuyển sang monorepo, mỗi miền một package (`@xboss/tai-chinh`).** Cưỡng chế ranh giới mạnh
  nhất (không import được nếu không khai dependency). Loại bỏ vì ADR-0001 và ADR-0002 đã chọn
  hướng giữ stack tối giản, không thêm tầng công cụ; workspace + build đa package là chi phí vận
  hành thật cho một đội nhỏ. Có thể mở lại nếu đội đông lên.
- **Chỉ dùng `eslint no-restricted-imports` thay cho script riêng.** Loại bỏ vì eslint kiểm được
  hướng tầng nhưng **không** dò được chu trình giữa các miền (cần duyệt đồ thị), mà chu trình
  mới là thứ thật sự khoá cứng kiến trúc. Một cổng làm cả hai việc thì không lệch nhau.

## Hệ quả

- **Tích cực:** `ls lib/` giờ đọc ra được kiến trúc; biết ngay một thay đổi nằm ở tầng nào và
  được phép chạm gì; chu trình mới bị chặn tại CI thay vì phát hiện sau vài tháng.
- **Đánh đổi:** một diff rất rộng (861 file) làm `git blame` trên dòng import mất dấu — dùng
  `git log --follow` cho lịch sử file. Người đang có nhánh dở phải merge lại đường import.
- **Rủi ro đã chấp nhận:** đường dẫn trong các tài liệu mốc cũ (`docs/nang-cap/M<xx>-*.md`)
  **không** được sửa — chúng mô tả trạng thái tại thời điểm đó. Chỉ tài liệu sống được cập nhật.
- **Việc tiếp theo:** xoá `_baseline_cycles` khi Đợt 3 (tách tầng service) đảo được hướng
  phụ thuộc giữa `tai-chinh` và `hien-truong`.
