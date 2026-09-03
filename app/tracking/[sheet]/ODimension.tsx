"use client";
import { StickyNote } from "lucide-react";
import { moTaSuKienO } from "./moTaSuKienO";
import type { Cell } from "./types";

// Một ô dimension trên lưới tracking — checkbox + dấu vết tick (M120) + trạng thái vùng
// chọn (M121). Tách khỏi `TrackingGrid.tsx` vì đây là phần được sửa nhiều nhất và đáng có
// ranh giới riêng; file lưới chỉ còn lo bố cục bảng.
export function ODimension({
  cell,
  nhanCot,
  tenTask,
  editMode,
  daChon,
  anKhiIn,
  onToggle,
  onPointerDown,
  onPointerEnter,
  onPointerUp,
}: {
  /** `undefined` = ô không có thật (lưới thưa: task thêm sau chưa đủ cột) → hiện dấu "·". */
  cell: Cell | undefined;
  nhanCot: string;
  tenTask: string;
  editMode: boolean;
  daChon: boolean;
  anKhiIn: boolean;
  onToggle: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerEnter: () => void;
  onPointerUp: () => void;
}) {
  return (
    <td
      // Vùng chọn: viền + nền emerald. Số ô đã chọn còn được nói bằng CHỮ ở ThanhVungChon —
      // không truyền tin chỉ bằng màu (M121 NFR2).
      className={`border-b border-zinc-800/60 text-center align-middle p-0${anKhiIn ? " print-hidden-col" : ""}${
        daChon ? " bg-emerald-500/10 outline outline-2 -outline-offset-2 outline-emerald-400" : ""
      }`}
      // Pointer Events: một đường code cho cả chuột lẫn ngón tay. `SpreadsheetGrid` cũ chỉ có
      // mouse nên không chọn vùng được trên điện thoại — mà đó mới là nơi kỹ sư tick.
      onPointerDown={onPointerDown}
      onPointerEnter={onPointerEnter}
      onPointerUp={onPointerUp}
    >
      {cell ? (
        <label
          className={`relative flex items-center justify-center w-full h-full min-h-[44px] ${editMode ? "cursor-pointer" : "cursor-default"}`}
          title={moTaSuKienO(cell)}
        >
          <input
            type="checkbox"
            checked={cell.installed}
            onChange={() => editMode && onToggle()}
            disabled={!editMode}
            // Dữ liệu sự kiện đưa thẳng vào aria-label thay vì chỉ `title`: `title` chỉ hiện khi
            // rê chuột, người dùng bàn phím/đọc màn hình sẽ không bao giờ nghe được (M120 NFR3).
            aria-label={`${nhanCot} · ${tenTask}${cell.installed ? ` · ${moTaSuKienO(cell)}` : ""}`}
            className={`w-4 h-4 accent-emerald-500 ${editMode ? "cursor-pointer" : "cursor-default opacity-60"}`}
          />
          {cell.note ? (
            // Ô có ghi chú: đánh dấu bằng ICON, không chỉ bằng màu (M120 NFR3).
            // aria-hidden vì nội dung ghi chú đã nằm trong aria-label ở trên.
            <StickyNote
              className="absolute top-0.5 right-0.5 w-3 h-3 text-amber-400"
              aria-hidden="true"
            />
          ) : null}
        </label>
      ) : (
        <span className="flex items-center justify-center min-h-[44px] text-zinc-700">·</span>
      )}
    </td>
  );
}
