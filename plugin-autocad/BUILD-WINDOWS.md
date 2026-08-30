# Build plugin XBoss cho AutoCAD trên Windows — từ máy trắng đến plugin chạy được

Hướng dẫn **chi tiết từ đầu**: máy Windows chưa cài gì → build → cài → thấy dòng
`[XBoss] Plugin ... đã nạp` trong AutoCAD 2026.

Ba tài liệu anh em, đọc đúng cái mình cần:

| Tài liệu                                             | Dành cho                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| **BUILD-WINDOWS.md** (tệp này)                       | Người **build** plugin từ mã nguồn trên máy Windows                          |
| [`VERIFY-VA-PHAT-HANH.md`](VERIFY-VA-PHAT-HANH.md)   | Sau khi build xong: **verify tay 27 lệnh** trên AutoCAD thật → **phát hành** |
| [`CAI-DAT.md`](CAI-DAT.md)                           | Kỹ sư máy trạm chỉ **cài gói `.zip`** đã phát hành (không build, không repo) |

> **Chỉ muốn dùng plugin, không muốn build?** Đừng đọc tiếp — sang [`CAI-DAT.md`](CAI-DAT.md).

---

## 0. Điều kiện — không có đủ thì dừng, đừng build

| Cần gì                     | Bắt buộc? | Kiểm bằng                                    |
| -------------------------- | --------- | -------------------------------------------- |
| Windows 10/11 **64-bit**   | ✅        | `winver`                                     |
| **AutoCAD 2026** bản đầy đủ | ✅        | Mở AutoCAD → gõ `_ABOUT`                     |
| .NET **10** SDK            | ✅        | `dotnet --list-sdks` có dòng `10.*`          |
| .NET **8** runtime         | ✅ (chạy test) | `dotnet --list-runtimes` có `Microsoft.NETCore.App 8.*` |
| Git                        | ✅        | `git --version`                              |
| PowerShell 5.1 hoặc pwsh 7 | ✅        | có sẵn trong Windows                         |
| ObjectARX SDK 2026         | ❌        | **không cần** — xem §1.3                     |

- **AutoCAD LT không chạy được**: LT không hỗ trợ plugin .NET. Không có cách vòng.
- **AutoCAD 2021–2025 không chạy được**: runtime khác; plugin đọc `ACADVER` lúc nạp, báo tiếng
  Việt rồi dừng.
- Máy **không có AutoCAD** vẫn build/test được phần Core + cổng shim (§4), nhưng **không** build
  được Adapter và không verify được gì.

---

## 1. Cài công cụ (làm 1 lần)

Mở **PowerShell với quyền Administrator** cho các lệnh `winget`.

### 1.1 .NET 10 SDK (bắt buộc — Adapter build cho `net10.0-windows`)

```powershell
winget install Microsoft.DotNet.SDK.10
```

Đóng và mở lại PowerShell (để `PATH` cập nhật), rồi kiểm:

```powershell
dotnet --list-sdks        # phải có dòng bắt đầu bằng 10.
```

### 1.2 .NET 8 runtime (để chạy `dotnet test` — Core/Tests là `net8.0`)

```powershell
winget install Microsoft.DotNet.Runtime.8
dotnet --list-runtimes | Select-String "Microsoft.NETCore.App 8"
```

> SDK 10 **biên dịch** được `net8.0` (tự tải reference pack qua NuGet), nhưng **chạy** test
> `net8.0` thì cần runtime 8. Không muốn cài thêm runtime thì chạy test bằng
> `$env:DOTNET_ROLL_FORWARD="Major"; dotnet test ...` — cách này chỉ nên dùng tạm, vì nó chạy test
> trên runtime khác với runtime CI dùng.

### 1.3 ObjectARX SDK — KHÔNG cần tải

Adapter chỉ cần 4 DLL tham chiếu, và **thư mục cài AutoCAD 2026 đã có sẵn cả 4**:

```powershell
Get-ChildItem "C:\Program Files\Autodesk\AutoCAD 2026\" -Include acdbmgd.dll,acmgd.dll,accoremgd.dll,AdWindows.dll -Recurse -Depth 0 |
  Select-Object Name, Length
```

