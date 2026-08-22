# ADR-0006: Chuẩn hóa bản vẽ bằng plugin AutoCAD (.NET) + pipeline server, bỏ hướng script .SCR/AutoLISP

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-08-22
- **Liên quan:** `docs/nang-cap/M99-plugin-autocad-chuan-hoa.md` (đặc tả tầng 2), `docs/nang-cap/M98-dxf-r2000-va-dwg.md` (tầng 3)

## Bối cảnh

Trang `/engineering/chuan-hoa-ban-ve` đang tự đọc/ghi DXF bằng TypeScript để chuẩn hóa bản vẽ 2D. Cách này đã lộ ra hai lớp lỗi thật:

1. **Bộ ghi DXF sinh tệp không mở được** — khai `$ACADVER = AC1015` (R2000, đòi handle + subclass marker + section `OBJECTS`) nhưng ghi thực thể kiểu R12. `ezdxf` báo `DXFStructureError`, recovery cũng chịu. Đã sửa bằng cách hạ xuống R12 (2026-08-22).
2. **`parseDwgBinary` không phải bộ đọc DWG** — quét chuỗi trong khối nhị phân, đoán layer bằng regex, **bịa toạ độ từ chỉ số mảng**, chỉ sinh `TEXT`/`INSERT`, không một đường nét hình học nào. Luồng convert DWG trả về bản vẽ trông hợp lệ nhưng nội dung là bịa.

Gốc chung của cả hai: **đang viết lại AutoCAD bằng TypeScript.** Mọi thao tác chuẩn hóa (đổi tên layer theo AIA, ép phẳng 2D, purge, sửa font TCVN3/VNI, lineweight/CTB, dim override) đều là chức năng gốc của AutoCAD.

Ràng buộc thực tế đã chốt với người dùng: **kỹ sư chạy AutoCAD full** (không phải LT, không phải CAD của hãng khác).

## Quyết định

Chia làm **2 tầng, bỏ hẳn tầng script**:

- **Tầng 2 — Plugin AutoCAD (.NET, C#)** chạy trên máy kỹ sư: làm toàn bộ việc _chạm vào bản vẽ_. Dùng chính API/lệnh của AutoCAD nên đọc/ghi DWG gốc, giữ nguyên dimension liên kết, MTEXT, xref, dynamic block. AutoCAD tự ghi tệp → không còn khả năng sinh tệp hỏng.
- **Tầng 3 — Pipeline server (TypeScript + `ezdxf` trong worker Python đã có)**: kiểm định thứ plugin tải lên, chạy hàng loạt không cần license, xuất DXF R2000, và phục vụ luồng chỉ có DXF.
- **Bỏ tầng 1 (`.SCR` + AutoLISP)**: chỉ có giá trị khi cần phủ AutoCAD LT / CAD hãng khác — điều kiện đó không tồn tại. Giữ thêm một đường thứ ba là thêm một bộ quy tắc nữa phải đồng bộ.

Ba nguyên tắc ràng buộc kiến trúc:

1. **Một nguồn quy tắc duy nhất.** XBoss phát hành **rule pack** có đánh version (ánh xạ layer AIA, bảng font TCVN3/VNI, chính sách purge, lineweight/CTB, quy tắc ép phẳng 2D). Plugin _tải_ rule pack chứ **không nhúng cứng** quy tắc; phiên bản rule pack được ghi vào hồ sơ mỗi lần chuẩn hóa. Không có điều này, plugin và server chắc chắn trôi khác nhau và cho ra hai kết quả khác nhau trên cùng bản vẽ.
2. **Client không được tin.** Plugin là phần mềm chạy trên máy người dùng → server **kiểm định lại** mọi thứ nhận vào trước khi ghi vào sổ bản vẽ. Plugin tải lên **DWG (bản giao nộp) kèm DXF sidecar (bản để server kiểm)** — nhờ vậy server không cần đọc DWG, **loại bỏ hẳn phụ thuộc ODA File Converter**.
3. **Không sửa bản vẽ một cách âm thầm.** Mọi thay đổi nằm trong **một nhóm UNDO duy nhất**, có chế độ _chỉ kiểm không sửa_, và luôn kèm báo cáo diff (đổi tên layer nào, ép phẳng bao nhiêu thực thể, sửa bao nhiêu chuỗi text, purge cái gì).

## Lý do

- Bài toán DWG **biến mất**: AutoCAD đọc/ghi DWG gốc; không cần ODA, không cần parse nhị phân.
- Câu hỏi R12/R2000 **không còn ở đường chính**: AutoCAD ghi tệp, kỹ sư lưu định dạng nào tuỳ ý. R2000 chỉ còn cần cho tầng 3.
- Không mất fidelity: dimension liên kết, MTEXT, xref, dynamic block giữ nguyên — điều bộ ghi TS không bao giờ đạt được.
- `LAYTRANS`, `FLATTEN`, `PURGE`, `OVERKILL`, `AUDIT` là công cụ gốc, đã đúng sẵn.
- Tầng 3 vẫn cần vì license AutoCAD desktop **cấm tự động hoá không người trực trên server** — chạy hàng loạt phía server phải là đường không dùng AutoCAD.

## Các phương án đã cân nhắc

- **Giữ nguyên pipeline TS làm đường chính:** phải tự viết bộ ghi R2000 (handle, `$HANDSEED`, con trỏ owner, subclass marker, 9 bảng bắt buộc, section `OBJECTS`, block `*D<n>` cho dimension) và bộ đọc DWG. Sai một chỗ là AutoCAD không mở — **chính lớp lỗi vừa xảy ra**. Loại làm đường chính, giữ làm tầng 3.
- **Tầng 1 `.SCR`/AutoLISP:** rẻ và phủ cả LT, nhưng người dùng chạy AutoCAD full nên không có lợi ích, mà lại thêm một bản sao quy tắc phải đồng bộ. **Loại.**
- **ODA File Converter trên server:** giải được DWG nhưng thêm nhị phân đóng ~200MB + điều khoản redistribution phải xin duyệt. Không cần nữa nhờ DXF sidecar. **Loại.**
- **Autodesk Platform Services (Design Automation, cloud):** chạy plugin không cần license cục bộ, nhưng **bản vẽ rời hạ tầng tự host** — cần CĐT duyệt. Để ngỏ cho tương lai nếu cần batch có AutoCAD.

## Hệ quả

- **Tích cực:** hết bài toán DWG; hết rủi ro sinh tệp hỏng; giữ nguyên fidelity; tái dùng công cụ gốc thay vì viết lại.
- **Đánh đổi / rủi ro:**
  - Thêm **stack thứ hai (C#/.NET, Windows)** và kênh phát hành riêng; cần build cho 2 nền: AutoCAD 2021–2024 (.NET Framework 4.8) và 2025+ (.NET 8).
  - **Rủi ro lớn nhất là trôi quy tắc giữa 2 tầng** → chống bằng rule pack có version (nguyên tắc 1) + test đối chứng chạy cùng bộ bản vẽ mẫu qua cả 2 tầng và so kết quả.
  - Cần **token API cho ứng dụng desktop** — chạm `lib/auth.ts`, thuộc vùng rủi ro cao trong `docs/audit.md`.
  - CI không chạy được test tích hợp plugin: GitHub Actions không có AutoCAD → cần runner tự host có license, hoặc chấp nhận test tích hợp chạy tay theo release.
- **Việc tiếp theo:** `docs/nang-cap/M99-plugin-autocad-chuan-hoa.md` (tầng 2) và thu hẹp `M98` còn đúng phạm vi tầng 3.
