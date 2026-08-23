import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { detectGodTierClashes, GodTierElementData } from "@/lib/ky-thuat/engineering-god-tier";
import { listGodTierClashes, resolveGodTierClash } from "@/lib/ky-thuat/engineering-god-tier-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const modelId = searchParams.get("modelId") || undefined;

  const clashes = await listGodTierClashes(projectId, modelId);
  return NextResponse.json({ clashes });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { clashId, status } = body;

    if (!clashId || !status) {
      return NextResponse.json({ error: "Thiếu clashId hoặc status" }, { status: 400 });
    }

    const success = await resolveGodTierClash(
      projectId,
      String(clashId),
      user.id,
      status as "resolved" | "ignored" | "rfi_issued",
    );

    return NextResponse.json({ success });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi cập nhật va chạm";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
