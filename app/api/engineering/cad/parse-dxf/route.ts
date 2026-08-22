import { NextResponse } from "next/server";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { getCurrentUser, CAN } from "@/lib/auth";
import { parseDxf, parseDwgBinary, generateStandardizedAutocadScript } from "@/lib/cad/dxf-parser";
import { queryOne } from "@/lib/db";
import { storageGet } from "@/lib/storage";

export const dynamic = "force-dynamic";

const DRAWINGS_DIR = join(process.cwd(), "data", "uploads", "drawings");

/**
 * Tìm kiếm đệ quy tệp trong thư mục data/uploads/drawings
 */
function findRealFileOnDisk(
  queryStr: string,
): { fullPath: string; relativePath: string; fileName: string } | null {
  if (!existsSync(DRAWINGS_DIR)) return null;

  const cleanQuery = queryStr
    .trim()
    .toLowerCase()
    .replace(/\.(dwg|dxf|pdf|bak)$/i, "");
  const stack: string[] = [""];

  while (stack.length > 0) {
    const currentRel = stack.pop()!;
    const currentFull = join(DRAWINGS_DIR, currentRel);
    try {
      const entries = readdirSync(currentFull, { withFileTypes: true });
      for (const entry of entries) {
        const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          stack.push(relPath);
        } else if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if ([".dwg", ".dxf", ".pdf"].includes(ext)) {
            const entryBase = basename(entry.name, ext).toLowerCase();
            if (
              entryBase === cleanQuery ||
              entry.name.toLowerCase() === queryStr.toLowerCase() ||
              entryBase.includes(cleanQuery) ||
              cleanQuery.includes(entryBase) ||
              relPath.toLowerCase().includes(queryStr.toLowerCase())
            ) {
              return {
                fullPath: join(currentFull, entry.name),
                relativePath: relPath,
                fileName: entry.name,
              };
            }
          }
        }
      }
    } catch {
      // skip unreadable directories
    }
  }

  return null;
}

// POST /api/engineering/cad/parse-dxf — Phân tích tệp CAD thật (DXF/DWG/PDF) hoặc nội dung tải lên
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập module CAD/BIM" }, { status: 403 });
  }

  try {
    const body = await req.json();
    let dxfContent: string = body.dxfContent || "";
    let fileBase64: string = body.fileBase64 || "";
    let fileName = body.fileName || "drawing_model.dxf";
    let realFileFound = false;
    let sourcePath = fileName;
    let fileBuffer: Buffer | null = null;

    // 1. Nếu client truyền tệp Base64 (upload tệp nhị phân DWG / PDF / DXF trực tiếp)
    if (fileBase64) {
      fileBuffer = Buffer.from(fileBase64, "base64");
      realFileFound = true;
    }

    // 2. Nếu truyền đường dẫn tệp cụ thể trên đĩa (filePath)
    if (!fileBuffer && body.filePath) {
      const explicitPath = join(DRAWINGS_DIR, body.filePath);
      if (existsSync(explicitPath) && statSync(explicitPath).isFile()) {
        fileBuffer = readFileSync(explicitPath);
        fileName = basename(explicitPath);
        sourcePath = body.filePath;
        realFileFound = true;
      }
    }

    // 3. Nếu chọn từ bản vẽ thiết kế trong cơ sở dữ liệu (drawingId)
    if (!fileBuffer && body.drawingId) {
      const drawing = await queryOne<{
        id: number;
        code: string;
        name: string;
        system_group: string | null;
      }>(`SELECT id, code, name, system_group FROM drawings WHERE id = ?`, [
        Number(body.drawingId),
      ]);

      if (drawing) {
        fileName = `${drawing.code}.dwg`;
        // Kiểm tra trong drawing_revisions
        const rev = await queryOne<{ file_name: string; original_name: string | null }>(
          `SELECT file_name, original_name FROM drawing_revisions WHERE drawing_id = ? ORDER BY id DESC LIMIT 1`,
          [drawing.id],
        );

        if (rev?.file_name) {
          const revBuf = await storageGet(user.orgId, rev.file_name);
          if (revBuf) {
            fileBuffer = Buffer.from(revBuf);
            fileName = rev.original_name || rev.file_name;
            sourcePath = rev.file_name;
            realFileFound = true;
          } else {
            // Thử đọc trực tiếp từ thư mục data/uploads trên đĩa cục bộ
            const localFile = join(process.cwd(), "data", "uploads", rev.file_name);
            if (existsSync(localFile) && statSync(localFile).isFile()) {
              fileBuffer = readFileSync(localFile);
              fileName = rev.original_name || basename(localFile);
              sourcePath = rev.file_name;
              realFileFound = true;
            }
          }
        }

        // Nếu chưa có trong storage, tìm kiếm đệ quy trong thư mục data/uploads/drawings
        if (!fileBuffer) {
          const diskMatch = findRealFileOnDisk(drawing.code) || findRealFileOnDisk(drawing.name);
          if (diskMatch) {
            fileBuffer = readFileSync(diskMatch.fullPath);
            fileName = diskMatch.fileName;
            sourcePath = diskMatch.relativePath;
            realFileFound = true;
          }
        }
      }
    }

    // 4. Nếu truyền fileName hoặc chưa tìm thấy, thử tìm trên đĩa theo fileName
    if (!fileBuffer && !dxfContent && fileName) {
      const diskMatch = findRealFileOnDisk(fileName);
      if (diskMatch) {
        fileBuffer = readFileSync(diskMatch.fullPath);
        fileName = diskMatch.fileName;
        sourcePath = diskMatch.relativePath;
        realFileFound = true;
      }
    }

    if (!fileBuffer && !dxfContent) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Không tìm thấy tệp bản vẽ CAD trên máy chủ hoặc hệ thống lưu trữ. Vui lòng tải file .dwg/.dxf lên.",
          data: null,
          realFileFound: false,
        },
        { status: 404 },
      );
    }

    let result;
    if (fileBuffer) {
      const ext = extname(fileName).toLowerCase();
      if (ext === ".dwg" || fileBuffer.subarray(0, 4).toString("ascii").startsWith("AC10")) {
        result = parseDwgBinary(fileBuffer, fileName);
      } else {
        result = parseDxf(fileBuffer.toString("utf8"), fileName);
      }
      result.isRealDrawing = true;
      result.sourcePath = sourcePath;
      result.fileSizeBytes = fileBuffer.length;
    } else {
      result = parseDxf(dxfContent, fileName);
    }

    const scrScript = generateStandardizedAutocadScript(result.layers);

    return NextResponse.json({
      success: true,
      data: result,
      scrScript,
      realFileFound,
      sourcePath,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
