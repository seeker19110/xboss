import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { chotProjectIdChoDoc } from "@/lib/ha-tang/projects";
import {
  getCurrentRulePack,
  getRulePackEtag,
  getRulePackEtagChoDuAn,
  matchesEtag,
} from "@/lib/ky-thuat/cad/rule-pack";
import {
  ganMaBoqVaoItems,
  layMapBoqTheoDuAn,
  type MaBoqTheoItem,
} from "@/lib/ky-thuat/cad/boq-map";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/rule-pack — Bộ quy tắc chuẩn hóa + bóc tách CAD đang phát hành
// (M99 PR1/PR-A). PR2: nhận thêm Bearer token scope 'cad' của plugin AutoCAD (XBOSS_LOGIN) —
// token quy về người đã duyệt thiết bị, quyền vẫn đi qua CAN như phiên thường.
//
// M101 PR4: `?project=<id>` trả bản rule pack có `takeoff.items[].boqCode` đã gán theo map của
// dự án (bảng `cad_takeoff_boq_map`) để cột A của Excel bóc tách tự điền. KHÔNG có `?project=`
// → giữ nguyên hành vi cũ (bản toàn cục, boqCode như trong tệp rule pack).
// Id dự án client gửi KHÔNG được tin: `chotProjectIdChoDoc` đối chiếu lại với danh sách dự án
// user thực sự thấy + cùng org (docs/audit.md §3 — lớp lỗi đã lặp ở /api/payment-certs và
// /api/engineering/cad/save-drawing).
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

  // Cùng khuôn /api/engineering/cad/boq-snapshot: plugin tải rule pack vài lần mỗi phiên làm
  // việc — 60 lượt/15 phút thừa cho việc dùng thật, nhưng chặn vòng lặp dò bằng token thiết bị.
  if (await hitRateLimit(`cad-rule-pack:${user.id}`, 60, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn tải bộ quy tắc (60 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const pack = getCurrentRulePack();

  const thamSoDuAn = new URL(req.url).searchParams.get("project");
  let projectId: number | null = null;
  let map: MaBoqTheoItem[] = [];
  if (thamSoDuAn !== null) {
    const chot = await chotProjectIdChoDoc(user, thamSoDuAn);
    if (!chot.ok) {
      return chot.lyDo === "phai-chon"
        ? NextResponse.json(
            { error: "Bạn thuộc nhiều dự án — chỉ định ?project=<id>", duAn: chot.duAn },
            { status: 409 },
          )
        : NextResponse.json({ error: "Không có quyền với dự án này" }, { status: 403 });
    }
    projectId = chot.projectId;
    map = await layMapBoqTheoDuAn(projectId);
  }

  const etag =
    projectId == null ? getRulePackEtag(pack) : getRulePackEtagChoDuAn(pack, projectId, map);

  // Rule pack đổi rất hiếm nên cho phép client (plugin AutoCAD) cache theo ETag.
  if (matchesEtag(req.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const takeoffDaGanMa =
    projectId == null
      ? pack.takeoff
      : { ...pack.takeoff, items: ganMaBoqVaoItems(pack.takeoff.items, map) };

  return NextResponse.json(
    {
      version: pack.version,
      // Chỉ có mặt khi gọi kèm `?project=` — plugin ghi vào báo cáo bóc tách để truy được số
      // liệu đã dùng map của dự án nào (bản toàn cục thì trường này vắng, như trước PR4).
      ...(projectId == null ? {} : { projectId }),
      layerMap: pack.layerMap,
      fontMap: pack.fontMap,
      purgePolicy: pack.purgePolicy,
      lineweightMap: pack.lineweightMap,
      flattenPolicy: pack.flattenPolicy,
      takeoff: takeoffDaGanMa,
      inspectionPolicy: pack.inspectionPolicy,
      // v4 (M100 §11): tham số bộ lệnh vẽ XBOSS_VE_* — plugin M99 cũ bỏ qua field không biết.
      drawTools: pack.drawTools,
      sheetSetup: pack.sheetSetup,
      // v5 (M101 §6.1/§6.2): bộ style chuẩn dùng chung cho phép kiểm 14 và bước chuẩn hóa 8.
      // 7 phép kiểm mới đi kèm trong inspectionPolicy ở trên (mặc định tắt).
      styleMap: pack.styleMap,
      // v7 (M101 §6.2): chính sách 3 bước chuẩn hóa mới 9/10/11 — đều mặc định tắt.
      xrefPolicy: pack.xrefPolicy,
      hatchMap: pack.hatchMap,
      layoutPolicy: pack.layoutPolicy,
    },
    { headers: { ETag: etag } },
  );
}
