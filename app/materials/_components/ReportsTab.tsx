'use client';
import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, AlertTriangle, Clock, UserX, ShoppingCart, RefreshCw } from 'lucide-react';

type StockSummary = { sheetCode: string; sheetName: string; totalItems: number; totalPlanned: number; totalUsed: number; totalStock: number; overBudgetCount: number; lowStockCount: number };
type OverBudget = { id: number; name: string; boqCode: string | null; unit: string | null; qtyPlanned: number; qtyUsed: number; overage: number; overPct: number; sheetCode: string };
type LowStock = { id: number; name: string; boqCode: string | null; unit: string | null; qtyStock: number; minStockLevel: number; qtyPlanned: number; sheetCode: string };
type AgedStock = { id: number; name: string; boqCode: string | null; unit: string | null; qtyStock: number; firstReceived: string; daysInStock: number; sheetCode: string };
type NoTaskIssue = { materialId: number; materialName: string; txId: number; delta: number; createdAt: string; createdByName: string; note: string | null };
type NeedsStock = { id: number; name: string; boqCode: string | null; unit: string | null; qtyPlanned: number; qtyStock: number; qtyUsed: number; needQty: number; sheetCode: string; sheetName: string; earliestStart: string; upcomingTasks: number };
type Report = { stockSummary: StockSummary[]; overBudget: OverBudget[]; lowStock: LowStock[]; warehouseAge: AgedStock[]; noTaskIssues: NoTaskIssue[]; needsStock: NeedsStock[] };

