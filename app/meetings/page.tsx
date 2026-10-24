"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/app/components/ui";
import SourceNotice from "@/app/components/SourceNotice";
import { useRemoteList } from "@/app/lib/useRemoteList";
import { Modal, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, invalidateMe, type Me } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/nen/date";

// Nhân bản label từ lib/meetings.ts — không import trực tiếp vì lib đó kéo theo
// lib/db (chỉ chạy server), giống pattern trang HSE.
type MeetingKind = "weekly" | "client" | "subcon" | "other";
const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  weekly: "Họp tuần",
  client: "Họp CĐT/TVGS",
  subcon: "Họp thầu phụ",
  other: "Khác",
};

type MeetingActionStatus = "open" | "done" | "cancelled";
const MEETING_ACTION_STATUS_LABEL: Record<MeetingActionStatus, string> = {
  open: "Đang mở",
  done: "Đã xong",
  cancelled: "Đã huỷ",
};

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
  weekly: "bg-sky-900 text-sky-200",
  client: "bg-violet-900 text-violet-200",
  subcon: "bg-amber-900 text-amber-200",
  other: "bg-zinc-800 text-zinc-300",
};

export default function MeetingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<"meetings" | "actions">("meetings");
  const [addOpen, setAddOpen] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const isAdminOrPm = me?.role === "admin" || me?.role === "pm";

  const source = useRemoteList<Meeting>("/api/meetings", "meetings", "biên bản họp");
  const usersSource = useRemoteList<UserOpt>(
    "/api/users",
    "users",
    "người làm",
    isAdminOrPm && openId !== null && tab === "meetings",
    true,
  );
  const meetings = source.snapshot?.items ?? [];
  const users = usersSource.snapshot?.items ?? [];
  const refresh = source.reload;
  const [meError, setMeError] = useState("");
  const authRequest = useRef(0);
  const loadMe = useCallback(async (retry = false) => {
    const id = ++authRequest.current;
    if (retry) invalidateMe();
    setMeError("");
    const data = await fetchMe();
    if (id !== authRequest.current) return;
    setMe(data);
    if (!data) setMeError("Không xác minh được quyền thao tác. Hãy thử lại.");
  }, []);
  useEffect(() => {
    void loadMe();
    return () => {
      authRequest.current++;
    };
  }, [loadMe]);
  const pending = useRef(false);
  const [writing, setWriting] = useState(false);
  const [writeError, setWriteError] = useState("");
  async function runWrite(fn: () => Promise<void>) {
    if (pending.current || !source.ready) return;
    pending.current = true;
    setWriting(true);
    setWriteError("");
    try {
      await fn();
    } catch {
      setWriteError(
        "Mất kết nối — chưa xác nhận được thay đổi. Tải lại danh sách trước khi thử lại.",
      );
      void refresh();
    } finally {
      pending.current = false;
      setWriting(false);
    }
  }
  const readOnly = !source.ready || writing;

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

  const canToggle = (a: MeetingAction) => isAdminOrPm || a.assignee === me?.id;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Họp"
        subtitle="Biên bản họp + việc sau họp theo dõi tự động"
        bottomActions={
          canManage ? (
            <Button
              variant="primary"
              icon={Plus}
              labelOnDesktopOnly
              onClick={() => setAddOpen(true)}
              aria-label="Tạo biên bản họp"
              className="min-h-11 min-w-11 shrink-0"
            >
              Biên bản họp
            </Button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4 min-w-0">
        {meError && <SourceNotice message={meError} retry={() => void loadMe(true)} />}
        {source.error && <SourceNotice message={source.error} retry={() => void refresh()} />}
        {source.loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải biên bản họp…
          </p>
        )}
        {source.snapshot && !source.ready && (
          <p className="text-sm text-zinc-400">
            Dữ liệu lần tải trước — chỉ xem đến khi tải lại thành công.
          </p>
        )}
        {writeError && (
          <p role="alert" className="text-sm text-rose-300 wrap-anywhere">
            {writeError}
          </p>
        )}
        <Button
          variant="secondary"
          className="min-h-11 transition-none disabled:opacity-100"
          onClick={() => void refresh()}
          disabled={source.loading}
        >
          Tải lại danh sách
        </Button>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{source.snapshot ? meetings.length : "—"}</p>
            <p className="text-xs text-zinc-400">Cuộc họp</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-sky-400">
              {source.snapshot ? openActions.length : "—"}
            </p>
            <p className="text-xs text-zinc-400">Việc đang mở</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${overdueCount > 0 ? "text-rose-400" : ""}`}>
              {source.snapshot ? overdueCount : "—"}
            </p>
            <p className="text-xs text-zinc-400">Việc quá hạn</p>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Chuyển giữa họp và việc sau họp"
        >
          <button
            role="tab"
            aria-selected={tab === "meetings"}
            onClick={() => setTab("meetings")}
            className={`min-h-11 px-3 py-1.5 rounded-full text-xs font-medium border ${
              tab === "meetings"
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            Biên bản họp ({source.snapshot ? meetings.length : "—"})
          </button>
          <button
            role="tab"
            aria-selected={tab === "actions"}
            onClick={() => setTab("actions")}
            className={`min-h-11 px-3 py-1.5 rounded-full text-xs font-medium border ${
              tab === "actions"
                ? "bg-zinc-700 border-zinc-600 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-white"
            }`}
          >
            Việc sau họp ({source.snapshot ? openActions.length : "—"})
          </button>
        </div>

        {tab === "meetings" &&
          (meetings.length === 0 ? (
            source.ready && (
              <EmptyState
                icon={Users}
                title="Chưa có biên bản họp"
                message={
                  canManage
                    ? "Bấm “Biên bản họp” để tạo mới."
                    : "Chưa có cuộc họp nào được ghi nhận."
                }
              />
            )
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
                      className="w-full min-h-11 grid grid-cols-[auto_minmax(0,1fr)] sm:flex items-start sm:items-center gap-3 p-3 text-left hover:bg-zinc-800 transition"
                    >
                      {open ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold wrap-anywhere">{m.title}</p>
                        <p className="text-xs text-zinc-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                          <CalendarDays className="w-3 h-3" /> {formatDateVN(m.meetingDate)}
                          {m.attendees && <span className="wrap-anywhere">· {m.attendees}</span>}
                        </p>
                      </div>
                      <div className="col-span-2 flex flex-wrap items-center gap-3 pl-7 sm:pl-0 sm:shrink-0">
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
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-zinc-800 p-3 space-y-3">
                        {m.content && (
                          <p className="text-sm text-zinc-300 whitespace-pre-wrap wrap-anywhere">
                            {m.content}
                          </p>
                        )}
                        <ActionTable
                          meeting={m}
                          canManage={canManage}
                          isAdminOrPm={isAdminOrPm}
                          canToggle={canToggle}
                          users={users}
                          usersReady={!isAdminOrPm || usersSource.ready}
                          usersError={usersSource.error}
                          retryUsers={() => void usersSource.reload()}
                          readOnly={readOnly}
                          today={today}
                          onChanged={refresh}
                          onSetStatus={(a, status) =>
                            void runWrite(() => setActionStatus(a, status))
                          }
                        />
                        {isAdminOrPm && (
                          <button
                            disabled={readOnly}
                            onClick={() => void runWrite(() => deleteMeeting(m))}
                            className="min-h-11 disabled:opacity-40 flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-400 transition"
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
            source.ready && (
              <EmptyState
                icon={ListTodo}
                title="Không còn việc mở"
                message="Mọi việc sau họp đã xong hoặc chưa có việc nào."
              />
            )
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Việc sau họp đang mở"
              >
                <table className="w-full text-sm min-w-[640px]">
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
                            <p className="max-w-[280px] wrap-anywhere">{a.content}</p>
                          </td>
                          <td className="p-3 text-xs text-zinc-400">
                            <p className="max-w-[160px] wrap-anywhere">{a.meetingTitle}</p>
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
                                disabled={readOnly}
                                onClick={() => void runWrite(() => setActionStatus(a, "done"))}
                                aria-label="Đánh dấu xong"
                                title="Đánh dấu xong"
                                className="min-h-11 min-w-11 inline-flex items-center justify-center disabled:opacity-40 text-emerald-400 hover:text-emerald-300"
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
  usersReady,
  usersError,
  retryUsers,
  readOnly,
  today,
  onChanged,
  onSetStatus,
}: {
  meeting: Meeting;
  canManage: boolean;
  isAdminOrPm: boolean;
  canToggle: (a: MeetingAction) => boolean;
  users: UserOpt[];
  usersReady: boolean;
  usersError: string;
  retryUsers: () => void;
  readOnly: boolean;
  today: string;
  onChanged: () => void;
  onSetStatus: (a: MeetingAction, status: MeetingActionStatus) => void;
}) {
  const [content, setContent] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const pending = useRef(false);
  const [writeError, setWriteError] = useState("");
  async function addAction() {
    if (!content.trim() || pending.current || readOnly || !usersReady) return;
    pending.current = true;
    setWriteError("");
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
    } catch {
      setWriteError(
        "Mất kết nối — chưa xác nhận được việc mới. Tải lại danh sách trước khi thử lại.",
      );
      onChanged();
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  async function runDelete(a: MeetingAction) {
    if (pending.current || readOnly) return;
    pending.current = true;
    setSaving(true);
    setWriteError("");
    try {
      await deleteAction(a);
    } catch {
      setWriteError(
        "Mất kết nối — chưa xác nhận được thao tác xoá. Tải lại danh sách trước khi thử lại.",
      );
      onChanged();
    } finally {
      pending.current = false;
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
                className="flex flex-wrap items-start gap-2 bg-zinc-900 rounded-lg px-3 py-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`wrap-anywhere ${a.status !== "open" ? "line-through text-zinc-500" : ""}`}
                  >
                    {a.content}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 wrap-anywhere">
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
                      disabled={readOnly || saving}
                      onClick={() => onSetStatus(a, "done")}
                      aria-label="Đánh dấu xong"
                      title="Đánh dấu xong"
                      className="text-emerald-400 hover:text-emerald-300 p-1 min-h-11 min-w-11 inline-flex items-center justify-center disabled:opacity-40"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                  {a.status === "done" && canToggle(a) && (
                    <button
                      disabled={readOnly || saving}
                      onClick={() => onSetStatus(a, "open")}
                      aria-label="Mở lại"
                      title="Mở lại"
                      className="text-zinc-400 hover:text-white p-1 min-h-11 min-w-11 inline-flex items-center justify-center disabled:opacity-40"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                  {isAdminOrPm && (
                    <button
                      disabled={readOnly || saving}
                      onClick={() => void runDelete(a)}
                      aria-label="Xoá việc"
                      title="Xoá việc"
                      className="text-zinc-500 hover:text-rose-400 p-1 min-h-11 min-w-11 inline-flex items-center justify-center disabled:opacity-40"
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

      {writeError && (
        <p role="alert" className="text-sm text-rose-300 wrap-anywhere">
          {writeError}
        </p>
      )}
      {canManage && (
        <>
          {usersError && <SourceNotice message={usersError} retry={retryUsers} />}
          {!usersReady && !usersError && (
            <p role="status" className="text-sm text-zinc-400">
              Đang tải người làm…
            </p>
          )}
          <fieldset
            disabled={saving || readOnly}
            className="flex flex-wrap gap-2 items-end min-w-0"
          >
            <label className="text-xs text-zinc-400 flex-1 min-w-[180px]">
              Việc cần làm
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Nội dung việc…"
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
              />
            </label>
            {users.length > 0 && (
              <label className="text-xs text-zinc-400 w-full sm:w-36">
                Người làm
                <select
                  aria-label="Người làm"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
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
            <label className="text-xs text-zinc-400 w-full sm:w-36">
              Hạn
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
              />
            </label>
            <Button
              variant="secondary"
              onClick={addAction}
              disabled={saving || readOnly || !usersReady || !content.trim()}
              className="min-h-11"
            >
              {saving ? "Đang lưu…" : "Thêm việc"}
            </Button>
          </fieldset>
        </>
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

  const pending = useRef(false);
  async function submitOnce() {
    if (pending.current || !title.trim() || !meetingDate) return;
    pending.current = true;
    try {
      await submit();
    } finally {
      pending.current = false;
    }
  }
  function close() {
    if (!pending.current) onClose();
  }
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
    <Modal onClose={close} className="max-w-md">
      <div className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Biên bản họp mới</h2>
          <Button
            icon={X}
            variant="ghost"
            size="icon"
            disabled={saving}
            onClick={close}
            aria-label="Đóng"
            className="min-h-11 min-w-11"
          />
        </div>

        <fieldset disabled={saving} className="space-y-3 min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-zinc-400">
              Ngày họp
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Loại họp
              <select
                aria-label="Loại họp"
                value={kind}
                onChange={(e) => setKind(e.target.value as MeetingKind)}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
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
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
            />
          </label>

          <label className="text-xs text-zinc-400 block">
            Thành phần tham dự
            <input
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              placeholder="VD: BCH, TVGS, thầu phụ điện"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
            />
          </label>

          <label className="text-xs text-zinc-400 block">
            Nội dung
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base sm:text-sm min-h-11 text-white"
            />
          </label>

          {err && (
            <p role="alert" className="text-sm text-rose-300">
              {err}
            </p>
          )}
          <Button
            variant="primary"
            onClick={submitOnce}
            disabled={saving || !title.trim() || !meetingDate}
            className="w-full min-h-11"
          >
            {saving ? "Đang lưu…" : "Tạo biên bản họp"}
          </Button>
        </fieldset>
      </div>
    </Modal>
  );
}
