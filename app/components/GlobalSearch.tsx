'use client';
// Tìm kiếm toàn cục: mã Excel / BOQCODE / tên công việc → nhảy thẳng tới sheet + tầng.
import { useEffect, useRef, useState } from 'react';
import { Search, Boxes, ListTodo } from 'lucide-react';
import { slugFromCode } from '@/lib/sheets';

type Hit = {
  kind: 'task' | 'package';
  id: number; code: string; name: string; boqCode: string | null;
  status: string | null; progress: number;
  floorLabel: string | null; sheetType: string;
};

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

function hitUrl(h: Hit): string {
  const slug = slugFromCode(h.sheetType);
  if (!slug) return '/';
  return `/tracking/${slug}${h.floorLabel ? `?floor=${encodeURIComponent(h.floorLabel)}` : ''}`;
}

export default function GlobalSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const seqRef = useRef(0);

  // Debounce 300ms; seq chống kết quả về trễ ghi đè truy vấn mới hơn.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setBusy(false); return; }
    setBusy(true);
    const seq = ++seqRef.current;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`).catch(() => null);
      if (seq !== seqRef.current) return;
      setHits(r?.ok ? (await r.json()).hits ?? [] : []);
      setActive(0);
      setBusy(false);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && hits[active]) window.location.href = hitUrl(hits[active]);
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="relative flex-1 max-w-md hidden sm:block" ref={boxRef}>
      <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500 pointer-events-none" />
      <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
        placeholder="Tìm mã task / BOQCODE / tên công việc..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:border-emerald-600" />

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="max-h-80 overflow-auto">
            {busy && <p className="px-4 py-3 text-sm text-zinc-500">Đang tìm...</p>}
            {!busy && hits.length === 0 && <p className="px-4 py-3 text-sm text-zinc-500">Không tìm thấy &ldquo;{q.trim()}&rdquo;</p>}
            {hits.map((h, i) => (
              <a key={`${h.kind}-${h.id}`} href={hitUrl(h)}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center gap-2.5 px-3 py-2 border-b border-zinc-800/60 text-sm ${i === active ? 'bg-zinc-800/70' : ''}`}>
                {h.kind === 'package'
                  ? <Boxes className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  : <ListTodo className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                <span className="font-mono text-emerald-400 text-xs shrink-0">{h.boqCode ?? h.code}</span>
                <span className="truncate flex-1">{h.name}</span>
                <span className="text-[10px] text-zinc-500 shrink-0">{h.sheetType}{h.floorLabel ? ` · ${h.floorLabel}` : ''}</span>
                <span className={`text-[10px] shrink-0 w-9 text-right ${h.status === 'tre' ? 'text-red-400' : 'text-zinc-400'}`}
                  title={h.status ? STATUS_LABEL[h.status] ?? h.status : ''}>
                  {Math.round((h.progress ?? 0) * 100)}%
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
