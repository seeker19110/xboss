import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCostReport, costAmountsToWire, costRowToWire } from "@/lib/tai-chinh/cost";
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

// GET /api/costs?groupBy=system|floor&includeVo=0 — báo cáo ngân sách/cam kết/thực chi canonical
// (QUALITY-FINAL-1 S11, lib/tai-chinh/cost.ts getCostReport). Đây là API MỘT dự án; thiếu phạm
// vi hợp lệ không được hiểu thành báo cáo toàn hệ.
// Response: rows, selectedTotals (= tổng rows đang xem), projectTotals (tổng dự án, cơ sở BOQ),
// totals (legacy = projectTotals), settings, alerts, metadata, coverage (đối soát nguồn).
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
  const report = await withProjectScope(projectId, () =>
    getCostReport(projectId, { groupBy, includeVo }),
  );

  try {
    const projectTotals = costAmountsToWire(report.projectTotals, format);
    return json({
      rows: report.rows.map((r) => costRowToWire(r, format)),
      selectedTotals: costAmountsToWire(report.selectedTotals, format),
      projectTotals,
      // Legacy: `totals` luôn là tổng dự án (không đổi theo tab) trong cửa sổ chuyển đổi.
      totals: projectTotals,
      settings: report.settings,
      alerts: report.alerts,
      groupBy,
      metadata: { ...report.metadata, moneyFormat: format },
      coverage: report.coverage,
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
