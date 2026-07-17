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
    <div className="px-6 py-3 flex flex-wrap gap-3 items-center border-b border-zinc-800/60 no-print">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-zinc-500" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Tìm nhóm/tầng..."
          className="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56 outline-none focus:border-emerald-600"
        />
      </div>
      <select
        value={floorFilter}
        onChange={(e) => onFloorFilterChange(e.target.value)}
        aria-label="Lọc theo tầng"
        className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none"
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
        className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none"
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
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800"
        >
          <Plus className="w-4 h-4" /> Thêm hạng mục
        </button>
      )}
      <span className="text-xs text-zinc-400 ml-auto">
        {packagesCount} nhóm · bấm vào nhóm để mở lưới checkbox
      </span>
    </div>
  );
}
