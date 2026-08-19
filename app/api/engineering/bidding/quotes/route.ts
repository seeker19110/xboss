import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { createVendorQuote, listVendorQuotes } from "@/lib/engineering-bidding-matrix";

export const dynamic = "force-dynamic";

// GET /api/engineering/bidding/quotes?packageId=...
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền truy cập báo giá" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = Number(searchParams.get("projectId") || (user as any).projectId || 1);
  const packageId = searchParams.get("packageId");

  if (!packageId) {
    return NextResponse.json({ error: "Thiếu tham số packageId" }, { status: 400 });
  }

  try {
    const quotes = await listVendorQuotes(projectId, packageId);
    return NextResponse.json({ success: true, data: quotes });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/bidding/quotes
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền nhập báo giá" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const projectId = Number(body.projectId || (user as any).projectId || 1);

    if (
      !body.packageId ||
      !body.vendorName ||
      body.totalAmountVnd == null ||
      !Array.isArray(body.lineItems)
    ) {
      return NextResponse.json(
        { error: "Thiếu các trường bắt buộc (packageId, vendorName, totalAmountVnd, lineItems)" },
        { status: 422 },
      );
    }

    const quote = await createVendorQuote({
      projectId,
      packageId: body.packageId,
      vendorName: body.vendorName,
      vendorType: body.vendorType,
      totalAmountVnd: Number(body.totalAmountVnd),
      lineItems: body.lineItems,
      capacityScore: body.capacityScore != null ? Number(body.capacityScore) : 80,
      safetyScore: body.safetyScore != null ? Number(body.safetyScore) : 85,
      technicalComplianceScore:
        body.technicalComplianceScore != null ? Number(body.technicalComplianceScore) : 80,
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, data: quote });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