Ra đủ 4 dòng là xong. AutoCAD cài chỗ khác → nhớ đường dẫn đó, mọi lệnh dưới truyền
`-AcadDir "<đường dẫn>"` (script) hoặc `-p:AcadSdkDir="<đường dẫn>"` (dotnet build).
Ai đã tải ObjectARX SDK 2026 thì dùng thư mục `inc-x64` của SDK, tương đương.

### 1.4 Git + mã nguồn

```powershell
winget install Git.Git
cd C:\src                       # thư mục nào cũng được, tránh OneDrive/đường dẫn quá dài
git clone <URL repo XBoss> xboss
cd C:\src\xboss
git checkout main
git pull
```

Mọi lệnh từ đây chạy **tại thư mục gốc repo** (`C:\src\xboss`), không phải trong `plugin-autocad\`.

---

## 2. Kiểm nền .NET của AutoCAD — BẮT BUỘC, làm lại sau MỖI bản cập nhật AutoCAD

Đây là bước hay bị bỏ qua nhất và là nguyên nhân của cả một buổi build hỏng.
Ngày 2026-08-25, một bản cập nhật AutoCAD 2026 đổi Managed API từ .NET 8 sang **.NET 10** chỉ
trong vài tiếng; máy build cho nền cũ lập tức đỏ `CS1705`.

```powershell
$b = [IO.File]::ReadAllBytes("C:\Program Files\Autodesk\AutoCAD 2026\acmgd.dll")
$s = [Text.Encoding]::UTF8.GetString($b)
[regex]::Matches($s, '\.NET[A-Za-z]*,Version=v[0-9\.]+') | ForEach-Object { $_.Value } | Select-Object -Unique
```

| Kết quả                       | Nghĩa là                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `.NETCoreApp,Version=v10.0`   | **Khớp repo** (`XBoss.Cad.Acad` = `net10.0-windows`) → đi tiếp §3                                                 |
| Giá trị khác (vd `v8.0`)      | **DỪNG.** Không tự sửa csproj rồi build cho xong — báo đội phát triển đổi `TargetFramework` + cổng CI + M99 §9.1 |

> Đừng dùng `[Reflection.Assembly]::LoadFrom(...).ImageRuntimeVersion` trên PowerShell 5.1:
> nền .NET Framework 4.8 không nạp nổi assembly .NET 8/10, chỉ ném `BadImageFormatException`.

---

## 3. Đường nhanh: một lệnh build + cài

Đóng **hẳn** AutoCAD (còn `acad.exe` thì DLL bị khóa; script sẽ chặn và báo tiếng Việt).

```powershell
cd C:\src\xboss
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1
# AutoCAD cài chỗ khác:
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1 -AcadDir "D:\AutoCAD 2026"
```

Script làm tuần tự: kiểm `acdbmgd.dll` trong `-AcadDir` → kiểm .NET 10 SDK → kiểm AutoCAD đã đóng
→ `dotnet build -c Release` → dựng `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle\` (ghi
`AppVersion` thật đọc từ `Directory.Build.props`, **không** chép 5 DLL do AutoCAD tự cung cấp).

Mở AutoCAD 2026 → dòng lệnh phải hiện `[XBoss] Plugin ... đã nạp` và có tab Ribbon **XBoss**.
Không thấy → §7.

**Gỡ cài:** đóng AutoCAD, xoá thư mục `%APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle`.

Chỉ tạo gói phát hành, **không** cài lên máy mình:

```powershell
powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1 -ChiDongGoi
# → dist\XBoss.bundle-<version>.zip + .zip.sha256 (in SHA-256 ra màn hình)
```

Phần còn lại của tài liệu (§4–§6) là **cùng việc đó làm tay từng bước** — dùng khi cần soi lỗi
hoặc hiểu script đang làm gì.

---

## 4. Làm tay bước 1: Core + Tests (không cần AutoCAD)

Đây đúng là phần CI chạy trên Linux, nên nó phải xanh trước khi nghi ngờ Adapter.

```powershell
cd C:\src\xboss
dotnet restore plugin-autocad\XBoss.Cad.sln
dotnet build   plugin-autocad\XBoss.Cad.Core\XBoss.Cad.Core.csproj -c Release
dotnet test    plugin-autocad\XBoss.Cad.Tests\XBoss.Cad.Tests.csproj
```

Test **nạp rule pack thật** từ `lib/ky-thuat/cad/rule-packs/v2.json` của repo, nên bắt buộc chạy
bên trong repo XBoss (đừng copy riêng thư mục `plugin-autocad` đi chỗ khác).

### Cổng biên dịch thử Adapter bằng stub API (vẫn không cần AutoCAD)

```powershell
dotnet build plugin-autocad\XBoss.Cad.AcadShim\XBoss.Cad.AcadShim.csproj -c Release
```

Biên dịch **toàn bộ** mã `XBoss.Cad.Acad` bằng bộ khai báo giả API AutoCAD. Chạy lệnh này
**trước khi push** mọi thay đổi chạm Adapter.
⚠ Stub **không có hành vi** → cổng này không thay được verify tay trên AutoCAD thật.

---

## 5. Làm tay bước 2: build Adapter (cần AutoCAD/ObjectARX)

```powershell
dotnet build plugin-autocad\XBoss.Cad.Acad\XBoss.Cad.Acad.csproj -c Release `
  -p:AcadSdkDir="C:\Program Files\Autodesk\AutoCAD 2026"
```

