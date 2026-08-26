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

## C. Verify tay — 25 lệnh, đi theo đúng thứ tự này

Mỗi mục ghi: **làm gì** → **đúng thì thấy gì**. Gặp lệch thì ghi lại lệnh + thông điệp + tệp
báo cáo JSON cạnh DWG rồi báo lại, đừng sửa bản vẽ để "cho qua".

### C0. Vỏ giao diện (M102)

1. `XBOSS_BANG` → hiện bảng điều khiển neo được, 4 khối: trạng thái server/thiết bị, rule pack
   (version + số quy tắc), bản vẽ hiện hành, tóm tắt sidecar JSON. Gõ lại → đóng.
   _Chỉ đọc — không được đụng bản vẽ, không gọi mạng._
2. Tab Ribbon **XBoss**: 5 panel, 25 nút, mọi nút có tooltip tiếng Việt. Bấm 1 nút bất kỳ →
   đúng lệnh chạy (bấm nút = gõ lệnh, nghiệp vụ không nhân đôi).
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

### C4. Bộ lệnh vẽ shop drawing (M100 — 14 lệnh)

18. `XBOSS_VE_NEN` → nền khoá + làm mờ, tạo layer đích; chạy lại → **hoàn nguyên**.
19. `XBOSS_VE` → vẽ tuyến như PLINE (có Cung/HoànTác/Đóng); `edgeStyle=double` sinh 2 nét biên.
    Nhấn ESC giữa chừng → abort sạch, không để lại rác.
20. `XBOSS_VE_NHAN` → nhãn lấy size **từ XData**, không gõ tay. `XBOSS_VE_DOI` → đổi size/hệ thì
    layer + XData + biên + nhãn cập nhật theo.
21. `XBOSS_VE_PHUKIEN` / `XBOSS_VE_THIETBI` → block bám tuyến, tự xoay theo tiếp tuyến; thiết bị
    bắt buộc có `TAG`. `XBOSS_VE_THUVIEN` → nạp thư viện block tay.
22. `XBOSS_VE_GIADO` (AC: tuyến 10m, spacing 2400 → 5 vị trí), `XBOSS_VE_LOCHO`, `XBOSS_VE_TAG`
    (quét trùng/nhảy số), `XBOSS_VE_THONGKE` (chạy lại → cập nhật tại chỗ, không đẻ bảng mới).
23. `XBOSS_VE_MATCAT` (tên A-A tự đánh) và `XBOSS_VE_TRANGIN` (layout + page setup + viewport
    **khoá** + titleblock) → mỗi lệnh 1 lần undo xoá trọn.
24. `XBOSS_VE_BAOCAO` → sinh báo cáo phiên vẽ JSON cạnh DWG.
25. Vẽ xong chạy `XBOSS_KIEMTRA` → **pass ngay** (đây chính là mục đích của bộ lệnh vẽ) và
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

---

## D. Phát hành gói cho cả đội

### D1. Đóng gói trên máy có AutoCAD

```powershell
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1 -ChiDongGoi
```

Ra `dist\XBoss.bundle-<version>.zip` + `.zip.sha256`, in SHA-256 ra màn hình.
Tăng version: sửa `<Version>` trong `plugin-autocad/Directory.Build.props` (nguồn duy nhất —
script tự ghi vào `PackageContents.xml`).

### D2. Đưa lên GitHub Release

Cách A (đơn giản, làm tay ngay trên máy vừa đóng gói):

```powershell
gh release create v<version> --generate-notes        # nếu tag chưa có
gh release upload v<version> dist\XBoss.bundle-<version>.zip dist\XBoss.bundle-<version>.zip.sha256 --clobber
```

Cách B (qua workflow `dong-goi-plugin`, khi muốn CI đính gói): trên máy có AutoCAD build Release
rồi `actions/upload-artifact@v4` thư mục `plugin-autocad/XBoss.Cad.Acad/bin/Release` với tên
`xboss-cad-acad-release`, ghi lại **run id**; tạo tag Release; chạy workflow `release.yml` bằng
`workflow_dispatch` điền `tag` + `build_run_id`.

### D3. Bật nút tải trên web

Đặt trong `.env.local` / biến môi trường server rồi khởi động lại:

```
XBOSS_PLUGIN_URL=https://github.com/<owner>/<repo>/releases/download/v<version>/XBoss.bundle-<version>.zip
XBOSS_PLUGIN_SHA256=<64 hex, lấy từ tệp .sha256>
```

Kiểm: `/engineering/chuan-hoa-ban-ve` hiện nút "Tải Gói Cài Plugin";
`/engineering/cai-dat-plugin` hiện phiên bản + sha256 để kỹ sư đối chiếu.

### D4. Kỹ sư trong đội cài

Tải `.zip` → **kiểm checksum**: `Get-FileHash -Algorithm SHA256 .\XBoss.bundle-<version>.zip`
→ giải nén → chép thư mục `XBoss.bundle` vào `%APPDATA%\Autodesk\ApplicationPlugins\` → mở
AutoCAD → `XBOSS_LOGIN`. Không cần cài .NET SDK, không cần repo.

---

## E. Sự cố thường gặp

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
