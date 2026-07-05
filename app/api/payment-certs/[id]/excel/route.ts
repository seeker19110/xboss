import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCert, certTotals } from "@/lib/paymentcerts";

export const dynamic = "force-dynamic";

// GET /api/payment-certs/:id/excel — xuất bảng KL nghiệm thu 1 đợt IPC.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem đợt thanh toán" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const cert = await getCert(id);
  if (!cert) return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  const totals = await certTotals(id);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Đợt ${cert.periodNo}`.slice(0, 31));

  ws.addRow([`Bảng khối lượng nghiệm thu — ${cert.code}`]);
  ws.addRow([`Hợp đồng: ${cert.contractCode} — ${cert.contractTitle}`]);
  if (cert.periodLabel) ws.addRow([`Kỳ: ${cert.periodLabel}`]);
  ws.addRow([]);

  const header = ws.addRow([
    "Mã",
    "Tên công tác",
    "ĐVT",
    "Đơn giá",
    "KL đợt này",
    "Luỹ kế",
    "Thành tiền đợt",
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
  });

  for (const it of cert.items) {
    ws.addRow([
      it.boqCode,
      it.boqName,
      it.boqUnit,
      Number(it.unitPrice),
      Number(it.qtyPeriod),
      Number(it.qtyCumulative),
      Number(it.qtyPeriod) * Number(it.unitPrice),
    ]);
  }

  ws.addRow([]);
  ws.addRow(["", "", "", "", "", "Giá trị đợt này", totals.periodValue]);
  ws.addRow(["", "", "", "", "", "Trừ tạm ứng", -totals.advanceDeduct]);
  ws.addRow(["", "", "", "", "", "Trừ giữ lại bảo hành", -totals.retentionDeduct]);
  const grand = ws.addRow(["", "", "", "", "", "GIÁ TRỊ ĐỀ NGHỊ THANH TOÁN", totals.approvedValue]);
  grand.font = { bold: true };

  ws.columns.forEach((col) => (col.width = 18));
  ws.getColumn(2).width = 32;

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${cert.code}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
