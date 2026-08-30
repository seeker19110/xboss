// scripts/check-plugin-bundle.ts — Cổng CI cho gói cài plugin AutoCAD (plugin-autocad/).
//
// VÌ SAO: bundle/PackageContents.xml (manifest autoloader AutoCAD) và dong-goi.ps1 (script
// đóng gói) là 2 tệp Windows-only, ít chạm tới nên dễ vỡ âm thầm (XML sai cú pháp, script
// BOM lệch) mà không job nào trong CI Linux bắt được — job `plugin`/`plugin_shim` chỉ build
// .NET, không đụng 2 tệp này. Script này chạy được trên Linux, không cần AutoCAD/Windows,
// không thêm dependency npm mới (tự viết kiểm well-formed đơn giản bằng ngăn xếp thẻ).
//
// Kiểm 3 việc:
//  1. bundle/PackageContents.xml là XML well-formed (khai báo hợp lệ + thẻ mở/đóng cân xứng —
//     đủ để bắt lỗi gõ tay thường gặp, không phải validator schema đầy đủ vì Autodesk không
//     công khai schema PackageContents.xsd).
//  2. dong-goi.ps1 PHẢI có BOM UTF-8 ở đầu tệp — Windows PowerShell 5.1 (bản mặc định của
//     Windows) đọc .ps1 KHÔNG BOM theo bảng mã ANSI, làm vỡ chữ tiếng Việt và lỗi cú pháp
//     (sự cố thật, xem chú thích đầu plugin-autocad/dong-goi.ps1). Đây là quy tắc NGƯỢC với
//     hầu hết tệp text khác trong repo (thường cấm BOM) — cố tình khác vì lý do kỹ thuật riêng
//     của PowerShell 5.1 trên Windows, không phải sơ suất.
//  3. Nếu máy có `pwsh` (GitHub Actions ubuntu-latest có sẵn PowerShell Core) thì parse thử cú
//     pháp dong-goi.ps1 bằng PSParser — bắt lỗi cú pháp mà không cần chạy thật (không có
//     AutoCAD/.NET SDK 10 trên runner Linux). Không có pwsh thì bỏ qua bước này (cảnh báo).
//
// Chạy: npx tsx scripts/check-plugin-bundle.ts
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "plugin-autocad/bundle/PackageContents.xml");
const scriptPath = join(root, "plugin-autocad/dong-goi.ps1");

let loi = 0;

console.log("=== Kiểm gói cài plugin AutoCAD (plugin-autocad/) ===");

// 1) PackageContents.xml well-formed — kiểm nhẹ bằng ngăn xếp thẻ (không cần dependency XML).
function kiemXmlWellFormed(xml: string): string | null {
  if (!/^\s*<\?xml\s/.test(xml)) return "thiếu khai báo <?xml ... ?> ở đầu tệp";
  // Bỏ khai báo, comment, CDATA trước khi bóc thẻ.
  const sach = xml
    .replace(/<\?xml[\s\S]*?\?>/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const ngan: string[] = [];
  const reTag = /<\/?([a-zA-Z_][\w.-]*)([^<>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let soTagMo = 0;
  while ((m = reTag.exec(sach)) !== null) {
    const dong = xml.slice(0, m.index).split("\n").length;
    const [full, ten, thuocTinh, tuDong] = m;
    const dongDong = full.startsWith("</");
    if (dongDong) {
      const dinh = ngan.pop();
      if (dinh !== ten) return `dòng ${dong}: thẻ đóng </${ten}> không khớp thẻ mở gần nhất${dinh ? ` <${dinh}>` : " (không có thẻ mở)"}`;
    } else if (tuDong === "/") {
      // thẻ tự đóng <tag ... /> — không đẩy vào ngăn xếp.
      soTagMo++;
    } else {
      ngan.push(ten);
      soTagMo++;
    }
    void thuocTinh;
  }
  if (soTagMo === 0) return "không tìm thấy thẻ XML nào";
  if (ngan.length > 0) return `còn ${ngan.length} thẻ chưa đóng: <${ngan.join(">, <")}>`;
  return null;
}

const manifestXml = readFileSync(manifestPath, "utf8");
const loiXml = kiemXmlWellFormed(manifestXml);
if (loiXml) {
  loi++;
  console.error(`[LỖI] bundle/PackageContents.xml không phải XML hợp lệ: ${loiXml}`);
} else {
  console.log("[OK] bundle/PackageContents.xml là XML well-formed.");
}

// 2) dong-goi.ps1 phải CÓ BOM UTF-8.
const scriptBuf = readFileSync(scriptPath);
const coBom = scriptBuf.length >= 3 && scriptBuf[0] === 0xef && scriptBuf[1] === 0xbb && scriptBuf[2] === 0xbf;
if (!coBom) {
  loi++;
  console.error(
    "[LỖI] plugin-autocad/dong-goi.ps1 THIẾU BOM UTF-8 ở đầu tệp — Windows PowerShell 5.1 sẽ " +
      "đọc theo ANSI và vỡ chữ tiếng Việt (sự cố thật đã xảy ra, xem chú thích đầu tệp). " +
      "Lưu lại với BOM UTF-8 (vd `Set-Content -Encoding UTF8` trên PowerShell 5.1, hoặc " +
      "thêm 3 byte EF BB BF ở đầu tệp).",
  );
} else {
  console.log("[OK] plugin-autocad/dong-goi.ps1 có BOM UTF-8 (đúng yêu cầu PowerShell 5.1).");
}

// 3) Parse thử cú pháp bằng pwsh nếu có sẵn — chỉ cảnh báo khi thiếu pwsh, không đỏ CI.
try {
  execFileSync("pwsh", ["-NoProfile", "-Command", "$null = 1"], { stdio: "ignore" });
  try {
    execFileSync(
      "pwsh",
      [
        "-NoProfile",
        "-Command",
        `$errs = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${scriptPath}', [ref]$null, [ref]$errs); if ($errs.Count -gt 0) { $errs | ForEach-Object { Write-Error $_.Message }; exit 1 }`,
      ],
      { stdio: "pipe" },
    );
    console.log("[OK] dong-goi.ps1 không có lỗi cú pháp PowerShell (kiểm bằng pwsh).");
  } catch (err) {
    loi++;
    console.error(`[LỖI] dong-goi.ps1 có lỗi cú pháp PowerShell: ${(err as Error).message}`);
  }
} catch {
  console.warn("[CẢNH BÁO] Không thấy `pwsh` trên máy này — bỏ qua kiểm cú pháp PowerShell.");
}

if (loi > 0) {
  console.error(`\n[LỖI] ${loi} vấn đề ở gói cài plugin AutoCAD.`);
  process.exit(1);
}

console.log("\n[OK] Gói cài plugin AutoCAD hợp lệ.");
