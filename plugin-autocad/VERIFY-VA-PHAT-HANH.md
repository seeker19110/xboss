# Runbook: build → verify tay → phát hành plugin XBoss cho AutoCAD 2026

Dành cho người có **Windows + AutoCAD 2026 bản quyền**. Đây là phần duy nhất của cụm M99–M104
mà CI không thể tự kiểm (CI chỉ build/test `XBoss.Cad.Core` và biên dịch thử Adapter bằng stub).

Ba giai đoạn tách rời — làm hết A rồi mới sang B, xong B mới tới C.

---

## A. Chuẩn bị máy (làm 1 lần)

| Cần gì                                           | Kiểm bằng                                | Ghi chú                                                      |
| ------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------ |
| AutoCAD 2026 (bản đầy đủ)                        | Mở AutoCAD, `_ABOUT`                     | **AutoCAD LT không chạy được** — LT không hỗ trợ .NET plugin |
| .NET 10 SDK                                      | `dotnet --list-sdks` phải có dòng `10.*` | `winget install Microsoft.DotNet.SDK.10`                     |
| Git + repo                                       | `git clone` repo, `git checkout main`    |                                                              |
| Node 22 + Postgres (chỉ nếu chạy server tại chỗ) | `node -v`                                | Không bắt buộc cho giai đoạn B nếu dùng server đã deploy     |

**Không cần tải ObjectARX SDK riêng.** `dong-goi.ps1` mặc định lấy DLL tham chiếu ngay trong thư
mục cài AutoCAD: `C:\Program Files\Autodesk\AutoCAD 2026` (chứa `acdbmgd.dll`, `acmgd.dll`,
`accoremgd.dll`, `AdWindows.dll`). Cài chỗ khác thì truyền `-AcadDir`.

---

## B. Build + cài lên máy mình để verify

**Đóng AutoCAD trước** (DLL đang nạp thì không ghi đè được).

```powershell
cd <thư mục repo>
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1
# hoặc: pwsh -File plugin-autocad\dong-goi.ps1
# AutoCAD cài chỗ khác:  ... -AcadDir "D:\AutoCAD 2026"
```

Script sẽ: kiểm `acdbmgd.dll` trong `-AcadDir` → kiểm .NET 10 SDK → `dotnet build -c Release`
→ dựng `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle` (ghi `AppVersion` thật từ
`Directory.Build.props`, **không** chép 5 DLL do AutoCAD tự cung cấp).

Mở AutoCAD 2026 → dòng lệnh phải hiện `[XBoss] Plugin ... đã nạp` và có tab Ribbon **XBoss**.
Không thấy: xem mục E.

Gỡ cài: xoá thư mục `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle`.

---

## C. Verify tay — 26 lệnh, đi theo đúng thứ tự này

Mỗi mục ghi: **làm gì** → **đúng thì thấy gì**. Gặp lệch thì ghi lại lệnh + thông điệp + tệp
báo cáo JSON cạnh DWG rồi báo lại, đừng sửa bản vẽ để "cho qua".

### C0. Vỏ giao diện (M102)

1. `XBOSS_BANG` → hiện bảng neo được với **2 tab**: **Quy trình** (trình dẫn — verify ở C7) và
   **Trạng thái** với 4 khối: server/thiết bị, rule pack (version + số quy tắc), thư viện block,
   bản vẽ hiện hành + tóm tắt sidecar JSON. Gõ lại → đóng.
   _Tab Trạng thái chỉ đọc — không được đụng bản vẽ._
2. Tab Ribbon **XBoss**: 5 panel (**Quy trình** đứng đầu), 26 nút, mọi nút có tooltip tiếng Việt.
   Bấm 1 nút bất kỳ → đúng lệnh chạy (bấm nút = gõ lệnh, nghiệp vụ không nhân đôi).
3. `NETLOAD` lại lần nữa → **không** sinh tab XBoss thứ hai.

### C1. Kết nối server (M99 PR2)

4. `XBOSS_LOGIN` → hiện mã ghép; vào web `/engineering/thiet-bi-cad` duyệt mã → AutoCAD báo ghép
   thành công, tự tải rule pack. Token cất trong **Windows Credential Manager**, hạn 90 ngày.
5. Kiểm ngược trên web: `/engineering/thiet-bi-cad` thấy thiết bị vừa ghép, nút thu hồi hoạt động.
6. **Nhiều dự án** (mới, M101 PR4): nếu tài khoản thuộc >1 dự án, LOGIN phải **hỏi chọn dự án**;
   chọn xong rule pack tải về phải có mã BOQ theo dự án đó. Chạy lại LOGIN → nhớ lựa chọn cũ.
