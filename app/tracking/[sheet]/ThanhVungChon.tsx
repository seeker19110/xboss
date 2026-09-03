"use client";
import { Check, Square, Undo2, Redo2, X } from "lucide-react";

// Thanh thao tác cho vùng ô đang chọn (M121 §13). Chỉ hiện khi có vùng — không chiếm chỗ
// thường trực trên lưới vốn đã rất dày.
//
// A11y (NFR2): số ô đã chọn nói bằng CHỮ trong `aria-live`, không chỉ bằng viền màu — người
// dùng đọc màn hình và người khó phân biệt màu vẫn biết mình đang chọn bao nhiêu ô.
// Nút cao 40px theo ADR-0009; emerald = hành động chính, đúng quy ước màu của dự án.
export function ThanhVungChon({
  soO,
  dangGui,
  coTheHoanTac,
  coTheLamLai,
  onTick,
  onBoTick,
  onBoChon,
  onHoanTac,
  onLamLai,
}: {
  soO: number;
  dangGui: boolean;
  coTheHoanTac: boolean;
  coTheLamLai: boolean;
  onTick: () => void;
  onBoTick: () => void;
  onBoChon: () => void;
  onHoanTac: () => void;
  onLamLai: () => void;
}) {
  const nut =
    "h-10 px-3 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed";
  return (
    <div
      // print-hidden: thanh thao tác không có nghĩa gì trên bản in A3 mang ra công trường.
      className="print-hidden sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t border-zinc-800 bg-zinc-900/95 px-3 py-2 backdrop-blur"
    >
      <span aria-live="polite" className="text-sm text-zinc-300">
        Đã chọn <strong className="text-emerald-400">{soO}</strong> ô
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          onClick={onTick}
          disabled={dangGui || soO === 0}
          aria-label={`Tick ${soO} ô đã chọn`}
          className={`${nut} bg-emerald-700 hover:bg-emerald-800 text-white`}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          Tick vùng
        </button>
        <button
          onClick={onBoTick}
          disabled={dangGui || soO === 0}
          aria-label={`Bỏ tick ${soO} ô đã chọn`}
          className={`${nut} bg-zinc-800 hover:bg-zinc-700 text-zinc-100`}
        >
          <Square className="h-4 w-4" aria-hidden="true" />
          Bỏ tick vùng
        </button>
        <button
          onClick={onHoanTac}
          disabled={dangGui || !coTheHoanTac}
          title="Hoàn tác (Ctrl+Z)"
          aria-label="Hoàn tác thao tác tick gần nhất (Ctrl+Z)"
          className={`${nut} bg-zinc-800 hover:bg-zinc-700 text-zinc-100`}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Hoàn tác
        </button>
        <button
          onClick={onLamLai}
          disabled={dangGui || !coTheLamLai}
          title="Làm lại (Ctrl+Shift+Z)"
          aria-label="Làm lại thao tác tick vừa hoàn tác (Ctrl+Shift+Z)"
          className={`${nut} bg-zinc-800 hover:bg-zinc-700 text-zinc-100`}
        >
          <Redo2 className="h-4 w-4" aria-hidden="true" />
          Làm lại
        </button>
        <button
          onClick={onBoChon}
          aria-label="Bỏ chọn vùng"
          className={`${nut} bg-zinc-800 hover:bg-zinc-700 text-zinc-400`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Bỏ chọn
        </button>
      </div>
    </div>
  );
}
