import { query, queryOne, run, insertId } from "@/lib/db";
import { boqTakenBy } from "@/lib/khoi-luong/boq";
import {
  getSheetClient,
  readSheetProjectBinding,
  type SheetClient,
} from "@/lib/vat-tu/google-sheets";

// Đồng bộ HAI CHIỀU bảng `materials` ↔ Google Sheet.
//
// Cách hoạt động:
//  - Mỗi dòng Sheet khớp vật tư qua cột ID (= materials.id). Dòng không ID khớp
//    theo Mã BOQ, rồi theo vật tư "mồ côi" trùng khớp nội dung (tạo ở lần đồng bộ trước
//    mà ghi Sheet lỗi); không có thì tạo vật tư mới và ghi ID trả lại Sheet.
//  - 3-way merge dựa vào snapshot lần đồng bộ trước (bảng material_sync) để biết
//    phía nào đã đổi. Chỉ DB đổi → đẩy ra Sheet; chỉ Sheet đổi → kéo vào DB; cả
//    hai đổi (xung đột) → DB thắng (CONFLICT_POLICY), liệt kê trong kết quả.
//  - Sau khi gộp mọi thay đổi vào DB, ghi đè toàn bộ tab Sheet bằng dữ liệu DB
//    (header + mọi vật tư) — tự xử lý append vật tư mới và ghi ID ngược lại.
//
// Lưu ý: qty_used / qty_stock / min_stock_level chỉ DB→Sheet (phái sinh từ audit
// material_transactions) — sửa ở Sheet sẽ bị ghi đè ở lần đồng bộ kế tiếp.
//
// Phạm vi (QUALITY-FINAL-1 A1): mỗi lần đồng bộ chỉ cho ĐÚNG MỘT dự án (đã kiểm cùng tổ chức).
// Mọi đọc/ghi materials/material_sync/sheet_types lọc theo dự án đó; vật tư dự án khác không bao
// giờ được ghi lên Sheet. Dòng Sheet mang ID vật tư ngoài phạm vi → bỏ qua (không ghi DB), giữ
// nguyên nội dung dòng trên Sheet (không xoá) và báo trong `skipped`.

// Các trường định nghĩa vật tư được đồng bộ HAI CHIỀU.
export const SYNCED_FIELDS = [
  "boqCode",
  "name",
  "unit",
  "qtyBoq",
  "qtyPlanned",
  "status",
  "note",
] as const;
export type SyncField = (typeof SYNCED_FIELDS)[number];
export type MaterialFields = Record<SyncField, string>;

// Khi cả hai phía cùng đổi: "db" = DB thắng, "sheet" = Sheet thắng.
export const CONFLICT_POLICY: "db" | "sheet" = "db";

const VALID_STATUSES = ["dat_hang", "ve_kho", "da_dung"];
const SYNC_LOCK_NAME = "materials";

// ── Chuẩn hoá & so sánh ────────────────────────────────────────────────────

const normNum = (v: string) => {
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isFinite(n) ? String(n) : "0";
};

// Chuẩn hoá 1 trường để so sánh ổn định giữa DB và Sheet (số so theo số, chuỗi trim).
function normField(field: SyncField, value: string): string {
  const v = (value ?? "").toString().trim();
  if (field === "qtyBoq" || field === "qtyPlanned") return normNum(v);
  if (field === "status") return VALID_STATUSES.includes(v) ? v : "dat_hang";
  return v;
}

export function normalizeFields(f: Partial<MaterialFields>): MaterialFields {
  const out = {} as MaterialFields;
  for (const k of SYNCED_FIELDS) out[k] = normField(k, f[k] ?? "");
  return out;
}

const fieldsEqual = (a: MaterialFields, b: MaterialFields) =>
  SYNCED_FIELDS.every((k) => a[k] === b[k]);

// ── Hàm quyết định 3-way merge (thuần, không chạm DB — dễ unit test) ─────────

export type MergeDecision = "push" | "pull" | "noop" | "conflict";

