import { Search, Plus } from "lucide-react";
import { STATUS_LABEL } from "@/lib/tien-do/status";
import { Button } from "@/app/components/ui";

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
  const hasFilter = query || floorFilter || statusFilter;

  return (
    <div className="sticky top-12 z-20 px-4 sm:px-6 py-3 flex flex-wrap gap-2.5 items-center border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md no-print">
      <div className="relative flex-1 sm:flex-initial min-w-[180px] max-w-xs">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Tìm công việc / tầng..."
          aria-label="Tìm kiếm trong bảng tracking"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition h-10"
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={floorFilter}
          onChange={(e) => onFloorFilterChange(e.target.value)}
          aria-label="Lọc theo tầng"
          className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition h-10"
        >
          <option value="">Tất cả tầng ({floors.length})</option>
          {floors.map((f) => (
            <option key={f} value={f}>
              Tầng {f}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          aria-label="Lọc theo trạng thái"
          className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-lg px-3 py-2 text-xs sm:text-sm outline-none focus:border-emerald-500 transition h-10"
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        {hasFilter && (
          <button
            onClick={() => {
              onQueryChange("");
              onFloorFilterChange("");
              onStatusFilterChange("");
            }}
            className="text-xs text-zinc-400 hover:text-rose-300 px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 transition"
          >
            Xóa bộ lọc
          </button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="text-xs text-zinc-400 font-medium hidden md:inline font-mono">
          {packagesCount} nhóm công việc
        </span>

        {showAddPkg && (
          <Button variant="primary" icon={Plus} onClick={onAddPkg}>
            Thêm hạng mục
          </Button>
        )}
      </div>
    </div>
  );
}
