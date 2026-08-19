import { Search, Plus } from "lucide-react";
import { STATUS_LABEL } from "@/lib/status";

export function TrackingToolbar({
  query,
  onQueryChange,
  floorFilter,
  onFloorFilterChange,
  floors,
  statusFilter,
  onStatusFilterChange,
  showAddPkg,
  onAddPkg,
  packagesCount,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  floorFilter: string;
  onFloorFilterChange: (v: string) => void;
  floors: string[];
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  showAddPkg: boolean;
  onAddPkg: () => void;
  packagesCount: number;
}) {
  return (
    <div className="px-4 sm:px-6 py-3 flex flex-wrap gap-3 items-center border-b border-zinc-800/80 bg-zinc-900/60 no-print">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Tìm nhóm / tầng..."
          className="bg-zinc-800/90 border border-zinc-700/80 rounded-xl pl-9 pr-3 py-2 text-sm w-48 sm:w-60 outline-none focus:border-emerald-500 transition"
        />
      </div>
      <select
        value={floorFilter}
        onChange={(e) => onFloorFilterChange(e.target.value)}
        aria-label="Lọc theo tầng"
        className="bg-zinc-800/90 border border-zinc-700/80 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 transition"
      >
        <option value="">Tất cả tầng</option>
        {floors.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        aria-label="Lọc theo trạng thái"
        className="bg-zinc-800/90 border border-zinc-700/80 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500 transition"
      >
        <option value="">Tất cả trạng thái</option>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {showAddPkg && (
        <button
          onClick={onAddPkg}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white shadow-sm transition min-h-[38px]"
        >
          <Plus className="w-4 h-4" /> Thêm hạng mục
        </button>
      )}
      <span className="text-xs text-zinc-400 ml-auto hidden sm:inline">
        {packagesCount} nhóm · bấm vào nhóm để mở lưới checkbox
      </span>
    </div>
  );
}
