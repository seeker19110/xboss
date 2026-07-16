"use client";
import { useCallback, useEffect, useState } from "react";
import { BookMarked, Play, Download, Trash2, Plus, Share2, Lock, X, RefreshCw } from "lucide-react";
import { formatVnd } from "@/lib/money";
import { formatDateVN } from "@/lib/date";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import AppHeader from "@/app/components/AppHeader";
import { PageSkeleton } from "@/app/components/Skeleton";

// ── Types (khớp lib/reports.ts) ────────────────────────────────────────────────
type ColumnKind = "text" | "number" | "money" | "percent" | "date";
type Column = { key: string; label: string; kind: ColumnKind };
type FilterDef = {
  key: string;
  label: string;
  kind: "text" | "number" | "select";
  options?: { value: string; label: string }[];
};
type Source = { key: string; label: string; columns: Column[]; filters: FilterDef[] };
type SavedReport = {
  id: number;
  name: string;
  source: string;
  config: { filters?: Record<string, string | number>; sort?: { column: string; dir: string } };
  shared: boolean;
  ownerName: string | null;
  isMine: boolean;
  createdAt: string;
};
type RunResult = {
  name: string;
  columns: Column[];
  rows: Record<string, string | number | null>[];
};

const btn =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition";

function fmtCell(v: string | number | null, kind: ColumnKind): string {
  if (v == null || v === "") return "—";
  if (kind === "money") return formatVnd(Number(v));
  if (kind === "percent") return `${v}%`;
  if (kind === "date") return formatDateVN(String(v));
  return String(v);
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [creating, setCreating] = useState(false);
  const [run, setRun] = useState<{ id: number; data: RunResult } | null>(null);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/saved-reports");
    if (res.status === 401) return redirectToLogin();
    const json = await res.json();
    setReports(json.reports ?? []);
    setSources(json.sources ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return redirectToLogin();
      load();
    });
  }, [load]);

  const runReport = useCallback(async (id: number) => {
    setRunning(true);
    setRun(null);
    const res = await fetch(`/api/saved-reports/${id}/data`);
    setRunning(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Không chạy được báo cáo");
      return;
    }
    setRun({ id, data: await res.json() });
  }, []);

  const del = useCallback(
    async (id: number) => {
      if (!confirm("Xoá báo cáo đã lưu này?")) return;
      const res = await fetch(`/api/saved-reports/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return alert(j.error ?? "Không xoá được");
      }
      if (run?.id === id) setRun(null);
      load();
    },
    [load, run],
  );

  const toggleShare = useCallback(
    async (r: SavedReport) => {
      const res = await fetch(`/api/saved-reports/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shared: !r.shared }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return alert(j.error ?? "Không đổi được chia sẻ");
      }
      load();
    },
    [load],
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookMarked size={22} className="text-sky-400" />
            <h1 className="text-lg font-bold">Báo cáo lưu</h1>
          </div>
          <button
            onClick={() => setCreating(true)}
            className={`${btn} bg-sky-500/15 text-sky-300 hover:bg-sky-500/25`}
          >
            <Plus size={16} /> Tạo báo cáo
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center text-zinc-400">
            Chưa có báo cáo nào được lưu. Bấm “Tạo báo cáo” để lưu cấu hình đầu tiên.
          </div>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => {
              const src = sources.find((s) => s.key === r.source);
              return (
                <li
                  key={r.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{r.name}</span>
                      {r.shared ? (
                        <Share2
                          size={14}
                          className="text-emerald-400 shrink-0"
                          aria-label="Đã chia sẻ"
                        />
                      ) : (
                        <Lock size={14} className="text-zinc-500 shrink-0" aria-label="Riêng tư" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 truncate">
                      {src?.label ?? r.source}
                      {r.ownerName ? ` · ${r.ownerName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => runReport(r.id)}
                      className={`${btn} bg-zinc-800 text-zinc-200 hover:bg-zinc-700`}
                    >
                      <Play size={15} /> Chạy
                    </button>
                    <a
                      href={`/api/saved-reports/${r.id}/data?export=excel`}
                      className={`${btn} bg-zinc-800 text-zinc-200 hover:bg-zinc-700`}
                    >
                      <Download size={15} /> Excel
                    </a>
                    {r.isMine && (
                      <>
                        <button
                          onClick={() => toggleShare(r)}
                          className={`${btn} bg-zinc-800 text-zinc-400 hover:bg-zinc-700`}
                          title={r.shared ? "Chuyển về riêng tư" : "Chia sẻ cho mọi người"}
                        >
                          {r.shared ? <Lock size={15} /> : <Share2 size={15} />}
                        </button>
                        <button
                          onClick={() => del(r.id)}
                          className={`${btn} bg-zinc-800 text-rose-400 hover:bg-rose-500/15`}
                          title="Xoá"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Kết quả chạy */}
        {running && (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <RefreshCw size={15} className="animate-spin" /> Đang chạy báo cáo…
          </div>
        )}
        {run && <ResultTable data={run.data} />}
      </main>

      {creating && (
        <CreateModal
          sources={sources}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function ResultTable({ data }: { data: RunResult }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-800 font-semibold text-sm">
        {data.name} · {data.rows.length} dòng
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-400 border-b border-zinc-800">
              {data.columns.map((c) => (
                <th key={c.key} className="px-4 py-2 font-medium whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={data.columns.length} className="px-4 py-6 text-center text-zinc-500">
                  Không có dữ liệu khớp
                </td>
              </tr>
            ) : (
              data.rows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/60 last:border-0">
                  {data.columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-4 py-2 whitespace-nowrap ${
                        c.kind === "money" || c.kind === "number" || c.kind === "percent"
                          ? "text-right tabular-nums"
                          : ""
                      }`}
                    >
                      {fmtCell(row[c.key], c.kind)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateModal({
  sources,
  onClose,
  onCreated,
}: {
  sources: Source[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [sourceKey, setSourceKey] = useState(sources[0]?.key ?? "");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const source = sources.find((s) => s.key === sourceKey);

  const save = async () => {
    if (!name.trim()) return alert("Nhập tên báo cáo");
    setSaving(true);
    const cleanFilters: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) if (v) cleanFilters[k] = v;
    const res = await fetch("/api/saved-reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        source: sourceKey,
        config: { filters: cleanFilters },
        shared,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return alert(j.error ?? "Không lưu được báo cáo");
    }
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Tạo báo cáo lưu</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-200" aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-400">Tên báo cáo</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Công việc trễ hệ ACMV"
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-zinc-400">Nguồn dữ liệu</span>
          <select
            value={sourceKey}
            onChange={(e) => {
              setSourceKey(e.target.value);
              setFilters({});
            }}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-sky-500"
          >
            {sources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        {source?.filters.map((f) => (
          <label key={f.key} className="block space-y-1">
            <span className="text-xs font-medium text-zinc-400">{f.label}</span>
            {f.kind === "select" ? (
              <select
                value={filters[f.key] ?? ""}
                onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-sky-500"
              >
                <option value="">Tất cả</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.kind === "number" ? "number" : "text"}
                value={filters[f.key] ?? ""}
                onChange={(e) => setFilters({ ...filters, [f.key]: e.target.value })}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            )}
          </label>
        ))}

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>Chia sẻ cho mọi người trong dự án</span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className={`${btn} bg-zinc-800 text-zinc-300 hover:bg-zinc-700`}
          >
            Huỷ
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={`${btn} bg-sky-500/20 text-sky-300 hover:bg-sky-500/30 disabled:opacity-50`}
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
