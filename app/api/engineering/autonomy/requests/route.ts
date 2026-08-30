import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { query } from "@/lib/db";
import {
  createExecutionRequest,
  checkAutonomyAllowance,
  ExecutionRequest,
  AutonomyLevel,
} from "@/lib/ky-thuat/engineering-autonomy";

export const dynamic = "force-dynamic";

// GET /api/engineering/autonomy/requests
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringAutonomy(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem yêu cầu tự động hóa" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-autonomy", projectId);
  if (blocked) return blocked;

  try {
    const requests = await query<ExecutionRequest>(
      `SELECT id, project_id AS "projectId", capability_key AS "capabilityKey",
              autonomy_level AS "autonomyLevel", intent, dry_run_diff AS "dryRunDiff",
              risk_class AS "riskClass", status, approval_token AS "approvalToken",
              token_expires_at AS "tokenExpiresAt", execution_result AS "executionResult",
              created_by AS "createdBy", created_at AS "createdAt"
       FROM engineering_execution_requests
       WHERE project_id = ?
       ORDER BY created_at DESC LIMIT 100`,
      projectId,
    );
    return NextResponse.json({ requests });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/autonomy/requests
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringAutonomy(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo yêu cầu tự động hóa" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-autonomy", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const capabilityKey = typeof body?.capabilityKey === "string" ? body.capabilityKey.trim() : "";
  const autonomyLevel = (body?.autonomyLevel as AutonomyLevel) || "A1";
  const intent = typeof body?.intent === "string" ? body.intent.trim() : "";
  const targetData =
    typeof body?.targetData === "object" && body?.targetData ? body.targetData : {};

  if (!capabilityKey || !intent) {
    return NextResponse.json({ error: "Cần cung cấp capabilityKey và intent" }, { status: 400 });
  }

  try {
    // Check allowance
    const allowance = await checkAutonomyAllowance(
      projectId,
      capabilityKey,
      autonomyLevel,
      user.role,
    );
    if (!allowance.allowed) {
      return NextResponse.json({ error: allowance.reason }, { status: 403 });
    }

    const request = await createExecutionRequest(projectId, {
      capabilityKey,
      autonomyLevel,
      intent,
      targetData,
      createdBy: user.id,
    });

    return NextResponse.json({ request });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