// db/sheet/snapshot đều đã chuẩn hoá. snapshot = giá trị tại lần đồng bộ trước
// (null nếu chưa từng đồng bộ dòng này).
export function decideMerge(
  db: MaterialFields,
  sheet: MaterialFields,
  snapshot: MaterialFields | null,
): { decision: MergeDecision; winner: MaterialFields } {
  if (fieldsEqual(db, sheet)) return { decision: "noop", winner: db };

  if (!snapshot) {
    // Chưa có mốc tham chiếu mà hai phía khác nhau → coi như xung đột, theo policy.
    return { decision: "conflict", winner: CONFLICT_POLICY === "db" ? db : sheet };
  }

  const dbChanged = !fieldsEqual(db, snapshot);
  const sheetChanged = !fieldsEqual(sheet, snapshot);

  if (dbChanged && !sheetChanged) return { decision: "push", winner: db };
  if (!dbChanged && sheetChanged) return { decision: "pull", winner: sheet };
  // Cả hai đổi (đã khác nhau ở trên) → xung đột.
  return { decision: "conflict", winner: CONFLICT_POLICY === "db" ? db : sheet };
}

// ── Phạm vi đồng bộ ─────────────────────────────────────────────────────────

export type MaterialSyncScope = { orgId: number; projectId: number };

/** Lỗi phạm vi/cấu hình — route trả đúng `status` kèm `message` (không phải lỗi 500). */
export class MaterialSyncScopeError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 503,
  ) {
    super(message);
    this.name = "MaterialSyncScopeError";
  }
}

const SHEET_PROJECT_INVALID =
  "GOOGLE_SHEET_PROJECT_ID không hợp lệ (phải là ID dự án) — không đồng bộ khi chưa rõ Sheet thuộc dự án nào.";

/** Sheet đã gắn với 1 dự án (GOOGLE_SHEET_PROJECT_ID) thì chỉ dự án đó được đồng bộ; cấu hình
 *  sai → từ chối. Chưa gắn → không chặn (đồng bộ tay theo dự án đang chọn). */
function assertSheetBinding(projectId: number): void {
  const binding = readSheetProjectBinding();
  if (binding.kind === "invalid") throw new MaterialSyncScopeError(SHEET_PROJECT_INVALID, 503);
  if (binding.kind === "bound" && binding.projectId !== projectId)
    throw new MaterialSyncScopeError(
      "Google Sheet vật tư đang gắn với dự án khác — chọn đúng dự án để đồng bộ.",
      409,
    );
}

/**
 * Phạm vi cho lần đồng bộ do CRON gọi (không có phiên người dùng): đúng dự án cấu hình ở
 * GOOGLE_SHEET_PROJECT_ID, tổ chức lấy từ chính dự án đó. Thiếu/sai cấu hình hoặc dự án không
 * tồn tại → ném MaterialSyncScopeError 503 (cron không chạy), không đoán "dự án đầu tiên".
 */
export async function resolveCronSyncScope(): Promise<MaterialSyncScope> {
  const binding = readSheetProjectBinding();
  if (binding.kind === "unset")
    throw new MaterialSyncScopeError(
      "Chưa cấu hình GOOGLE_SHEET_PROJECT_ID — cron không biết Sheet thuộc dự án nào nên không đồng bộ.",
      503,
    );
  if (binding.kind === "invalid") throw new MaterialSyncScopeError(SHEET_PROJECT_INVALID, 503);
  const project = await queryOne<{ orgId: number | null }>(
    `SELECT org_id AS "orgId" FROM projects WHERE id = ?`,
    binding.projectId,
  );
  if (!project || project.orgId == null)
    throw new MaterialSyncScopeError(
      "GOOGLE_SHEET_PROJECT_ID trỏ tới dự án không tồn tại — không đồng bộ.",
      503,
    );
  return { orgId: project.orgId, projectId: binding.projectId };
}

const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;

