<#
  LƯU Ý CHO NGƯỜI SỬA TỆP NÀY: phải giữ BOM UTF-8 ở đầu tệp. Windows PowerShell 5.1 (bản mặc
  định của Windows) đọc .ps1 theo bảng mã ANSI khi KHÔNG có BOM — chữ tiếng Việt vỡ và script
  lỗi cú pháp ngay khi chạy. Đã vấp thật 2026-08-25.

  M99 — Đóng gói và cài plugin XBoss cho AutoCAD 2026 (thay cho việc chép tay từng DLL).

  Chạy trên máy Windows có AutoCAD 2026, từ thư mục gốc repo:

      pwsh -File plugin-autocad\dong-goi.ps1                 # build + cài vào %APPDATA%
      powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1
      ... -ChiDongGoi                                        # chỉ tạo gói ra .\dist, KHÔNG cài
      ... -AcadDir "D:\AutoCAD 2026"                         # AutoCAD cài chỗ khác
      ... -KhongNen                                          # (kèm -ChiDongGoi) giữ thư mục
                                                               #  .bundle rời, không nén .zip
      ... -ChiDongGoi -BoQuaBuild                            # đóng gói từ DLL ĐÃ build sẵn
                                                               #  trong XBoss.Cad.Acad\bin\Release
                                                               #  (dùng khi CI/máy đóng gói không
                                                               #  có ObjectARX SDK để tự build —
                                                               #  xem .github/workflows/release.yml)

  ĐÓNG AutoCAD trước khi chạy — DLL đang nạp thì không ghi đè được.

  Đóng gói (mặc định khi dùng -ChiDongGoi) còn nén thư mục .bundle thành
  dist\XBoss.bundle-<version>.zip kèm tệp .sha256 cạnh nó — đây là artifact
  dùng để đính vào GitHub Release (xem .github/workflows/release.yml) và là
  đích của biến môi trường XBOSS_PLUGIN_URL.
#>
[CmdletBinding()]
param(
    [string]$AcadDir = "C:\Program Files\Autodesk\AutoCAD 2026",
    [switch]$ChiDongGoi,
    [switch]$KhongNen,
    [switch]$BoQuaBuild
)

$ErrorActionPreference = "Stop"
$goc = Split-Path -Parent $PSScriptRoot
$duAn = Join-Path $PSScriptRoot "XBoss.Cad.Acad\XBoss.Cad.Acad.csproj"

# Một nguồn version duy nhất: Directory.Build.props (thẻ <Version>) — đọc bằng regex đơn giản,
# không cần MSBuild, để dùng được cả khi chưa build (in ra tên tệp .zip trước khi build xong).
$propsPath = Join-Path $PSScriptRoot "Directory.Build.props"
$propsNoiDung = Get-Content -Raw -Encoding UTF8 $propsPath
$khopVersion = [regex]::Match($propsNoiDung, "<Version>([^<]+)</Version>")
if (-not $khopVersion.Success) {
    throw "Không đọc được <Version> trong '$propsPath'."
}
$version = $khopVersion.Groups[1].Value.Trim()

$out = Join-Path $PSScriptRoot "XBoss.Cad.Acad\bin\Release"

if ($BoQuaBuild) {
    # Đóng gói từ DLL đã build sẵn (vd tải về từ artifact của một máy Windows có ObjectARX SDK
    # 2026 hợp lệ) — dùng khi máy chạy dong-goi.ps1 KHÔNG có SDK để tự build (điển hình: runner
    # CI hosted của GitHub, xem .github/workflows/release.yml). Không đụng tới $AcadDir/dotnet.
    $dllChinh = Join-Path $out "XBoss.Cad.Acad.dll"
    if (-not (Test-Path $dllChinh)) {
        throw "Thiếu '$dllChinh' — -BoQuaBuild yêu cầu DLL đã build sẵn trong XBoss.Cad.Acad\bin\Release trước khi chạy script."
    }
    Write-Host "[XBoss] Bỏ qua build — đóng gói từ DLL có sẵn trong $out" -ForegroundColor Cyan
} else {
    if (-not (Test-Path (Join-Path $AcadDir "acdbmgd.dll"))) {
        throw "Không thấy acdbmgd.dll trong '$AcadDir'. Truyền -AcadDir đúng thư mục cài AutoCAD 2026."
    }

    # Adapter build cho net10.0-windows (bám nền Managed API của AutoCAD 2026). Thiếu SDK 10 thì
    # `dotnet build` báo lỗi khó hiểu về NETSDK, nên chặn sớm bằng thông điệp tiếng Việt.
    if (-not (dotnet --list-sdks | Select-String -SimpleMatch "10.")) {
        throw "Thiếu .NET 10 SDK (Adapter build cho net10.0-windows). Cài: winget install Microsoft.DotNet.SDK.10"
    }

    # AutoCAD đang mở thì GIỮ acad.exe khóa DLL: build ghi đè được (bin\Release) nhưng bước cài
    # bên dưới sẽ ném UnauthorizedAccessException khó hiểu. Chặn sớm, nói rõ bằng tiếng Việt —
    # rẻ hơn nhiều so với để kỹ sư đọc stack trace của Remove-Item (vấp thật 2026-08-26).
    $acad = Get-Process -Name acad -ErrorAction SilentlyContinue
    if ($acad -and -not $ChiDongGoi) {
        throw "AutoCAD đang mở ($($acad.Count) tiến trình) — DLL đang bị khóa nên không cài đè được. " +
              "Đóng hẳn AutoCAD rồi chạy lại lệnh này. (Chỉ muốn tạo gói mà không cài: thêm -ChiDongGoi)"
    }

    Write-Host "[XBoss] Build Adapter (Release)..." -ForegroundColor Cyan
    dotnet build $duAn -c Release -p:AcadSdkDir="$AcadDir"
    if ($LASTEXITCODE -ne 0) { throw "Build thất bại." }
}

