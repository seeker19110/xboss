import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  getSource,
  reportRowsToWire,
  runReport,
  type ReportColumn,
  type ReportResult,
  type ReportRow,
} from "@/lib/tien-do/reports";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyWireFormat,
  parseFixedDecimalExact,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";
import { ghiChuCotText, oExcelTheoCot } from "@/lib/tai-chinh/excel-exact";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  ownerId: number;
  projectId: number | null;
  name: string;
  source: string;
  config: unknown;
  shared: boolean;
};

// GET /api/saved-reports/:id/data[?export=excel] — chạy báo cáo, trả bảng (JSON) hoặc file Excel.
// Quyền: xem được báo cáo (chủ sở hữu / shared / admin) VÀ có quyền xem nguồn (nguồn tiền
// vẫn giới hạn theo vai trò kể cả khi báo cáo được chia sẻ — bảo vệ dữ liệu tài chính).
// S10c (A3-FR06): cột tiền — header decimal-string-v1 → chuỗi canonical + `moneyFormat`; legacy →
// number, ngoài biên → 422. Excel: cột tiền ghi số khi ≤ 15 chữ số có nghĩa, không thì CẢ cột text.
export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const id = parseInt((await paramsP).id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const r = await queryOne<Row>(
    `SELECT id, owner_id AS "ownerId", project_id AS "projectId", name, source, config, shared
       FROM saved_reports WHERE id = ? AND org_id = ?`,
    id,
    user.orgId,
  );
  if (!r) return NextResponse.json({ error: "Không tìm thấy báo cáo" }, { status: 404 });
  if (r.ownerId !== user.id && !r.shared && user.role !== "admin")
    return NextResponse.json({ error: "Không có quyền xem báo cáo này" }, { status: 403 });

  const src = getSource(r.source);
  if (!src) return NextResponse.json({ error: "Nguồn báo cáo không còn hợp lệ" }, { status: 422 });
  if (!src.canView(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xem nguồn dữ liệu này" },
      { status: 403 },
    );

  // P1-5 (A1-AC01/AC02): không có dự án khả kiến → kết quả rỗng đúng shape, không chạy query
  // nguồn (trước đây projectId null làm báo cáo chạy toàn hệ, vượt cả ranh giới org). Báo cáo
  // gắn dự án khác dự án đang chọn → 404 như không tồn tại.
  const projectId = await getCurrentProjectId(user);
  if (projectId != null && r.projectId != null && r.projectId !== projectId)
    return NextResponse.json({ error: "Không tìm thấy báo cáo" }, { status: 404 });
  let result: ReportResult;
  if (projectId == null) {
    result = { columns: src.columns, rows: [] };
  } else {
    try {
      result = await runReport(r.source, r.config, projectId);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }
  }

  if (req.nextUrl.searchParams.get("export") === "excel") {
    const buf = await buildExcel(r.name, result.columns, result.rows);
    return new NextResponse(buf as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bao-cao-${id}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  try {
    return NextResponse.json(
      {
        name: r.name,
        source: r.source,
        columns: result.columns,
        rows: reportRowsToWire(result.columns, result.rows, format),
        ...nhanDinhDangTien(format),
      },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
}

async function buildExcel(name: string, columns: ReportColumn[], rows: ReportRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 31) || "Báo cáo");
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 20 }));
  ws.getRow(1).font = { bold: true };
  // Cột tiền (chuỗi canonical exact): chọn kiểu ô THEO CỘT (excel-exact, S10a L5) — ô trống giữ "".
  const oTien = new Map<string, (number | string)[]>();
  const cotText: string[] = [];
  for (const c of columns.filter((col) => col.kind === "money")) {
    const coGiaTri = rows.filter((row) => row[c.key] != null);
    const { cells, laText } = oExcelTheoCot(
      coGiaTri.map((row) => ({
        unscaled: parseFixedDecimalExact(String(row[c.key]), 2),
        scale: 2,
      })),
    );
    let i = 0;
    oTien.set(
      c.key,
      rows.map((row) => (row[c.key] != null ? cells[i++] : "")),
    );
    if (laText) cotText.push(c.label);
  }
  rows.forEach((row, idx) =>
    ws.addRow(columns.map((c) => oTien.get(c.key)?.[idx] ?? row[c.key] ?? "")),
  );
  const ghiChu = ghiChuCotText(cotText);
  if (ghiChu) ws.addRow([ghiChu]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
