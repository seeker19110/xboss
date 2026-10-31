// lib/search.ts — M57 PR1: registry nguồn tìm kiếm toàn văn (FTS) + hạ tầng query.
//
// Triết lý whitelist quyền xem bám lib/reports.ts: mỗi nguồn TỰ khai báo bảng, cột
// index, cột hiển thị, URL đích, quyền xem và cách lọc dự án + soft-delete. Nguồn
// tài chính (contracts) chỉ PAYMENT_VIEW_ROLES; mọi nguồn lọc project_id (trực tiếp
// hoặc qua chuỗi JOIN — bám bài học project-scope-invariant) + loại soft-delete.
//
// tasks/work_packages KHÔNG nằm trong registry này: chúng giữ shape SearchHit riêng
// (kind "task"/"package") + nhánh ILIKE prefix mã hiệu ở app/api/search/route.ts.
import { query } from "@/lib/db";
import { PAYMENT_VIEW_ROLES, type Role } from "@/lib/nen/roles";

// ⚠ BẤT BIẾN CỨNG (neo 2 chiều với migrations/0068_fts.sql):
//   ftsExpr(cols) PHẢI sinh biểu thức KHỚP CHÍNH XÁC với biểu thức đã CREATE INDEX
//   trong 0068_fts.sql cho cùng bảng (cùng danh mục cột + cùng thứ tự). Postgres so
//   khớp index biểu thức theo cây cú pháp (alias/khoảng trắng không tính, nhưng hàm/
//   toán tử/hằng/THỨ TỰ cột phải trùng). Lệch → planner bỏ index, seq scan.
//   Đổi `cols` của nguồn nào PHẢI đổi ĐỒNG THỜI biểu thức index tương ứng.
export function ftsExpr(cols: string[]): string {
  const joined = cols.map((c) => `coalesce(${c},'')`).join(" || ' ' || ");
  return `to_tsvector('simple', xboss_unaccent(${joined}))`;
}

// Một kết quả từ nguồn (khác shape SearchHit của task/package).
export type DocHit = {
  kind: string; // định danh nguồn: "contract" | "correspondence" | ...
  id: number;
  code: string | null; // mã hiển thị (null nếu nguồn không có mã)
  title: string; // dòng chính
  subtitle: string | null; // ngữ cảnh phụ
  url: string; // trang đích
};

type SearchSource = {
  kind: string;
  label: string; // nhãn nhóm tiếng Việt (client tự có map icon theo kind)
  from: string; // mệnh đề FROM, gồm alias, vd "contracts c"
  alias: string; // alias bảng chính
  cols: string[]; // cột (QUALIFIED) đưa vào ftsExpr — KHỚP index migration
  codeCol: string | null; // cột mã (QUALIFIED) cho prefix match + hiển thị; null nếu không có
  titleSql: string; // biểu thức SQL cho dòng chính
  subtitleSql: string | null; // biểu thức SQL cho dòng phụ; null = không có
  projectJoin: string; // JOIN phụ để lấy project_id (rỗng nếu có cột trực tiếp)
  projectCol: string; // cột project_id để lọc (QUALIFIED)
  softDelete: boolean; // bảng có cột deleted_at → lọc IS NULL
  canView: (role: Role) => boolean;
  extraSelect: string; // cột phụ phục vụ toUrl (vd slug/floor); rỗng nếu không cần
  toUrl: (row: Record<string, unknown>) => string;
  limit: number;
};

