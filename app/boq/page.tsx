"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Plus, ChevronDown, ChevronRight, X, Search, Trash2, AlertTriangle } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal, appAlert, appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";

type NormResourceType = "material" | "labor" | "equipment";
const NORM_RESOURCE_TYPE_LABEL: Record<NormResourceType, string> = {
  material: "Vật tư",
  labor: "Nhân công",
  equipment: "Máy",
};

type MapEntry = {
  taskId: number;
  taskCode: string;
  taskName: string;
  weight: number;
  progressPercent: number;
};
type BoqItem = {
  id: number;
  code: string;
  name: string;
  unit: string;
  disciplineId: number | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  disciplineColor: string | null;
  qtyContract: number;
  unitPrice: number;
  qtySub: number;
  subUnitPrice: number;
  note: string | null;
  sortOrder: number;
  voId: number | null;
  voCode: string | null;
  voStatus: string | null;
  qtyApproved: number | null;
  map: MapEntry[];
  executedQty: number;
};

const VO_STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  submitted: "Đã trình",
  approved: "Được duyệt",
  partially_approved: "Duyệt một phần",
  rejected: "Từ chối",
  contract_added: "Đã vào phụ lục HĐ",
};
type Discipline = { id: number; code: string; name: string };
type TaskHit = { id: number; code: string; name: string; sheetType: string };

