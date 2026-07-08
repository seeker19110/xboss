import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  REVISION_STATUSES,
  getRevisionDrawingProject,
  setRevisionStatus,
  type RevisionStatus,
} from "@/lib/drawings";
import { sendPushToUsers } from "@/lib/push";

export const dynamic = "force-dynamic";

const DECISION_MESSAGE: Record<string, (rev: string, code: string, note: string | null) => string> =
  {
    approved: (rev, code) => `✅ Rev ${rev} bản vẽ ${code} đã được duyệt`,
    approved_with_comments: (rev, code) => `✅ Rev ${rev} bản vẽ ${code} đã được duyệt kèm ý kiến`,
    rejected: (rev, code, note) =>
      `❌ Rev ${rev} bản vẽ ${code} bị từ chối${note ? `: ${note}` : ""}`,
  };

// Thông báo cho người upload rev + kỹ sư phụ trách nhóm công việc gắn bản vẽ (nếu có) —
// trừ chính người vừa quyết định. Chỉ 3 trạng thái "được duyệt/trả lại" theo đặc tả
// M08-ban-ve.md, không thông báo cho 'submitted'/'commented'/'superseded'.
async function notifyRevisionDecision(
  revisionId: number,
  status: RevisionStatus,
  decisionNote: string | null,
  actingUserId: number,
): Promise<void> {
  const buildMessage = DECISION_MESSAGE[status];
  if (!buildMessage) return;

  const info = await queryOne<{
    rev: string;
    uploadedBy: number | null;
    drawingCode: string;
    workPackageAssignedTo: number | null;
  }>(
    `SELECT r.rev, r.uploaded_by AS "uploadedBy", d.code AS "drawingCode",
            wp.assigned_to AS "workPackageAssignedTo"
       FROM drawing_revisions r
       JOIN drawings d ON d.id = r.drawing_id
       LEFT JOIN work_packages wp ON wp.id = d.work_package_id
      WHERE r.id = ?`,
    revisionId,
  );
  if (!info) return;

  const recipients = [...new Set([info.uploadedBy, info.workPackageAssignedTo])].filter(
    (uid): uid is number => uid != null && uid !== actingUserId,
  );
  if (recipients.length === 0) return;

  const message = buildMessage(info.rev, info.drawingCode, decisionNote);
  for (const uid of recipients) {
    await run(
      `INSERT INTO notifications (user_id, drawing_revision_id, type, message)
       VALUES (?, ?, 'drawing_review', ?)
       ON CONFLICT (user_id, drawing_revision_id, type) WHERE drawing_revision_id IS NOT NULL
       DO UPDATE SET message = EXCLUDED.message, is_read = 0, created_at = NOW()`,
      uid,
      revisionId,
      message,
    );
  }

  await sendPushToUsers(recipients, { title: "Bản vẽ", body: message, url: "/drawings" }).catch(
    () => {
      /* push lỗi không được chặn việc cập nhật trạng thái */
    },
  );
}

// PATCH /api/drawings/revisions/:id — đổi trạng thái duyệt rev (Admin/PM). Rev mới
// approved/approved_with_comments tự thay thế (superseded) rev cùng drawing đang ở
// 1 trong 2 trạng thái đó (xem lib/drawings.ts setRevisionStatus).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.decideDrawingRevision(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền duyệt bản vẽ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const revProject = await getRevisionDrawingProject(id);
  if (!revProject || revProject.projectId !== projectId)
    return NextResponse.json({ error: "Không tìm thấy revision" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const status = String(body.status ?? "").trim() as RevisionStatus;
  if (!REVISION_STATUSES.includes(status))
    return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 422 });
  const decisionNote =
    typeof body.decisionNote === "string" && body.decisionNote.trim()
      ? body.decisionNote.trim()
      : null;

  const result = await setRevisionStatus(id, status, decisionNote);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 404 });

  await notifyRevisionDecision(id, status, decisionNote, user.id);

  return NextResponse.json({ updated: id, status, drawingId: result.drawingId });
}
