// Danh mục mềm (code_lists) — enum-mềm cấu hình được thay cho hằng số hard-code.
// getList() cache trong bộ nhớ + watermark version (bám pattern sheetVersion): mọi thao
// tác ghi (tạo/sửa/xoá/sắp thứ tự) gọi bumpCodeListVersion() để vô hiệu cache lần đọc sau.
import { query, queryOne, run, insertId } from "@/lib/db";

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
const REFERENCE_SQL: Record<string, string> = {
  // Nguyên nhân trễ được gán ở tasks.delay_reason.
  delay_reason: `SELECT COUNT(*)::int AS n FROM tasks WHERE delay_reason = ?`,
};

// Watermark thay đổi toàn cục của danh mục — tăng mỗi lần ghi để cache tự làm mới NGAY
// trong cùng process. M53 PR4: chạy nhiều instance thì ghi ở instance A không tự bump được
// version ở instance B/C — thêm TTL làm trần độ trễ tối đa (instance khác thấy đổi chậm
// nhất sau TTL_MS, thay vì có thể không bao giờ thấy như trước PR4).
const TTL_MS = 60_000;
let version = 0;
const cache = new Map<string, { v: number; rows: CodeListItem[]; loadedAt: number }>();

export function bumpCodeListVersion(): void {
  version++;
}

export function codeListVersion(): number {
  return version;
}

// Đọc danh mục theo domain (mặc định chỉ trả mục active; admin dùng includeInactive=true).
export async function getList(
  domain: string,
  opts?: { includeInactive?: boolean },
): Promise<CodeListItem[]> {
  const cached = cache.get(domain);
  const fresh = cached && cached.v === version && Date.now() - cached.loadedAt < TTL_MS;
  let rows: CodeListItem[];
  if (fresh) {
    rows = cached.rows;
  } else {
    rows = await query<CodeListItem>(
      `SELECT id, domain, code, label, sort, active, meta
         FROM code_lists WHERE domain = ? ORDER BY sort, code`,
      domain,
    );
    cache.set(domain, { v: version, rows, loadedAt: Date.now() });
  }
  return opts?.includeInactive ? rows : rows.filter((r) => r.active);
}

export async function getById(id: number): Promise<CodeListItem | undefined> {
  return queryOne<CodeListItem>(
    `SELECT id, domain, code, label, sort, active, meta FROM code_lists WHERE id = ?`,
    id,
  );
}

// Số bản ghi đang tham chiếu tới (domain, code) — dùng để chặn xoá.
export async function countReferences(domain: string, code: string): Promise<number> {
  const sql = REFERENCE_SQL[domain];
  if (!sql) return 0;
  const r = await queryOne<{ n: number }>(sql, code);
  return r?.n ?? 0;
}

export type CodeListInput = {
  domain: string;
  code: string;
  label: string;
  sort?: number;
  active?: boolean;
  meta?: Record<string, unknown>;
};

// Tạo mục mới; trả chuỗi lỗi khi trùng (domain, code).
export async function createItem(input: CodeListInput): Promise<{ id: number } | string> {
  const exists = await queryOne<{ id: number }>(
    `SELECT id FROM code_lists WHERE domain = ? AND code = ?`,
    input.domain,
    input.code,
  );
  if (exists) return "Mã đã tồn tại trong danh mục này";
  const id = await insertId(
    `INSERT INTO code_lists (domain, code, label, sort, active, meta)
     VALUES (?, ?, ?, ?, ?, ?::jsonb)`,
    input.domain,
    input.code,
    input.label,
    input.sort ?? 0,
    input.active ?? true,
    JSON.stringify(input.meta ?? {}),
  );
  bumpCodeListVersion();
  return { id };
}

export type CodeListPatch = {
  label?: string;
  sort?: number;
  active?: boolean;
  meta?: Record<string, unknown>;
};

// Cập nhật mục (không cho đổi domain/code — mã là định danh tham chiếu). Trả false khi không có gì đổi.
export async function updateItem(id: number, patch: CodeListPatch): Promise<boolean> {
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
  params.push(id);
  const res = await run(`UPDATE code_lists SET ${sets.join(", ")} WHERE id = ?`, ...params);
  if (res.changes > 0) bumpCodeListVersion();
  return res.changes > 0;
}

export async function deleteItem(id: number): Promise<boolean> {
  const res = await run(`DELETE FROM code_lists WHERE id = ?`, id);
  if (res.changes > 0) bumpCodeListVersion();
  return res.changes > 0;
}
