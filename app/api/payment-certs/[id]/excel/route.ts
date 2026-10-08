import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { getCertForProject, certTotals, certLinesExact } from "@/lib/tai-chinh/paymentcerts";
import { parseFixedDecimalExact } from "@/lib/nen/money";
import { oExcelTheoCot, ghiChuCotText, type GiaTriExact } from "@/lib/tai-chinh/excel-exact";

export const dynamic = "force-dynamic";

// Scale nguồn (migrations/0014): qty NUMERIC(15,3), unit_price NUMERIC(15,2) → thành tiền scale 5.
const QTY_SCALE = 3;
const PRICE_SCALE = 2;

// GET /api/payment-certs/:id/excel — xuất bảng KL nghiệm thu 1 đợt IPC.
// M50 PR2 (quyền theo trường): perm che tiền IPC = viewPayments, trùng gate route dưới
// đây → user thiếu quyền bị 403 NGAY (không xuất file). Che từng ô trong Excel là vô
// nghĩa (người nhận có thể mở file) nên chặn cả file — quyết định phiên chính.
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

  const projectId = await getCurrentProjectId(user);
  // M4 (S10a): 3 câu đọc trong cùng 1 snapshot REPEATABLE READ — PATCH sửa KL chen giữa
  // (DELETE+INSERT dòng) không làm lệch id dòng/tổng giữa các câu.
  const detail = await withProjectScope(
    projectId ?? "*",
    async () => {
      const cert = await getCertForProject(id, projectId);
      if (!cert) return null;
      const totals = await certTotals(id);
      const lines = await certLinesExact(id);
      return { cert, totals, lines };
    },
    { isolation: "repeatable_read" },
  );
  if (!detail)
    return NextResponse.json({ error: "Không tìm thấy đợt thanh toán" }, { status: 404 });
  const { cert, totals, lines } = detail;
  const exactById = new Map(lines.map((l) => [l.id, l]));

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

  // L5: gom giá trị exact theo cột trước, quyết định kiểu number/text cho CẢ cột.
  const cotDonGia: GiaTriExact[] = [];
  const cotKlDot: GiaTriExact[] = [];
  const cotLuyKe: GiaTriExact[] = [];
  const cotThanhTien: GiaTriExact[] = [];
  for (const it of cert.items) {
    // Số liệu dòng lấy từ ::text cùng giao dịch, không từ number của json_agg (float).
    const exact = exactById.get(it.id);
    if (!exact) throw new Error(`Dòng KL #${it.id} không đọc được dạng chính xác`);
    const price = parseFixedDecimalExact(exact.unitPrice, PRICE_SCALE);
    const qtyPeriod = parseFixedDecimalExact(exact.qtyPeriod, QTY_SCALE);
    cotDonGia.push({ unscaled: price, scale: PRICE_SCALE });
    cotKlDot.push({ unscaled: qtyPeriod, scale: QTY_SCALE });
    cotLuyKe.push({
      unscaled: parseFixedDecimalExact(exact.qtyCumulative, QTY_SCALE),
      scale: QTY_SCALE,
    });
    // Thành tiền dòng KHÔNG làm tròn (ipc-sum-v1 cộng rồi mới round tổng) — giữ đủ scale 5.
    cotThanhTien.push({ unscaled: qtyPeriod * price, scale: QTY_SCALE + PRICE_SCALE });
  }
  const donGia = oExcelTheoCot(cotDonGia);
  const klDot = oExcelTheoCot(cotKlDot);
  const luyKe = oExcelTheoCot(cotLuyKe);
  const thanhTien = oExcelTheoCot(cotThanhTien);
  const tong = oExcelTheoCot([
    { unscaled: totals.periodValue, scale: 2 },
    { unscaled: -totals.advanceDeduct, scale: 2 },
    { unscaled: -totals.retentionDeduct, scale: 2 },
    { unscaled: totals.approvedValue, scale: 2 },
  ]);

  cert.items.forEach((it, i) => {
    ws.addRow([
      it.boqCode,
      it.boqName,
      it.boqUnit,
      donGia.cells[i],
      klDot.cells[i],
      luyKe.cells[i],
      thanhTien.cells[i],
    ]);
  });

  const ghiChu = ghiChuCotText(
    [
      ["Đơn giá", donGia.laText],
      ["KL đợt này", klDot.laText],
      ["Luỹ kế", luyKe.laText],
      ["Thành tiền đợt", thanhTien.laText],
      ["Giá trị đợt/Trừ tạm ứng/Trừ giữ lại/Đề nghị thanh toán", tong.laText],
    ]
      .filter(([, laText]) => laText)
      .map(([ten]) => ten as string),
  );
  if (ghiChu) ws.addRow([ghiChu]).font = { italic: true };

  ws.addRow([]);
  ws.addRow(["", "", "", "", "", "Giá trị đợt này", tong.cells[0]]);
  ws.addRow(["", "", "", "", "", "Trừ tạm ứng", tong.cells[1]]);
  ws.addRow(["", "", "", "", "", "Trừ giữ lại bảo hành", tong.cells[2]]);
  const grand = ws.addRow(["", "", "", "", "", "GIÁ TRỊ ĐỀ NGHỊ THANH TOÁN", tong.cells[3]]);
  grand.font = { bold: true };

  ws.columns.forEach((col) => (col.width = 18));
  ws.getColumn(2).width = 32;

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${cert.code}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
