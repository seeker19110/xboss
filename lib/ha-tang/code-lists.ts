// Danh mục mềm (code_lists) — enum-mềm cấu hình được thay cho hằng số hard-code.
// S02e: danh mục thuộc TỪNG tổ chức — unique (org_id, domain, code), mọi đọc/ghi nhận orgId.
// getList() cache trong bộ nhớ + watermark version (bám pattern sheetVersion): mọi thao
// tác ghi (tạo/sửa/xoá/sắp thứ tự) gọi bumpCodeListVersion() để vô hiệu cache lần đọc sau.
import { query, queryOne, run } from "@/lib/db";
import { log } from "@/lib/nen/log";

export type CodeListItem = {
  id: number;
  domain: string;
  code: string;
  label: string;
  sort: number;
  active: boolean;
  meta: Record<string, unknown>;
};

// Bản đồ tham chiếu của từng domain → cột đang dùng code (để chặn xoá khi còn tham chiếu).
// Chỉ khai báo domain đã thực sự có call-site tham chiếu; domain khác trả 0 (không chặn).
// Mỗi câu nhận đúng 2 tham số (code, orgId) — chỉ đếm tham chiếu TRONG tổ chức sở hữu mục.
const REFERENCE_SQL: Record<string, string> = {
  // Nguyên nhân trễ được gán ở tasks.delay_reason (task → nhóm → sheet → tháp → dự án → org).
  delay_reason: `SELECT COUNT(*)::int AS n
                   FROM tasks t
                   JOIN work_packages wp ON wp.id = t.package_id
                   JOIN sheet_types st ON st.id = wp.sheet_type_id
                   JOIN towers tw ON tw.id = st.tower_id
                   JOIN projects p ON p.id = tw.project_id
                  WHERE t.delay_reason = ? AND p.org_id = ?`,
};

// Watermark thay đổi toàn cục của danh mục — tăng mỗi lần ghi để cache tự làm mới NGAY
// trong cùng process. M53 PR4: chạy nhiều instance thì ghi ở instance A không tự bump được
// version ở instance B/C — thêm TTL làm trần độ trễ tối đa (instance khác thấy đổi chậm
// nhất sau TTL_MS, thay vì có thể không bao giờ thấy như trước PR4).
const TTL_MS = 60_000;
let version = 0;
// Khoá cache `${orgId}:${domain}` — không bao giờ trả danh mục của org khác từ cache.
const cache = new Map<string, { v: number; rows: CodeListItem[]; loadedAt: number }>();

export function bumpCodeListVersion(): void {
  version++;
}

export function codeListVersion(): number {
  return version;
}

// Đọc danh mục theo domain CỦA tổ chức `orgId` (mặc định chỉ trả mục active).
export async function getList(
  domain: string,
  orgId: number,
  opts?: { includeInactive?: boolean },
): Promise<CodeListItem[]> {
  const key = `${orgId}:${domain}`;
  const cached = cache.get(key);
  const fresh = cached && cached.v === version && Date.now() - cached.loadedAt < TTL_MS;
  let rows: CodeListItem[];
  if (fresh) {
    rows = cached.rows;
  } else {
    const { rows: loaded, scope } = await docTheoPhamVi(domain, orgId);
    rows = loaded;
    // S16: code_lists là bảng FORCE RLS theo tổ chức — đọc lúc phạm vi GUC không phải org này
    // (quên gắn phạm vi) ra 0 dòng. Không đưa kết quả RỖNG ngoài phạm vi vào cache, kẻo một lời
    // gọi sai phạm vi làm mọi request đúng của org thấy danh mục rỗng tới hết TTL (vd
    // `require_2fa_roles` rỗng → không ai bị buộc 2FA = fail-open). Có dòng = RLS đã cho qua
    // (hoặc role chủ bảng/superuser không chịu RLS) → kết quả đúng, cache bình thường.
    if (rows.length > 0 || scope === String(orgId) || scope === "*") {
      cache.set(key, { v: version, rows, loadedAt: Date.now() });
    } else {
      log.warn("code-lists: đọc rỗng ngoài phạm vi tổ chức, không cache", { domain, orgId, scope });
    }
  }
  return opts?.includeInactive ? rows : rows.filter((r) => r.active);
}

