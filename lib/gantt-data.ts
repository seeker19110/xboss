// Dữ liệu chung để dựng CPM (đường găng) cấp nhóm việc — dùng bởi cả `/api/gantt` và
// `/api/schedule-control` (M36 PR3), tránh lặp SQL dựng nodes/edges của `lib/cpm.ts`.
// Trích nguyên logic dựng `bars`/`deps` đã có trong `app/api/gantt/route.ts`.
import { query } from "@/lib/db";
import type { CpmNode, CpmEdge } from "@/lib/cpm";

export type PackageMeta = {
  id: number;
  code: string;
  name: string;
  floorLabel: string | null;
  startDate: string;
  endDate: string;
  progress: number;
  status: string;
  sheetType: string;
  sheetSlug: string | null;
};

// Cạnh phụ thuộc kèm thông tin việc trước (predCode/predProgress) — dùng để hiển thị
// (vd panel "bị chặn" của Gantt), đồng thời cấu trúc đủ để dùng thẳng làm `CpmEdge[]`.
export type DepRow = CpmEdge & { predCode: string; predProgress: number };

const DAY_MS = 86400_000;
const d2n = (s: string) => new Date(s + "T00:00:00Z").getTime();

// Dựng CpmNode[]/CpmEdge[] cho `computeCpm` + map thông tin đầy đủ từng nhóm (meta) —
// lọc theo hệ nếu có `systemId` (null = toàn dự án). `meta` giữ đúng thứ tự sort gốc
// (st.id, wp.start_date, wp.id) nên `[...meta.values()]` dùng lại được như mảng `bars` cũ.
export async function getCpmData(systemId: number | null): Promise<{
  nodes: CpmNode[];
  edges: DepRow[];
  meta: Map<number, PackageMeta>;
}> {
  const systemFilter = systemId !== null ? "AND st.system_id = ?" : "";
  const systemParams = systemId !== null ? [systemId] : [];

  const bars = await query<PackageMeta>(
    `SELECT wp.id, wp.code, wp.name, wp.floor_label AS "floorLabel",
            wp.start_date AS "startDate", wp.end_date AS "endDate",
            wp.progress, wp.status, st.code AS "sheetType", st.slug AS "sheetSlug"
       FROM work_packages wp
       JOIN sheet_types st ON wp.sheet_type_id = st.id
      WHERE wp.start_date IS NOT NULL AND wp.end_date IS NOT NULL
        ${systemFilter}
      ORDER BY st.id, wp.start_date, wp.id`,
    ...systemParams,
  );

  // Phụ thuộc không lọc theo hệ (giữ nguyên hành vi gốc — việc trước có thể thuộc hệ
  // khác, vẫn cần biết để hiển thị "bị chặn"); `computeCpm` tự bỏ qua cạnh trỏ tới nút
  // không có trong `nodes` (xem lib/cpm.ts).
  const edges = await query<DepRow>(
    `SELECT d.id, d.predecessor_id AS "predecessorId", d.successor_id AS "successorId",
            p.code AS "predCode", p.progress AS "predProgress"
       FROM package_dependencies d
       JOIN work_packages p ON d.predecessor_id = p.id`,
  );

  const meta = new Map<number, PackageMeta>(bars.map((b) => [b.id, b]));
  const nodes: CpmNode[] = bars
    .filter((b) => b.startDate && b.endDate)
    .map((b) => ({
      id: b.id,
      duration: Math.max(1, (d2n(b.endDate) - d2n(b.startDate)) / DAY_MS + 1),
    }));

  return { nodes, edges, meta };
}
