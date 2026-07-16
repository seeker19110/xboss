import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAdapter } from "@/lib/integrations/core";

export const dynamic = "force-dynamic";

type LastRun = {
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  stats: unknown;
  error: string | null;
};

type IntegrationRow = {
  id: number;
  provider: string;
  projectId: number | null;
  projectName: string | null;
  active: boolean;
  config: unknown;
  lastRunStatus: string | null;
  lastRunStartedAt: string | null;
  lastRunFinishedAt: string | null;
  lastRunStats: unknown;
  lastRunError: string | null;
};

// GET /api/admin/integrations — danh sách tích hợp + lần chạy gần nhất mỗi hàng.
// Admin/PM xem (viewIntegrations). PR1 chưa có adapter thật → thường trả danh sách rỗng.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewIntegrations(user.role))
    return NextResponse.json({ error: "Không có quyền xem tích hợp" }, { status: 403 });

  // DISTINCT ON lấy lần chạy mới nhất mỗi integration_id (order theo started_at DESC).
  const rows = await query<IntegrationRow>(
    `SELECT i.id, i.provider, i.project_id AS "projectId", p.name AS "projectName",
            i.active, i.config,
            r.status AS "lastRunStatus", r.started_at AS "lastRunStartedAt",
            r.finished_at AS "lastRunFinishedAt", r.stats AS "lastRunStats",
            r.error AS "lastRunError"
       FROM integrations i
       LEFT JOIN projects p ON p.id = i.project_id
       LEFT JOIN LATERAL (
         SELECT status, started_at, finished_at, stats, error
           FROM integration_runs
          WHERE integration_id = i.id
          ORDER BY started_at DESC
          LIMIT 1
       ) r ON TRUE
      ORDER BY i.provider, i.project_id`,
  );

  const integrations = rows.map((r) => {
    const lastRun: LastRun | null =
      r.lastRunStatus == null
        ? null
        : {
            status: r.lastRunStatus,
            startedAt: r.lastRunStartedAt,
            finishedAt: r.lastRunFinishedAt,
            stats: r.lastRunStats,
            error: r.lastRunError,
          };
    return {
      id: r.id,
      provider: r.provider,
      projectId: r.projectId,
      projectName: r.projectName,
      active: r.active,
      config: r.config,
      lastRun,
    };
  });

  return NextResponse.json({ integrations });
}

// POST /api/admin/integrations { provider, projectId, config?, active? } — tạo/cập nhật
// 1 tích hợp cho (provider, dự án). Chỉ Admin (manageIntegrations). Provider PHẢI đã đăng
// ký trong registry mới cho tạo/bật (PR1 chưa có adapter thật → endpoint chưa dùng được
// cho tới PR2; vẫn viết đủ validate để PR2 chỉ cần đăng ký adapter là hoạt động).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình tích hợp" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const provider = String(body.provider ?? "").trim();
  if (!provider) return NextResponse.json({ error: "Thiếu provider" }, { status: 400 });
  if (!getAdapter(provider))
    return NextResponse.json({ error: "Provider chưa được hỗ trợ" }, { status: 422 });

  const projectId = body.projectId != null && body.projectId !== "" ? Number(body.projectId) : null;
  if (projectId != null && !Number.isInteger(projectId))
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 400 });

  const config = body.config != null && typeof body.config === "object" ? body.config : {};
  const active = typeof body.active === "boolean" ? body.active : false;

  // ON CONFLICT (provider, project_id) upsert — với project_id NULL, UNIQUE coi NULL là
  // khác nhau nên không kích hoạt DO UPDATE (chèn mới); tích hợp thật luôn có project_id
  // (cron chỉ quét hàng project_id IS NOT NULL) nên không ảnh hưởng luồng dùng thực.
  const rows = await query<{ id: number }>(
    `INSERT INTO integrations (provider, project_id, config, active) VALUES (?, ?, ?, ?)
     ON CONFLICT (provider, project_id)
     DO UPDATE SET config = EXCLUDED.config, active = EXCLUDED.active
     RETURNING id`,
    provider,
    projectId,
    JSON.stringify(config),
    active,
  );
  return NextResponse.json({ id: rows[0].id }, { status: 201 });
}
