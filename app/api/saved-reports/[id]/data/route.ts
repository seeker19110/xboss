import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { getSource, runReport, type ReportColumn } from "@/lib/reports";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  ownerId: number;
  name: string;
  source: string;
  config: unknown;
  shared: boolean;
};

// GET /api/saved-reports/:id/data[?export=excel] — chạy báo cáo, trả bảng (JSON) hoặc file Excel.
// Quyền: xem được báo cáo (chủ sở hữu / shared / admin) VÀ có quyền xem nguồn (nguồn tiền
// vẫn giới hạn theo vai trò kể cả khi báo cáo được chia sẻ — bảo vệ dữ liệu tài chính).
export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const id = parseInt((await paramsP).id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const r = await queryOne<Row>(
    `SELECT id, owner_id AS "ownerId", name, source, config, shared FROM saved_reports WHERE id = ?`,
    id,
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

  const projectId = await getCurrentProjectId(user);
  let result;
  try {
    result = await runReport(r.source, r.config, projectId);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }

  if (req.nextUrl.searchParams.get("export") === "excel") {
    const buf = await buildExcel(r.name, result.columns, result.rows);
    return new NextResponse(buf as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bao-cao-${id}.xlsx"`,
      },
    });
  }

  return NextResponse.json({ name: r.name, source: r.source, ...result });
}

async function buildExcel(name: string, columns: ReportColumn[], rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 31) || "Báo cáo");
  ws.columns = columns.map((c) => ({ header: c.label, key: c.key, width: 20 }));
  ws.getRow(1).font = { bold: true };
  for (const row of rows) ws.addRow(columns.map((c) => row[c.key] ?? ""));
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
