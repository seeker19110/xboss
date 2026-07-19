import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  workloadByWeek,
  manpowerByWeek,
  equipmentUsageByWeek,
  assignmentConflicts,
  defaultResourceWindow,
} from "@/lib/resources";

export const dynamic = "force-dynamic";

// GET /api/resources?from=&to=&view=manpower|equipment|conflicts&minTasks=
// Tổng hợp tài nguyên (M59 PR1). Quyền: mọi vai trò đăng nhập (không dữ liệu tiền); subcon
// chỉ thấy tải/xung đột của CHÍNH MÌNH (lọc assigned_to = user.id — nhất quán canTouchTask).
//  - mặc định (không view / view không khớp): trả workload (kế hoạch) + manpower (thực tế).
//  - view=equipment: thêm equipmentUsage.  view=conflicts: thêm conflicts.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const win = defaultResourceWindow();
  const from = sp.get("from") || win.from;
  const to = sp.get("to") || win.to;
  const view = sp.get("view");
  const minTasks = Math.max(2, parseInt(sp.get("minTasks") ?? "5") || 5);

  const projectId = await getCurrentProjectId(user);
  const subconUserId = user.role === "subcon" ? user.id : undefined;

  const [workload, manpower] = await Promise.all([
    workloadByWeek({ projectId, from, to, subconUserId }),
    manpowerByWeek({ projectId, from, to }),
  ]);

  const body: {
    from: string;
    to: string;
    workload: Awaited<ReturnType<typeof workloadByWeek>>;
    manpower: Awaited<ReturnType<typeof manpowerByWeek>>;
    equipmentUsage?: Awaited<ReturnType<typeof equipmentUsageByWeek>>;
    conflicts?: Awaited<ReturnType<typeof assignmentConflicts>>;
  } = { from, to, workload, manpower };

  if (view === "equipment") {
    body.equipmentUsage = await equipmentUsageByWeek({ projectId, from, to });
  } else if (view === "conflicts") {
    body.conflicts = await assignmentConflicts({ projectId, minTasks, subconUserId });
  }

  return NextResponse.json(body);
}