7. `XBOSS_RULEPACK` → nạp tệp rule pack JSON tay (đường offline), cache vào `%APPDATA%\XBoss\`.

### C2. Kiểm tra & chuẩn hoá (M99 + M101 + M102)

8. `XBOSS_KIEMTRA` trên một bản vẽ có lỗi cố ý (layer sai chuẩn, polyline hở, font TCVN3) →
   khoanh tròn lỗi trên layer tạm `XBOSS_KIEMTRA_MARK` (không in) + sinh
   `<tệp>.dwg.xboss-kiemtra.json`. Đóng bản vẽ không lưu → marker biến mất.
9. `XBOSS_CHUANHOA` → xem trước diff, xác nhận → **`U` (undo) một lần hoàn tác TOÀN BỘ 13 bước**.
   Đây là phép thử quan trọng nhất của pipeline.
10. Chạy `XBOSS_CHUANHOA` lần hai trên bản vẽ đã chuẩn hoá → không đổi gì thêm (idempotent).
11. `XBOSS_BATCH` trên một thư mục `.dwg` → bản gốc **giữ nguyên**, kết quả vào `da-chuan-hoa\`,
    có `xboss-batch-log.txt`. Thử cả chế độ chỉ-kiểm và chế độ bóc KL (1 Excel tổng, có cột "Tệp").

### C3. Bóc khối lượng (M99 + M101)

12. `XBOSS_BOCKL` → vùng đã bóc đổi màu + ghi XData; bóc lại vùng đó → **không cộng trùng**.
13. `XBOSS_BOCKL` chế độ **theo vùng**: chọn polyline ranh giới → tuyến cắt ranh giới phải cắt
    đúng tại giao điểm (AC: tuyến 10m cắt 6/4 → vùng A 6.00m, vùng B 4.00m).
14. `XBOSS_BOCKL_XOA` → trả đúng màu trước khi bóc, xoá XData.
15. `XBOSS_BOCKL_XUAT` → Excel đúng mẫu công ty (sheet `Data-BOQ`, cột A–K, công thức H/J/K và
    SUBTOTAL **sống** — bấm vào ô phải thấy công thức, không phải số chết). Có size/vùng thì cộng
    thêm cột L–Q + sheet `Tong-hop-vung`.
16. Đóng bản vẽ, mở lại, `XBOSS_BOCKL_XUAT` ngay → vẫn xuất được (trạng thái nằm trong DWG).
17. Chọn "kéo KL BOQ hợp đồng từ máy chủ" → sheet `Doi-chieu` có chênh lệch % là công thức sống.
    Rút mạng rồi làm lại → chỉ cảnh báo, **vẫn xuất bình thường**.

### C4. Bộ lệnh vẽ shop drawing (M100 — 14 lệnh, M105 — 1 lệnh)

18. `XBOSS_VE_NEN` → nền khoá + làm mờ, tạo layer đích; chạy lại → **hoàn nguyên**.
19. `XBOSS_VE` → vẽ tuyến như PLINE (có Cung/HoànTác/Đóng); `edgeStyle=double` sinh 2 nét biên.
    Nhấn ESC giữa chừng → abort sạch, không để lại rác.
    _Từ M106: tham số thu qua **hộp thoại** — xem mục 33; kết quả vẽ ra phải không đổi một nét._
20. `XBOSS_VE_NHAN` → nhãn lấy size **từ XData**, không gõ tay. `XBOSS_VE_DOI` → đổi size/hệ thì
    layer + XData + biên + nhãn cập nhật theo.
21. `XBOSS_VE_PHUKIEN` / `XBOSS_VE_THIETBI` → block bám tuyến, tự xoay theo tiếp tuyến; thiết bị
    bắt buộc có `TAG`. `XBOSS_VE_THUVIEN` → nạp thư viện block tay.
22. `XBOSS_VE_GIADO` (AC: tuyến 10m, spacing 2400 → 5 vị trí), `XBOSS_VE_LOCHO`, `XBOSS_VE_TAG`
    (quét trùng/nhảy số), `XBOSS_VE_THONGKE` (chạy lại → cập nhật tại chỗ, không đẻ bảng mới).
23. `XBOSS_VE_MATCAT` (tên A-A tự đánh) và `XBOSS_VE_TRANGIN` (layout + page setup + viewport
    **khoá** + titleblock) → mỗi lệnh 1 lần undo xoá trọn.
24. `XBOSS_VE_CHIADOT` (M105) → chọn tuyến (hoặc CAHE quét cả hệ) → vạch chia vuông góc tim +
    tag đốt trên layer `<layer tim>JOINT`; tuyến `edgeStyle=double` vạch chạm 2 nét biên, ống nước
    là tick ngắn. Chạy **lại** cùng tuyến → số vạch/tag **không đổi** (idempotent), `U` một lần
    xoá trọn kết quả một lần chạy. Tuyến mà rule pack không khai `jointRules` → **bỏ qua kèm lý
    do**, không tự đoán tham số. Sau đó `XBOSS_VE_THONGKE` → `CHIADOT` ra bảng đốt.
    _Từ M106: phạm vi/kiểu nối thu qua **hộp thoại có xem trước số đốt** — xem mục 34._
25. `XBOSS_VE_BAOCAO` → sinh báo cáo phiên vẽ JSON cạnh DWG (có mục chia đốt: tuyến đã chia /
    chưa chia, và lý do bỏ qua của phiên vừa chạy).
26. Vẽ xong chạy `XBOSS_KIEMTRA` → **pass ngay** (đây chính là mục đích của bộ lệnh vẽ) và
    `XBOSS_BOCKL` bóc không sót nét mới vẽ.

### C5. Vòng đời với web (M99 PR5 + M103 + M104)

26. `XBOSS_UPLOAD` → tạo revision `submitted` trên web. **Kiểm mới của đợt này:** AutoCAD phải
    báo **xong hẳn** (trước đây kẹt "vẫn đang xử lý" dù revision đã tạo).
27. Gửi lại đúng tệp đó → không tạo revision đôi (idempotent theo hash DWG).
28. Trên `/ban-ve`: hàng revision hiện chip **"Từ plugin · rulepack vX · N lỗi/N cảnh báo"**, mở
    rộng thấy các bước chuẩn hoá; người gửi thấy nút **"Thu Hồi"**, người khác không thấy.
29. Cố tình gửi bản vẽ **fail kiểm định** → AutoCAD hiện đủ lỗi, web **không** tạo revision.
30. `XBOSS_VE_DEXUAT` → chọn block, nhập metadata, gửi lên hàng chờ. Trên
    `/engineering/chuan-hoa-ban-ve` mục "Đề Xuất Chờ Duyệt": xem preview, **tải DWG ứng viên**,
    đối chiếu sha256, rồi Duyệt → sinh version thư viện mới.
31. Quay lại AutoCAD, chèn block vừa duyệt → plugin tự tải thư viện version mới, sha256 khớp.
32. Tài khoản có quyền thêm thẳng → sau khi đề xuất, AutoCAD in thêm dòng chỉ đường sang web.

### C6. Hộp thoại WPF + đường lui dòng lệnh (M106 PR1 — 2 lệnh mẫu)

> **Bắt buộc verify tay: XAML KHÔNG có test tự động.** CI chỉ kiểm được ViewModel ở Core
> (`VeTuyenDialogViewModelTests`, `ChiaDotDialogViewModelTests`) và cú pháp code-behind (AcadShim).
> Mọi thứ thuộc về markup — cửa sổ có hiện ra không, bind đúng ô không, màu/DPI có đọc được không —
> chỉ máy có AutoCAD 2026 mới trả lời được.

33. **`XBOSS_VE` — hộp thoại một form.** Gõ lệnh → hiện cửa sổ **"XBOSS_VE — Vẽ tuyến"** nằm trên
    AutoCAD (không lạc ra sau bản vẽ), nền tối cùng tông bảng điều khiển `XBOSS_BANG`.
    - Đủ 4 ô: Hệ, Loại tuyến, Size (gõ tay được), Độ dốc — **ô Độ dốc chỉ hiện** khi chọn tuyến
      `pipe-sanr` (ống thoát), ẩn với các tuyến khác.
    - **Sửa qua lại tự do**: đổi Hệ → danh mục Loại tuyến và Size đổi theo ngay; đổi Size →
      dòng "Nét biên: 2 nét cách tim … " đổi ngay theo size (tuyến `edgeStyle=double`).
    - Gõ size ngoài danh mục (vd `777x333`) → dòng dưới form chuyển **vàng** kèm chữ `custom`,
      nút OK **vẫn bấm được**. Xóa trắng ô Size → nút OK **mờ** kèm lý do tiếng Việt.
    - **Enter** = OK khi hợp lệ, **Esc** = Hủy. Hủy → lệnh dừng hẳn, **không** hỏi lại ở dòng lệnh.
    - Bấm OK → bắt điểm như PLINE, tuyến vẽ ra **giống hệt** bản trước M106 (đối chiếu mục 19).
    - Chạy lại lệnh → hộp thoại nhớ đúng hệ/loại tuyến/size vừa dùng.
34. **`XBOSS_VE_CHIADOT` — xem trước số đốt.** Vẽ vài tuyến rồi gõ lệnh:
    - Hộp thoại hiện Phạm vi (2 nút chọn), combo Hệ (chỉ liệt hệ **có** tuyến, kèm số tuyến),
      combo Kiểu nối (mục đầu **TỰ ĐỘNG**), và khung **Xem trước** liệt kê từng tuyến:
      `<item> <size> (handle …): <kiểu nối> · N đốt / M mối · dài đốt1 / đốt2 / … mm`.
    - **Đổi Kiểu nối → số đốt và chiều dài đổi NGAY** (không phải đóng mở lại). Chọn kiểu vượt
      ngưỡng cỡ (vd `nep_c` cho ống 800x400) → dòng cảnh báo vàng, nút OK vẫn bấm được.
    - Bản vẽ trộn nhiều loại tuyến → combo Kiểu nối **mờ** kèm câu giải thích.
    - Bấm OK ở phạm vi "Chọn tay" → AutoCAD hỏi chọn tuyến trên bản vẽ như cũ; kết quả vẽ ra phải
      **khớp đúng** các con số đã xem trước cho những tuyến đã chọn.
    - `U` một lần vẫn xóa trọn kết quả (hộp thoại nằm NGOÀI transaction — mục 24 vẫn đúng).
    - Lưu ý còn lại của PR1: câu hỏi **tỉ lệ in 1:x** vẫn ở dòng lệnh (hỏi một lần mỗi phiên).
35. **Đường lui FR9 — không lệnh nào được chết vì UI.** Đóng AutoCAD, đặt biến môi trường
    `setx XBOSS_UI_DIALOG 0`, mở lại AutoCAD:
    - `XBOSS_VE` và `XBOSS_VE_CHIADOT` in một dòng `[XBoss] XBOSS_UI_DIALOG=0 — dùng hỏi đáp dòng
