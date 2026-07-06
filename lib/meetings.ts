// M13 — Biên bản họp + action item theo dõi tự động: danh mục loại họp, validate
// thuần, query danh sách họp kèm action, action quá hạn (nguồn notification
// action_overdue). Xem docs/nang-cap/M13-hop-rui-ro.md.
import { query, queryOne, run } from "@/lib/db";
import { todayISO } from "@/lib/date";

export const MEETING_KINDS = ["weekly", "client", "subcon", "other"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  weekly: "Họp tuần",
  client: "Họp CĐT/TVGS",
  subcon: "Họp thầu phụ",
  other: "Khác",
};

export const MEETING_ACTION_STATUSES = ["open", "done", "cancelled"] as const;
export type MeetingActionStatus = (typeof MEETING_ACTION_STATUSES)[number];
export const MEETING_ACTION_STATUS_LABEL: Record<MeetingActionStatus, string> = {
  open: "Đang mở",
  done: "Đã xong",
  cancelled: "Đã huỷ",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type MeetingInput = {
  meetingDate: string;
  kind: MeetingKind;
  title: string;
  attendees: string | null;
  content: string | null;
};

export function parseMeetingBody(body: Record<string, unknown>): MeetingInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    meetingDate: typeof body.meetingDate === "string" ? body.meetingDate.trim() : "",
    kind: (typeof body.kind === "string" ? body.kind : "") as MeetingKind,
    title: typeof body.title === "string" ? body.title.trim() : "",
    attendees: strOrNull(body.attendees),
    content: strOrNull(body.content),
  };
}

export function validateMeetingInput(input: MeetingInput): string | null {
  if (!DATE_RE.test(input.meetingDate)) return "Ngày họp không đúng định dạng YYYY-MM-DD";
  if (!MEETING_KINDS.includes(input.kind)) return "Loại họp không hợp lệ";
  if (!input.title) return "Thiếu tiêu đề cuộc họp";
  return null;
}

export type MeetingActionInput = {
  content: string;
  assignee: number | null;
  dueDate: string | null;
  taskId: number | null;
};

export function parseMeetingActionBody(body: Record<string, unknown>): MeetingActionInput {
  const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    content: typeof body.content === "string" ? body.content.trim() : "",
    assignee: body.assignee != null ? Number(body.assignee) : null,
    dueDate: strOrNull(body.dueDate),
    taskId: body.taskId != null ? Number(body.taskId) : null,
  };
}

export function validateMeetingActionInput(input: MeetingActionInput): string | null {
  if (!input.content) return "Thiếu nội dung việc cần làm";
  if (input.dueDate != null && !DATE_RE.test(input.dueDate))
    return "Hạn hoàn thành không đúng định dạng YYYY-MM-DD";
  return null;
}

export type MeetingActionRow = {
  id: number;
  meetingId: number;
  content: string;
  assignee: number | null;
  assigneeName: string | null;
  dueDate: string | null;
  status: MeetingActionStatus;
  taskId: number | null;
  doneAt: string | null;
};

export type MeetingRow = MeetingInput & {
  id: number;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  actions: MeetingActionRow[];
};

// Danh sách họp kèm action con (json_agg — 1 query, pattern listVariations).
// Lọc theo id để lấy đúng 1 cuộc họp không quét cả bảng.
export async function listMeetings(filter?: { id?: number }): Promise<MeetingRow[]> {
  const where = filter?.id != null ? "WHERE m.id = ?" : "";
  return query<MeetingRow>(
    `SELECT m.id, m.meeting_date AS "meetingDate", m.kind, m.title, m.attendees, m.content,
            m.created_by AS "createdBy", u.name AS "createdByName", m.created_at AS "createdAt",
            COALESCE(
              json_agg(
                json_build_object(
                  'id', a.id, 'meetingId', a.meeting_id, 'content', a.content,
                  'assignee', a.assignee, 'assigneeName', ua.name,
                  'dueDate', to_char(a.due_date, 'YYYY-MM-DD'),
                  'status', a.status, 'taskId', a.task_id, 'doneAt', a.done_at
                ) ORDER BY a.id
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'
            ) AS actions
       FROM meetings m
       LEFT JOIN users u ON u.id = m.created_by
       LEFT JOIN meeting_actions a ON a.meeting_id = m.id
       LEFT JOIN users ua ON ua.id = a.assignee
      ${where}
      GROUP BY m.id, u.name
      ORDER BY m.meeting_date DESC, m.id DESC`,
    ...(filter?.id != null ? [filter.id] : []),
  );
}

