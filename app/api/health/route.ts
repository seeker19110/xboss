import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkHealth } from "@/lib/health";
import { poolStats } from "@/lib/db";
import { getOpenStreamCount } from "@/app/api/events/route";

export const dynamic = "force-dynamic";

// GET /api/health — public, KHÔNG cần đăng nhập (endpoint public-safe cho uptime monitor
// ping mỗi phút, xem docs/ops/backup.md). KHÔNG lộ version app/hostname/disk chi tiết —
// chỉ status/db/migration/uptime. DB fail → status "degraded" + HTTP 503 để monitor bắt được.
// M53 PR1: có session Admin/PM thì gộp thêm số liệu quan trắc tải (pool DB + số SSE stream
// đang mở trên process này) — không public để tránh lộ thông tin hạ tầng cho người ngoài.
export async function GET() {
  const result = await checkHealth();
  // getCurrentUser() đọc cookies() qua next/headers — đòi hỏi request scope thật của
  // Next.js. Gọi route này trực tiếp ngoài request scope (test, script) khiến nó throw;
  // nuốt lỗi và coi như chưa đăng nhập — vẫn giữ đúng phần public (status/db/migration/
  // uptime_s), chỉ bỏ qua phần metrics Admin/PM.
  const user = await getCurrentUser().catch(() => null);
  const body =
    user && (user.role === "admin" || user.role === "pm")
      ? { ...result, pool: poolStats(), sseStreams: getOpenStreamCount() }
      : result;
  return NextResponse.json(body, { status: result.status === "ok" ? 200 : 503 });
}
