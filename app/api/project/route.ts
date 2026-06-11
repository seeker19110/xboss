import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/project → tên/mã dự án + tháp đầu tiên trong DB.
// Public (chỉ trả tên hiển thị) — dùng cho header, trang login, báo cáo.
export async function GET() {
  try {
    const project = await queryOne<{ name: string; code: string | null }>(
      `SELECT name, code FROM projects ORDER BY id LIMIT 1`);
    const tower = await queryOne<{ name: string }>(`SELECT name FROM towers ORDER BY id LIMIT 1`);
    return NextResponse.json({
      name: project?.name ?? null,
      code: project?.code ?? null,
      tower: tower?.name ?? null,
    });
  } catch {
    // DB chưa sẵn sàng (chưa cấu hình/chưa seed) — trả null để UI dùng fallback.
    return NextResponse.json({ name: null, code: null, tower: null });
  }
}
