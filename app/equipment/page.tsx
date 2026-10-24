"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Wrench, FileUp, ArrowLeftRight, ShieldCheck, QrCode } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { Modal } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, invalidateMe, redirectToLogin, type Me } from "@/app/lib/me";
import { formatDateVN, formatDateTimeVN, todayISO, daysFromTodayISO } from "@/lib/nen/date";
import { EXPIRY_WARN_DAYS } from "@/lib/nen/han-hieu-luc";

type EquipmentCondition = "good" | "maintenance" | "broken" | "retired";
const EQUIPMENT_CONDITION_LABEL: Record<EquipmentCondition, string> = {
  good: "Tốt",
  maintenance: "Đang bảo trì",
  broken: "Hỏng",
  retired: "Ngừng sử dụng",
};

type EquipmentLogAction = "issue" | "return" | "move" | "maintain" | "calibrate";
const EQUIPMENT_LOG_ACTION_LABEL: Record<EquipmentLogAction, string> = {
  issue: "Cấp phát",
  return: "Thu hồi",
  move: "Chuyển vị trí",
  maintain: "Bảo trì",
  calibrate: "Hiệu chuẩn",
};

const CONDITION_BADGE: Record<EquipmentCondition, string> = {
  good: "bg-emerald-900 text-emerald-200",
  maintenance: "bg-amber-900 text-amber-200",
  broken: "bg-rose-900 text-rose-200",
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

export default function EquipmentPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [pageError, setPageError] = useState("");
  const mounted = useRef(false);
  const request = useRef({ id: 0, controller: null as AbortController | null });
  const [conditionFilter, setConditionFilter] = useState<EquipmentCondition | "">("");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // M58 PR1 — chọn nhiều dòng để in tem QR (chỉ dùng client-side, không đụng DB).
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  const canManage = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const canPrintLabels = me?.role === "admin" || me?.role === "pm";

  function toggleChecked(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function printLabels() {
    if (checkedIds.size === 0) return;
    window.open(`/api/qr/labels?kind=eq&ids=${[...checkedIds].join(",")}`, "_blank");
  }

  const refresh = useCallback(async () => {
    const id = ++request.current.id;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    const current = () =>
      mounted.current && request.current.id === id && !controller.signal.aborted;
    const fallback = "Không tải được danh sách thiết bị. Kiểm tra mạng rồi thử lại.";
    setLoading(true);
    setPageError("");
    try {
      const [meData, res] = await Promise.all([
        fetchMe(),
        fetch("/api/equipment", { signal: controller.signal }),
      ]);
      if (!current()) return;
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await res.json().catch(() => null);
      if (!current()) return;
      if (!meData) invalidateMe();
      if (!res.ok) {
        setPageError(typeof body?.error === "string" && body.error.trim() ? body.error : fallback);
        return;
      }
      if (!meData || !Array.isArray(body?.equipment)) {
        setPageError(fallback);
        return;
      }
      setMe(meData);
      setItems(body.equipment);
      setHasSnapshot(true);
    } catch {
      if (current()) {
        invalidateMe();
        setPageError(fallback);
      }
    } finally {
      if (mounted.current && request.current.id === id) {
        request.current.controller = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const active = request.current;
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
      active.id++;
      active.controller?.abort();
    };
  }, [refresh]);

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

  if (loading && !hasSnapshot && !pageError) return <PageSkeleton />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Thiết bị"
        subtitle="Sổ thiết bị/máy thi công — tình trạng, vị trí, hạn kiểm định"
        bottomActions={
          <div className="flex items-center gap-2 shrink-0">
            {canPrintLabels && (
              <button
                onClick={printLabels}
                disabled={checkedIds.size === 0}
                aria-label={`In tem QR ${checkedIds.size} thiết bị đã chọn`}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed border border-zinc-700 px-3 py-2 rounded-lg text-sm font-medium transition"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">
                  In tem QR{checkedIds.size ? ` (${checkedIds.size})` : ""}
                </span>
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Thêm thiết bị"
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition text-on-accent"
              >
                <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Thêm thiết bị</span>
              </button>
            )}
          </div>
        }
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        {pageError && (
          <div className="rounded-xl border border-red-500/40 bg-zinc-900 p-4 space-y-2">
            <p role="alert" className="text-sm text-red-300">
              {pageError}
            </p>
            {hasSnapshot && (
              <p className="text-sm text-zinc-400">
                Đang hiển thị danh sách thiết bị đã tải trước đó.
              </p>
            )}
            <button
              type="button"
              disabled={loading}
              onClick={() => void refresh()}
              className="min-h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
            >
              Thử lại danh sách
            </button>
          </div>
        )}
        {loading && hasSnapshot && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải lại danh sách thiết bị…
          </p>
        )}
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
                    ? "bg-sky-900 border-sky-700 text-sky-200"
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

        {hasSnapshot && filtered.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Chưa có thiết bị nào"
            message={canManage ? 'Bấm "Thêm thiết bị" để bắt đầu.' : "Chưa có dữ liệu thiết bị."}
          />
        ) : hasSnapshot ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Sổ thiết bị">
              <table className="w-full text-sm sm:min-w-[760px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    {canPrintLabels && <th className="p-3 w-8"></th>}
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
                      e.calibrationDue <= daysFromTodayISO(EXPIRY_WARN_DAYS);
                    return (
                      <tr
                        key={e.id}
                        onClick={() => setSelectedId(e.id)}
                        className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40 cursor-pointer"
                      >
                        {canPrintLabels && (
                          <td className="p-3" onClick={(ev) => ev.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={checkedIds.has(e.id)}
                              onChange={() => toggleChecked(e.id)}
                              aria-label={`Chọn thiết bị ${e.code} để in tem QR`}
                              className="w-4 h-4 accent-emerald-600"
                            />
                          </td>
                        )}
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
        ) : null}
      </main>

      {selected && (
        <EquipmentDetailModal
          equipment={selected}
          canManage={canManage}
          me={me}
          onClose={() => setSelectedId(null)}
          onSaved={refresh}
          pageError={pageError}
          pageLoading={loading}
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
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
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
  pageError,
  pageLoading,
}: {
  equipment: Equipment;
  canManage: boolean;
  me: Me | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  pageError: string;
  pageLoading: boolean;
}) {
  const [logs, setLogs] = useState<EquipmentLog[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<EquipmentLogAction>("issue");
  const [toLocation, setToLocation] = useState("");
  const [toCrew, setToCrew] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mounted = useRef(false);
  const context = useRef({ epoch: 0 });
  const logRequest = useRef({ id: 0, controller: null as AbortController | null });
  const writePending = useRef(false);
  const writeRequest = useRef<AbortController | null>(null);
  const pending = busy || uploading;

  const canLog = canManage || (me?.role === "subcon" && equipment.currentCrew === me.name);

  const loadLogs = useCallback(async () => {
    const id = ++logRequest.current.id;
    logRequest.current.controller?.abort();
    const controller = new AbortController();
    logRequest.current.controller = controller;
    const current = () =>
      mounted.current && logRequest.current.id === id && !controller.signal.aborted;
    setLogsLoading(true);
    setLogsError("");
    try {
      const res = await fetch(`/api/equipment/${equipment.id}/logs`, { signal: controller.signal });
      if (!current()) return;
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await res.json().catch(() => null);
      if (!current()) return;
      if (!res.ok || !Array.isArray(body?.logs)) {
        setLogsError(
          typeof body?.error === "string" && body.error.trim()
            ? body.error
            : "Không tải được lịch sử thao tác. Kiểm tra rồi thử lại.",
        );
        return;
      }
      setLogs(body.logs);
    } catch {
      if (current())
        setLogsError("Mất kết nối — không tải được lịch sử thao tác. Kiểm tra mạng rồi thử lại.");
    } finally {
      if (mounted.current && logRequest.current.id === id) {
        logRequest.current.controller = null;
        setLogsLoading(false);
      }
    }
  }, [equipment.id]);

  useEffect(() => {
    const active = logRequest.current;
    const activeContext = context.current;
    mounted.current = true;
    activeContext.epoch++;
    writePending.current = false;
    setBusy(false);
    setUploading(false);
    setLogs(null);
    setWriteError("");
    setNotice("");
    void loadLogs();
    return () => {
      mounted.current = false;
      activeContext.epoch++;
      active.id++;
      active.controller?.abort();
      writeRequest.current?.abort();
    };
  }, [loadLogs]);

  function close() {
    if (!writePending.current) onClose();
  }

  async function submitLog() {
    if (writePending.current) return;
    writePending.current = true;
    const epoch = context.current.epoch;
    const current = () => mounted.current && context.current.epoch === epoch;
    const controller = new AbortController();
    writeRequest.current = controller;
    setBusy(true);
    setWriteError("");
    setNotice("");
    try {
      const res = await fetch(`/api/equipment/${equipment.id}/logs`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          toLocation: toLocation.trim() || null,
          toCrew: toCrew.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!current()) return;
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (current())
          setWriteError(
            typeof body?.error === "string"
              ? body.error
              : "Ghi log thất bại. Bản nhập được giữ nguyên.",
          );
        return;
      }
      setToLocation("");
      setToCrew("");
      setNote("");
      setNotice("Đã ghi nhận thao tác vừa gửi.");
      await loadLogs();
      if (current()) {
        try {
          await onSaved();
        } catch {
          if (current())
            setWriteError(
              "Đã ghi nhận thao tác, nhưng chưa cập nhật được danh sách thiết bị. Kiểm tra rồi tải lại danh sách.",
            );
        }
      }
    } catch {
      if (current())
        setWriteError(
          "Mất kết nối — chưa xác nhận ghi log. Bản nhập được giữ nguyên để kiểm tra và thử lại.",
        );
    } finally {
      if (current()) {
        writePending.current = false;
        writeRequest.current = null;
        setBusy(false);
      }
    }
  }

  async function uploadCert(f: File) {
    if (writePending.current) return;
    writePending.current = true;
    const epoch = context.current.epoch;
    const current = () => mounted.current && context.current.epoch === epoch;
    const controller = new AbortController();
    writeRequest.current = controller;
    setUploading(true);
    setWriteError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch(`/api/equipment/${equipment.id}/cert`, {
        method: "POST",
        signal: controller.signal,
        body: form,
      });
      if (!current()) return;
      if (res.status === 401) {
        void redirectToLogin();
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (current())
          setWriteError(
            typeof body?.error === "string" ? body.error : "Upload giấy kiểm định thất bại.",
          );
        return;
      }
      setNotice("Đã tải giấy kiểm định vừa gửi.");
      try {
        await onSaved();
      } catch {
        if (current())
          setWriteError(
            "Đã tải giấy kiểm định, nhưng chưa cập nhật được danh sách thiết bị. Kiểm tra rồi tải lại danh sách.",
          );
      }
    } catch {
      if (current())
        setWriteError("Mất kết nối — chưa xác nhận tải giấy kiểm định. Kiểm tra mạng rồi thử lại.");
    } finally {
      if (current()) {
        writePending.current = false;
        writeRequest.current = null;
        setUploading(false);
      }
    }
  }

  return (
    <Modal onClose={close} className="max-w-xl">
      <div className="p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold font-mono text-sm">{equipment.code}</h2>
            <p className="text-sm text-zinc-300">{equipment.name}</p>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={pending}
            aria-label="Đóng"
            className="min-h-11 min-w-11 inline-flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-50"
          >
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

        {pageLoading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải lại danh sách thiết bị…
          </p>
        )}
        {pageError && (
          <div className="space-y-2">
            <p role="alert" className="text-sm text-red-300">
              {pageError}
            </p>
            <p className="text-sm text-zinc-400">
              Thông tin thiết bị đang hiển thị là bản đã tải trước đó.
            </p>
            <button
              type="button"
              disabled={pageLoading || pending}
              onClick={() => {
                if (!writePending.current) void onSaved();
              }}
              className="min-h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
            >
              Thử lại danh sách
            </button>
          </div>
        )}

        {canManage && (
          <label className="inline-flex min-h-11 items-center gap-2 text-sm text-zinc-300 hover:text-white cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg w-fit focus-within:outline-2 focus-within:outline-emerald-400">
            <FileUp className="w-4 h-4" />
            {uploading ? "Đang tải lên…" : "Tải giấy kiểm định"}
            <input
              type="file"
              accept="application/pdf,image/*"
              aria-label="Tải giấy kiểm định"
              className="sr-only"
              disabled={pending}
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
          {logsLoading && (
            <p role="status" className="text-sm text-zinc-400">
              Đang tải lịch sử thao tác…
            </p>
          )}
          {logsError && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-red-300">
                {logsError}
              </p>
              {logs !== null && (
                <p className="text-sm text-zinc-400">Đang hiển thị lịch sử đã tải trước đó.</p>
              )}
              <button
                type="button"
                disabled={logsLoading || pending}
                onClick={() => void loadLogs()}
                className="min-h-11 rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
              >
                Thử lại lịch sử
              </button>
            </div>
          )}
          {logs?.length ? (
            <ul className="space-y-1.5">
              {logs.map((l) => (
                <li key={l.id} className="text-sm border-b border-zinc-800/60 last:border-0 pb-1.5">
                  <span className="font-medium">{EQUIPMENT_LOG_ACTION_LABEL[l.action]}</span>
                  {l.toCrew && <span className="text-zinc-400"> → {l.toCrew}</span>}
                  {l.toLocation && <span className="text-zinc-400"> · {l.toLocation}</span>}
                  <p className="text-xs text-zinc-400">
                    {l.loggerName ?? "—"} · {formatDateTimeVN(l.createdAt)}
                  </p>
                  {l.note && <p className="text-xs text-zinc-400">{l.note}</p>}
                </li>
              ))}
            </ul>
          ) : logs !== null && !logsLoading && !logsError ? (
            <EmptyState message="Chưa có lịch sử thao tác." compact />
          ) : null}

          {writeError && (
            <p role="alert" className="text-sm text-red-300">
              {writeError}
            </p>
          )}
          {notice && (
            <p aria-live="polite" className="text-sm text-emerald-300">
              {notice}
            </p>
          )}

          {canLog && (
            <fieldset
              disabled={pending}
              aria-busy={pending}
              className="space-y-2 bg-zinc-800/60 rounded-lg p-3 min-w-0"
            >
              <select
                value={action}
                onChange={(e) => {
                  setNotice("");
                  setAction(e.target.value as EquipmentLogAction);
                }}
                aria-label="Hành động"
                className="min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
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
                    onChange={(e) => {
                      setNotice("");
                      setToLocation(e.target.value);
                    }}
                    placeholder="Vị trí (kho/tầng)"
                    aria-label="Vị trí"
                    className="min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
                  />
                  <input
                    value={toCrew}
                    onChange={(e) => {
                      setNotice("");
                      setToCrew(e.target.value);
                    }}
                    placeholder="Tổ đội nhận"
                    aria-label="Tổ đội nhận"
                    className="min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
                  />
                </>
              )}
              <input
                value={note}
                onChange={(e) => {
                  setNotice("");
                  setNote(e.target.value);
                }}
                placeholder="Ghi chú"
                aria-label="Ghi chú"
                className="min-h-11 w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
              />
              <button
                type="button"
                onClick={submitLog}
                disabled={pending}
                className="min-h-11 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-on-accent text-sm font-medium px-3 py-2 rounded-lg"
              >
                {busy ? "Đang ghi…" : "Ghi nhận"}
              </button>
            </fieldset>
          )}
        </section>
      </div>
    </Modal>
  );
}
