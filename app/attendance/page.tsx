"use client";
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Trash2, Users, CalendarCheck } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import EmptyState from "@/app/components/EmptyState";
import { PageSkeleton } from "@/app/components/Skeleton";
import { appConfirm } from "@/app/components/dialogs";
import { showToast } from "@/app/components/Toast";
import { fetchMe, type Me } from "@/app/lib/me";
import { todayISO } from "@/lib/date";
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

export default function AttendancePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [crews, setCrews] = useState<Crew[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [items, setItems] = useState<AttendanceItem[]>([]);
  const [byDate, setByDate] = useState<ByDateRow[]>([]);
  const [busyCrewId, setBusyCrewId] = useState<number | null>(null);

  const canRecord = me?.role === "admin" || me?.role === "pm" || me?.role === "engineer";

  async function loadDay(d: string) {
    const res = await fetch(`/api/attendance?view=list&from=${d}&to=${d}`);
    const j = await res.json().catch(() => null);
    setItems(j?.items ?? []);
  }

  async function loadMonth(d: string) {
    const { from, to } = monthRange(d);
    const res = await fetch(`/api/attendance?view=byDate&from=${from}&to=${to}`);
    const j = await res.json().catch(() => null);
    setByDate(j?.byDate ?? []);
  }

  useEffect(() => {
    Promise.all([
      fetchMe(),
      fetch("/api/crews").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/personnel").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([meData, crewsRes, personnelRes]) => {
        if (!meData) return;
        setMe(meData);
        setCrews(crewsRes?.crews ?? []);
        setPersonnel(personnelRes?.personnel ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadDay(date);
    loadMonth(date);
  }, [date]);

  // Bản ghi "chấm gộp theo tổ" (personnelId null) của ngày đang chọn — 1 tổ tối đa 1 dòng.
  const groupedByCrew = useMemo(() => {
    const map = new Map<number, AttendanceItem>();
    for (const it of items) if (it.personnelId == null && it.crewId != null) map.set(it.crewId, it);
    return map;
  }, [items]);

  const individualItems = useMemo(() => items.filter((it) => it.personnelId != null), [items]);

  async function bumpCrew(crewId: number, delta: number) {
    if (!canRecord) return;
    setBusyCrewId(crewId);
    try {
      const existing = groupedByCrew.get(crewId);
      const nextHeadcount = Math.max(0, (existing?.headcount ?? 0) + delta);
      if (existing) {
        if (nextHeadcount === 0) {
          const res = await fetch(`/api/attendance/${existing.id}`, { method: "DELETE" });
          if (!res.ok) {
            showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
            return;
          }
        } else {
          const res = await fetch(`/api/attendance/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ headcount: nextHeadcount }),
          });
          if (!res.ok) {
            showToast((await res.json().catch(() => null))?.error ?? "Cập nhật thất bại", "error");
            return;
          }
        }
      } else if (nextHeadcount > 0) {
        const res = await fetch("/api/attendance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workDate: date, crewId, headcount: nextHeadcount }),
        });
        if (!res.ok) {
          showToast((await res.json().catch(() => null))?.error ?? "Chấm công thất bại", "error");
          return;
        }
      }
      await Promise.all([loadDay(date), loadMonth(date)]);
    } finally {
      setBusyCrewId(null);
    }
  }

  async function deleteItem(id: number) {
    if (!(await appConfirm("Xoá bản ghi chấm công này? Không thể hoàn tác.", { danger: true })))
      return;
    const res = await fetch(`/api/attendance/${id}`, { method: "DELETE" });
    if (!res.ok) {
      showToast((await res.json().catch(() => null))?.error ?? "Xoá thất bại", "error");
      return;
    }
    await Promise.all([loadDay(date), loadMonth(date)]);
  }

  if (loading) return <PageSkeleton />;

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
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400 flex items-center gap-2">
            Ngày
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
              aria-label="Chọn ngày chấm công"
            />
          </label>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-center ml-auto">
            <p className="text-lg font-bold text-emerald-400">{totalToday}</p>
            <p className="text-xs text-zinc-400">Tổng nhân công ngày này</p>
          </div>
        </div>

        {crews.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Chưa có tổ đội"
            message="Vào trang Nhân sự để tạo tổ đội trước khi chấm công."
          />
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800/60">
            {crews.map((c) => {
              const rec = groupedByCrew.get(c.id);
              const headcount = rec?.headcount ?? 0;
              return (
                <div key={c.id} className="flex items-center justify-between p-3 gap-3">
                  <span className="text-sm truncate">{c.name}</span>
                  {canRecord ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => bumpCrew(c.id, -1)}
                        disabled={busyCrewId === c.id || headcount <= 0}
                        aria-label={`Giảm số người tổ ${c.name}`}
                        className="w-10 h-10 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-white"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-semibold tabular-nums">
                        {headcount}
                      </span>
                      <button
                        onClick={() => bumpCrew(c.id, 1)}
                        disabled={busyCrewId === c.id}
                        aria-label={`Tăng số người tổ ${c.name}`}
                        className="w-10 h-10 flex items-center justify-center rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-on-accent"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="font-semibold tabular-nums">{headcount}</span>
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
            onSaved={() => {
              loadDay(date);
              loadMonth(date);
            }}
          />
        )}

        {individualItems.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
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
                    <tr key={it.id} className="border-b border-zinc-800/60 last:border-0">
                      <td className="p-3">{it.personnelName ?? "—"}</td>
                      <td className="p-3">
                        {it.present === false ? (
                          <span className="text-rose-400">Vắng</span>
                        ) : (
                          <span className="text-emerald-400">Có mặt</span>
                        )}
                      </td>
                      <td className="p-3 text-zinc-400">{it.hours ?? "—"}</td>
                      <td className="p-3">
                        {canRecord && (
                          <button
                            onClick={() => deleteItem(it.id)}
                            aria-label="Xoá bản ghi"
                            className="text-zinc-400 hover:text-rose-400"
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

        <section aria-label="Tổng công theo tháng" className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" /> Tổng công theo tháng
          </h2>
          <AttendanceChart rows={byDate} />
        </section>
      </main>
    </div>
  );
}

function IndividualForm({
  crews,
  personnel,
  date,
  onSaved,
}: {
  crews: Crew[];
  personnel: Personnel[];
  date: string;
  onSaved: () => void;
}) {
  const [crewId, setCrewId] = useState<number | "">("");
  const [personnelId, setPersonnelId] = useState<number | "">("");
  const [present, setPresent] = useState(true);
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (personnelId === "") {
      showToast("Chọn nhân sự trước khi chấm công", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate: date,
          crewId: crewId === "" ? null : crewId,
          personnelId,
          present,
          hours: hours ? Number(hours) : null,
        }),
      });
      if (!res.ok) {
        showToast((await res.json().catch(() => null))?.error ?? "Chấm công thất bại", "error");
        return;
      }
      setPersonnelId("");
      setHours("");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <p className="text-xs text-zinc-400">Chấm công theo người (tuỳ chọn)</p>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={crewId}
          onChange={(e) => setCrewId(e.target.value ? Number(e.target.value) : "")}
          aria-label="Tổ đội"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">— Tổ đội (tuỳ chọn) —</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={personnelId}
          onChange={(e) => setPersonnelId(e.target.value ? Number(e.target.value) : "")}
          aria-label="Nhân sự"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">— Chọn nhân sự —</option>
          {personnel.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 items-center">
        <label className="text-sm text-zinc-300 inline-flex items-center gap-2">
          <input type="checkbox" checked={present} onChange={(e) => setPresent(e.target.checked)} />
          Có mặt
        </label>
        <input
          type="number"
          step="0.5"
          min="0"
          max="24"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="Giờ công"
          aria-label="Giờ công"
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white"
        />
      </div>
      <button
        onClick={submit}
        disabled={saving}
        className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-on-accent font-semibold py-2 rounded-lg text-sm"
      >
        {saving ? "Đang lưu…" : "Chấm công"}
      </button>
    </div>
  );
}