$dich = if ($ChiDongGoi) { Join-Path $goc "dist\XBoss.bundle" }
        else { Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\XBoss.bundle" }

if (Test-Path $dich) { Remove-Item $dich -Recurse -Force }
$noiDung = Join-Path $dich "Contents"
New-Item -ItemType Directory -Path $noiDung -Force | Out-Null

# PackageContents.xml trong repo chỉ là MẪU (AppVersion cố định) — ghi đè bằng version thật
# đọc từ Directory.Build.props để manifest luôn khớp bản build, không cần sửa tay 2 chỗ.
$manifestGoc = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot "bundle\PackageContents.xml")
$manifest = $manifestGoc -replace 'AppVersion="[^"]*"', "AppVersion=`"$version`""
# UTF8Encoding($false): ghi UTF-8 KHÔNG BOM dù chạy trên Windows PowerShell 5.1 hay pwsh —
# Set-Content -Encoding UTF8 của bản 5.1 luôn kèm BOM, làm lệch với bản mẫu trong repo.
[System.IO.File]::WriteAllText((Join-Path $dich "PackageContents.xml"), $manifest, (New-Object System.Text.UTF8Encoding($false)))

# Chép output build, TRỪ các assembly do chính AutoCAD cung cấp lúc chạy (M99 §9.1: CopyLocal=false;
# chép nhầm chúng vào bundle là nguồn lỗi nạp assembly hai lần).
$cuaAutoCad = @("acdbmgd.dll", "acmgd.dll", "accoremgd.dll", "AdWindows.dll", "AcWindows.dll")
Get-ChildItem $out -File |
    Where-Object { $_.Extension -in ".dll", ".json" -and $cuaAutoCad -notcontains $_.Name } |
    Copy-Item -Destination $noiDung

# Thư viện MEPF offline tối thiểu đi CÙNG bundle để máy mới dùng được XBOSS_VE_PHUKIEN khi chưa
# có server. Plugin chỉ seed cặp này khi cache hoàn toàn trống; cache tải từ server/nạp tay vẫn thắng.
$thuVienNguon = Join-Path $PSScriptRoot "block-library"
$manifestThuVien = Join-Path $thuVienNguon "manifest.json"
$dwgThuVien = Join-Path $thuVienNguon "blocks.dwg"
if (-not (Test-Path $manifestThuVien) -or -not (Test-Path $dwgThuVien)) {
    throw "Thiếu thư viện MEPF đóng kèm: cần đủ '$manifestThuVien' và '$dwgThuVien'."
}
$thuVienDich = Join-Path $noiDung "BlockLibrary"
New-Item -ItemType Directory -Path $thuVienDich -Force | Out-Null
Copy-Item -LiteralPath $manifestThuVien, $dwgThuVien -Destination $thuVienDich

$soTep = (Get-ChildItem $noiDung -File -Recurse).Count
Write-Host "[XBoss] Đã tạo gói: $dich ($soTep tệp trong Contents, version $version)" -ForegroundColor Green

if ($ChiDongGoi -and -not $KhongNen) {
    # Nén thư mục .bundle thành .zip cạnh nó + ghi checksum SHA-256 — đây là artifact đính vào
    # GitHub Release (xem .github/workflows/release.yml) và đích trỏ tới của XBOSS_PLUGIN_URL.
    $zip = Join-Path $goc "dist\XBoss.bundle-$version.zip"
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path $dich -DestinationPath $zip -CompressionLevel Optimal
    $hash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    $tenZip = Split-Path -Leaf $zip
    # Định dạng chuẩn `sha256sum` (hash + 2 dấu cách + tên tệp) để `sha256sum -c` xác minh được.
    Set-Content -Path "$zip.sha256" -Value "$hash  $tenZip" -Encoding ASCII -NoNewline
    Write-Host "[XBoss] Đã nén: $zip" -ForegroundColor Green
    Write-Host "[XBoss] SHA-256: $hash" -ForegroundColor Green
}

if ($ChiDongGoi) {
    Write-Host "[XBoss] Chép cả thư mục XBoss.bundle (hoặc giải nén .zip) sang máy trạm, đặt vào:" -ForegroundColor Yellow
    Write-Host "        %APPDATA%\Autodesk\ApplicationPlugins\" -ForegroundColor Yellow
} else {
    Write-Host "[XBoss] Mở AutoCAD 2026 — dòng lệnh phải hiện '[XBoss] Plugin ... đã nạp'." -ForegroundColor Yellow
    Write-Host "[XBoss] Gỡ cài đặt: xoá thư mục trên." -ForegroundColor Yellow
}
