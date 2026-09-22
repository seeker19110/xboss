import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { query, queryOne, todayISO, withProjectScope } from "@/lib/db";
import { getCurrentUser, PAYMENT_VIEW_ROLES } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { styleHeader } from "@/lib/tien-do/excel-tracking";

export const dynamic = "force-dynamic";

type BoqExportRow = {
  code: string;
  name: string;
  unit: string;
  systemName: string | null;
  qtyContract: number;
  // Tiền tệ (quy ước M45): NUMERIC ép ::text trong SQL, chỉ Number() hoá ở đây để GHI vào ô
  // Excel dạng số hiển thị — KHÔNG cộng/nhân thêm trên số này ở JS.
  unitPriceText: string;
  thanhTienText: string;
  klThucHienText: string;
  soTaskMap: number;
  tongWeightText: string;
};

// GET /api/boq/export → file .xlsx 1 sheet "BOQ" (mã · hệ · mô tả · ĐVT · KL HĐ · đơn giá ·
// thành tiền · KL thực hiện · % thực hiện · số task map · Σ tỷ trọng). Mọi vai trò xem được
// BOQ đều tải được; vai trò ngoài PAYMENT_VIEW_ROLES chỉ không thấy cột Đơn giá/Thành tiền.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 422 });
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  const showMoney = PAYMENT_VIEW_ROLES.includes(user.role);

  const rows = await withProjectScope(projectId, () =>
    query<BoqExportRow>(
      `SELECT bi.code, bi.name, bi.unit, s.name AS "systemName",
              bi.qty_contract AS "qtyContract",
              bi.unit_price::text AS "unitPriceText",
              (bi.qty_contract * bi.unit_price)::text AS "thanhTienText",
              LEAST(
                bi.qty_contract,
                COALESCE(bi.qty_contract * SUM(m.weight * COALESCE(t.progress_percent, 0)), 0)
              )::text AS "klThucHienText",
              COUNT(m.task_id) AS "soTaskMap",
              COALESCE(SUM(m.weight), 0)::text AS "tongWeightText"
         FROM boq_items bi
         LEFT JOIN systems s ON s.id = bi.system_id
         LEFT JOIN boq_task_map m ON m.boq_item_id = bi.id
         LEFT JOIN tasks t ON t.id = m.task_id
        WHERE bi.project_id = ?
        GROUP BY bi.id, s.name
        ORDER BY bi.sort_order, bi.id`,
      projectId,
    ),
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BOQ");
  ws.columns = [
    { width: 16 }, // Mã BOQ
    { width: 14 }, // Hệ
    { width: 42 }, // Mô tả
    { width: 8 }, // ĐVT
    { width: 12 }, // KL HĐ
    { width: 14 }, // Đơn giá
    { width: 16 }, // Thành tiền
    { width: 12 }, // KL thực hiện
    { width: 11 }, // % thực hiện
    { width: 12 }, // Số task map
    { width: 11 }, // Σ tỷ trọng
  ];
  styleHeader(
    ws.addRow([
      "Mã BOQ",
      "Hệ",
      "Mô tả",
      "ĐVT",
      "KL HĐ",
      "Đơn giá",
      "Thành tiền",
      "KL thực hiện",
      "% thực hiện",
      "Số task map",
      "Σ tỷ trọng",
    ]),
  );

  for (const r of rows) {
    const qtyContract = Number(r.qtyContract);
    const klThucHien = Number(r.klThucHienText);
    const pctThucHien = qtyContract > 0 ? klThucHien / qtyContract : 0;
    const row = ws.addRow([
      r.code,
      r.systemName ?? "",
      r.name,
      r.unit,
      qtyContract,
      showMoney ? Number(r.unitPriceText) : null,
      showMoney ? Number(r.thanhTienText) : null,
      klThucHien,
      pctThucHien,
      Number(r.soTaskMap),
      Number(r.tongWeightText),
    ]);
    row.getCell(9).numFmt = "0%";
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 11 } };

  const project = await queryOne<{ name: string | null }>(
    `SELECT name FROM projects WHERE id = ?`,
    projectId,
  );
  const fileTag = (project?.name ?? "XBoss").replace(/[^\wÀ-ỹ-]+/g, "-").slice(0, 60);

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="BOQ-${fileTag}-${todayISO()}.xlsx"`,
    },
  });
}
