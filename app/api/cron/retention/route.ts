import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN, checkCronSecret } from "@/lib/bao-mat/auth";
import { runRetention, AUDIT_LOG_KHONG_XOA } from "@/lib/ha-tang/retention";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

// GET /api/cron/retention  — dọn dữ liệu hết hạn theo chính sách (C3 §6, xem lib/retention.ts).
//
// Xác thực giống các endpoint cron khác: Authorization: Bearer <CRON_SECRET> hoặc session
// Admin/PM. KHÔNG nhận secret qua query param.
//
// ⚠️ MẶC ĐỊNH LÀ CHẠY THỬ. Phải truyền `?apply=1` mới xoá thật. Gọi nhầm URL không có
// tham số thì chỉ ra báo cáo — xoá nhầm dữ liệu công trình không có nút hoàn tác.
export async function GET(req: NextRequest) {
  const bySecret = checkCronSecret(req.headers.get("authorization"));
  const bySession = CAN.export((await getCurrentUser())?.role ?? undefined);
  if (!bySecret && !bySession)
    return NextResponse.json(
      { error: "Không có quyền (cần CRON_SECRET hoặc đăng nhập Admin/PM)" },
      { status: 401 },
    );

  const apply = req.nextUrl.searchParams.get("apply") === "1";

  try {
    const rows = await runRetention(apply);
    const deleted = rows.reduce((s, r) => s + r.deleted, 0);

    // Xoá thật thì phải để lại dấu vết — nhìn log là biết lần chạy nào dọn cái gì.
    if (apply && deleted > 0) {
      log.info("Retention đã dọn dữ liệu hết hạn", {
        route: "GET /api/cron/retention",
        deleted,
        detail: rows.filter((r) => r.deleted > 0).map((r) => `${r.key}=${r.deleted}`),
      });
    }

    return NextResponse.json({
      ok: true,
      apply,
      // Nói rõ ngay trong response khi mới chỉ chạy thử — tránh hiểu nhầm là đã dọn xong.
      note: apply ? undefined : "Chạy thử — chưa xoá gì. Thêm ?apply=1 để xoá thật.",
      deleted,
      targets: rows,
      auditLog: AUDIT_LOG_KHONG_XOA,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lỗi dọn dữ liệu hết hạn";
    log.error("GET /api/cron/retention lỗi", { route: "GET /api/cron/retention", err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