- Thiếu/sai `AcadSdkDir` → build dừng sớm với thông điệp tiếng Việt của target `KiemAcadSdkDir`.
- Đặt sẵn một lần cho cả phiên: `$env:AcadSdkDir = "C:\Program Files\Autodesk\AutoCAD 2026"`.
- Kết quả ra `plugin-autocad\XBoss.Cad.Acad\bin\Release\` (không có thư mục con TFM — csproj đặt
  `AppendTargetFrameworkToOutputPath=false`).

Kiểm nhanh output:

```powershell
Get-ChildItem plugin-autocad\XBoss.Cad.Acad\bin\Release\*.dll | Select-Object Name
# phải có: XBoss.Cad.Acad.dll, XBoss.Cad.Core.dll, ClosedXML.dll, DocumentFormat.OpenXml*.dll ...
```

---

## 6. Làm tay bước 3: dựng `.bundle` và cài

Cấu trúc bắt buộc trong `%APPDATA%\Autodesk\ApplicationPlugins\`:

```
XBoss.bundle/
├── PackageContents.xml          (chép từ plugin-autocad\bundle\PackageContents.xml,
│                                 sửa AppVersion cho khớp Directory.Build.props)
└── Contents/
    ├── XBoss.Cad.Acad.dll
    ├── XBoss.Cad.Core.dll
    ├── ClosedXML.dll + các dll phụ thuộc (DocumentFormat.OpenXml…)
    └── (KHÔNG chép acdbmgd/acmgd/accoremgd/AdWindows/AcWindows —
          AutoCAD cung cấp lúc chạy; chép vào là nạp assembly hai lần)
```

Làm tay bằng PowerShell:

```powershell
$out  = "plugin-autocad\XBoss.Cad.Acad\bin\Release"
$dich = "$env:APPDATA\Autodesk\ApplicationPlugins\XBoss.bundle"
$cuaAutoCad = @("acdbmgd.dll","acmgd.dll","accoremgd.dll","AdWindows.dll","AcWindows.dll")

if (Test-Path $dich) { Remove-Item $dich -Recurse -Force }   # đóng AutoCAD trước!
New-Item -ItemType Directory "$dich\Contents" -Force | Out-Null
Copy-Item plugin-autocad\bundle\PackageContents.xml $dich
Get-ChildItem $out -File |
  Where-Object { $_.Extension -in ".dll",".json" -and $cuaAutoCad -notcontains $_.Name } |
  Copy-Item -Destination "$dich\Contents"