// Phòng thủ chiều sâu: dự án phải thuộc đúng tổ chức (nơi gọi đã kiểm, kiểm lại ở đây để
// không caller nào lỡ truyền phạm vi chưa xác minh). Sai → 404 như resource ngoài scope.
async function assertScope(scope: MaterialSyncScope): Promise<void> {
  const ok =
    isPositiveInt(scope.orgId) &&
    isPositiveInt(scope.projectId) &&
    (await queryOne<{ id: number }>(
      `SELECT id FROM projects WHERE id = ? AND org_id = ?`,
      scope.projectId,
      scope.orgId,
    ));
  if (!ok) throw new MaterialSyncScopeError("Không tìm thấy dự án cần đồng bộ", 404);
  assertSheetBinding(scope.projectId);
}

// ── Khoá chống chạy chồng ───────────────────────────────────────────────────

async function acquireLock(): Promise<boolean> {
  const row = await queryOne<{ name: string }>(
    `INSERT INTO sync_locks (name, locked_at) VALUES (?, NOW())
     ON CONFLICT (name) DO UPDATE SET locked_at = NOW()
       WHERE sync_locks.locked_at IS NULL OR sync_locks.locked_at < NOW() - INTERVAL '10 minutes'
     RETURNING name`,
    SYNC_LOCK_NAME,
  );
  return !!row;
}

const releaseLock = () =>
  run(`UPDATE sync_locks SET locked_at = NULL WHERE name = ?`, SYNC_LOCK_NAME);

// ── Bố cục cột Sheet ────────────────────────────────────────────────────────

// Thứ tự cột (A..L). Cột merge hai chiều + cột chỉ DB→Sheet.
const HEADER = [
  "ID",
  "Mã BOQ",
  "Tên vật tư",
  "ĐVT",
  "KL BOQ",
  "Định mức",
  "Đã dùng",
  "Tồn kho",
  "Ngưỡng tối thiểu",
  "Trạng thái",
  "Ghi chú",
  "Hệ",
];

type DbMaterial = {
  id: number;
  sheetTypeId: number | null;
  sheetCode: string | null;
  boqCode: string | null;
  name: string;
  unit: string | null;
  qtyBoq: number;
  qtyPlanned: number;
  qtyUsed: number;
  qtyStock: number;
  minStockLevel: number;
  status: string;
  note: string | null;
};

const dbToFields = (m: DbMaterial): MaterialFields =>
  normalizeFields({
    boqCode: m.boqCode ?? "",
    name: m.name,
    unit: m.unit ?? "",
    qtyBoq: String(m.qtyBoq ?? 0),
    qtyPlanned: String(m.qtyPlanned ?? 0),
    status: m.status,
    note: m.note ?? "",
  });

// Parse "nghiêm ngặt" 1 trường Sheet: trả `null` nếu giá trị nhập không hợp lệ
// (số không parse được / status lạ), khác `normField` (luôn coerce về giá trị an
// toàn — dùng cho dữ liệu đã biết đúng như DB/snapshot). Rỗng vẫn coi là hợp lệ
// (= giá trị mặc định 0 / dat_hang), chỉ rác thật sự mới trả null.
function parseFieldStrict(field: SyncField, value: string): string | null {
  const v = (value ?? "").toString().trim();
  if (field === "qtyBoq" || field === "qtyPlanned") {
    if (v === "") return "0";
    const n = parseFloat(v.replace(/,/g, ""));
    return isFinite(n) ? String(n) : null;
  }
  if (field === "status") {
    if (v === "") return "dat_hang";
    return VALID_STATUSES.includes(v) ? v : null;
  }
  return v;
}

