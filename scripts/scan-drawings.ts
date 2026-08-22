// scripts/scan-drawings.ts — Tự động quét file trong data/uploads/drawings và đăng ký vào DB
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { query, queryOne, run, getPool } from "../lib/db";

const DRAWINGS_DIR = join(process.cwd(), "data", "uploads", "drawings");

function parseDrawingInfo(filename: string) {
  const ext = extname(filename).toLowerCase();
  const nameWithoutExt = basename(filename, ext);

  // Phát hiện hệ thống (System Group)
  let systemGroup = "HVAC";
  const upper = nameWithoutExt.toUpperCase();
  if (
    upper.includes("PLUMB") ||
    upper.includes("SAN") ||
    upper.includes("CAP_THOAT") ||
    upper.startsWith("P-") ||
    upper.includes("NUOC")
  ) {
    systemGroup = "PLUMBING";
  } else if (
    upper.includes("ELEC") ||
    upper.includes("DIEN") ||
    upper.startsWith("E-") ||
    upper.includes("TRAY")
  ) {
    systemGroup = "ELECTRICAL";
  } else if (
    upper.includes("FIRE") ||
    upper.includes("PCCC") ||
    upper.startsWith("F-") ||
    upper.includes("SPK")
  ) {
    systemGroup = "FIREFIGHTING";
  } else if (
    upper.includes("ARCH") ||
    upper.includes("KT") ||
    upper.startsWith("A-") ||
    upper.includes("KIEN_TRUC")
  ) {
    systemGroup = "ARCHITECTURE";
  } else if (
    upper.includes("STRUCT") ||
    upper.includes("KC") ||
    upper.startsWith("S-") ||
    upper.includes("KET_CAU")
  ) {
    systemGroup = "STRUCTURE";
  }

  // Phát hiện loại bản vẽ (Kind)
  let kind: "design" | "shop" | "bim" | "method" | "asbuilt" = "design";
  if (upper.includes("SHOP")) kind = "shop";
  else if (upper.includes("BIM") || ext === ".ifc" || ext === ".rvt" || ext === ".nwd")
    kind = "bim";
  else if (upper.includes("HOAN_CONG") || upper.includes("ASBUILT") || upper.includes("AS_BUILT"))
    kind = "asbuilt";
  else if (upper.includes("BPTC") || upper.includes("BIEN_PHAP")) kind = "method";

  // Phát hiện tầng (Floor)
  let floorLabel = "Tầng Điển Hình";
  const floorMatch = upper.match(/FL(\d+)|TANG_?(\d+)|T(\d+)|HAM_?(\d+)|BASEMENT_?(\d+)/i);
  if (floorMatch) {
    const num = floorMatch[1] || floorMatch[2] || floorMatch[3];
    const basement = floorMatch[4] || floorMatch[5];
    if (basement) floorLabel = `Tầng Hầm ${basement}`;
    else if (num) floorLabel = `Tầng ${num}`;
  }

  // Phát hiện Revision
  let rev = "Rev A";
  const revMatch = upper.match(/REV[_\s-]?([A-Z0-9]+)|R([0-9]+)/i);
  if (revMatch) {
    rev = `Rev ${revMatch[1] || revMatch[2]}`;
  }

  return {
    code: nameWithoutExt
      .replace(/_REV.*$/i, "")
      .replace(/_R\d+$/i, "")
      .trim(),
    name: nameWithoutExt.replace(/_/g, " "),
    kind,
    systemGroup,
    floorLabel,
    rev,
    ext,
  };
}

async function main() {
  console.log(`🔍 Bắt đầu quét thư mục bản vẽ: ${DRAWINGS_DIR}`);

  let files: string[] = [];
  try {
    files = readdirSync(DRAWINGS_DIR).filter((f) => {
      const ext = extname(f).toLowerCase();
      return [".pdf", ".dwg", ".dxf", ".png", ".jpg", ".ifc"].includes(ext);
    });
  } catch (err: any) {
    console.error(`❌ Không đọc được thư mục ${DRAWINGS_DIR}:`, err.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log(`ℹ️ Thư mục ${DRAWINGS_DIR} hiện chưa có file bản vẽ nào.`);
    console.log(
      `👉 Hãy copy các file bản vẽ (.pdf, .dwg, .dxf, .png, .ifc) vào thư mục trên rồi chạy lại lệnh!`,
    );
    await getPool().end();
    return;
  }

  console.log(`📦 Tìm thấy ${files.length} file bản vẽ. Đang đồng bộ vào Database...`);

  let syncedCount = 0;
  for (const filename of files) {
    const fullPath = join(DRAWINGS_DIR, filename);
    const stat = statSync(fullPath);
    const content = readFileSync(fullPath);
    const sha256 = createHash("sha256").update(content).digest("hex");
    const info = parseDrawingInfo(filename);

    // Lấy default project nếu có
    const defaultProject = await queryOne<{ id: number }>(
      `SELECT id FROM projects ORDER BY id LIMIT 1`,
    );
    const projectId = defaultProject?.id || 1;

    // 1. Kiểm tra hoặc chèn bản ghi drawings
    let drawing = await queryOne<{ id: number }>(
      `SELECT id FROM drawings WHERE code = ? AND project_id = ?`,
      info.code,
      projectId,
    );

    if (!drawing) {
      const res = await query<{ id: number }>(
        `INSERT INTO drawings (project_id, code, name, kind, system_group, floor_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())
         RETURNING id`,
        projectId,
        info.code,
        info.name,
        info.kind,
        info.systemGroup,
        info.floorLabel,
      );
      drawing = res[0];
      console.log(
        `  + Đã tạo bản vẽ mới: [${info.code}] ${info.name} (${info.systemGroup}, ${info.floorLabel})`,
      );
    }

    if (!drawing) continue;

    // 2. Kiểm tra hoặc chèn drawing_revisions
    const existingRev = await queryOne<{ id: number }>(
      `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
      drawing.id,
      info.rev,
    );

    if (!existingRev) {
      await run(
        `INSERT INTO drawing_revisions (
           drawing_id, rev, status, file_name, file_size_bytes, file_sha256,
           submitted_at, created_by, created_at
         ) VALUES (?, ?, 'approved', ?, ?, ?, NOW(), 1, NOW())`,
        drawing.id,
        info.rev,
        `drawings/${filename}`,
        stat.size,
        sha256,
      );
      console.log(
        `    -> Đã đăng ký phiên bản ${info.rev} (File: ${filename}, Size: ${(stat.size / 1024).toFixed(1)} KB)`,
      );
      syncedCount++;
    }
  }

  console.log(
    `\n🎉 Hoàn thành đồng bộ! Đã cập nhật ${syncedCount} phiên bản bản vẽ lên giao diện Web.`,
  );
  await getPool().end();
}

main().catch((err) => {
  console.error("Lỗi khi chạy quét bản vẽ:", err);
  process.exit(1);
});
