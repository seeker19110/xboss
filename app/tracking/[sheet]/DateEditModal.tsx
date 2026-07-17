import { useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/app/components/dialogs";

// Sửa ngày bắt đầu/kết thúc — dùng cho 1 task hoặc nhiều task cùng lúc (bulk).
export function DateEditModal({
  target,
  onSave,
  onClose,
}: {
  target: { ids: number[]; init: { start: string; end: string } };
  onSave: (ids: number[], start: string, end: string) => void;
  onClose: () => void;
}) {
  const [start, setStart] = useState(target.init.start);
  const [end, setEnd] = useState(target.init.end);
  const [saving, setSaving] = useState(false);
  const bulk = target.ids.length > 1;
  const invalid = !!start && !!end && end < start;

  return (
    <Modal onClose={onClose} className="max-w-sm">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
        <h3 className="font-semibold text-sm">
          📅 {bulk ? `Đặt ngày cho ${target.ids.length} task` : "Sửa ngày bắt đầu / kết thúc"}
        </h3>
        <button onClick={onClose} className="ml-auto text-zinc-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        {bulk && (
          <p className="text-xs text-zinc-500">
            Ô để trống sẽ giữ nguyên ngày hiện tại của từng task.
          </p>
        )}
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
          <label className="text-xs text-zinc-400">Ngày kết thúc (deadline)</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 [color-scheme:dark]"
          />
        </div>
        {invalid && <p className="text-xs text-red-400">Ngày kết thúc phải sau ngày bắt đầu.</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => {
              setSaving(true);
              onSave(target.ids, start, end);
            }}
            disabled={saving || invalid || (!start && !end)}
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
