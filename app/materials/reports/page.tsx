'use client';
import { useEffect, useState } from 'react';
import { BarChart2, TrendingUp, AlertTriangle, Package, Clock, UserX } from 'lucide-react';
import AppHeader from '@/app/components/AppHeader';

type StockSummary = {
  sheetCode: string; sheetName: string;
  totalItems: number; totalPlanned: number; totalUsed: number; totalStock: number;
  overBudgetCount: number; lowStockCount: number;
};
type OverBudget = { id: number; name: string; boqCode: string | null; unit: string | null; qtyPlanned: number; qtyUsed: number; overage: number; overPct: number; sheetCode: string };
type LowStock = { id: number; name: string; boqCode: string | null; unit: string | null; qtyStock: number; minStockLevel: number; qtyPlanned: number; sheetCode: string };
type AgedStock = { id: number; name: string; boqCode: string | null; unit: string | null; qtyStock: number; firstReceived: string; daysInStock: number; sheetCode: string };
type NoTaskIssue = { materialId: number; materialName: string; txId: number; delta: number; createdAt: string; createdByName: string; note: string | null };

type Report = {
  stockSummary: StockSummary[];
  overBudget: OverBudget[];
  lowStock: LowStock[];
  warehouseAge: AgedStock[];
  noTaskIssues: NoTaskIssue[];
};

const TAB_LIST = [
  { key: 'summary', label: 'Tổng quan kho', icon: <BarChart2 className="w-4 h-4" /> },
  { key: 'overBudget', label: 'Vượt định mức', icon: <TrendingUp className="w-4 h-4" /> },
  { key: 'lowStock', label: 'Sắp hết hàng', icon: <AlertTriangle className="w-4 h-4" /> },
  { key: 'aged', label: 'Tồn kho lâu', icon: <Clock className="w-4 h-4" /> },
  { key: 'noTask', label: 'Xuất không có task', icon: <UserX className="w-4 h-4" /> },
] as const;
type TabKey = typeof TAB_LIST[number]['key'];

