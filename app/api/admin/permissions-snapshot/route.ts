import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { todayISO, query } from "@/lib/db";
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
// "Nguồn" (Mặc định/Override toàn hệ/Override dự án <tên>) — phục vụ câu hỏi kiểm toán
// "ai có quyền gì" (M50 PR3). M61 PR2: thêm cột "Phạm vi" — ma trận TOÀN HỆ đầy đủ (như
// cũ) + với MỖI dự án có override riêng, chỉ xuất thêm các dòng CHÊNH LỆCH (không nhân
// bản toàn ma trận × N dự án). Chỉ Admin (CAN.viewAudit — cùng gate với
// /api/admin/sod-report, cả hai đều phục vụ kiểm toán quyền).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewAudit(me.role))
    return NextResponse.json({ error: "Chỉ Admin được xuất ma trận phân quyền" }, { status: 403 });

  const defaults = permDefaultsMatrix();
  // Toàn bộ override (toàn hệ lẫn theo dự án) trong 1 lượt — tránh N+1 query theo dự án.
  const overrides = await listPermissionOverrides();
  const globalMap = new Map<string, boolean>();
  const scopedByProject = new Map<number, Map<string, boolean>>();
  for (const o of overrides) {
    const key = `${o.role}|${o.permKey}`;
    if (o.projectId === null) {
      globalMap.set(key, o.allowed);
    } else {
      let m = scopedByProject.get(o.projectId);
      if (!m) {
        m = new Map<string, boolean>();
        scopedByProject.set(o.projectId, m);
      }
      m.set(key, o.allowed);
    }
  }
  const projects = await query<{ id: number; name: string }>(
    `SELECT id, name FROM projects ORDER BY id`,
  );
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ma trận quyền");
  ws.columns = [{ width: 28 }, { width: 14 }, { width: 20 }, { width: 12 }, { width: 24 }];

  const exportedAt = new Date().toLocaleString("vi-VN");
  const titleRow = ws.addRow([`Ma trận quyền hiệu lực — xuất lúc ${exportedAt}`]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, 5);
  ws.addRow([]);
  const header = ws.addRow(["Quyền (perm_key)", "Vai trò", "Phạm vi", "Hiệu lực", "Nguồn"]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };
  });

  // 1) Ma trận TOÀN HỆ đầy đủ (mọi (role, permKey)) — như cũ, chỉ đổi nhãn nguồn.
  for (const permKey of PERM_KEYS as PermKey[]) {
    for (const role of ROLES) {
      const key = `${role}|${permKey}`;
      const ov = globalMap.get(key);
      const effective = ov !== undefined ? ov : (defaults[permKey]?.[role] ?? false);
      const source = ov !== undefined ? "Override toàn hệ" : "Mặc định";
      ws.addRow([permKey, role, "Toàn hệ thống", effective ? "Có" : "Không", source]);
    }
  }

  // 2) Với mỗi dự án CÓ override riêng, chỉ thêm các dòng CHÊNH LỆCH (không lặp lại toàn
  // ma trận cho từng dự án).
  for (const [projectId, scoped] of scopedByProject) {
    const name = projectNames.get(projectId) ?? `#${projectId}`;
    for (const [key, allowed] of scoped) {
      const [role, permKey] = key.split("|");
      ws.addRow([
        permKey,
        role,
        `Dự án: ${name}`,
        allowed ? "Có" : "Không",
        `Override dự án ${name}`,
      ]);
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
