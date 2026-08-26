# M106 — Đặc tả Hộp thoại WPF cho toàn bộ lệnh plugin + Trình dẫn quy trình

| Thuộc tính       | Giá trị                                                                                                                                                                                     |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Issue / Goal     | Kỹ sư **chỉ dùng chuột**: mọi lệnh `XBOSS_*` có hộp thoại WPF trực quan thay cho chuỗi hỏi đáp keyword ở dòng lệnh, và một **trình dẫn quy trình** chỉ rõ đang ở bước nào, tiếp theo làm gì |
| Spec owner       | Seeker / Chief Engineering Architect                                                                                                                                                        |
| State            | **Approved for implementation** (người dùng chốt 2026-08-26: "thêm hộp thoại wpf đi, làm cho tất cả để trực quan hơn, sắp xếp quy trình cho đúng")                                          |
| Người/ngày duyệt | Seeker / 2026-08-26                                                                                                                                                                         |
| Cập nhật         | 2026-08-26                                                                                                                                                                                  |
| Phụ thuộc        | M102 (Ribbon + `LenhCatalog` + bảng điều khiển), M103 (`DeXuatBlockDialog` — mẫu hộp thoại mỏng + quy tắc ở Core), M99/M100/M105 (26 lệnh hiện có)                                          |

> **Đảo một quyết định cũ, có chủ đích.** M102 §1 ghi "hộp thoại WPF thay prompt của từng lệnh" là
> **ngoài phạm vi chủ đích** vì "đổi hành vi lệnh — không phải việc của lớp vỏ UI". Người dùng chốt
> ngày 2026-08-26 rằng trực quan quan trọng hơn ràng buộc đó. M106 thay thế mục "ngoài phạm vi" ấy
> **nhưng giữ nguyên nguyên tắc lõi**: hộp thoại chỉ THU THẬP tham số; mọi nghiệp vụ vẫn nằm trong
> lệnh và Core. Không có đường nghiệp vụ thứ hai.

---

## 1. Vấn đề, vai trò và bằng chứng

- **Kỹ sư mới / kỹ sư hiện trường:** 26 lệnh, mỗi lệnh 2–6 câu hỏi keyword nối tiếp trên dòng lệnh
  (`XBOSS_VE`: hệ → loại tuyến → size → độ dốc → bề rộng biên; `XBOSS_VE_CHIADOT`: phạm vi → kiểu
  nối). Không thấy trước mình sắp chọn gì, chọn sai phải ESC chạy lại từ đầu, và **không xem được
  danh mục** (size nào có trong rule pack, kiểu nối nào hợp lệ) trước khi quyết.
- **Không ai biết thứ tự đúng:** 26 lệnh nằm phẳng trên Ribbon theo nhóm kỹ thuật, không nói lên
  **trình tự vòng đời bản vẽ**. Kỹ sư mới hay chạy `XBOSS_BOCKL` trước khi chuẩn hóa, hoặc quên
  `XBOSS_VE_NEN` trước khi vẽ, hoặc upload khi chưa chạy kiểm tra — mỗi lỗi tốn một vòng làm lại.
- **Bằng chứng trong repo:** `VeTuyenCommands.cs` — 5 câu hỏi liên tiếp, mỗi câu một `PromptKeywordOptions`,
  có lối `DOIHE` để quay lại chỉ vì không sửa được lựa chọn đã trót chọn. `M102-plugin-ui.md` §1 tự
  nhận bảng điều khiển "chỉ ĐỌC".

## 2. Outcome, metric và guardrail

- **Target:** 100 % lệnh có tham số chạy trọn bằng chuột; kỹ sư mới hoàn thành vòng đời chuẩn hóa →
  vẽ → bóc → upload mà không cần nhớ tên lệnh nào; mọi lựa chọn sai bị **chặn tại hộp thoại** kèm
  lý do tiếng Việt (không để lệnh chạy rồi mới báo lỗi).
