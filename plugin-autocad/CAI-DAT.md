# Cài đặt plugin XBoss cho AutoCAD — hướng dẫn cho kỹ sư

Tài liệu này dành cho **người dùng cuối** (kỹ sư MEP/QS trên máy trạm). Người phát hành gói cài xem
phần build/đóng gói trong [`README.md`](README.md).

> **Điều kiện bắt buộc: AutoCAD 2026** (một nền duy nhất, .NET 8 — M99 §9.1). Bản 2021–2024 chạy
> runtime khác nên **không nạp được** plugin; plugin đọc `ACADVER` lúc nạp và báo tiếng Việt rồi
> dừng, thay vì lỗi khó hiểu giữa chừng. AutoCAD LT không hỗ trợ.

## 0. Trước bản cài đầu tiên trong công ty (người phát hành làm 1 lần)

**Đã xác minh 2026-08-25** trên AutoCAD 2026 thật: `acmgd.dll` là `.NETCoreApp,Version=v8.0`,
`Acmgd, Version=25.1.0.0` — đúng nền plugin đang build. Không cần làm lại cho bản 2026.

Khi phát hành cho **đời AutoCAD khác**, kiểm lại bằng lệnh sau (chỉ đọc tệp, không nạp assembly):

```powershell
$b = [IO.File]::ReadAllBytes("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll")
$s = [Text.Encoding]::UTF8.GetString($b)
[regex]::Matches($s, '\.NET[A-Za-z]*,Version=v[0-9\.]+') | ForEach-Object { $_.Value } | Select-Object -Unique
```

Không ra `.NETCoreApp,Version=v8.0` → **dừng lại**, báo đội phát triển sửa `TargetFramework` theo
giá trị thật rồi build lại (M99 §9.1).

## 1. Lấy gói cài

Vào XBoss → **Chuẩn hóa bản vẽ CAD** (`/engineering/chuan-hoa-ban-ve`) → khối **Bảng Điều Khiển
Plugin AutoCAD** → nút **Tải Gói Cài Plugin**.

Nếu chỗ đó hiện hướng dẫn thay vì nút tải, nghĩa là quản trị chưa khai biến `XBOSS_PLUGIN_URL` —
hỏi quản trị hệ thống, đừng tự tải gói từ nguồn khác.

## 2. Cài

1. Đóng hẳn AutoCAD.
2. Giải nén gói vào: `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle\`
   (đường dẫn cuối phải đúng dạng `...\ApplicationPlugins\XBoss.bundle\PackageContents.xml`).
3. Mở AutoCAD 2026. Dòng lệnh hiện `[XBoss] Plugin ... đã nạp` là xong.

**Gỡ cài đặt:** đóng AutoCAD, xoá thư mục `XBoss.bundle`. Không để lại gì trong bản vẽ.

## 3. Đăng nhập lần đầu (ghép thiết bị)

1. Trong AutoCAD gõ `XBOSS_LOGIN` → plugin hiện **mã ghép** dạng `XXXX-XXXX` (sống 10 phút).
2. Mở XBoss trên trình duyệt → **Thiết Bị & Token** (`/engineering/thiet-bi-cad`) → nhập mã → **Duyệt**.
3. Quay lại AutoCAD: plugin nhận token (hạn 90 ngày) và tự tải bộ quy tắc đang phát hành.

Token lưu trong **Windows Credential Manager**, không ghi ra tệp. Mất máy/nghi lộ → vào trang Thiết
Bị & Token bấm **Thu hồi**; lần gọi kế tiếp của máy đó nhận 401 và phải ghép lại.

**Máy không ra được mạng nội bộ:** tải tệp JSON bộ quy tắc từ bảng điều khiển (nút _Tải JSON_), chép
sang máy trạm rồi gõ `XBOSS_RULEPACK` chọn tệp. Chuẩn hóa vẫn chạy, nhưng **không tải bản vẽ lên
được** cho tới khi bộ quy tắc khớp bản đang phát hành (chủ đích — M99 AC8).

## 4. Dùng hằng ngày

| Lệnh               | Làm gì                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| `XBOSS_KIEMTRA`    | Chỉ kiểm, **không đụng bản vẽ**; xuất báo cáo JSON cạnh tệp DWG                 |
| `XBOSS_CHUANHOA`   | Chuẩn hóa theo bộ quy tắc; sai thì **1 lần UNDO** về nguyên trạng               |
| `XBOSS_BOCKL`      | Bóc khối lượng theo layer, tô màu + đánh dấu vùng đã bóc (chạy lại không trùng) |
| `XBOSS_BOCKL_XOA`  | Gỡ đánh dấu, trả màu từng đối tượng về đúng màu trước khi bóc                   |
| `XBOSS_BOCKL_XUAT` | Xuất Excel đúng mẫu công ty (công thức sống) để gửi QS                          |
| `XBOSS_UPLOAD`     | Gửi bản vẽ đã chuẩn hóa về XBoss (server kiểm định lại rồi mới ghi sổ)          |
| `XBOSS_BATCH`      | Xử lý hàng loạt cả thư mục; **bản gốc giữ nguyên**, kết quả vào `da-chuan-hoa/` |

Trình tự khuyên dùng: `XBOSS_KIEMTRA` → `XBOSS_CHUANHOA` → kiểm mắt → `QSAVE` → `XBOSS_UPLOAD`.

## 5. Trục trặc thường gặp

| Hiện tượng                                      | Nguyên nhân & xử lý                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mở AutoCAD không thấy dòng `[XBoss] ... đã nạp` | Sai đường dẫn `XBoss.bundle`, hoặc không phải AutoCAD 2026 — xem lại bước 2 và điều kiện đầu trang     |
| Lệnh báo "chưa nạp bộ quy tắc"                  | Chạy `XBOSS_LOGIN` (có mạng) hoặc `XBOSS_RULEPACK` (nạp tệp JSON)                                      |
| Gọi lệnh nhận **401**                           | Token hết hạn hoặc đã bị thu hồi → `XBOSS_LOGIN` ghép lại                                              |
| `XBOSS_UPLOAD` báo **422** kèm danh sách lỗi    | Server kiểm định không đạt — sửa đúng các lỗi liệt kê rồi tải lại; **không có bản vẽ nào được ghi sổ** |
| `XBOSS_UPLOAD` báo trùng rev                    | Rev đó đã có với nội dung khác → tăng rev rồi gửi lại                                                  |
| Báo bộ quy tắc cũ hơn bản đang phát hành        | `XBOSS_LOGIN` để cập nhật, **chuẩn hóa lại**, rồi mới tải lên (AC8)                                    |
| Khối lượng bóc lệch bất thường                  | Kiểm `$INSUNITS` của bản vẽ — báo cáo có cảnh báo khi bản vẽ không dùng mm (plugin đã tự quy đổi)      |
| Bóc lần 2 ra 0                                  | Đúng như thiết kế: vùng đã bóc mang dấu chống trùng — dùng `XBOSS_BOCKL_XOA` nếu muốn bóc lại từ đầu   |

## 6. Cần nhớ

- Bản vẽ **không rời hạ tầng tự host** của công ty; plugin không gửi nội dung bản vẽ đi đâu khác.
- Plugin **không tự cập nhật ngầm** — nâng cấp là do người phát hành công bố gói mới.
- Đổi quy tắc chuẩn hóa = **phát hành phiên bản rule pack mới** trên server, không sửa bản đã phát hành.
