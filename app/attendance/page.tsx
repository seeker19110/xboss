"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Minus, Plus, Trash2, Users, CalendarCheck, RefreshCw } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { ErrorState } from "@/app/components/ErrorState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { appConfirm } from "@/app/components/dialogs";
import { Button } from "@/app/components/ui";
import { fetchMe, invalidateMe, redirectToLogin, type Me } from "@/app/lib/me";
import { todayISO } from "@/lib/nen/date";
import AttendanceChart from "./AttendanceChart";

type Crew = { id: number; name: string };
type Personnel = { id: number; fullName: string; crewNames: string | null };
type AttendanceItem = {
  id: number;
  workDate: string;
  crewId: number | null;
  crewName: string | null;
  personnelId: number | null;
  personnelName: string | null;
  headcount: number | null;
  present: boolean | null;
  hours: number | null;
  note: string | null;
};
type ByDateRow = {
  workDate: string;
  crewId: number | null;
  crewName: string | null;
  totalHeadcount: number;
};

function monthRange(date: string): { from: string; to: string } {
  const [y, m] = date.split("-");
  const from = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const to = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

// Snapshot giữ cả ngày/tháng đã đọc. Response cũ không được đổi ngữ cảnh đang chọn.
function useAttendanceList<T>(
  key: string,
  url: string,
  field: string,
  enabled: boolean,
  fallback: string,
) {
  const [snapshot, setSnapshot] = useState<{ key: string; items: T[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });
  const mounted = useRef(false);
  const reload = useCallback(async () => {
    if (!enabled || !mounted.current) return false;
    const id = ++request.current.id;
    request.current.controller?.abort();
    const controller = new AbortController();
    request.current.controller = controller;
    setLoading(true);
    setError("");
    const current = () =>
      mounted.current && request.current.id === id && !controller.signal.aborted;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!current()) return false;
      if (response.status === 401) {
        void redirectToLogin();
        return false;
      }
      const body = await response.json().catch(() => null);
      if (!current()) return false;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : fallback);
      if (!Array.isArray(body?.[field])) throw new Error(fallback);
      setSnapshot({ key, items: body[field] });
      return true;
    } catch (error) {
      if (current()) setError(error instanceof Error && error.message ? error.message : fallback);
      return false;
    } finally {
      if (current()) {
        request.current.controller = null;
        setLoading(false);
      }
    }
  }, [enabled, url, field, key, fallback]);
  useEffect(() => {
    const active = request.current;
    mounted.current = true;
    if (enabled) void reload();
    return () => {
      mounted.current = false;
      active.id++;
      active.controller?.abort();
      active.controller = null;
    };
  }, [enabled, reload]);
  return { snapshot, loading, error, reload };
}

function ReadError({
  message,
  retry,
  disabled,
}: {
  message: string;
  retry: () => void;
  disabled: boolean;
}) {
  return (
    <div role="alert" className="rounded-xl border border-red-900/50 bg-zinc-900 p-3 space-y-2">
      <p className="text-sm text-red-400">{message}</p>
      <Button icon={RefreshCw} onClick={retry} disabled={disabled} className="min-h-11">
        Thử lại
      </Button>
    </div>
  );
}

type WriteResult = { ok: boolean; error?: string };
type IndividualInput = {
  workDate: string;
  crewId: number | null;
  personnelId: number;
  present: boolean;
  hours: number | null;
};

