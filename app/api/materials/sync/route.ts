import { NextResponse } from "next/server";
import { getCurrentUser, type Role } from "@/lib/bao-mat/auth";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { runMaterialSync, MaterialSyncScopeError } from "@/lib/vat-tu/material-sync";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

const canSync = (r?: Role) => r === "admin" || r === "pm";

// POST /api/materials/sync → đồng bộ hai chiều vật tư CỦA DỰ ÁN ĐANG CHỌN ↔ Google Sheet (Admin/PM).
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canSync(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được đồng bộ Google Sheet" }, { status: 403 });

  // QUALITY-FINAL-1 A1: dự án đã xác minh cùng tổ chức (cookie sai/không có dự án → 404 trước
  // mọi query nghiệp vụ, không fallback "toàn hệ").
  const projectId = await getCurrentProjectIdStrict(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  try {
    const summary = await runMaterialSync({ orgId: user.orgId, projectId });
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    if (e instanceof MaterialSyncScopeError)
      return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Lỗi đồng bộ Google Sheet";
    log.error("POST /api/materials/sync lỗi", { route: "POST /api/materials/sync", err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
