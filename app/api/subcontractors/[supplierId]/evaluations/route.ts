import { NextRequest, NextResponse } from "next/server";
import { queryOne, insertId } from "@/lib/db";
import { getCurrentUser, canViewSubcontractor, type Role } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/seqcode";
import {
  listEvaluations,
  validateEvaluationInput,
  type EvaluationInput,
} from "@/lib/subcontractors";

export const dynamic = "force-dynamic";

// Đánh giá hiệu quả định kỳ là nội bộ — không để subcon tự đánh giá mình (rộng hơn
// CAN.manageSuppliers vì cho phép cả kỹ sư, giống app/api/suppliers/[id]/ratings/route.ts
// của M04 — xem lib/auth.ts ghi chú CAN.manageSuppliers về điểm chưa nhất quán sẵn có).
const canEvaluate = (r?: Role) => r === "admin" || r === "pm" || r === "engineer";

// GET /api/subcontractors/:supplierId/evaluations — lịch sử đánh giá theo kỳ. Xem: mọi
// vai trò đăng nhập; subcon chỉ xem đúng NTP của mình.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ supplierId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const supplierId = parseInt(params.supplierId);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });
  if (!(await canViewSubcontractor(user, supplierId)))
    return NextResponse.json(
      { error: "Bạn chỉ được xem hồ sơ nhà thầu phụ của mình" },
      { status: 403 },
    );

  const items = await listEvaluations(supplierId);
  return NextResponse.json({ items });
}

// POST /api/subcontractors/:supplierId/evaluations — thêm đánh giá 1 kỳ mới.
// UNIQUE(supplier_id, period) chặn trùng kỳ. Chỉ Admin/PM/kỹ sư (không để subcon tự chấm).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ supplierId: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canEvaluate(user.role))
    return NextResponse.json(
      { error: "Chỉ Admin/PM/Kỹ sư được đánh giá nhà thầu phụ" },
      { status: 403 },
    );

  const supplierId = parseInt(params.supplierId);
  if (isNaN(supplierId)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const supplier = await queryOne(`SELECT id FROM suppliers WHERE id = ?`, supplierId);
  if (!supplier)
    return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const numOrNull = (v: unknown) => (v == null || v === "" ? null : Number(v));
  const input: EvaluationInput = {
    period: String(body.period ?? "").trim(),
    safetyScore: numOrNull(body.safetyScore),
    qualityScore: numOrNull(body.qualityScore),
    scheduleScore: numOrNull(body.scheduleScore),
    manpowerScore: numOrNull(body.manpowerScore),
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
  };
  const err = validateEvaluationInput(input);
  if (err) return NextResponse.json({ error: err }, { status: 422 });

  try {
    const id = await insertId(
      `INSERT INTO subcon_evaluations
         (supplier_id, period, safety_score, quality_score, schedule_score, manpower_score, note, evaluated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      supplierId,
      input.period,
      input.safetyScore,
      input.qualityScore,
      input.scheduleScore,
      input.manpowerScore,
      input.note,
      user.id,
    );
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: unknown) {
    if (isUniqueViolation(e))
      return NextResponse.json({ error: "Kỳ này đã được đánh giá rồi" }, { status: 409 });
    throw e;
  }
}