lệnh…` rồi chạy **đúng chuỗi hỏi đáp keyword như trước M106**, kết quả vẽ không đổi.
    - Xóa biến (`setx XBOSS_UI_DIALOG ""`) → hộp thoại trở lại.
36. **DPI cao + màn hình phụ.** Đặt Windows scale 150 % (hoặc kéo AutoCAD sang màn hình 4K) → chữ
    và ô trong hộp thoại nét, không bị cắt, nút OK/Hủy không tràn khung.

### C7. Trình dẫn quy trình + Ribbon theo quy trình (M106 PR2)

> **Bắt buộc verify tay.** CI kẹp được luật suy trạng thái (`QuyTrinhTests` — Core) và cú pháp
> palette (AcadShim), **không** kẹp được: bảng có vẽ ra không, nút có gọi đúng lệnh không, chữ có
> bị cắt trong palette hẹp không. Chỉ máy có AutoCAD 2026 trả lời được.

37. **6 giai đoạn, đúng thứ tự.** `XBOSS_BANG` → tab **Quy trình** hiện lần lượt
    `1. KẾT NỐI` → `2. CHUẨN HÓA NỀN` → `3. VẼ SHOP DRAWING` → `4. CHI TIẾT CHẾ TẠO` →
    `5. HỒ SƠ BẢN VẼ` → `6. BÓC & NỘP`, mỗi bước một dòng trạng thái (`✓ Đã xong` /
    `○ Chưa làm` / `– Không áp dụng`) + hàng nút của bước.
    - Nút của bước đúng bằng số lệnh của bước đó, **đúng thứ tự dùng thật** (vd bước 3:
      Chuẩn bị nền → Vẽ tuyến → Nhãn size → Phụ kiện → Thiết bị → Đổi size/hệ).
    - Kéo hẹp palette → chữ xuống dòng, nút xuống hàng; không có chữ nào bị cắt cụt.
38. **Nút mờ nhưng VẪN bấm được (AC5 — quan trọng nhất).** Mở AutoCAD chưa đăng nhập, chưa nạp
    rule pack, mở một bản vẽ trắng:
    - Bước 2–6 hiện dòng `⚠` kèm lý do tiếng Việt (`Chưa nạp rule pack…`, `Bản vẽ chưa có tuyến
