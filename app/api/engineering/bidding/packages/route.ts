import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { createBiddingPackage, listBiddingPackages } from "@/lib/engineering-bidding-matrix";

export const dynamic = "force-dynamic";

// GET /api/engineering/bidding/packages
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập đấu thầu" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);
  const discipline = searchParams.get("discipline") || undefined;
  const status = searchParams.get("status") || undefined;

  try {
    const packages = await listBiddingPackages(projectId, { discipline, status });
    return NextResponse.json({ success: true, data: packages });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/bidding/packages
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo gói thầu" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (!body.packageCode || !body.title || !body.discipline || body.targetBudgetVnd == null) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (packageCode, title, discipline, targetBudgetVnd)" },
        { status: 422 },
      );
    }

    const pkg = await createBiddingPackage({
      projectId,
      packageCode: body.packageCode,
      title: body.title,
      discipline: body.discipline,
      targetBudgetVnd: Number(body.targetBudgetVnd),
      rfqSpecs: body.rfqSpecs || {},
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, data: pkg });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
