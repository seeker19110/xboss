# M119 — Thiết kế lại giao diện plugin AutoCAD

**Trạng thái:** ✅ CODE XONG (2026-08-30). Chỉ chạm lớp VẼ của plugin; không đổi nghiệp vụ, không
đổi API, không đổi lệnh nào.

## 1. Vì sao

Giao diện plugin lớn dần theo từng mốc M99→M118 mà **chưa có lượt thiết kế nào**: mỗi mốc thêm
nhãn/nút vào đúng chỗ dễ thêm nhất. Hệ quả đọc được ngay trên bảng XBoss (`XBOSS_BANG`):

1. **Không có ranh giới khối.** Cả hai tab vẽ nhãn nối nhãn thẳng lên nền phẳng; sáu bước quy trình
   và bốn khối trạng thái chỉ tách nhau bằng khoảng trắng, mắt phải tự gom nhóm.
2. **Nút "Làm mới" nằm trong vùng cuộn** — cuộn xuống bước 5-6 là mất hút, phải cuộn ngược lên.
3. **Nút phẳng chưa khai màu rê/nhấn.** `FlatStyle.Flat` mặc định vẽ trạng thái rê bằng màu hệ
   thống (xanh nhạt) → mảng sáng giữa bảng tối. Đúng lớp lỗi đã sửa cho hộp thoại WPF ở M106 PR4,
   còn sót ở WinForms.
4. **Hai tab tự dựng nhãn/nút riêng** (`TaoNhan`/`TaoNut` trùng nhau mỗi nơi một bản) nên cỡ chữ,
   lề và bộ màu đã bắt đầu trôi khỏi nhau.
5. **Hộp thoại lệnh không mang tên lệnh trong thân**, chỉ có ở thanh tiêu đề Windows — chữ nhỏ, sát
   mép, lẫn với chrome AutoCAD, trong khi kỹ sư mở liên tiếp 6-7 hộp thoại khác nhau.

## 2. Phạm vi

| Tệp                              | Thay đổi                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Ui/ThanhPhan.cs` (mới)          | Bộ thành phần dùng chung: nhãn 3 bậc, thẻ có vệt trạng thái, chip, nút 3 kiểu × 3 trạng thái, thanh hành động |
| `Ui/MauBang.cs`                  | Thêm 2 token mặt thẻ (`NenThe`, `VienThe`)                                                                    |
| `Ui/TrinhDanControl.cs`          | Mỗi bước = một thẻ (chip trạng thái + tên + dấu hiệu + hàng nút); thanh hành động dính đầu tab                |
| `Ui/BangDieuKhienControl.cs`     | Mỗi khối = một thẻ (mục/nội dung xếp 2 bậc, vệt cam khi có cảnh báo); thanh hành động dính đầu tab            |
| `Ui/Wpf/XBossDialog.xaml`        | Thêm dải tiêu đề lệnh + gạch phân cách; vùng thông điệp có vệt màu trái + ký hiệu ⛔/⚠/✓                      |
| `XBoss.Cad.AcadShim/AcadStub.cs` | Stub `FlatButtonAppearance`, `UseVisualStyleBackColor`, `MinimumSize`, `Height`/`Width` cho cổng CI           |

**Không đụng:** `XBoss.Cad.Core` (mọi quyết định nội dung vẫn ở `BangDieuKhienModel`/`QuyTrinh`,
1367 test giữ nguyên), danh mục lệnh, Ribbon, luồng nghiệp vụ.

## 3. Nguyên tắc thiết kế đã theo

- **Bám hệ có sẵn, không phát minh phong cách mới**: hai tông mặt (nền bảng / mặt thẻ) như ADR-0009;
  emerald = hành động chính; amber-đỏ chỉ dành cho cảnh báo.
- **Nền accent ĐẬM dần khi rê chuột**, không sáng dần (ADR-0010) — tái dùng đúng bộ
  `NutChinh`/`NutChinhRe`/`NutChinhNhan` đã tính tương phản ở M106.
- **Không truyền tải thông tin chỉ bằng màu**: mọi vệt màu đều đi kèm chip chữ hoặc ký hiệu
  (`✓ Đã xong` / `○ Chưa làm` / `– Không áp dụng`, `⚠`/`✓`/`•`, `⛔`/`⚠`/`✓`).
- **Hướng dẫn, không phải cổng chặn** (M106 §6): nút của bước chưa đủ điều kiện vẫn `Enabled`,
  chỉ đổi sang kiểu nút chìm — giữ nguyên hành vi cũ.
- **Nền tường minh cho mọi control**: trong PaletteSet, control con không kế thừa `BackColor`
  (sự cố AutoCAD 2026 ngày 2026-08-26).

## 4. Tiêu chí chấp nhận

- [x] Cổng CI `XBoss.Cad.AcadShim` biên dịch xanh toàn bộ Adapter.
- [x] `XBoss.Cad.Tests` 1367/1367 pass (Core không đổi hành vi).
- [x] XAML well-formed; không hardcode mã màu ngoài `MauBang.cs`.
- [ ] **Verify tay trên máy có AutoCAD 2026** (nợ chung với C9-C12): mở `XBOSS_BANG` xem hai tab,
      kéo rộng/hẹp palette, rê chuột lên mọi nút, mở một hộp thoại lệnh bất kỳ. Đây là thay đổi
      THUẦN HÌNH THỨC nên cổng stub không thay được mắt người.
