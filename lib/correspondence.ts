// M10 — Sổ công văn/RFI hai chiều với CĐT/TVGS/tổng thầu: validate thuần + query
// danh sách/chi tiết + logic trả lời (reply nối chuỗi hỏi-đáp).
// Xem docs/nang-cap/M10-rfi-cong-van.md.
import { query, queryOne, run, insertId, withTransaction, todayISO } from "@/lib/db";

export const CORRESPONDENCE_DIRECTIONS = ["in", "out"] as const;
export type CorrespondenceDirection = (typeof CORRESPONDENCE_DIRECTIONS)[number];

export const CORRESPONDENCE_KINDS = ["rfi", "letter", "site_instruction"] as const;
export type CorrespondenceKind = (typeof CORRESPONDENCE_KINDS)[number];
export const CORRESPONDENCE_KIND_LABEL: Record<CorrespondenceKind, string> = {
  rfi: "RFI",
  letter: "Công văn",
  site_instruction: "Chỉ thị hiện trường",
};

export const CORRESPONDENCE_STATUSES = ["awaiting", "replied", "closed"] as const;
export type CorrespondenceStatus = (typeof CORRESPONDENCE_STATUSES)[number];
export const CORRESPONDENCE_STATUS_LABEL: Record<CorrespondenceStatus, string> = {
  awaiting: "Chờ phản hồi",
  replied: "Đã phản hồi",
  closed: "Đã đóng",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CorrespondenceInput = {
  code: string;
  direction: CorrespondenceDirection;
  kind: CorrespondenceKind;
  counterparty: string;
  subject: string;
  sentDate: string;
  dueDate: string | null;
  status: CorrespondenceStatus;
  taskId: number | null;
  workPackageId: number | null;
  drawingId: number | null;
  note: string | null;
};

// Validate thuần — trả thông điệp lỗi tiếng Việt hoặc null khi hợp lệ.
export function validateCorrespondenceInput(input: CorrespondenceInput): string | null {
  if (!input.code.trim()) return "Thiếu số văn bản";
  if (!CORRESPONDENCE_DIRECTIONS.includes(input.direction)) return "Chiều văn bản không hợp lệ";
  if (!CORRESPONDENCE_KINDS.includes(input.kind)) return "Loại văn bản không hợp lệ";
  if (!input.counterparty.trim()) return "Thiếu đối tác (CĐT/TVGS/Tổng thầu...)";
  if (!input.subject.trim()) return "Thiếu trích yếu";
  if (!DATE_RE.test(input.sentDate)) return "Ngày gửi không đúng định dạng YYYY-MM-DD";
  if (input.dueDate != null && !DATE_RE.test(input.dueDate))
    return "Hạn phản hồi không đúng định dạng YYYY-MM-DD";
  if (input.dueDate != null && input.dueDate < input.sentDate)
    return "Hạn phản hồi phải sau hoặc bằng ngày gửi";
  if (!CORRESPONDENCE_STATUSES.includes(input.status)) return "Trạng thái không hợp lệ";
  return null;
}

// Đọc body JSON thành CorrespondenceInput (POST dùng nguyên, PATCH merge với bản ghi cũ).
export function parseCorrespondenceBody(body: Record<string, unknown>): CorrespondenceInput {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const numOrNull = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
  return {
    code: str(body.code),
    direction: (str(body.direction) || "in") as CorrespondenceDirection,
    kind: (str(body.kind) || "letter") as CorrespondenceKind,
    counterparty: str(body.counterparty),
    subject: str(body.subject),
    sentDate: str(body.sentDate) || todayISO(),
    dueDate: strOrNull(body.dueDate),
    status: (str(body.status) || "awaiting") as CorrespondenceStatus,
    taskId: numOrNull(body.taskId),
    workPackageId: numOrNull(body.workPackageId),
    drawingId: numOrNull(body.drawingId),
    note: strOrNull(body.note),
  };
}

// Kiểm FK task/work_package/drawing tồn tại — trả thông điệp lỗi hoặc null.
export async function checkCorrespondenceRefs(input: CorrespondenceInput): Promise<string | null> {
  if (input.taskId != null) {
    if (
      !Number.isInteger(input.taskId) ||
      !(await queryOne(`SELECT id FROM tasks WHERE id = ?`, input.taskId))
    )
      return "Công việc không tồn tại";
  }
  if (input.workPackageId != null) {
    if (
      !Number.isInteger(input.workPackageId) ||
      !(await queryOne(`SELECT id FROM work_packages WHERE id = ?`, input.workPackageId))
    )
      return "Nhóm công việc không tồn tại";
  }
  if (input.drawingId != null) {
    if (
      !Number.isInteger(input.drawingId) ||
      !(await queryOne(`SELECT id FROM drawings WHERE id = ?`, input.drawingId))
    )
      return "Bản vẽ không tồn tại";
  }
  return null;
}

export type CorrespondenceRow = {
  id: number;
  code: string;
  direction: CorrespondenceDirection;
  kind: CorrespondenceKind;
  counterparty: string;
  subject: string;
  sentDate: string;
  dueDate: string | null;
  status: CorrespondenceStatus;
  replyId: number | null;
  taskId: number | null;
  taskName: string | null;
  workPackageId: number | null;
  workPackageName: string | null;
  drawingId: number | null;
  drawingCode: string | null;
  note: string | null;
  createdAt: string;
};

export type CorrespondenceFilters = {
  status?: CorrespondenceStatus;
  kind?: CorrespondenceKind;
  counterparty?: string;
  q?: string;
  taskId?: number;
  workPackageId?: number;
  drawingId?: number;
  // M22: undefined = không lọc dự án (dùng nội bộ/test cũ).
  projectId?: number;
};

const CORRESPONDENCE_SELECT = `
  SELECT c.id, c.code, c.direction, c.kind, c.counterparty, c.subject,
         c.sent_date AS "sentDate", c.due_date AS "dueDate", c.status,
         c.reply_id AS "replyId", c.task_id AS "taskId", t.name AS "taskName",
         c.work_package_id AS "workPackageId", wp.name AS "workPackageName",
         c.drawing_id AS "drawingId", d.code AS "drawingCode",
         c.note, c.created_at AS "createdAt"
    FROM correspondences c
    LEFT JOIN tasks t ON t.id = c.task_id
    LEFT JOIN work_packages wp ON wp.id = c.work_package_id
    LEFT JOIN drawings d ON d.id = c.drawing_id`;

export async function listCorrespondences(
  filters: CorrespondenceFilters = {},
): Promise<CorrespondenceRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    conds.push("c.status = ?");
    params.push(filters.status);
  }
  if (filters.kind) {
    conds.push("c.kind = ?");
    params.push(filters.kind);
  }
  if (filters.counterparty) {
    conds.push("c.counterparty = ?");
    params.push(filters.counterparty);
  }
  if (filters.q) {
    conds.push("(c.subject ILIKE ? OR c.code ILIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  if (filters.taskId != null) {
    conds.push("c.task_id = ?");
    params.push(filters.taskId);
  }
  if (filters.workPackageId != null) {
    conds.push("c.work_package_id = ?");
    params.push(filters.workPackageId);
  }
  if (filters.drawingId != null) {
    conds.push("c.drawing_id = ?");
    params.push(filters.drawingId);
  }
  if (filters.projectId != null) {
    conds.push("c.project_id = ?");
    params.push(filters.projectId);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  return query<CorrespondenceRow>(
    `${CORRESPONDENCE_SELECT} ${where} ORDER BY c.sent_date DESC, c.id DESC`,
    ...params,
  );
}

// projectId khi truyền → trả undefined nếu văn bản không thuộc dự án đang chọn (chặn
// truy cập chéo dự án qua đoán ID), giống pattern 404 "không tìm thấy" hiện có.
export async function getCorrespondence(
  id: number,
  projectId?: number,
): Promise<CorrespondenceRow | undefined> {
  const conds = ["c.id = ?"];
  const params: unknown[] = [id];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    params.push(projectId);
  }
  return queryOne<CorrespondenceRow>(
    `${CORRESPONDENCE_SELECT} WHERE ${conds.join(" AND ")}`,
    ...params,
  );
}

