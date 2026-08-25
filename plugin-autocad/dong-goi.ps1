<#
  M99 — Đóng gói và cài plugin XBoss cho AutoCAD 2026 (thay cho việc chép tay từng DLL).

  Chạy trên máy Windows có AutoCAD 2026, từ thư mục gốc repo:

      pwsh -File plugin-autocad\dong-goi.ps1                 # build + cài vào %APPDATA%
      powershell -ExecutionPolicy Bypass -File plugin-autocad\dong-goi.ps1
      ... -ChiDongGoi                                        # chỉ tạo gói ra .\dist, KHÔNG cài
      ... -AcadDir "D:\AutoCAD 2026"                         # AutoCAD cài chỗ khác

  ĐÓNG AutoCAD trước khi chạy — DLL đang nạp thì không ghi đè được.
#>
[CmdletBinding()]
param(
    [string]$AcadDir = "C:\Program Files\Autodesk\AutoCAD 2026",
    [switch]$ChiDongGoi
)

$ErrorActionPreference = "Stop"
$goc = Split-Path -Parent $PSScriptRoot
$duAn = Join-Path $PSScriptRoot "XBoss.Cad.Acad\XBoss.Cad.Acad.csproj"

if (-not (Test-Path (Join-Path $AcadDir "acdbmgd.dll"))) {
    throw "Không thấy acdbmgd.dll trong '$AcadDir'. Truyền -AcadDir đúng thư mục cài AutoCAD 2026."
}

Write-Host "[XBoss] Build Adapter (Release)..." -ForegroundColor Cyan
dotnet build $duAn -c Release -p:AcadSdkDir="$AcadDir"
if ($LASTEXITCODE -ne 0) { throw "Build thất bại." }

$out = Join-Path $PSScriptRoot "XBoss.Cad.Acad\bin\Release"
$dich = if ($ChiDongGoi) { Join-Path $goc "dist\XBoss.bundle" }
        else { Join-Path $env:APPDATA "Autodesk\ApplicationPlugins\XBoss.bundle" }

if (Test-Path $dich) { Remove-Item $dich -Recurse -Force }
$noiDung = Join-Path $dich "Contents"
New-Item -ItemType Directory -Path $noiDung -Force | Out-Null

Copy-Item (Join-Path $PSScriptRoot "bundle\PackageContents.xml") $dich

# Chép output build, TRỪ các assembly do chính AutoCAD cung cấp lúc chạy (M99 §9.1: CopyLocal=false;
# chép nhầm chúng vào bundle là nguồn lỗi nạp assembly hai lần).
$cuaAutoCad = @("acdbmgd.dll", "acmgd.dll", "accoremgd.dll", "AdWindows.dll", "AcWindows.dll")
Get-ChildItem $out -File |
    Where-Object { $_.Extension -in ".dll", ".json" -and $cuaAutoCad -notcontains $_.Name } |
    Copy-Item -Destination $noiDung

$soTep = (Get-ChildItem $noiDung -File).Count
Write-Host "[XBoss] Đã tạo gói: $dich ($soTep tệp trong Contents)" -ForegroundColor Green
if ($ChiDongGoi) {
    Write-Host "[XBoss] Chép cả thư mục XBoss.bundle sang máy trạm, đặt vào:" -ForegroundColor Yellow
    Write-Host "        %APPDATA%\Autodesk\ApplicationPlugins\" -ForegroundColor Yellow
} else {
    Write-Host "[XBoss] Mở AutoCAD 2026 — dòng lệnh phải hiện '[XBoss] Plugin ... đã nạp'." -ForegroundColor Yellow
    Write-Host "[XBoss] Gỡ cài đặt: xoá thư mục trên." -ForegroundColor Yellow
}
