import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  getEngineeringObject,
  getEngineeringRelations,
  listObjectRevisions,
} from "@/lib/engineering-kernel";

export const dynamic = "force-dynamic";

// GET /api/engineering/objects/:id — chi tiết 1 Engineering Object: object + quan hệ 2
// chiều + 5 revision gần nhất (ENG-1 mục 6.2). Admin/PM.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.reviewEngineeringObjects(user.role))
    return NextResponse.json({ error: "Không có quyền xem đối tượng kỹ thuật" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const { id } = await params;
  const object = await getEngineeringObject(projectId, id);
  if (!object)
    return NextResponse.json({ error: "Không tìm thấy đối tượng kỹ thuật" }, { status: 404 });

  const [relations, revisions] = await Promise.all([
    getEngineeringRelations(projectId, id),
    listObjectRevisions(projectId, id),
  ]);

  return NextResponse.json({ object, relations, revisions });
}