nào…`), nút chuyển nền chìm + chữ mờ.
    - **Bấm thử một nút mờ** (vd "Kiểm tra") → lệnh vẫn chạy và tự báo lý do từ chối ở dòng lệnh.
      Nút mờ mà **không bấm được** là SAI đặc tả (đây là hướng dẫn, không phải cổng chặn).
39. **Chưa mở bản vẽ nào.** Đóng hết bản vẽ (chỉ còn màn hình Start) → bước 1 vẫn hiện bình
    thường, bước 2–6 chuyển `– Không áp dụng` kèm lý do "Chưa mở bản vẽ nào…".
40. **Mở lại bản vẽ của phiên trước thì KHÔNG bắt làm lại.** Đăng nhập + nạp rule pack, chạy trọn
    `XBOSS_KIEMTRA` (đến khi 0 lỗi) → `XBOSS_VE` → `XBOSS_VE_CHIADOT` → `XBOSS_VE_THONGKE` →
    `XBOSS_VE_TRANGIN` → `XBOSS_BOCKL` → `XBOSS_BOCKL_XUAT`, lưu bản vẽ, **đóng AutoCAD, mở lại**
    và mở đúng bản vẽ đó → cả 6 bước phải là `✓ Đã xong`, không còn dòng `⚠` nào.
    - Chạy `XBOSS_BOCKL_XOA` → bước 6 quay lại `○ Chưa làm` (dấu bóc là dấu hiệu thật, không phải
      cờ nhớ trong phiên).
41. **Tự tính lại khi đổi bản vẽ.** Mở 2 bản vẽ (một đã làm xong như mục 40, một trắng tinh), để
    bảng đang hiện rồi `Ctrl+Tab` qua lại → trạng thái 6 bước **và** tab Trạng thái đổi theo bản vẽ
    đang hiện hành, không cần bấm "Làm mới". Đổi bản vẽ **không** được in thêm dòng nào ra dòng
    lệnh và không được gọi mạng.
42. **Ribbon theo quy trình (AC7).** Tab **XBoss**:
    - Panel **Quy trình** đứng **đầu tiên**, một nút to mở `XBOSS_BANG`; **không** còn panel
      "Bảng điều khiển" riêng (không có hai nút cùng chạy một lệnh).
    - Panel "Vẽ shop drawing" xếp nút đúng dòng chảy: nền → tuyến → nhãn → phụ kiện → thiết bị →
      đổi size, rồi chia đốt → giá đỡ → lỗ chờ → tag, rồi mặt cắt → thống kê → trang in → báo cáo,
      cuối cùng là 2 lệnh thư viện/đề xuất.
    - Panel "Kết nối": Đăng nhập → Nạp rule pack → **Upload hồ sơ đứng cuối** (thuộc bước 6).

### C8. Hộp thoại WPF cho các lệnh còn lại (M106 PR3)

> **Bắt buộc verify tay.** ViewModel đã có test ở Core (`*DialogViewModelTests`) nên CI kẹp được
> danh mục, giá trị mặc định và luật khóa nút OK. **Không** kẹp được: XAML có dựng ra không, binding
> có gõ đúng tên thuộc tính không, ô có bị cắt không, và **kết quả ra bản vẽ/tệp có y hệt đường dòng
> lệnh không**. Với mỗi mục dưới đây: chạy một lần bằng hộp thoại, một lần bằng
> `XBOSS_UI_DIALOG=0`, rồi **so kết quả** (đối tượng vẽ ra, tệp xuất ra, sidecar) — phải trùng khít.

43. **`XBOSS_LOGIN`.** Hiện đúng một ô "Địa chỉ server XBoss". Gõ `http://…` (không phải localhost)
    → nút OK **khóa** kèm lý do "phải là https". Gõ đúng địa chỉ → OK → chạy tiếp đúng luồng ghép
    thiết bị cũ (mã ghép + poll + tải rule pack + thư viện block).
