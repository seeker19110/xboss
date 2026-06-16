'use client';
// Text giao diện admin sửa được tại chỗ.
// Dùng: <EditableText tkey="dashboard.kpi.title">Tổng quan</EditableText>
//   - children là text MẶC ĐỊNH (hiển thị khi chưa có override).
//   - chỉ admin thấy nút bút chì để sửa; người khác thấy text bình thường.
// Kho override tải 1 lần, chia sẻ cho mọi component qua store ngoài React.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pencil, Check, X } from 'lucide-react';

let cache: Record<string, string> | null = null;
let isAdmin = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

function ensureLoaded() {
  if (cache || loading) return;
  loading = Promise.all([
    fetch('/api/ui-texts').then(r => (r.ok ? r.json() : { texts: {} })).catch(() => ({ texts: {} })),
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([t, me]) => {
    cache = t && typeof t.texts === 'object' && t.texts ? t.texts : {};
    isAdmin = me?.user?.role === 'admin';
    emit();
  });
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function snapshot() { return cache; }

async function saveText(key: string, value: string, def: string) {
  const v = value.trim();
  const next = { ...(cache ?? {}) };
  if (!v || v === def) delete next[key]; else next[key] = v;
  cache = next; emit();
  await fetch('/api/ui-texts', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value: v === def ? '' : v }),
  }).catch(() => { /* lỗi mạng — giữ giá trị local */ });
}

export default function EditableText({ tkey, children, className }: {
  tkey: string;
  children: string;          // text mặc định
  className?: string;
}) {
  const store = useSyncExternalStore(subscribe, snapshot, () => null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => { ensureLoaded(); }, []);

  const def = children;
  const value = store?.[tkey] ?? def;

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        <input
          autoFocus value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); saveText(tkey, draft, def); setEditing(false); }
            if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
          }}
          className="bg-zinc-800 border border-emerald-600 rounded px-1.5 py-0.5 text-inherit outline-none min-w-[6rem]"
        />
        <button onClick={() => { saveText(tkey, draft, def); setEditing(false); }}
          title="Lưu" className="text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={() => setEditing(false)} title="Huỷ"
          className="text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
        {value !== def && (
          <button onClick={() => { saveText(tkey, '', def); setEditing(false); }}
            title="Đặt lại mặc định" className="text-zinc-500 hover:text-amber-400 text-[10px] underline">mặc định</button>
        )}
      </span>
    );
  }

  return (
    <span className={`group/et inline-flex items-center gap-1 ${className ?? ''}`}>
      <span>{value}</span>
      {isAdmin && (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          title="Sửa text (Admin)"
          className="opacity-0 group-hover/et:opacity-100 transition-opacity text-zinc-500 hover:text-emerald-400 shrink-0">
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
