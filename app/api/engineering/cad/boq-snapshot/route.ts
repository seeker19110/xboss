import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCadTokenUser } from "@/lib/bao-mat/cad-devices";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { chotProjectIdChoDoc } from "@/lib/ha-tang/projects";
import { laySnapshotBoqTheoDuAn } from "@/lib/dich-vu/cad-boq-snapshot";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/boq-snapshot?project=<id> — KL BOQ HỢP ĐỒNG theo hạng mục bóc tách
// của rule pack, để plugin dựng sheet `Doi-chieu` đặt cạnh KL bóc (M101 §6.3, PR4).
//
// CHỈ ĐỌC — tệp này CỐ Ý chỉ export GET. Đường ghi sổ khối lượng duy nhất vẫn là upload có kiểm
// định (`/api/engineering/cad/plugin-upload`); thêm POST/PUT ở đây là mở đường ghi thứ hai vào
// số liệu hợp đồng mà không qua kiểm định — cấm theo M101 §6.4.
//
// Auth: Bearer token scope 'cad' của plugin (đường chính) hoặc phiên web, quyền
// CAN.viewEngineeringGraph — CHẶT HƠN /api/boq (route đó chỉ đòi đăng nhập) vì token thiết bị
// nằm trên máy trạm AutoCAD: giữ nguyên tập vai trò của các route CAD khác, không nới ra subcon.
// Id dự án client gửi không được tin — `chotProjectIdChoDoc` đối chiếu lại theo phiên/token.
export async function GET(req: NextRequest) {
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
    return NextResponse.json(
      { error: "Không có quyền xem khối lượng BOQ hợp đồng" },
      { status: 403 },
    );
  }
  // Mỗi lần xuất Excel gọi đúng 1 lần — 60 lượt/15 phút thừa cho việc dùng thật, nhưng chặn
  // vòng lặp dò mã BOQ bằng token thiết bị.
  if (await hitRateLimit(`cad-boq-snapshot:${user.id}`, 60, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn tải đối chiếu BOQ (60 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const chot = await chotProjectIdChoDoc(user, req.nextUrl.searchParams.get("project"));
  if (!chot.ok) {
    return chot.lyDo === "phai-chon"
      ? NextResponse.json(
          { error: "Bạn thuộc nhiều dự án — chỉ định ?project=<id>", duAn: chot.duAn },
          { status: 409 },
        )
      : NextResponse.json({ error: "Không có quyền với dự án này" }, { status: 403 });
  }

  return NextResponse.json(await laySnapshotBoqTheoDuAn(chot.projectId));
}
