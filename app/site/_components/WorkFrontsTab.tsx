"use client";
// Tab "Mặt Bằng & Phân Khu" của /site — ma trận tầng × sheet từ dữ liệu work_fronts thật
// (GET /api/work-fronts). Bấm ô → WorkFrontModal đổi trạng thái + biên bản/ảnh hiện trạng.
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, LandPlot } from "lucide-react";
import { Skeleton } from "@/app/components/Skeleton";
import EmptyState from "@/app/components/EmptyState";
import { ErrorState } from "@/app/components/ErrorState";
import { Chip } from "@/app/components/ui";
import { taiJson, taiJsonMoi } from "@/app/lib/taiDuLieu";
import { fetchMe, type Me } from "@/app/lib/me";
import { sortFloorsDesc } from "@/lib/nen/floors";
import { WORK_FRONT_STATUSES, WORK_FRONT_STATUS_LABEL } from "@/lib/tien-do/workfront-status";
import WorkFrontModal, { WORK_FRONT_STATUS_UI, type WorkFront } from "./WorkFrontModal";

type SheetInfo = { id: number; code: string; name: string };

export default function WorkFrontsTab() {
  const [fronts, setFronts] = useState<WorkFront[] | null>(null);
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  // fresh = tải lại ngay sau khi tự ghi → bỏ qua cache SW (xem taiJsonMoi).
  const load = useCallback(async (fresh = false) => {
    const [kqFronts, kqSheets, meRes] = await Promise.all([
      (fresh ? taiJsonMoi : taiJson)<{ workFronts?: WorkFront[] }>("/api/work-fronts"),
      taiJson<{ sheets?: SheetInfo[] }>("/api/sheets"),
      fetchMe(),
    ]);
    setMe(meRes);
    if (kqSheets.ok) setSheets(kqSheets.data.sheets ?? []);
    if (!kqFronts.ok) {
      setLoi(kqFronts.loi);
      return;
    }
    setLoi(null);
    setFronts(kqFronts.data.workFronts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Cột = các sheet có ô mặt bằng, theo thứ tự sheet của /api/sheets (sheet lạ xếp cuối).
  const { floors, columns, byCell, counts } = useMemo(() => {
    const list = fronts ?? [];
    const order = new Map(sheets.map((s, i) => [s.id, i]));
    const colMap = new Map<number, { id: number; code: string; name: string }>();
    const cell = new Map<string, WorkFront>();
    const cnt = Object.fromEntries(WORK_FRONT_STATUSES.map((s) => [s, 0])) as Record<
      WorkFront["status"],
      number
    >;
    for (const f of list) {
      if (!colMap.has(f.sheetTypeId)) {
        const s = sheets.find((x) => x.id === f.sheetTypeId);
        colMap.set(f.sheetTypeId, { id: f.sheetTypeId, code: f.sheetCode, name: s?.name ?? "" });
      }
      cell.set(`${f.floorLabel}|${f.sheetTypeId}`, f);
      cnt[f.status] += 1;
    }
    const cols = [...colMap.values()].sort(
      (a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity),
    );
    const fl = [...new Set(list.map((f) => f.floorLabel))].sort(sortFloorsDesc);
    return { floors: fl, columns: cols, byCell: cell, counts: cnt };
  }, [fronts, sheets]);

  const openFront = fronts?.find((f) => f.id === openId) ?? null;

  if (loi) return <ErrorState message={loi} onRetry={() => void load(true)} />;
  if (fronts === null)
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <LandPlot className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            Mặt bằng thi công theo tầng × sheet
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Trạng thái bàn giao mặt bằng từng tầng cho từng hệ — bấm ô để cập nhật và đính kèm biên
            bản/ảnh hiện trạng.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {WORK_FRONT_STATUSES.map((s) => (
            <Chip key={s} tone={WORK_FRONT_STATUS_UI[s].tone} icon={WORK_FRONT_STATUS_UI[s].icon}>
              {WORK_FRONT_STATUS_LABEL[s]}: {counts[s]}
            </Chip>
          ))}
        </div>
      </div>

      {fronts.length === 0 ? (
        <EmptyState
          icon={LandPlot}
          message="Chưa có ô mặt bằng — ô được tạo tự động từ tầng của lưới tracking"
        />
      ) : (
        <div className="relative overflow-x-auto max-h-[70vh] rounded-xl border border-zinc-800 bg-zinc-950/70">
          <table className="text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 bg-zinc-900 px-3 py-2 text-left font-semibold text-zinc-300 border-b border-zinc-800">
                  Tầng
                </th>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    title={c.name || undefined}
                    className="sticky top-0 z-10 bg-zinc-900 px-2 py-2 font-mono font-semibold text-zinc-300 border-b border-zinc-800 whitespace-nowrap"
                  >
                    {c.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {floors.map((fl) => (
                <tr key={fl}>
                  <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-1 text-left font-mono font-semibold text-zinc-200 border-b border-zinc-800 whitespace-nowrap">
                    {fl}
                  </th>
                  {columns.map((c) => {
                    const f = byCell.get(`${fl}|${c.id}`);
                    if (!f)
                      return (
                        <td
                          key={c.id}
                          className="px-1 py-1 border-b border-zinc-800 text-center text-zinc-600"
                        >
                          —
                        </td>
                      );
                    const ui = WORK_FRONT_STATUS_UI[f.status];
                    const Icon = ui.icon;
                    return (
                      <td key={c.id} className="px-1 py-1 border-b border-zinc-800">
                        <button
                          type="button"
                          onClick={() => setOpenId(f.id)}
                          title={f.blocker ? `Vướng mắc: ${f.blocker}` : undefined}
                          aria-label={`${c.code} tầng ${fl}: ${WORK_FRONT_STATUS_LABEL[f.status]}${
                            f.blocker ? ` — vướng mắc: ${f.blocker}` : ""
                          }`}
                          className={`min-h-10 min-w-24 w-full inline-flex items-center justify-center gap-1 px-2 rounded-lg border font-medium transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${ui.cell}`}
                        >
                          <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span className="whitespace-nowrap">{ui.short}</span>
                          {f.blocker && (
                            <AlertTriangle
                              className="w-3.5 h-3.5 shrink-0 text-rose-400"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openFront && (
        <WorkFrontModal
          key={openFront.id}
          front={openFront}
          me={me}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setOpenId(null);
            void load(true);
          }}
        />
      )}
    </div>
  );
}