- **Guardrail (bất biến, không được vi phạm):**
  1. **Hộp thoại chỉ thu thập tham số.** Không đọc/ghi `Database`, không mở `Transaction`, không gọi
     mạng. Nhận dữ liệu đã đọc sẵn, trả về một bản ghi tham số thuần.
  2. **Mọi quy tắc kiểm hợp lệ nằm ở Core, có test** (mẫu `BlockDeXuatRules` của M103). Hộp thoại
     chỉ hiển thị kết quả kiểm — cùng bộ quy tắc mà lệnh dùng, nên không bao giờ cho bấm OK thứ mà
     lệnh sẽ từ chối.
  3. **Đường dòng lệnh KHÔNG bị bỏ.** Mỗi lệnh giữ chế độ hỏi đáp cũ để chạy được trong script/batch
     và khi UI không dựng được (xem FR9). Hộp thoại là lối vào mặc định, không phải lối duy nhất.
  4. Không đổi tên lệnh, không đổi nghiệp vụ, không đổi kết quả vẽ ra bản vẽ.
- **Rollback:** biến môi trường/registry `XBOSS_UI_DIALOG=0` (hoặc lỗi dựng UI) → mọi lệnh tự rơi về
  hỏi đáp dòng lệnh như hiện nay.

## 3. Nghiên cứu hiện trạng

| Thứ đã có                                          | Vai trò với M106                                                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `XBoss.Cad.Acad/Ui/DeXuatBlockDialog.cs` (M103)    | **Mẫu đúng**: hộp thoại mỏng + `BlockDeXuatRules` ở Core có test. Nhưng viết bằng **WinForms** — M106 chuyển sang WPF cho nhất quán (xem §4) |
| `XBoss.Cad.Acad/Ui/RibbonBuilder.cs` (M102)        | Dựng Ribbon từ `LenhCatalog`; M106 thêm panel "Quy trình" và gắn nút mở trình dẫn                                                            |
| `XBoss.Cad.Acad/Ui/BangDieuKhienPalette.cs` (M102) | PaletteSet chỉ-đọc; M106 **nâng cấp thành trình dẫn quy trình** (đọc trạng thái + nút hành động từng bước)                                   |
| `XBoss.Cad.Core/Ui/LenhCatalog.cs`                 | Nguồn sự thật của Ribbon; M106 thêm **thứ tự bước quy trình** vào đây (một nguồn duy nhất, có test canh)                                     |
| `XBoss.Cad.Acad/XBoss.Cad.Acad.csproj`             | Đã bật cả `UseWindowsForms` và `UseWPF` → không phải đổi hạ tầng build                                                                       |
| `XBoss.Cad.Tests` chỉ tham chiếu **Core**          | ⇒ Mọi thứ cần test phải nằm ở Core. Adapter/XAML không có test tự động — đây là ràng buộc thiết kế chính                                     |

## 4. Phương án

| Phương án                                                                                               | Lợi ích                                     | Chi phí/rủi ro                                                                   | Kết luận |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| Không làm                                                                                               | 0                                           | Kỹ sư mới vẫn phải thuộc lệnh; sai thứ tự tốn vòng làm lại                       | Loại     |
| A. Giữ WinForms (theo `DeXuatBlockDialog` sẵn có)                                                       | Không thêm công nghệ                        | Người dùng yêu cầu WPF; WinForms yếu về DPI scaling và theming trên AutoCAD 2026 | Loại     |
| B. WPF cho lệnh mới, giữ WinForms cho `XBOSS_VE_DEXUAT`                                                 | Ít việc hơn                                 | Hai công nghệ UI trong một plugin — người sau không biết theo cái nào            | Loại     |
| **C. WPF cho TẤT CẢ (chuyển luôn `DeXuatBlockDialog`), khung hộp thoại chung + ViewModel thuần ở Core** | Một công nghệ, một khung, quy tắc test được | Phải chuyển 1 hộp thoại cũ; XAML không test tự động được                         | **Chọn** |

**Vì sao ViewModel nằm ở Core:** `XBoss.Cad.Tests` chỉ tham chiếu Core. Đặt trạng thái hộp thoại
(danh sách lựa chọn, giá trị đang chọn, thông điệp lỗi, nút OK bật/tắt) trong lớp ViewModel **thuần
.NET, không tham chiếu WPF/AutoCAD** ở `XBoss.Cad.Core/Ui/` thì **test được toàn bộ hành vi hộp
thoại** mà không cần AutoCAD. XAML chỉ còn là lớp vẽ mỏng bind vào ViewModel.

## 5. Scope / non-goals

**Trong phạm vi:**

