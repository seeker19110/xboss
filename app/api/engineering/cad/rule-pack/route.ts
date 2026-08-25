import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { getCurrentRulePack, getRulePackEtag, matchesEtag } from "@/lib/ky-thuat/cad/rule-pack";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/rule-pack — Bộ quy tắc chuẩn hóa + bóc tách CAD đang phát hành
// (M99 PR1/PR-A). PR2: nhận thêm Bearer token scope 'cad' của plugin AutoCAD (XBOSS_LOGIN) —
// token quy về người đã duyệt thiết bị, quyền vẫn đi qua CAN như phiên thường.
export async function GET(req: Request) {
  // Bearer kiểm TRƯỚC: request của plugin không đụng cookies() (nhanh hơn + gọi được handler
  // trực tiếp trong test tích hợp); không có/sai header mới rơi về phiên đăng nhập web.
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
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
      takeoff: pack.takeoff,
      inspectionPolicy: pack.inspectionPolicy,
      // v4 (M100 §11): tham số bộ lệnh vẽ XBOSS_VE_* — plugin M99 cũ bỏ qua field không biết.
      drawTools: pack.drawTools,
      sheetSetup: pack.sheetSetup,
    },
    { headers: { ETag: etag } },
  );
}
