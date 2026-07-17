import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { query, todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { buildAuditFilter } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Trần an toàn — xuất toàn bộ bản ghi khớp filter (không phân trang) nhưng chặn để
// tránh sinh file khổng lồ nếu quên lọc.
const EXPORT_LIMIT = 5000;

const ACTION_LABEL: Record<string, string> = {
  INSERT: "Thêm mới",
  UPDATE: "Sửa",
  DELETE: "Xoá",
};

type AuditExportRow = {
  at: string | Date;
  actorName: string | null;
  actorRole: string | null;
  entityType: string;
  entityId: number;
  action: string;
  changes: Record<string, [unknown, unknown]> | Record<string, unknown> | null;
};

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

// Serialize cột changes thành text đọc được trong Excel: UPDATE liệt kê từng cột đổi
// "cột: cũ → mới" mỗi dòng; INSERT/DELETE ghi snapshot JSON gọn.
function formatChanges(action: string, changes: AuditExportRow["changes"]): string {
  if (!changes) return "";
  if (action === "UPDATE") {
    return Object.entries(changes as Record<string, [unknown, unknown]>)
      .map(([col, pair]) => `${col}: ${fmtVal(pair[0])} → ${fmtVal(pair[1])}`)
      .join("\n");
  }
  return `snapshot: ${JSON.stringify(changes)}`;
}

// GET /api/admin/audit-log/export?entity=&entityId=&actorId=&from=&to= → file .xlsx —
// chỉ Admin, cùng bộ filter với /api/admin/audit-log.
export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewAudit(me.role))
    return NextResponse.json({ error: "Không có quyền xuất audit trail" }, { status: 403 });

  const projectId = await getCurrentProjectId(me);
  const { where, params } = buildAuditFilter(req.nextUrl.searchParams, projectId);

  const rows = await query<AuditExportRow>(
    `SELECT al.at, u.name AS "actorName", al.actor_role AS "actorRole",
            al.entity_type AS "entityType", al.entity_id AS "entityId",
            al.action, al.changes
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.actor_id
       ${where}
      ORDER BY al.id DESC
      LIMIT ?`,
    ...params,
    EXPORT_LIMIT,
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Audit trail");
  ws.columns = [
    { width: 20 },
    { width: 20 },
    { width: 12 },
    { width: 20 },
    { width: 10 },
    { width: 12 },
    { width: 70 },
  ];
  const header = ws.addRow([
    "Thời gian",
    "Người",
    "Vai trò",
    "Thực thể",
    "ID",
    "Hành động",
    "Thay đổi",
  ]);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF27272A" } };
  });
  for (const r of rows) {
    const row = ws.addRow([
      new Date(r.at).toLocaleString("vi-VN"),
      r.actorName ?? "—",
      r.actorRole ?? "—",
      r.entityType,
      r.entityId,
      ACTION_LABEL[r.action] ?? r.action,
      formatChanges(r.action, r.changes),
    ]);
    row.eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: "top" };
    });
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };

  const today = todayISO();
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="audit-log-${today}.xlsx"`,
    },
  });
}
