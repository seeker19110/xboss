"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Lock, Unlock, Download, RotateCcw, X } from "lucide-react";
import { Modal, appConfirm } from "@/app/components/dialogs";
import EmptyState from "@/app/components/EmptyState";
import { showToast } from "@/app/components/Toast";
import { formatDateDMY, formatDateTimeVN } from "@/lib/date";

type ManpowerRow = { crew: string; headcount: string; note: string };
type Diary = {
  id: number;
  status: "draft" | "locked";
  weatherAm: string | null;
  weatherPm: string | null;
  workDone: string | null;
  obstacles: string | null;
  safetyNote: string | null;
  lockedByName: string | null;
  lockedAt: string | null;
} | null;
type Prefill = {
  workDone: string;
  updatedBy: string[];
  photos: { id: number; taskId: number; taskCode: string; caption: string | null }[];
};

const WEATHER_CHIPS = ["Nắng", "Mưa", "Âm u"];

export default function DiaryEditorModal({
  date,
  role,
  crewSuggestions,
  onClose,
  onChanged,
}: {
  date: string;
  role: string;
  crewSuggestions: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [diary, setDiary] = useState<Diary>(null);
  const [prefill, setPrefill] = useState<Prefill>({ workDone: "", updatedBy: [], photos: [] });
  const [weatherAm, setWeatherAm] = useState("");
  const [weatherPm, setWeatherPm] = useState("");
  const [workDone, setWorkDone] = useState("");
  const [obstacles, setObstacles] = useState("");
  const [safetyNote, setSafetyNote] = useState("");
  const [manpower, setManpower] = useState<ManpowerRow[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const canEdit = role === "admin" || role === "pm" || role === "engineer";
  const canLock = role === "admin" || role === "pm";
  const canUnlock = role === "admin";
  const isLocked = diary?.status === "locked";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/diaries/${date}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setDiary(j.diary ?? null);
        setPrefill(j.prefill ?? { workDone: "", updatedBy: [], photos: [] });
        setWeatherAm(j.diary?.weatherAm ?? "");
        setWeatherPm(j.diary?.weatherPm ?? "");
        setWorkDone(j.diary?.workDone ?? j.prefill?.workDone ?? "");
        setObstacles(j.diary?.obstacles ?? "");
        setSafetyNote(j.diary?.safetyNote ?? "");
        setManpower(
          (j.manpower ?? []).map((m: { crew: string; headcount: number; note: string | null }) => ({
            crew: m.crew,
            headcount: String(m.headcount),
            note: m.note ?? "",
          })),
        );
        setSelectedPhotoIds(new Set<number>(j.photoIds ?? []));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [date]);

  const totalHeadcount = manpower.reduce((s, m) => s + (parseInt(m.headcount) || 0), 0);

  const addRow = () => setManpower((rows) => [...rows, { crew: "", headcount: "", note: "" }]);
  const removeRow = (i: number) => setManpower((rows) => rows.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<ManpowerRow>) =>
    setManpower((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const togglePhoto = (id: number) =>
    setSelectedPhotoIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/diaries/${date}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weatherAm: weatherAm || null,
          weatherPm: weatherPm || null,
          workDone: workDone || null,
          obstacles: obstacles || null,
          safetyNote: safetyNote || null,
          manpower: manpower
            .filter((m) => m.crew.trim())
            .map((m) => ({
              crew: m.crew.trim(),
              headcount: Number(m.headcount) || 0,
              note: m.note || null,
            })),
          photoIds: Array.from(selectedPhotoIds),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        showToast("Đã lưu nhật ký");
        setDiary(j.diary ?? diary);
        onChanged();
      } else {
        showToast(j.error ?? "Lỗi lưu nhật ký", "error");
      }
    } catch {
      showToast("Mất kết nối mạng — vui lòng thử lại", "error");
    } finally {
      setSaving(false);
    }
  };

  const lock = async () => {
    if (!(await appConfirm("Khoá sổ nhật ký ngày này? Sau khi khoá sẽ KHÔNG sửa được nữa.")))
      return;
    const r = await fetch(`/api/diaries/${date}/lock`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast("Đã khoá sổ");
      setDiary((d) => (d ? { ...d, status: "locked" } : d));
      onChanged();
    } else {
      showToast(j.error ?? "Lỗi khoá sổ", "error");
    }
  };

  const unlock = async () => {
    if (!(await appConfirm("Mở khoá nhật ký ngày này để sửa lại?"))) return;
    const r = await fetch(`/api/diaries/${date}/lock`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      showToast("Đã mở khoá");
      setDiary((d) => (d ? { ...d, status: "draft" } : d));
      onChanged();
    } else {
      showToast(j.error ?? "Lỗi mở khoá", "error");
    }
  };

  return (
    <Modal onClose={onClose} className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg">Nhật ký ngày {formatDateDMY(date)}</h3>
        <div className="flex items-center gap-2">
          {diary?.id && (
            <a
              href={`/api/diaries/${date}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm"
            >
              <Download className="w-4 h-4" /> Xuất PDF
            </a>
          )}
          <button onClick={onClose} aria-label="Đóng" className="text-zinc-400 hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-400 py-8 text-center">Đang tải…</p>
      ) : (
        <div className="space-y-4">
          {isLocked && (
            <div className="bg-emerald-950 border border-emerald-800 rounded-lg px-3 py-2 text-sm text-emerald-200 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              Đã khoá bởi {diary?.lockedByName ?? "—"} lúc{" "}
              {diary?.lockedAt ? formatDateTimeVN(diary.lockedAt) : "—"}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["Thời tiết sáng", weatherAm, setWeatherAm],
                ["Thời tiết chiều", weatherPm, setWeatherPm],
              ] as const
            ).map(([label, value, setter]) => (
              <div key={label}>
                <label className="text-xs text-zinc-400 mb-1 block">{label}</label>
                <div className="flex gap-1.5 mb-1.5 flex-wrap">
                  {WEATHER_CHIPS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={isLocked}
                      onClick={() => setter(c)}
                      className={`px-2.5 py-1 rounded-full text-xs border disabled:opacity-50 ${
                        value === c
                          ? "bg-sky-700 border-sky-600 text-white"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <input
                  value={value}
                  disabled={isLocked}
                  onChange={(e) => setter(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
                />
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-zinc-400 block">Công việc thực hiện</label>
              {!isLocked && (
                <button
                  type="button"
                  onClick={() => setWorkDone(prefill.workDone)}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                >
                  <RotateCcw className="w-3 h-3" /> Lấy lại từ hệ thống
                </button>
              )}
            </div>
            <textarea
              value={workDone}
              disabled={isLocked}
              onChange={(e) => setWorkDone(e.target.value)}
              rows={4}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
            />
            {prefill.updatedBy.length > 0 && (
              <p className="text-xs text-zinc-400 mt-1">
                Người cập nhật trong ngày: {prefill.updatedBy.join(", ")}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400">Nhân lực — tổng {totalHeadcount} người</span>
              {!isLocked && (
                <button
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                >
                  <Plus className="w-3 h-3" /> Thêm dòng
                </button>
              )}
            </div>
            <datalist id="crew-suggestions">
              {crewSuggestions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="space-y-2">
              {manpower.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input
                    value={row.crew}
                    disabled={isLocked}
                    onChange={(e) => updateRow(i, { crew: e.target.value })}
                    list="crew-suggestions"
                    placeholder="Tổ đội"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
                  />
                  <input
                    value={row.headcount}
                    disabled={isLocked}
                    onChange={(e) => updateRow(i, { headcount: e.target.value.replace(/\D/g, "") })}
                    inputMode="numeric"
                    placeholder="Số người"
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
                  />
                  <input
                    value={row.note}
                    disabled={isLocked}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    placeholder="Ghi chú"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
                  />
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      aria-label={`Xoá dòng nhân lực ${row.crew || i + 1}`}
                      className="p-2 text-zinc-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {manpower.length === 0 && (
                <p className="text-xs text-zinc-400">Chưa có dòng nhân lực nào.</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">
              Ảnh hiện trường trong ngày ({prefill.photos.length})
            </label>
            {prefill.photos.length === 0 ? (
              <EmptyState message="Không có ảnh nào chụp trong ngày" compact />
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {prefill.photos.map((p) => {
                  const checked = selectedPhotoIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isLocked}
                      onClick={() => togglePhoto(p.id)}
                      aria-pressed={checked}
                      aria-label={`Ảnh task ${p.taskCode}${checked ? " (đã chọn)" : ""}`}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 disabled:opacity-60 ${
                        checked ? "border-sky-500" : "border-zinc-700"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/photos/${p.id}`}
                        alt={`Ảnh task ${p.taskCode}`}
                        className="w-full h-full object-cover"
                      />
                      {checked && (
                        <span className="absolute top-1 right-1 bg-sky-600 text-on-accent rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                          ✓
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Vướng mắc / chỉ đạo</label>
            <textarea
              value={obstacles}
              disabled={isLocked}
              onChange={(e) => setObstacles(e.target.value)}
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">An toàn lao động</label>
            <textarea
              value={safetyNote}
              disabled={isLocked}
              onChange={(e) => setSafetyNote(e.target.value)}
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm outline-none focus:border-sky-500 disabled:opacity-60"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
            {!isLocked && canEdit && (
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 min-w-[120px] bg-sky-600 hover:bg-sky-700 disabled:opacity-50 py-2.5 rounded-lg text-sm font-medium text-on-accent"
              >
                {saving ? "Đang lưu…" : "Lưu nháp"}
              </button>
            )}
            {!isLocked && canLock && diary?.id && (
              <button
                onClick={lock}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-on-accent"
              >
                <Lock className="w-4 h-4" /> Khoá sổ
              </button>
            )}
            {isLocked && canUnlock && (
              <button
                onClick={unlock}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-800 hover:bg-amber-700 text-on-accent"
              >
                <Unlock className="w-4 h-4" /> Mở khoá
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
