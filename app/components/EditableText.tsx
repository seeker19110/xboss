"use client";
// Text giao diện admin sửa được tại chỗ.
// Dùng: <EditableText tkey="dashboard.kpi.title">Tổng quan</EditableText>
//   - children là text MẶC ĐỊNH (hiển thị khi chưa có override).
//   - chỉ admin thấy nút bút chì để sửa; người khác thấy text bình thường.
// Kho override tải 1 lần, chia sẻ cho mọi component qua store ngoài React.
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Pencil, Check, X } from "lucide-react";
import { fetchMe } from "@/app/lib/me";
import { Button } from "@/app/components/ui";

let cache: Record<string, string> | null = null;
let isAdmin = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function ensureLoaded() {
  if (cache || loading) return;
  loading = Promise.all([
    fetch("/api/ui-texts").then((r) => {
      if (!r.ok) throw new Error("Không tải được nhãn giao diện");
      return r.json();
    }),
    fetchMe(),
  ])
    .then(([t, me]) => {
      if (
        !t?.texts ||
        typeof t.texts !== "object" ||
        Array.isArray(t.texts) ||
        !Object.values(t.texts).every((value) => typeof value === "string")
      )
        throw new Error("Dữ liệu nhãn giao diện không hợp lệ");
      cache = t.texts;
      isAdmin = me?.role === "admin";
      emit();
    })
    .catch(() => {
      // Giữ text mặc định; lỗi không trở thành cache rỗng thành công. Lần mount tiếp
      // theo (vd mở lại settings) được thử lại, không tạo vòng retry nền.
    })
    .finally(() => {
      loading = null;
    });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function snapshot() {
  return cache;
}

async function saveText(key: string, value: string, def: string) {
  const v = value.trim();
  const res = await fetch("/api/ui-texts", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value: v === def ? "" : v }),
  }).catch(() => {
    throw new Error("Mất kết nối — chưa lưu được nhãn. Kiểm tra mạng rồi thử lại.");
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(typeof data?.error === "string" ? data.error : "Không lưu được nhãn giao diện");
  }
  // Chỉ chia sẻ giá trị đã được server chấp nhận; lỗi vẫn giữ bản nhập trong editor.
  const next = { ...(cache ?? {}) };
  if (!v || v === def) delete next[key];
  else next[key] = v;
  cache = next;
  emit();
}

export default function EditableText({
  tkey,
  children,
  className,
}: {
  tkey: string;
  children: string; // text mặc định
  className?: string;
}) {
  const store = useSyncExternalStore(subscribe, snapshot, () => null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const errorId = useId();
  const textLabelId = useId();

  useEffect(() => {
    ensureLoaded();
  }, []);

  useEffect(() => {
    if (!editing && restoreFocus.current) {
      restoreFocus.current = false;
      editButtonRef.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  const def = children;
  const value = store?.[tkey] ?? def;

  function endEditing() {
    restoreFocus.current = true;
    setEditing(false);
    setError("");
  }

  function cancel() {
    if (!savingRef.current) endEditing();
  }

  async function submit(nextValue: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    inputRef.current?.focus({ preventScroll: true });
    setSaving(true);
    setError("");
    try {
      await saveText(tkey, nextValue, def);
      endEditing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được nhãn giao diện");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span
        role="group"
        aria-labelledby={textLabelId}
        className="inline-flex w-full min-w-0 flex-wrap items-center gap-1 align-middle"
        aria-busy={saving}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
      >
        <span id={textLabelId} data-editable-text-label="" className="sr-only">
          {value}
        </span>
        <input
          ref={inputRef}
          autoFocus
          aria-label="Nội dung nhãn"
          aria-describedby={error ? errorId : undefined}
          readOnly={saving}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit(draft);
            }
          }}
          className="w-full min-w-0 min-h-11 sm:flex-1 sm:w-auto bg-zinc-800 border border-emerald-600 rounded-lg px-3 py-2 text-base outline-none"
        />
        <Button
          variant="ghost"
          size="icon"
          icon={Check}
          aria-label="Lưu"
          disabled={saving}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void submit(draft);
          }}
          title="Lưu"
          className="min-w-11 min-h-11"
        >
          {saving ? "Đang lưu…" : undefined}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          icon={X}
          aria-label="Huỷ"
          disabled={saving}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            cancel();
          }}
          title="Huỷ"
          className="min-w-11 min-h-11"
        />
        {value !== def && (
          <Button
            variant="ghost"
            disabled={saving}
            aria-label="Đặt lại mặc định"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void submit("");
            }}
            title="Đặt lại mặc định"
            className="min-h-11"
          >
            mặc định
          </Button>
        )}
        {error && (
          <span
            id={errorId}
            role="alert"
            className="w-full whitespace-normal text-xs font-normal text-red-400"
          >
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      role="group"
      aria-labelledby={textLabelId}
      className={`group/et inline-flex min-w-0 flex-wrap items-center gap-1 ${className ?? ""}`}
    >
      <span id={textLabelId} data-editable-text-label="" className="min-w-0 break-words">
        {value}
      </span>
      {isAdmin && (
        <button
          ref={editButtonRef}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDraft(value);
            setError("");
            setEditing(true);
          }}
          title="Sửa text (Admin)"
          aria-label="Sửa text (Admin)"
          className="min-w-11 min-h-11 sm:min-w-6 sm:min-h-6 inline-flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover/et:opacity-100 sm:focus-visible:opacity-100 transition-opacity text-zinc-500 hover:text-emerald-400 shrink-0"
        >
          <Pencil className="w-3 h-3" aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
