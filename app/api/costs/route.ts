import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import {
  costSummary,
  costTotals,
  getCostSettings,
  reachesPct,
  usagePct,
  costAmountsToWire,
} from "@/lib/tai-chinh/cost";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { withProjectScope } from "@/lib/db";
import {
  MONEY_FORMAT_HEADER,
  MONEY_FORMAT_DECIMAL_V1,
  moneyWireFormat,
  isMoneyPrecisionError,
} from "@/lib/nen/money";

export const dynamic = "force-dynamic";

// API tài chính: không cache ở bất kỳ tầng nào; nội dung đổi theo header định dạng tiền
// (A3-FR06) nên khai Vary dù đã no-store.
const HEADERS_TAI_CHINH = { "Cache-Control": "private, no-store", Vary: MONEY_FORMAT_HEADER };
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: HEADERS_TAI_CHINH });

// GET /api/costs?groupBy=system|floor&includeVo=0 — bảng ngân sách/cam kết/thực chi.
// Đây là API MỘT dự án; thiếu phạm vi hợp lệ không được hiểu thành báo cáo toàn hệ.
// Header `X-XBoss-Money-Format: decimal-string-v1` → tiền là chuỗi canonical + `moneyFormat`;
// không gửi → JSON number legacy (422 money_precision_unsupported nếu ngoài biên an toàn).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);

  const projectId = await getCurrentProjectId(user);
  if (projectId == null || !Number.isInteger(projectId) || projectId <= 0) {
    return json({ error: "Cần chọn dự án hợp lệ để xem chi phí", code: "project_required" }, 403);
  }
  // Giải phạm vi trước để override quyền theo dự án dùng đúng request-context.
  if (!CAN.viewPayments(user.role))
    return json({ error: "Chỉ Admin/PM/BCH được xem chi phí" }, 403);

  const groupBy = req.nextUrl.searchParams.get("groupBy") === "floor" ? "floor" : "system";
  const includeVo = req.nextUrl.searchParams.get("includeVo") !== "0";
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  const [rows, totals, settings] = await withProjectScope(projectId, async () => {
    const rows = await costSummary(groupBy, includeVo, projectId);
    const [totals, settings] = await Promise.all([
      // Nhóm hệ dùng lại đúng tập vừa đọc; nhóm tầng vẫn giữ tổng toàn dự án theo hệ.
      costTotals(includeVo, projectId, groupBy === "system" ? rows : undefined),
      getCostSettings(),
    ]);
    return [rows, totals, settings] as const;
  });

  // So ngưỡng bằng nhân chéo bigint; pct chỉ để hiển thị.
  const alerts = rows
    .filter((r) => reachesPct(r.committed, r.budget, settings.warnPct))
    .map((r) => ({
      key: r.key,
      label: r.label,
      pct: usagePct(r.committed, r.budget),
      over: reachesPct(r.committed, r.budget, settings.overPct),
    }));

  try {
    return json({
      rows: rows.map((r) => ({ key: r.key, label: r.label, ...costAmountsToWire(r, format) })),
      totals: costAmountsToWire(totals, format),
      settings,
      alerts,
      groupBy,
      ...(format === MONEY_FORMAT_DECIMAL_V1 ? { moneyFormat: MONEY_FORMAT_DECIMAL_V1 } : {}),
    });
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return json(
      {
        error:
          "Giá trị tiền vượt độ chính xác của định dạng số cũ — gửi header " +
          `${MONEY_FORMAT_HEADER}: ${MONEY_FORMAT_DECIMAL_V1} để nhận số tiền chính xác`,
        code: "money_precision_unsupported",
      },
      422,
    );
  }
}
