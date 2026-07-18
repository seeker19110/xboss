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
  const user = await getCurrentUser();
  const body =
    user && (user.role === "admin" || user.role === "pm")
      ? { ...result, pool: poolStats(), sseStreams: getOpenStreamCount() }
      : result;
  return NextResponse.json(body, { status: result.status === "ok" ? 200 : 503 });
}
