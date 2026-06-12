'use client';
import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// ── Modal nền tảng: overlay + Escape để đóng + khoá scroll nền ──────────────
// Dùng chung cho mọi modal trong app thay vì tự dựng overlay từng nơi.
export function Modal({ onClose, children, className = 'max-w-md', zIndex = 'z-50' }: {
  onClose: () => void; children: ReactNode; className?: string; zIndex?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!focusable.length) { e.preventDefault(); return; }
        if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
        else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus vào phần tử đầu tiên khi modal mở
    const t = setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }, 50);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; clearTimeout(t); };
  }, [onClose]);

  return (
    <div className={`fixed inset-0 ${zIndex} bg-black/60 flex items-center justify-center p-4`}
      role="dialog" aria-modal="true" onClick={onClose}>
      <div ref={panelRef} className={`bg-zinc-900 border border-zinc-700 rounded-xl w-full ${className}`}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Dialog kiểu prompt/confirm/alert trả Promise — thay window.* ────────────
// window.prompt bị chặn trong PWA standalone trên một số WebView/iOS,
// và không style được theo dark theme. Gọi: await appPrompt('...', 'giá trị').

type DialogRequest =
  | { kind: 'alert'; message: string; resolve: (v: void) => void }
  | { kind: 'confirm'; message: string; danger?: boolean; confirmLabel?: string; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; defaultValue: string; placeholder?: string; mono?: boolean; resolve: (v: string | null) => void };

let pushRequest: ((r: DialogRequest) => void) | null = null;
const queue: DialogRequest[] = [];

function dispatch(r: DialogRequest) {
  if (pushRequest) pushRequest(r);
  else queue.push(r); // AppDialogs chưa mount — giữ lại, mount xong xử lý
}

export function appAlert(message: string): Promise<void> {
  return new Promise(resolve => dispatch({ kind: 'alert', message, resolve }));
}
export function appConfirm(message: string, opts?: { danger?: boolean; confirmLabel?: string }): Promise<boolean> {
  return new Promise(resolve => dispatch({ kind: 'confirm', message, ...opts, resolve }));
}
export function appPrompt(message: string, defaultValue = '', opts?: { placeholder?: string; mono?: boolean }): Promise<string | null> {
  return new Promise(resolve => dispatch({ kind: 'prompt', message, defaultValue, ...opts, resolve }));
}

// Host hiển thị dialog — mount 1 lần trong layout gốc.
export default function AppDialogs() {
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const pending = useRef<DialogRequest[]>([]);
  const [value, setValue] = useState('');

  const showNext = useCallback(() => {
    const next = pending.current.shift() ?? null;
    setCurrent(next);
    setValue(next?.kind === 'prompt' ? next.defaultValue : '');
  }, []);

  useEffect(() => {
    pushRequest = (r: DialogRequest) => {
      pending.current.push(r);
      setCurrent(c => {
        if (c) return c; // đang mở dialog khác — xếp hàng
        const next = pending.current.shift();
        if (!next) return c;
        setValue(next.kind === 'prompt' ? next.defaultValue : '');
        return next;
      });
    };
    queue.splice(0).forEach(r => pushRequest!(r));
    return () => { pushRequest = null; };
  }, []);

  if (!current) return null;

  const close = (fn: () => void) => { fn(); showNext(); };
  const cancel = () => close(() => {
    if (current.kind === 'confirm') current.resolve(false);
    else if (current.kind === 'prompt') current.resolve(null);
    else current.resolve();
  });
  const ok = () => close(() => {
    if (current.kind === 'confirm') current.resolve(true);
    else if (current.kind === 'prompt') current.resolve(value);
    else current.resolve();
  });

  return (
    <Modal onClose={cancel} className="max-w-sm" zIndex="z-[70]">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <h3 className="font-semibold text-sm flex-1 whitespace-pre-wrap">{current.message}</h3>
        <button onClick={cancel} aria-label="Đóng" className="text-zinc-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-4 space-y-3">
        {current.kind === 'prompt' && (
          <input autoFocus value={value} onChange={e => setValue(e.target.value)}
            placeholder={current.placeholder}
            onKeyDown={e => { if (e.key === 'Enter') ok(); }}
            className={`w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 ${current.mono ? 'font-mono' : ''}`} />
        )}
        <div className="flex justify-end gap-2">
          {current.kind !== 'alert' && (
            <button onClick={cancel} className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg">Huỷ</button>
          )}
          <button onClick={ok} autoFocus={current.kind !== 'prompt'}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium ${current.kind === 'confirm' && current.danger
              ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
            {current.kind === 'confirm' ? (current.confirmLabel ?? 'Đồng ý') : 'OK'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
