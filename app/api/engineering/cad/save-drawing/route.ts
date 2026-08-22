import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { queryOne, run, insertId } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/save-drawing — Lưu trữ bản vẽ chuẩn hóa theo cấu trúc thư mục quy chuẩn:
// drawings/
//   ├── design/
//   │   ├── origin/ (file gốc)
//   │   └── iso/    (chuẩn hóa)
//   ├── bim/
//   ├── shop/
//   └── asbuilt/
// Tên file quy chuẩn: [project_code]_[work_package_code]_[systems]_[kind-subfolder]_[name]_[date]_[drawing_versions].[ext]

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const body = await req.json();
    const {
      projectId: inputProjectId,
      projectCode = "PRJ01",
      systems = "HVAC",
      workPackageId = null,
      workPackageCode = "WP-MEPF-01",
      kind = "design", // 'design' | 'bim' | 'shop' | 'asbuilt'
      subFolder = "iso", // 'origin' | 'iso' (for design)
      name = "Bản_Vẽ_Chuẩn_Hóa",
      date = new Date().toISOString().slice(0, 10).replace(/-/g, ""),
      drawingVersions = "Rev01",
      fileContent = "",
      fileExtension = "dxf",
      approverName = "Kỹ Sư Trưởng MEPF",
      approvalNotes = "Bản vẽ đã qua 5 bước chuẩn hóa CAD 2D và kiểm tra chất lượng Gate 0.",
    } = body;

    const projectId = inputProjectId || (await getCurrentProjectId(user)) || 1;

    // Chuẩn hóa chuỗi an toàn cho tên file (không khoảng trắng, ký tự đặc biệt)
    const cleanStr = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    const cProject = cleanStr(projectCode || "PRJ01");
    const cWp = cleanStr(workPackageCode || "WP01");
    const cSys = cleanStr(systems || "HVAC");
    const cKind = kind.toLowerCase();
    const cSub = cKind === "design" ? cleanStr(subFolder || "iso").toLowerCase() : "";
    const cName = cleanStr(name || "Ban_Ve");
    const cDate = cleanStr(date || new Date().toISOString().slice(0, 10).replace(/-/g, ""));
    const cRev = cleanStr(drawingVersions || "Rev01");
    const cExt = cleanStr(fileExtension || "dxf").toLowerCase();

    // Sinh tên file quy chuẩn
    const kindTag = cKind === "design" ? `DESIGN-${cSub.toUpperCase()}` : cKind.toUpperCase();
    const standardFileName = `${cProject}_${cWp}_${cSys}_${kindTag}_${cName}_${cDate}_${cRev}.${cExt}`;

    // Xác định thư mục đích theo cấu trúc: drawings/[systems]/[kind]/[subfolder?]
    // Cả thư mục data/uploads/drawings và root drawings đều được đồng bộ
    let relativeSubPath = "";
    if (cKind === "design") {
      relativeSubPath = join(cSys, "design", cSub || "iso");
    } else if (cKind === "bim") {
      relativeSubPath = join(cSys, "bim");
    } else if (cKind === "shop") {
      relativeSubPath = join(cSys, "shop");
    } else if (cKind === "asbuilt") {
      relativeSubPath = join(cSys, "asbuilt");
    } else {
      relativeSubPath = join(cSys, "design", "iso");
    }

    // 1. Thư mục trong data/uploads/drawings/
    const dataUploadsDir = join(process.cwd(), "data", "uploads", "drawings", relativeSubPath);
    if (!existsSync(dataUploadsDir)) {
      mkdirSync(dataUploadsDir, { recursive: true });
    }
    const fullDataPath = join(dataUploadsDir, standardFileName);
    writeFileSync(fullDataPath, fileContent || ";; Standardized CAD Drawing by XBoss\n", "utf8");

    // 2. Thư mục root drawings/
    const rootDrawingsDir = join(process.cwd(), "drawings", relativeSubPath);
    if (!existsSync(rootDrawingsDir)) {
      mkdirSync(rootDrawingsDir, { recursive: true });
    }
    const fullRootPath = join(rootDrawingsDir, standardFileName);
    writeFileSync(fullRootPath, fileContent || ";; Standardized CAD Drawing by XBoss\n", "utf8");

    // 3. Ghi nhận vào Cơ sở dữ liệu bảng drawings & drawing_revisions
    const drawingCode = `${cSys}-${kindTag}-${cRev}-${cDate.slice(-4)}`;
    const drawingTitle = `${name} (${kindTag} - ${cRev})`;

    // Kiểm tra xem drawing code đã tồn tại chưa
    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM drawings WHERE code = ? AND project_id = ?`,
      drawingCode,
      projectId,
    );

    let drawingId = existing?.id;
    if (!drawingId) {
      const validKind = ["shop", "asbuilt", "bim", "method", "design"].includes(cKind)
        ? cKind
        : "design";

      drawingId = await insertId(
        `INSERT INTO drawings (code, name, kind, system_group, work_package_id, project_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        drawingCode,
        drawingTitle,
        validKind,
        cSys,
        workPackageId ? Number(workPackageId) : null,
        projectId,
        user.id,
      );
    }

    // Tạo bản ghi revision
    const existingRev = await queryOne<{ id: number }>(
      `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
      drawingId,
      cRev,
    );

    let revisionId = existingRev?.id;
    if (!revisionId && drawingId) {
      revisionId = await insertId(
        `INSERT INTO drawing_revisions (
          drawing_id, rev, file_name, original_name, mime_type, size_bytes,
          status, submitted_at, decided_at, decision_note, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'approved', CURRENT_DATE, CURRENT_DATE, ?, ?, NOW())`,
        drawingId,
        cRev,
        join(relativeSubPath, standardFileName).replace(/\\/g, "/"),
        standardFileName,
        cExt === "dxf" ? "application/dxf" : "application/octet-stream",
        Buffer.byteLength(fileContent || "", "utf8"),
        `[Phê duyệt Gate 0 - ${approverName}]: ${approvalNotes}`,
        user.id,
      );
    }

    return NextResponse.json({
      success: true,
      standardFileName,
      relativeDirectory: join("drawings", relativeSubPath).replace(/\\/g, "/"),
      fullUploadPath: `data/uploads/drawings/${relativeSubPath}/${standardFileName}`.replace(
        /\\/g,
        "/",
      ),
      drawingId,
      revisionId,
      drawingCode,
      message: `Đã lưu bản vẽ thành công vào drawings/${relativeSubPath}/${standardFileName}`,
    });
  } catch (error: any) {
    console.error("Save standardized drawing error:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi lưu trữ bản vẽ chuẩn hóa" },
      { status: 500 },
    );
  }
}
