import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { enqueueAsyncTask } from "@/lib/ky-thuat/engineering-task-queue";
import { isContentTooLarge } from "@/lib/nen/photos";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Trần dung lượng tệp bản vẽ/mô hình gửi vào hàng đợi tác vụ MEPF (150MB).
 *
 * Trước đây hằng này ở `lib/ky-thuat/cad/dashboard.ts`; module đó đã bị gỡ cùng cụm CAD/BIM nên
 * chuyển về đúng nơi duy nhất còn dùng. Căn cứ giữ nguyên: bản vẽ MEPF thật của dự án đo được
 * ~50MB (người dùng xác nhận 2026-08-24) nên để 3× dư địa — đây là van an toàn chống tràn bộ
 * nhớ máy chủ, không phải chính sách nghiệp vụ.
 */
const GIOI_HAN_TEP_LON = 150 * 1024 * 1024;

// POST /api/engineering/queue/upload
// Tải lên tệp bản vẽ/dữ liệu kỹ thuật (DXF, IFC, JSON, XLSX...) và tự động đẩy vào hàng đợi tác vụ MEPF
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền gửi tác vụ kỹ thuật" }, { status: 403 });
  }

  // Chặn sớm các file vượt giới hạn dung lượng ở mức header, trước khi đọc body
  if (isContentTooLarge(req.headers.get("content-length"), GIOI_HAN_TEP_LON)) {
    return NextResponse.json(
      {
        error: `Tệp tin vượt quá dung lượng tối đa cho phép (${Math.floor(GIOI_HAN_TEP_LON / (1024 * 1024))}MB)`,
      },
      { status: 413 },
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const taskType = (formData.get("taskType") as string) || "mepf.cad.analyze";

    // Chốt projectId theo phiên; chỉ chấp nhận dự án client chỉ định nếu nằm trong danh sách
    // dự án người dùng được phép thấy (chặn đẩy tác vụ vào dự án không thuộc quyền).
    const chot = await chotProjectIdChoGhi(
      user,
      formData.get("projectId"),
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chot.ok) {
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    }
    const projectId = chot.projectId;

    if (!file) {
      return NextResponse.json({ error: "Vui lòng chọn tệp tin cần tải lên" }, { status: 400 });
    }

    // Tác vụ bản vẽ của worker MEPF dùng trần lớn (150MB) — bản vẽ MEPF thật đo được tới ~65MB,
    // vượt trần 50MB mặc định của route này. Tác vụ còn lại giữ nguyên trần 50MB cũ.
    const laTacVuBanVe = taskType.startsWith("mepf.cad.");
    const maxSize = laTacVuBanVe ? GIOI_HAN_TEP_LON : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `Tệp tin vượt quá dung lượng tối đa cho phép (${Math.floor(maxSize / (1024 * 1024))}MB)`,
        },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(buffer).digest("hex");

    // Thư mục lưu trữ tệp MEPF
    const uploadDir = path.join(process.cwd(), "data", "uploads", "mepf");
    await fs.mkdir(uploadDir, { recursive: true });

    const safeFilename = `${fileHash.slice(0, 16)}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath = path.join(uploadDir, safeFilename);
    await fs.writeFile(filePath, buffer);

    // Đẩy tác vụ vào hàng đợi Postgres
    const task = await enqueueAsyncTask({
      projectId,
      taskType,
      payload: {
        fileName: file.name,
        filePath: `data/uploads/mepf/${safeFilename}`,
        fileSize: file.size,
        fileHash,
        mimeType: file.type || "application/octet-stream",
        uploadedBy: user.id,
      },
      priority: 10,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      data: {
        taskId: task.id,
        taskType: task.task_type,
        status: task.status,
        fileName: file.name,
        fileHash,
        createdAt: task.created_at,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
