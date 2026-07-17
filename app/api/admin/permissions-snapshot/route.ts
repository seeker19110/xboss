import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { todayISO } from "@/lib/db";
import {
  getCurrentUser,
  CAN,
  ROLES,
  PERM_KEYS,
  permDefaultsMatrix,
  type PermKey,
} from "@/lib/auth";
import { listPermissionOverrides } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// GET /api/admin/permissions-snapshot — xuất Excel ma trận quyền HIỆU LỰC (mặc định
// CAN_DEFAULT + override role_permissions đè, M50 PR1) tại thời điểm gọi, kèm cột
// "Nguồn" (Mặc định/Override) — phục vụ câu hỏi kiểm toán "ai có quyền gì" (M50 PR3).
// Chỉ Admin (CAN.viewAudit — cùng gate với /api/admin/sod-report, cả hai đều phục vụ
// kiểm toán quyền).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewAudit(me.role))
    return NextResponse.json({ error: "Chỉ Admin được xuất ma trận phân quyền" }, { status: 403 });

  const defaults = permDefaultsMatrix();
  const overrides = await listPermissionOverrides();
  const overrideMap = new Map<string, boolean>();
  for (const o of overrides) overrideMap.set(`${o.role}|${o.permKey}`, o.allowed);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ma trận quyền");
  ws.columns = [{ width: 28 }, { width: 14 }, { width: 12 }, { width: 16 }];

  const exportedAt = new Date().toLocaleString("vi-VN");
  const titleRow = ws.addRow([`Ma trận quyền hiệu lực — xuất lúc ${exportedAt}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 4);
  ws.addRow([]);
  const header = ws.addRow(["Quyền (perm_key)", "Vai trò", "Hiệu lực", "Nguồn"]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };
  });

  for (const permKey of PERM_KEYS as PermKey[]) {
    for (const role of ROLES) {
      const key = `${role}|${permKey}`;
      const ov = overrideMap.get(key);
      const effective = ov !== undefined ? ov : (defaults[permKey]?.[role] ?? false);
      const source = ov !== undefined ? "Override" : "Mặc định";
      ws.addRow([permKey, role, effective ? "Có" : "Không", source]);
    }
  }
  ws.views = [{ state: "frozen", ySplit: header.number }];

  const today = todayISO();
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="permissions-snapshot-${today}.xlsx"`,
    },
  });
}