// Chuỗi hỏi-đáp cùng gốc (văn bản gốc + mọi văn bản trả lời trỏ reply_id vào gốc đó)
// — dùng hiển thị thread thu gọn trên UI (hàng hỏi-đáp nối nhau, indent nhẹ dòng reply).
// projectId: undefined = không lọc dự án (dùng nội bộ/test cũ).
export async function getReplyChain(id: number, projectId?: number): Promise<CorrespondenceRow[]> {
  const cur = await queryOne<{ replyId: number | null }>(
    `SELECT reply_id AS "replyId" FROM correspondences WHERE id = ?`,
    id,
  );
  if (!cur) return [];
  const rootId = cur.replyId ?? id;
  const conds = ["(c.id = ? OR c.reply_id = ?)"];
  const params: unknown[] = [rootId, rootId];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    params.push(projectId);
  }
  return query<CorrespondenceRow>(
    `${CORRESPONDENCE_SELECT} WHERE ${conds.join(" AND ")} ORDER BY c.sent_date, c.id`,
    ...params,
  );
}

// Tạo văn bản trả lời (luôn direction='out' — công ty phản hồi lại đối tác), nối
// reply_id, tự chuyển văn bản gốc sang 'replied'. Trong transaction để nhất quán.
// projectId (M22): văn bản gốc phải thuộc đúng dự án đang chọn — trả reply cùng dự án.
export async function createReply(
  originalId: number,
  input: CorrespondenceInput,
  userId: number,
  projectId: number,
): Promise<{ error: string } | { id: number }> {
  return withTransaction(async () => {
    const original = await queryOne<{ id: number }>(
      `SELECT id FROM correspondences WHERE id = ? AND project_id = ? FOR UPDATE`,
      originalId,
      projectId,
    );
    if (!original) return { error: "Không tìm thấy văn bản gốc" };

    const id = await insertId(
      `INSERT INTO correspondences
         (code, direction, kind, counterparty, subject, sent_date, due_date, status,
          reply_id, task_id, work_package_id, drawing_id, note, created_by, project_id)
       VALUES (?, 'out', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.code,
      input.kind,
      input.counterparty,
      input.subject,
      input.sentDate,
      input.dueDate,
      input.status,
      originalId,
      input.taskId,
      input.workPackageId,
      input.drawingId,
      input.note,
      userId,
      projectId,
    );

    await run(`UPDATE correspondences SET status = 'replied' WHERE id = ?`, originalId);

    return { id };
  });
}

export type DueCorrespondence = {
  id: number;
  code: string;
  subject: string;
  counterparty: string;
  dueDate: string;
};

// Công văn quá hạn phản hồi (due_date < hôm nay) mà chưa 'replied'/'closed' — cảnh
// báo Admin/PM (on-fetch, dedup theo id, cùng pattern các module trước).
export async function dueCorrespondences(): Promise<DueCorrespondence[]> {
  const today = todayISO();
  return query<DueCorrespondence>(
    `SELECT id, code, subject, counterparty, due_date AS "dueDate"
       FROM correspondences
      WHERE status = 'awaiting' AND due_date IS NOT NULL AND due_date < ?
      ORDER BY due_date`,
    today,
  );
}
