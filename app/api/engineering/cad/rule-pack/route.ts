import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { verifyDeviceToken } from "@/lib/bao-mat/api-tokens";
import { getCurrentRulePack, getRulePackEtag, matchesEtag } from "@/lib/ky-thuat/cad/rule-pack";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/rule-pack — Bộ quy tắc chuẩn hóa + bóc tách CAD đang phát hành
// (M99 PR1/PR-A). Nhận 2 đường xác thực: phiên web thường HOẶC token thiết bị plugin
// (`Authorization: Bearer xbt_...`, M99 PR2 — XBOSS_LOGIN tải rule pack trực tiếp).
// Token hành xử đúng bằng quyền user chủ token — cùng check CAN như phiên.
export async function GET(req: Request) {
  const bearer = req.headers.get("authorization");
  const user = bearer?.trim().startsWith("Bearer xbt_")
    ? ((await verifyDeviceToken(bearer))?.user ?? null)
    : await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        error:
          "Chưa đăng nhập hoặc token thiết bị không hợp lệ/đã thu hồi — chạy XBOSS_LOGIN ghép lại",
      },
      { status: 401 },
    );
  }
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
    },
    { headers: { ETag: etag } },
  );
}
