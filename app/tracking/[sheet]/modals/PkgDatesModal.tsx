"use client";
// Tách nguyên văn khỏi TrackingGrid.tsx (M121 PR1) — không đổi hành vi.
import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";
import CustomFieldsSection from "@/app/components/CustomFieldsSection";
import type { Pkg } from "../types";

// Modal sửa ngày bắt đầu / kết thúc cho toàn nhóm công việc.
export function PkgDatesModal({
  pkg,
  canEdit,
  onSave,
  onClose,
}: {
  pkg: Pkg;
  canEdit: boolean;
  onSave: (start: string, end: string, syncTasks: boolean) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(pkg.startDate ?? "");
  const [end, setEnd] = useState(pkg.endDate ?? "");
  const [syncTasks, setSyncTasks] = useState(false);
  const [saving, setSaving] = useState(false);
  const invalid = !!start && !!end && end < start;
  const days = (() => {
    if (!start || !end) return null;
    const d = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000);
    return d >= 0 ? d + 1 : null;
  })();

  return (
    <Modal onClose={onClose} className="max-w-sm">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-emerald-400" />
        <h3 className="font-semibold text-sm">Ngày thi công — {pkg.code}</h3>
        <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="text-xs text-zinc-400">Ngày bắt đầu</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400">Ngày kết thúc</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]"
          />
        </div>
        {days != null && (
          <p className="text-xs text-zinc-400 text-center">
            ⏱ <b className="text-white">{days}</b> ngày thi công
          </p>
        )}
        {invalid && <p className="text-xs text-red-400">Ngày kết thúc phải sau ngày bắt đầu.</p>}
        <p className="text-[11px] text-zinc-500">
          Task con chưa có ngày riêng sẽ hiển thị ngày này (kế thừa).
        </p>
        <label className="flex items-start gap-2 text-xs text-zinc-300 cursor-pointer bg-zinc-800/40 border border-zinc-700 rounded-lg px-3 py-2">
          <input
            type="checkbox"
            checked={syncTasks}
            onChange={(e) => setSyncTasks(e.target.checked)}
            className="w-3.5 h-3.5 accent-emerald-500 mt-0.5 shrink-0"
          />
          <span>
            Đồng bộ ngày cho <b>toàn bộ {pkg.tasks.length} task</b> trong nhóm
            <span className="block text-[11px] text-zinc-500">
              Xoá ngày riêng của task để tất cả kế thừa ngày nhóm. Sau đó vẫn sửa được ngày từng
              task.
            </span>
          </span>
        </label>
        <CustomFieldsSection
          entityType="work_package"
          apiPath={`/api/workpackages/${pkg.id}`}
          value={pkg.custom}
          canEdit={canEdit}
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              setSaving(true);
              onSave(start, end, syncTasks);
            }}
            disabled={saving || invalid}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500 rounded-lg py-2 text-sm font-medium transition"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
          <button
            onClick={onClose}
            className="px-4 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm"
          >
            Huỷ
          </button>
        </div>
      </div>
    </Modal>
  );
}
