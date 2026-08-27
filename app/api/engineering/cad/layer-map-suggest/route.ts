import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { goiYLayerMap } from "@/lib/dich-vu/cad-goi-y-anh-xa";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/layer-map-suggest — gợi ý ánh xạ layer lạ → layer chuẩn (M108 §6.4).
//
// CHỈ GỢI Ý: rule pack là dữ liệu phát hành có version, route này không ghi rule pack. Kết quả trả
// về gồm đoạn JSON để người duyệt tự dán vào rule pack rồi phát hành theo đường vốn có (AC10).

/** Trần số layer nhận trong một lượt — đủ cho một hồ sơ thật, chặn việc nhồi prompt. */
const TRAN_LAYER = 300;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền sửa quy tắc chuẩn hóa" }, { status: 403 });
  }
  if (await hitRateLimit(`cad-goi-y-layer:${user.id}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn gợi ý (10 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { layersLa?: unknown };
  if (!Array.isArray(body.layersLa)) {
    return NextResponse.json({ error: "Thiếu 'layersLa' (mảng tên layer)" }, { status: 400 });
  }
  if (body.layersLa.length > TRAN_LAYER) {
    return NextResponse.json(
      { error: `Nhận tối đa ${TRAN_LAYER} layer một lượt, đang gửi ${body.layersLa.length}` },
      { status: 400 },
    );
  }
  const kq = await goiYLayerMap(body.layersLa.map((l) => String(l)));
  return NextResponse.json(kq);
}
