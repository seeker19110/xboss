import { NextResponse } from "next/server";
import { checkReadiness } from "@/lib/van-hanh/health";

export const dynamic = "force-dynamic";

// GET /api/ready — readiness (Q-AC07), public như /api/health (monitor/deploy gọi, không phiên).
// Khác liveness: 200 chỉ khi schema đã áp đủ migration của checkout này. Chỉ SELECT — KHÔNG
// auto-migrate/seed/ghi. 503 + reason (schema_missing | schema_behind | db_unavailable); body
// không chứa chuỗi kết nối/secret. Migration chạy bằng job riêng (MIGRATE_DATABASE_URL).
export async function GET() {
  const result = await checkReadiness();
  return NextResponse.json(result, {
    status: result.ready ? 200 : 503,
    headers: { "Cache-Control": "private, no-store" },
  });
}
