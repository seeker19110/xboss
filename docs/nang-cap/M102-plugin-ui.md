# M102 — Giao diện UI plugin AutoCAD: tab Ribbon + bảng điều khiển

| Thuộc tính     | Giá trị                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal   | Plugin M99/M100/M101 có đủ 23 lệnh nhưng thuần command line — kỹ sư mới phải thuộc lòng tên lệnh. Thêm lớp UI trong AutoCAD. |
| State          | ✅ **Đã triển khai** (2026-08-25) — người dùng yêu cầu "làm tất cả những thứ cần thiết và nâng cao kịch trần toàn bộ"        |
| Quyết định nền | ADR-0006 + M99 §9.1 kế thừa nguyên vẹn. UI chỉ là lớp VỎ: mọi nghiệp vụ vẫn nằm trong lệnh XBOSS_* — bấm nút = gõ lệnh.      |

## 1. Phạm vi (trần khả thi của kiến trúc hiện tại)

1. **Tab Ribbon "XBoss"** (`Autodesk.Windows`, AdWindows.dll): 5 panel theo nhóm nghiệp vụ —
   Kết nối / Chuẩn hóa / Bóc khối lượng / Vẽ shop drawing / Bảng điều khiển. Lệnh chính của mỗi
   nhóm là nút to; mọi nút có tooltip tiếng Việt (tên lệnh + mô tả + điều kiện rule pack).
   Bấm nút = `SendStringToExecute` đúng lệnh — không có đường nghiệp vụ thứ hai.
2. **Bảng điều khiển** — lệnh mới `XBOSS_BANG` (PaletteSet neo được, Guid cố định): trạng thái
   server/thiết bị đã ghép (Credential Manager), rule pack đang nạp (version, số quy tắc, số nhóm
   layer, cache hỏng thì hiện đúng lý do), bản vẽ hiện hành + tóm tắt 4 loại sidecar JSON cạnh DWG
   (`.xboss-kiemtra/-report/-takeoff/-ve.json`), nút hành động nhanh (Đăng nhập/Nạp rule pack) +
   nút Làm mới. Chỉ ĐỌC — không đụng bản vẽ, không gọi mạng.
3. **Chống trôi UI ↔ lệnh**: danh mục `LenhCatalog` (Core) là nguồn sự thật duy nhất; test đối
   chiếu nó với mọi `[CommandMethod]` trong mã Adapter — thêm/xóa lệnh mà quên UI là CI đỏ.

**Ngoài phạm vi (chủ đích):** icon bitmap riêng (nút chữ tiếng Việt rõ nghĩa hơn icon tự chế),
hộp thoại WPF thay prompt của từng lệnh (đổi hành vi lệnh — không phải việc của lớp vỏ UI),
context menu chuột phải.

## 2. Điểm chạm code

| Tầng    | Tệp                                         | Vai trò                                                                                                      |
| ------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Core    | `XBoss.Cad.Core/Ui/LenhCatalog.cs`          | Danh mục 24 lệnh (tên/nhãn/tooltip/nhóm/lệnh chính) — nguồn sự thật của Ribbon                               |
| Core    | `XBoss.Cad.Core/Ui/BangDieuKhien.cs`        | `BangDieuKhienModel` dựng khối trạng thái (thuần, test được) + `SidecarSummary` parse phòng thủ              |
| Adapter | `XBoss.Cad.Acad/Ui/RibbonBuilder.cs`        | Dựng tab từ catalog; ribbon chưa sẵn sàng thì chờ `ComponentManager.ItemInitialized`; idempotent theo Id tab |
| Adapter | `XBoss.Cad.Acad/Ui/TrangThaiGom.cs`         | Gom trạng thái thô (CredentialStore/RulePackStore/sidecar) — chỉ đọc                                         |
| Adapter | `XBoss.Cad.Acad/Ui/BangDieuKhienControl.cs` | WinForms UserControl vẽ đúng model Core, bảng màu tối bám AutoCAD                                            |
| Adapter | `XBoss.Cad.Acad/Ui/BangDieuKhienPalette.cs` | PaletteSet singleton, Guid cố định (AutoCAD nhớ vị trí neo)                                                  |
| Adapter | `XBoss.Cad.Acad/Commands/UiCommands.cs`     | `XBOSS_BANG` (CommandFlags.Session — mở được khi chưa có bản vẽ)                                             |
| Adapter | `XBoss.Cad.Acad/PluginExtension.cs`         | Gọi `RibbonBuilder.DangKy()` lúc nạp; ribbon lỗi không làm hỏng lệnh gõ tay                                  |
| Build   | `XBoss.Cad.Acad.csproj`                     | + tham chiếu `AdWindows.dll` (Private=false) + `UseWPF` (Ribbon xây trên WPF)                                |
| Shim    | `XBoss.Cad.AcadShim/AcadStub.cs`            | + stub `Autodesk.Windows` (Ribbon), `PaletteSet`, bộ control WinForms, `Font`, `SendStringToExecute`         |
| Test    | `XBoss.Cad.Tests/LenhCatalogTests.cs`       | Catalog ↔ `[CommandMethod]` khớp tuyệt đối; nhãn/tooltip không rỗng/không trùng; mỗi nhóm đúng 1 lệnh chính  |
| Test    | `XBoss.Cad.Tests/BangDieuKhienTests.cs`     | Model theo từng trạng thái; sidecar summary chạy trên JSON sinh từ chính lớp báo cáo thật                    |

## 3. Tiêu chí chấp nhận

- **AC1** Ribbon có tab "XBoss" đủ 5 panel/24 nút; NETLOAD lại không sinh tab trùng. ✅ (cơ chế; verify tay trên máy AutoCAD còn nợ như M100 §18)
- **AC2** Bấm nút chạy đúng lệnh, điều kiện chặn (đời AutoCAD/rule pack) vẫn do lệnh tự kiểm — UI không nhân đôi logic. ✅
- **AC3** `XBOSS_BANG` bật/tắt bảng; bảng hiện đúng 3 khối + cảnh báo màu cam khi thiếu đăng nhập/rule pack, kèm nút chạy lệnh khắc phục. ✅ (test model)
- **AC4** Sidecar hỏng/format lạ → bảng bỏ qua tệp đó, không sập. ✅ (test)
- **AC5** Thêm lệnh mới vào Adapter mà quên catalog → CI đỏ (`LenhCatalogTests`). ✅
- **AC6** Job `plugin-shim` biên dịch được toàn bộ mã UI trên Linux. ✅

**Còn nợ (chung với M99/M100/M101 — cần máy Windows có AutoCAD 2026):** verify tay Ribbon/palette
trên máy thật; đối chiếu chữ ký `AdWindows.dll` thật với stub (stub sai chữ ký = cổng xanh giả).
