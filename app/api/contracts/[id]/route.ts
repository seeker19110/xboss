import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { query, queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { photoPath } from "@/lib/photos";
import {
  checkContractRefs,
  contractLinkCounts,
  listContracts,
  parseContractBody,
  validateContractInput,
  type ContractInput,
} from "@/lib/contracts";

export const dynamic = "force-dynamic";

// GET /api/contracts/:id — chi tiết HĐ + phụ lục + file + các dòng tiền đã gắn,
// scoped theo dự án đang chọn (M22).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem hợp đồng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  // Tái dùng query tổng hợp của danh sách (1 dự án — số HĐ ít, lọc trong JS đủ rẻ).
  const contract =
    projectId != null
      ? (await listContracts(undefined, projectId)).find((c) => c.id === id)
      : undefined;
  if (!contract) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });

  const [addenda, documents, bills, purchaseOrders, floorContracts] = await Promise.all([
    query(
      `SELECT a.id, a.code, a.title, a.value_delta AS "valueDelta", a.signed_date AS "signedDate",
              a.note, a.created_at AS "createdAt", u.name AS "createdByName"
         FROM contract_addenda a LEFT JOIN users u ON u.id = a.created_by
        WHERE a.contract_id = ? ORDER BY a.id`,
      id,
    ),
    query(
      `SELECT d.id, d.original_name AS "originalName", d.mime_type AS "mimeType",
              d.size_bytes AS "sizeBytes", d.caption, d.created_at AS "createdAt",
              d.uploaded_by AS "uploadedBy", u.name AS "uploaderName"
         FROM contract_documents d LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.contract_id = ? ORDER BY d.id DESC`,
      id,
    ),
    query(
      `SELECT id, responsible, type, amount, paid_date AS "paidDate", description
         FROM payment_bills WHERE contract_id = ? ORDER BY paid_date DESC, id DESC`,
      id,
    ),
    query(
      `SELECT po.id, po.po_code AS "poCode", po.status, po.expected_date AS "expectedDate",
              s.name AS "supplierName"
         FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.contract_id = ? ORDER BY po.id DESC`,
      id,
    ),
    query(
      `SELECT fc.id, fc.floor_label AS "floorLabel", fc.contract_value AS "contractValue",
              st.name AS "sheetName", st.slug AS "sheetSlug"
         FROM floor_contracts fc JOIN sheet_types st ON st.id = fc.sheet_type_id
        WHERE fc.contract_id = ? ORDER BY st.id, fc.floor_label`,
      id,
    ),
  ]);

  return NextResponse.json({ contract, addenda, documents, bills, purchaseOrders, floorContracts });
}

// PATCH /api/contracts/:id — sửa HĐ (Admin/PM). Body gửi field nào sửa field đó
// (merge với bản ghi hiện tại rồi validate toàn bộ).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa hợp đồng (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<Record<string, unknown>>(
          `SELECT code, kind, title, party_supplier_id AS "partySupplierId", party_name AS "partyName",
                  system_id AS "systemId", value, advance_pct AS "advancePct",
                  retention_pct AS "retentionPct", signed_date AS "signedDate",
                  valid_from AS "validFrom", valid_to AS "validTo", status, note
             FROM contracts WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  // Field không gửi giữ giá trị cũ; field gửi null để xoá (partyName/ngày/note...).
  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input: ContractInput = parseContractBody(merged);

  const invalid = validateContractInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkContractRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  try {
    await run(
      `UPDATE contracts SET code = ?, kind = ?, title = ?, party_supplier_id = ?, party_name = ?,
              system_id = ?, value = ?, advance_pct = ?, retention_pct = ?, signed_date = ?,
              valid_from = ?, valid_to = ?, status = ?, note = ?
        WHERE id = ?`,
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
      id,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Số hợp đồng "${input.code}" đã tồn tại` },
        { status: 409 },
      );
    throw err;
  }

  return NextResponse.json({ updated: id });
}

// DELETE /api/contracts/:id — chỉ Admin; chặn 409 khi còn dòng tiền gắn vào
// (gỡ liên kết bill/PO/floor_contracts/BOQ trước — không mất dấu vết tiền đã chi).
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (user.role !== "admin")
    return NextResponse.json({ error: "Chỉ Admin được xoá hợp đồng" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const existing =
    projectId != null
      ? await queryOne<{ id: number }>(
          `SELECT id FROM contracts WHERE id = ? AND project_id = ?`,
          id,
          projectId,
        )
      : undefined;
  if (!existing) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });

  const links = await contractLinkCounts(id);
  const linked = links.bills + links.pos + links.floorContracts + links.boqItems;
  if (linked > 0)
    return NextResponse.json(
      {
        error: `Hợp đồng còn ${linked} bản ghi gắn vào (thanh toán/PO/giao thầu tầng/BOQ) — gỡ liên kết trước khi xoá`,
      },
      { status: 409 },
    );

  // Lấy tên file trước khi xoá (ON DELETE CASCADE xoá row nhưng không xoá file trên đĩa).
  const docs = await query<{ file_name: string }>(
    `SELECT file_name FROM contract_documents WHERE contract_id = ?`,
    id,
  );
  await run(`DELETE FROM contracts WHERE id = ?`, id);
  for (const d of docs) {
    const p = photoPath(d.file_name);
    if (p)
      await unlink(p).catch(() => {
        /* file đã mất trên đĩa — bỏ qua */
      });
  }

  return NextResponse.json({ deleted: id });
}
