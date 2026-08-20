# CẨM NANG TỰ CHỮA LÀNH DỮ LIỆU BẢNG TÍNH & EXCEL/CSV (EXCEL DATA HEALING RECIPES)

Tài liệu này cung cấp các giải thuật và quy trình xử lý triệt để 10 loại dị tật bảng tính kinh điển trong ngành xây dựng khi người dùng tải file Excel/CSV lên XBoss.

---

## 1. MƯỜI DỊ TẬT EXCEL KINH ĐIỂN & GIẢI PHÁP TỰ CHỮA LÀNH

### Dị tật 1: Header Bị Xê Dịch Hoặc Chìm Dưới Dòng Tiêu Đề Dự Án

- **Hiện tượng:** File Excel có 3-5 dòng đầu là logo, tên dự án, tên chủ đầu tư, hoặc dòng trống; dòng tiêu đề cột (Header) nằm ở dòng thứ 6.
- **Giải thuật Tự chữa lành:**
  1. Quét 15 dòng đầu tiên của bảng tính.
  2. Đếm số lượng từ khóa tiêu chuẩn khớp với từ điển (`mã`, `tên`, `đơn vị`, `khối lượng`, `đơn giá`, `bắt đầu`, `kết thúc`).
  3. Dòng nào có số lượng từ khóa khớp cao nhất ($\ge 3$ cột) được tự động chọn làm Dòng Header. Mọi dòng phía trên được đưa vào `metadata.project_header`.

### Dị tật 2: Ô Gộp Ngang/Dọc (Merged Cells)

- **Hiện tượng:** Cột Tên hệ thống hoặc Gói thầu được gộp ô trải dài 20 dòng. Khi đọc thô, chỉ dòng đầu tiên có giá trị, 19 dòng sau bị `null`/rỗng.
- **Giải thuật Tự chữa lành (Forward Fill / Unmerge Propagation):**
  1. Duy trì con trỏ ngữ cảnh `current_group_context`.
  2. Khi gặp ô rỗng ở cột phân cấp WBS, tự động kế thừa giá trị không rỗng gần nhất ở phía trên.

### Dị tật 3: Ngày Tháng Dạng Hỗn Hợp (Hybrid Dates)

- **Hiện tượng:** Một cột ngày chứa đồng thời:
  - Số nguyên Excel Serial (`46254`)
  - Định dạng Việt Nam `20/08/2026`
  - Định dạng ISO `2026-08-20`
  - Định dạng có dấu chấm `20.08.2026`
  - Định dạng ngắn `20/8/26`
- **Giải thuật Tự chữa lành:**
  - Áp dụng hàm `healDateString()`:
    - Nếu là số nguyên $10000 \le N \le 100000 \rightarrow$ Tính $Epoch_{\text{1899-12-30}} + N \times 86400000\text{ms}$.
    - Nếu chứa `/` hoặc `.` hoặc `-` $\rightarrow$ Tách Regex, tự động phân giải $DD$ vs $MM$ (nếu một phần tử $> 12 \rightarrow$ phần tử đó là $DD$).
    - Chuẩn hóa đầu ra về chuỗi ISO `YYYY-MM-DD`.

### Dị tật 4: Số Tiền & Khối Lượng Viết Lẫn Ký Tự

- **Hiện tượng:** `"12.500.000 đ"`, `"12,500,000 VND"`, `"12.5 triệu"`, `"1.2 tỷ"`, `"- 500.000"`, `"12,5 m2"`.
- **Giải thuật Tự chữa lành:**
  - Áp dụng `healMoneyValue()`:
    - Phát hiện các từ khóa cấp số nhân: `triệu/tr` ($\times 10^6$), `tỷ/ty` ($\times 10^9$), `k/nghìn` ($\times 10^3$).
    - Tự động nhận diện dấu phân tách thập phân vs phân tách hàng nghìn dựa trên vị trí dấu chấm và dấu phẩy cuối cùng.
    - Lưu trữ giá trị BigInt tính theo đơn vị nhỏ (đồng $\times 100$) để ngăn ngừa sai số số thực dấu phẩy động (Floating point error).

### Dị tật 5: Lỗi Bảng Mã Tiếng Việt Cũ (TCVN3 / VNI-Windows)

- **Hiện tượng:** Bản vẽ CAD hoặc file Excel dự toán cũ xuất chữ dạng `B¶ng tiÕn ®é` (TCVN3) hoặc `Baûng tieán ñoä` (VNI).
- **Giải thuật Tự chữa lành:**
  - Sử dụng bảng tra ánh xạ 1-1 `TCVN3_TO_UNICODE_MAP` và `VNI_TO_UNICODE_MAP` kết hợp chuẩn hóa NFC Unicode.

### Dị tật 6: Ký Tự Rác Tàng Hình & Khoảng Trắng Lạ

- **Hiện tượng:** Người dùng copy từ bảng biểu trên Web hoặc PDF dính ký tự Zero-width space (`\u200B`), Non-breaking space (`\u00A0`), Byte order mark (`\uFEFF`) làm hỏng hàm so sánh chuỗi.
- **Giải thuật Tự chữa lành:**
  - Regex loại bỏ: `replace(/[\u200B\u200C\u200D\uFEFF]/g, "").replace(/\u00A0/g, " ")`.

### Dị tật 7: Mã Hiệu BOQ Viết Tự Do

- **Hiện tượng:** `a1,01`, `A1-01`, `a1_01`, `A1 . 01`, `a1 01`.
- **Giải thuật Tự chữa lành:**
  - Chuyển `toUpperCase()`, thay toàn bộ khoảng trắng, dấu phẩy, gạch dưới bằng dấu chấm đơn: `A1.01`.

### Dị tật 8: Dòng Trùng Lặp (Duplicate Rows)

- **Hiện tượng:** Người dùng copy paste thừa nhiều dòng công việc có cùng mã BOQ và nội dung.
- **Giải thuật Tự chữa lành:**
  - Nhóm theo Khóa tự nhiên `(boq_code, sheet_slug)`.
  - Giữ lại dòng có đầy đủ thông tin nhất (nhiều trường có giá trị nhất), ghi nhận cảnh báo dedup trong log import.

### Dị tật 9: Cột Tên Header Đặt Tự Do Không Theo Mẫu

- **Hiện tượng:** Cột tên công việc được đặt là `Hạng mục thi công`, `Diễn giải công tác`, `Nội dung`, `Tên CV`.
- **Giải thuật Tự chữa lành:**
  - Sử dụng Ma trận Từ đồng nghĩa `DEFAULT_EXCEL_HEADER_SYNONYMS` kết hợp thuật toán tính độ tương đồng Jaro-Winkler để tự động map vào trường chuẩn `task_name`.

### Dị tật 10: Tỷ Lệ Tiến Độ Nhập Đa Dạng (0..1 vs 0..100)

- **Hiện tượng:** Dòng thì nhập `0.85`, dòng thì nhập `85` hoặc `85%`.
- **Giải thuật Tự chữa lành:**
  - Nếu giá trị $> 1.0$ và $\le 100 \rightarrow$ Tự động chia cho 100 để đưa về chuẩn $0.85$.
  - Nếu $> 100 \rightarrow$ Cảnh báo và giới hạn trần $1.0$ ($100\%$).