44. **`XBOSS_UPLOAD`.** Hộp thoại hiện tên DWG, 2 ô (số bản vẽ, rev) và dòng "Gửi kèm … sidecar".
    - Chưa chạy `XBOSS_CHUANHOA`/`XBOSS_BOCKL_XUAT` → dòng đó nói "Không có sidecar nào" và có
      **cảnh báo vàng**, nhưng OK **vẫn bấm được**.
    - Sau khi chạy 2 lệnh đó → dòng liệt kê đủ 2 sidecar, không còn cảnh báo. Revision tạo ra trên
      web giống hệt bản trước M106.
45. **`XBOSS_CHUANHOA`.** Hộp thoại hiện danh sách nhóm lệch chuẩn (đúng các dòng vừa in ra dòng
    lệnh) + cảnh báo "bản vẽ sẽ bị SỬA". Bản vẽ đã đạt chuẩn → lệnh dừng trước khi mở hộp thoại.
    Bấm Hủy → bản vẽ **không đổi một nét**; bấm OK → `U` một lần trả nguyên trạng.
46. **`XBOSS_BATCH`.** Hộp thoại 3 radio; đổi radio thì dòng mô tả đổi theo. Bấm OK → hiện
    `FolderBrowserDialog` chọn thư mục **như cũ**, tiến trình vẫn in ra dòng lệnh như trước.
47. **`XBOSS_BOCKL`.** Hộp thoại: 2 radio phạm vi + checkbox "Bóc theo vùng". Bật checkbox + chọn
    "Chọn vùng" → sau OK phải hỏi **quét chọn** rồi mới hỏi **polyline ranh giới + tên vùng**, đúng
    thứ tự cũ. Câu xác nhận "đánh dấu n đối tượng" vẫn ở dòng lệnh (số chỉ có sau khi bóc).
48. **`XBOSS_BOCKL_XOA`.** 2 radio; chọn "Chọn vùng" → sau OK mới quét chọn. Số đối tượng gỡ dấu
    trùng với đường dòng lệnh.
49. **`XBOSS_BOCKL_XUAT`.** Hộp thoại: tên dự án + gói thầu (mồi sẵn giá trị lần trước) + checkbox
    đối chiếu BOQ. Xoá trống một ô → OK khóa kèm lý do. Bật đối chiếu khi máy **chưa** `XBOSS_LOGIN`
    → cảnh báo vàng nhưng vẫn xuất được Excel (không có sheet `Doi-chieu`). Bấm OK → `SaveFileDialog`
    như cũ; **Excel + sidecar JSON phải trùng khít bản chạy bằng dòng lệnh**.
50. **`XBOSS_VE_NEN`.** Combo hệ + dòng chỉ đọc "Khóa + làm mờ N% … tạo sẵn K layer đích của hệ X";
    đổi hệ thì con số K đổi theo. Bấm OK → nền khóa/mờ đúng như trước. Chạy lệnh lần nữa → **hoàn
    nguyên ngay, không mở hộp thoại** (đúng hành vi cũ).
51. **`XBOSS_VE_NHAN` — tỉ lệ in vào hộp thoại (việc hẹn ở PR1).** Mở AutoCAD mới, chọn tuyến →
    hộp thoại hiện combo "Tỉ lệ in 1:x" + dòng "Chữ nhãn cao a mm trên giấy ⇒ b mm trong mô hình";
    đổi tỉ lệ thì b đổi ngay. **Lệnh vẽ đầu tiên của phiên chạy trọn bằng chuột.**
    - Chạy tiếp `XBOSS_VE_TRANGIN` → ô tỉ lệ **mồi sẵn đúng giá trị vừa chọn** (một cơ chế nhớ duy
      nhất — không được hỏi lại từ đầu, cũng không được lệch giá trị).
52. **`XBOSS_VE_DOI`.** Chọn vài tuyến (trong đó có tuyến **đã bóc** và tuyến **đã chia đốt**) →
    hộp thoại hiện: danh sách đang chọn, combo hệ/loại/size/độ dốc, và khối "Bấm OK sẽ:" liệt kê
    gỡ dấu bóc / xóa vạch chia đốt / block đang bám. **Không còn câu hỏi `DongY/Huy` ở dòng lệnh.**
    Bấm Hủy → bản vẽ không đổi. Bấm OK → kết quả trùng bản chạy bằng `XBOSS_UI_DIALOG=0`.
53. **`XBOSS_VE_PHUKIEN` / `XBOSS_VE_THIETBI`.** Hộp thoại: combo hệ + combo block + dòng chỉ đọc
    (tỉ lệ theo size / xoay theo tuyến / danh sách attribute). Đổi hệ → danh mục block đổi theo.
    Bấm OK → vòng bấm điểm (và với thiết bị: góc → TAG → attribute từng cái) **giữ nguyên như cũ**.
    - Hệ mà rule pack khai id thư viện chưa có → cảnh báo vàng liệt kê id thiếu, OK vẫn bấm được.
