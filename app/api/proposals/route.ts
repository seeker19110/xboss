import { NextRequest, NextResponse } from "next/server";
import { moneyInputErrorBody, parseMoneyExact } from "@/lib/nen/money";
import { phanHoiLoiCoStatus } from "@/lib/nen/loi";
import { insertId, queryOne, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { withUniqueRetry } from "@/lib/ha-tang/seqcode";
import { resyncApprovalAmount } from "@/lib/tien-do/approvals";
import {
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  canSeeAllProposals,
  checkProposalRefs,
  listProposals,
  nextProposalCode,
  parseProposalBody,
  validateProposalInput,
  type ProposalKind,
  type ProposalStatus,
} from "@/lib/tai-chinh/proposals";

export const dynamic = "force-dynamic";

// GET /api/proposals?kind=&status= — danh sách đề xuất. Admin/PM/BCH thấy tất cả;
// vai trò còn lại chỉ thấy đề xuất mình tạo (spec M19).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const kindRaw = sp.get("kind")?.trim() || undefined;
  if (kindRaw && !PROPOSAL_KINDS.includes(kindRaw as ProposalKind))
    return NextResponse.json({ error: "Loại đề xuất không hợp lệ" }, { status: 422 });
  const statusRaw = sp.get("status")?.trim() || undefined;
  if (statusRaw && !PROPOSAL_STATUSES.includes(statusRaw as ProposalStatus))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const proposals =
    projectId != null
      ? await listProposals({
          kind: kindRaw as ProposalKind | undefined,
          status: statusRaw as ProposalStatus | undefined,
          requestedBy: canSeeAllProposals(user) ? undefined : user.id,
          projectId,
        })
      : [];
  return NextResponse.json({ proposals });
}

// POST /api/proposals — tạo đề xuất mới (mọi vai trò thao tác), mã tự sinh DX-000N,
// gán project_id = dự án đang chọn (server suy, không tin client).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền tạo đề xuất" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo đề xuất" }, { status: 422 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  let input: ReturnType<typeof parseProposalBody>;
  try {
    input = parseProposalBody(body);
  } catch (e) {
    const loi = moneyInputErrorBody(e);
    if (!loi) throw e;
    return NextResponse.json(loi.body, { status: loi.status });
  }
  const invalid = validateProposalInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkProposalRefs(input, projectId);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  // S15a: tạo đề xuất + mở approval cùng 1 transaction. Giá trị so ngưỡng bước duyệt đọc lại
  // `amount::text` từ DB và đi qua resyncApprovalAmount (MoneyMinor exact, giống S13d/S13e):
  // không `Number(string)` xấp xỉ; tràn NUMERIC(15,2)/mất chính xác → 422 và rollback cả đề xuất.
  // M46 PR3: không có flow cấu hình cho 'proposal' thì không mở request (giữ hành vi cũ).
  try {
    const { id, code } = await withUniqueRetry(() =>
      withTransaction(async () => {
        const code = await nextProposalCode();
        const id = await insertId(
          `INSERT INTO proposals (code, kind, title, amount, contract_id, material_id, reason, requested_by, project_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          code,
          input.kind,
          input.title,
          input.amount,
          input.contractId,
          input.materialId,
          input.reason,
          user.id,
          projectId,
        );
        const dx = await queryOne<{ amount: string | null }>(
          `SELECT amount::text AS amount FROM proposals WHERE id = ?`,
          id,
        );
        await resyncApprovalAmount({
          entityType: "proposal",
          entityId: id,
          projectId,
          amountMinor: dx?.amount == null ? null : parseMoneyExact(dx.amount),
          openAs: user,
        });
        return { id, code };
      }),
    );
    return NextResponse.json({ id, code }, { status: 201 });
  } catch (err) {
    return phanHoiLoiCoStatus(err);
  }
}
