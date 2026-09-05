import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getTaxonomy } from "@/lib/ky-thuat/engineering-graph";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/taxonomy — Lấy danh mục taxonomy phân loại đối tượng và quan hệ kỹ thuật
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem taxonomy kỹ thuật" }, { status: 403 });
  }

  try {
    const taxonomy = await getTaxonomy();
    return NextResponse.json(taxonomy);
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
