import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { enqueueAsyncTask } from "@/lib/ky-thuat/engineering-task-queue";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

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

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const taskType = (formData.get("taskType") as string) || "mepf.cad.analyze";
    const projectId = Number(formData.get("projectId") || (user as any).projectId || 1);

    if (!file) {
      return NextResponse.json({ error: "Vui lòng chọn tệp tin cần tải lên" }, { status: 400 });
    }

    // Giới hạn kích thước 50MB
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Tệp tin vượt quá dung lượng tối đa cho phép (50MB)" },
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