1. Khung hộp thoại WPF chung (`XBossDialog` — cửa sổ nền, nút OK/Hủy, vùng thông báo lỗi, theme
   bám `MauBang`, hỗ trợ DPI, phím tắt Enter/Esc, nhớ vị trí).
2. **Hộp thoại cho mọi lệnh có tham số** (bảng đầy đủ ở §7.2 — 18 lệnh; 8 lệnh không tham số giữ
   nguyên chạy thẳng).
3. **Trình dẫn quy trình** (`XBOSS_BANG` nâng cấp): 6 giai đoạn theo vòng đời bản vẽ, mỗi giai đoạn
   hiện trạng thái (xong / chưa / không áp dụng) + nút bấm chạy đúng lệnh của bước đó.
4. Panel "Quy trình" trên Ribbon + sắp lại thứ tự nút trong các panel theo trình tự dùng thật.
5. Chuyển `DeXuatBlockDialog` (M103) từ WinForms sang WPF theo khung chung.

**Non-goals:** đổi nghiệp vụ/kết quả vẽ của bất kỳ lệnh nào; bỏ đường hỏi đáp dòng lệnh; icon
bitmap riêng cho Ribbon (giữ nút chữ như M102); hộp thoại cho `XBOSS_BATCH` chạy nền dài (giữ
progress hiện có); dịch UI sang ngôn ngữ khác tiếng Việt; test tự động cho XAML.

## 6. Quy trình chuẩn — 6 giai đoạn (đây là phần "sắp xếp quy trình cho đúng")

Trình tự dưới đây là **vòng đời một bản vẽ shop drawing** trong XBoss, rút từ M99 §6 + M100 §6.1 +
M105. Trình dẫn hiển thị đúng thứ tự này; Ribbon sắp nút theo đúng thứ tự này.

| #   | Giai đoạn            | Lệnh (theo thứ tự dùng)                                                                                            | Điều kiện vào bước   | Dấu hiệu "đã xong"                               |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- | ------------------------------------------------ |
| 1   | **Kết nối**          | `XBOSS_LOGIN` → `XBOSS_RULEPACK`                                                                                   | luôn                 | có token thiết bị + rule pack nạp được           |
| 2   | **Chuẩn hóa nền**    | `XBOSS_KIEMTRA` → `XBOSS_CHUANHOA` → (`XBOSS_BATCH` nếu nhiều tệp)                                                 | đã có rule pack      | sidecar `.xboss-kiemtra.json` không còn lỗi chặn |
| 3   | **Vẽ shop drawing**  | `XBOSS_VE_NEN` → `XBOSS_VE` → `XBOSS_VE_NHAN` → `XBOSS_VE_PHUKIEN` → `XBOSS_VE_THIETBI` → (`XBOSS_VE_DOI` khi sửa) | nền đã chuẩn hóa     | có tuyến mang XData của `XBOSS_VE`               |
| 4   | **Chi tiết chế tạo** | `XBOSS_VE_CHIADOT` → `XBOSS_VE_GIADO` → `XBOSS_VE_LOCHO` → `XBOSS_VE_TAG`                                          | đã có tuyến          | tuyến mang dấu chia đốt / giá đỡ / tag           |
| 5   | **Hồ sơ bản vẽ**     | `XBOSS_VE_MATCAT` → `XBOSS_VE_THONGKE` → `XBOSS_VE_TRANGIN` → `XBOSS_VE_BAOCAO`                                    | đã có tuyến          | có layout trang in + bảng thống kê               |
| 6   | **Bóc & nộp**        | `XBOSS_BOCKL` → `XBOSS_BOCKL_XUAT` → `XBOSS_UPLOAD`                                                                | bước 2 sạch lỗi chặn | sidecar `-takeoff.json` + upload trả về revision |

Lệnh phụ trợ không thuộc dòng chảy chính (dùng khi cần): `XBOSS_BOCKL_XOA` (sửa sai ở bước 6),
`XBOSS_VE_THUVIEN` / `XBOSS_VE_DEXUAT` (quản thư viện block), `XBOSS_BANG` (chính trình dẫn).