const SOURCES: SearchSource[] = [
  {
    kind: "contract",
    label: "Hợp đồng",
    from: "contracts c",
    alias: "c",
    cols: ["c.code", "c.title", "c.party_name"],
    codeCol: "c.code",
    titleSql: "c.title",
    subtitleSql: "c.party_name",
    projectJoin: "",
    projectCol: "c.project_id",
    softDelete: true,
    canView: (role) => PAYMENT_VIEW_ROLES.includes(role),
    extraSelect: "",
    toUrl: () => "/commercial?tab=contracts",
    limit: 6,
  },
  {
    kind: "correspondence",
    label: "Công văn",
    from: "correspondences co",
    alias: "co",
    cols: ["co.code", "co.subject", "co.note"],
    codeCol: "co.code",
    titleSql: "co.subject",
    subtitleSql: "co.counterparty",
    projectJoin: "",
    projectCol: "co.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: "",
    toUrl: () => "/correspondences",
    limit: 6,
  },
  {
    kind: "meeting",
    label: "Biên bản họp",
    from: "meetings mt",
    alias: "mt",
    cols: ["mt.title", "mt.content"],
    codeCol: null,
    titleSql: "mt.title",
    subtitleSql: "mt.meeting_date::text",
    projectJoin: "",
    projectCol: "mt.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: "",
    toUrl: () => "/meetings",
    limit: 6,
  },
  {
    kind: "diary",
    label: "Nhật ký công trường",
    from: "site_diaries sd",
    alias: "sd",
    cols: ["sd.work_done", "sd.obstacles", "sd.safety_note"],
    codeCol: null,
    titleSql: "('Nhật ký ' || sd.diary_date::text)",
    subtitleSql: "left(coalesce(sd.work_done,''), 120)",
    projectJoin: "",
    projectCol: "sd.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: "",
    toUrl: () => "/site?tab=tasks-diary&sub=diary",
    limit: 6,
  },
  {
    kind: "ncr",
    label: "NCR",
    from: "ncrs n",
    alias: "n",
    cols: ["n.code", "n.description"],
    codeCol: "n.code",
    titleSql: "left(n.description, 160)",
    subtitleSql: "n.status",
    projectJoin: "",
    projectCol: "n.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: "",
    toUrl: () => "/site?tab=approvals-qc&sub=ncr",
    limit: 6,
  },
  {
    kind: "material",
    label: "Vật tư",
    from: "materials m",
    alias: "m",
    cols: ["m.boq_code", "m.name"],
    codeCol: "m.boq_code",
    titleSql: "m.name",
    subtitleSql: "m.unit",
    projectJoin: "",
    projectCol: "m.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: "",
    toUrl: () => "/procurement?tab=inventory",
    limit: 8,
  },
  {
    kind: "drawing",
    label: "Bản vẽ",
    from: "drawings d",
    alias: "d",
    cols: ["d.code", "d.name"],
    codeCol: "d.code",
    titleSql: "d.name",
    subtitleSql: "d.floor_label",
    projectJoin: "",
    projectCol: "d.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: "",
    toUrl: () => "/drawings",
    limit: 6,
  },
  {
    kind: "document",
    label: "Tài liệu",
    from: "project_documents pd",
    alias: "pd",
    // M57 PR2: gồm cả extracted_text (nội dung text-layer PDF trích lúc upload,
    // lib/pdf-extract.ts) — khớp CHÍNH XÁC index idx_project_documents_fts_text
    // trong migrations/0071_extracted_text.sql (bất biến neo 2 chiều ftsExpr).
    cols: ["pd.title", "pd.extracted_text"],
    codeCol: null,
    titleSql: "pd.title",
    subtitleSql: "pd.category",
    projectJoin: "",
    projectCol: "pd.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: "",
    toUrl: () => "/documents",
    limit: 6,
  },
  {
    kind: "comment",
    label: "Bình luận",
    from: "task_comments tc",
    alias: "tc",
    cols: ["tc.body"],
    codeCol: null,
    titleSql: "left(tc.body, 160)",
    subtitleSql: "(t.code || ' · ' || t.name)",
    // task_comments không có project_id trực tiếp → scope qua chuỗi JOIN
    // task → work_package → sheet_type → tower (bài học project-scope-invariant).
    projectJoin:
      "JOIN tasks t ON t.id = tc.task_id " +
      "JOIN work_packages wp ON wp.id = t.package_id " +
      "JOIN sheet_types st ON st.id = wp.sheet_type_id " +
      "JOIN towers tw ON tw.id = st.tower_id",
    projectCol: "tw.project_id",
    softDelete: false,
    canView: () => true,
    extraSelect: ", st.slug AS slug, wp.floor_label AS floor",
    toUrl: (row) => {
      const slug = row.slug as string | null;
      if (!slug) return "/";
      const floor = row.floor as string | null;
      return `/tracking/${slug}${floor ? `?floor=${encodeURIComponent(floor)}` : ""}`;
    },
    limit: 6,
  },
];

