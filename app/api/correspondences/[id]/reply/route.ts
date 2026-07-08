import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  checkCorrespondenceRefs,
  createReply,
  parseCorrespondenceBody,
  validateCorrespondenceInput,
} from "@/lib/correspondence";

export const dynamic = "force-dynamic";

// POST /api/correspondences/:id/reply — tạo văn bản trả lời (direction='out'), nối
// reply_id, tự chuyển văn bản gốc sang 'replied'. Admin/PM/kỹ sư.
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageCorrespondence(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền trả lời công văn (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const originalId = parseInt(params.id);
  if (isNaN(originalId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy văn bản gốc" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseCorrespondenceBody(body);
  const invalid = validateCorrespondenceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkCorrespondenceRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const result = await createReply(originalId, input, user.id, projectId);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  return NextResponse.json({ id: result.id }, { status: 201 });
}
