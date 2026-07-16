// lib/reports.ts — M47 PR3: báo cáo lưu được (saved_reports).
//
// Whitelist nguồn báo cáo TĨNH — người dùng KHÔNG viết SQL tự do, chỉ chọn 1 `source`
// trong danh sách dưới đây + bộ lọc/sắp xếp đã khai báo sẵn. Mỗi nguồn tự mô tả:
//   - label tiếng Việt + vai trò được xem (nguồn tiền chỉ role xem tài chính)
//   - cột (key + nhãn + kiểu hiển thị) — cố định theo nguồn (bảng phẳng, không pivot)
//   - bộ lọc cho phép (whitelist key) để validate `config.filters`
//   - runner(projectId, filters) → hàng dữ liệu (truy vấn tham số hoá qua lib/db)
//
// `config` lưu trong DB đã đi qua validateConfig → chặn source lạ, filter key lạ, cột
// sort lạ (route trả 422). Sắp xếp áp ở JS trên kết quả (bảng cỡ báo cáo, không phân
// trang) để mọi cột đều sort được đồng nhất. Tiền: SUM trong SQL, cast ::text →
// lib/money.ts (không cộng tiền trên float JS).
import { query } from "@/lib/db";
import { moneyToNumber, parseMoney } from "@/lib/money";
import { resolveSystemId } from "@/lib/systems";
import { PAYMENT_VIEW_ROLES, type Role } from "@/lib/roles";

export type ReportColumnKind = "text" | "number" | "money" | "percent" | "date";
export type ReportColumn = { key: string; label: string; kind: ReportColumnKind };
export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;
export type ReportSort = { column: string; dir: "asc" | "desc" };
export type ReportConfig = { filters?: Record<string, ReportCell>; sort?: ReportSort };
export type ReportResult = { columns: ReportColumn[]; rows: ReportRow[] };

// Định nghĩa 1 bộ lọc: 'select' phải khớp options; 'text' là ILIKE; 'number' hữu hạn.
type FilterDef =
  | { key: string; label: string; kind: "text" }
  | { key: string; label: string; kind: "number" }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] };

type ReportSource = {
  key: string;
  label: string;
  // Vai trò được xem nguồn này; mặc định mọi vai trò. Nguồn tiền giới hạn PAYMENT_VIEW_ROLES.
  canView: (role: Role) => boolean;
  columns: ReportColumn[];
  filters: FilterDef[];
  run: (projectId: number | null, filters: Record<string, ReportCell>) => Promise<ReportRow[]>;
};

const MATERIAL_STATUS: { value: string; label: string }[] = [
  { value: "dat_hang", label: "Đặt hàng" },
  { value: "ve_kho", label: "Về kho" },
  { value: "da_dung", label: "Đã dùng" },
];

// Điều kiện + tham số lọc dự án dùng chung — projectId null (DB chưa có dự án) → không lọc.
function projectScope(projectId: number | null, alias: string) {
  return projectId != null
    ? {
        join: `JOIN towers tw ON tw.id = ${alias}.tower_id`,
        cond: "AND tw.project_id = ?",
        args: [projectId],
      }
    : { join: "", cond: "", args: [] as number[] };
}

