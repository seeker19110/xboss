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
import { PAYMENT_VIEW_ROLES, type Role } from "@/lib/roles";

// ⚠ BẤT BIẾN CỨNG (neo 2 chiều với migrations/0064_fts.sql):
//   ftsExpr(cols) PHẢI sinh biểu thức KHỚP CHÍNH XÁC với biểu thức đã CREATE INDEX
//   trong 0064_fts.sql cho cùng bảng (cùng danh mục cột + cùng thứ tự). Postgres so
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
    toUrl: () => "/contracts",
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
    toUrl: () => "/diary",
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
    toUrl: () => "/quality?tab=ncrs",
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
    toUrl: () => "/materials",
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
    cols: ["pd.title"],
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
  projectId: number | null,
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
  if (projectId != null) {
    conds.push(`${src.projectCol} = ?`);
    params.push(projectId);
  }

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
export async function searchSources(
  role: Role,
  projectId: number | null,
  ftsQuery: string,
  prefix: string,
): Promise<DocHit[]> {
  const allowed = SOURCES.filter((s) => s.canView(role));
  const results = await Promise.all(allowed.map((s) => runSource(s, projectId, ftsQuery, prefix)));
  return results.flat();
}