// Đọc kèm phạm vi GUC `app.org_id` trong CÙNG câu lệnh (cùng snapshot/kết nối) — LEFT JOIN để
// vẫn ra 1 dòng phạm vi khi danh mục rỗng.
async function docTheoPhamVi(
  domain: string,
  orgId: number,
): Promise<{ rows: CodeListItem[]; scope: string }> {
  const raw = await query<CodeListItem & { scope: string | null; id: number | null }>(
    `SELECT pv.scope, cl.id, cl.domain, cl.code, cl.label, cl.sort, cl.active, cl.meta
       FROM (SELECT COALESCE(current_setting('app.org_id', true), '') AS scope) pv
       LEFT JOIN code_lists cl ON cl.domain = ? AND cl.org_id = ?
      ORDER BY cl.sort, cl.code`,
    domain,
    orgId,
  );
  const scope = raw[0]?.scope ?? "";
  const rows = raw.filter((r) => r.id != null).map(({ scope: _scope, ...r }) => r as CodeListItem);
  return { rows, scope };
}

// Trang quản trị (S02 — cô lập tenant): chỉ mục thuộc tổ chức `orgId`, kể cả mục đã tắt.
// Không qua cache — admin luôn thấy dữ liệu mới nhất.
export async function getListOfOrg(domain: string, orgId: number): Promise<CodeListItem[]> {
  return query<CodeListItem>(
    `SELECT id, domain, code, label, sort, active, meta
       FROM code_lists WHERE domain = ? AND org_id = ? ORDER BY sort, code`,
    domain,
    orgId,
  );
}

// Mục theo id, chỉ khi thuộc tổ chức `orgId` — id của org khác coi như không tồn tại.
export async function getById(id: number, orgId: number): Promise<CodeListItem | undefined> {
  return queryOne<CodeListItem>(
    `SELECT id, domain, code, label, sort, active, meta FROM code_lists WHERE id = ? AND org_id = ?`,
    id,
    orgId,
  );
}

// Số bản ghi CỦA tổ chức `orgId` đang tham chiếu tới (domain, code) — dùng để chặn xoá.
export async function countReferences(
  domain: string,
  code: string,
  orgId: number,
): Promise<number> {
  const sql = REFERENCE_SQL[domain];
  if (!sql) return 0;
  const r = await queryOne<{ n: number }>(sql, code, orgId);
  return r?.n ?? 0;
}

export type CodeListInput = {
  domain: string;
  code: string;
  label: string;
  sort?: number;
  active?: boolean;
  meta?: Record<string, unknown>;
  // M54 GĐ1 PR2: org của người tạo — mục danh mục thuộc tenant, không dựa DEFAULT org_id=1.
  orgId: number;
};

// Tạo mục mới; trả chuỗi lỗi khi trùng (domain, code) TRONG tổ chức (org khác cùng mã: được).
// ON CONFLICT trên unique (org_id, domain, code) — hai request đồng thời không thành 500.
export async function createItem(input: CodeListInput): Promise<{ id: number } | string> {
  const row = await queryOne<{ id: number }>(
    `INSERT INTO code_lists (domain, code, label, sort, active, meta, org_id)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?)
     ON CONFLICT (org_id, domain, code) DO NOTHING
     RETURNING id`,
    input.domain,
    input.code,
    input.label,
    input.sort ?? 0,
    input.active ?? true,
    JSON.stringify(input.meta ?? {}),
    input.orgId,
  );
  if (!row) return "Mã đã tồn tại trong danh mục này";
  bumpCodeListVersion();
  return { id: row.id };
}

export type CodeListPatch = {
  label?: string;
  sort?: number;
  active?: boolean;
  meta?: Record<string, unknown>;
};

// Cập nhật mục (không cho đổi domain/code — mã là định danh tham chiếu) — chỉ mục của tổ chức
// `orgId`. Trả false khi không có gì đổi.
export async function updateItem(
  id: number,
  orgId: number,
  patch: CodeListPatch,
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (patch.label !== undefined) {
    sets.push("label = ?");
    params.push(patch.label);
  }
  if (patch.sort !== undefined) {
    sets.push("sort = ?");
    params.push(patch.sort);
  }
  if (patch.active !== undefined) {
    sets.push("active = ?");
    params.push(patch.active);
  }
  if (patch.meta !== undefined) {
    sets.push("meta = ?::jsonb");
    params.push(JSON.stringify(patch.meta));
  }
  if (sets.length === 0) return false;
  params.push(id, orgId);
  const res = await run(
    `UPDATE code_lists SET ${sets.join(", ")} WHERE id = ? AND org_id = ?`,
    ...params,
  );
  if (res.changes > 0) bumpCodeListVersion();
  return res.changes > 0;
}

export async function deleteItem(id: number, orgId: number): Promise<boolean> {
  const res = await run(`DELETE FROM code_lists WHERE id = ? AND org_id = ?`, id, orgId);
  if (res.changes > 0) bumpCodeListVersion();
  return res.changes > 0;
}
