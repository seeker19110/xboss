import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { generateAutonomousTechnicalDraft } from "@/lib/ky-thuat/engineering-swarm";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// POST /api/engineering/swarm/drafts — Soạn thảo tự động hồ sơ kỹ thuật kèm mã xác thực Single-use Token
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAgentSessions(user.role)) {
    return NextResponse.json({ error: "Không có quyền soạn thảo hồ sơ kỹ thuật" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-swarm", projectId);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const {
      draftType,
      title,
      topic,
      synthesis,
      citations,
      coordinates,
      costEstimateVnd,
      scheduleDeltaDays,
    } = body;

    if (!draftType || !title || !topic || !synthesis) {
      return NextResponse.json(
        { error: "Cần cung cấp draftType, title, topic và synthesis" },
        { status: 422 },
      );
    }

    const draft = generateAutonomousTechnicalDraft({
      draftType,
      title,
      topic,
      synthesis,
      citations: citations || [],
      coordinates,
      costEstimateVnd: Number(costEstimateVnd || 0),
      scheduleDeltaDays: Number(scheduleDeltaDays || 0),
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
