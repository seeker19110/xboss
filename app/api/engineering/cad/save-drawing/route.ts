import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { GIOI_HAN_TEP_CAD } from "@/lib/ky-thuat/cad/gioi-han";
import { queryOne, insertId, run } from "@/lib/db";
import { validateDxf } from "@/lib/ky-thuat/cad/dxf-parser";
import { storagePut } from "@/lib/nen/storage";
import { newStandardizedDrawingFileName } from "@/lib/nen/photos";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/save-drawing — Lưu trữ bản vẽ chuẩn hóa
// Quy chuẩn quản trị:
// - Khi chưa duyệt (hoặc đang chỉnh sửa): Lưu tại thư mục tạm drawings/{systems}/temp/
// - Khi Kỹ Sư Trưởng phê duyệt Gate 0: Lưu chính thức vào đúng vị trí drawings/{systems}/{kind}/{subFolder?}/ và dọn sạch file tạm.
// Tên file quy chuẩn: [project_code]_[work_package_code]_[systems]_[kind-subfolder]_[name]_[date]_[drawing_versions].[ext]

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    if (!CAN.manageDrawings(user.role)) {
      return NextResponse.json({ error: "Không có quyền lưu bản vẽ" }, { status: 403 });
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
      isApproved = false, // true = Phê duyệt chính thức -> Lưu vào đúng vị trí; false = Lưu tạm vào {systems}/temp
      approverName = "Kỹ Sư Trưởng MEPF",
      approvalNotes = "Bản vẽ đã qua chuẩn hóa CAD 2D và kiểm tra chất lượng Gate 0.",
    } = body;

    // Kiểm định cấu trúc DXF TRƯỚC mọi tác dụng phụ: sai cấu trúc thì không ghi tệp,
    // không tạo bản ghi drawings/drawing_revisions (guardrail M98 §2).
    // Cùng trần với đường nạp lên (xem GIOI_HAN_TEP_CAD). Đo trước validateDxf vì validateDxf
    // tách cả tệp thành mảng dòng — với tệp khổng lồ thì chính bước kiểm đã làm tràn bộ nhớ.
    const coCharPhepDo = typeof fileContent === "string" ? fileContent.length : 0;
    if (coCharPhepDo > GIOI_HAN_TEP_CAD) {
      return NextResponse.json(
        {
          error:
            `Nội dung DXF lớn hơn giới hạn ${Math.round(GIOI_HAN_TEP_CAD / 1024 / 1024)} MB — ` +
            `không lưu. Hãy tách bản vẽ theo tầng/hệ rồi lưu từng phần.`,
        },
        { status: 413 },
      );
    }

    const validation = validateDxf(typeof fileContent === "string" ? fileContent : "");
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: "Nội dung DXF không hợp lệ — không lưu bản vẽ",
          errors: validation.errors,
        },
        { status: 422 },
      );
    }

    // Không tin project_id client gửi — đối chiếu danh sách dự án user được thấy.
    // Xem chotProjectIdChoGhi() để biết vì sao (lib/ha-tang/projects.ts).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      inputProjectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok) {
      return NextResponse.json(
        { error: "Không có quyền lưu bản vẽ vào dự án này" },
        { status: 403 },
      );
    }
    const projectId = chotDuAn.projectId;

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

    // Xác định thư mục đích theo trạng thái phê duyệt:
    // - Chưa duyệt (isApproved === false): lưu vào drawings/{systems}/temp/
    // - Đã duyệt (isApproved === true): lưu chính thức vào drawings/{systems}/{kind}/{subfolder?}
    let relativeSubPath = "";
    if (!isApproved) {
      relativeSubPath = join(cSys, "temp");
    } else {
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
    }

    const isoRelativePath = join(relativeSubPath, standardFileName).replace(/\\/g, "/");

    // Cây thư mục quy chuẩn ISO 19650 dựng bằng `npm run setup:drawing-tree` lúc triển khai,
    // KHÔNG dựng lại ở mỗi request: đó là việc cấp phát môi trường, và giữ nó trong đồ thị
    // import của route khiến Turbopack phải trace toàn bộ dự án (xem scripts/ensure-drawing-tree.ts).
    // Route vẫn tự tạo đúng nhánh nó ghi ở ngay dưới, nên không phụ thuộc script đó.

    // 1. Ghi tệp vào data/uploads/drawings/
    const dataUploadsDir = join(process.cwd(), "data", "uploads", "drawings", relativeSubPath);
    if (!existsSync(dataUploadsDir)) {
      mkdirSync(dataUploadsDir, { recursive: true });
    }
    const fullDataPath = join(dataUploadsDir, standardFileName);
    writeFileSync(fullDataPath, fileContent || ";; Standardized CAD Drawing by XBoss\n", "utf8");

    // 2. Ghi tệp vào root drawings/
    const rootDrawingsDir = join(process.cwd(), "drawings", relativeSubPath);
    if (!existsSync(rootDrawingsDir)) {
      mkdirSync(rootDrawingsDir, { recursive: true });
    }
    const fullRootPath = join(rootDrawingsDir, standardFileName);
    writeFileSync(fullRootPath, fileContent || ";; Standardized CAD Drawing by XBoss\n", "utf8");

    // 3. Ghi vào lớp lưu trữ dùng chung (S3/MinIO khi có cấu hình, không thì data/uploads/).
    // Đây mới là bản đọc lại được bằng storageGet() ở route parse-dxf — hai bản ghi theo cây thư
    // mục bên trên chỉ phục vụ bàn giao hồ sơ theo ISO 19650 và triển khai một máy chủ.
    const storageFileName = newStandardizedDrawingFileName(cExt);
    await storagePut(user.orgId, storageFileName, Buffer.from(fileContent || "", "utf8"));

    // 4. Nếu đã phê duyệt chính thức, dọn sạch bản sao tạm trong thư mục temp (nếu có)
    if (isApproved) {
      const tempPathData = join(
        process.cwd(),
        "data",
        "uploads",
        "drawings",
        cSys,
        "temp",
        standardFileName,
      );
      if (existsSync(tempPathData)) {
        try {
          unlinkSync(tempPathData);
        } catch (err) {
          // Không chặn luồng lưu bản vẽ chính thức chỉ vì dọn tạm thất bại (vd đang bị khoá) —
          // nhưng vẫn phải ghi log để biết còn rác trong thư mục temp/, không nuốt lỗi im lặng.
          console.error("Không xoá được bản sao tạm (data/uploads/drawings):", tempPathData, err);
        }
      }
      const tempPathRoot = join(process.cwd(), "drawings", cSys, "temp", standardFileName);
      if (existsSync(tempPathRoot)) {
        try {
          unlinkSync(tempPathRoot);
        } catch (err) {
          console.error("Không xoá được bản sao tạm (drawings/):", tempPathRoot, err);
        }
      }
    }

    // 5. Ghi nhận vào Cơ sở dữ liệu bảng drawings & drawing_revisions
    const drawingCode = `${cSys}-${kindTag}-${cRev}-${cDate.slice(-4)}`;
    const drawingTitle = `${name} (${kindTag} - ${cRev})`;

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

    // Tạo hoặc cập nhật bản ghi revision
    const existingRev = await queryOne<{ id: number }>(
      `SELECT id FROM drawing_revisions WHERE drawing_id = ? AND rev = ?`,
      drawingId,
      cRev,
    );

    let revisionId = existingRev?.id;
    const revStatus = isApproved ? "approved" : "submitted";
    const noteText = isApproved
      ? `[Phê duyệt Gate 0 - ${approverName}]: ${approvalNotes}`
      : `[Lưu Tạm Thời Chờ Duyệt - ${user.name || "Kỹ Sư"}]: ${approvalNotes}`;

    if (!revisionId && drawingId) {
      revisionId = await insertId(
        `INSERT INTO drawing_revisions (
          drawing_id, rev, file_name, iso_path, original_name, mime_type, size_bytes,
          status, submitted_at, decided_at, decision_note, uploaded_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, ${isApproved ? "CURRENT_DATE" : "NULL"}, ?, ?, NOW())`,
        drawingId,
        cRev,
        storageFileName,
        isoRelativePath,
        standardFileName,
        cExt === "dxf" ? "application/dxf" : "application/octet-stream",
        Buffer.byteLength(fileContent || "", "utf8"),
        revStatus,
        noteText,
        user.id,
      );
    } else if (revisionId) {
      await run(
        `UPDATE drawing_revisions 
         SET status = ?, file_name = ?, iso_path = ?, decision_note = ?, decided_at = ${isApproved ? "CURRENT_DATE" : "NULL"}
         WHERE id = ?`,
        revStatus,
        storageFileName,
        isoRelativePath,
        noteText,
        revisionId,
      );
    }

    return NextResponse.json({
      success: true,
      isApproved,
      standardFileName,
      storageFileName,
      isoPath: isoRelativePath,
      relativeDirectory: join("drawings", relativeSubPath).replace(/\\/g, "/"),
      fullUploadPath: `data/uploads/drawings/${relativeSubPath}/${standardFileName}`.replace(
        /\\/g,
        "/",
      ),
      drawingId,
      revisionId,
      drawingCode,
      message: isApproved
        ? `✓ Bản vẽ đã được Kỹ Sư Trưởng PHÊ DUYỆT và lưu chính thức vào drawings/${relativeSubPath}/${standardFileName}`
        : `⏳ Bản vẽ đã lưu vào THƯ MỤC TẠM drawings/${cSys}/temp/${standardFileName}. Ký Duyệt Gate 0 để lưu vào vị trí chính thức.`,
    });
  } catch (error: any) {
    console.error("Save standardized drawing error:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi lưu trữ bản vẽ chuẩn hóa" },
      { status: 500 },
    );
  }
}
