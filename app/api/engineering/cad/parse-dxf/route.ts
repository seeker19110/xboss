import { NextResponse } from "next/server";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  parseDxf,
  parseDwgBinary,
  generateStandardizedAutocadScript,
  DwgUnsupportedError,
} from "@/lib/ky-thuat/cad/dxf-parser";
import { queryOne } from "@/lib/db";
import { storageGet } from "@/lib/nen/storage";

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
        const rev = await queryOne<{
          file_name: string;
          iso_path: string | null;
          original_name: string | null;
        }>(
          `SELECT file_name, iso_path, original_name FROM drawing_revisions WHERE drawing_id = ? ORDER BY id DESC LIMIT 1`,
          [drawing.id],
        );

        if (rev?.file_name) {
          // Lớp storage nhận tên tệp PHẲNG (chặn path traversal). Bản ghi cũ lưu đường dẫn cây
          // ISO 19650 (`HVAC/design/iso/....dxf`) thì bỏ qua storage, đọc thẳng theo cây thư mục
          // bên dưới — không thì storageGet ném lỗi và cả route hỏng.
          const revBuf = rev.file_name.includes("/")
            ? null
            : await storageGet(user.orgId, rev.file_name);
          if (revBuf) {
            fileBuffer = Buffer.from(revBuf);
            fileName = rev.original_name || rev.file_name;
            sourcePath = rev.file_name;
            realFileFound = true;
          } else {
            // Thử đọc trực tiếp trên đĩa cục bộ: bản tải lên thường nằm phẳng trong
            // data/uploads/, còn bản chuẩn hoá do save-drawing ghi nằm trong cây
            // data/uploads/drawings/<hệ>/<loại>/…
            const diskCandidates = [
              join(process.cwd(), "data", "uploads", rev.file_name),
              join(DRAWINGS_DIR, rev.file_name),
            ];
            // Bản chuẩn hoá lưu qua lớp storage: đường dẫn theo cây ISO 19650 nằm ở cột iso_path
            if (rev.iso_path) diskCandidates.push(join(DRAWINGS_DIR, rev.iso_path));
            for (const localFile of diskCandidates) {
              if (existsSync(localFile) && statSync(localFile).isFile()) {
                fileBuffer = readFileSync(localFile);
                fileName = rev.original_name || basename(localFile);
                sourcePath = rev.file_name;
                realFileFound = true;
                break;
              }
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

    // Không tìm thấy tệp thật thì báo thẳng, KHÔNG sinh bản vẽ mẫu rồi gắn cờ isRealDrawing:
    // trước đây trang chuẩn hoá hiển thị một bản vẽ MEPF do máy chế ra như thể là bản vẽ của
    // người dùng (M98/M99 — không bịa dữ liệu).
    if (!fileBuffer && !dxfContent) {
      return NextResponse.json(
        {
          error:
            "Không tìm thấy tệp bản vẽ tương ứng trên máy chủ. Hãy tải lên tệp DXF, hoặc chọn bản vẽ đã có bản phát hành đính kèm.",
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
        // Truyền thẳng buffer: parseDxf tự nhận DXF nhị phân và tự chọn bảng mã. Ép sẵn
        // `toString("utf8")` như trước làm hỏng mọi bản vẽ ghi bằng TCVN3/VNI/CP1258 — chữ có dấu
        // biến thành ký tự thay thế ngay ở bước đọc tệp, Bác Sĩ Font không còn gì để cứu.
        result = parseDxf(fileBuffer, fileName);
      }
      result.isRealDrawing = result.entities.length > 0;
      result.sourcePath = sourcePath;
      result.fileSizeBytes = fileBuffer.length;
    } else {
      result = parseDxf(dxfContent, fileName);
      // Nội dung do client gửi lên vẫn là bản vẽ thật của người dùng, nhưng chỉ đánh dấu khi
      // parse ra được thực thể — tệp rác không được coi là bản vẽ hợp lệ.
      result.isRealDrawing = result.entities.length > 0;
      result.sourcePath = sourcePath;
      result.fileSizeBytes = dxfContent.length;
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
    if (err instanceof DwgUnsupportedError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
