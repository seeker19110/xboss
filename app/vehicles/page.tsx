"use client";
import { useEffect, useState, useCallback, useRef } from "react";
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
import { Modal, appConfirm, appPrompt } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import EmptyState from "@/app/components/EmptyState";
import { fetchMe, redirectToLogin } from "@/app/lib/me";
import { formatDateVN, todayISO } from "@/lib/nen/date";

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

// Cùng pattern Nhân sự: snapshot chỉ đọc khi lỗi/đổi ngày, response cũ không được áp.
function useVehicleList(date: string) {
  const [snapshot, setSnapshot] = useState<{ date: string; items: Vehicle[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const activeDate = useRef(date);
  activeDate.current = date;
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    if (activeDate.current !== date) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const current = () =>
      !controller.signal.aborted && request.current === controller && activeDate.current === date;
    setError("");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setLoading(false);
      setError("Chọn ngày hợp lệ để xem danh sách xe.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/vehicles?date=${date}`, { signal: controller.signal });
      if (!current()) return;
      if (response.status === 401) {
        void redirectToLogin();
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body?.vehicles))
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Không tải được danh sách xe. Hãy thử lại.",
        );
      if (current()) setSnapshot({ date, items: body.vehicles });
    } catch (err) {
      if (current())
        setError(
          err instanceof Error && err.name !== "TypeError"
            ? err.message
            : "Mất kết nối mạng — không tải được danh sách xe",
        );
    } finally {
      if (current()) setLoading(false);
    }
  }, [date]);
  useEffect(() => {
    void reload();
    return () => request.current?.abort();
  }, [reload]);
  return { snapshot, loading, error, reload };
}