// Đọc 1 dòng Sheet → trường đã chuẩn hoá + danh sách trường lỗi (không parse được).
// Trường lỗi được GIỮ NGUYÊN giá trị `fallback` tương ứng (thường là giá trị DB
// hiện tại) thay vì coerce về "0"/"dat_hang" — coi lỗi gõ trên Sheet (vd qtyBoq
// gõ nhầm chữ) là "không đổi" thay vì "đổi thành 0", để 3-way merge không âm thầm
// ghi đè DB bằng giá trị rác chỉ vì Sheet gõ sai.
export function sheetRowToFieldsChecked(
  row: string[],
  fallback: MaterialFields,
): { fields: MaterialFields; invalid: SyncField[] } {
  const raw: Record<SyncField, string> = {
    boqCode: row[1] ?? "",
    name: row[2] ?? "",
    unit: row[3] ?? "",
    qtyBoq: row[4] ?? "",
    qtyPlanned: row[5] ?? "",
    status: row[9] ?? "",
    note: row[10] ?? "",
  };
  const fields = {} as MaterialFields;
  const invalid: SyncField[] = [];
  for (const k of SYNCED_FIELDS) {
    const parsed = parseFieldStrict(k, raw[k]);
    if (parsed === null) {
      invalid.push(k);
      fields[k] = fallback[k];
    } else {
      fields[k] = parsed;
    }
  }
  return { fields, invalid };
}

const DEFAULT_NEW_FIELDS: MaterialFields = normalizeFields({});

const dbToSheetRow = (m: DbMaterial): (string | number)[] => [
  m.id,
  m.boqCode ?? "",
  m.name,
  m.unit ?? "",
  m.qtyBoq ?? 0,
  m.qtyPlanned ?? 0,
  m.qtyUsed ?? 0,
  m.qtyStock ?? 0,
  m.minStockLevel ?? 0,
  m.status,
  m.note ?? "",
  m.sheetCode ?? "",
];

// ── Kết quả ─────────────────────────────────────────────────────────────────

export type SyncConflict = { id: number; name: string; winner: "db" | "sheet" };
export type SyncSummary = {
  pushed: number; // DB → Sheet (giá trị DB thắng / vật tư mới ra Sheet)
  pulled: number; // Sheet → DB
  created: number; // vật tư mới tạo từ Sheet
  conflicts: SyncConflict[];
  skipped: { row: number; reason: string }[];
  total: number;
};

// ── Orchestration ───────────────────────────────────────────────────────────

async function loadDbMaterials(projectId: number): Promise<DbMaterial[]> {
  return query<DbMaterial>(
    `SELECT m.id, m.sheet_type_id AS "sheetTypeId", st.code AS "sheetCode",
            m.boq_code AS "boqCode", m.name, m.unit,
            COALESCE(m.qty_boq, 0) AS "qtyBoq", COALESCE(m.qty_planned, 0) AS "qtyPlanned",
            COALESCE(m.qty_used, 0) AS "qtyUsed", COALESCE(m.qty_stock, 0) AS "qtyStock",
            COALESCE(m.min_stock_level, 0) AS "minStockLevel",
            COALESCE(m.status, 'dat_hang') AS status, m.note
       FROM materials m
       LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
      WHERE m.project_id = ?
      ORDER BY m.sort_order, m.id`,
    projectId,
  );
}

async function loadSnapshots(projectId: number): Promise<Map<number, MaterialFields>> {
  const rows = await query<{ material_id: number; synced_fields: string | null }>(
    `SELECT s.material_id, s.synced_fields
       FROM material_sync s JOIN materials m ON m.id = s.material_id
      WHERE m.project_id = ?`,
    projectId,
  );
  const map = new Map<number, MaterialFields>();
  for (const r of rows) {
    if (!r.synced_fields) continue;
    try {
      map.set(r.material_id, normalizeFields(JSON.parse(r.synced_fields)));
    } catch {
      /* bỏ qua snapshot hỏng */
    }
  }
  return map;
}

const saveSnapshot = (materialId: number, fields: MaterialFields) =>
  run(
    `INSERT INTO material_sync (material_id, synced_fields, last_synced_at) VALUES (?, ?, NOW())
     ON CONFLICT (material_id) DO UPDATE SET synced_fields = EXCLUDED.synced_fields, last_synced_at = NOW()`,
    materialId,
    JSON.stringify(fields),
  );

