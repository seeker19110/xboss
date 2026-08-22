// app/api/drawings/scan-local/route.ts — Quét và đồng bộ bản vẽ từ thư mục cục bộ data/uploads/drawings
import { NextRequest, NextResponse } from "next/server";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

const DRAWINGS_DIR = join(process.cwd(), "data", "uploads", "drawings");

function parseDrawingInfo(filename: string) {
  const ext = extname(filename).toLowerCase();
  const nameWithoutExt = basename(filename, ext);

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

  let kind: "design" | "shop" | "bim" | "method" | "asbuilt" = "design";
  if (upper.includes("SHOP")) kind = "shop";
  else if (upper.includes("BIM") || ext === ".ifc" || ext === ".rvt" || ext === ".nwd")
    kind = "bim";
  else if (upper.includes("HOAN_CONG") || upper.includes("ASBUILT") || upper.includes("AS_BUILT"))
    kind = "asbuilt";
  else if (upper.includes("BPTC") || upper.includes("BIEN_PHAP")) kind = "method";

  let floorLabel = "Tầng Điển Hình";
  const floorMatch = upper.match(/FL(\d+)|TANG_?(\d+)|T(\d+)|HAM_?(\d+)|BASEMENT_?(\d+)/i);
  if (floorMatch) {
    const num = floorMatch[1] || floorMatch[2] || floorMatch[3];
    const basement = floorMatch[4] || floorMatch[5];
    if (basement) floorLabel = `Tầng Hầm ${basement}`;
    else if (num) floorLabel = `Tầng ${num}`;
  }

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

function getAllDrawingFilesRecursively(
  dir: string,
): Array<{ fullPath: string; relativePath: string; fileName: string }> {
  const results: Array<{ fullPath: string; relativePath: string; fileName: string }> = [];
  if (!existsSync(dir)) return results;

  const stack: string[] = [""];
  while (stack.length > 0) {
    const currentRel = stack.pop()!;
    const currentFull = join(dir, currentRel);
    try {
      const entries = readdirSync(currentFull, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          stack.push(relPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (
            [".dwg", ".dxf", ".pdf", ".png", ".jpg", ".ifc"].includes(ext) &&
            !entry.name.endsWith(".dwl") &&
            !entry.name.endsWith(".dwl2") &&
            !entry.name.endsWith(".bak")
          ) {
            results.push({
              fullPath: join(currentFull, entry.name),
              relativePath: relPath,
              fileName: entry.name,
            });
          }
        }
      }
    } catch {
      // skip errors
    }
  }

  return results;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role))
    return NextResponse.json({ error: "Bạn không có quyền đồng bộ bản vẽ" }, { status: 403 });

  if (!existsSync(DRAWINGS_DIR)) {
    return NextResponse.json(
      { error: "Thư mục data/uploads/drawings chưa tồn tại" },
      { status: 404 },
    );
  }

  const files = getAllDrawingFilesRecursively(DRAWINGS_DIR);
  const projectId = (await getCurrentProjectId(user)) || 1;
  let synced = 0;

  for (const item of files) {
    const fullPath = item.fullPath;
    const stat = statSync(fullPath);
    const content = readFileSync(fullPath);
    const sha256 = createHash("sha256").update(content).digest("hex");
    const info = parseDrawingInfo(item.fileName);

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
    }

    if (!drawing) continue;

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
         ) VALUES (?, ?, 'approved', ?, ?, ?, NOW(), ?, NOW())`,
        drawing.id,
        info.rev,
        `drawings/${item.relativePath}`,
        stat.size,
        sha256,
        user.id,
      );
      synced++;
    }
  }

  return NextResponse.json({
    ok: true,
    totalFilesOnDisk: files.length,
    newlySyncedRevisions: synced,
    message: `Đã quét và đồng bộ ${synced} bản vẽ mới (${files.length} tệp trên đĩa) vào hệ thống.`,
  });
}