// Chạy 1 nguồn: FTS (index GIN) OR prefix mã (nếu có codeCol), lọc project + soft-delete,
// xếp hạng ưu tiên khớp mã rồi ts_rank. ftsQuery/prefix đã chuẩn hoá ở route; tham số
// hoá qua ? — chuỗi tìm kiếm KHÔNG nối vào SQL. Tên bảng/cột/kind/limit là hằng tĩnh
// trong registry (không phải input người dùng) nên nội suy an toàn.
async function runSource(
  src: SearchSource,
  projectId: number,
  ftsQuery: string,
  prefix: string,
): Promise<DocHit[]> {
  const fts = ftsExpr(src.cols);
  const params: unknown[] = [];

  let match = `${fts} @@ plainto_tsquery('simple', xboss_unaccent(?))`;
  params.push(ftsQuery);
  if (src.codeCol) {
    match = `(${match} OR lower(${src.codeCol}) LIKE ?)`;
    params.push(prefix);
  }

  const conds = [match];
  if (src.softDelete) conds.push(`${src.alias}.deleted_at IS NULL`);
  conds.push(`${src.projectCol} = ?`);
  params.push(projectId);

  const order: string[] = [];
  if (src.codeCol) {
    order.push(`(lower(${src.codeCol}) LIKE ?) DESC`);
    params.push(prefix);
  }
  order.push(`ts_rank(${fts}, plainto_tsquery('simple', xboss_unaccent(?))) DESC`);
  params.push(ftsQuery);
  order.push(`${src.alias}.id DESC`);

  const sql = `SELECT '${src.kind}' AS kind, ${src.alias}.id,
      ${src.codeCol ?? "NULL"} AS code,
      ${src.titleSql} AS title,
      ${src.subtitleSql ?? "NULL"} AS subtitle${src.extraSelect}
    FROM ${src.from}
    ${src.projectJoin}
    WHERE ${conds.join(" AND ")}
    ORDER BY ${order.join(", ")}
    LIMIT ${src.limit}`;

  const rows = await query<Record<string, unknown>>(sql, ...params);
  return rows.map((r) => ({
    kind: src.kind,
    id: Number(r.id),
    code: r.code == null ? null : String(r.code),
    title: String(r.title ?? ""),
    subtitle: r.subtitle == null ? null : String(r.subtitle),
    url: src.toUrl(r),
  }));
}

// Tìm trên mọi nguồn user được xem, song song. Trả DocHit[] đã gộp (giữ thứ tự nhóm
// theo registry — client hiển thị nhóm theo kind).
// projectId bắt buộc (fail-closed, A1-AC02): không còn nghĩa null = không lọc dự án.
export async function searchSources(
  role: Role,
  projectId: number,
  ftsQuery: string,
  prefix: string,
): Promise<DocHit[]> {
  const allowed = SOURCES.filter((s) => s.canView(role));
  const results = await Promise.all(allowed.map((s) => runSource(s, projectId, ftsQuery, prefix)));
  return results.flat();
}

// ─── Tìm task + nhóm (shape SearchHit) — perf G3/P2 ──────────────────────────
export type SearchHit = {
  kind: "task" | "package";
  id: number;
  code: string;
  name: string;
  boqCode: string | null;
  status: string | null;
  progress: number;
  floorLabel: string | null;
  sheetType: string;
  sheetSlug: string | null;
};

// Từ khoá ≥ ngần này ký tự mới đi đường "ứng viên qua index" (CTE). Tiền tố ngắn khớp
// phần lớn task → CTE chậm hơn truy vấn gốc (đo: 56ms so 32ms) nên giữ đường cũ.
export const SEARCH_INDEXED_MIN_LEN = 4;

type SearchTable = {
  kind: "task" | "package";
  table: "tasks" | "work_packages";
  alias: "t" | "wp";
  limit: number;
  select: string;
  joins: string;
};

const TASK_TABLE: SearchTable = {
  kind: "task",
  table: "tasks",
  alias: "t",
  limit: 15,
  select: `'task' AS kind, t.id, t.code, t.name, t.boq_code AS "boqCode",
              t.status, t.progress_percent AS progress,
              wp.floor_label AS "floorLabel", st.code AS "sheetType", st.slug AS "sheetSlug"`,
  joins: `FROM tasks t
         JOIN work_packages wp ON t.package_id = wp.id
         JOIN sheet_types st ON wp.sheet_type_id = st.id`,
};

const PACKAGE_TABLE: SearchTable = {
  kind: "package",
  table: "work_packages",
  alias: "wp",
  limit: 10,
  select: `'package' AS kind, wp.id, wp.code, wp.name, wp.boq_code AS "boqCode",
              wp.status, wp.progress, wp.floor_label AS "floorLabel",
              st.code AS "sheetType", st.slug AS "sheetSlug"`,
  joins: `FROM work_packages wp
         JOIN sheet_types st ON wp.sheet_type_id = st.id`,
};