// Trong số `ids` (ID đọc từ Sheet), ID nào là vật tư còn tồn tại — chỉ lấy ID, không đọc dữ
// liệu vật tư ngoài phạm vi. ID ngoài biên int4 không thể là vật tư thật nên lọc trước.
async function existingMaterialIds(ids: number[]): Promise<Set<number>> {
  const valid = ids.filter((id) => Number.isSafeInteger(id) && id > 0 && id <= 2147483647);
  const found = new Set<number>();
  for (let i = 0; i < valid.length; i += 1000) {
    const chunk = valid.slice(i, i + 1000);
    const rows = await query<{ id: number }>(
      `SELECT id FROM materials WHERE id IN (${chunk.map(() => "?").join(",")})`,
      ...chunk,
    );
    for (const r of rows) found.add(r.id);
  }
  return found;
}

// Cập nhật các trường merge của 1 vật tư từ giá trị "winner" (Sheet→DB).
async function applyToDb(id: number, projectId: number, w: MaterialFields): Promise<void> {
  await run(
    `UPDATE materials SET boq_code = ?, name = ?, unit = ?, qty_boq = ?, qty_planned = ?,
            status = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`,
    w.boqCode || null,
    w.name,
    w.unit || null,
    parseFloat(w.qtyBoq) || 0,
    parseFloat(w.qtyPlanned) || 0,
    w.status,
    w.note || null,
    id,
    projectId,
  );
}

/**
 * Chạy 1 lần đồng bộ. Cho phép inject sheet client (phục vụ test); mặc định dùng
 * Google Sheets thật. Ném lỗi nếu thiếu cấu hình Google (fail-fast).
 *
 * @param scope Dự án + tổ chức đồng bộ — nơi gọi phải lấy từ phiên/cấu hình server đã kiểm;
 *   ở đây kiểm lại dự án thuộc tổ chức và khớp GOOGLE_SHEET_PROJECT_ID (sai → MaterialSyncScopeError).
 * @param sheetClient Optional sheet client inject cho test.
 */
