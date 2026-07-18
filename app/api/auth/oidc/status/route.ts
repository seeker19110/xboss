import { NextResponse } from "next/server";
import { ssoEnabled } from "@/lib/oidc";

export const dynamic = "force-dynamic";

// GET /api/auth/oidc/status → { enabled } — public (như /api/project). Client không đọc
// được env; dùng để trang login quyết định hiện/ẩn nút SSO.
export async function GET() {
  return NextResponse.json({ enabled: ssoEnabled() });
}
