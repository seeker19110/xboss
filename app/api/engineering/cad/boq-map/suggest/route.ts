import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { goiYBoqCode } from "@/lib/dich-vu/cad-goi-y-anh-xa";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/boq-map/suggest — gợi ý mã BOQ cho hạng mục bóc tách (M108 §6.5).
//
// CHỈ GỢI Ý, không ghi: người duyệt sửa rồi lưu qua đúng `PUT /api/engineering/cad/boq-map` vốn có.
// Không đọc và không trả về một cột tiền nào (quy ước M45 / AC11).

export async function POST(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageDrawings(user.role)) {
    return NextResponse.json({ error: "Không có quyền gán mã BOQ" }, { status: 403 });
  }
  if (await hitRateLimit(`cad-goi-y-boq:${user.id}`, 10, 15)) {
    return NextResponse.json(
      { error: "Vượt giới hạn gợi ý (10 lượt/15 phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }
  return NextResponse.json(await goiYBoqCode(projectId));
}
