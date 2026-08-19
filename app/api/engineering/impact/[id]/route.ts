import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { analyzeObjectImpact } from "@/lib/engineering-graph";

export const dynamic = "force-dynamic";

// GET /api/engineering/impact/[id]?relationTypes=&depth= — Phân tích tác động ảnh hưởng của đối tượng
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem phân tích tác động kỹ thuật" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const sp = new URL(req.url).searchParams;
  const depth = sp.get("depth") ? parseInt(sp.get("depth")!, 10) : 3;
  const relationTypes = sp.get("relationTypes")
    ? sp
        .get("relationTypes")!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  try {
    const impact = await analyzeObjectImpact(projectId, id, { depth, relationTypes });
    return NextResponse.json(impact);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("Không tìm thấy") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
