import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, isAdminOrPm } from "@/lib/bao-mat/auth";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { danhSachItemBocTach, ghiMapBoqTheoDuAn } from "@/lib/ky-thuat/cad/boq-map";
import { laySnapshotBoqTheoDuAn } from "@/lib/dich-vu/cad-boq-snapshot";

export const dynamic = "force-dynamic";

// /api/engineering/cad/boq-map — gán MÃ BOQ cho từng hạng mục bóc tách của rule pack, theo DỰ ÁN
// ĐANG CHỌN (M101 §6.3, PR4). Mục "Mã BOQ theo dự án" của bảng điều khiển plugin trên web.
//
// GET  danh sách hạng mục + mã đã gán + dòng BOQ khớp được (tên/KL hợp đồng) để QS soát ngay.
// PUT  ghi cả lô (idempotent, mã rỗng = gỡ) — chỉ Admin/PM.
//
// Đây là màn hình WEB nên dự án lấy từ ngữ cảnh phiên (`getCurrentProjectId` — cookie đã được đối
// chiếu với `visibleProjectIds` + org), KHÔNG nhận id dự án từ body/query. Đường của plugin (có
// `?project=`) đi qua /rule-pack và /boq-snapshot, ở đó id được đối chiếu lại bằng
// `chotProjectIdChoDoc`. Không nhận token thiết bị: sửa cấu hình mã BOQ là việc quản trị trên web,
// không phải việc của máy trạm AutoCAD (cùng lý do POST /block-lib chỉ nhận phiên).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem map mã BOQ" }, { status: 403 });
  }
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 409 });
  }

  const snapshot = await laySnapshotBoqTheoDuAn(projectId);
  const theoId = new Map(snapshot.dong.map((d) => [d.takeoffItemId, d]));
  return NextResponse.json({
    projectId,
    rulePackVersion: snapshot.rulePackVersion,
    choSua: isAdminOrPm(user.role),
    items: danhSachItemBocTach().map((i) => {
      const d = theoId.get(i.id);
      return {
        takeoffItemId: i.id,
        ten: i.name,
        nhom: i.group,
        donVi: i.unit,
        boqCode: d?.boqCode ?? "",
        tenBoq: d?.ten ?? null,
        klBoq: d?.qtyContract ?? null,
      };
    }),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!isAdminOrPm(user.role)) {
    return NextResponse.json({ error: "Chỉ Admin/PM được gán mã BOQ theo dự án" }, { status: 403 });
  }
  if (await hitRateLimit(`cad-boq-map:${user.id}`, 30, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn lưu map mã BOQ (30 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 409 });
  }

  const body = (await req.json().catch(() => null)) as { items?: unknown } | null;
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "Thiếu trường items (danh sách)" }, { status: 400 });
  }
  const kq = await ghiMapBoqTheoDuAn(
    projectId,
    user.id,
    body.items as { takeoffItemId: string; boqCode: string }[],
  );
  if (!kq.ok) return NextResponse.json({ error: kq.loi }, { status: 400 });
  return NextResponse.json({ projectId, soGan: kq.soGan, soGo: kq.soGo });
}