export default function MaterialReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<TabKey>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/me').then(async r => {
      if (!r.ok) { window.location.href = '/login'; return; }
    });
    setLoading(true);
    fetch('/api/materials/reports')
      .then(r => r.json())
      .then(j => {
        if (j.error) { setError(j.error); setLoading(false); return; }
        setReport(j);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <AppHeader />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <BarChart2 className="w-6 h-6 text-purple-400" />
          <h1 className="text-2xl font-bold">Báo cáo vật tư</h1>
        </div>

        {error && <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-sm">{error}</div>}
        {loading && <div className="text-center py-20 text-zinc-400">Đang tải báo cáo...</div>}

        {report && (
          <>
            {/* Tabs */}
            <div className="flex gap-1 mb-6 flex-wrap">
              {TAB_LIST.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${tab === t.key ? 'bg-purple-700 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                  {t.icon} {t.label}
                  {t.key === 'overBudget' && report.overBudget.length > 0 && (
                    <span className="bg-red-600 text-white px-1.5 py-0.5 rounded-full text-xs">{report.overBudget.length}</span>
                  )}
                  {t.key === 'lowStock' && report.lowStock.length > 0 && (
                    <span className="bg-amber-600 text-white px-1.5 py-0.5 rounded-full text-xs">{report.lowStock.length}</span>
                  )}
                  {t.key === 'noTask' && report.noTaskIssues.length > 0 && (
                    <span className="bg-orange-600 text-white px-1.5 py-0.5 rounded-full text-xs">{report.noTaskIssues.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab: Tổng quan */}
            {tab === 'summary' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Tổng vật tư', value: report.stockSummary.reduce((s, r) => s + r.totalItems, 0), cls: 'text-zinc-100' },
                    { label: 'Tổng tồn kho', value: report.stockSummary.reduce((s, r) => s + r.totalStock, 0).toFixed(1), cls: 'text-blue-300' },
                    { label: 'Vật tư vượt ĐM', value: report.stockSummary.reduce((s, r) => s + r.overBudgetCount, 0), cls: 'text-red-400' },
                    { label: 'Cảnh báo tồn thấp', value: report.stockSummary.reduce((s, r) => s + r.lowStockCount, 0), cls: 'text-amber-400' },
                  ].map(c => (
                    <div key={c.label} className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 text-center">
                      <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
                      <div className="text-xs text-zinc-400 mt-1">{c.label}</div>
                    </div>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-zinc-400 border-b border-zinc-700">
                        <th className="text-left py-2 pr-4">Hệ</th>
                        <th className="text-right py-2 pr-4">Vật tư</th>
                        <th className="text-right py-2 pr-4">ĐM kế hoạch</th>
                        <th className="text-right py-2 pr-4">Đã dùng</th>
                        <th className="text-right py-2 pr-4">Tồn kho</th>
                        <th className="text-right py-2 pr-4">% tiêu hao</th>
                        <th className="text-right py-2 pr-4">Vượt ĐM</th>
                        <th className="text-right py-2">Cảnh báo tồn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.stockSummary.map(row => {
                        const pct = row.totalPlanned > 0 ? (row.totalUsed / row.totalPlanned * 100).toFixed(1) : '—';
                        return (
                          <tr key={row.sheetCode} className="border-b border-zinc-700/50 hover:bg-zinc-700/20">
                            <td className="py-3 pr-4 font-medium text-zinc-100">{row.sheetCode} <span className="text-zinc-400 text-xs">({row.sheetName})</span></td>
                            <td className="py-3 pr-4 text-right">{row.totalItems}</td>
                            <td className="py-3 pr-4 text-right text-zinc-300">{row.totalPlanned?.toFixed(1) ?? '0'}</td>
                            <td className="py-3 pr-4 text-right text-zinc-300">{row.totalUsed?.toFixed(1) ?? '0'}</td>
                            <td className="py-3 pr-4 text-right text-blue-300 font-medium">{row.totalStock?.toFixed(1) ?? '0'}</td>
                            <td className={`py-3 pr-4 text-right font-medium ${Number(pct) > 100 ? 'text-red-400' : Number(pct) > 90 ? 'text-amber-400' : 'text-green-400'}`}>{pct}%</td>
                            <td className="py-3 pr-4 text-right">{row.overBudgetCount > 0 ? <span className="text-red-400 font-medium">{row.overBudgetCount}</span> : <span className="text-zinc-600">0</span>}</td>
                            <td className="py-3 text-right">{row.lowStockCount > 0 ? <span className="text-amber-400 font-medium">{row.lowStockCount}</span> : <span className="text-zinc-600">0</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab: Vượt định mức */}
            {tab === 'overBudget' && (
              <div>
                {report.overBudget.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500"><TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Không có vật tư nào vượt định mức</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-zinc-400 border-b border-zinc-700">
                          <th className="text-left py-2 pr-4">Vật tư</th>
                          <th className="text-left py-2 pr-4">Hệ</th>
                          <th className="text-right py-2 pr-4">ĐVT</th>
                          <th className="text-right py-2 pr-4">ĐM kế hoạch</th>
                          <th className="text-right py-2 pr-4">Đã dùng</th>
                          <th className="text-right py-2 pr-4">Vượt</th>
                          <th className="text-right py-2">% vượt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.overBudget.map(r => (
                          <tr key={r.id} className="border-b border-zinc-700/50 hover:bg-zinc-700/20">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-zinc-100">{r.name}</div>
                              {r.boqCode && <div className="text-xs text-zinc-500">{r.boqCode}</div>}
                            </td>
                            <td className="py-3 pr-4 text-zinc-400">{r.sheetCode}</td>
                            <td className="py-3 pr-4 text-right text-zinc-400">{r.unit ?? '-'}</td>
                            <td className="py-3 pr-4 text-right text-zinc-300">{r.qtyPlanned}</td>
                            <td className="py-3 pr-4 text-right font-medium">{r.qtyUsed}</td>
                            <td className="py-3 pr-4 text-right text-red-400 font-semibold">+{r.overage?.toFixed(2)}</td>
                            <td className="py-3 text-right text-red-400 font-semibold">+{r.overPct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Sắp hết hàng */}
            {tab === 'lowStock' && (
              <div>
                {report.lowStock.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Không có vật tư nào dưới mức tối thiểu</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-zinc-400 border-b border-zinc-700">
                          <th className="text-left py-2 pr-4">Vật tư</th>
                          <th className="text-left py-2 pr-4">Hệ</th>
                          <th className="text-right py-2 pr-4">ĐVT</th>
                          <th className="text-right py-2 pr-4">Tồn kho</th>
                          <th className="text-right py-2 pr-4">Mức tối thiểu</th>
                          <th className="text-right py-2">Thiếu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.lowStock.map(r => (
                          <tr key={r.id} className="border-b border-zinc-700/50 hover:bg-zinc-700/20">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-zinc-100">{r.name}</div>
                              {r.boqCode && <div className="text-xs text-zinc-500">{r.boqCode}</div>}
                            </td>
                            <td className="py-3 pr-4 text-zinc-400">{r.sheetCode}</td>
                            <td className="py-3 pr-4 text-right text-zinc-400">{r.unit ?? '-'}</td>
                            <td className="py-3 pr-4 text-right text-amber-400 font-semibold">{r.qtyStock}</td>
                            <td className="py-3 pr-4 text-right text-zinc-300">{r.minStockLevel}</td>
                            <td className="py-3 text-right text-red-400 font-semibold">{(r.minStockLevel - r.qtyStock).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Tồn kho lâu */}
            {tab === 'aged' && (
              <div>
                {report.warehouseAge.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500"><Clock className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Không có vật tư tồn kho quá 30 ngày</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-zinc-400 border-b border-zinc-700">
                          <th className="text-left py-2 pr-4">Vật tư</th>
                          <th className="text-left py-2 pr-4">Hệ</th>
                          <th className="text-right py-2 pr-4">ĐVT</th>
                          <th className="text-right py-2 pr-4">Tồn kho</th>
                          <th className="text-right py-2 pr-4">Nhập lần đầu</th>
                          <th className="text-right py-2">Số ngày tồn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.warehouseAge.map(r => (
                          <tr key={r.id} className="border-b border-zinc-700/50 hover:bg-zinc-700/20">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-zinc-100">{r.name}</div>
                              {r.boqCode && <div className="text-xs text-zinc-500">{r.boqCode}</div>}
                            </td>
                            <td className="py-3 pr-4 text-zinc-400">{r.sheetCode}</td>
                            <td className="py-3 pr-4 text-right text-zinc-400">{r.unit ?? '-'}</td>
                            <td className="py-3 pr-4 text-right font-medium">{r.qtyStock}</td>
                            <td className="py-3 pr-4 text-right text-zinc-400">{new Date(r.firstReceived).toLocaleDateString('vi-VN')}</td>
                            <td className={`py-3 text-right font-semibold ${r.daysInStock > 60 ? 'text-red-400' : 'text-amber-400'}`}>{Math.round(r.daysInStock)} ngày</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Xuất không có task */}
            {tab === 'noTask' && (
              <div>
                {report.noTaskIssues.length === 0 ? (
                  <div className="text-center py-16 text-zinc-500"><UserX className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Mọi lần xuất kho đều có gắn task</p></div>
                ) : (
                  <>
                    <div className="mb-3 p-3 bg-orange-950/50 border border-orange-800/50 rounded text-sm text-orange-300">
                      Các lần xuất vật tư không gắn task cần điều tra. Mọi xuất kho nên gắn với công việc cụ thể để truy vết.
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-zinc-400 border-b border-zinc-700">
                            <th className="text-left py-2 pr-4">Vật tư</th>
                            <th className="text-right py-2 pr-4">SL xuất</th>
                            <th className="text-left py-2 pr-4">Người xuất</th>
                            <th className="text-left py-2 pr-4">Ghi chú</th>
                            <th className="text-right py-2">Thời gian</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.noTaskIssues.map(r => (
                            <tr key={r.txId} className="border-b border-zinc-700/50 hover:bg-zinc-700/20">
                              <td className="py-3 pr-4 font-medium text-zinc-100">{r.materialName}</td>
                              <td className="py-3 pr-4 text-right text-orange-400 font-semibold">{r.delta}</td>
                              <td className="py-3 pr-4 text-zinc-400">{r.createdByName}</td>
                              <td className="py-3 pr-4 text-zinc-400 italic">{r.note ?? '-'}</td>
                              <td className="py-3 text-right text-zinc-400">{new Date(r.createdAt).toLocaleString('vi-VN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