```

Mở AutoCAD 2026 → autoloader tự nạp, không cần quyền admin, không cần `NETLOAD`.
Muốn thử nhanh một bản DLL mà không cài bundle: gõ `NETLOAD` trong AutoCAD rồi chọn
`XBoss.Cad.Acad.dll` (chỉ có tác dụng cho phiên hiện tại).

---

## 7. Lỗi hay gặp — tra bảng trước khi đi tìm

| Hiện tượng                                                        | Nguyên nhân                                                   | Cách xử lý                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Không thấy acdbmgd.dll trong '...'`                              | AutoCAD cài chỗ khác                                          | `-AcadDir "<đường dẫn>"` / `-p:AcadSdkDir="<đường dẫn>"`                                  |
| `Thiếu .NET 10 SDK`                                               | Chưa cài SDK 10 hoặc chưa mở lại PowerShell                   | `winget install Microsoft.DotNet.SDK.10`, mở lại terminal, `dotnet --list-sdks`            |
| `CS1705 ... uses System.Runtime 10.0.0.0 which has a higher version` | Build cho `net8.0` nhưng `acmgd.dll` là .NET 10               | Adapter phải là `net10.0-windows` (repo đã đúng) — chạy lại §2 xem nền thật               |
| `error MSB3021` / `UnauthorizedAccessException` lúc chép DLL      | AutoCAD đang mở, DLL bị khóa                                  | Đóng hẳn AutoCAD (`Get-Process acad`) rồi chạy lại                                        |
| `dotnet test` báo thiếu `Microsoft.NETCore.App 8.x`               | Thiếu runtime .NET 8                                          | `winget install Microsoft.DotNet.Runtime.8` (xem §1.2)                                     |
| `.ps1 ... không được ký` / `UnauthorizedAccess`                   | Execution policy                                              | Chạy dạng `powershell -ExecutionPolicy Bypass -File ...`                                   |
| Chữ tiếng Việt trong script vỡ, script lỗi cú pháp                | `dong-goi.ps1` mất BOM UTF-8 (PowerShell 5.1 đọc theo ANSI)   | Khôi phục BOM UTF-8 ở đầu tệp — **bắt buộc**, đừng lưu lại bằng editor không giữ BOM      |
| Mở AutoCAD không thấy `[XBoss] ... đã nạp`                        | Bundle sai chỗ/thiếu tệp, hoặc không phải AutoCAD 2026        | Kiểm đúng `...\ApplicationPlugins\XBoss.bundle\PackageContents.xml` + thư mục `Contents`  |
| Có lệnh `XBOSS_*` nhưng **không** có tab Ribbon                   | Ribbon chưa sẵn sàng lúc nạp (plugin chờ `ItemInitialized`)   | Đóng/mở lại AutoCAD; lệnh gõ tay vẫn chạy bình thường                                     |
| Lệnh báo "chưa nạp bộ quy tắc"                                    | Chưa ghép thiết bị                                            | `XBOSS_LOGIN` (có mạng) hoặc `XBOSS_RULEPACK` nạp tệp JSON tay                             |
| Build xanh nhưng lệnh chết lúc chạy                               | Stub không có hành vi — cổng shim không kiểm được runtime     | Verify tay theo [`VERIFY-VA-PHAT-HANH.md`](VERIFY-VA-PHAT-HANH.md) mục C                   |

---

## 8. Xong rồi thì làm gì tiếp

1. **Verify tay** 27 lệnh trên AutoCAD thật — [`VERIFY-VA-PHAT-HANH.md`](VERIFY-VA-PHAT-HANH.md) §C.
2. **Đóng gói phát hành**: `dong-goi.ps1 -ChiDongGoi` → `dist\XBoss.bundle-<version>.zip` (+ sha256).
   Tăng version chỉ sửa **một chỗ**: `<Version>` trong `plugin-autocad\Directory.Build.props`.
3. **Đưa lên Release + bật nút tải trên web** (`XBOSS_PLUGIN_URL`, `XBOSS_PLUGIN_SHA256`) —
   [`VERIFY-VA-PHAT-HANH.md`](VERIFY-VA-PHAT-HANH.md) §E.