54. **`XBOSS_VE_GIADO`.** Combo hệ + combo block giá đỡ + 2 radio cách chia + dòng chỉ đọc về
    `supportSpacingMm`. Rule pack **v9** (đã khai `heavyFittingIds`) → **không** hiện checkbox phụ
    kiện nặng, thay bằng dòng liệt kê id nặng. Thử với rule pack v6 → checkbox xuất hiện, mặc định
    bật (đúng mặc định `Co` của dòng lệnh cũ).
55. **`XBOSS_VE_LOCHO`.** 2 radio. Bản vẽ chưa có lỗ chờ nào mà chọn "Xuất bảng" → OK **khóa** kèm
    lý do. Chọn "Chèn" → sau OK, chuỗi chọn tuyến → block sleeve → điểm xuyên → cao độ/kết cấu từng
    lỗ **giữ nguyên như cũ**.
56. **`XBOSS_VE_TAG`.** 4 radio; chọn "Đánh lại" thì khối phạm vi + ô Tầng **hiện ra**, các chế độ
    khác thì ẩn. Ô Tầng mồi sẵn tầng đã nhớ trong bản vẽ; để trống → OK khóa. Bấm OK → danh sách
    tag mới vẫn in ra dòng lệnh để xác nhận trước khi ghi. Đổi tầng rồi đóng/mở lại bản vẽ → tầng
    mới được nhớ (ghi vào NOD như cũ, không sinh cơ chế nhớ thứ hai).
57. **`XBOSS_VE_THONGKE`.** 3 radio + combo tỉ lệ; đổi radio thì dòng "nguồn dữ liệu" đổi theo.
    Bảng cùng loại đã có sẵn → sau OK **không hỏi điểm đặt**, cập nhật bảng cũ tại chỗ.
58. **`XBOSS_VE_MATCAT`.** Kẻ tuyến cắt qua 3–4 tuyến → hộp thoại hiện combo tỉ lệ + **một dòng cao
    độ cho mỗi tuyến** (đúng thứ tự trái→phải, mồi sẵn giá trị lần trước), và tên mặt cắt tự đánh ở
    dạng chỉ đọc. Gõ chữ vào một ô cao độ → OK khóa kèm tên đúng tuyến đó. Bấm OK → mới hỏi điểm
    đặt hình cắt; hình cắt ra **trùng khít** bản chạy bằng dòng lệnh.
59. **`XBOSS_VE_TRANGIN`.** Hộp thoại đủ: hệ, khổ giấy, tỉ lệ, 3 radio VP-freeze, combo CTB (mồi
    sẵn bản đã nhớ, có mục "(giữ mặc định)"), và **các ô thông tin khung tên đổi theo khổ giấy**.
    - Gõ giá trị vào ô khung tên rồi đổi khổ giấy → giá trị đã gõ **không bị mất**.
    - Thư viện chưa có khung tên cho khổ đó → cảnh báo vàng, OK vẫn bấm được, layout + viewport vẫn
      tạo.
    - Bấm OK → mới hỏi vùng in (2 góc hoặc `RanhGioi`). Layout ra phải giống hệt bản dòng lệnh:
      viewport khóa đúng tỉ lệ, `TI_LE`/`NGAY` do plugin tự điền, số layer VP-freeze bằng nhau.
60. **`XBOSS_VE_DEXUAT` — bản WPF (AC8).** Hộp thoại mới **có đủ 6 trường** như bản WinForms: tên
    block, loại, hệ, item bóc tách, khổ giấy, ghi chú.
    - Đổi loại sang **Khung tên** → ô hệ và item **biến mất**, ô khổ giấy hiện ra; đổi ngược lại thì
      ô khổ giấy biến mất. Giá trị của ô vừa ẩn phải bị **xóa** (không lén gửi lên server).
    - Đặt tên trùng một block đã có trong thư viện (kể cả khác hoa/thường) → OK khóa kèm lý do.
    - Gửi thành công → server tạo đúng một đề xuất, nội dung metadata giống hệt bản M103.
    - **Không còn tệp `Ui/DeXuatBlockDialog.cs`** trong repo; palette `XBOSS_BANG` **vẫn là
      WinForms** (đúng ranh giới công nghệ chốt ở AC8).
61. **Đường lui FR9 cho cả loạt.** Đặt `setx XBOSS_UI_DIALOG 0`, mở lại AutoCAD, chạy lần lượt 20
    lệnh ở mục 43–59: mỗi lệnh in một dòng `XBOSS_UI_DIALOG=0 — dùng hỏi đáp dòng lệnh…` rồi chạy
    **đúng chuỗi hỏi đáp keyword như trước M106**.
    - Riêng `XBOSS_VE_DEXUAT` (mục 60) **không có** đường dòng lệnh: nó in thông báo bảo bỏ biến
      môi trường rồi dừng — đúng thiết kế, vì lệnh này chưa bao giờ có chế độ hỏi đáp keyword.
    - Xóa biến (`setx XBOSS_UI_DIALOG ""`) → hộp thoại trở lại.
62. **Hủy = dừng lệnh, không hỏi lại.** Với mỗi hộp thoại ở mục 43–60: bấm **Hủy** (hoặc `Esc`) →
    lệnh dừng ngay, **không** rơi xuống hỏi lại bằng dòng lệnh, và bản vẽ/tệp không đổi gì.
