import { NextResponse } from "next/server";
import { getCurrentUser, type Role } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { runMaterialSync } from "@/lib/material-sync";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const canSync = (r?: Role) => r === "admin" || r === "pm";

// POST /api/materials/sync → đồng bộ hai chiều vật tư ↔ Google Sheet (Admin/PM).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canSync(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được đồng bộ Google Sheet" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  try {
    const summary = await runMaterialSync();
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi đồng bộ Google Sheet";
    log.error("POST /api/materials/sync lỗi", { route: "POST /api/materials/sync", err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
