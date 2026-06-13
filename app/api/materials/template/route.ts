import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/materials/template → tải file Excel mẫu import vật tư
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sheets = await query<{ code: string; name: string }>(
    `SELECT code, name FROM sheet_types ORDER BY id`);
  const sheetList = sheets.map(s => `${s.code} - ${s.name}`).join(", ");

  const wb = XLSX.utils.book_new();

  // ── Tab "Vật tư" — dữ liệu nhập ─────────────────────────────────────────
  const headers = ["Mã BOQ", "Tên vật tư *", "ĐVT", "Mã hệ *", "Định mức BOQ", "Định mức Tháp A", "Trạng thái", "Ghi chú"];
  const example = [
    ["AF1", "Ống đồng Ø15", "Mét", "OGTD", 120, 115, "dat_hang", "Tầng 1-5"],
    ["AF2", "Co đồng 90°",  "Cái", "OGTD",  40,  38, "ve_kho",   ""],
    ["",    "Van bi Ø15",   "Cái", "OGHL",  20,  20, "da_dung",  ""],
  ];

  const wsData = [headers, ...example];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Độ rộng cột
  ws["!cols"] = [
    { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 12 },
    { wch: 16 }, { wch: 18 }, { wch: 14 }, { wch: 25 },
  ];

  // Định dạng tiêu đề (bold)
  for (let c = 0; c < headers.length; c++) {
    const cell = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[cell]) ws[cell].s = { font: { bold: true }, fill: { fgColor: { rgb: "1C3A5A" } } };
  }

  XLSX.utils.book_append_sheet(wb, ws, "Vật tư");

  // ── Tab "Hướng dẫn" ───────────────────────────────────────────────────────
  const guide = XLSX.utils.aoa_to_sheet([
    ["HƯỚNG DẪN NHẬP VẬT TƯ"],
    [""],
    ["Cột", "Bắt buộc", "Mô tả"],
    ["Mã BOQ",           "Không", "Mã duy nhất toàn hệ thống. Để trống nếu chưa có."],
    ["Tên vật tư *",     "Có",    "Tên vật tư (không được để trống)."],
    ["ĐVT",              "Không", `Đơn vị tính: Cái, Mét, m2, Ống hoặc tự nhập.`],
    ["Mã hệ *",          "Có",    `Mã hệ (sheet). Các hệ hiện có: ${sheetList}`],
    ["Định mức BOQ",     "Không", "Định mức theo hợp đồng BOQ gốc. Số nguyên hoặc thập phân."],
    ["Định mức Tháp A",  "Không", "Định mức bóc lại thực tế Tháp A."],
    ["Trạng thái",       "Không", "dat_hang | ve_kho | da_dung (mặc định: dat_hang)"],
    ["Ghi chú",          "Không", "Ghi chú tự do."],
    [""],
    ["Lưu ý:"],
    ["- Hàng tiêu đề (hàng 1) không được xóa hoặc đổi thứ tự cột."],
    ["- Mã BOQ nếu nhập phải là duy nhất trong toàn hệ thống (không trùng với task hoặc nhóm công việc)."],
    ["- Mã hệ phải khớp chính xác với mã đã có trong hệ thống (phân biệt hoa/thường)."],
    ["- Các hàng trống (không có tên vật tư) sẽ bị bỏ qua."],
  ]);
  guide["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 65 }];
  XLSX.utils.book_append_sheet(wb, guide, "Hướng dẫn");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mau-import-vat-tu.xlsx"',
    },
  });
}
