import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { withUniqueRetry } from "@/lib/seqcode";
import {
  CLAIM_KINDS,
  CLAIM_STATUSES,
  checkClaimRefs,
  listClaims,
  nextClaimCode,
  parseClaimBody,
  validateClaimInput,
  type ClaimKind,
  type ClaimStatus,
} from "@/lib/claims";

export const dynamic = "force-dynamic";

// GET /api/claims?kind=&status=&contractId= — danh sách claim của dự án đang chọn.
// Nhạy cảm thương mại — ẩn với cdt/subcon/viewer (như VO/thanh toán KL).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewClaims(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem claim" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const kindRaw = sp.get("kind")?.trim() || undefined;
  if (kindRaw && !CLAIM_KINDS.includes(kindRaw as ClaimKind))
    return NextResponse.json({ error: "Loại claim không hợp lệ" }, { status: 422 });
  const statusRaw = sp.get("status")?.trim() || undefined;
  if (statusRaw && !CLAIM_STATUSES.includes(statusRaw as ClaimStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
  const contractIdRaw = sp.get("contractId");
  const contractId = contractIdRaw ? Number(contractIdRaw) : undefined;

  // Soft-delete (M45 PR4): admin ?includeDeleted=1 xem claim đã xoá.
  const deletedView =
    user.role === "admin" && sp.get("includeDeleted") === "1" ? "deleted" : "alive";
  const projectId = await getCurrentProjectId(user);
  const items = await listClaims(projectId, {
    kind: kindRaw as ClaimKind | undefined,
    status: statusRaw as ClaimStatus | undefined,
    contractId,
    deletedView,
  });
  return NextResponse.json({ items });
}

// POST /api/claims — ghi nhận claim mới (Admin/PM/Kỹ sư — ghi nhận tại hiện trường).
// Mã CLM-0001 sinh tự động; project_id suy từ dự án đang chọn của server (không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageClaims(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền ghi nhận claim (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 422 });

  const input = parseClaimBody(body);
  const validationErr = validateClaimInput(input);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
  const refErr = await checkClaimRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const projectId = await getCurrentProjectId(user);

  const { id, code } = await withUniqueRetry(async () => {
    const code = await nextClaimCode();
    const id = await insertId(
      `INSERT INTO claims (project_id, code, kind, title, contract_id, vo_id, notice_date, cause,
                            amount_requested, days_requested, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      projectId,
      code,
      input.kind,
      input.title,
      input.contractId,
      input.voId,
      input.noticeDate,
      input.cause,
      input.amountRequested,
      input.daysRequested,
      user.id,
    );
    return { id, code };
  });
  return NextResponse.json({ id, code }, { status: 201 });
}
