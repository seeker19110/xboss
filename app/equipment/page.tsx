"use client";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Wrench, FileUp, ArrowLeftRight, ShieldCheck } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { formatDateVN } from "@/lib/date";
import {
  EQUIPMENT_CONDITION_LABEL,
  EQUIPMENT_LOG_ACTION_LABEL,
  type EquipmentCondition,
  type EquipmentLogAction,
} from "@/lib/equipment";

const CONDITION_BADGE: Record<EquipmentCondition, string> = {
  good: "bg-emerald-900/40 text-emerald-300",
  maintenance: "bg-amber-900/40 text-amber-300",
  broken: "bg-rose-900/40 text-rose-300",
  retired: "bg-zinc-800 text-zinc-400",
};

type Equipment = {
  id: number;
  code: string;
  name: string;
  kind: string;
  serial: string | null;
  condition: EquipmentCondition;
  calibrationDue: string | null;
  certFileName: string | null;
  currentLocation: string | null;
  currentCrew: string | null;
  note: string | null;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function EquipmentPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [conditionFilter, setConditionFilter] = useState<EquipmentCondition | "">("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  function load() {
    return fetch("/api/equipment").then((r) => (r.ok ? r.json() : null));
  }

  useEffect(() => {
    Promise.all([fetchMe(), load()])
      .then(([meData, e]) => {
        if (!meData) return;
        setMe(meData);
        setItems(e?.equipment ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    const e = await load();
    setItems(e?.equipment ?? []);
  }

  const filtered = useMemo(() => {
    return items.filter((e) => {
      if (conditionFilter && e.condition !== conditionFilter) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        if (
          !e.code.toLowerCase().includes(needle) &&
          !e.name.toLowerCase().includes(needle) &&
          !(e.serial ?? "").toLowerCase().includes(needle)
        )
          return false;
      }
      return true;
    });
  }, [items, conditionFilter, q]);

  const selected = items.find((e) => e.id === selectedId) ?? null;
  const today = todayISO();

  if (loading) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Thiết bị"
        subtitle="Sổ thiết bị/máy thi công — tình trạng, vị trí, hạn kiểm định"
        bottomActions={
          canManage ? (
            <button
              onClick={() => setAddOpen(true)}
              aria-label="Thêm thiết bị"
              className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition shrink-0"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm thiết bị</span>
            </button>
          ) : undefined
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo tình trạng">
            <button
              onClick={() => setConditionFilter("")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                conditionFilter === ""
                  ? "bg-zinc-700 border-zinc-600 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white"
              }`}
            >
              Tất cả
            </button>
            {(Object.keys(EQUIPMENT_CONDITION_LABEL) as EquipmentCondition[]).map((c) => (
              <button
                key={c}
                onClick={() => setConditionFilter(conditionFilter === c ? "" : c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  conditionFilter === c
                    ? "bg-sky-900/50 border-sky-700 text-sky-200"
                    : "border-zinc-700 text-zinc-400 hover:text-white"
                }`}
              >
                {EQUIPMENT_CONDITION_LABEL[c]}
              </button>
            ))}
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã/tên/serial…"
            aria-label="Tìm kiếm thiết bị"
            className="flex-1 min-w-[160px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-zinc-500"
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Chưa có thiết bị nào"
            message={canManage ? 'Bấm "Thêm thiết bị" để bắt đầu.' : "Chưa có dữ liệu thiết bị."}
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Sổ thiết bị">
              <table className="w-full text-sm sm:min-w-[760px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">MÃ</th>
                    <th className="text-left p-3">TÊN / LOẠI</th>
                    <th className="text-left p-3">TÌNH TRẠNG</th>
                    <th className="text-left p-3 hidden sm:table-cell">VỊ TRÍ / TỔ ĐỘI</th>
                    <th className="text-left p-3">HẠN KIỂM ĐỊNH</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const overdue = e.calibrationDue != null && e.calibrationDue < today;
                    const soon =
                      !overdue &&
                      e.calibrationDue != null &&
                      e.calibrationDue <=
                        new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelectedId(e.id)}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                      >
                        <td className="p-3 font-mono text-xs">{e.code}</td>
                        <td className="p-3">
                          <p className="truncate max-w-[220px]">{e.name}</p>
                          <p className="text-xs text-zinc-500">{e.kind}</p>
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CONDITION_BADGE[e.condition]}`}
                          >
                            {EQUIPMENT_CONDITION_LABEL[e.condition]}
                          </span>
                        </td>
                        <td className="p-3 hidden sm:table-cell text-zinc-300 text-xs">
                          {e.currentLocation ?? "—"}
                          {e.currentCrew ? ` · ${e.currentCrew}` : ""}
                        </td>
                        <td
                          className={`p-3 text-xs flex items-center gap-1 ${
                            overdue ? "text-rose-400" : soon ? "text-amber-400" : "text-zinc-400"
                          }`}
                        >
                          {(overdue || soon) && (
                            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          {formatDateVN(e.calibrationDue)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {selected && (
        <EquipmentDetailModal
          equipment={selected}
          canManage={canManage}
          me={me}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
        />
      )}
      {addOpen && (
        <AddEquipmentModal
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

function AddEquipmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [serial, setSerial] = useState("");
  const [calibrationDue, setCalibrationDue] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = code.trim() && name.trim() && kind.trim();

  async function submit() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          kind: kind.trim(),
          serial: serial.trim() || null,
          calibrationDue: calibrationDue || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(j?.error ?? "Không tạo được thiết bị");
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
    <Modal onClose={onClose} className="max-w-md">
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Thêm thiết bị</h2>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-zinc-400">
            Mã thiết bị
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="TB-0001"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Loại
            <input
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder="Máy hàn, giàn giáo…"
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400 col-span-2">
            Tên thiết bị
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Số serial
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
          <label className="text-xs text-zinc-400">
            Hạn kiểm định
            <input
              type="date"
              value={calibrationDue}
              onChange={(e) => setCalibrationDue(e.target.value)}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button
          onClick={submit}
          disabled={saving || !canSubmit}
          className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm"
        >
          {saving ? "Đang tạo…" : "Tạo thiết bị"}
        </button>
      </div>
    </Modal>
  );
}

type EquipmentLog = {
  id: number;
  action: EquipmentLogAction;
  toLocation: string | null;
  toCrew: string | null;
  note: string | null;
  loggerName: string | null;
  createdAt: string;
};

function EquipmentDetailModal({
  equipment,
  canManage,
  me,
  onClose,
  onSaved,
}: {
  equipment: Equipment;
  canManage: boolean;
  me: Me | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [logs, setLogs] = useState<EquipmentLog[]>([]);
  const [action, setAction] = useState<EquipmentLogAction>("issue");
  const [toLocation, setToLocation] = useState("");
  const [toCrew, setToCrew] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canLog = canManage || (me?.role === "subcon" && equipment.currentCrew === me.name);

  function loadLogs() {
    fetch(`/api/equipment/${equipment.id}/logs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setLogs(j?.logs ?? []));
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment.id]);

  async function submitLog() {
    setBusy(true);
    const res = await fetch(`/api/equipment/${equipment.id}/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        toLocation: toLocation.trim() || null,
        toCrew: toCrew.trim() || null,
        note: note.trim() || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Ghi log thất bại", "error");
      return;
    }
    setToLocation("");
    setToCrew("");
    setNote("");
    loadLogs();
    onSaved();
  }

  async function uploadCert(f: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`/api/equipment/${equipment.id}/cert`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Upload thất bại", "error");
        return;
      }
      onSaved();
    } catch {
      showToast("Mất kết nối — kiểm tra mạng rồi thử lại", "error");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-xl">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{equipment.code}</h2>
            <p className="text-sm text-zinc-300">{equipment.name}</p>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <dl className="space-y-1 text-sm text-zinc-300">
          <div>Loại: {equipment.kind}</div>
          {equipment.serial && <div>Serial: {equipment.serial}</div>}
          <div>Tình trạng: {EQUIPMENT_CONDITION_LABEL[equipment.condition]}</div>
          <div>
            Vị trí/tổ đội: {equipment.currentLocation ?? "—"}
            {equipment.currentCrew ? ` · ${equipment.currentCrew}` : ""}
          </div>
          <div>Hạn kiểm định: {formatDateVN(equipment.calibrationDue)}</div>
          <div>
            Giấy kiểm định:{" "}
            {equipment.certFileName ? (
              <a
                href={`/api/equipment/${equipment.id}/cert`}
                target="_blank"
                rel="noreferrer"
                className="text-sky-300 hover:underline"
              >
                Xem file
              </a>
            ) : (
              "—"
            )}
          </div>
          {equipment.note && <div>Ghi chú: {equipment.note}</div>}
        </dl>

        {canManage && (
          <label className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit">
            <FileUp className="w-4 h-4" />
            {uploading ? "Đang tải lên…" : "Tải giấy kiểm định"}
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadCert(f);
                e.target.value = "";
              }}
            />
          </label>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 flex items-center gap-1.5">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Lịch sử thao tác
          </h3>
          {logs.length ? (
            <ul className="space-y-1.5">
              {logs.map((l) => (
                <li key={l.id} className="text-sm border-b border-zinc-800/60 last:border-0 pb-1.5">
                  <span className="font-medium">{EQUIPMENT_LOG_ACTION_LABEL[l.action]}</span>
                  {l.toCrew && <span className="text-zinc-400"> → {l.toCrew}</span>}
                  {l.toLocation && <span className="text-zinc-400"> · {l.toLocation}</span>}
                  <p className="text-xs text-zinc-500">
                    {l.loggerName ?? "—"} · {new Date(l.createdAt).toLocaleString("vi-VN")}
                  </p>
                  {l.note && <p className="text-xs text-zinc-400">{l.note}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="Chưa có lịch sử thao tác." compact />
          )}

          {canLog && (
            <div className="space-y-2 bg-zinc-800/60 rounded-lg p-3">
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as EquipmentLogAction)}
                aria-label="Hành động"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
              >
                {(Object.keys(EQUIPMENT_LOG_ACTION_LABEL) as EquipmentLogAction[])
                  .filter((a) => canManage || a === "return")
                  .map((a) => (
                    <option key={a} value={a}>
                      {EQUIPMENT_LOG_ACTION_LABEL[a]}
                    </option>
                  ))}
              </select>
              {(action === "issue" || action === "move") && (
                <>
                  <input
                    value={toLocation}
                    onChange={(e) => setToLocation(e.target.value)}
                    placeholder="Vị trí (kho/tầng)"
                    aria-label="Vị trí"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <input
                    value={toCrew}
                    onChange={(e) => setToCrew(e.target.value)}
                    placeholder="Tổ đội nhận"
                    aria-label="Tổ đội nhận"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </>
              )}
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú"
                aria-label="Ghi chú"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white"
              />
              <button
                onClick={submitLog}
                disabled={busy}
                className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs font-medium px-3 py-2 rounded-lg"
              >
                Ghi nhận
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
