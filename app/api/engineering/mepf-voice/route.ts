import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  parseVoiceInspectionText,
  calculateProductivityIndex,
  saveVoiceLog,
  listVoiceLogs,
} from "@/lib/ky-thuat/engineering-mepf-voice";

export const dynamic = "force-dynamic";

// GET /api/engineering/mepf-voice — Danh sách các bản ghi nhật ký giọng nói hiện trường
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem nhật ký giọng nói" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const logs = await listVoiceLogs(projectId);
    return NextResponse.json({ logs, totalCount: logs.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/mepf-voice — Phân tích văn bản giọng nói hiện trường hoặc tính năng suất
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền ghi nhật ký hiện trường" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "parse_voice";

    if (action === "parse_voice") {
      const text = body.text || "";
      const parsed = parseVoiceInspectionText(text);
      const saved = await saveVoiceLog(projectId, user.id, parsed);

      return NextResponse.json({
        success: true,
        logId: saved.id,
        parsed,
      });
    }

    if (action === "productivity") {
      const actualQty = parseFloat(body.actualQty) || 0;
      const headcount = parseInt(body.headcount, 10) || 1;
      const workingHours = parseFloat(body.workingHours) || 8;
      const normRate = parseFloat(body.normRate) || 2.5;

      const evalRes = calculateProductivityIndex(actualQty, headcount, workingHours, normRate);
      return NextResponse.json({ success: true, productivity: evalRes });
    }

    return NextResponse.json({ error: `Hành động ${action} không hợp lệ` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
