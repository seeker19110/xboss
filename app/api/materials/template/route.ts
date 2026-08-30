import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";

export const dynamic = "force-dynamic";

// GET /api/materials/template → tải file Excel biểu mẫu BOQ & định mức vật tư chuẩn
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  const filePath = path.join(process.cwd(), "attachments", "MAU-KHOI-LUONG-BOQ.xlsx");
  try {
    const fileBuffer = await fs.readFile(filePath);
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="MAU-KHOI-LUONG-BOQ.xlsx"',
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Không tìm thấy file mẫu BOQ trong thư mục attachments" },
      { status: 404 },
    );
  }
}