// Đường gốc: một WHERE OR trộn cột bảng chính với mã/tên hệ (planner duyệt cả dự án).
async function searchLegacy(
  tb: SearchTable,
  projectId: number,
  prefix: string,
  ftsQuery: string,
): Promise<SearchHit[]> {
  const a = tb.alias;
  const fts = ftsExpr([`${a}.code`, `${a}.boq_code`, `${a}.name`]);
  return query<SearchHit>(
    `SELECT ${tb.select}
         ${tb.joins}
         LEFT JOIN systems sys ON sys.id = st.system_id JOIN towers tw ON tw.id = st.tower_id
        WHERE (lower(${a}.code) LIKE ?
           OR lower(${a}.boq_code) LIKE ?
           OR ${fts} @@ plainto_tsquery('simple', xboss_unaccent(?))
           OR lower(sys.code) LIKE ?
           OR lower(sys.name) LIKE ?) AND tw.project_id = ?
        ORDER BY st.id, ${a}.code LIMIT ${tb.limit}`,
    prefix,
    prefix,
    ftsQuery,
    prefix,
    prefix,
    projectId,
  );
}

// Đường index: tập ứng viên lấy qua index (lower(code)/lower(boq_code) text_pattern_ops +
// GIN FTS, migration 0173) trong CTE MATERIALIZED; nhánh "khớp theo hệ" tách UNION; rồi
// JOIN lọc dự án + ORDER BY + LIMIT y như đường gốc → kết quả giống hệt.
async function searchIndexed(
  tb: SearchTable,
  projectId: number,
  prefix: string,
  ftsQuery: string,
): Promise<SearchHit[]> {
  const a = tb.alias;
  const fts = ftsExpr([`${a}.code`, `${a}.boq_code`, `${a}.name`]);
  const sysBranch =
    tb.kind === "task"
      ? `SELECT t2.id FROM tasks t2
           JOIN work_packages wp2 ON t2.package_id = wp2.id
           JOIN sheet_types st2 ON wp2.sheet_type_id = st2.id
           JOIN towers tw2 ON tw2.id = st2.tower_id
          WHERE tw2.project_id = ?
            AND st2.system_id IN (SELECT id FROM systems WHERE lower(code) LIKE ? OR lower(name) LIKE ?)`
      : `SELECT wp2.id FROM work_packages wp2
           JOIN sheet_types st2 ON wp2.sheet_type_id = st2.id
           JOIN towers tw2 ON tw2.id = st2.tower_id
          WHERE tw2.project_id = ?
            AND st2.system_id IN (SELECT id FROM systems WHERE lower(code) LIKE ? OR lower(name) LIKE ?)`;
  return query<SearchHit>(
    `WITH c AS MATERIALIZED (
        SELECT ${a}.id FROM ${tb.table} ${a}
         WHERE lower(${a}.code) LIKE ?
            OR lower(${a}.boq_code) LIKE ?
            OR ${fts} @@ plainto_tsquery('simple', xboss_unaccent(?))
        UNION
        ${sysBranch}
     )
     SELECT ${tb.select}
         ${tb.joins}
         JOIN towers tw ON tw.id = st.tower_id
        WHERE ${a}.id IN (SELECT id FROM c) AND tw.project_id = ?
        ORDER BY st.id, ${a}.code LIMIT ${tb.limit}`,
    prefix,
    prefix,
    ftsQuery,
    projectId,
    prefix,
    prefix,
    projectId,
  );
}

// Tìm task + nhóm theo dự án. `forceLegacy` chỉ để test đối chiếu.
export async function searchTasksAndPackages(
  projectId: number,
  q: string,
  opts: { forceLegacy?: boolean } = {},
): Promise<{ tasks: SearchHit[]; packages: SearchHit[] }> {
  const prefix = `${q.toLowerCase()}%`;
  // plainto_tsquery chấp nhận chuỗi tự do; bỏ ký tự đặc biệt để không sinh token rác.
  const ftsQuery = q.replace(/[^\p{L}\p{N}\s]/gu, " ").trim() || q;
  const run = opts.forceLegacy || q.length < SEARCH_INDEXED_MIN_LEN ? searchLegacy : searchIndexed;
  const [tasks, packages] = await Promise.all([
    run(TASK_TABLE, projectId, prefix, ftsQuery),
    run(PACKAGE_TABLE, projectId, prefix, ftsQuery),
  ]);
  return { tasks, packages };
}
