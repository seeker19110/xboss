"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Users,
  ListTodo,
  CalendarDays,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/date";
import {
  MEETING_KIND_LABEL,
  MEETING_ACTION_STATUS_LABEL,
  type MeetingKind,
  type MeetingActionStatus,
} from "@/lib/meetings";

type MeetingAction = {
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

type Meeting = {
  id: number;
  meetingDate: string;
  kind: MeetingKind;
  title: string;
  attendees: string | null;
  content: string | null;
  createdBy: number | null;
  createdByName: string | null;
  actions: MeetingAction[];
};

type UserOpt = { id: number; name: string };

const KIND_BADGE: Record<MeetingKind, string> = {
  weekly: "bg-sky-900/40 text-sky-300",
  client: "bg-violet-900/40 text-violet-300",
  subcon: "bg-amber-900/40 text-amber-300",
  other: "bg-zinc-800 text-zinc-300",
};

export default function MeetingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"meetings" | "actions">("meetings");
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdminOrPm = me?.role === "admin" || me?.role === "pm";

  function load() {
    return fetch("/api/meetings").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, r]) => {
        if (!meData) return;
        setMe(meData);
        setMeetings(r?.meetings ?? []);
        // Danh sách user chỉ Admin/PM lấy được (CAN.assign) — kỹ sư tạo action không gán người.
        if (meData.role === "admin" || meData.role === "pm")
          fetch("/api/users")
            .then((r2) => (r2.ok ? r2.json() : null))
            .then((d) => setUsers(d?.users ?? []))
            .catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const r = await load();
    setMeetings(r?.meetings ?? []);
  }

  const today = todayISO();
  const openActions = useMemo(
    () =>
      meetings
        .flatMap((m) =>
          m.actions
            .filter((a) => a.status === "open")
            .map((a) => ({ ...a, meetingTitle: m.title, meetingDate: m.meetingDate })),
        )
        .sort((a, b) => {
          if (a.dueDate == null && b.dueDate == null) return a.id - b.id;
          if (a.dueDate == null) return 1;
          if (b.dueDate == null) return -1;
          return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id;
        }),
    [meetings],
  );
  const overdueCount = openActions.filter((a) => a.dueDate != null && a.dueDate < today).length;

  async function setActionStatus(a: MeetingAction, status: MeetingActionStatus) {
    const res = await fetch(`/api/meetings/${a.meetingId}/actions/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Đổi trạng thái thất bại", "error");
      return;
    }
    refresh();
  }

  async function deleteMeeting(m: Meeting) {
    if (!(await appConfirm(`Xoá cuộc họp "${m.title}" kèm toàn bộ việc sau họp?`))) return;
    const res = await fetch(`/api/meetings/${m.id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    refresh();
  }

  if (loading) return <PageSkeleton />;

  const canToggle = (a: MeetingAction) => isAdminOrPm || a.assignee === me?.id;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Họp"
        subtitle="Biên bản họp + việc sau họp theo dõi tự động"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Tạo biên bản họp"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Biên bản họp</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{meetings.length}</p>
            <p className="text-xs text-zinc-400">Cuộc họp</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-sky-400">{openActions.length}</p>
            <p className="text-xs text-zinc-400">Việc đang mở</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-rose-400" : ""}`}>
              {overdueCount}
            </p>
            <p className="text-xs text-zinc-400">Việc quá hạn</p>
          </div>
        </div>

        <div className="flex gap-1.5" role="tablist" aria-label="Chuyển giữa họp và việc sau họp">
          <button
            role="tab"
            aria-selected={tab === "meetings"}
            onClick={() => setTab("meetings")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              tab === "meetings"
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            Biên bản họp ({meetings.length})
          </button>
          <button
            role="tab"
            aria-selected={tab === "actions"}
            onClick={() => setTab("actions")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
              tab === "actions"
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            Việc sau họp ({openActions.length})
          </button>
        </div>

        {tab === "meetings" &&
          (meetings.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Chưa có biên bản họp"
              message={
                canManage ? "Bấm “Biên bản họp” để tạo mới." : "Chưa có cuộc họp nào được ghi nhận."
              }
            />
          ) : (
            <div className="space-y-3">
              {meetings.map((m) => {
                const open = openId === m.id;
                const openCount = m.actions.filter((a) => a.status === "open").length;
                const hasOverdue = m.actions.some(
                  (a) => a.status === "open" && a.dueDate != null && a.dueDate < today,
                );
                return (
                  <div
                    key={m.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenId(open ? null : m.id)}
                      aria-expanded={open}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-zinc-800/40 transition"
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{m.title}</p>
                        <p className="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
                          <CalendarDays className="w-3 h-3" /> {formatDateVN(m.meetingDate)}
                          {m.attendees && <span className="truncate">· {m.attendees}</span>}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${KIND_BADGE[m.kind]}`}
                      >
                        {MEETING_KIND_LABEL[m.kind]}
                      </span>
                      {m.actions.length > 0 && (
                        <span
                          className={`text-xs shrink-0 ${hasOverdue ? "text-rose-400" : openCount > 0 ? "text-sky-400" : "text-zinc-500"}`}
                        >
                          {hasOverdue && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                          {openCount}/{m.actions.length} việc
                        </span>
                      )}
                    </button>

                    {open && (
                      <div className="border-t border-zinc-800 p-3 space-y-3">
                        {m.content && (
                          <p className="text-sm text-zinc-300 whitespace-pre-wrap">{m.content}</p>
                        )}
                        <ActionTable
                          meeting={m}
                          canManage={canManage}
                          isAdminOrPm={isAdminOrPm}
                          canToggle={canToggle}
                          users={users}
                          today={today}
                          onChanged={refresh}
                          onSetStatus={setActionStatus}
                        />
                        {isAdminOrPm && (
                          <button
                            onClick={() => deleteMeeting(m)}
                            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Xoá cuộc họp
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

        {tab === "actions" &&
          (openActions.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="Không còn việc mở"
              message="Mọi việc sau họp đã xong hoặc chưa có việc nào."
            />
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Việc sau họp đang mở"
              >
                <table className="w-full text-sm sm:min-w-[640px]">
                  <thead>
                    <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                      <th className="text-left p-3">VIỆC</th>
                      <th className="text-left p-3">CUỘC HỌP</th>
                      <th className="text-left p-3">NGƯỜI LÀM</th>
                      <th className="text-left p-3">HẠN</th>
                      <th className="text-left p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {openActions.map((a) => {
                      const overdue = a.dueDate != null && a.dueDate < today;
                      return (
                        <tr key={a.id} className="border-b border-zinc-800/60 last:border-0">
                          <td className="p-3">
                            <p className="max-w-[280px]">{a.content}</p>
                          </td>
                          <td className="p-3 text-xs text-zinc-400">
                            <p className="truncate max-w-[160px]">{a.meetingTitle}</p>
                            <p>{formatDateVN(a.meetingDate)}</p>
                          </td>
                          <td className="p-3 text-xs text-zinc-300">{a.assigneeName ?? "—"}</td>
                          <td
                            className={`p-3 text-xs ${overdue ? "text-rose-400 font-medium" : "text-zinc-400"}`}
                          >
                            {overdue && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                            {a.dueDate ? formatDateVN(a.dueDate) : "—"}
                          </td>
                          <td className="p-3">
                            {canToggle(a) && (
                              <button
                                onClick={() => setActionStatus(a, "done")}
                                aria-label="Đánh dấu xong"
                                title="Đánh dấu xong"
                                className="text-emerald-400 hover:text-emerald-300"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </main>

      {addOpen && (
        <AddMeetingModal
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// Bảng action trong chi tiết cuộc họp + form thêm nhanh (Admin/PM/kỹ sư).
function ActionTable({
  meeting,
  canManage,
  isAdminOrPm,
  canToggle,
  users,
  today,
  onChanged,
  onSetStatus,
}: {
  meeting: Meeting;
  canManage: boolean;
  isAdminOrPm: boolean;
  canToggle: (a: MeetingAction) => boolean;
  users: UserOpt[];
  today: string;
  onChanged: () => void;
  onSetStatus: (a: MeetingAction, status: MeetingActionStatus) => void;
}) {
  const [content, setContent] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function addAction() {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${meeting.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content.trim(),
          assignee: assignee ? Number(assignee) : null,
          dueDate: dueDate || null,
        }),
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Thêm việc thất bại", "error");
        return;
      }
      setContent("");
      setAssignee("");
      setDueDate("");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function deleteAction(a: MeetingAction) {
    if (!(await appConfirm("Xoá việc này?"))) return;
    const res = await fetch(`/api/meetings/${meeting.id}/actions/${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    onChanged();
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Việc sau họp</p>
      {meeting.actions.length === 0 ? (
        <p className="text-sm text-zinc-500">Chưa có việc nào.</p>
      ) : (
        <ul className="space-y-1.5">
          {meeting.actions.map((a) => {
            const overdue = a.status === "open" && a.dueDate != null && a.dueDate < today;
            return (
              <li
                key={a.id}
                className="flex items-start gap-2 bg-zinc-800/40 rounded-lg px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className={a.status !== "open" ? "line-through text-zinc-500" : ""}>
                    {a.content}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {a.assigneeName ?? "Chưa giao"}
                    {a.dueDate && (
                      <span className={overdue ? "text-rose-400 font-medium" : ""}>
                        {" "}
                        · hạn {formatDateVN(a.dueDate)}
                        {overdue && " (quá hạn)"}
                      </span>
                    )}
                    {a.status !== "open" && ` · ${MEETING_ACTION_STATUS_LABEL[a.status]}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {a.status === "open" && canToggle(a) && (
                    <button
                      onClick={() => onSetStatus(a, "done")}
                      aria-label="Đánh dấu xong"
                      title="Đánh dấu xong"
                      className="text-emerald-400 hover:text-emerald-300 p-1"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  {a.status === "done" && canToggle(a) && (
                    <button
                      onClick={() => onSetStatus(a, "open")}
                      aria-label="Mở lại"
                      title="Mở lại"
                      className="text-zinc-400 hover:text-white p-1"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {isAdminOrPm && (
                    <button
                      onClick={() => deleteAction(a)}
                      aria-label="Xoá việc"
                      title="Xoá việc"
                      className="text-zinc-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2 items-end">
          <label className="text-xs text-zinc-400 flex-1 min-w-[180px]">
            Việc cần làm
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Nội dung việc…"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          {users.length > 0 && (
            <label className="text-xs text-zinc-400 w-36">
              Người làm
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">— Chưa giao —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs text-zinc-400 w-36">
            Hạn
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <button
            onClick={addAction}
            disabled={saving || !content.trim()}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-2 rounded-lg text-sm font-medium transition min-h-10"
          >
            Thêm việc
          </button>
        </div>
      )}
    </div>
  );
}

function AddMeetingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [meetingDate, setMeetingDate] = useState(todayISO());
  const [kind, setKind] = useState<MeetingKind>("weekly");
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState("");
  const [content, setContent] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingDate,
          kind,
          title: title.trim(),
          attendees: attendees.trim() || null,
          content: content.trim() || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được biên bản họp");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Biên bản họp mới</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Ngày họp
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Loại họp
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MeetingKind)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              {(Object.keys(MEETING_KIND_LABEL) as MeetingKind[]).map((k) => (
                <option key={k} value={k}>
                  {MEETING_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-xs text-zinc-400 block">
          Tiêu đề
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Họp giao ban tuần 27"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Thành phần tham dự
          <input
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="VD: BCH, TVGS, thầu phụ điện"
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="text-xs text-zinc-400 block">
          Nội dung
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
          />
        </label>

        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !title.trim() || !meetingDate}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang lưu…" : "Tạo biên bản họp"}
        </button>
      </div>
    </Modal>
  );
}
