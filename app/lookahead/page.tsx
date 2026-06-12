'use client';
import { useEffect, useState } from 'react';
import { ArrowLeft, Printer, CalendarClock } from 'lucide-react';
import { DELAY_REASON_LABEL } from '@/lib/delay';

const STATUS_LABEL: Record<string, string> = {
  chuan_bi: 'Chuẩn bị', dang_thi_cong: 'Đang thi công',
  hoan_thanh: 'Hoàn thành', nghiem_thu: 'Đã nghiệm thu', tre: 'Đang trễ',
};

type LTask = {
  id: number; code: string; name: string; status: string;
  startDate: string | null; endDate: string | null; progressPercent: number;
  floorLabel: string | null; packageCode: string; sheetType: string;
  delayReason: string | null;
};
type Data = { days: number; from: string; until: string; starting: LTask[]; due: LTask[] };

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('vi-VN');
};

// Nhóm task theo hệ (sheet) — giữ thứ tự xuất hiện.
function groupBySheet(tasks: LTask[]): { sheet: string; tasks: LTask[] }[] {
  const groups: { sheet: string; tasks: LTask[] }[] = [];
  for (const t of tasks) {
    let g = groups.find(x => x.sheet === t.sheetType);
    if (!g) { g = { sheet: t.sheetType, tasks: [] }; groups.push(g); }
    g.tasks.push(t);
  }
  return groups;
}

function TaskTable({ tasks, dateCol }: { tasks: LTask[]; dateCol: 'startDate' | 'endDate' }) {
  return (
    <table className="w-full text-sm border-collapse mb-4">
      <thead>
        <tr className="bg-zinc-100 border-y border-zinc-300 text-left">
          <th className="p-2 w-24">Mã</th>
          <th className="p-2">Công việc</th>
          <th className="p-2 w-16">Tầng</th>
          <th className="p-2 w-24">{dateCol === 'startDate' ? 'Bắt đầu' : 'Đến hạn'}</th>
          <th className="p-2 w-14">%</th>
          <th className="p-2 w-28">Ghi chú</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map(t => (
          <tr key={t.id} className="border-b border-zinc-200">
            <td className="p-2 font-mono text-xs">{t.code}</td>
            <td className="p-2">{t.name}</td>
            <td className="p-2">{t.floorLabel ?? '—'}</td>
            <td className={`p-2 ${dateCol === 'endDate' && t.status === 'tre' ? 'text-red-600 font-medium' : ''}`}>{fmtDate(t[dateCol])}</td>
            <td className="p-2">{Math.round((t.progressPercent ?? 0) * 100)}%</td>
            <td className="p-2 text-xs text-zinc-500">
              {t.status === 'tre'
                ? `Đang trễ${t.delayReason ? ` · ${DELAY_REASON_LABEL[t.delayReason as keyof typeof DELAY_REASON_LABEL] ?? t.delayReason}` : ''}`
                : STATUS_LABEL[t.status] ?? ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LookaheadPage() {
  const [data, setData] = useState<Data | null>(null);
  const [days, setDays] = useState(14);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lookahead?days=${days}`).then(async r => {
      if (r.status === 401) { window.location.href = '/login'; return; }
      setData(await r.json());
    });
  }, [days]);
  useEffect(() => {
    fetch('/api/project').then(r => r.ok ? r.json() : null).then(j => setProjectName(j?.name ?? null));
  }, []);

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <div className="no-print sticky top-0 bg-zinc-100 border-b border-zinc-300 px-6 py-3 flex items-center gap-3">
        <a href="/" className="text-zinc-600 hover:text-zinc-900"><ArrowLeft className="w-5 h-5" /></a>
        <span className="text-sm text-zinc-600">Kế hoạch ngắn hạn cho họp giao ban — in hoặc lưu PDF</span>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="ml-auto border border-zinc-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value={7}>7 ngày</option>
          <option value={14}>14 ngày</option>
          <option value={21}>21 ngày</option>
        </select>
        <button onClick={() => window.print()} className="flex items-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-lg text-sm">
          <Printer className="w-4 h-4" /> In / Lưu PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        <div className="border-b-2 border-zinc-900 pb-4 mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarClock className="w-6 h-6" /> KẾ HOẠCH {data?.days ?? days} NGÀY TỚI
          </h1>
          <p className="text-zinc-600">
            {projectName ?? 'XBoss'} · {fmtDate(data?.from ?? null)} → {fmtDate(data?.until ?? null)}
          </p>
        </div>

        <h2 className="font-bold text-lg mb-1">1. Công việc sắp bắt đầu ({data?.starting.length ?? 0})</h2>
        <p className="text-xs text-zinc-500 mb-3">Chuẩn bị mặt bằng, vật tư, nhân lực trước ngày bắt đầu.</p>
        {data?.starting.length === 0 && <p className="text-sm text-zinc-400 mb-6">Không có công việc nào bắt đầu trong giai đoạn này.</p>}
        {groupBySheet(data?.starting ?? []).map(g => (
          <div key={g.sheet} className="mb-2 avoid-break">
            <h3 className="font-semibold text-sm bg-zinc-50 border-l-4 border-zinc-900 pl-2 py-1 mb-1">{g.sheet} ({g.tasks.length})</h3>
            <TaskTable tasks={g.tasks} dateCol="startDate" />
          </div>
        ))}

        <h2 className="font-bold text-lg mb-1 mt-8 page-break">2. Công việc đến hạn ({data?.due.length ?? 0})</h2>
        <p className="text-xs text-zinc-500 mb-3">Phải hoàn thành trong giai đoạn này — ưu tiên dòng đang trễ (đỏ).</p>
        {data?.due.length === 0 && <p className="text-sm text-zinc-400 mb-6">Không có deadline nào trong giai đoạn này.</p>}
        {groupBySheet(data?.due ?? []).map(g => (
          <div key={g.sheet} className="mb-2 avoid-break">
            <h3 className="font-semibold text-sm bg-zinc-50 border-l-4 border-zinc-900 pl-2 py-1 mb-1">{g.sheet} ({g.tasks.length})</h3>
            <TaskTable tasks={g.tasks} dateCol="endDate" />
          </div>
        ))}

        <p className="text-xs text-zinc-400 mt-8">Xuất từ XBoss · {new Date().toLocaleString('vi-VN')}</p>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          @page { margin: 14mm; }
          .page-break { break-before: page; }
          .avoid-break { break-inside: avoid; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
