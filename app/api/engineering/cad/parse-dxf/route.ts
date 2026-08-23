import { NextResponse } from "next/server";
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  parseDxf,
  parseDwgBinary,
  generateStandardizedAutocadScript,
  DwgUnsupportedError,
} from "@/lib/cad/dxf-parser";
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

function generateStandard2dDxf(title: string, system: string): string {
  return `0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
0
LAYER
2
M-DUCT-SUPP
70
0
62
4
6
CONTINUOUS
0
LAYER
2
M-DUCT-RETN
70
0
62
6
6
CONTINUOUS
0
LAYER
2
P-PIPE-SANR
70
0
62
3
6
CONTINUOUS
0
LAYER
2
E-CABL-TRAY
70
0
62
1
6
CONTINUOUS
0
LAYER
2
F-SPRN-PIPE
70
0
62
1
6
CONTINUOUS
0
LAYER
2
A-WALL-GRID
70
0
62
8
6
CONTINUOUS
0
LAYER
2
G-ANNO-TEXT
70
0
62
7
6
CONTINUOUS
0
LAYER
2
G-ANNO-DIMS
70
0
62
2
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
BLOCKS
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
8
A-WALL-GRID
10
0.0
20
0.0
30
0.0
11
36000.0
21
0.0
31
0.0
0
LINE
8
A-WALL-GRID
10
36000.0
20
0.0
30
0.0
11
36000.0
21
18000.0
31
0.0
0
LINE
8
A-WALL-GRID
10
36000.0
20
18000.0
30
0.0
11
0.0
21
18000.0
31
0.0
0
LINE
8
A-WALL-GRID
10
0.0
20
18000.0
30
0.0
11
0.0
21
0.0
31
0.0
0
LINE
8
M-DUCT-SUPP
10
3000.0
20
9000.0
30
0.0
11
33000.0
21
9000.0
31
0.0
0
LINE
8
M-DUCT-RETN
10
3000.0
20
12000.0
30
0.0
11
33000.0
21
12000.0
31
0.0
0
LINE
8
P-PIPE-SANR
10
3000.0
20
6000.0
30
0.0
11
33000.0
21
6000.0
31
0.0
0
LINE
8
E-CABL-TRAY
10
3000.0
20
15000.0
30
0.0
11
33000.0
21
15000.0
31
0.0
0
LINE
8
F-SPRN-PIPE
10
3000.0
20
3000.0
30
0.0
11
33000.0
21
3000.0
31
0.0
0
TEXT
8
G-ANNO-TEXT
10
18000.0
20
9500.0
30
0.0
40
300.0
1
èng giã cÊp l¹nh AHU-01 800x500
0
TEXT
8
G-ANNO-TEXT
10
18000.0
20
12500.0
30
0.0
40
300.0
1
èng giã håi 700x400
0
TEXT
8
G-ANNO-TEXT
10
18000.0
20
6500.0
30
0.0
40
300.0
1
èng thót n−íc D114 dèc i=1.5% BOP=+2850
0
TEXT
8
G-ANNO-TEXT
10
18000.0
20
15500.0
30
0.0
40
300.0
1
M¸ng c¸p ®iÖn Trunking 400x100
0
TEXT
8
G-ANNO-TEXT
10
18000.0
20
3500.0
30
0.0
40
300.0
1
§Çu phun PCCC Sprinkler 68øC quay xuèng
0
INSERT
8
M-DUCT-SUPP
2
VAV_BOX_01
10
12000.0
20
9000.0
30
0.0
0
INSERT
8
M-DUCT-SUPP
2
VAV_BOX_02
10
24000.0
20
9000.0
30
0.0
0
INSERT
8
F-SPRN-PIPE
2
SPRN_HEAD_68C
10
10000.0
20
3000.0
30
0.0
0
INSERT
8
F-SPRN-PIPE
2
SPRN_HEAD_68C
10
20000.0
20
3000.0
30
0.0
0
DIMENSION
8
G-ANNO-DIMS
10
3000.0
20
9000.0
30
0.0
11
33000.0
21
9000.0
31
0.0
1
30000
0
ENDSEC
0
EOF`;
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
      dxfContent = generateStandard2dDxf(fileName, "MEPF");
      sourcePath = `sample/${fileName}`;
      realFileFound = false;
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
      result.isRealDrawing = true;
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