63. **Form dài vẫn dùng được.** Trên màn hình 1366×768, mở `XBOSS_VE_TRANGIN` (khung tên nhiều thẻ)
    và `XBOSS_VE_MATCAT` với tuyến cắt qua ≥ 8 tuyến → vùng nội dung **cuộn được**, dải nút OK/Hủy
    và vùng lý do luôn nhìn thấy, không trường nào bị đẩy khuất.

---

## D. Kiểm thử có server — dựng tại chỗ trên máy mình

Ba ca ở mục C5 (`XBOSS_UPLOAD`, sheet `Doi-chieu` của `XBOSS_BOCKL_XUAT`) và cặp thiết bị ở C1
**bắt buộc phải có server XBoss đang chạy** — không tự kiểm được nếu chỉ có AutoCAD trơ trọi.
Chưa có VPS, chưa phát hành cho đội thì dựng thẳng server trên **cùng máy Windows** đang chạy
AutoCAD (hoặc máy khác cùng mạng LAN) — không cần VPS, không cần cấu hình phần cứng đặc biệt,
máy chạy nổi AutoCAD 2026 là dư sức chạy dev server.

### D1. Cài Node + PostgreSQL

CI ghim `node-version: 24` (`.github/workflows/ci.yml`) và `DEPLOY.md` yêu cầu Node ≥ 24 —
dùng đúng bản này để khỏi lệch môi trường:

```powershell
winget install --id OpenJS.NodeJS.LTS -e     # tại thời điểm viết, LTS = nhánh 24.x
node -v                                       # phải ra v24.x — không đúng thì winget đã trỏ
                                               # sang LTS mới hơn, xem "winget search OpenJS.NodeJS"
                                               # hoặc tải thẳng bản 24.x tại https://nodejs.org/en/download
```

PostgreSQL 16 (đúng bản Postgres 16 dùng trong CI, xem `.github/workflows/ci.yml`):

```powershell
winget install --id PostgreSQL.PostgreSQL.16 -e
psql --version                                # kiểm cài xong
```

Không chắc id gói còn đúng (winget hay đổi id theo thời gian) → `winget search PostgreSQL` để
tra lại, hoặc tải trình cài trực tiếp tại https://www.postgresql.org/download/windows/ (chọn
version 16).

### D2. Tạo DB + `.env.local`

```powershell
# Trong psql (mật khẩu tự đặt lúc cài PostgreSQL):
CREATE USER xboss WITH PASSWORD 'mật-khẩu-tuỳ-chọn';
CREATE DATABASE xboss OWNER xboss;
```

`.env.local` ở gốc repo — chỉ **`DATABASE_URL` là bắt buộc** để chạy dev
(`lib/nen/env.ts` + `DEPLOY.md`). `XBOSS_SECRET` chỉ bắt buộc ở **production** — thiếu ở dev,
`lib/bao-mat/session-token.ts` tự dùng secret fallback kèm cảnh báo console, vẫn đăng nhập
được bình thường (không cần khai cho kiểm thử tại chỗ này):

```
DATABASE_URL="postgresql://xboss:mật-khẩu-tuỳ-chọn@localhost:5432/xboss"
```

Không cần `XBOSS_ADMIN_PASSWORD` cho dev: DB trống thì lần đăng nhập đầu tiên tự seed **4 tài
khoản demo** (`ensureDefaultUsers`, `lib/bao-mat/auth.ts`) — `admin@xboss.vn` / `admin123`,
`pm@xboss.vn` / `pm123`, `engineer@xboss.vn` / `eng123`, `subcon@xboss.vn` / `sub123` (đăng
nhập bằng admin để vào được `/engineering/thiet-bi-cad` và `/engineering/chuan-hoa-ban-ve`).

### D3. Chạy server

```powershell
npm install
npm run dev
```

Không cần chạy `npm run db:migrate` tay — request đầu tiên tự áp hết migration
(ADR-0003, `ensureSchema()`). `npm run dev` đã bind `-H 0.0.0.0` sẵn trong `package.json` nên
nghe được cả từ máy khác trong mạng, không cần thêm cờ.

### D4. Ghép AutoCAD với server tại chỗ

`XBOSS_LOGIN` hỏi địa chỉ server trước khi xin mã ghép
(`XBossLoginCommand.cs` ~dòng 57–60, lưu lại ở `%APPDATA%\XBoss\server.json` cho lần sau) —
nhập `http://localhost:3000` (loopback được chấp nhận dù không phải HTTPS) → lấy mã ghép → mở
`http://localhost:3000/engineering/thiet-bi-cad`, đăng nhập admin, duyệt mã → AutoCAD báo ghép
thành công, token 90 ngày cất trong Windows Credential Manager.

**AutoCAD chạy ở máy khác với máy chạy server:** dùng địa chỉ IP LAN của máy chạy server thay
vì `localhost` (vd `http://192.168.1.20:3000`) — nhớ mở Windows Firewall cho cổng 3000 (inbound,
TCP) trên máy chạy server, không thì máy kia gõ `XBOSS_LOGIN` sẽ time-out.

### D5. Các ca chỉ kiểm được khi có server