const SOURCES: Record<string, ReportSource> = {
  progress_by_system: {
    key: "progress_by_system",
    label: "Tiến độ theo hệ",
    canView: () => true,
    columns: [
      { key: "system", label: "Hệ", kind: "text" },
      { key: "totalTasks", label: "Số công việc", kind: "number" },
      { key: "avgProgress", label: "Tiến độ TB", kind: "percent" },
      { key: "delayed", label: "Trễ", kind: "number" },
    ],
    filters: [],
    async run(projectId) {
      return query<ReportRow>(
        `SELECT COALESCE(sy.name, 'Chưa gán hệ') AS system,
                COUNT(t.id) AS "totalTasks",
                COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
                COUNT(*) FILTER (WHERE t.status = 'tre') AS delayed
           FROM tasks t
           JOIN work_packages wp ON t.package_id = wp.id
           JOIN sheet_types st ON wp.sheet_type_id = st.id
           JOIN towers tw ON tw.id = st.tower_id
           LEFT JOIN systems sy ON sy.id = st.system_id
          WHERE 1=1 ${projectId != null ? "AND tw.project_id = ?" : ""}
          GROUP BY sy.id, sy.name
          ORDER BY system`,
        ...(projectId != null ? [projectId] : []),
      ).then((rows) =>
        // AVG trả 0..1 → phần trăm 1 chữ số thập phân cho hiển thị.
        rows.map((r) => ({ ...r, avgProgress: Math.round(Number(r.avgProgress) * 1000) / 10 })),
      );
    },
  },

  late_tasks: {
    key: "late_tasks",
    label: "Công việc trễ",
    canView: () => true,
    columns: [
      { key: "code", label: "Mã", kind: "text" },
      { key: "name", label: "Tên", kind: "text" },
      { key: "sheet", label: "Sheet", kind: "text" },
      { key: "endDate", label: "Hạn KT", kind: "date" },
      { key: "progress", label: "Tiến độ", kind: "percent" },
      { key: "assignee", label: "Phụ trách", kind: "text" },
    ],
    filters: [{ key: "system", label: "Hệ", kind: "text" }],
    async run(projectId, filters) {
      const systemId = filters.system ? await resolveSystemId(String(filters.system)) : null;
      const sc = projectScope(projectId, "st");
      const rows = await query<ReportRow & { progress: number }>(
        `SELECT t.code, t.name, st.code AS sheet, t.end_date AS "endDate",
                t.progress_percent AS progress, u.name AS assignee
           FROM tasks t
           JOIN work_packages wp ON t.package_id = wp.id
           JOIN sheet_types st ON wp.sheet_type_id = st.id
           ${sc.join}
           LEFT JOIN users u ON u.id = t.assigned_to
          WHERE t.status = 'tre'
            ${systemId != null ? "AND st.system_id = ?" : ""}
            ${sc.cond}
          ORDER BY t.end_date`,
        ...(systemId != null ? [systemId] : []),
        ...sc.args,
      );
      return rows.map((r) => ({ ...r, progress: Math.round(Number(r.progress) * 1000) / 10 }));
    },
  },

  cost_by_month: {
    key: "cost_by_month",
    label: "Chi phí thực chi theo tháng",
    canView: (role) => PAYMENT_VIEW_ROLES.includes(role),
    columns: [
      { key: "month", label: "Tháng", kind: "text" },
      { key: "actual", label: "Thực chi", kind: "money" },
    ],
    filters: [],
    async run(projectId) {
      // Thực chi = payment_bills theo paid_date; quy dự án qua sheet_types như lib/cost.ts.
      const rows = await query<{ month: string; total: string }>(
        `SELECT to_char(pb.paid_date, 'YYYY-MM') AS month, SUM(pb.amount)::text AS total
           FROM payment_bills pb
           ${projectId != null ? "JOIN sheet_types st ON st.id = pb.sheet_type_id JOIN towers tw ON tw.id = st.tower_id" : ""}
          WHERE pb.paid_date IS NOT NULL
            ${projectId != null ? "AND tw.project_id = ?" : ""}
          GROUP BY month ORDER BY month`,
        ...(projectId != null ? [projectId] : []),
      );
      return rows.map((r) => ({ month: r.month, actual: moneyToNumber(parseMoney(r.total)) }));
    },
  },

  materials: {
    key: "materials",
    label: "Vật tư",
    canView: () => true,
    columns: [
      { key: "boqCode", label: "BOQCODE", kind: "text" },
      { key: "name", label: "Tên vật tư", kind: "text" },
      { key: "unit", label: "ĐVT", kind: "text" },
      { key: "qtyBoq", label: "KL BOQ", kind: "number" },
      { key: "qtyUsed", label: "Đã dùng", kind: "number" },
      { key: "status", label: "Trạng thái", kind: "text" },
    ],
    filters: [{ key: "status", label: "Trạng thái", kind: "select", options: MATERIAL_STATUS }],
    async run(projectId, filters) {
      const status = filters.status ? String(filters.status) : null;
      const rows = await query<ReportRow>(
        `SELECT m.boq_code AS "boqCode", m.name, m.unit,
                m.qty_boq AS "qtyBoq", m.qty_used AS "qtyUsed",
                COALESCE(m.status, 'dat_hang') AS status
           FROM materials m
          WHERE 1=1
            ${projectId != null ? "AND m.project_id = ?" : ""}
            ${status != null ? "AND COALESCE(m.status, 'dat_hang') = ?" : ""}
          ORDER BY m.boq_code`,
        ...(projectId != null ? [projectId] : []),
        ...(status != null ? [status] : []),
      );
      // Nhãn trạng thái tiếng Việt cho hiển thị/xuất.
      const label = new Map(MATERIAL_STATUS.map((s) => [s.value, s.label]));
      return rows.map((r) => ({ ...r, status: label.get(String(r.status)) ?? String(r.status) }));
    },
  },
};

