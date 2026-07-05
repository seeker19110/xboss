import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  CONTRACT_KINDS,
  checkContractRefs,
  listContracts,
  parseContractBody,
  validateContractInput,
  type ContractKind,
} from "@/lib/contracts";

export const dynamic = "force-dynamic";

// GET /api/contracts?kind= — danh sách HĐ kèm tổng hợp (phụ lục/đã thanh toán/PO).
// Giá trị tiền → chỉ vai trò xem thanh toán (admin/pm/bch), như /costs.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem hợp đồng" }, { status: 403 });

  const kindRaw = req.nextUrl.searchParams.get("kind")?.trim() || null;
  if (kindRaw && !CONTRACT_KINDS.includes(kindRaw as ContractKind))
    return NextResponse.json({ error: "Loại hợp đồng không hợp lệ" }, { status: 422 });

  const contracts = await listContracts((kindRaw as ContractKind) ?? undefined);
  return NextResponse.json({ contracts });
}

// POST /api/contracts — tạo HĐ (Admin/PM). Số HĐ nhập tay, UNIQUE chống trùng.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hợp đồng (chỉ Admin/PM)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseContractBody(body);
  const invalid = validateContractInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkContractRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO contracts (code, kind, title, party_supplier_id, party_name, discipline_id,
                              value, advance_pct, retention_pct, signed_date, valid_from, valid_to,
                              status, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.code,
      input.kind,
      input.title,
      input.partySupplierId,
      input.partyName,
      input.disciplineId,
      input.value,
      input.advancePct,
      input.retentionPct,
      input.signedDate,
      input.validFrom,
      input.validTo,
      input.status,
      input.note,
      user.id,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Số hợp đồng "${input.code}" đã tồn tại` },
        { status: 409 },
      );
    throw err;
  }

  return NextResponse.json({ id }, { status: 201 });
}