export async function runMaterialSync(
  scope: MaterialSyncScope,
  sheetClient?: SheetClient,
): Promise<SyncSummary> {
  await assertScope(scope);
  const { orgId, projectId } = scope;
  // Khoá giữ tên chung "materials" (không theo dự án): cả hệ chỉ có MỘT Sheet, hai dự án ghi
  // đè cùng tab đồng thời sẽ làm mất dòng của nhau.
  if (!(await acquireLock()))
    throw new Error("Đang có một lần đồng bộ khác chạy — vui lòng thử lại sau.");

  try {
    const client = sheetClient ?? (await getSheetClient());
    const summary: SyncSummary = {
      pushed: 0,
      pulled: 0,
      created: 0,
      conflicts: [],
      skipped: [],
      total: 0,
    };

    const sheetRows = await client.readRows();
    const dbMaterials = await loadDbMaterials(projectId);
    const snapshots = await loadSnapshots(projectId);

    // Map dòng Sheet theo ID (bỏ header dòng 0) — giữ cả số dòng để log lỗi rõ ràng.
    const sheetById = new Map<number, { rowNum: number; row: string[] }>();
    const newSheetRows: { rowNum: number; row: string[] }[] = [];
    for (let i = 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      if (!row || row.every((c) => !String(c ?? "").trim())) continue; // bỏ dòng trống
      const id = parseInt(String(row[0] ?? ""));
      if (!isNaN(id)) sheetById.set(id, { rowNum: i + 1, row });
      else newSheetRows.push({ rowNum: i + 1, row });
    }

    const dbIds = new Set(dbMaterials.map((m) => m.id));

    // Snapshot chỉ được CHỐT (ghi DB) sau khi bước 4 ghi thành công lên Sheet thật.
    // Ghi sớm (như bản cũ) khiến snapshot coi như "đã đồng bộ" dù ô Sheet vật lý chưa
    // đổi — nếu bước ghi Sheet cuối hàm lỗi mạng, lần sync kế tiếp sẽ thấy sheet lệch
    // snapshot và tự "pull" giá trị Sheet cũ đè lại DB, âm thầm hoàn tác thay đổi hợp lệ.
    const pendingSnapshots: { id: number; fields: MaterialFields }[] = [];

    // 1) Đối chiếu từng vật tư DB với dòng Sheet tương ứng.
    for (const m of dbMaterials) {
      const dbF = dbToFields(m);
      const snap = snapshots.get(m.id) ?? null;
      const sheetRow = sheetById.get(m.id);

      if (!sheetRow) {
        // Chưa có trên Sheet → sẽ được append khi ghi lại toàn bộ; lưu snapshot.
        summary.pushed++;
        pendingSnapshots.push({ id: m.id, fields: dbF });
        continue;
      }

      const { fields: sheetF, invalid } = sheetRowToFieldsChecked(sheetRow.row, dbF);
      if (invalid.length) {
        summary.skipped.push({
          row: sheetRow.rowNum,
          reason: `Cột ${invalid.join(", ")} nhập không hợp lệ trên Sheet (vật tư #${m.id}) — giữ nguyên giá trị DB cho các cột này, kiểm tra lại Sheet`,
        });
      }
      const { decision, winner } = decideMerge(dbF, sheetF, snap);

      if (decision === "pull") {
        await applyToDb(m.id, projectId, winner);
        summary.pulled++;
      } else if (decision === "push") {
        summary.pushed++;
      } else if (decision === "conflict") {
        if (CONFLICT_POLICY === "sheet") {
          await applyToDb(m.id, projectId, winner);
          summary.pulled++;
        } else summary.pushed++;
        summary.conflicts.push({ id: m.id, name: m.name, winner: CONFLICT_POLICY });
      }
      // noop mà snapshot cũ đã khớp winner → khỏi ghi lại (đa số vật tư không đổi mỗi lần sync).
      if (decision !== "noop" || !snap || !fieldsEqual(snap, winner)) {
        pendingSnapshots.push({ id: m.id, fields: winner });
      }
    }

    // 2) Dòng Sheet có ID nằm ngoài phạm vi dự án → bỏ qua (không ghi/không xoá DB):
    //    - ID vẫn tồn tại (vật tư dự án/tổ chức khác — vd Sheet từng đồng bộ toàn hệ): GIỮ NGUYÊN
    //      nội dung dòng đó trên Sheet ở bước 4 (không ghi đè bằng dữ liệu DB, không xoá dòng);
    //    - ID không còn trong DB: như cũ, dòng rơi khỏi Sheet khi ghi lại.
    //    Không nêu tên/dữ liệu DB của vật tư ngoài phạm vi trong kết quả.
    const outOfScope = [...sheetById].filter(([id]) => !dbIds.has(id));
    const existingElsewhere = await existingMaterialIds(outOfScope.map(([id]) => id));
    const keptRows: string[][] = [];
    for (const [id, { rowNum, row }] of outOfScope) {
      if (existingElsewhere.has(id)) {
        keptRows.push(HEADER.map((_, i) => String(row[i] ?? "")));
        summary.skipped.push({
          row: rowNum,
          reason: `ID ${id} không thuộc dự án đang đồng bộ — bỏ qua, giữ nguyên dòng trên Sheet`,
        });
      } else {
        summary.skipped.push({
          row: rowNum,
          reason: `ID ${id} không còn trong DB — bỏ qua (không xoá), tên "${row[2] ?? ""}"`,
        });
      }
    }

    // 3) Dòng Sheet không ID → khớp theo Mã BOQ với vật tư đã có trong DB trước
    // (đúng theo mô tả đầu file); chỉ tạo mới khi không khớp được vật tư nào.
    // Tra mã hệ → sheet_type_id (giống import). Mã BOQ trùng task/nhóm/vật tư khác → tạo không mã.
    const dbByBoqCode = new Map(
      dbMaterials.filter((m) => m.boqCode).map((m) => [m.boqCode as string, m]),
    );
    // Chỉ hệ (sheet) thuộc tháp của dự án — không gắn vật tư vào sheet dự án khác (A1-FR06).
    const sheetTypes = await query<{ id: number; code: string }>(
      `SELECT st.id, st.code FROM sheet_types st
         JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?`,
      projectId,
    );
    const sheetTypeMap = new Map(sheetTypes.map((s) => [s.code.trim().toLowerCase(), s.id]));

    // sort_order lớn nhất hiện có theo từng sheet_type_id — tính 1 lần trước vòng lặp
    // thay vì query MAX() riêng cho mỗi dòng mới, tăng dần trong bộ nhớ khi gán.
    const maxSortByType = new Map<number | null, number>();
    for (const r of await query<{ sheetTypeId: number | null; m: number | null }>(
      `SELECT sheet_type_id AS "sheetTypeId", MAX(sort_order) AS m FROM materials
        WHERE project_id = ? GROUP BY sheet_type_id`,
      projectId,
    )) {
      maxSortByType.set(r.sheetTypeId, r.m ?? 0);
    }

    // Vật tư "mồ côi" = có trong DB, CHƯA từng chốt snapshot và KHÔNG có dòng mang ID của nó
    // trên Sheet — điển hình là vật tư bước này tạo ở lần đồng bộ trước mà bước 4 ghi Sheet
    // lỗi (ID chưa kịp ghi ngược, snapshot chưa chốt). Không nhận lại thì dòng Sheet không ID
    // (nhất là dòng KHÔNG có Mã BOQ — không khớp được gì) sinh thêm 1 bản sao mỗi lần chạy lại
    // (S13b, A5-AC01). Khoá khớp = hệ + TOÀN BỘ trường SYNCED_FIELDS đã chuẩn hoá (sau khi áp
    // mã BOQ hiệu lực): chỉ dòng trùng khớp hoàn toàn mới được nhận lại, không ghép "gần giống"
    // (A5-FR01); mỗi vật tư mồ côi chỉ nhận cho đúng 1 dòng. Không xoá/bù trừ vật tư khi ghi
    // Sheet lỗi: ca "mất ACK" Sheet đã giữ ID — xoá sẽ biến dòng đó thành "ID không còn trong DB".
    const orphanKey = (sheetTypeId: number | null, f: MaterialFields) =>
      JSON.stringify([sheetTypeId, ...SYNCED_FIELDS.map((k) => f[k])]);
    const orphans = new Map<string, DbMaterial[]>();
    for (const m of dbMaterials) {
      if (snapshots.has(m.id) || sheetById.has(m.id)) continue;
      const key = orphanKey(m.sheetTypeId, dbToFields(m));
      orphans.set(key, [...(orphans.get(key) ?? []), m]);
    }

    for (const { rowNum, row } of newSheetRows) {
      // boqCode/name là trường chuỗi thuần (không parse số/enum), lấy trực tiếp để
      // xác định "khớp với vật tư nào" trước khi biết fallback cho các trường số/status.
      const rawName = (row[2] ?? "").toString().trim();
      if (!rawName) {
        summary.skipped.push({ row: rowNum, reason: "Thiếu tên vật tư" });
        continue;
      }
      const rawBoqCode = (row[1] ?? "").toString().trim();
      const matched = rawBoqCode ? dbByBoqCode.get(rawBoqCode) : undefined;
      const fallback = matched ? dbToFields(matched) : DEFAULT_NEW_FIELDS;
      const { fields: f, invalid } = sheetRowToFieldsChecked(row, fallback);
      if (invalid.length) {
        summary.skipped.push({
          row: rowNum,
          reason: `Cột ${invalid.join(", ")} nhập không hợp lệ trên Sheet — ${
            matched
              ? `giữ nguyên giá trị DB cho các cột này (vật tư #${matched.id})`
              : "dùng giá trị mặc định khi tạo vật tư mới"
          }, kiểm tra lại Sheet`,
        });
      }

      if (matched) {
        // Dòng mất ID nhưng Mã BOQ khớp vật tư đã có → cập nhật vật tư đó thay vì
        // tạo trùng (bug cũ: chỉ kiểm mã có bị chiếm không rồi luôn tạo mới, không
        // bao giờ thực sự khớp-cập-nhật như header comment mô tả).
        const dbF = dbToFields(matched);
        const snap = snapshots.get(matched.id) ?? null;
        const { decision, winner } = decideMerge(dbF, f, snap);
        if (decision === "pull") {
          await applyToDb(matched.id, projectId, winner);
          summary.pulled++;
        } else if (decision === "conflict") {
          if (CONFLICT_POLICY === "sheet") {
            await applyToDb(matched.id, projectId, winner);
            summary.pulled++;
          } else summary.pushed++;
          summary.conflicts.push({ id: matched.id, name: matched.name, winner: CONFLICT_POLICY });
        } else if (decision === "push") {
          summary.pushed++;
        }
        if (decision !== "noop" || !snap || !fieldsEqual(snap, winner))
          pendingSnapshots.push({ id: matched.id, fields: winner });
        continue;
      }

      let boqCode: string | null = f.boqCode || null;
      let takenBy: string | null = null;
      if (boqCode) {
        // Kiểm mã BOQ không bị chiếm bởi task/nhóm/vật tư khác trong tổ chức này.
        takenBy = await boqTakenBy(boqCode, orgId);
        if (takenBy) boqCode = null;
      }

      const sheetCode = String(row[11] ?? "")
        .trim()
        .toLowerCase();
      const sheetTypeId = sheetTypeMap.get(sheetCode) ?? null;
      const effective = normalizeFields({ ...f, boqCode: boqCode ?? "" });

      // Nhận lại vật tư mồ côi trùng khớp (tạo ở lần đồng bộ lỗi trước) thay vì tạo bản sao.
      // Bước 1 đã tính nó vào `pushed` + snapshot chờ chốt (= effective vì trùng khớp).
      const adopted = orphans.get(orphanKey(sheetTypeId, effective))?.shift();
      if (adopted) {
        if (takenBy)
          summary.skipped.push({
            row: rowNum,
            reason: `Mã BOQ "${f.boqCode}" đã dùng bởi ${takenBy} — giữ vật tư #${adopted.id} không mã đã tạo ở lần đồng bộ trước`,
          });
        continue;
      }
      if (takenBy)
        summary.skipped.push({
          row: rowNum,
          reason: `Mã BOQ "${f.boqCode}" đã dùng bởi ${takenBy} — tạo vật tư không mã`,
        });

      const sortOrder = (maxSortByType.get(sheetTypeId) ?? 0) + 1;
      maxSortByType.set(sheetTypeId, sortOrder);

      const newId = await insertId(
        `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order, project_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        sheetTypeId,
        boqCode,
        f.name,
        f.unit || null,
        parseFloat(f.qtyBoq) || 0,
        parseFloat(f.qtyPlanned) || 0,
        f.status,
        f.note || null,
        sortOrder,
        projectId,
      );

      pendingSnapshots.push({ id: newId, fields: effective });
      summary.created++;
    }

    // 4) Ghi đè toàn bộ tab bằng dữ liệu DB đã gộp (header + mọi vật tư CỦA DỰ ÁN, rồi các dòng
    // ngoài phạm vi giữ nguyên ở bước 2) — MỘT lệnh
    // ghi duy nhất (không clear() trước) để tránh cửa sổ Sheet trống nếu lỗi mạng giữa
    // chừng (trước đây clear() thành công nhưng writeRows() lỗi sẽ xoá trắng cả tab).
    // Đệm dòng rỗng nếu dữ liệu mới ít dòng hơn Sheet cũ để vẫn "xoá" phần dư thừa.
    const finalMaterials = await loadDbMaterials(projectId);
    const out: (string | number)[][] = [HEADER, ...finalMaterials.map(dbToSheetRow), ...keptRows];
    const emptyRow: string[] = new Array(HEADER.length).fill("");
    while (out.length < sheetRows.length) out.push(emptyRow);
    await client.writeRows("A1", out);

    // Sheet đã ghi thành công — giờ mới chốt snapshot cho lần đồng bộ kế tiếp.
    for (const { id, fields } of pendingSnapshots) await saveSnapshot(id, fields);

    summary.total = finalMaterials.length;
    return summary;
  } finally {
    await releaseLock();
  }
}