// ── API dùng cho route/UI ────────────────────────────────────────────────────

export function listSourcesFor(role: Role) {
  return Object.values(SOURCES)
    .filter((s) => s.canView(role))
    .map((s) => ({ key: s.key, label: s.label, columns: s.columns, filters: s.filters }));
}

export function getSource(key: string): ReportSource | null {
  return SOURCES[key] ?? null;
}

// Validate `config` theo nguồn. Throw Error (message tiếng Việt) khi sai → route trả 422.
// Chuẩn hoá luôn: bỏ filter rỗng, trả object gọn để lưu.
export function validateConfig(sourceKey: string, config: unknown): ReportConfig {
  const src = SOURCES[sourceKey];
  if (!src) throw new Error(`Nguồn báo cáo không hợp lệ: ${sourceKey}`);
  if (config == null || typeof config !== "object" || Array.isArray(config))
    throw new Error("Cấu hình báo cáo phải là đối tượng");
  const c = config as Record<string, unknown>;
  for (const k of Object.keys(c))
    if (k !== "filters" && k !== "sort") throw new Error(`Trường cấu hình không hợp lệ: ${k}`);

  const out: ReportConfig = {};

  if (c.filters != null) {
    if (typeof c.filters !== "object" || Array.isArray(c.filters))
      throw new Error("filters phải là đối tượng");
    const raw = c.filters as Record<string, unknown>;
    const filters: Record<string, ReportCell> = {};
    for (const [key, val] of Object.entries(raw)) {
      const def = src.filters.find((f) => f.key === key);
      if (!def) throw new Error(`Bộ lọc không hợp lệ cho nguồn này: ${key}`);
      if (val === "" || val == null) continue; // bỏ lọc rỗng
      if (def.kind === "number") {
        const n = Number(val);
        if (!Number.isFinite(n)) throw new Error(`Bộ lọc ${def.label} phải là số`);
        filters[key] = n;
      } else if (def.kind === "select") {
        const v = String(val);
        if (!def.options.some((o) => o.value === v))
          throw new Error(`Giá trị lọc ${def.label} không hợp lệ`);
        filters[key] = v;
      } else {
        filters[key] = String(val);
      }
    }
    if (Object.keys(filters).length > 0) out.filters = filters;
  }

  if (c.sort != null) {
    const s = c.sort as Record<string, unknown>;
    const column = String(s.column ?? "");
    const dir = String(s.dir ?? "asc");
    if (!src.columns.some((col) => col.key === column))
      throw new Error(`Cột sắp xếp không hợp lệ: ${column}`);
    if (dir !== "asc" && dir !== "desc") throw new Error("Chiều sắp xếp phải là asc/desc");
    out.sort = { column, dir };
  }

  return out;
}

// Chạy 1 báo cáo: validate lại config (phòng dữ liệu cũ), truy vấn, sắp xếp ở JS.
export async function runReport(
  sourceKey: string,
  config: unknown,
  projectId: number | null,
): Promise<ReportResult> {
  const src = SOURCES[sourceKey];
  if (!src) throw new Error(`Nguồn báo cáo không hợp lệ: ${sourceKey}`);
  const cfg = validateConfig(sourceKey, config);
  const rows = await src.run(projectId, cfg.filters ?? {});

  if (cfg.sort) {
    const { column, dir } = cfg.sort;
    const kind = src.columns.find((c) => c.key === column)!.kind;
    const sign = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => sign * compareCells(a[column], b[column], kind));
  }

  return { columns: src.columns, rows };
}

function compareCells(a: ReportCell, b: ReportCell, kind: ReportColumnKind): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (kind === "text" || kind === "date") return String(a).localeCompare(String(b), "vi");
  return Number(a) - Number(b); // number/money/percent
}
