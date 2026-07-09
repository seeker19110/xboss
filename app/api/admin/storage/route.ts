import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { UPLOAD_DIR, dirSize, STORAGE_WARN_BYTES } from "@/lib/photos";

export const dynamic = "force-dynamic";

// GET /api/admin/storage — tổng dung lượng data/uploads/ (Admin) + cờ cảnh báo khi
// vượt ngưỡng. Thư mục chứa mọi file upload (ảnh, biên bản, hợp đồng, bản vẽ...).
// dirSize/STORAGE_WARN_BYTES dùng chung với lib/tech.ts (systemStatus, M31).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin xem được dung lượng lưu trữ" }, { status: 403 });

  const { bytes, files } = await dirSize(UPLOAD_DIR);
  return NextResponse.json({
    bytes,
    files,
    warnBytes: STORAGE_WARN_BYTES,
    warn: bytes >= STORAGE_WARN_BYTES,
  });
}