| Làm gì                                                                            | Đúng thì thấy gì                                                                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `XBOSS_UPLOAD`                                                                    | AutoCAD báo **xong hẳn** (lỗi vừa vá của đợt này — trước đây kẹt "vẫn đang xử lý" dù revision đã tạo)                                                   |
| Gửi lại đúng tệp đó lần nữa                                                       | Không tạo revision đôi (idempotent theo hash DWG)                                                                                                       |
| Mở `/ban-ve` sau khi upload                                                       | Hàng revision hiện chip **"Từ plugin · rulepack vX · N lỗi/N cảnh báo"**; người gửi thấy nút **"Thu Hồi"**, người khác đăng nhập vào không thấy nút này |
| `XBOSS_VE_DEXUAT` rồi vào `/engineering/chuan-hoa-ban-ve` mục "Đề Xuất Chờ Duyệt" | Xem được preview, **tải DWG ứng viên**, đối chiếu sha256, Duyệt xong sinh version thư viện mới                                                          |
| Quay lại AutoCAD, chèn block vừa duyệt                                            | Plugin tự tải thư viện version mới, sha256 khớp                                                                                                         |
| `XBOSS_BOCKL_XUAT` → chọn "kéo KL BOQ hợp đồng từ máy chủ"                        | Sheet `Doi-chieu` xuất hiện với chênh lệch % là công thức sống (rút mạng làm lại thì chỉ cảnh báo, vẫn xuất bình thường)                                |
| Đăng nhập bằng tài khoản (tự tạo, gán) thuộc >1 dự án rồi `XBOSS_LOGIN`           | LOGIN hỏi chọn dự án; rule pack tải về có mã BOQ đúng dự án đã chọn; chạy lại LOGIN nhớ lựa chọn cũ                                                     |

---

## E. Phát hành gói cho cả đội

### E1. Đóng gói trên máy có AutoCAD

```powershell
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1 -ChiDongGoi
```

Ra `dist\XBoss.bundle-<version>.zip` + `.zip.sha256`, in SHA-256 ra màn hình.
Tăng version: sửa `<Version>` trong `plugin-autocad/Directory.Build.props` (nguồn duy nhất —
script tự ghi vào `PackageContents.xml`).

### E2. Đưa lên GitHub Release

Cách A (đơn giản, làm tay ngay trên máy vừa đóng gói):

```powershell
gh release create v<version> --generate-notes        # nếu tag chưa có
gh release upload v<version> dist\XBoss.bundle-<version>.zip dist\XBoss.bundle-<version>.zip.sha256 --clobber
```

Cách B (qua workflow `dong-goi-plugin`, khi muốn CI đính gói): trên máy có AutoCAD build Release
rồi `actions/upload-artifact@v4` thư mục `plugin-autocad/XBoss.Cad.Acad/bin/Release` với tên
`xboss-cad-acad-release`, ghi lại **run id**; tạo tag Release; chạy workflow `release.yml` bằng
`workflow_dispatch` điền `tag` + `build_run_id`.

### E3. Bật nút tải trên web

Đặt trong `.env.local` / biến môi trường server rồi khởi động lại:

```
XBOSS_PLUGIN_URL=https://github.com/<owner>/<repo>/releases/download/v<version>/XBoss.bundle-<version>.zip
XBOSS_PLUGIN_SHA256=<64 hex, lấy từ tệp .sha256>
```

Kiểm: `/engineering/chuan-hoa-ban-ve` hiện nút "Tải Gói Cài Plugin";
`/engineering/cai-dat-plugin` hiện phiên bản + sha256 để kỹ sư đối chiếu.

### E4. Kỹ sư trong đội cài

Tải `.zip` → **kiểm checksum**: `Get-FileHash -Algorithm SHA256 .\XBoss.bundle-<version>.zip`
→ giải nén → chép thư mục `XBoss.bundle` vào `%APPDATA%\Autodesk\ApplicationPlugins\` → mở
AutoCAD → `XBOSS_LOGIN`. Không cần cài .NET SDK, không cần repo.

---

## F. Sự cố thường gặp

| Hiện tượng                                 | Nguyên nhân                                                 | Cách xử lý                                                                                          |
| ------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Không thấy acdbmgd.dll trong '...'`       | AutoCAD cài chỗ khác                                        | `-AcadDir "<đường dẫn>"`                                                                            |
| `Thiếu .NET 10 SDK`                        | AutoCAD 2026 dùng Managed API .NET 10                       | `winget install Microsoft.DotNet.SDK.10`                                                            |
| Build lỗi `CS1705 ... higher version`      | Đang build cho net8.0                                       | Adapter phải là `net10.0-windows` (đã đúng trong repo)                                              |
| Ghi đè DLL thất bại                        | AutoCAD đang mở                                             | Đóng AutoCAD rồi chạy lại                                                                           |
| Mở AutoCAD không thấy `[XBoss] ... đã nạp` | Bundle sai chỗ / thiếu tệp                                  | Kiểm `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle\PackageContents.xml` và thư mục `Contents` |
| Có lệnh nhưng **không** có tab Ribbon      | Ribbon chưa sẵn sàng lúc nạp (plugin chờ `ItemInitialized`) | Đóng/mở lại AutoCAD; lệnh gõ tay vẫn chạy bình thường                                               |
| Lệnh báo "chưa có rule pack"               | Chưa `XBOSS_LOGIN`/`XBOSS_RULEPACK`                         | Ghép thiết bị hoặc nạp rule pack tay                                                                |
| Chữ tiếng Việt trong script vỡ             | `dong-goi.ps1` mất BOM UTF-8                                | Khôi phục BOM (bắt buộc cho PowerShell 5.1)                                                         |
