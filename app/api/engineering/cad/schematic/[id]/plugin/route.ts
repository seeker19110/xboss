import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { chotProjectIdChoDoc } from "@/lib/ha-tang/projects";
import { layGraphSchematic } from "@/lib/dich-vu/cad";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/schematic/:id/plugin — M117 PR2 (§7 FR5, AC4): plugin AutoCAD tải graph
// ĐÃ CHỐT về sinh tuyến tim gợi ý (`XBOSS_TUYEN_GOIY`, PR4).
//
// Xác thực như route rule-pack/block-lib cho plugin: Bearer token scope 'cad' của thiết bị đã ghép
// (XBOSS_LOGIN), rơi về phiên web nếu không có. Graph còn `nhap` ⇒ 409: hai chốt người duyệt của
// M117 §2b không được đi tắt — plugin chỉ được dùng bản đã có người chịu trách nhiệm.

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Bearer kiểm TRƯỚC: request của plugin không đụng cookies() (cùng lý do route rule-pack).
  const user =
    (await getCadTokenUser(req.headers.get("authorization"))) ?? (await getCurrentUser());
  if (!user) {
    return NextResponse.json(
      { error: "Chưa đăng nhập hoặc token thiết bị không hợp lệ — chạy XBOSS_LOGIN" },
      { status: 401 },
    );
  }
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền tải sơ đồ nguyên lý" }, { status: 403 });
  }
  if (await hitRateLimit(`cad-schematic-plugin:${user.id}`, 60, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn tải graph (60 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const idTho = Number((await ctx.params).id);
  if (!Number.isInteger(idTho) || idTho <= 0) {
    return NextResponse.json({ error: "Id không hợp lệ" }, { status: 400 });
  }

  const chot = await chotProjectIdChoDoc(user, req.nextUrl.searchParams.get("project"));
  if (!chot.ok) {
    return chot.lyDo === "phai-chon"
      ? NextResponse.json(
          { error: "Bạn thuộc nhiều dự án — chỉ định ?project=<id>", duAn: chot.duAn },
          { status: 409 },
        )
      : NextResponse.json({ error: "Không tìm thấy dự án" }, { status: 404 });
  }

  const ban = await layGraphSchematic(chot.projectId, idTho);
  if (!ban) return NextResponse.json({ error: "Không tìm thấy sơ đồ nguyên lý" }, { status: 404 });
  if (ban.trangThai !== "da_duyet") {
    return NextResponse.json(
      {
        error:
          "Graph chưa được chốt — vào tab Sơ đồ nguyên lý trên web, duyệt rồi bấm Chốt graph trước khi sinh tuyến.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: ban.id,
    projectId: ban.projectId,
    systemId: ban.systemId,
    trangThai: ban.trangThai,
    duyetLuc: ban.duyetLuc,
    graph: ban.graph,
  });
}
