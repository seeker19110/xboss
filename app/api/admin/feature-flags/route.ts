import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { listProjects } from "@/lib/projects";
import { MODULES } from "@/lib/modules";
import { getModuleFlags, setFlag } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

// GET /api/admin/feature-flags — ma trận module × dự án (Admin/PM xem, chỉ Admin sửa
// qua PATCH). Dự án user không thấy được (theo user_projects) không xuất hiện trong ma
// trận — khớp phạm vi hiển thị của project switcher.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewFeatureFlags(user.role))
    return NextResponse.json({ error: "Không có quyền xem cấu hình tính năng" }, { status: 403 });

  const projects = await listProjects(user);
  const flagsByProject = await Promise.all(projects.map((p) => getModuleFlags(p.id)));

  const modules = MODULES.map((m) => ({ key: m.key, label: m.nav[0]?.label ?? m.key }));
  const projectFlags = projects.map((p, i) => ({
    projectId: p.id,
    projectName: p.name,
    flags: Object.fromEntries(flagsByProject[i]),
  }));

  return NextResponse.json({ modules, projects: projectFlags });
}

// PATCH /api/admin/feature-flags { moduleKey, projectId, enabled } — bật/tắt 1 module
// cho 1 dự án. Chỉ Admin.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFeatureFlags(user.role))
    return NextResponse.json({ error: "Chỉ Admin được cấu hình tính năng" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const moduleKey = String(body.moduleKey ?? "");
  const projectId = Number(body.projectId);
  const enabled = body.enabled;
  if (!MODULES.some((m) => m.key === moduleKey))
    return NextResponse.json({ error: "Module không hợp lệ" }, { status: 422 });
  if (!Number.isInteger(projectId))
    return NextResponse.json({ error: "projectId không hợp lệ" }, { status: 422 });
  if (typeof enabled !== "boolean")
    return NextResponse.json({ error: "enabled phải là boolean" }, { status: 422 });

  await setFlag(moduleKey, projectId, enabled, user.id);
  return NextResponse.json({ moduleKey, projectId, enabled });
}
