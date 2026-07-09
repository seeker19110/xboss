import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  INSURANCE_KINDS,
  checkInsuranceContractRef,
  listInsuranceBonds,
  parseInsuranceBody,
  validateInsuranceInput,
  type InsuranceKind,
} from "@/lib/insurance";

export const dynamic = "force-dynamic";

// GET /api/insurance-bonds?kind= — danh sách bảo hiểm/bảo lãnh, scoped theo dự án đang
// chọn (M22). Xem: Admin/PM/BCH (viewPayments — cùng nhóm quyền chi phí/thanh toán).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền xem bảo hiểm & bảo lãnh" },
      { status: 403 },
    );

  const kindRaw = req.nextUrl.searchParams.get("kind")?.trim() || null;
  if (kindRaw && !INSURANCE_KINDS.includes(kindRaw as InsuranceKind))
    return NextResponse.json({ error: "Loại bảo hiểm/bảo lãnh không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const bonds =
    projectId != null
      ? await listInsuranceBonds(projectId, { kind: (kindRaw as InsuranceKind) ?? undefined })
      : [];
  return NextResponse.json({ bonds });
}

// POST /api/insurance-bonds — tạo bảo hiểm/bảo lãnh (Admin/PM — manageContracts), chưa
// kèm file (upload chứng thư qua PATCH multipart sau khi có id). Gán project_id = dự án
// đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo bảo hiểm/bảo lãnh (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json(
      { error: "Chưa có dự án nào để tạo bảo hiểm/bảo lãnh" },
      { status: 422 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const input = parseInsuranceBody(body);
  const invalid = validateInsuranceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkInsuranceContractRef(input.contractId, projectId);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const id = await insertId(
    `INSERT INTO insurance_bonds (project_id, contract_id, kind, title, provider, code, value,
                                   issued_date, expiry_date, status, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    projectId,
    input.contractId,
    input.kind,
    input.title,
    input.provider,
    input.code,
    input.value,
    input.issuedDate,
    input.expiryDate,
    input.status,
    input.note,
    user.id,
  );

  return NextResponse.json({ id }, { status: 201 });
}
