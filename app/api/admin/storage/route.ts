import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { UPLOAD_DIR } from "@/lib/photos";

export const dynamic = "force-dynamic";

// Ngưỡng cảnh báo dung lượng data/uploads/ trên VPS (đề xuất trong M08-ban-ve.md —
// bản vẽ nặng hơn ảnh/biên bản, dễ chiếm dung lượng nhanh hơn).
const WARN_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

async function dirSize(dir: string): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return { bytes: 0, files: 0 };
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    const s = await stat(p).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) {
      const sub = await dirSize(p);
      bytes += sub.bytes;
      files += sub.files;
    } else {
      bytes += s.size;
      files += 1;
    }
  }
  return { bytes, files };
}

// GET /api/admin/storage — tổng dung lượng data/uploads/ (Admin) + cờ cảnh báo khi
// vượt ngưỡng. Thư mục chứa mọi file upload (ảnh, biên bản, hợp đồng, bản vẽ...).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin xem được dung lượng lưu trữ" }, { status: 403 });

  const { bytes, files } = await dirSize(UPLOAD_DIR);
  return NextResponse.json({ bytes, files, warnBytes: WARN_BYTES, warn: bytes >= WARN_BYTES });
}