const TABS = [
  { key: 'needs',     label: 'Cần nhập kho',    icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  { key: 'summary',   label: 'Tổng quan',        icon: <BarChart2 className="w-3.5 h-3.5" /> },
  { key: 'overBudget',label: 'Vượt định mức',    icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: 'lowStock',  label: 'Tồn thấp',         icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { key: 'aged',      label: 'Tồn lâu',          icon: <Clock className="w-3.5 h-3.5" /> },
  { key: 'noTask',    label: 'Xuất không task',  icon: <UserX className="w-3.5 h-3.5" /> },
] as const;
type TabKey = typeof TABS[number]['key'];

function Badge({ n, cls }: { n: number; cls: string }) {
  if (!n) return null;
  return <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${cls}`}>{n}</span>;
}

function EmptyState({ msg }: { msg: string }) {
  return <div className="text-center py-16 text-zinc-500 text-sm">{msg}</div>;
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`py-2 px-3 text-xs text-zinc-500 font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}

function urgencyColor(days: number) {
  if (days <= 7) return 'text-red-400';
  if (days <= 14) return 'text-orange-400';
  return 'text-amber-400';
}

export default function ReportsTab({ active }: { active: boolean }) {
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<TabKey>('needs');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!active || loaded) return;
    setLoading(true);
    setErr('');
    fetch('/api/materials/reports')
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j?.error ?? 'Lỗi server')))
      .then(j => { setReport(j); setLoaded(true); setLoading(false); })
      .catch(e => { setErr(String(e)); setLoading(false); });
  }, [active, loaded]);

  if (!active) return null;
  if (loading) return <div className="text-center py-16 text-zinc-400 text-sm flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Đang tải báo cáo...</div>;
  if (err) return (
    <div className="space-y-3">
      <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-sm text-red-300">{err}</div>
      <button onClick={() => setLoaded(false)} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"><RefreshCw className="w-3 h-3" /> Thử lại</button>
    </div>
  );
  if (!report) return null;

  const r = report;

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.key
                ? (t.key === 'needs' ? 'bg-orange-600 text-white' : 'bg-emerald-700 text-white')
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}`}>
              {t.icon} {t.label}
              {t.key === 'needs'      && <Badge n={r.needsStock.length}    cls="bg-orange-500 text-white" />}
              {t.key === 'overBudget' && <Badge n={r.overBudget.length}    cls="bg-red-600 text-white" />}
              {t.key === 'lowStock'   && <Badge n={r.lowStock.length}      cls="bg-amber-600 text-white" />}
              {t.key === 'noTask'     && <Badge n={r.noTaskIssues.length}  cls="bg-orange-700 text-white" />}
            </button>
          ))}
        </div>
        <button onClick={() => setLoaded(false)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
          <RefreshCw className="w-3 h-3" /> Làm mới
        </button>
      </div>

      {/* ── CẦN NHẬP KHO ── */}
      {tab === 'needs' && (
        r.needsStock.length === 0
          ? <EmptyState msg="Không có vật tư nào cần nhập gấp trong 30 ngày tới" />
          : <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-orange-950/40 border border-orange-800/50 rounded-lg text-xs text-orange-200">
                <ShoppingCart className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{r.needsStock.length} vật tư</span> chưa đủ kho cho các hạng mục thi công trong vòng 30 ngày tới.
                  Cần đặt hàng ngay để đảm bảo cung ứng đúng tiến độ (khuyến nghị nhập trước ít nhất 1 tháng).
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-800/60">
                    <tr>
                      <Th>Vật tư</Th>
                      <Th>Hệ</Th>
                      <Th right>ĐVT</Th>
                      <Th right>ĐM kế hoạch</Th>
                      <Th right>Đã dùng</Th>
                      <Th right>Tồn kho</Th>
                      <Th right>Cần nhập thêm</Th>
                      <Th right>Task sớm nhất</Th>
                      <Th right>Số task</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {r.needsStock.map(m => {
                      const days = Math.ceil((new Date(m.earliestStart).getTime() - Date.now()) / 86400000);
                      return (
                        <tr key={m.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-zinc-100">{m.name}</div>
                            {m.boqCode && <div className="text-zinc-500 font-mono">{m.boqCode}</div>}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-400">{m.sheetCode}</td>
                          <td className="py-2.5 px-3 text-right text-zinc-400">{m.unit ?? '—'}</td>
                          <td className="py-2.5 px-3 text-right text-zinc-300">{Number(m.qtyPlanned).toLocaleString('vi')}</td>
                          <td className="py-2.5 px-3 text-right text-zinc-400">{Number(m.qtyUsed).toLocaleString('vi')}</td>
                          <td className="py-2.5 px-3 text-right text-blue-300">{Number(m.qtyStock).toLocaleString('vi')}</td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="font-bold text-orange-300">{Number(m.needQty).toLocaleString('vi')}</span>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-medium ${urgencyColor(days)}`}>
                            {new Date(m.earliestStart).toLocaleDateString('vi-VN')}
                            <div className="text-[10px] font-normal opacity-75">còn {days} ngày</div>
                          </td>
                          <td className="py-2.5 px-3 text-right text-zinc-400">{m.upcomingTasks}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
      )}

      {/* ── TỔNG QUAN ── */}
      {tab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Tổng vật tư',       value: r.stockSummary.reduce((s, x) => s + Number(x.totalItems), 0),       cls: 'text-zinc-100' },
              { label: 'Tổng tồn kho',      value: r.stockSummary.reduce((s, x) => s + Number(x.totalStock), 0).toFixed(1), cls: 'text-blue-300' },
              { label: 'Vượt định mức',     value: r.stockSummary.reduce((s, x) => s + Number(x.overBudgetCount), 0),  cls: 'text-red-400' },
              { label: 'Cảnh báo tồn thấp', value: r.stockSummary.reduce((s, x) => s + Number(x.lowStockCount), 0),   cls: 'text-amber-400' },
            ].map(c => (
              <div key={c.label} className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
                <div className="text-xs text-zinc-400 mt-1">{c.label}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="bg-zinc-800/60">
                <tr>
                  <Th>Hệ</Th><Th right>Vật tư</Th><Th right>ĐM kế hoạch</Th>
                  <Th right>Đã dùng</Th><Th right>Tồn kho</Th>
                  <Th right>% tiêu hao</Th><Th right>Vượt ĐM</Th><Th right>Tồn thấp</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {r.stockSummary.map(row => {
                  const pct = Number(row.totalPlanned) > 0 ? (Number(row.totalUsed) / Number(row.totalPlanned) * 100) : 0;
                  return (
                    <tr key={row.sheetCode} className="hover:bg-zinc-800/40">
                      <td className="py-2.5 px-3 font-medium text-zinc-100">{row.sheetCode}</td>
                      <td className="py-2.5 px-3 text-right">{row.totalItems}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-300">{Number(row.totalPlanned).toLocaleString('vi')}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-300">{Number(row.totalUsed).toLocaleString('vi')}</td>
                      <td className="py-2.5 px-3 text-right text-blue-300 font-medium">{Number(row.totalStock).toLocaleString('vi')}</td>
                      <td className={`py-2.5 px-3 text-right font-medium ${pct > 100 ? 'text-red-400' : pct > 90 ? 'text-amber-400' : 'text-emerald-400'}`}>{pct.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right">{Number(row.overBudgetCount) > 0 ? <span className="text-red-400 font-semibold">{row.overBudgetCount}</span> : <span className="text-zinc-600">0</span>}</td>
                      <td className="py-2.5 px-3 text-right">{Number(row.lowStockCount) > 0 ? <span className="text-amber-400 font-semibold">{row.lowStockCount}</span> : <span className="text-zinc-600">0</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── VƯỢT ĐỊNH MỨC ── */}
      {tab === 'overBudget' && (
        r.overBudget.length === 0
          ? <EmptyState msg="Không có vật tư nào vượt định mức" />
          : <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-800/60"><tr>
                  <Th>Vật tư</Th><Th>Hệ</Th><Th right>ĐVT</Th>
                  <Th right>ĐM kế hoạch</Th><Th right>Đã dùng</Th>
                  <Th right>Vượt</Th><Th right>% vượt</Th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800">
                  {r.overBudget.map(x => (
                    <tr key={x.id} className="hover:bg-zinc-800/40">
                      <td className="py-2.5 px-3"><div className="font-medium text-zinc-100">{x.name}</div>{x.boqCode && <div className="text-zinc-500 font-mono">{x.boqCode}</div>}</td>
                      <td className="py-2.5 px-3 text-zinc-400">{x.sheetCode}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-400">{x.unit ?? '—'}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-300">{Number(x.qtyPlanned).toLocaleString('vi')}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-zinc-200">{Number(x.qtyUsed).toLocaleString('vi')}</td>
                      <td className="py-2.5 px-3 text-right text-red-400 font-bold">+{Number(x.overage).toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-red-400 font-bold">+{x.overPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {/* ── TỒN THẤP ── */}
      {tab === 'lowStock' && (
        r.lowStock.length === 0
          ? <EmptyState msg="Không có vật tư nào dưới mức tối thiểu" />
          : <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-800/60"><tr>
                  <Th>Vật tư</Th><Th>Hệ</Th><Th right>ĐVT</Th>
                  <Th right>Tồn kho</Th><Th right>Mức tối thiểu</Th><Th right>Cần nhập thêm</Th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800">
                  {r.lowStock.map(x => (
                    <tr key={x.id} className="hover:bg-zinc-800/40">
                      <td className="py-2.5 px-3"><div className="font-medium text-zinc-100">{x.name}</div>{x.boqCode && <div className="text-zinc-500 font-mono">{x.boqCode}</div>}</td>
                      <td className="py-2.5 px-3 text-zinc-400">{x.sheetCode}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-400">{x.unit ?? '—'}</td>
                      <td className="py-2.5 px-3 text-right text-amber-400 font-bold">{Number(x.qtyStock).toLocaleString('vi')}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-300">{Number(x.minStockLevel).toLocaleString('vi')}</td>
                      <td className="py-2.5 px-3 text-right text-red-400 font-bold">{(Number(x.minStockLevel) - Number(x.qtyStock)).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {/* ── TỒN LÂU ── */}
      {tab === 'aged' && (
        r.warehouseAge.length === 0
          ? <EmptyState msg="Không có vật tư tồn kho quá 30 ngày" />
          : <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-800/60"><tr>
                  <Th>Vật tư</Th><Th>Hệ</Th><Th right>ĐVT</Th>
                  <Th right>Tồn kho</Th><Th right>Nhập lần đầu</Th><Th right>Số ngày tồn</Th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800">
                  {r.warehouseAge.map(x => (
                    <tr key={x.id} className="hover:bg-zinc-800/40">
                      <td className="py-2.5 px-3"><div className="font-medium text-zinc-100">{x.name}</div>{x.boqCode && <div className="text-zinc-500 font-mono">{x.boqCode}</div>}</td>
                      <td className="py-2.5 px-3 text-zinc-400">{x.sheetCode}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-400">{x.unit ?? '—'}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-zinc-200">{Number(x.qtyStock).toLocaleString('vi')}</td>
                      <td className="py-2.5 px-3 text-right text-zinc-400">{new Date(x.firstReceived).toLocaleDateString('vi-VN')}</td>
                      <td className={`py-2.5 px-3 text-right font-bold ${Number(x.daysInStock) > 60 ? 'text-red-400' : 'text-amber-400'}`}>{Math.round(Number(x.daysInStock))} ngày</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
      )}

      {/* ── XUẤT KHÔNG TASK ── */}
      {tab === 'noTask' && (
        r.noTaskIssues.length === 0
          ? <EmptyState msg="Mọi lần xuất kho đều gắn task — tốt!" />
          : <div className="space-y-3">
              <div className="p-3 bg-orange-950/40 border border-orange-800/50 rounded-lg text-xs text-orange-200">
                Các lần xuất không gắn task cần điều tra — mọi xuất kho nên có công việc cụ thể.
              </div>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-800/60"><tr>
                    <Th>Vật tư</Th><Th right>SL xuất</Th>
                    <Th>Người xuất</Th><Th>Ghi chú</Th><Th right>Thời gian</Th>
                  </tr></thead>
                  <tbody className="divide-y divide-zinc-800">
                    {r.noTaskIssues.map(x => (
                      <tr key={x.txId} className="hover:bg-zinc-800/40">
                        <td className="py-2.5 px-3 font-medium text-zinc-100">{x.materialName}</td>
                        <td className="py-2.5 px-3 text-right text-orange-400 font-bold">{x.delta}</td>
                        <td className="py-2.5 px-3 text-zinc-400">{x.createdByName}</td>
                        <td className="py-2.5 px-3 text-zinc-500 italic">{x.note ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right text-zinc-400">{new Date(x.createdAt).toLocaleString('vi-VN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
      )}
    </div>
  );
}
