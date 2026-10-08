import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/bao-mat/auth";
import { getCurrentProjectIdStrict } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import {
  runMaterialSync,
  resolveCronSyncScope,
  MaterialSyncScopeError,
  type MaterialSyncScope,
} from "@/lib/vat-tu/material-sync";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

// GET /api/cron/sync-sheets
// Gọi bởi cron để đồng bộ hai chiều vật tư ↔ Google Sheet định kỳ, hoặc Admin/PM gọi tay.
// Xác thực: Authorization: Bearer <CRON_SECRET> | session Admin/PM (không nhận secret qua query param).
// Phạm vi (QUALITY-FINAL-1 A1) — luôn đúng MỘT dự án, không bao giờ toàn hệ:
//   - Phiên Admin/PM: dự án đang chọn (đã xác minh cùng tổ chức; không có → 404).
//   - Chỉ CRON_SECRET: dự án cấu hình ở GOOGLE_SHEET_PROJECT_ID (tổ chức suy từ dự án đó);
//     chưa cấu hình/sai → 503 kèm lý do, KHÔNG chạy (không đoán "dự án đầu tiên").
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const user = await getCurrentUser();
  const bySession = CAN.export(user?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  try {
    let scope: MaterialSyncScope;
    if (user && bySession) {
      const projectId = await getCurrentProjectIdStrict(user);
      if (projectId == null)
        return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });
      scope = { orgId: user.orgId, projectId };
    } else {
      scope = await resolveCronSyncScope();
    }
    const blocked = await assertModuleEnabled("materials", scope.projectId);
    if (blocked) return blocked;

    const summary = await runMaterialSync(scope);
    return NextResponse.json({ ok: true, projectId: scope.projectId, summary });
  } catch (e) {
    if (e instanceof MaterialSyncScopeError) {
      log.warn("GET /api/cron/sync-sheets từ chối phạm vi", {
        route: "GET /api/cron/sync-sheets",
        status: e.status,
      });
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Lỗi đồng bộ Google Sheet";
    log.error("GET /api/cron/sync-sheets lỗi", { route: "GET /api/cron/sync-sheets", err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
