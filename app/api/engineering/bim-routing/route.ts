import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  createBcfIssue,
  listBcfIssues,
  resolveBcfIssue,
  findRoutePath3D,
  saveRoutingRun,
  listRoutingRuns,
  detectClashesWithSpatialGrid,
  CreateBcfIssueInput,
  RoutingPoint3D,
  RoutingConstraint,
} from "@/lib/engineering-bim-routing";
import { BimElementRecord } from "@/lib/engineering-bim-cad";
import { BoundingBox3D } from "@/lib/engineering-bim-cad";

export const dynamic = "force-dynamic";

// GET /api/engineering/bim-routing — Danh sách BCF Issues hoặc Lịch sử Auto-Routing
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem dữ liệu BIM Routing / BCF" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "bcf";

  try {
    if (type === "routing_history") {
      const runs = await listRoutingRuns(projectId);
      return NextResponse.json(runs);
    }

    const issues = await listBcfIssues(projectId, {
      status: searchParams.get("status") || undefined,
      discipline: searchParams.get("discipline") || undefined,
      severity: searchParams.get("severity") || undefined,
      issueType: searchParams.get("issueType") || undefined,
    });

    return NextResponse.json(issues);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/bim-routing — Tạo BCF Issue mới, Chạy Auto-Routing 3D, hoặc Quét Spatial Grid Clash
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền quản lý BIM Routing / BCF" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const action = body.action || "create_bcf";

    // 1. Tạo BCF Issue mới (openBIM)
    if (action === "create_bcf") {
      const input = body.issue as CreateBcfIssueInput;
      if (!input || !input.title) {
        return NextResponse.json({ error: "Tiêu đề BCF Issue là bắt buộc" }, { status: 422 });
      }

      const issue = await createBcfIssue(projectId, input, user.id);
      return NextResponse.json(issue);
    }

    // 2. Phê duyệt / Giải quyết BCF Issue
    if (action === "resolve_bcf") {
      const { bcfId, resolutionNote } = body;
      if (!bcfId) {
        return NextResponse.json({ error: "bcfId là bắt buộc" }, { status: 422 });
      }

      const updated = await resolveBcfIssue(
        projectId,
        String(bcfId),
        String(resolutionNote || "Đã xử lý nắn tuyến và cập nhật mô hình BIM"),
        user.id,
      );

      return NextResponse.json(updated);
    }

    // 3. Chạy thuật toán 3D A* Auto-Routing
    if (action === "autoroute") {
      const {
        startPoint,
        endPoint,
        obstacles,
        constraints,
        discipline,
        systemCode,
        linkedSpoolCode,
        bcfIssueId,
        saveToDb,
      } = body;

      if (!startPoint || !endPoint) {
        return NextResponse.json(
          { error: "Cần cung cấp startPoint và endPoint {x, y, z}" },
          { status: 422 },
        );
      }

      const result = findRoutePath3D(
        startPoint as RoutingPoint3D,
        endPoint as RoutingPoint3D,
        (obstacles || []) as BoundingBox3D[],
        (constraints || {}) as RoutingConstraint,
      );

      if (saveToDb !== false) {
        try {
          await saveRoutingRun(
            projectId,
            discipline || "hvac",
            result,
            systemCode,
            linkedSpoolCode,
            bcfIssueId,
            user.id,
          );
        } catch {
          // Non-blocking
        }
      }

      return NextResponse.json(result);
    }

    // 4. Quét va chạm nhanh dạng Spatial Grid
    if (action === "spatial_grid_clash") {
      const { elements, clearanceMm } = body;
      if (!elements || !Array.isArray(elements)) {
        return NextResponse.json(
          { error: "elements phải là mảng BimElementRecord" },
          { status: 422 },
        );
      }

      const clashes = detectClashesWithSpatialGrid(
        elements as BimElementRecord[],
        Number(clearanceMm || 50),
      );

      return NextResponse.json(clashes);
    }

    return NextResponse.json({ error: `Action không hợp lệ: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
