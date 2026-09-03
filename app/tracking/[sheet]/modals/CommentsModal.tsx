"use client";
// Tách nguyên văn khỏi TrackingGrid.tsx (M121 PR1) — không đổi hành vi.
import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send, Trash2, X } from "lucide-react";
import { Modal, appConfirm } from "@/app/components/dialogs";
import CustomFieldsSection from "@/app/components/CustomFieldsSection";
import { ROLE_LABELS } from "@/lib/nen/roles";
import { fetchMe } from "@/app/lib/me";
import { formatDateTimeVN } from "@/lib/nen/date";
import type { GridTask } from "../types";

type Comment = {
  id: number;
  body: string;
  createdAt: string;
  userId: number | null;
  userName: string | null;
  userRole: string | null;
};

const ROLE_BADGE: Record<string, string> = ROLE_LABELS;

// Trao đổi trên task: PM hỏi — người thi công trả lời ngay trong app.
export function CommentsModal({
  task,
  canEdit,
  onClose,
}: {
  task: GridTask;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [me, setMe] = useState<{ id: number; role: string } | null>(null);

  const load = useCallback(() => {
    fetch(`/api/tasks/${task.id}/comments`)
      .then((r) => r.json())
      .then((j) => setComments(j.comments ?? []));
  }, [task.id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    fetchMe().then((user) => user && setMe({ id: user.id, role: user.role }));
  }, []);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    const res = await fetch(`/api/tasks/${task.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Gửi thất bại");
    } else setDraft("");
    setSending(false);
    load();
  }

  async function remove(c: Comment) {
    if (!(await appConfirm("Xoá bình luận này?", { danger: true, confirmLabel: "Xoá" }))) return;
    await fetch(`/api/comments/${c.id}`, { method: "DELETE" });
    load();
  }

  const canDelete = (c: Comment) =>
    me && (c.userId === me.id || me.role === "admin" || me.role === "pm");

  return (
    <Modal onClose={onClose} className="max-w-lg max-h-[85vh] flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-violet-400" />
        <div className="min-w-0">
          <h3 className="font-semibold text-sm truncate">Trao đổi — {task.name}</h3>
          <p className="text-xs text-zinc-500 font-mono">{task.code}</p>
        </div>
        <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="overflow-auto p-4 flex-1 space-y-3">
        <CustomFieldsSection
          entityType="task"
          apiPath={`/api/tasks/${task.id}`}
          value={task.custom}
          canEdit={canEdit}
        />
        {comments === null && <p className="text-sm text-zinc-500">Đang tải...</p>}
        {comments?.length === 0 && (
          <p className="text-sm text-zinc-500">
            Chưa có trao đổi nào. Đặt câu hỏi hoặc báo cáo vướng mắc tại đây.
          </p>
        )}
        {comments?.map((c) => (
          <div
            key={c.id}
            className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-3 py-2 group"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-violet-300">{c.userName ?? "—"}</span>
              {c.userRole && (
                <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">
                  {ROLE_BADGE[c.userRole] ?? c.userRole}
                </span>
              )}
              <span className="text-zinc-600">{formatDateTimeVN(c.createdAt)}</span>
              {canDelete(c) && (
                <button
                  onClick={() => remove(c)}
                  title="Xoá"
                  className="ml-auto text-zinc-700 hover:text-red-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 p-3">
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Viết bình luận... (Ctrl+Enter để gửi)"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
            }}
            className="bg-zinc-950 border border-zinc-800 focus:border-violet-600 rounded-lg px-3 py-2 text-sm flex-1 outline-none resize-none"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || sending}
            title="Gửi"
            className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-3 self-end py-2.5 text-on-accent"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