function fmtVND(n: number) {
  if (!n) return "—";
  return Math.round(n).toLocaleString("vi-VN") + " đ";
}
function fmtQty(n: number) {
  return n.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

export default function BoqPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<BoqItem[]>([]);
  const [totals, setTotals] = useState({ contractValue: 0, subValue: 0, executedValue: 0 });
  const [disciplines, setDisciplines] = useState<Discipline[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<BoqItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [includeVo, setIncludeVo] = useState(true);

  const canManage = me?.role === "admin" || me?.role === "pm";

  function load(withVo: boolean) {
    return fetch(`/api/boq?includeVo=${withVo ? 1 : 0}`).then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([
      fetchMe(),
      load(includeVo),
      fetch("/api/disciplines").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, boq, disc]) => {
        if (!meData) return;
        setMe(meData);
        setItems(boq?.items ?? []);
        setTotals(boq?.totals ?? { contractValue: 0, subValue: 0, executedValue: 0 });
        setDisciplines(disc?.disciplines ?? []);
      })
      .finally(() => setLoading(false));
  }, [includeVo]);

  async function refresh() {
    const boq = await load(includeVo);
    setItems(boq?.items ?? []);
    setTotals(boq?.totals ?? { contractValue: 0, subValue: 0, executedValue: 0 });
    setSelected((sel) =>
      sel ? ((boq?.items ?? []).find((i: BoqItem) => i.id === sel.id) ?? null) : null,
    );
  }

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: BoqItem[] }>();
    for (const it of items) {
      const key = it.disciplineCode ?? "__none";
      const label = it.disciplineName ?? "Chưa gán hệ";
      if (!map.has(key)) map.set(key, { label, items: [] });
      map.get(key)!.items.push(it);
    }
    return [...map.entries()].map(([key, g]) => ({ key, ...g }));
  }, [items]);

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="BOQ"
        subtitle="Khối lượng nhận thầu · giao thầu · thực hiện"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm dòng BOQ"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm dòng BOQ</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <label className="inline-flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={includeVo}
            onChange={(e) => setIncludeVo(e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          Gồm phát sinh (VO)
        </label>
        {items.length === 0 ? (
          <EmptyState
            title="Chưa có dòng BOQ nào"
            message={canManage ? 'Bấm "Thêm dòng BOQ" để bắt đầu.' : "Chưa có dữ liệu khối lượng."}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
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
                                      className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-300 text-[10px] font-sans align-middle"
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
          disciplines={disciplines}
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddBoqModal({
  disciplines,
  onClose,
  onCreated,
}: {
  disciplines: Discipline[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [disciplineId, setDisciplineId] = useState<number | "">("");
  const [qtyContract, setQtyContract] = useState("0");
  const [unitPrice, setUnitPrice] = useState("0");
  const [qtySub, setQtySub] = useState("0");
  const [subUnitPrice, setSubUnitPrice] = useState("0");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/boq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          unit: unit.trim(),
          disciplineId: disciplineId || undefined,
          qtyContract: Number(qtyContract) || 0,
          unitPrice: Number(unitPrice) || 0,
          qtySub: Number(qtySub) || 0,
          subUnitPrice: Number(subUnitPrice) || 0,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được dòng BOQ");
        return;
      }
      onCreated();
    } catch {
      setErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm dòng BOQ</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400 col-span-1">
            Mã BOQ
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-1">
            Đơn vị tính
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Tên hạng mục
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Hệ
            <select
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value ? Number(e.target.value) : "")}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">— Chưa gán —</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-400">
            KL nhận thầu
            <input
              type="number"
              value={qtyContract}
              onChange={(e) => setQtyContract(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn giá
            <input
              type="number"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            KL giao thầu phụ
            <input
              type="number"
              value={qtySub}
              onChange={(e) => setQtySub(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Đơn giá giao thầu phụ
            <input
              type="number"
              value={subUnitPrice}
              onChange={(e) => setSubUnitPrice(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !code.trim() || !name.trim() || !unit.trim()}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo dòng BOQ"}
        </button>
      </div>
    </Modal>
  );
}

function BoqDetailModal({
  item,
  canManage,
  onClose,
  onSaved,
  onDelete,
}: {
  item: BoqItem;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [qtyContract, setQtyContract] = useState(String(item.qtyContract));
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice));
  const [qtySub, setQtySub] = useState(String(item.qtySub));
  const [subUnitPrice, setSubUnitPrice] = useState(String(item.subUnitPrice));
  const [savingFields, setSavingFields] = useState(false);
  const [fieldsErr, setFieldsErr] = useState("");

  const [mapEntries, setMapEntries] = useState<
    { taskId: number; taskCode: string; taskName: string; weight: number }[]
  >(
    item.map.map((m) => ({
      taskId: m.taskId,
      taskCode: m.taskCode,
      taskName: m.taskName,
      weight: m.weight,
    })),
  );
  const [savingMap, setSavingMap] = useState(false);
  const [mapMsg, setMapMsg] = useState<{ text: string; warn: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<TaskHit[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          const taskHits = (j?.hits ?? []).filter((h: { kind: string }) => h.kind === "task");
          setHits(taskHits);
        })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const sumWeight = mapEntries.reduce((s, e) => s + (Number(e.weight) || 0), 0);

  async function saveFields() {
    setSavingFields(true);
    setFieldsErr("");
    try {
      const res = await fetch(`/api/boq/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qtyContract: Number(qtyContract) || 0,
          unitPrice: Number(unitPrice) || 0,
          qtySub: Number(qtySub) || 0,
          subUnitPrice: Number(subUnitPrice) || 0,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setFieldsErr(j?.error ?? "Lưu thất bại");
        return;
      }
      onSaved();
    } catch {
      setFieldsErr("Mất kết nối — kiểm tra mạng rồi thử lại");
    } finally {
      setSavingFields(false);
    }
  }

  function addTask(t: TaskHit) {
    if (mapEntries.some((e) => e.taskId === t.id)) return;
    setMapEntries((prev) => [
      ...prev,
      { taskId: t.id, taskCode: t.code, taskName: t.name, weight: 1 },
    ]);
    setQ("");
    setHits([]);
  }
  function removeTask(taskId: number) {
    setMapEntries((prev) => prev.filter((e) => e.taskId !== taskId));
  }
  function splitEvenly() {
    if (mapEntries.length === 0) return;
    const w = 1 / mapEntries.length;
    setMapEntries((prev) => prev.map((e) => ({ ...e, weight: w })));
  }

  async function saveMap() {
    setSavingMap(true);
    setMapMsg(null);
    try {
      const res = await fetch(`/api/boq/${item.id}/map`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          map: mapEntries.map((e) => ({ taskId: e.taskId, weight: Number(e.weight) || 0 })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setMapMsg({ text: j?.error ?? "Lưu map thất bại", warn: true });
        return;
      }
      setMapMsg(
        j.warning ? { text: j.warning, warn: true } : { text: "Đã lưu map task.", warn: false },
      );
      onSaved();
    } catch {
      setMapMsg({ text: "Mất kết nối — kiểm tra mạng rồi thử lại", warn: true });
    } finally {
      setSavingMap(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <div className="p-5 space-y-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{item.code}</h2>
            <p className="text-sm text-zinc-300">{item.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <button
                onClick={onDelete}
                aria-label={`Xoá dòng BOQ ${item.code}`}
                className="text-zinc-400 hover:text-rose-300"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {canManage && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Sửa nhanh
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-zinc-400">
                KL nhận thầu
                <input
                  type="number"
                  value={qtyContract}
                  onChange={(e) => setQtyContract(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-zinc-400">
                Đơn giá
                <input
                  type="number"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-zinc-400">
                KL giao thầu phụ
                <input
                  type="number"
                  value={qtySub}
                  onChange={(e) => setQtySub(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="text-xs text-zinc-400">
                Đơn giá giao thầu phụ
                <input
                  type="number"
                  value={subUnitPrice}
                  onChange={(e) => setSubUnitPrice(e.target.value)}
                  className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            {fieldsErr && <p className="text-sm text-rose-300">{fieldsErr}</p>}
            <button
              onClick={saveFields}
              disabled={savingFields}
              className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {savingFields ? "Đang lưu…" : "Lưu"}
            </button>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Map task ({mapEntries.length}) — tổng weight {sumWeight.toFixed(4)}
          </h3>

          {mapEntries.length > 0 && (
            <ul className="space-y-1.5">
              {mapEntries.map((e) => (
                <li key={e.taskId} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-sm">
                    <span className="font-mono text-xs text-zinc-400">{e.taskCode}</span>{" "}
                    {e.taskName}
                  </span>
                  {canManage ? (
                    <input
                      type="number"
                      step="0.01"
                      value={e.weight}
                      onChange={(ev) =>
                        setMapEntries((prev) =>
                          prev.map((m) =>
                            m.taskId === e.taskId ? { ...m, weight: Number(ev.target.value) } : m,
                          ),
                        )
                      }
                      className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white text-right"
                    />
                  ) : (
                    <span className="text-xs text-zinc-400">{e.weight}</span>
                  )}
                  {canManage && (
                    <button
                      onClick={() => removeTask(e.taskId)}
                      aria-label={`Bỏ task ${e.taskCode} khỏi map`}
                      className="text-zinc-500 hover:text-rose-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm task theo mã/tên để thêm vào map…"
                    aria-label="Tìm task để thêm vào map"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white"
                  />
                </div>
                {mapEntries.length > 1 && (
                  <button
                    onClick={splitEvenly}
                    className="text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg shrink-0"
                  >
                    Chia đều
                  </button>
                )}
              </div>
              {hits.length > 0 && (
                <ul className="border border-zinc-700 rounded-lg divide-y divide-zinc-800 max-h-40 overflow-y-auto">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        onClick={() => addTask(h)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          <span className="font-mono text-xs text-zinc-400">{h.code}</span> {h.name}
                        </span>
                        <span className="text-xs text-zinc-500 shrink-0">{h.sheetType}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {mapMsg && (
                <p className={`text-sm ${mapMsg.warn ? "text-amber-300" : "text-emerald-300"}`}>
                  {mapMsg.text}
                </p>
              )}
              <button
                onClick={saveMap}
                disabled={savingMap}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
              >
                {savingMap ? "Đang lưu…" : "Lưu map"}
              </button>
            </>
          )}
        </section>

        <NormsSection boqItemId={item.id} canManage={canManage} />
      </div>
    </Modal>
  );
}

type NormRow = {
  id: number;
  resourceType: NormResourceType;
  materialId: number | null;
  materialName: string | null;
  resourceName: string | null;
  qtyPerUnit: number;
  unitLabel: string;
};
type NormUsage = {
  normId: number;
  resourceType: NormResourceType;
  resourceLabel: string;
  unitLabel: string;
  expected: number;
  actual: number | null;
  variancePct: number | null;
};
type MaterialOption = { id: number; name: string };

// Tab "Định mức" (M18): định mức vật tư/nhân công/máy của dòng BOQ + đối chiếu tiêu hao
// thực tế. Xem docs/nang-cap/M18-dinh-muc.md.
function NormsSection({ boqItemId, canManage }: { boqItemId: number; canManage: boolean }) {
  const [norms, setNorms] = useState<NormRow[]>([]);
  const [usage, setUsage] = useState<NormUsage[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [resourceType, setResourceType] = useState<NormResourceType>("material");
  const [materialName, setMaterialName] = useState("");
  const [resourceName, setResourceName] = useState("");
  const [qtyPerUnit, setQtyPerUnit] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    Promise.all([
      fetch(`/api/boq/${boqItemId}/norms`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/boq/${boqItemId}/norm-usage`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([n, u]) => {
      setNorms(n?.norms ?? []);
      setUsage(u?.usage ?? []);
    });
  }

  useEffect(() => {
    load();
    if (canManage)
      fetch("/api/materials")
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setMaterials(j?.materials ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boqItemId]);

  function usageFor(normId: number): NormUsage | undefined {
    return usage.find((u) => u.normId === normId);
  }

  async function addNorm() {
    const material = materials.find((m) => m.name === materialName);
    if (resourceType === "material" && !material) {
      showToast("Chọn vật tư hợp lệ từ danh sách", "error");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/boq/${boqItemId}/norms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceType,
        materialId: resourceType === "material" ? material!.id : null,
        resourceName: resourceType === "material" ? null : resourceName.trim() || null,
        qtyPerUnit: Number(qtyPerUnit) || 0,
        unitLabel: unitLabel.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Thêm định mức thất bại", "error");
      return;
    }
    setMaterialName("");
    setResourceName("");
    setQtyPerUnit("");
    setUnitLabel("");
    load();
  }

  async function removeNorm(id: number) {
    if (!(await appConfirm("Xoá định mức này?", { danger: true, confirmLabel: "Xoá" }))) return;
    const res = await fetch(`/api/boq-norms/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    load();
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Định mức ({norms.length})
      </h3>

      {norms.length > 0 ? (
        <ul className="space-y-1.5">
          {norms.map((n) => {
            const u = usageFor(n.id);
            const over = u?.variancePct != null && u.variancePct > 20;
            const label = n.resourceType === "material" ? n.materialName : n.resourceName;
            return (
              <li key={n.id} className="border-b border-zinc-800/60 last:border-0 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 w-16 shrink-0">
                    {NORM_RESOURCE_TYPE_LABEL[n.resourceType]}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm">{label}</span>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {n.qtyPerUnit} {n.unitLabel}/ĐVT
                  </span>
                  {canManage && (
                    <button
                      onClick={() => removeNorm(n.id)}
                      aria-label={`Xoá định mức ${label}`}
                      className="text-zinc-500 hover:text-rose-300 shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {u && u.actual != null && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${over ? "bg-rose-500" : "bg-emerald-500"}`}
                        style={{
                          width: `${Math.min(100, u.expected > 0 ? (u.actual / u.expected) * 100 : 0)}%`,
                        }}
                      />
                    </div>
                    <span
                      className={`text-xs shrink-0 ${over ? "text-rose-300" : "text-zinc-400"}`}
                    >
                      {over && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                      {u.actual.toFixed(1)}/{u.expected.toFixed(1)} {u.unitLabel}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-zinc-500">Chưa có định mức.</p>
      )}

      {canManage && (
        <div className="space-y-2 bg-zinc-800/60 rounded-lg p-3">
          <select
            value={resourceType}
            onChange={(e) => setResourceType(e.target.value as NormResourceType)}
            aria-label="Loại nguồn lực"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
          >
            {(Object.keys(NORM_RESOURCE_TYPE_LABEL) as NormResourceType[]).map((t) => (
              <option key={t} value={t}>
                {NORM_RESOURCE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {resourceType === "material" ? (
            <>
              <input
                value={materialName}
                onChange={(e) => setMaterialName(e.target.value)}
                list="norm-material-list"
                placeholder="Chọn vật tư…"
                aria-label="Vật tư"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              <datalist id="norm-material-list">
                {materials.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
            </>
          ) : (
            <input
              value={resourceName}
              onChange={(e) => setResourceName(e.target.value)}
              placeholder={resourceType === "labor" ? "Thợ hàn, thợ điện…" : "Máy khoan, cẩu tháp…"}
              aria-label="Tên nguồn lực"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.0001"
              value={qtyPerUnit}
              onChange={(e) => setQtyPerUnit(e.target.value)}
              placeholder="Định mức/ĐVT"
              aria-label="Định mức trên 1 đơn vị"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
            />
            <input
              value={unitLabel}
              onChange={(e) => setUnitLabel(e.target.value)}
              placeholder="Đơn vị (kg, công, ca máy…)"
              aria-label="Đơn vị định mức"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
            />
          </div>
          <button
            onClick={addNorm}
            disabled={saving || !qtyPerUnit || !unitLabel.trim()}
            className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg"
          >
            Thêm định mức
          </button>
        </div>
      )}
    </section>
  );
}
