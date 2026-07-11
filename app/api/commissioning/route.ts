import { NextRequest, NextResponse } from "next/server";
import { insertId, queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  COMMISSIONING_RESULTS,
  listCommissioning,
  parseCommissioningBody,
  validateCommissioningInput,
  type CommissioningResult,
} from "@/lib/handover";

export const dynamic = "force-dynamic";

// GET /api/commissioning?result= — danh sách hệ thống T&C, scoped theo dự án đang chọn
// (M22). Xem: mọi vai trò đăng nhập.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const resultRaw = req.nextUrl.searchParams.get("result")?.trim() || null;
  if (resultRaw && !COMMISSIONING_RESULTS.includes(resultRaw as CommissioningResult))
    return NextResponse.json({ error: "Kết quả không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const items =
    projectId != null
      ? await listCommissioning(projectId, {
          result: (resultRaw as CommissioningResult) ?? undefined,
        })
      : [];
  return NextResponse.json({ items });
}

// POST /api/commissioning — tạo hệ thống T&C (manageHandover: Admin/PM/kỹ sư). Gán
// project_id = dự án đang chọn (server suy). result mặc định 'draft' — 'passed'/'failed'
// chỉ đặt được qua PATCH (cần CAN.approve).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageHandover(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hệ thống T&C (Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo hệ thống T&C" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseCommissioningBody(body);
  if (input.result === "passed" || input.result === "failed") {
    if (!CAN.approve(user.role))
      return NextResponse.json(
        { error: "Chỉ Admin/PM được đặt kết quả Đạt/Không đạt" },
        { status: 403 },
      );
  }
  const invalid = validateCommissioningInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  if (input.tradeId != null) {
    const disc = await queryOne(`SELECT id FROM systems WHERE id = ?`, input.tradeId);
    if (!disc) return NextResponse.json({ error: "Hệ không tồn tại" }, { status: 422 });
  }

  const id = await insertId(
    `INSERT INTO commissioning (project_id, code, system_name, system_id, checklist,
                                 result, tested_at, note, created_by)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)`,
    projectId,
    input.code,
    input.systemName,
    input.tradeId,
    JSON.stringify(input.checklist),
    input.result,
    input.testedAt,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
