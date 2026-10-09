import { NextRequest, NextResponse } from "next/server";
import { insertId, withProjectScope, withTransaction } from "@/lib/db";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { moneyInputErrorBody } from "@/lib/nen/money";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { withUniqueRetry } from "@/lib/ha-tang/seqcode";
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
} from "@/lib/tai-chinh/claims";

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
  // A1-AC02: không có dự án khả kiến → không mở toàn hệ (bám tiền lệ payments/bills).
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });
  const items = await withProjectScope(projectId, () =>
    listClaims(projectId, {
      kind: kindRaw as ClaimKind | undefined,
      status: statusRaw as ClaimStatus | undefined,
      contractId,
      deletedView,
    }),
  );
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

  let input: ReturnType<typeof parseClaimBody>;
  try {
    input = parseClaimBody(body);
  } catch (e) {
    const loi = moneyInputErrorBody(e);
    if (!loi) throw e;
    return NextResponse.json(loi.body, { status: loi.status });
  }
  const validationErr = validateClaimInput(input);
  if (validationErr) return NextResponse.json({ error: validationErr }, { status: 422 });
  const projectId = await getCurrentProjectId(user);

  // A1-AC03: hợp đồng/VO cùng dự án — kiểm + ghi trong 1 transaction (cha khoá FOR SHARE).
  const result = await withUniqueRetry(() =>
    withTransaction(async () => {
      // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
      if (!(await kiemQuyenTaiLucGhi(() => CAN.manageClaims(user.role)))) return { denied: true };
      const refErr = await checkClaimRefs(input, projectId);
      if (refErr) return { error: refErr };
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
    }),
  );
  if ("denied" in result)
    return NextResponse.json(
      { error: "Bạn không có quyền ghi nhận claim (Admin/PM/Kỹ sư)" },
      { status: 403 },
    );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ id: result.id, code: result.code }, { status: 201 });
}
