import { NextRequest, NextResponse } from "next/server";
import { insertId, withProjectScope } from "@/lib/db";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  CONTRACT_KINDS,
  checkContractRefs,
  contractsToWire,
  listContracts,
  parseContractBody,
  validateContractInput,
  type ContractInput,
  type ContractKind,
} from "@/lib/tai-chinh/contracts";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyInputErrorBody,
  moneyWireFormat,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

// GET /api/contracts?kind= — danh sách HĐ kèm tổng hợp (phụ lục/đã thanh toán/PO),
// scoped theo dự án đang chọn (M22). Giá trị tiền → chỉ vai trò xem thanh toán
// (admin/pm/bch), như /costs. S10c (A3-FR06): header decimal-string-v1 → value/addendaTotal/
// paid/poCommitted là chuỗi canonical exact + `moneyFormat`; legacy → number, ngoài biên → 422.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem hợp đồng" }, { status: 403 });

  const kindRaw = req.nextUrl.searchParams.get("kind")?.trim() || null;
  if (kindRaw && !CONTRACT_KINDS.includes(kindRaw as ContractKind))
    return NextResponse.json({ error: "Loại hợp đồng không hợp lệ" }, { status: 422 });

  // Soft-delete (M45 PR4): admin ?includeDeleted=1 xem hợp đồng đã xoá.
  const deletedView =
    user.role === "admin" && req.nextUrl.searchParams.get("includeDeleted") === "1"
      ? "deleted"
      : "alive";
  const projectId = await getCurrentProjectId(user);
  const contracts =
    projectId != null
      ? await withProjectScope(projectId, () =>
          listContracts((kindRaw as ContractKind) ?? undefined, projectId, deletedView),
        )
      : [];
  // M50 PR2: che giá trị/tỷ lệ HĐ cho user thiếu viewPayments (phòng thủ — gate route
  // hiện cũng là viewPayments nên không đổi ai hiện tại).
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  try {
    return NextResponse.json(
      {
        contracts: contractsToWire(stripSensitive("contract", contracts, user), format),
        ...nhanDinhDangTien(format),
      },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
}

// POST /api/contracts — tạo HĐ (Admin/PM). Số HĐ nhập tay, UNIQUE chống trùng.
// Gán project_id = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo hợp đồng (chỉ Admin/PM)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo hợp đồng" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  // S10: giá trị HĐ đọc exact — "1.234.567" kiểu vi-VN → 400, vượt NUMERIC(15,2) → 422.
  let input: ContractInput;
  try {
    input = parseContractBody(body);
  } catch (err) {
    const loi = moneyInputErrorBody(err);
    if (loi) return NextResponse.json(loi.body, { status: loi.status });
    throw err;
  }
  const invalid = validateContractInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkContractRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  let id: number;
  try {
    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
    const kq = await ghiNeuConQuyen(
      () => CAN.manageContracts(user.role),
      () =>
        insertId(
          `INSERT INTO contracts (code, kind, title, party_supplier_id, party_name, system_id,
                              value, advance_pct, retention_pct, signed_date, valid_from, valid_to,
                              status, note, created_by, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          input.code,
          input.kind,
          input.title,
          input.partySupplierId,
          input.partyName,
          input.systemId,
          input.value,
          input.advancePct,
          input.retentionPct,
          input.signedDate,
          input.validFrom,
          input.validTo,
          input.status,
          input.note,
          user.id,
          projectId,
        ),
    );
    if (!kq.ok)
      return NextResponse.json(
        { error: "Bạn không có quyền tạo hợp đồng (chỉ Admin/PM)" },
        { status: 403 },
      );
    id = kq.value;
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
