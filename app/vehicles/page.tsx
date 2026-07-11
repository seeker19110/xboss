"use client";
import { useEffect, useState, useCallback } from "react";
import {
  Truck,
  Plus,
  X,
  Phone,
  Package,
  Forklift,
  CheckCircle2,
  LogIn,
  LogOut,
  Ban,
  Download,
  AlertTriangle,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { appConfirm, appPrompt } from "@/app/components/dialogs";
import EmptyState from "@/app/components/EmptyState";
import { fetchMe } from "@/app/lib/me";
import { todayISO } from "@/lib/date";

type Vehicle = {
  id: number;
  plate: string;
  driver: string | null;
  driverPhone: string | null;
  cargo: string | null;
  gate: string | null;
  expectedAt: string;
  enteredAt: string | null;
  exitedAt: string | null;
  needsCrane: boolean;
  status: "registered" | "approved" | "entered" | "exited" | "no_show" | "cancelled";
  poId: number | null;
  poCode: string | null;
  supplierId: number | null;
  supplierName: string | null;
};
type Supplier = { id: number; name: string };

const STATUS_LABEL: Record<Vehicle["status"], string> = {
  registered: "Đã đăng ký",
  approved: "Đã duyệt",
  entered: "Đã vào",
  exited: "Đã ra",
  no_show: "Không đến",
  cancelled: "Đã huỷ",
};
const STATUS_CLS: Record<Vehicle["status"], string> = {
  registered: "bg-zinc-700 text-zinc-300",
  approved: "bg-blue-950 text-blue-200",
  entered: "bg-emerald-950 text-emerald-200",
  exited: "bg-zinc-800 text-zinc-400",
  no_show: "bg-amber-950 text-amber-200",
  cancelled: "bg-red-950 text-red-200",
};

const isLate = (v: Vehicle) =>
  !v.enteredAt &&
  !["exited", "no_show", "cancelled"].includes(v.status) &&
  Date.now() - new Date(v.expectedAt).getTime() > 2 * 3600_000;

function fmtTime(v: string) {
  return new Date(v).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export default function VehiclesPage() {
  const [date, setDate] = useState(todayISO());
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [role, setRole] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    plate: "",
    driver: "",
    driverPhone: "",
    cargo: "",
    gate: "",
    supplierId: "",
    time: "08:00",
    needsCrane: false,
  });

  const canManage = role === "admin" || role === "pm" || role === "engineer";
  const canExport = role === "admin" || role === "pm";

  const load = useCallback(() => {
    fetch(`/api/vehicles?date=${date}`)
      .then((r) => r.json())
      .then((j) => setVehicles(j.vehicles ?? []));
  }, [date]);

  useEffect(() => {
    fetchMe().then((u) => setRole(u?.role ?? ""));
    fetch("/api/suppliers")
      .then((r) => r.json())
      .then((j) => setSuppliers(j.suppliers ?? []));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const sorted = [...vehicles].sort((a, b) => {
    const lateA = isLate(a) ? 0 : 1;
    const lateB = isLate(b) ? 0 : 1;
    if (lateA !== lateB) return lateA - lateB;
    return new Date(a.expectedAt).getTime() - new Date(b.expectedAt).getTime();
  });

  const doAction = async (v: Vehicle, action: string, confirmMsg?: string) => {
    if (confirmMsg && !(await appConfirm(confirmMsg))) return;
    setError("");
    try {
      const r = await fetch(`/api/vehicles/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (r.ok) load();
      else {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Lỗi cập nhật");
      }
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    }
  };

  const addVehicle = async () => {
    if (!form.plate.trim()) {
      setError("Thiếu biển số xe");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const expectedAt = new Date(`${date}T${form.time}:00`);
      const r = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate: form.plate.trim(),
          driver: form.driver.trim() || undefined,
          driverPhone: form.driverPhone.trim() || undefined,
          cargo: form.cargo.trim() || undefined,
          gate: form.gate.trim() || undefined,
          supplierId: form.supplierId ? Number(form.supplierId) : undefined,
          expectedAt: expectedAt.toISOString(),
          needsCrane: form.needsCrane,
        }),
      });
      if (r.ok) {
        setShowAdd(false);
        setForm({
          plate: "",
          driver: "",
          driverPhone: "",
          cargo: "",
          gate: "",
          supplierId: "",
          time: "08:00",
          needsCrane: false,
        });
        load();
      } else {
        const j = await r.json();
        setError(j.error ?? "Lỗi đăng ký xe");
      }
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = async () => {
    const label = await appPrompt("Xuất danh sách ngày nào? (YYYY-MM-DD)", date);
    if (!label) return;
    window.open(`/api/vehicles/export?date=${label}`, "_blank");
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <AppHeader title="Xe ra vào" />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold">Xe ra vào công trường</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Chọn ngày"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
            {canExport && (
              <button
                onClick={exportPdf}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-3 py-2.5 rounded-lg text-sm"
              >
                <Download className="w-4 h-4" /> Xuất DS
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 px-3 py-2.5 rounded-lg text-sm font-medium text-on-accent"
              >
                <Plus className="w-4 h-4" /> Đăng ký xe
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-sm flex justify-between">
            {error}
            <button onClick={() => setError("")} aria-label="Đóng thông báo lỗi">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {sorted.length === 0 && <EmptyState message="Chưa có xe nào đăng ký cho ngày này" />}

        <div className="space-y-3">
          {sorted.map((v) => {
            const late = isLate(v);
            return (
              <div
                key={v.id}
                className={`rounded-xl border p-4 ${late ? "bg-rose-950/30 border-rose-800" : "bg-zinc-800 border-zinc-700"}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl font-bold font-mono tracking-wide">{v.plate}</span>
                      {v.needsCrane && (
                        <Forklift
                          className="w-5 h-5 text-amber-400"
                          aria-label="Cần cẩu/vận thăng"
                        />
                      )}
                      {late && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-900 text-rose-200">
                          <AlertTriangle className="w-3 h-3" /> Quá giờ
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      Dự kiến{" "}
                      <span className="text-zinc-200 font-medium">{fmtTime(v.expectedAt)}</span>
                      {v.gate && <> · Cổng {v.gate}</>}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLS[v.status]}`}
                  >
                    {STATUS_LABEL[v.status]}
                  </span>
                </div>

                <div className="text-sm text-zinc-300 space-y-0.5 mb-3">
                  {v.supplierName && <p>{v.supplierName}</p>}
                  {v.cargo && (
                    <p className="flex items-center gap-1.5 text-zinc-400">
                      <Package className="w-3.5 h-3.5" /> {v.cargo}
                    </p>
                  )}
                  {v.driver && (
                    <p className="flex items-center gap-1.5 text-zinc-400">
                      {v.driver}
                      {v.driverPhone && (
                        <a
                          href={`tel:${v.driverPhone}`}
                          className="flex items-center gap-1 text-blue-400"
                        >
                          <Phone className="w-3.5 h-3.5" /> {v.driverPhone}
                        </a>
                      )}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManage && v.status === "registered" && (
                    <button
                      onClick={() => doAction(v, "approve")}
                      className="flex-1 min-w-[100px] flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-600 rounded-lg py-3 text-sm font-semibold text-on-accent"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Duyệt
                    </button>
                  )}
                  {["registered", "approved"].includes(v.status) && (
                    <button
                      onClick={() => doAction(v, "enter")}
                      className="flex-1 min-w-[100px] flex items-center justify-center gap-2 bg-emerald-700 hover:bg-emerald-600 rounded-lg py-3 text-sm font-semibold text-on-accent"
                    >
                      <LogIn className="w-4 h-4" /> Đã vào
                    </button>
                  )}
                  {v.status === "entered" && (
                    <button
                      onClick={() => doAction(v, "exit")}
                      className="flex-1 min-w-[100px] flex items-center justify-center gap-2 bg-zinc-600 hover:bg-zinc-500 rounded-lg py-3 text-sm font-semibold"
                    >
                      <LogOut className="w-4 h-4" /> Đã ra
                    </button>
                  )}
                  {canManage && ["registered", "approved"].includes(v.status) && (
                    <>
                      <button
                        onClick={() => doAction(v, "no_show", `Đánh dấu xe ${v.plate} không đến?`)}
                        className="px-4 py-3 rounded-lg text-sm bg-amber-900 hover:bg-amber-800 text-amber-200"
                      >
                        Không đến
                      </button>
                      <button
                        onClick={() => doAction(v, "cancel", `Huỷ đăng ký xe ${v.plate}?`)}
                        aria-label={`Huỷ đăng ký xe ${v.plate}`}
                        className="p-3 rounded-lg hover:bg-red-900 text-zinc-400 hover:text-red-200"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl w-full max-w-md my-8 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Đăng ký xe</h3>
              <button
                onClick={() => setShowAdd(false)}
                aria-label="Đóng"
                className="text-zinc-400 hover:text-zinc-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Biển số xe *</label>
                <input
                  value={form.plate}
                  onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Giờ dự kiến *</label>
                  <input
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Cổng</label>
                  <input
                    value={form.gate}
                    onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Nhà cung cấp</label>
                <select
                  value={form.supplierId}
                  onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">-- Chọn NCC --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Hàng hoá</label>
                <input
                  value={form.cargo}
                  onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Lái xe</label>
                  <input
                    value={form.driver}
                    onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">SĐT lái xe</label>
                  <input
                    value={form.driverPhone}
                    onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={form.needsCrane}
                  onChange={(e) => setForm((f) => ({ ...f, needsCrane: e.target.checked }))}
                  className="w-4 h-4"
                />
                Cần cẩu/vận thăng
              </label>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={addVehicle}
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium text-on-accent"
              >
                Đăng ký
              </button>
              <button
                onClick={() => setShowAdd(false)}
                className="px-5 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-sm"
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
