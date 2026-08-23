import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  workflowInputSchema,
  createWorkflow,
  listWorkflows,
  Gate0FailedError,
} from "@/lib/ky-thuat/engineering-workflow";

export const dynamic = "force-dynamic";

// GET /api/engineering/workflows?state= — danh sách workflow kỹ thuật của dự án đang chọn.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringWorkflows(user.role))
    return NextResponse.json({ error: "Không có quyền xem workflow kỹ thuật" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ workflows: [] });

  const state = new URL(req.url).searchParams.get("state") || undefined;
  return NextResponse.json({ workflows: await listWorkflows(projectId, { state }) });
}

// POST /api/engineering/workflows — tạo workflow. Chạy Gate 0 TRƯỚC (§8): fail thì trả 422
// kèm danh sách check hỏng và KHÔNG tạo bản ghi nào.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.createEngineeringWorkflow(user.role))
    return NextResponse.json({ error: "Không có quyền tạo workflow kỹ thuật" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 404 });

  const parsed = workflowInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      { error: `${issue?.path?.join(".") ?? "body"}: ${issue?.message ?? "không hợp lệ"}` },
      { status: 422 },
    );
  }

  try {
    const result = await createWorkflow(projectId, user.id, parsed.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof Gate0FailedError)
      return NextResponse.json({ error: err.message, gate0: err.result }, { status: 422 });
    throw err;
  }
}
