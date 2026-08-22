import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { queryOne, insertId, run } from "@/lib/db";
import {
  CAD_DRAWING_KINDS,
  DESIGN_SUB_FOLDERS,
  ALL_DRAWING_SYSTEMS,
  type CadDrawingKind,
  type DesignSubFolder,
  drawingRelativePath,
  drawingRoots,
  ensureDrawingDirs,
} from "@/lib/cad/drawing-storage";
import { validateDxf } from "@/lib/cad/dxf-writer";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/save-drawing — Lưu trữ bản vẽ chuẩn hóa
// Quy chuẩn quản trị:
// - Khi chưa duyệt (hoặc đang chỉnh sửa): Lưu tại thư mục tạm drawings/{systems}/temp/
// - Khi Kỹ Sư Trưởng phê duyệt Gate 0: Lưu chính thức vào đúng vị trí drawings/{systems}/{kind}/{subFolder?}/ và dọn sạch file tạm.
// Tên file quy chuẩn: [project_code]_[work_package_code]_[systems]_[kind-subfolder]_[name]_[date]_[drawing_versions].[ext]

// Chuẩn hóa chuỗi an toàn cho tên file/đường dẫn (không khoảng trắng, không ký tự
// đặc biệt — nên cũng loại sạch `.`/`/` gây path traversal).
function cleanStr(v: unknown, fallback: string): string {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  const cleaned = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    // Ghi bản vẽ = tạo drawing/revision mới → cùng quyền với sổ bản vẽ (M8).
    if (!CAN.manageDrawings(user.role)) {
      return NextResponse.json({ error: "Không có quyền lưu bản vẽ" }, { status: 403 });
    }

    const body = await req.json();
    const {
      projectId: inputProjectId,
      workPackageId = null,
      name = "Bản_Vẽ_Chuẩn_Hóa",
      fileContent = "",
      isApproved = false, // true = Phê duyệt chính thức -> Lưu vào đúng vị trí; false = Lưu tạm vào {systems}/temp
      approverName = "Kỹ Sư Trưởng MEPF",
      approvalNotes = "Bản vẽ đã qua chuẩn hóa CAD 2D và kiểm tra chất lượng Gate 0.",
    } = body;

    const approved = isApproved === true;
    // Ký duyệt Gate 0 là quyết định kỹ thuật của Kỹ sư trưởng — dùng quyền gate
    // kỹ thuật (Admin/PM/engineer), không phải quyền duyệt revision của sổ bản vẽ.
    if (approved && !CAN.approveEngineeringGate(user.role)) {
      return NextResponse.json({ error: "Không có quyền phê duyệt bản vẽ" }, { status: 403 });
    }

    const projectId = inputProjectId || (await getCurrentProjectId(user)) || 1;

    // Chỉ nhận phân hệ/loại/thư mục con trong danh mục hợp lệ — chặn giá trị lạ từ
    // client chui vào đường dẫn ghi file.
    const cSys = cleanStr(body.systems, "HVAC").toUpperCase();
    if (!ALL_DRAWING_SYSTEMS.includes(cSys)) {
      return NextResponse.json({ error: "Phân hệ bản vẽ không hợp lệ" }, { status: 400 });
    }
    const cKind = cleanStr(body.kind, "design").toLowerCase() as CadDrawingKind;
    if (!(CAD_DRAWING_KINDS as readonly string[]).includes(cKind)) {
      return NextResponse.json({ error: "Loại bản vẽ không hợp lệ" }, { status: 400 });
    }
    const cSub = cleanStr(body.subFolder, "iso").toLowerCase() as DesignSubFolder;
    if (cKind === "design" && !(DESIGN_SUB_FOLDERS as readonly string[]).includes(cSub)) {
      return NextResponse.json({ error: "Thư mục con bản vẽ không hợp lệ" }, { status: 400 });
    }

    const cProject = cleanStr(body.projectCode, "PRJ01");
    const cWp = cleanStr(body.workPackageCode, "WP01");
    const cName = cleanStr(name, "Ban_Ve");
    const cDate = cleanStr(body.date, new Date().toISOString().slice(0, 10).replace(/-/g, ""));
    const cRev = cleanStr(body.drawingVersions, "Rev01");
    const cExt = cleanStr(body.fileExtension, "dxf").toLowerCase();

    // Sinh tên file quy chuẩn
    const kindTag = cKind === "design" ? `DESIGN-${cSub.toUpperCase()}` : cKind.toUpperCase();
    const standardFileName = `${cProject}_${cWp}_${cSys}_${kindTag}_${cName}_${cDate}_${cRev}.${cExt}`;

    // Xác định thư mục đích theo trạng thái phê duyệt:
    // - Chưa duyệt: drawings/{systems}/temp/
    // - Đã duyệt: drawings/{systems}/{kind}/{subfolder?}
    const relativeSubPath = drawingRelativePath(cSys, cKind, cSub, approved);
    const content =
      typeof fileContent === "string" && fileContent
        ? fileContent
        : ";; Standardized CAD Drawing by XBoss\n";

    // Kiểm trước khi ghi: bản vẽ DXF phải mở lại được trên AutoCAD. Ghi ra một tệp
    // hỏng rồi mới phát hiện lúc kỹ sư mở ngoài công trường là quá muộn.
    if (cExt === "dxf") {
      const check = validateDxf(content);
      if (!check.valid) {
        return NextResponse.json(
          {
            error: `Bản vẽ DXF không đạt chuẩn AutoCAD (${check.errors.length} lỗi cấu trúc) — chưa lưu.`,
            validation: check,
          },
          { status: 422 },
        );
      }
    }

    // Ghi tệp vào cả 2 gốc lưu trữ (drawings/ và data/uploads/drawings/).
    ensureDrawingDirs();
    for (const root of drawingRoots()) {
      mkdirSync(join(root, relativeSubPath), { recursive: true });
      writeFileSync(join(root, relativeSubPath, standardFileName), content, "utf8");
      // Đã phê duyệt chính thức → dọn sạch bản sao tạm trong thư mục temp (nếu có).
      if (approved) {
        const tempPath = join(root, cSys, "temp", standardFileName);
        if (existsSync(tempPath)) {
          try {
            unlinkSync(tempPath);
          } catch {}
        }
      }
    }

    // Ghi nhận vào Cơ sở dữ liệu bảng drawings & drawing_revisions
    const drawingCode = `${cSys}-${kindTag}-${cRev}-${cDate.slice(-4)}`;
    const drawingTitle = `${name} (${kindTag} - ${cRev})`;

    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM drawings WHERE code = ? AND project_id = ?`,
      drawingCode,
      projectId,
    );

    let drawingId = existing?.id;
    if (!drawingId) {
      drawingId = await insertId(
        `INSERT INTO drawings (code, name, kind, system_group, work_package_id, project_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        drawingCode,
        drawingTitle,
        cKind,
        cSys,
        workPackageId ? Number(workPackageId) : null,
        projectId,
        user.id,
      );
    }

    // Tạo hoặc cập nhật bản ghi revision. Trạng thái phải nằm trong enum của
    // drawing_revisions (lib/drawings.ts) — chưa duyệt = 'submitted' (đã trình).
    const existingRev = await queryOne<{ id: number }>(
      `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
      drawingId,
      cRev,
    );

    let revisionId = existingRev?.id;
    const revStatus = approved ? "approved" : "submitted";
    const noteText = approved
      ? `[Phê duyệt Gate 0 - ${approverName}]: ${approvalNotes}`
      : `[Lưu Tạm Thời Chờ Duyệt - ${user.name || "Kỹ Sư"}]: ${approvalNotes}`;

    if (!revisionId && drawingId) {
      revisionId = await insertId(
        `INSERT INTO drawing_revisions (
          drawing_id, rev, file_name, original_name, mime_type, size_bytes,
          status, submitted_at, decided_at, decision_note, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ${approved ? "CURRENT_DATE" : "NULL"}, ?, ?, NOW())`,
        drawingId,
        cRev,
        join(relativeSubPath, standardFileName).replace(/\\/g, "/"),
        standardFileName,
        cExt === "dxf" ? "application/dxf" : "application/octet-stream",
        Buffer.byteLength(content, "utf8"),
        revStatus,
        noteText,
        user.id,
      );
    } else if (revisionId) {
      await run(
        `UPDATE drawing_revisions
         SET status = ?, file_name = ?, decision_note = ?, decided_at = ${approved ? "CURRENT_DATE" : "NULL"}
         WHERE id = ?`,
        revStatus,
        join(relativeSubPath, standardFileName).replace(/\\/g, "/"),
        noteText,
        revisionId,
      );
    }

    // Chỉ 1 revision "đang hiệu lực" mỗi bản vẽ — rev vừa duyệt thay thế rev cũ.
    if (approved && drawingId && revisionId) {
      await run(
        `UPDATE drawing_revisions SET status = 'superseded'
          WHERE drawing_id = ? AND id <> ? AND status IN ('approved','approved_with_comments')`,
        drawingId,
        revisionId,
      );
    }

    return NextResponse.json({
      success: true,
      isApproved: approved,
      standardFileName,
      relativeDirectory: join("drawings", relativeSubPath).replace(/\\/g, "/"),
      fullUploadPath: `data/uploads/drawings/${relativeSubPath}/${standardFileName}`.replace(
        /\\/g,
        "/",
      ),
      drawingId,
      revisionId,
      drawingCode,
      message: approved
        ? `✓ Bản vẽ đã được Kỹ Sư Trưởng PHÊ DUYỆT và lưu chính thức vào drawings/${relativeSubPath}/${standardFileName}`
        : `⏳ Bản vẽ đã lưu vào THƯ MỤC TẠM drawings/${cSys}/temp/${standardFileName}. Ký Duyệt Gate 0 để lưu vào vị trí chính thức.`,
    });
  } catch (error) {
    console.error("Save standardized drawing error:", error);
    const message = error instanceof Error ? error.message : "Lỗi lưu trữ bản vẽ chuẩn hóa";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
