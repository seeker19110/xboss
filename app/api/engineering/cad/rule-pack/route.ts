import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentRulePack, getRulePackEtag, matchesEtag } from "@/lib/cad/rule-pack";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/rule-pack — Bộ quy tắc chuẩn hóa CAD đang phát hành (M99 PR1)
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem quy tắc chuẩn hóa CAD" },
      { status: 403 },
    );
  }

  const pack = getCurrentRulePack();
  const etag = getRulePackEtag(pack);

  // Rule pack đổi rất hiếm nên cho phép client (plugin AutoCAD) cache theo ETag.
  if (matchesEtag(req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return NextResponse.json(
    {
      version: pack.version,
      layerMap: pack.layerMap,
      fontMap: pack.fontMap,
      purgePolicy: pack.purgePolicy,
      lineweightMap: pack.lineweightMap,
      flattenPolicy: pack.flattenPolicy,
    },
    { headers: { ETag: etag } },
  );
}