export async function getMeeting(id: number): Promise<MeetingRow | undefined> {
  const rows = await listMeetings({ id });
  return rows[0];
}

export type OpenMeetingAction = MeetingActionRow & {
  meetingTitle: string;
  meetingDate: string;
};

// Action đang mở — assigneeId có giá trị → chỉ của người đó (mục "việc sau họp"
// ở /my-tasks); undefined → mọi action mở (tab "Việc sau họp" trang /meetings).
// Sắp theo hạn: quá hạn/gần hạn nổi đầu, chưa đặt hạn xuống cuối.
export async function openMeetingActions(assigneeId?: number): Promise<OpenMeetingAction[]> {
  const filter = assigneeId != null ? " AND a.assignee = ?" : "";
  return query<OpenMeetingAction>(
    `SELECT a.id, a.meeting_id AS "meetingId", a.content, a.assignee, ua.name AS "assigneeName",
            a.due_date AS "dueDate", a.status, a.task_id AS "taskId", a.done_at AS "doneAt",
            m.title AS "meetingTitle", m.meeting_date AS "meetingDate"
       FROM meeting_actions a
       JOIN meetings m ON m.id = a.meeting_id
       LEFT JOIN users ua ON ua.id = a.assignee
      WHERE a.status = 'open'${filter}
      ORDER BY (a.due_date IS NULL), a.due_date, a.id`,
    ...(assigneeId != null ? [assigneeId] : []),
  );
}

// Action quá hạn chưa xong — nguồn notification action_overdue.
// assigneeId = undefined → mọi action quá hạn (Admin/PM); có giá trị → chỉ của người đó.
export async function overdueMeetingActions(assigneeId?: number): Promise<OpenMeetingAction[]> {
  const today = todayISO();
  const filter = assigneeId != null ? " AND a.assignee = ?" : "";
  return query<OpenMeetingAction>(
    `SELECT a.id, a.meeting_id AS "meetingId", a.content, a.assignee, ua.name AS "assigneeName",
            a.due_date AS "dueDate", a.status, a.task_id AS "taskId", a.done_at AS "doneAt",
            m.title AS "meetingTitle", m.meeting_date AS "meetingDate"
       FROM meeting_actions a
       JOIN meetings m ON m.id = a.meeting_id
       LEFT JOIN users ua ON ua.id = a.assignee
      WHERE a.status = 'open' AND a.due_date IS NOT NULL AND a.due_date < ?${filter}
      ORDER BY a.due_date, a.id`,
    ...(assigneeId != null ? [today, assigneeId] : [today]),
  );
}

// Đổi trạng thái action: done ghi done_at, mở lại/huỷ xoá done_at. Idempotent —
// đặt lại trạng thái hiện tại không gây tác dụng phụ.
export async function setMeetingActionStatus(
  id: number,
  status: MeetingActionStatus,
): Promise<boolean> {
  const r = await run(
    `UPDATE meeting_actions
        SET status = ?, done_at = CASE WHEN ? = 'done' THEN NOW() ELSE NULL END
      WHERE id = ?`,
    status,
    status,
    id,
  );
  return r.changes > 0;
}

export async function getMeetingAction(
  id: number,
): Promise<{ id: number; meetingId: number; assignee: number | null; status: string } | null> {
  const row = await queryOne<{
    id: number;
    meetingId: number;
    assignee: number | null;
    status: string;
  }>(
    `SELECT id, meeting_id AS "meetingId", assignee, status FROM meeting_actions WHERE id = ?`,
    id,
  );
  return row ?? null;
}