**Quy tắc hiển thị của trình dẫn:** bước chưa đủ điều kiện thì nút **mờ kèm lý do** ("chưa nạp rule
pack", "bản vẽ chưa có tuyến nào") — **không khóa cứng**: kỹ sư vẫn bấm được sau khi đọc cảnh báo,
vì có ca hợp lệ (mở lại bản vẽ cũ đã chuẩn hóa từ phiên trước). Đây là **hướng dẫn, không phải cổng
chặn** — chặn cứng thuộc về bản thân lệnh.

## 7. Functional requirements

### 7.1 Khung hộp thoại chung

- **FR1** `XBossDialog` (WPF `Window` trong Adapter) + `DialogViewModelBase` (Core, thuần .NET):
  tiêu đề = tên lệnh + nhãn tiếng Việt; vùng nội dung; dải nút OK/Hủy; **vùng lý do** hiện thông
  điệp tiếng Việt khi chưa hợp lệ. Enter = OK (khi hợp lệ), Esc = Hủy.
- **FR2** **Nút OK khóa khi chưa hợp lệ**, kèm lý do cụ thể ngay dưới form (mẫu `DeXuatBlockDialog`).
  Quy tắc hợp lệ do ViewModel ở Core quyết, dùng **cùng** hàm kiểm mà lệnh gọi.
- **FR3** Hộp thoại mở bằng `Application.ShowModalWindow` của AutoCAD (đúng chủ cửa sổ, không lạc
  ra sau bản vẽ). Mọi hỏi đáp/hiển thị nằm **NGOÀI transaction** — giữ nguyên luật M100 §6.11.
- **FR4** Ghi nhớ lựa chọn gần nhất trong phiên (`VeContext` đang giữ hệ/size/độ dốc — dùng lại,
  không tạo cơ chế nhớ thứ hai).
- **FR5** Danh mục hiển thị **đúng những gì rule pack khai** (size, kiểu nối, hệ, loại tuyến, khổ
  giấy…), kèm ô "nhập tay" ở nơi rule pack cho phép giá trị ngoài danh mục (`custom`) — hiện cảnh
  báo vàng ngay tại hộp thoại, không đợi đến báo cáo.
- **FR6** Hộp thoại phải hiện **thông tin quyết định**: với `XBOSS_VE_CHIADOT` là chiều dài đốt tối
  đa/khe/chế độ chia của kiểu nối đang chọn và **số đốt dự kiến**; với `XBOSS_VE` là bề rộng biên
  suy ra từ size; với `XBOSS_VE_GIADO` là khoảng cách giá đỡ. Tính bằng hàm Core sẵn có, không tính
  lại trong UI.

### 7.2 Bảng hộp thoại theo lệnh (18 lệnh có tham số)

| Lệnh               | Nội dung hộp thoại                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `XBOSS_LOGIN`      | URL server, email, mật khẩu, ghi nhớ thiết bị                                                                                                  |
| `XBOSS_RULEPACK`   | Version muốn nạp (danh sách từ cache/server), nút xem tóm tắt rule pack                                                                        |
| `XBOSS_UPLOAD`     | Bản vẽ đích (mã/số), rev, ghi chú; hiện sidecar nào sẽ gửi kèm                                                                                 |
| `XBOSS_KIEMTRA`    | Chọn nhóm phép kiểm, mức độ (chỉ báo / đầy đủ)                                                                                                 |
| `XBOSS_CHUANHOA`   | Chọn bước chuẩn hóa sẽ chạy (checkbox theo danh mục bước), chế độ chỉ-báo                                                                      |
| `XBOSS_BATCH`      | Thư mục, mẫu tên tệp, các bước áp dụng                                                                                                         |
| `XBOSS_BOCKL`      | Phạm vi (cả bản vẽ / vùng chọn), hệ cần bóc                                                                                                    |
| `XBOSS_BOCKL_XOA`  | Phạm vi gỡ dấu bóc                                                                                                                             |
| `XBOSS_BOCKL_XUAT` | Đường dẫn tệp Excel, tùy chọn đối chiếu BOQ                                                                                                    |
| `XBOSS_VE_NEN`     | Mức làm mờ nền, có khóa layer nền không                                                                                                        |
| `XBOSS_VE`         | Hệ → loại tuyến → size (danh mục + nhập tay) → độ dốc (khi bắt buộc) → bề rộng biên. **Một form, sửa qua lại tự do** — thay 5 câu hỏi nối tiếp |
| `XBOSS_VE_NHAN`    | Nội dung nhãn (size/độ dốc/cả hai), cao chữ, phía đặt                                                                                          |
| `XBOSS_VE_DOI`     | Hệ/size mới, cảnh báo sẽ gỡ dấu bóc và xóa vạch chia đốt                                                                                       |
| `XBOSS_VE_PHUKIEN` | Loại phụ kiện (từ thư viện block), cỡ, hướng                                                                                                   |
| `XBOSS_VE_THIETBI` | Thiết bị (thư viện), giá trị attribute                                                                                                         |
| `XBOSS_VE_DEXUAT`  | **Chuyển từ WinForms sang WPF**, giữ nguyên trường và `BlockDeXuatRules`                                                                       |
| `XBOSS_VE_CHIADOT` | Phạm vi (chọn tay / cả hệ), kiểu nối (tự chọn theo cỡ = mặc định, hoặc ghi đè), **xem trước số đốt + chiều dài từng đốt** trước khi bấm OK     |
| `XBOSS_VE_GIADO`   | Khoảng cách (mặc định theo rule pack), có đặt tại phụ kiện nặng không                                                                          |
| `XBOSS_VE_LOCHO`   | Loại sleeve, dung sai, có sinh bảng builder's work không                                                                                       |
| `XBOSS_VE_TAG`     | Tiền tố tag, số bắt đầu, phạm vi                                                                                                               |
| `XBOSS_VE_THONGKE` | Loại bảng (thiết bị / khối lượng / **chia đốt**), vị trí đặt                                                                                   |
| `XBOSS_VE_MATCAT`  | Tỉ lệ, cao độ trần/sàn, tên mặt cắt                                                                                                            |
| `XBOSS_VE_TRANGIN` | Khổ giấy, tỉ lệ, khung tên, thông tin khung tên                                                                                                |

Lệnh **không tham số** chạy thẳng, không hộp thoại: `XBOSS_VE_BAOCAO`, `XBOSS_VE_THUVIEN`,
`XBOSS_BANG`.

### 7.3 Trình dẫn quy trình

- **FR7** `XBOSS_BANG` mở PaletteSet gồm 2 phần: **(a)** trạng thái hiện có của M102 (server, thiết
  bị, rule pack, bản vẽ, sidecar) và **(b)** _mới_ — 6 giai đoạn §6, mỗi giai đoạn một khối: tên
  bước, trạng thái (✓ xong / ○ chưa / – không áp dụng) + **nút chạy từng lệnh trong bước**.
- **FR8** Trạng thái từng bước suy từ dữ liệu **đã có sẵn**: token/rule pack (M102 `TrangThaiGom`),
  sidecar JSON cạnh DWG, XData trên bản vẽ (có tuyến chưa, có dấu chia đốt/giá đỡ/tag chưa, đã bóc
  chưa). Hàm suy trạng thái nằm ở **Core, có test** — không rải điều kiện trong UI.
- **FR9** **Fallback bắt buộc:** UI không dựng được (thiếu `AdWindows`, chạy trong Core Console,
  biến `XBOSS_UI_DIALOG=0`) → mọi lệnh quay về hỏi đáp dòng lệnh **y như hiện nay**, in một dòng
  thông báo. Không lệnh nào được chết vì UI.
- **FR10** `LenhCatalog` khai thêm `Buoc` (1–6, hoặc `PhuTro`) và `ThuTuTrongBuoc` — **một nguồn sự
  thật** cho cả Ribbon, trình dẫn và tài liệu; có test canh mọi lệnh đều được xếp bước.

## 8. Acceptance criteria

- **AC1** Mọi lệnh trong bảng §7.2 mở được hộp thoại; bấm OK cho kết quả **giống hệt** đường hỏi đáp
  dòng lệnh với cùng tham số (đối chiếu bằng test ViewModel + verify tay).
- **AC2** Thiếu tham số bắt buộc → nút OK **khóa** + lý do tiếng Việt hiện ngay; không lệnh nào chạy
  rồi mới báo lỗi tham số.
- **AC3** `XBOSS_VE`: chọn hệ → loại tuyến → size trong **một form**, đổi qua lại tự do trước khi
  bấm OK; bề rộng biên hiện đúng theo size đang chọn.
- **AC4** `XBOSS_VE_CHIADOT`: hộp thoại hiện kiểu nối tự chọn theo cỡ, tham số của kiểu đó, và **số
  đốt + chiều dài từng đốt dự kiến**; đổi kiểu nối thì con số cập nhật ngay (gọi `JointSegmenter`).
- **AC5** `XBOSS_BANG` hiện đủ 6 giai đoạn đúng thứ tự §6; bước chưa đủ điều kiện có nút mờ + lý do,
  nhưng vẫn bấm được.
- **AC6** `XBOSS_UI_DIALOG=0` → mọi lệnh chạy đường dòng lệnh cũ, không lỗi.
- **AC7** `LenhCatalog`: mọi lệnh đều có `Buoc`; thứ tự nút trên Ribbon khớp `ThuTuTrongBuoc`; test
  canh CI đỏ nếu thêm lệnh mà quên xếp bước.
- **AC8** `DeXuatBlockDialog` chạy bằng WPF, giữ nguyên mọi trường và quy tắc `BlockDeXuatRules`;
  không còn tệp WinForms nào trong `Ui/`.
- **AC9** Toàn bộ ViewModel ở Core có test: danh sách lựa chọn dựng đúng từ rule pack, quy tắc khóa
  OK, giá trị mặc định, và ca "rule pack thiếu khai" phải cho lý do rõ chứ không văng lỗi.
- **AC10** `dotnet test` xanh toàn bộ (nền hiện tại 661 ca, số mới phải ≥ 661, Failed = 0).

## 9. Kiến trúc và điểm chạm code

| Tầng             | Tệp (dự kiến)                                            | Vai trò                                                             |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Core (test được) | `XBoss.Cad.Core/Ui/ViewModels/*.cs`                      | ViewModel từng lệnh: lựa chọn, mặc định, quy tắc khóa OK, xem trước |
| Core             | `XBoss.Cad.Core/Ui/QuyTrinh.cs`                          | 6 giai đoạn §6 + hàm suy trạng thái từng bước (FR8)                 |
| Core             | `XBoss.Cad.Core/Ui/LenhCatalog.cs` (sửa)                 | Thêm `Buoc` + `ThuTuTrongBuoc` (FR10)                               |
| Adapter (WPF)    | `XBoss.Cad.Acad/Ui/Wpf/XBossDialog.xaml(.cs)`            | Khung hộp thoại chung                                               |
| Adapter (WPF)    | `XBoss.Cad.Acad/Ui/Wpf/<Lenh>Dialog.xaml(.cs)`           | Lớp vẽ mỏng cho từng lệnh, bind ViewModel                           |
| Adapter          | `XBoss.Cad.Acad/Ui/BangDieuKhien*.cs` (sửa)              | Thêm phần trình dẫn quy trình                                       |
| Adapter          | `XBoss.Cad.Acad/Ui/RibbonBuilder.cs` (sửa)               | Sắp nút theo bước + panel "Quy trình"                               |
| Adapter          | `XBoss.Cad.Acad/Commands/*.cs` (sửa từng lệnh)           | Thay đoạn hỏi đáp bằng: thử hộp thoại → fallback dòng lệnh (FR9)    |
| Test             | `XBoss.Cad.Tests/ViewModel*Tests.cs`, `QuyTrinhTests.cs` | AC9, AC7                                                            |

## 10. Chia PR

1. **PR1 — nền:** `XBossDialog` + `DialogViewModelBase` + `QuyTrinh.cs` + `LenhCatalog.Buoc` +
   test; áp dụng thật cho **2 lệnh mẫu** (`XBOSS_VE` và `XBOSS_VE_CHIADOT` — một lệnh nhiều bước,
   một lệnh có xem trước) để chốt khung. `route: complex`.
2. **PR2 — trình dẫn quy trình:** `XBOSS_BANG` 6 giai đoạn + panel Ribbon "Quy trình" + sắp lại thứ
   tự nút. `route: complex`.
3. **PR3 — phủ nốt các lệnh còn lại** trong §7.2 theo khung PR1, gồm chuyển `DeXuatBlockDialog` sang
   WPF. `route: spec` (khung đã kín sau PR1).

**Cổng chung mọi PR:** `dotnet test` xanh (≥ 661 ca), `dotnet build` AcadShim xanh 0 warning, và ghi
bước verify tay vào `plugin-autocad/VERIFY-VA-PHAT-HANH.md` — **XAML không có test tự động**, nên
mỗi hộp thoại phải có dòng verify tay tương ứng trên máy có AutoCAD 2026.
