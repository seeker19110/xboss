import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { withUniqueRetry } from "@/lib/seqcode";
import {
  RISK_STATUSES,
  listRisks,
  nextRiskCode,
  parseRiskBody,
  validateRiskInput,
  type RiskStatus,
} from "@/lib/risks";

export const dynamic = "force-dynamic";

// GET /api/risks?status= — sổ rủi ro. Mọi vai trò trừ subcon.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewRisks(user.role))
    return NextResponse.json({ error: "Không có quyền xem sổ rủi ro" }, { status: 403 });

  const statusRaw = req.nextUrl.searchParams.get("status")?.trim() || undefined;
  if (statusRaw && !RISK_STATUSES.includes(statusRaw as RiskStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const risks = await listRisks({ status: statusRaw as RiskStatus | undefined });
  return NextResponse.json({ risks });
}

// POST /api/risks — ghi nhận rủi ro mới (Admin/PM/kỹ sư), mã tự sinh R-000N.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageRisks(user.role))
    return NextResponse.json({ error: "Không có quyền ghi nhận rủi ro" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseRiskBody(body);
  const invalid = validateRiskInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });

  const { id, code } = await withUniqueRetry(async () => {
    const code = await nextRiskCode();
    const id = await insertId(
      `INSERT INTO risks (code, title, description, category, probability, impact, mitigation, owner, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      input.title,
      input.description,
      input.category,
      input.probability,
      input.impact,
      input.mitigation,
      input.owner,
      user.id,
    );
    return { id, code };
  });
  return NextResponse.json({ id, code }, { status: 201 });
}
