import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  computeCadVectorDiff,
  listCadDiffSessions,
  saveCadDiffSession,
  CadEntity,
} from "@/lib/engineering-cad-skills";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/diff — Lấy lịch sử các phiên so sánh bản vẽ CAD
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem phiên CAD Diff" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const sessions = await listCadDiffSessions(projectId);
    return NextResponse.json(sessions);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/cad/diff — Thực hiện so sánh vector trực quan và lưu phiên vào DB
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền chạy CAD Diff" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const { baseEntities, compareEntities, toleranceMm, baseDrawingId, compareDrawingId } = body;

    if (!baseEntities || !compareEntities) {
      return NextResponse.json(
        { error: "Cần cung cấp baseEntities và compareEntities" },
        { status: 422 },
      );
    }

    const diffResult = computeCadVectorDiff(
      baseEntities as CadEntity[],
      compareEntities as CadEntity[],
      Number(toleranceMm || 5),
    );

    // Lưu phiên diff vào CSDL (B2 Fix)
    let savedSessionId: string | null = null;
    try {
      const saved = await saveCadDiffSession(
        projectId,
        baseDrawingId ? Number(baseDrawingId) : null,
        compareDrawingId ? Number(compareDrawingId) : null,
        diffResult,
        user.id,
      );
      savedSessionId = saved.id;
    } catch {
      // Non-blocking nếu DB save lỗi
    }

    return NextResponse.json({ ...diffResult, sessionId: savedSessionId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
