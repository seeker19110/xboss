import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { query, todayISO } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/status";
import { getCurrentUser, CAN } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/export/excel → file .xlsx gồm sheet "Công việc trễ" + "KPI".
export async function GET() {
  const role = getCurrentUser()?.role;
  if (!CAN.export(role)) return NextResponse.json({ error: "Bạn không có quyền export (chỉ Admin/PM)" }, { status: 403 });

  const today = todayISO();

  const delayed = query<{ code: string; name: string; status: string; startDate: string | null; endDate: string | null; progressPercent: number; floorLabel: string | null; sheetType: string }>(
    `SELECT t.code, t.name, t.status, t.start_date AS startDate, t.end_date AS endDate,
            t.progress_percent AS progressPercent, wp.floor_label AS floorLabel, st.code AS sheetType
       FROM tasks t
       JOIN work_packages wp ON t.package_id = wp.id
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
        AND t.status NOT IN ('hoan_thanh','nghiem_thu')
      ORDER BY st.code, t.end_date`, today);

  const kpi = query<{ sheetType: string; total: number; avgProgress: number; delayed: number }>(
    `SELECT st.code AS sheetType, COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent),0) AS avgProgress,
            COALESCE(SUM(CASE WHEN t.end_date < ? AND t.progress_percent < 1 AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END),0) AS delayed
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY st.id, st.code ORDER BY st.id`, today);

  const delayedRows = delayed.map((d) => ({
    "Mã": d.code, "Chi tiết công việc": d.name, "Sheet": d.sheetType,
    "Tầng": d.floorLabel ?? "", "Bắt đầu": d.startDate ?? "", "Kết thúc": d.endDate ?? "",
    "% Tiến độ": Math.round((d.progressPercent ?? 0) * 100) + "%",
    "Trạng thái": STATUS_LABEL[d.status as keyof typeof STATUS_LABEL] ?? d.status,
  }));
  const kpiRows = kpi.map((k) => ({
    "Sheet": k.sheetType, "Tổng task": k.total,
    "Tiến độ TB": Math.round((k.avgProgress ?? 0) * 100) + "%", "Số trễ": k.delayed,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), "KPI");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(delayedRows.length ? delayedRows : [{ "Thông báo": "Không có công việc trễ" }]), "Công việc trễ");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="XBoss-AVIO-${today}.xlsx"`,
    },
  });
}