export default function AttendancePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [crews, setCrews] = useState<Crew[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [baseError, setBaseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const selectedDate = useRef(date);
  const baseRequest = useRef<{ id: number; controller: AbortController | null }>({
    id: 0,
    controller: null,
  });

  const canRecord = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const ready = !loading && !baseError && !!me && validDate;
  const monthKey = date.slice(0, 7);
  const range = monthRange(validDate ? date : todayISO());
  // Giữ GET ngày/tháng song song với nguồn nền như trước; ghi vẫn đợi cả phiên và snapshot.
  const day = useAttendanceList<AttendanceItem>(
    date,
    `/api/attendance?view=list&from=${date}&to=${date}`,
    "items",
    validDate,
    "Không tải được chấm công ngày này. Vui lòng thử lại.",
  );
  const month = useAttendanceList<ByDateRow>(
    monthKey,
    `/api/attendance?view=byDate&from=${range.from}&to=${range.to}`,
    "byDate",
    validDate,
    "Không tải được tổng công theo tháng. Vui lòng thử lại.",
  );
  const items = useMemo(() => day.snapshot?.items ?? [], [day.snapshot]);
  const canWrite = canRecord && ready && day.snapshot?.key === date && !day.loading && !day.error;

  const loadBase = useCallback(async () => {
    const id = ++baseRequest.current.id;
    baseRequest.current.controller?.abort();
    const controller = new AbortController();
    baseRequest.current.controller = controller;
    setLoading(true);
    setBaseError("");
    const current = () =>
      mounted.current && baseRequest.current.id === id && !controller.signal.aborted;
    const read = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      if (response.status === 401 && current()) void redirectToLogin();
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Không tải được tổ đội và nhân sự. Vui lòng thử lại.",
        );
      return body;
    };
    try {
      const [meData, crewsRes, personnelRes] = await Promise.all([
        fetchMe(),
        read("/api/crews"),
        read("/api/personnel"),
      ]);
      if (!current()) return;
      if (!meData) {
        invalidateMe();
        throw new Error("Không tải được thông tin tài khoản. Vui lòng thử lại.");
      }
      if (!Array.isArray(crewsRes?.crews) || !Array.isArray(personnelRes?.personnel))
        throw new Error("Không tải được tổ đội và nhân sự. Vui lòng thử lại.");
      setMe(meData);
      setCrews(crewsRes.crews);
      setPersonnel(personnelRes.personnel);
    } catch (error) {
      if (!current()) return;
      invalidateMe();
      setBaseError(
        error instanceof Error
          ? error.message
          : "Không tải được dữ liệu chấm công. Vui lòng thử lại.",
      );
    } finally {
      if (current()) {
        baseRequest.current.controller = null;
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    const active = baseRequest.current;
    mounted.current = true;
    void loadBase();
    return () => {
      mounted.current = false;
      active.id++;
      active.controller?.abort();
      active.controller = null;
    };
  }, [loadBase]);

  function changeDate(next: string) {
    if (pending.current) return;
    selectedDate.current = next;
    setDate(next);
    setMutationError("");
  }

  async function write(
    targetDate: string,
    send: () => Promise<Response | null>,
    fallback: string,
  ): Promise<WriteResult> {
    if (!mounted.current || pending.current || !canWrite || selectedDate.current !== targetDate)
      return { ok: false };
    pending.current = true;
    setBusy(true);
    setMutationError("");
    const current = () => mounted.current && selectedDate.current === targetDate;
    try {
      const response = await send();
      if (!response || !current()) return { ok: false };
      if (response.status === 401) {
        void redirectToLogin();
        return { ok: false };
      }
      const body = await response.json().catch(() => null);
      if (!current()) return { ok: false };
      if (!response.ok)
        return { ok: false, error: typeof body?.error === "string" ? body.error : fallback };
      // POST/PATCH/DELETE đã được nhận: lỗi đọc lại chỉ cho retry GET, không ghi lần nữa.
      await Promise.all([day.reload(), month.reload()]);
      return { ok: true };
    } catch {
      return current()
        ? { ok: false, error: "Mất kết nối — kiểm tra mạng rồi thử lại." }
        : { ok: false };
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // Bản ghi "chấm gộp theo tổ" (personnelId null) của ngày đang chọn — 1 tổ tối đa 1 dòng.
  const groupedByCrew = useMemo(() => {
    const map = new Map<number, AttendanceItem>();
    for (const it of items) if (it.personnelId == null && it.crewId != null) map.set(it.crewId, it);
    return map;
  }, [items]);

  const individualItems = useMemo(() => items.filter((it) => it.personnelId != null), [items]);

  async function bumpCrew(crewId: number, delta: number) {
    const existing = groupedByCrew.get(crewId);
    const nextHeadcount = Math.max(0, (existing?.headcount ?? 0) + delta);
    if (!existing && nextHeadcount === 0) return;
    const result = await write(
      date,
      () =>
        existing
          ? nextHeadcount === 0
            ? fetch(`/api/attendance/${existing.id}`, { method: "DELETE" })
            : fetch(`/api/attendance/${existing.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ headcount: nextHeadcount }),
              })
          : fetch("/api/attendance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workDate: date, crewId, headcount: nextHeadcount }),
            }),
      "Không cập nhật được chấm công.",
    );
    if (result.error && mounted.current) setMutationError(result.error);
  }

  async function deleteItem(id: number) {
    const result = await write(
      date,
      async () => {
        if (
          !(await appConfirm("Xoá bản ghi chấm công này? Không thể hoàn tác.", { danger: true })) ||
          !mounted.current
        )
          return null;
        return fetch(`/api/attendance/${id}`, { method: "DELETE" });
      },
      "Xoá thất bại",
    );
    if (result.error && mounted.current) setMutationError(result.error);
  }

  if (loading) return <PageSkeleton />;
  if (baseError)
    return (
      <div className="min-h-screen bg-zinc-950 text-white">
        <AppHeader title="Chấm công" />
        <main>
          <div role="alert">
            <ErrorState message={baseError} onRetry={() => void loadBase()} />
          </div>
        </main>
      </div>
    );

  const totalToday = items.reduce(
    (s, it) => s + (it.personnelId == null ? (it.headcount ?? 0) : it.present !== false ? 1 : 0),
    0,
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title="Chấm công"
        subtitle="Chấm công nhanh theo tổ đội (gộp) hoặc theo từng người"
      />

      <main className="p-4 sm:p-6 pb-24 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            Ngày làm việc:
            <input
              type="date"
              value={date}
              onChange={(e) => changeDate(e.target.value)}
              disabled={busy}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-base text-zinc-100 outline-none focus:border-emerald-500 min-h-11 transition disabled:opacity-50"
              aria-label="Chọn ngày chấm công"
            />
          </label>
          <div className="bento-card px-4 py-2 text-center ml-auto flex items-center gap-3">
            <div>
              <p className="text-xl font-bold font-mono tabular-nums text-emerald-400">
                {day.snapshot ? totalToday : "—"}
              </p>
              <p className="text-[11px] text-zinc-400">Tổng quân số hôm nay</p>
            </div>
          </div>
        </div>

        {!validDate && (
          <p role="alert" className="text-sm text-red-400">
            Chọn ngày chấm công hợp lệ để tải dữ liệu.
          </p>
        )}
        {ready && day.loading && (
          <p role="status" className="text-sm text-zinc-400">
            Đang tải chấm công ngày {date}…
          </p>
        )}
        {validDate && day.error && (
          <ReadError
            message={day.error}
            retry={() => void day.reload()}
            disabled={busy || day.loading}
          />
        )}
        {day.snapshot && day.snapshot.key !== date && (
          <p className="text-sm text-amber-400">
            Đang hiển thị dữ liệu ngày {day.snapshot.key} (chỉ xem).
          </p>
        )}
        {mutationError && (
          <p
            role="alert"
            className="rounded-xl border border-red-900/50 bg-zinc-900 p-3 text-sm text-red-400"
          >
            {mutationError}
          </p>
        )}

        {crews.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Chưa có tổ đội"
            message="Vào trang Nhân sự để tạo tổ đội trước khi chấm công."
          />
        ) : (
          <div className="bento-card divide-y divide-zinc-800/80 overflow-hidden">
            {crews.map((c) => {
              const rec = groupedByCrew.get(c.id);
              const headcount = rec?.headcount ?? 0;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between p-3.5 gap-3 hover:bg-zinc-900/40 transition-colors"
                >
                  <span className="text-sm font-semibold text-zinc-200 truncate">{c.name}</span>
                  {canRecord ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => bumpCrew(c.id, -1)}
                        disabled={busy || !canWrite || headcount <= 0}
                        aria-label={`Giảm số người tổ ${c.name}`}
                        className="w-11 h-11 flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-30 text-zinc-300 transition active:scale-95"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-mono font-bold text-sm text-zinc-100 tabular-nums">
                        {day.snapshot ? headcount : "—"}
                      </span>
                      <button
                        onClick={() => bumpCrew(c.id, 1)}
                        disabled={busy || !canWrite}
                        aria-label={`Tăng số người tổ ${c.name}`}
                        className="w-11 h-11 flex items-center justify-center rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 disabled:opacity-30 text-on-accent transition shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-mono font-bold text-sm text-zinc-100 tabular-nums">
                      {headcount}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {canRecord && (
          <IndividualForm
            crews={crews}
            personnel={personnel}
            date={date}
            disabled={busy || !canWrite}
            onSubmit={(body) =>
              write(
                body.workDate,
                () =>
                  fetch("/api/attendance", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                  }),
                "Chấm công thất bại",
              )
            }
          />
        )}

        {individualItems.length > 0 && (
          <div className="bento-card overflow-hidden">
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Chấm công theo người"
            >
              <table className="w-full text-sm sm:min-w-[520px]">
                <thead>
                  <tr className="text-xs text-zinc-400 border-b border-zinc-800">
                    <th className="text-left p-3">NHÂN SỰ</th>
                    <th className="text-left p-3">CÓ MẶT</th>
                    <th className="text-left p-3">GIỜ CÔNG</th>
                    <th className="text-left p-3 w-14"></th>
                  </tr>
                </thead>
                <tbody>
                  {individualItems.map((it) => (
                    <tr
                      key={it.id}
                      className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="p-3 font-medium text-zinc-200">{it.personnelName ?? "—"}</td>
                      <td className="p-3">
                        {it.present === false ? (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-950 text-rose-200 border border-rose-800/60">
                            Vắng
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-200 border border-emerald-800/60">
                            Có mặt
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-zinc-400">{it.hours ?? "—"}</td>
                      <td className="p-3">
                        {canRecord && (
                          <button
                            onClick={() => deleteItem(it.id)}
                            disabled={busy || !canWrite}
                            aria-label="Xoá bản ghi"
                            className="min-w-11 min-h-11 inline-flex items-center justify-center text-zinc-500 hover:text-rose-400 transition disabled:opacity-50"
                            title="Xoá"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <section aria-label="Tổng công theo tháng" className="bento-card p-4 sm:p-6 space-y-3">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-emerald-400" /> Tổng công theo tháng
          </h2>
          {ready && month.loading && (
            <p role="status" className="text-sm text-zinc-400">
              Đang tải tổng công tháng {monthKey}…
            </p>
          )}
          {validDate && month.error && (
            <ReadError
              message={month.error}
              retry={() => void month.reload()}
              disabled={busy || month.loading}
            />
          )}
          {month.snapshot && month.snapshot.key !== monthKey && (
            <p className="text-sm text-amber-400">
              Đang hiển thị tổng công tháng {month.snapshot.key} (chỉ xem).
            </p>
          )}
          {month.snapshot && <AttendanceChart rows={month.snapshot.items} />}
        </section>
      </main>
    </div>
  );
}

function IndividualForm({
  crews,
  personnel,
  date,
  disabled,
  onSubmit,
}: {
  crews: Crew[];
  personnel: Personnel[];
  date: string;
  disabled: boolean;
  onSubmit: (body: IndividualInput) => Promise<WriteResult>;
}) {
  const [crewId, setCrewId] = useState<number | "">("");
  const [personnelId, setPersonnelId] = useState<number | "">("");
  const [present, setPresent] = useState(true);
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);
  const currentDate = useRef(date);
  const id = useId();
  useEffect(() => {
    currentDate.current = date;
  }, [date]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || disabled) return;
    if (personnelId === "") {
      setError("Chọn nhân sự trước khi chấm công");
      return;
    }
    const targetDate = date;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await onSubmit({
        workDate: date,
        crewId: crewId === "" ? null : crewId,
        personnelId,
        present,
        hours: hours ? Number(hours) : null,
      });
      if (!mounted.current || currentDate.current !== targetDate) return;
      if (!result.ok) {
        if (result.error) setError(result.error);
        return;
      }
      setPersonnelId("");
      setHours("");
    } catch {
      if (mounted.current && currentDate.current === targetDate)
        setError("Mất kết nối — kiểm tra mạng rồi thử lại.");
    } finally {
      pending.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <fieldset
        disabled={disabled || saving}
        aria-busy={saving}
        aria-label="Chấm công theo người"
        className="min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2"
      >
        <legend className="sr-only">Chấm công theo người</legend>
        <p className="text-xs text-zinc-400">Chấm công theo người (tuỳ chọn) — {date}</p>
        <div className="grid grid-cols-2 gap-2">
          <label htmlFor={`${id}-crew`} className="min-w-0 block text-sm text-zinc-300">
            Tổ đội
            <select
              id={`${id}-crew`}
              value={crewId}
              onChange={(e) => setCrewId(e.target.value ? Number(e.target.value) : "")}
              aria-label="Tổ đội"
              className="mt-1 w-full min-w-0 min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            >
              <option value="">— Tổ đội (tuỳ chọn) —</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor={`${id}-personnel`} className="min-w-0 block text-sm text-zinc-300">
            Nhân sự
            <select
              id={`${id}-personnel`}
              value={personnelId}
              onChange={(e) => setPersonnelId(e.target.value ? Number(e.target.value) : "")}
              aria-label="Nhân sự"
              className="mt-1 w-full min-w-0 min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            >
              <option value="">— Chọn nhân sự —</option>
              {personnel.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 items-center">
          <label className="min-h-11 text-sm text-zinc-300 inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={present}
              onChange={(e) => setPresent(e.target.checked)}
            />
            Có mặt
          </label>
          <label htmlFor={`${id}-hours`} className="min-w-0 text-sm text-zinc-300">
            Giờ công
            <input
              id={`${id}-hours`}
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Giờ công"
              aria-label="Giờ công"
              className="mt-1 w-full min-w-0 min-h-11 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-base text-white"
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={disabled || saving}
          className="w-full min-h-11 justify-center"
        >
          {saving ? "Đang lưu…" : "Chấm công"}
        </Button>
      </fieldset>
    </form>
  );
}
