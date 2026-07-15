import { NextRequest, NextResponse } from "next/server";
import { insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { withUniqueRetry } from "@/lib/seqcode";
import { openApproval } from "@/lib/approvals";
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
} from "@/lib/proposals";

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

  const input = parseProposalBody(body);
  const invalid = validateProposalInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkProposalRefs(input, projectId);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  const { id, code } = await withUniqueRetry(async () => {
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
    return { id, code };
  });
  // M46 PR3: mở approval request nếu có flow cấu hình cho 'proposal' (PR4) — không có
  // flow thì openApproval trả null, không đổi hành vi hiện tại (giữ y hệt submit/decide cũ).
  await openApproval({
    entityType: "proposal",
    entityId: id,
    projectId,
    amount: input.amount,
    user,
  });
  return NextResponse.json({ id, code }, { status: 201 });
}