export default function VehiclesPage() {
  const [date, setDate] = useState(todayISO());
  const source = useVehicleList(date);
  const vehicles = source.snapshot?.items ?? [];
  const load = source.reload;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const canUseRows =
    validDate && source.snapshot?.date === date && !source.loading && !source.error;
  const currentRows = useRef(false);
  currentRows.current = canUseRows;
  const currentDate = useRef(date);
  currentDate.current = date;
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState("");
  const [supplierAttempt, setSupplierAttempt] = useState(0);
  const [role, setRole] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const pendingRef = useRef(false);
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

  const canOperate = canManage || role === "subcon";

  useEffect(() => {
    fetchMe().then((u) => setRole(u?.role ?? ""));
  }, []);
  // Chỉ dùng cho form đăng ký. Cache trong page; lỗi/đóng form không áp response đã huỷ.
  useEffect(() => {
    if (!showAdd || suppliers !== null) return;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted;
    setSupplierLoading(true);
    setSupplierError("");
    void (async () => {
      try {
        const response = await fetch("/api/suppliers", { signal: controller.signal });
        if (!current()) return;
        if (response.status === 401) {
          void redirectToLogin();
          return;
        }
        const body = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(body?.suppliers))
          throw new Error(
            typeof body?.error === "string"
              ? body.error
              : "Không tải được nhà cung cấp. Hãy thử lại.",
          );
        if (current()) setSuppliers(body.suppliers);
      } catch (err) {
        if (current())
          setSupplierError(
            err instanceof Error && err.name !== "TypeError"
              ? err.message
              : "Mất kết nối — không tải được nhà cung cấp.",
          );
      } finally {
        if (current()) setSupplierLoading(false);
      }
    })();
    return () => controller.abort();
  }, [showAdd, suppliers, supplierAttempt]);

  const closeAdd = () => {
    if (!savingRef.current) setShowAdd(false);
  };

  const sorted = [...vehicles].sort((a, b) => {
    const lateA = isLate(a) ? 0 : 1;
    const lateB = isLate(b) ? 0 : 1;
    if (lateA !== lateB) return lateA - lateB;
    return new Date(a.expectedAt).getTime() - new Date(b.expectedAt).getTime();
  });

  const doAction = async (v: Vehicle, action: string, confirmMsg?: string) => {
    if (!currentRows.current || pendingRef.current || !canOperate) return;
    pendingRef.current = true;
    setPendingId(v.id);
    setError("");
    try {
      if (confirmMsg && !(await appConfirm(confirmMsg))) return;
      if (!currentRows.current || currentDate.current !== date) return;
      const r = await fetch(`/api/vehicles/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (r.status === 401) {
        void redirectToLogin();
        return;
      }
      if (r.ok) await load();
      else {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "Lỗi cập nhật");
      }
    } catch {
      setError("Mất kết nối mạng — vui lòng thử lại");
    } finally {
      pendingRef.current = false;
      setPendingId(null);
    }
  };

  const addVehicle = async () => {
    if (
      savingRef.current ||
      !canManage ||
      !validDate ||
      suppliers === null ||
      supplierLoading ||
      supplierError
    )
      return;
    if (!form.plate.trim()) {
      setFormError("Thiếu biển số xe");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(form.time)) {
      setFormError("Chọn giờ dự kiến hợp lệ.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setFormError("");
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
      if (r.status === 401) {
        void redirectToLogin();
        return;
      }
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
        setFormError(j.error ?? "Lỗi đăng ký xe");
      }
    } catch {
      setFormError("Mất kết nối mạng — vui lòng thử lại");
    } finally {
      savingRef.current = false;
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
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold">Xe ra vào công trường</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="vehicle-date" className="text-sm text-zinc-400">
              Chọn ngày
            </label>
            <input
              id="vehicle-date"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setError("");
              }}
              disabled={showAdd || pendingId !== null}
              aria-label="Chọn ngày"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-base sm:text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
            {canExport && (
              <Button
                icon={Download}
                onClick={exportPdf}
                disabled={!validDate || pendingId !== null}
                className="min-h-11"
              >
                Xuất DS
              </Button>
            )}
            {canManage && (
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => {
                  setFormError("");
                  setShowAdd(true);
                }}
                disabled={!validDate || pendingId !== null}
                className="min-h-11"
              >
                Đăng ký xe
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-zinc-900 border border-red-800 text-red-300 rounded-lg text-sm flex items-center justify-between gap-2"
          >
            {error}
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={() => setError("")}
              aria-label="Đóng thông báo lỗi"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {source.error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg border border-red-800 bg-zinc-900 text-red-300 text-sm flex flex-wrap items-center gap-3"
          >
            <p className="flex-1">{source.error}</p>
            <Button
              className="min-h-11"
              disabled={!validDate}
              aria-label="Thử tải lại danh sách xe"
              onClick={() => void load()}
            >
              Thử lại
            </Button>
          </div>
        )}
        {pendingId !== null && (
          <p role="status" className="mb-4 text-sm text-zinc-400">
            Đang cập nhật xe…
          </p>
        )}
        {source.loading && (
          <p role="status" className="mb-4 text-sm text-zinc-400">
            Đang tải danh sách xe…
          </p>
        )}
        {source.snapshot && !canUseRows && (
          <p className="mb-4 rounded-lg border border-amber-800 bg-zinc-900 p-3 text-sm text-amber-300">
            Dữ liệu đang hiển thị thuộc ngày {formatDateVN(source.snapshot.date)} — chỉ xem cho đến
            khi tải lại thành công.
          </p>
        )}
        {canUseRows && sorted.length === 0 && (
          <EmptyState message="Chưa có xe nào đăng ký cho ngày này" />
        )}

        <div className="space-y-3">
          {sorted.map((v) => {
            const late = isLate(v);
            return (
              <div
                key={v.id}
                className={`rounded-xl border bg-zinc-800 p-4 ${late ? "border-rose-800" : "border-zinc-700"}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl font-bold font-mono tracking-wide break-all">
                        {v.plate}
                      </span>
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
                  {v.supplierName && <p className="[overflow-wrap:anywhere]">{v.supplierName}</p>}
                  {v.cargo && (
                    <p className="flex items-center gap-1.5 text-zinc-400">
                      <Package className="w-3.5 h-3.5 shrink-0" />{" "}
                      <span className="min-w-0 [overflow-wrap:anywhere]">{v.cargo}</span>
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

                <fieldset
                  disabled={!canUseRows || pendingId !== null}
                  aria-label={`Thao tác xe ${v.plate}`}
                  className="flex flex-wrap gap-2"
                >
                  {canManage && v.status === "registered" && (
                    <Button
                      icon={CheckCircle2}
                      onClick={() => doAction(v, "approve")}
                      className="flex-1 min-w-[100px] min-h-11"
                    >
                      Duyệt
                    </Button>
                  )}
                  {canOperate && ["registered", "approved"].includes(v.status) && (
                    <Button
                      variant="primary"
                      icon={LogIn}
                      onClick={() => doAction(v, "enter")}
                      className="flex-1 min-w-[100px] min-h-11"
                    >
                      Đã vào
                    </Button>
                  )}
                  {canOperate && v.status === "entered" && (
                    <Button
                      icon={LogOut}
                      onClick={() => doAction(v, "exit")}
                      className="flex-1 min-w-[100px] min-h-11"
                    >
                      Đã ra
                    </Button>
                  )}
                  {canManage && ["registered", "approved"].includes(v.status) && (
                    <>
                      <Button
                        variant="warning"
                        onClick={() => doAction(v, "no_show", `Đánh dấu xe ${v.plate} không đến?`)}
                        className="min-h-11"
                      >
                        Không đến
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        icon={Ban}
                        onClick={() => doAction(v, "cancel", `Huỷ đăng ký xe ${v.plate}?`)}
                        aria-label={`Huỷ đăng ký xe ${v.plate}`}
                        className="min-h-11 min-w-11 hover:text-red-300"
                      />
                    </>
                  )}
                </fieldset>
              </div>
            );
          })}
        </div>
      </main>

      {showAdd && (
        <Modal onClose={closeAdd} ariaLabel="Đăng ký xe" className="max-w-md">
          <div className="p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Đăng ký xe</h3>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                onClick={closeAdd}
                disabled={saving}
                aria-label="Đóng"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <p className="mb-4 text-sm text-zinc-400">Đăng ký cho ngày {formatDateVN(date)}</p>
            <div className="space-y-3">
              <div>
                <label htmlFor="vehicle-plate" className="text-xs text-zinc-400 mb-1 block">
                  Biển số xe *
                </label>
                <input
                  id="vehicle-plate"
                  disabled={saving}
                  value={form.plate}
                  onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 min-h-11 text-base sm:text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="vehicle-time" className="text-xs text-zinc-400 mb-1 block">
                    Giờ dự kiến *
                  </label>
                  <input
                    type="time"
                    id="vehicle-time"
                    disabled={saving}
                    value={form.time}
                    onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 min-h-11 text-base sm:text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-gate" className="text-xs text-zinc-400 mb-1 block">
                    Cổng
                  </label>
                  <input
                    id="vehicle-gate"
                    disabled={saving}
                    value={form.gate}
                    onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 min-h-11 text-base sm:text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="vehicle-supplierId" className="text-xs text-zinc-400 mb-1 block">
                  Nhà cung cấp
                </label>
                <select
                  id="vehicle-supplierId"
                  disabled={saving || supplierLoading || suppliers === null}
                  value={form.supplierId}
                  onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 min-h-11 text-base sm:text-sm outline-none focus:border-blue-500"
                >
                  <option value="">-- Chọn NCC --</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {supplierLoading && (
                  <p role="status" className="mt-2 text-sm text-zinc-400">
                    Đang tải nhà cung cấp…
                  </p>
                )}
                {supplierError && (
                  <div
                    role="alert"
                    className="mt-2 rounded-lg border border-red-800 bg-zinc-900 p-3 text-sm text-red-300"
                  >
                    <p>{supplierError}</p>
                    <Button
                      className="mt-2 min-h-11"
                      aria-label="Thử tải lại nhà cung cấp"
                      onClick={() => setSupplierAttempt((n) => n + 1)}
                    >
                      Thử lại
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="vehicle-cargo" className="text-xs text-zinc-400 mb-1 block">
                  Hàng hoá
                </label>
                <input
                  id="vehicle-cargo"
                  disabled={saving}
                  value={form.cargo}
                  onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                  className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 min-h-11 text-base sm:text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="vehicle-driver" className="text-xs text-zinc-400 mb-1 block">
                    Lái xe
                  </label>
                  <input
                    id="vehicle-driver"
                    disabled={saving}
                    value={form.driver}
                    onChange={(e) => setForm((f) => ({ ...f, driver: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 min-h-11 text-base sm:text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="vehicle-driverPhone" className="text-xs text-zinc-400 mb-1 block">
                    SĐT lái xe
                  </label>
                  <input
                    id="vehicle-driverPhone"
                    type="tel"
                    disabled={saving}
                    value={form.driverPhone}
                    onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
                    className="w-full bg-zinc-700 border border-zinc-600 rounded px-3 py-2 min-h-11 text-base sm:text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 min-h-11 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  disabled={saving}
                  checked={form.needsCrane}
                  onChange={(e) => setForm((f) => ({ ...f, needsCrane: e.target.checked }))}
                  className="w-4 h-4"
                />
                Cần cẩu/vận thăng
              </label>
            </div>
            {formError && (
              <p role="alert" className="mt-4 text-sm text-red-300">
                {formError}
              </p>
            )}
            <div className="flex gap-2 mt-5">
              <Button
                variant="primary"
                onClick={addVehicle}
                disabled={saving || supplierLoading || suppliers === null || !!supplierError}
                className="flex-1 min-h-11"
              >
                {saving ? "Đang đăng ký…" : "Đăng ký"}
              </Button>
              <Button onClick={closeAdd} disabled={saving} className="min-h-11">
                Huỷ
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
