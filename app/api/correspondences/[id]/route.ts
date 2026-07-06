import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  checkCorrespondenceRefs,
  getCorrespondence,
  getReplyChain,
  parseCorrespondenceBody,
  validateCorrespondenceInput,
  type CorrespondenceInput,
} from "@/lib/correspondence";

export const dynamic = "force-dynamic";

// GET /api/correspondences/:id — chi tiết + chuỗi hỏi-đáp cùng gốc.
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewCorrespondence(user.role))
    return NextResponse.json({ error: "Bạn không có quyền xem công văn" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const correspondence = await getCorrespondence(id);
  if (!correspondence)
    return NextResponse.json({ error: "Không tìm thấy văn bản" }, { status: 404 });

  const thread = await getReplyChain(id);
  return NextResponse.json({ correspondence, thread });
}

// PATCH /api/correspondences/:id — sửa metadata (Admin/PM/kỹ sư).
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageCorrespondence(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền sửa công văn (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const existing = await queryOne<Record<string, unknown>>(
    `SELECT code, direction, kind, counterparty, subject, sent_date AS "sentDate",
            due_date AS "dueDate", status, task_id AS "taskId",
            work_package_id AS "workPackageId", drawing_id AS "drawingId", note
       FROM correspondences WHERE id = ?`,
    id,
  );
  if (!existing) return NextResponse.json({ error: "Không tìm thấy văn bản" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const merged: Record<string, unknown> = { ...existing };
  for (const key of Object.keys(existing)) if (key in body) merged[key] = body[key];
  const input: CorrespondenceInput = parseCorrespondenceBody(merged);

  const invalid = validateCorrespondenceInput(input);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const refErr = await checkCorrespondenceRefs(input);
  if (refErr) return NextResponse.json({ error: refErr }, { status: 422 });

  await run(
    `UPDATE correspondences
        SET code = ?, direction = ?, kind = ?, counterparty = ?, subject = ?, sent_date = ?,
            due_date = ?, status = ?, task_id = ?, work_package_id = ?, drawing_id = ?, note = ?
      WHERE id = ?`,
    input.code,
    input.direction,
    input.kind,
    input.counterparty,
    input.subject,
    input.sentDate,
    input.dueDate,
    input.status,
    input.taskId,
    input.workPackageId,
    input.drawingId,
    input.note,
    id,
  );

  return NextResponse.json({ updated: id });
}
