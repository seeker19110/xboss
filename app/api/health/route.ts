import { NextResponse } from "next/server";
import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

// GET /api/health — public, KHÔNG cần đăng nhập (endpoint public-safe cho uptime monitor
// ping mỗi phút, xem docs/ops/backup.md). KHÔNG lộ version app/hostname/disk chi tiết —
// chỉ status/db/migration/uptime. DB fail → status "degraded" + HTTP 503 để monitor bắt được.
export async function GET() {
  const result = await checkHealth();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}
