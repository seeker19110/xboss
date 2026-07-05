"use client";
import { use, useEffect, useState } from "react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { fetchMe, type Me } from "@/app/lib/me";
import { disciplineColorClasses, type DisciplineColorClasses } from "@/lib/disciplineColors";

type Sheet = {
  id: number;
  code: string;
  name: string;
  slug: string;
  total: number;
  avgProgress: number;
  delayed: number;
};
type Contractor = {
  id: number;
  supplierId: number;
  supplierName: string;
  floorLabels: string[] | null;
  zone: string | null;
  isPrimary: boolean;
  note: string | null;
};
type Summary = {
  discipline: { id: number; code: string; name: string; color: string | null };
  sheets: Sheet[];
  progressPercent: number;
  totalTasks: number;
  delayedCount: number;
  waitingApprovalCount: number;
  contractors: Contractor[];
};

// Rút gọn phạm vi tầng cho chip nhà thầu: 1 tầng → giữ nguyên, nhiều tầng → "đầu–cuối".
function floorRangeLabel(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels[0]}–${labels[labels.length - 1]}`;
}

function KpiTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="bg-zinc-950/60 border border-zinc-800 rounded-lg px-4 py-3 min-w-[110px] shrink-0">
      <p className="text-[11px] text-zinc-400">{label}</p>
      <p className={`text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function SheetCard({ sheet, accent }: { sheet: Sheet; accent: DisciplineColorClasses }) {
  const pct = Math.round((sheet.avgProgress ?? 0) * 100);
  return (
    <a
      href={`/tracking/${sheet.slug}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm truncate">{sheet.name}</h3>
        <span className={`text-sm font-bold ${accent.text}`}>{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div className={`h-full ${accent.dot}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        {sheet.total} task{sheet.delayed > 0 ? ` · ${sheet.delayed} trễ` : ""}
      </p>
    </a>
  );
}

function ContractorTable({ contractors }: { contractors: Contractor[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="p-4 border-b border-zinc-800">
        <h2 className="font-semibold text-sm">Nhà thầu phụ trách ({contractors.length})</h2>
      </div>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Bảng nhà thầu phụ trách"
      >
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-xs text-zinc-400 border-b border-zinc-800">
              <th className="text-left p-3">NHÀ THẦU</th>
              <th className="text-left p-3">PHẠM VI</th>
              <th className="text-left p-3">GHI CHÚ</th>
            </tr>
          </thead>
          <tbody>
            {contractors.map((c) => (
              <tr key={c.id} className="border-b border-zinc-800/60 last:border-0">
                <td className="p-3">
                  {c.isPrimary && <span className="text-amber-300 mr-1">★</span>}
                  {c.supplierName}
                </td>
                <td className="p-3 text-zinc-300">
                  {c.floorLabels && c.floorLabels.length > 0
                    ? floorRangeLabel(c.floorLabels)
                    : "Toàn bộ tầng"}
                  {c.zone ? ` · ${c.zone}` : ""}
                </td>
                <td className="p-3 text-zinc-400">{c.note ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DisciplineHubPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const [me, setMe] = useState<Me | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tong-quan" | "tracking">("tong-quan");
  const [newSheetName, setNewSheetName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    Promise.all([
      fetchMe(),
      fetch(`/api/disciplines/${code}/summary`).then((r) =>
        r.status === 404 ? null : r.ok ? r.json() : Promise.reject(new Error("fetch failed")),
      ),
    ])
      .then(([meData, data]) => {
        if (!meData) return;
        setMe(meData);
        if (!data) setNotFound(true);
        else setSummary(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [code]);

  async function createSheet() {
    if (!newSheetName.trim() || !summary) return;
    setCreating(true);
    setCreateErr("");
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newSheetName.trim(), disciplineId: summary.discipline.id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateErr(j?.error ?? "Không tạo được sheet");
        return;
      }
      window.location.href = `/tracking/${j.sheet.slug}`;
    } catch {
      setCreateErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <PageSkeleton />;

  if (notFound || !summary) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Không tìm thấy hệ" />
        <main className="p-4 sm:p-6">
          <EmptyState message={`Không tìm thấy hệ "${code}".`} />
        </main>
      </div>
    );
  }

  const c = disciplineColorClasses(summary.discipline.color);
  const canManage = me?.role === "admin" || me?.role === "pm";
  const pct = Math.round(summary.progressPercent * 100);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader title={`Hệ ${summary.discipline.name}`} subtitle="Trang quản lý theo hệ" />
      <main className="p-4 sm:p-6 space-y-6">
        <div
          className={`bg-zinc-900 border border-zinc-800 border-l-4 ${c.border} rounded-xl p-4 sm:p-5`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`w-3 h-3 rounded-full shrink-0 ${c.dot}`} aria-hidden="true" />
            <h1 className="text-lg font-bold">{summary.discipline.name}</h1>
            {summary.contractors.map((ct) => (
              <span
                key={ct.id}
                className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-zinc-800 ${c.text}`}
              >
                {ct.isPrimary && <span aria-hidden="true">★</span>}
                {ct.supplierName}
                {ct.floorLabels && ct.floorLabels.length > 0 && (
                  <span className="text-zinc-400">({floorRangeLabel(ct.floorLabels)})</span>
                )}
              </span>
            ))}
          </div>

          <div
            className="mt-4 flex gap-3 overflow-x-auto scrollbar-none"
            tabIndex={0}
            role="region"
            aria-label="Chỉ số KPI của hệ"
          >
            <KpiTile label="Tiến độ" value={`${pct}%`} accent={c.text} />
            <KpiTile label="Task trễ" value={String(summary.delayedCount)} accent="text-rose-300" />
            <KpiTile
              label="Chờ nghiệm thu"
              value={String(summary.waitingApprovalCount)}
              accent="text-amber-300"
            />
          </div>
        </div>

        <div
          className="flex gap-1 border-b border-zinc-800 overflow-x-auto scrollbar-none"
          role="tablist"
        >
          {(
            [
              ["tong-quan", "Tổng quan"],
              ["tracking", "Tracking"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition shrink-0 ${
                tab === key
                  ? `${c.border} text-white`
                  : "border-transparent text-zinc-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {summary.sheets.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <EmptyState
              title="Chưa có sheet tracking cho hệ này"
              message="Tạo sheet đầu tiên để bắt đầu theo dõi tiến độ hệ này."
              action={
                canManage ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      createSheet();
                    }}
                    className="flex flex-wrap items-center justify-center gap-2 mt-2"
                  >
                    <input
                      value={newSheetName}
                      onChange={(e) => setNewSheetName(e.target.value)}
                      placeholder="Tên sheet mới"
                      aria-label="Tên sheet mới"
                      className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={creating || !newSheetName.trim()}
                      className="bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {creating ? "Đang tạo…" : "Tạo sheet"}
                    </button>
                  </form>
                ) : undefined
              }
            />
            {createErr && <p className="text-sm text-rose-300 text-center pb-4">{createErr}</p>}
          </div>
        ) : tab === "tong-quan" ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {summary.sheets.map((s) => (
                <SheetCard key={s.id} sheet={s} accent={c} />
              ))}
            </div>
            {summary.contractors.length > 0 && (
              <ContractorTable contractors={summary.contractors} />
            )}
          </>
        ) : (
          <div className="space-y-2">
            {summary.sheets.map((s) => {
              const spct = Math.round((s.avgProgress ?? 0) * 100);
              return (
                <a
                  key={s.id}
                  href={`/tracking/${s.slug}`}
                  className="flex items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-600 transition"
                >
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-xs text-zinc-400">
                    {s.total} task · {s.delayed} trễ
                  </span>
                  <span className={`text-sm font-bold ${c.text}`}>{spct}%</span>
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
