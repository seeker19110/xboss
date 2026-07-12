"use client";
import { useEffect, useState } from "react";
import {
  Layers,
  TrendingUp,
  AlertTriangle,
  Building2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { slugFromCode } from "@/lib/sheets";
import { fetchMe } from "@/app/lib/me";
import { appAlert, appConfirm } from "@/app/components/dialogs";

// Bản đồ tiến độ Tháp A — tầng × hệ (mode hiện tại) + tầng × tuần (mode lịch sử).
// Component dùng chung cho dashboard (nhúng trực tiếp) và trang /timeline (toàn màn hình).

type CurrentCell = {
  tower: string | null;
  floorLabel: string;
  sheetType: string;
  sheetSlug: string | null;
  progress: number;
  tasks: number;
  delayed: number;
};
type HistoryRow = { floorLabel: string; weekStart: string; avgProgress: number };
type TowerGroup = { name: string; sheets: string[]; floors: string[] };
type ApiData = {
  towers: TowerGroup[];
  current: CurrentCell[];
  history: HistoryRow[];
  weeks: string[];
  floors: string[];
  sheets: { code: string; slug: string | null }[];
};
type TowerRow = { id: number; name: string };

// ── Màu theo % hoàn thành — thang nhiệt đỏ → cam → vàng → lục, mỗi mốc một tông
// riêng (trước đây <20% và 20–50% cùng tông đỏ nên khó phân biệt trên bản đồ).
// Viền đỏ = có task trễ (không đổi màu nền). Hằng số dưới đây là nguồn duy nhất
// cho cả ô bảng (current/history) lẫn chú thích LEGEND — đổi ở đây là đổi toàn bộ. ──

// Mọi mức bên dưới CỐ Ý chỉ dùng -50..-200 hoặc -500..-950 (không dùng -300/-400): hai
// mã đó BỊ theme sáng ghi đè sang tông đậm để dùng làm CHỮ (xem html.light trong
// globals.css) — dùng làm NỀN sẽ đổi màu bất ngờ giữa 2 theme + có thể vỡ tương phản với
// chữ ghép cùng. Các mã còn lại không bị ghi đè nên giữ đúng tông gốc ở mọi theme:
// BG_HIGH/BG_MID/BG_LOW/BG_VLOW đều dùng nền tươi -500 (giống ảnh mẫu) + chữ tối cùng
// tông -950 (đủ tương phản, cố định không theo theme) — riêng BG_VLOW đo bằng axe không
// đạt 4.5:1 với text-red-950 (đỏ-950 đã là tông đỏ tối nhất) nên đổi sang text-neutral-950
// (gần đen, không nằm trong danh sách bị ghi đè theo theme, tương phản dư ngưỡng).
const BG_DONE = "bg-emerald-600"; // 100%
const BG_HIGH = "bg-green-500"; // 80–99%
const BG_MID = "bg-amber-500"; // 50–80%
const BG_LOW = "bg-orange-500"; // 20–50%
const BG_VLOW = "bg-red-500"; // <20%
const BG_ZERO = "bg-zinc-800"; // 0%

function bucketClass(p: number): string {
  if (p >= 0.999) return `${BG_DONE} text-on-accent`;
  if (p >= 0.8) return `${BG_HIGH} text-green-950`;
  if (p >= 0.5) return `${BG_MID} text-amber-950`;
  if (p >= 0.2) return `${BG_LOW} text-orange-950`;
  if (p > 0) return `${BG_VLOW} text-neutral-950`;
  return `${BG_ZERO} text-zinc-300`;
}
function cellClass(p: number, delayed: number): string {
  return bucketClass(p) + (delayed > 0 ? " ring-2 ring-red-500/70" : "");
}
function tbColor(avg: number): string {
  return avg >= 1 ? "text-emerald-400" : avg >= 0.5 ? "text-amber-400" : "text-zinc-400";
}

const LEGEND = [
  { cls: BG_ZERO, label: "0%" },
  { cls: BG_VLOW, label: "<20%" },
  { cls: BG_LOW, label: "20–50%" },
  { cls: BG_MID, label: "50–80%" },
  { cls: BG_HIGH, label: "80–99%" },
  { cls: BG_DONE, label: "100%" },
  { cls: "bg-zinc-800 ring-2 ring-red-500/70", label: "Trễ (viền đỏ)" },
  { cls: "bg-zinc-900 border border-dashed border-zinc-700/60", label: "Không có" },
];

function fmtWeek(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

const DEFAULT_TITLE = "Bản đồ tiến độ theo tầng";

// ── Bảng tầng × hệ của 1 tháp (mode "Hiện tại") ─────────────────────────────────

function TowerCurrentTable({
  tower,
  currentMap,
  sheetFilter,
}: {
  tower: TowerGroup;
  currentMap: Map<string, CurrentCell>;
  sheetFilter: string;
}) {
  const filteredSheets =
    sheetFilter === "all" ? tower.sheets : tower.sheets.filter((s) => s === sheetFilter);

  const floorSummary = tower.floors
    .map((floor) => {
      const cells = filteredSheets
        .map((s) => currentMap.get(`${tower.name}|${floor}|${s}`))
        .filter(Boolean) as CurrentCell[];
      const avg = cells.length ? cells.reduce((s, c) => s + c.progress, 0) / cells.length : 0;
      const delayed = cells.reduce((s, c) => s + c.delayed, 0);
      return { floor, avg, delayed, taskCount: cells.reduce((s, c) => s + c.tasks, 0) };
    })
    .filter((f) => f.taskCount > 0);

  if (floorSummary.length === 0) return null;

  return (
    <div
      className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <p className="text-[10px] text-zinc-400 mb-1 sm:hidden">← Vuốt ngang để xem đủ cột →</p>
      {/* mx-auto: bảng hẹp hơn khung thì tự căn giữa; rộng hơn thì margin về 0, cuộn ngang như cũ */}
      <table
        className="border-separate border-spacing-1 mx-auto"
        style={{ minWidth: `${80 + 56 + filteredSheets.length * 76}px` }}
      >
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-900 text-left pl-0 pr-2 py-1.5 text-xs font-semibold text-zinc-400 w-16 sm:w-20">
              Tầng
            </th>
            <th className="text-right px-2 py-1.5 text-xs font-semibold text-zinc-400 w-12 sm:w-14">
              TB
            </th>
            {filteredSheets.map((s) => (
              <th
                key={s}
                className="text-center px-1 py-1.5 text-[10px] sm:text-[11px] font-semibold text-zinc-400 w-16 sm:w-20"
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {floorSummary.map(({ floor, avg, delayed }) => (
            <tr key={floor}>
              <td className="sticky left-0 z-10 bg-zinc-900 pr-2 py-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-bold text-zinc-200 whitespace-nowrap">{floor}</span>
                  {delayed > 0 && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                </div>
              </td>
              <td className="text-right pr-2 py-0.5">
                <span className={`text-xs font-bold tabular-nums ${tbColor(avg)}`}>
                  {Math.round(avg * 100)}%
                </span>
              </td>
              {filteredSheets.map((s) => {
                const cell = currentMap.get(`${tower.name}|${floor}|${s}`);
                const p = cell?.progress ?? -1;
                const href = cell?.sheetSlug
                  ? `/tracking/${cell.sheetSlug}?floor=${encodeURIComponent(floor)}`
                  : slugFromCode(s)
                    ? `/tracking/${slugFromCode(s)}?floor=${encodeURIComponent(floor)}`
                    : "#";
                return (
                  <td key={s} className="text-center py-0.5">
                    {p < 0 ? (
                      <span
                        className="inline-flex items-center justify-center w-14 sm:w-16 h-8 rounded bg-zinc-900 border border-dashed border-zinc-800/60 text-zinc-700 text-xs select-none"
                        title={`${floor} · ${s} · không có công việc`}
                      >
                        –
                      </span>
                    ) : (
                      <a
                        href={href}
                        className={`inline-flex flex-col items-center justify-center w-14 sm:w-16 h-8 rounded text-[10px] font-bold tabular-nums transition active:opacity-60 hover:opacity-80 ${cellClass(p, cell?.delayed ?? 0)}`}
                        title={`${s} · ${floor} · ${Math.round(p * 100)}%${cell?.delayed ? ` · ${cell.delayed} trễ` : ""}`}
                      >
                        {Math.round(p * 100)}%
                        {(cell?.delayed ?? 0) > 0 && (
                          <span className="text-[9px] leading-none">{cell!.delayed} trễ</span>
                        )}
                      </a>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Component chính ──────────────────────────────────────────────────────────

export default function ProgressMap({ system = "" }: { system?: string }) {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"current" | "history">("current");
  const [sheetFilter, setSheetFilter] = useState("all");

  const [towerList, setTowerList] = useState<TowerRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  function reload() {
    setLoading(true);
    fetch(`/api/timeline${system ? `?system=${encodeURIComponent(system)}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .finally(() => setLoading(false));
    fetch("/api/towers")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setTowerList(j?.towers ?? []));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  useEffect(() => {
    fetchMe().then((u) => setCanEdit(u?.role === "admin" || u?.role === "pm"));
    fetch("/api/project")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.project?.heatmapTitle) setTitle(j.project.heatmapTitle);
      });
  }, []);

  async function saveTitle() {
    const val = titleDraft.trim();
    await fetch("/api/project", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ heatmapTitle: val || null }),
    });
    setTitle(val || DEFAULT_TITLE);
    setEditingTitle(false);
  }

  async function saveName(id: number) {
    if (!editName.trim()) {
      setEditId(null);
      return;
    }
    await fetch(`/api/towers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });
    setEditId(null);
    reload();
  }

  async function deleteTower(id: number, name: string) {
    if (
      !(await appConfirm(`Xoá tháp "${name}"? Tháp phải không còn sheet nào.`, {
        danger: true,
        confirmLabel: "Xoá",
      }))
    )
      return;
    const res = await fetch(`/api/towers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      appAlert(j.error);
      return;
    }
    reload();
  }

  async function addTower() {
    if (!newName.trim()) return;
    await fetch("/api/towers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setAdding(false);
    setNewName("");
    reload();
  }

  if (loading) return null;
  if (!data || data.floors.length === 0) return null;

  const currentMap = new Map<string, CurrentCell>();
  for (const c of data.current)
    currentMap.set(`${c.tower ?? ""}|${c.floorLabel}|${c.sheetType}`, c);

  const { history, weeks, floors, sheets } = data;
  const towers: TowerGroup[] = data.towers?.length
    ? data.towers
    : [{ name: "", sheets: sheets.map((s) => s.code), floors }];
  const multi = towers.length > 1;

  const filteredSheets =
    sheetFilter === "all" ? sheets : sheets.filter((s) => s.code === sheetFilter);

  const histMap = new Map<string, number>();
  for (const h of history)
    histMap.set(
      `${h.floorLabel}__${h.weekStart}`,
      Math.max(histMap.get(`${h.floorLabel}__${h.weekStart}`) ?? 0, h.avgProgress),
    );

  // "Nay" + cảnh báo trong mode lịch sử — gộp tất cả tháp (lịch sử tái dựng toàn dự án, không tách tháp).
  const visibleFloors = floors.filter(
    (f) =>
      history.some((h) => h.floorLabel === f) ||
      (data.current ?? []).some((c) => c.floorLabel === f),
  );

  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-4">
      {/* Tiêu đề bản đồ + quản trị tháp (Admin/PM) */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
          {editingTitle ? (
            <>
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                className="bg-zinc-800 border border-emerald-600 rounded px-2 py-0.5 text-sm font-semibold outline-none w-64"
              />
              <button onClick={saveTitle} className="text-emerald-400">
                <Check className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingTitle(false)} className="text-zinc-500">
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-sm text-zinc-300">{title}</h2>
              {canEdit && (
                <button
                  onClick={() => {
                    setTitleDraft(title === DEFAULT_TITLE ? "" : title);
                    setEditingTitle(true);
                  }}
                  title="Sửa tiêu đề"
                  className="text-zinc-600 hover:text-emerald-400 transition"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}
          {canEdit && !editingTitle && (
            <button
              onClick={() => {
                setAdding(true);
                setNewName("");
              }}
              title="Thêm tháp mới"
              className="ml-1 text-zinc-600 hover:text-emerald-400 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          Màu theo % hoàn thành · viền đỏ = có task trễ · bấm ô để mở sheet tại tầng đó
        </p>
        {adding && (
          <div className="flex items-center gap-2 mt-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addTower();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Tên tháp mới (vd: Tháp B)"
              className="bg-zinc-800 border border-emerald-600 rounded px-2 py-1 text-sm outline-none w-48"
            />
            <button onClick={addTower} className="text-emerald-400 hover:text-emerald-300">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => setAdding(false)} className="text-zinc-500 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-xl shrink-0">
          <button
            onClick={() => setMode("current")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${mode === "current" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Hiện tại</span>
            <span className="sm:hidden">Tầng×Hệ</span>
          </button>
          <button
            onClick={() => setMode("history")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${mode === "history" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Lịch sử</span>
            <span className="sm:hidden">Tầng×Tuần</span>
          </button>
        </div>

        <select
          value={sheetFilter}
          onChange={(e) => setSheetFilter(e.target.value)}
          aria-label="Lọc theo hệ"
          className="text-xs bg-zinc-950 border border-zinc-800 text-zinc-300 rounded-lg px-2 py-2 focus:outline-none min-w-0"
        >
          <option value="all">Tất cả hệ</option>
          {sheets.map((s) => (
            <option key={s.code} value={s.code}>
              {s.code}
            </option>
          ))}
        </select>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap text-[10px] sm:text-[11px] text-zinc-400">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1 shrink-0">
            <span className={`inline-block w-3 h-3 sm:w-4 sm:h-4 rounded ${l.cls}`} />
            {l.label}
          </span>
        ))}
      </div>

      {/* ══ MODE: CURRENT — tầng × hệ, nhóm theo tháp ══ */}
      {mode === "current" && (
        <>
          {towers.every((t) => t.floors.length === 0) ? (
            <div className="py-14 text-center text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Chưa có dữ liệu tầng.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {towers.map((t) => {
                const tr = towerList.find((r) => r.name === t.name);
                return (
                  <div key={t.name}>
                    {multi && (
                      <div className="mb-2 flex items-center gap-1.5">
                        {editId === tr?.id ? (
                          <>
                            <input
                              autoFocus
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveName(tr!.id);
                                if (e.key === "Escape") setEditId(null);
                              }}
                              className="bg-zinc-800 border border-emerald-600 rounded px-2 py-0.5 text-xs outline-none w-28 font-semibold"
                            />
                            <button onClick={() => saveName(tr!.id)} className="text-emerald-400">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditId(null)} className="text-zinc-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-xs font-semibold text-zinc-300">
                              {t.name || "Chưa đặt tên tháp"}
                            </span>
                            {canEdit && tr && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditId(tr.id);
                                    setEditName(tr.name);
                                  }}
                                  title="Đổi tên tháp"
                                  className="text-zinc-600 hover:text-emerald-400"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => deleteTower(tr.id, tr.name)}
                                  title="Xoá tháp"
                                  className="text-zinc-600 hover:text-red-400"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <TowerCurrentTable
                      tower={t}
                      currentMap={currentMap}
                      sheetFilter={sheetFilter}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ══ MODE: HISTORY — tầng × tuần (toàn dự án) ══ */}
      {mode === "history" && (
        <>
          {weeks.length === 0 ? (
            <div className="py-14 text-center text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl">
              <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Chưa có lịch sử tiến độ (cần ít nhất 1 tuần dữ liệu).</p>
            </div>
          ) : (
            <div
              className="overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <p className="text-[10px] text-zinc-400 mb-1 sm:hidden">
                ← Vuốt ngang để xem đủ tuần →
              </p>
              <table
                className="border-separate border-spacing-1 mx-auto"
                style={{ minWidth: `${80 + weeks.length * 40 + 52}px` }}
              >
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-zinc-900 text-left pl-0 pr-2 py-1.5 text-xs font-semibold text-zinc-400 w-16 sm:w-20">
                      Tầng
                    </th>
                    {weeks.map((w) => (
                      <th
                        key={w}
                        className="text-center px-0.5 py-1.5 text-[10px] text-zinc-400 w-8 sm:w-10"
                      >
                        {fmtWeek(w)}
                      </th>
                    ))}
                    <th className="text-center px-1 py-1.5 text-[10px] font-semibold text-zinc-300 w-10 sm:w-12 whitespace-nowrap">
                      Nay
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleFloors.map((floor) => {
                    const curCells = filteredSheets.flatMap((s) =>
                      (data.current ?? []).filter(
                        (c) => c.floorLabel === floor && c.sheetType === s.code,
                      ),
                    );
                    const curAvg = curCells.length
                      ? curCells.reduce((s, c) => s + c.progress, 0) / curCells.length
                      : 0;
                    const hasDelayed = curCells.some((c) => c.delayed > 0);

                    return (
                      <tr key={floor}>
                        <td className="sticky left-0 z-10 bg-zinc-900 pr-2 py-0.5">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-bold text-zinc-200 whitespace-nowrap">
                              {floor}
                            </span>
                            {hasDelayed && (
                              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                            )}
                          </div>
                        </td>
                        {weeks.map((w) => {
                          const p = histMap.get(`${floor}__${w}`) ?? -1;
                          return (
                            <td key={w} className="text-center py-0.5">
                              {p < 0 ? (
                                <span
                                  className="inline-flex items-center justify-center w-7 sm:w-8 h-7 sm:h-8 rounded bg-zinc-950 border border-dashed border-zinc-800/50 text-zinc-700 text-[9px] select-none"
                                  title={`${floor} · ${fmtWeek(w)} · không có dữ liệu`}
                                >
                                  –
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex items-center justify-center w-7 sm:w-8 h-7 sm:h-8 rounded text-[9px] sm:text-[10px] font-bold tabular-nums ${bucketClass(p)}`}
                                  title={`${floor} · ${fmtWeek(w)} · ${Math.round(p * 100)}%`}
                                >
                                  {Math.round(p * 100)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                        <td className="text-center py-0.5">
                          <span
                            className={`inline-flex items-center justify-center w-9 sm:w-10 h-7 sm:h-8 rounded text-[10px] font-bold tabular-nums ${bucketClass(curAvg)} ${hasDelayed ? "ring-2 ring-red-500/70" : "border border-zinc-600"}`}
                          >
                            {Math.round(curAvg * 100)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
