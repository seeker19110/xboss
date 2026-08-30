import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { layDongTakeoffChoExport } from "@/lib/ky-thuat/cad/dashboard";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/takeoff-export — Excel GỘP các dòng KL đã bóc gửi kèm từ plugin
// (XBOSS_UPLOAD, M101 §6.4 PR5) trong dự án đang chọn. Nút "Tải Excel gộp" trên bảng điều
// khiển plugin. Đây là bản tổng hợp phía SERVER những gì đã gửi về (không đọc DWG) — khác với
// Excel mẫu công ty (Data-BOQ) mà plugin xuất tại máy kỹ sư qua XBOSS_BOCKL_XUAT/XBOSS_BATCH;
// KHÔNG ghi/đọc gì vào bảng BOQ, chỉ tổng hợp lại dữ liệu đã lưu trong standardize_report.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem dữ liệu CAD" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  const dong = projectId == null ? [] : await layDongTakeoffChoExport(projectId);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("KL-boc-gop");

  ws.addRow(["TỔNG HỢP KHỐI LƯỢNG ĐÃ BÓC GỬI VỀ TỪ PLUGIN (XBOSS_UPLOAD) — KHÔNG PHẢI SỔ BOQ"]);
  ws.addRow([
    "Dữ liệu tham khảo nhanh trên web; bảng BOQ chính thức vẫn ở XBOSS_BOCKL_XUAT/XBOSS_BATCH.",
  ]);
  ws.addRow([]);

  const header = ws.addRow([
    "Bản vẽ",
    "Tên bản vẽ",
    "Rev",
    "Hệ",
    "Hạng mục",
    "Size",
    "Vùng",
    "Đơn vị",
    "Khối lượng (đo)",
    "Mã BOQ",
    "Hệ số quy đổi",
    "Mô tả quy đổi",
    "KL quy đổi",
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
  });

  for (const d of dong) {
    ws.addRow([
      d.drawingCode,
      d.drawingName,
      d.rev,
      d.he,
      d.ten,
      d.size,
      d.vung,
      d.donVi,
      d.khoiLuong,
      d.boqCode,
      // Hệ số/KL quy đổi để TRỐNG khi rule pack không khai (null) — không suy đoán, không mặc định 1.
      d.heSoQuyDoi ?? "",
      d.moTaQuyDoi,
      d.klQuyDoi ?? "",
    ]);
  }

  ws.columns.forEach((col) => (col.width = 16));
  ws.getColumn(2).width = 30;
  ws.getColumn(5).width = 28;

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="xboss-kl-boc-gop.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
