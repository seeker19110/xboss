import { NextRequest, NextResponse } from "next/server";
import { insertId, query, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  parsePayrollBody,
  validatePayrollInput,
  payrollFromAttendance,
  type PayrollInput,
} from "@/lib/finance";
import { stripSensitive } from "@/lib/sensitive-fields";

export const dynamic = "force-dynamic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

export type PayrollRow = PayrollInput & {
  id: number;
  crewName: string | null;
  personnelName: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

// GET /api/payroll?period=&suggest=1 — kỳ lương đã ghi (scoped theo dự án đang chọn,
// M22); truyền suggest=1 để trả thêm gợi ý tính từ chấm công (payrollFromAttendance,
// yêu cầu period hợp lệ) — không ghi vào bảng payroll. Xem: CAN.viewPayments.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem lương" }, { status: 403 });

  const period = req.nextUrl.searchParams.get("period");
  if (period && !PERIOD_RE.test(period))
    return NextResponse.json({ error: "Kỳ lương không hợp lệ (YYYY-MM)" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ payroll: [], suggestions: [] });

  const conds = ["p.project_id = ?"];
  const args: unknown[] = [projectId];
  if (period) {
    conds.push("p.period = ?");
    args.push(period);
  }
  const payroll = await query<PayrollRow>(
    `SELECT p.id, p.period, p.crew_id AS "crewId", c.name AS "crewName",
            p.personnel_id AS "personnelId", pe.full_name AS "personnelName",
            p.workdays, p.rate, p.gross, p.deductions, p.net, p.status,
            p.created_by AS "createdBy", u.name AS "createdByName", p.created_at AS "createdAt"
       FROM payroll p
       LEFT JOIN crews c ON c.id = p.crew_id
       LEFT JOIN personnel pe ON pe.id = p.personnel_id
       LEFT JOIN users u ON u.id = p.created_by
      WHERE ${conds.join(" AND ")}
      ORDER BY p.period DESC, p.id DESC`,
    ...args,
  );

  const suggest = req.nextUrl.searchParams.get("suggest");
  const suggestions = suggest && period ? await payrollFromAttendance(period, projectId) : [];

  // M50 PR2: che số tiền lương (đơn giá/gộp/khấu trừ/thực nhận) cho user thiếu
  // viewPayroll — vd bch vào được trang lương (gate route = viewPayments) nhưng không
  // thấy số tiền. suggestions chỉ có công/nhân sự, không tiền → không che.
  return NextResponse.json({ payroll: stripSensitive("payroll", payroll, user), suggestions });
}

// POST /api/payroll — tạo kỳ lương (manageFinance: Admin/PM). project_id gán = dự án
// đang chọn (server suy). Số liệu thường lấy gợi ý từ chấm công (payrollFromAttendance)
// rồi người dùng xác nhận/chỉnh trước khi lưu — hàm gợi ý KHÔNG tự ghi vào bảng.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageFinance(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo kỳ lương (Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo kỳ lương" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parsePayrollBody(body);
  const invalid = validatePayrollInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.crewId != null) {
    const crew = await queryOne(
      `SELECT id FROM crews WHERE id = ? AND project_id = ?`,
      input.crewId,
      projectId,
    );
    if (!crew) return NextResponse.json({ error: "Tổ đội không tồn tại" }, { status: 422 });
  }
  if (input.personnelId != null) {
    const person = await queryOne(
      `SELECT id FROM personnel WHERE id = ? AND project_id = ?`,
      input.personnelId,
      projectId,
    );
    if (!person) return NextResponse.json({ error: "Nhân sự không tồn tại" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO payroll (project_id, period, crew_id, personnel_id, workdays, rate, gross,
                           deductions, net, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.period,
    input.crewId,
    input.personnelId,
    input.workdays,
    input.rate,
    input.gross,
    input.deductions,
    input.net,
    input.status,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
