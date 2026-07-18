import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { isQrKind, resolveQr } from "@/lib/qr";

export const dynamic = "force-dynamic";

// GET /api/r/:kind/:id — tra cứu tài nguyên cho route quét QR /r/:kind/:id (M58 PR1).
// Trả JSON tối giản để trang /r/[kind]/[id] dựng URL đích. Không tạo bảng/registry mới —
// tra thẳng bảng nghiệp vụ đã có (equipment/materials/work_packages/tasks), scoped theo
// dự án đang chọn (đối chiếu lib/systems.ts/lib/workfronts.ts — tránh rò rỉ chéo dự án
// như M22 đã từng gặp).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  if (!isQrKind(kind))
    return NextResponse.json({ error: "Loại mã QR không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const resolved = await resolveQr(kind, id, projectId);
  if (!resolved)
    return NextResponse.json(
      { error: "Không tìm thấy hồ sơ này hoặc bạn không có quyền xem" },
      { status: 404 },
    );

  return NextResponse.json(resolved);
}
