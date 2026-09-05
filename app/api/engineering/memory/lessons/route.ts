import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  visibleProjectIds,
  getCurrentProjectId,
  chotProjectIdChoGhi,
} from "@/lib/ha-tang/projects";
import {
  listCrossProjectLessons,
  addCrossProjectLesson,
} from "@/lib/ky-thuat/engineering-memory-bank";

export const dynamic = "force-dynamic";

// GET /api/engineering/memory/lessons — Danh sách các bài học sự cố và hành động phòng ngừa
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem bài học tri thức" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const workPackageCode = searchParams.get("workPackageCode") || undefined;

    const lessons = await listCrossProjectLessons(workPackageCode, await visibleProjectIds(user));
    return NextResponse.json(lessons);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/memory/lessons — Ghi nhận một bài học kinh nghiệm mới
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringDataQuality(user.role)) {
    return NextResponse.json({ error: "Không có quyền thêm bài học kinh nghiệm" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const {
      sourceProjectId,
      patternId,
      workPackageCode,
      observedProblem,
      rootCause,
      prescribedPreventativeAction,
      effectivenessScore,
    } = body;

    if (!observedProblem || !rootCause || !prescribedPreventativeAction) {
      return NextResponse.json(
        { error: "Cần cung cấp observedProblem, rootCause và prescribedPreventativeAction" },
        { status: 422 },
      );
    }

    // Dự án nguồn phải nằm trong danh sách user được thấy — không tin thẳng body, kẻo
    // gán bài học vào dự án của tổ chức khác (mẫu đúng: engineering/bidding/packages).
    const projectId = await getCurrentProjectId(user);
    if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
    const chot = await chotProjectIdChoGhi(user, sourceProjectId, projectId);
    if (!chot.ok) return NextResponse.json({ error: "Dự án không hợp lệ" }, { status: 403 });

    const created = await addCrossProjectLesson({
      source_project_id: chot.projectId,
      pattern_id: patternId || undefined,
      work_package_code: workPackageCode || undefined,
      observed_problem: observedProblem,
      root_cause: rootCause,
      prescribed_preventative_action: prescribedPreventativeAction,
      effectiveness_score: Number(effectivenessScore || 1.0),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
