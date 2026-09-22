"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ChevronDown, ChevronRight, Search, FileUp, FileSpreadsheet } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { ErrorState } from "@/app/components/ErrorState";
import { taiJson } from "@/app/lib/taiDuLieu";
import { appAlert, appConfirm } from "@/app/components/dialogs";
import { fetchMe, type Me } from "@/app/lib/me";
import { boDauThuong } from "@/lib/nen/van-ban";
import AddBoqModal from "./_components/AddBoqModal";
import ImportBoqModal from "./_components/ImportBoqModal";
import BoqDetailModal from "./_components/BoqDetailModal";
import DoPhuBoqCard from "./_components/DoPhuBoqCard";
import {
  fmtVND,
  fmtQty,
  fetchFresh,
  NGUONG_LECH_WEIGHT,
  VO_STATUS_LABEL,
  type BoqItem,
  type SystemOption,
} from "./_components/types";

type LocOption = "all" | "chua-map" | "lech";
type SapOption = "boq" | "gia-tri" | "thuc-hien";

export default function BoqPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<BoqItem[]>([]);
  const [totals, setTotals] = useState({ contractValue: 0, subValue: 0, executedValue: 0 });
  const [systems, setSystems] = useState<SystemOption[]>([]);
  const [loading, setLoading] = useState(true);
  // Lỗi tải ≠ rỗng (audit 2026-09-05).
  const [loi, setLoi] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BoqItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [includeVo, setIncludeVo] = useState(true);

  // Thanh công cụ tìm/lọc/sắp xếp (M124 việc 2) — đồng bộ 2 chiều với URL `?q=&loc=&sap=`.
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState<LocOption>("all");
  const [sap, setSap] = useState<SapOption>("boq");

  const canManage = me?.role === "admin" || me?.role === "pm";

  type BoqData = { items?: BoqItem[]; totals?: typeof totals };

  async function load(withVo: boolean, fresh = false) {
    const url = `/api/boq?includeVo=${withVo ? 1 : 0}`;
    // fetchFresh bỏ qua cache của service worker (dữ liệu vừa sửa) — giữ nguyên đường cũ.
    if (fresh) {
      try {
        const r = await fetchFresh(url);
        if (!r.ok) return { ok: false as const, loi: `Không tải được BOQ (lỗi ${r.status})` };
        return { ok: true as const, data: (await r.json()) as BoqData };
      } catch {
        return { ok: false as const, loi: "Mất kết nối — kiểm tra mạng rồi thử lại" };
      }
    }
    const kq = await taiJson<BoqData>(url);
    return kq.ok ? { ok: true as const, data: kq.data } : { ok: false as const, loi: kq.loi };
  }

  const taiLai = useCallback(async () => {
    setLoading(true);
    setLoi(null);
    const [meData, boq, sys] = await Promise.all([
      fetchMe(),
      load(includeVo),
      taiJson<{ systems?: SystemOption[] }>("/api/systems"),
    ]);
    if (meData) setMe(meData);
    if (!boq.ok) {
      setLoi(boq.loi);
      setLoading(false);
      return;
    }
    setItems(boq.data.items ?? []);
    setTotals(boq.data.totals ?? { contractValue: 0, subValue: 0, executedValue: 0 });
    // Danh sách hệ chỉ để lọc — hỏng thì vẫn xem được BOQ, không chặn cả trang.
    if (sys.ok) setSystems(sys.data.systems ?? []);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeVo]);

  useEffect(() => {
    void taiLai();
  }, [taiLai]);

  // Đọc `?q=&loc=&sap=` lúc mount để link chia sẻ/quay lại trang giữ đúng bộ lọc đang xem.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get("q");
    const locParam = params.get("loc");
    const sapParam = params.get("sap");
    if (qParam) setQ(qParam);
    if (locParam === "chua-map" || locParam === "lech") setLoc(locParam);
    if (sapParam === "gia-tri" || sapParam === "thuc-hien") setSap(sapParam);
  }, []);

  // Ghi lại bộ lọc hiện tại vào URL (không reload) mỗi khi q/loc/sap đổi.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (q.trim()) url.searchParams.set("q", q.trim());
      else url.searchParams.delete("q");
      if (loc !== "all") url.searchParams.set("loc", loc);
      else url.searchParams.delete("loc");
      if (sap !== "boq") url.searchParams.set("sap", sap);
      else url.searchParams.delete("sap");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* URL không hợp lệ — bỏ qua */
    }
  }, [q, loc, sap]);

  async function refresh() {
    const kq = await load(includeVo, true);
    if (!kq.ok) {
      appAlert(kq.loi);
      return;
    }
    const boq = kq.data;
    setItems(boq?.items ?? []);
    setTotals(boq?.totals ?? { contractValue: 0, subValue: 0, executedValue: 0 });
    setSelected((sel) =>
      sel ? ((boq?.items ?? []).find((i: BoqItem) => i.id === sel.id) ?? null) : null,
    );
  }

  // Lọc + sắp xếp client-side trên `items` đã tải (API GET không đổi, M124 việc 2).
  const filteredSortedItems = useMemo(() => {
    const term = boDauThuong(q);
    let list = items;
    if (term) {
      list = list.filter(
        (it) => boDauThuong(it.code).includes(term) || boDauThuong(it.name).includes(term),
      );
    }
    if (loc === "chua-map") {
      list = list.filter((it) => it.map.length === 0);
    } else if (loc === "lech") {
      list = list.filter((it) => {
        const sumWeight = it.map.reduce((s, m) => s + Number(m.weight || 0), 0);
        return Math.abs(sumWeight - 1) > NGUONG_LECH_WEIGHT;
      });
    }
    const sorted = [...list];
    if (sap === "gia-tri") {
      sorted.sort((a, b) => b.qtyContract * b.unitPrice - a.qtyContract * a.unitPrice);
    } else if (sap === "thuc-hien") {
      sorted.sort((a, b) => {
        const pa = a.qtyContract > 0 ? a.executedQty / a.qtyContract : 0;
        const pb = b.qtyContract > 0 ? b.executedQty / b.qtyContract : 0;
        return pb - pa;
      });
    }
    // "boq" (mặc định) giữ nguyên thứ tự API đã trả (bi.sort_order, bi.id).
    return sorted;
  }, [items, q, loc, sap]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: BoqItem[] }>();
    for (const it of filteredSortedItems) {
      const key = it.systemCode ?? "__none";
      const label = it.systemName ?? "Chưa gán hệ";
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(it);
    }
    return [...map.entries()].map(([key, g]) => ({ key, ...g }));
  }, [filteredSortedItems]);

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function deleteItem(item: BoqItem) {
    if (
      !(await appConfirm(`Xoá dòng BOQ "${item.code}"? Map task đi kèm sẽ bị xoá.`, {
        danger: true,
        confirmLabel: "Xoá",
      }))
    )
      return;
    const res = await fetch(`/api/boq/${item.id}`, { method: "DELETE" });
    if (!res.ok) {
      appAlert((await res.json().catch(() => null))?.error ?? "Xoá thất bại");
      return;
    }
    if (selected?.id === item.id) setSelected(null);
    refresh();
  }

  if (loading) return <PageSkeleton />;
  if (loi) return <ErrorState message={loi} onRetry={() => void taiLai()} />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="BOQ"
        subtitle="Khối lượng nhận thầu · giao thầu · thực hiện"
        bottomActions={
          <div className="flex items-center gap-2">
            <a
              href="/api/boq/export"
              download
              aria-label="Xuất Excel danh sách BOQ"
              className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />{" "}
              <span className="hidden sm:inline">Xuất Excel</span>
            </a>
            {canManage && (
              <>
                <button
                  onClick={() => setImportOpen(true)}
                  aria-label="Import Excel BOQ"
                  className="flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
                >
                  <FileUp className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Import Excel</span>
                </button>
                <button
                  onClick={() => setAddOpen(true)}
                  aria-label="Thêm dòng BOQ"
                  className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0 text-on-accent"
                >
                  <Plus className="w-4 h-4" />{" "}
                  <span className="hidden sm:inline">Thêm dòng BOQ</span>
                </button>
              </>
            )}
          </div>
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-6 max-w-screen-2xl mx-auto">
        {/* KPI Bento Summary Cards */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bento-card p-4 flex flex-col justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Giá trị hợp đồng nhận thầu
              </span>
              <p className="text-2xl font-bold font-mono tabular-nums text-zinc-100 mt-2">
                {fmtVND(totals.contractValue)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">Khối lượng BOQ gốc + VO duyệt</p>
            </div>

            <div className="bento-card p-4 flex flex-col justify-between">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                Giá trị giao thầu phụ
              </span>
              <p className="text-2xl font-bold font-mono tabular-nums text-sky-400 mt-2">
                {fmtVND(totals.subValue)}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">Phân bổ tổ đội thi công</p>
            </div>

            <div className="bento-card p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                  Giá trị thực hiện lũy kế
                </span>
                <span className="text-xs font-bold font-mono text-emerald-400">
                  {totals.contractValue > 0
                    ? `${Math.round((totals.executedValue / totals.contractValue) * 100)}%`
                    : "0%"}
                </span>
              </div>
              <p className="text-2xl font-bold font-mono tabular-nums text-emerald-400 mt-2">
                {fmtVND(totals.executedValue)}
              </p>
              <div className="w-full bg-zinc-900 rounded-full h-1.5 overflow-hidden mt-2 border border-zinc-800">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all"
                  style={{
                    width: `${totals.contractValue > 0 ? Math.min(100, Math.round((totals.executedValue / totals.contractValue) * 100)) : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {items.length > 0 && <DoPhuBoqCard />}

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeVo}
              onChange={(e) => setIncludeVo(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-900 text-emerald-600 focus:ring-emerald-500"
            />
            Gồm phát sinh (VO)
          </label>
          <span className="text-xs text-zinc-500 font-mono">
            {filteredSortedItems.length}/{items.length} hạng mục
          </span>
        </div>

        {items.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm theo mã hoặc tên (không dấu)…"
                aria-label="Tìm dòng BOQ theo mã hoặc tên"
                className="w-full min-h-10 bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 text-sm text-white placeholder:text-zinc-500"
              />
            </div>
            <select
              value={loc}
              onChange={(e) => setLoc(e.target.value as LocOption)}
              aria-label="Lọc dòng BOQ"
              className="min-h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm text-white sm:w-56"
            >
              <option value="all">Tất cả</option>
              <option value="chua-map">Chưa map</option>
              <option value="lech">Σ tỷ trọng lệch</option>
            </select>
            <select
              value={sap}
              onChange={(e) => setSap(e.target.value as SapOption)}
              aria-label="Sắp xếp dòng BOQ"
              className="min-h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 text-sm text-white sm:w-56"
            >
              <option value="boq">Thứ tự BOQ</option>
              <option value="gia-tri">Giá trị HĐ ↓</option>
              <option value="thuc-hien">% thực hiện ↓</option>
            </select>
          </div>
        )}

        {items.length === 0 ? (
          <EmptyState
            title="Chưa có dòng BOQ nào"
            message={canManage ? 'Bấm "Thêm dòng BOQ" để bắt đầu.' : "Chưa có dữ liệu khối lượng."}
          />
        ) : filteredSortedItems.length === 0 ? (
          <EmptyState
            title="Không tìm thấy dòng BOQ nào khớp"
            message="Thử đổi từ khoá tìm hoặc bộ lọc đang chọn."
          />
        ) : (
          <div className="bento-card overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Bảng BOQ">
              <table className="w-full text-sm sm:min-w-[720px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">MÃ</th>
                    <th className="text-left p-3">TÊN</th>
                    <th className="text-left p-3 hidden sm:table-cell">ĐVT</th>
                    <th className="text-right p-3 hidden sm:table-cell">KL HĐ</th>
                    <th className="text-right p-3 hidden sm:table-cell">ĐƠN GIÁ</th>
                    <th className="text-right p-3 hidden sm:table-cell">THÀNH TIỀN</th>
                    <th className="text-right p-3 hidden sm:table-cell">KL GIAO THẦU</th>
                    <th className="text-left p-3">KL THỰC HIỆN</th>
                    <th className="text-right p-3 hidden sm:table-cell">CHÊNH LỆCH</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const isCollapsed = collapsed.has(g.key);
                    return (
                      <Fragment key={g.key}>
                        <tr className="bg-zinc-950/60">
                          <td colSpan={9} className="p-0">
                            <button
                              onClick={() => toggleGroup(g.key)}
                              aria-expanded={!isCollapsed}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:text-white transition"
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                              )}
                              {g.label} ({g.items.length})
                            </button>
                          </td>
                        </tr>
                        {!isCollapsed &&
                          g.items.map((it) => {
                            const executedPct =
                              it.qtyContract > 0
                                ? Math.round((it.executedQty / it.qtyContract) * 100)
                                : 0;
                            const remaining = it.qtyContract - it.executedQty;
                            return (
                              <tr
                                key={it.id}
                                onClick={() => setSelected(it)}
                                className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                              >
                                <td className="p-3 font-mono text-xs">
                                  {it.code}
                                  {it.voId != null && (
                                    <span
                                      title={`Phát sinh ${it.voCode ?? ""} — ${VO_STATUS_LABEL[it.voStatus ?? ""] ?? it.voStatus}`}
                                      className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-violet-900 text-violet-200 text-[10px] font-sans align-middle"
                                    >
                                      VO
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">{it.name}</td>
                                <td className="p-3 hidden sm:table-cell text-zinc-300">
                                  {it.unit}
                                </td>
                                <td className="p-3 hidden sm:table-cell text-right">
                                  {fmtQty(it.qtyContract)}
                                </td>
                                <td className="p-3 hidden sm:table-cell text-right">
                                  {fmtVND(it.unitPrice)}
                                </td>
                                <td className="p-3 hidden sm:table-cell text-right font-medium">
                                  {fmtVND(it.qtyContract * it.unitPrice)}
                                </td>
                                <td className="p-3 hidden sm:table-cell text-right">
                                  {fmtQty(it.qtySub)}
                                </td>
                                <td className="p-3 min-w-[120px]">
                                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                    <div
                                      className="h-full bg-sky-400"
                                      style={{ width: `${Math.min(100, executedPct)}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-zinc-400 mt-1">
                                    {fmtQty(it.executedQty)} {it.unit} ({executedPct}%)
                                  </p>
                                </td>
                                <td
                                  className={`p-3 hidden sm:table-cell text-right ${remaining > 0 ? "text-amber-300" : "text-emerald-300"}`}
                                >
                                  {fmtQty(remaining)}
                                </td>
                              </tr>
                            );
                          })}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 bg-zinc-900 border-t border-zinc-700">
                  <tr className="text-sm font-semibold">
                    <td className="p-3" colSpan={5}>
                      Tổng
                    </td>
                    <td className="p-3 hidden sm:table-cell text-right">
                      {fmtVND(totals.contractValue)}
                    </td>
                    <td className="p-3 hidden sm:table-cell"></td>
                    <td className="p-3">{fmtVND(totals.executedValue)}</td>
                    <td className="p-3 hidden sm:table-cell"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>

      {selected && (
        <BoqDetailModal
          item={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onSaved={refresh}
          onDelete={() => deleteItem(selected)}
        />
      )}
      {addOpen && (
        <AddBoqModal
          systems={systems}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
      {importOpen && (
        <ImportBoqModal
          systems={systems}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
