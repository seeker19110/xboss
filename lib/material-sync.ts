import { query, queryOne, run, insertId } from "@/lib/db";
import { boqTakenBy } from "@/lib/boq";
import { getSheetClient, type SheetClient } from "@/lib/google-sheets";

// Đồng bộ HAI CHIỀU bảng `materials` ↔ Google Sheet.
//
// Cách hoạt động:
//  - Mỗi dòng Sheet khớp vật tư qua cột ID (= materials.id). Dòng không ID khớp
//    theo Mã BOQ, không có thì tạo vật tư mới và ghi ID trả lại Sheet.
//  - 3-way merge dựa vào snapshot lần đồng bộ trước (bảng material_sync) để biết
//    phía nào đã đổi. Chỉ DB đổi → đẩy ra Sheet; chỉ Sheet đổi → kéo vào DB; cả
//    hai đổi (xung đột) → DB thắng (CONFLICT_POLICY), liệt kê trong kết quả.
//  - Sau khi gộp mọi thay đổi vào DB, ghi đè toàn bộ tab Sheet bằng dữ liệu DB
//    (header + mọi vật tư) — tự xử lý append vật tư mới và ghi ID ngược lại.
//
// Lưu ý: qty_used / qty_stock / min_stock_level chỉ DB→Sheet (phái sinh từ audit
// material_transactions) — sửa ở Sheet sẽ bị ghi đè ở lần đồng bộ kế tiếp.

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

// Đọc 1 dòng Sheet (mảng ô) → trường vật tư đã chuẩn hoá (theo cột B..L).
const sheetRowToFields = (row: string[]): MaterialFields =>
  normalizeFields({
    boqCode: row[1] ?? "",
    name: row[2] ?? "",
    unit: row[3] ?? "",
    qtyBoq: row[4] ?? "",
    qtyPlanned: row[5] ?? "",
    status: row[9] ?? "",
    note: row[10] ?? "",
  });

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

async function loadDbMaterials(): Promise<DbMaterial[]> {
  return query<DbMaterial>(
    `SELECT m.id, m.sheet_type_id AS "sheetTypeId", st.code AS "sheetCode",
            m.boq_code AS "boqCode", m.name, m.unit,
            COALESCE(m.qty_boq, 0) AS "qtyBoq", COALESCE(m.qty_planned, 0) AS "qtyPlanned",
            COALESCE(m.qty_used, 0) AS "qtyUsed", COALESCE(m.qty_stock, 0) AS "qtyStock",
            COALESCE(m.min_stock_level, 0) AS "minStockLevel",
            COALESCE(m.status, 'dat_hang') AS status, m.note
       FROM materials m
       LEFT JOIN sheet_types st ON m.sheet_type_id = st.id
      ORDER BY m.sort_order, m.id`,
  );
}

async function loadSnapshots(): Promise<Map<number, MaterialFields>> {
  const rows = await query<{ material_id: number; synced_fields: string | null }>(
    `SELECT material_id, synced_fields FROM material_sync`,
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

// Cập nhật các trường merge của 1 vật tư từ giá trị "winner" (Sheet→DB).
async function applyToDb(id: number, w: MaterialFields): Promise<void> {
  await run(
    `UPDATE materials SET boq_code = ?, name = ?, unit = ?, qty_boq = ?, qty_planned = ?,
            status = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    w.boqCode || null,
    w.name,
    w.unit || null,
    parseFloat(w.qtyBoq) || 0,
    parseFloat(w.qtyPlanned) || 0,
    w.status,
    w.note || null,
    id,
  );
}

/**
 * Chạy 1 lần đồng bộ. Cho phép inject sheet client (phục vụ test); mặc định dùng
 * Google Sheets thật. Ném lỗi nếu thiếu cấu hình Google (fail-fast).
 */
export async function runMaterialSync(sheetClient?: SheetClient): Promise<SyncSummary> {
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
    const dbMaterials = await loadDbMaterials();
    const snapshots = await loadSnapshots();

    // Map dòng Sheet theo ID (bỏ header dòng 0).
    const sheetById = new Map<number, string[]>();
    const newSheetRows: { rowNum: number; row: string[] }[] = [];
    for (let i = 1; i < sheetRows.length; i++) {
      const row = sheetRows[i];
      if (!row || row.every((c) => !String(c ?? "").trim())) continue; // bỏ dòng trống
      const id = parseInt(String(row[0] ?? ""));
      if (!isNaN(id)) sheetById.set(id, row);
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

      const sheetF = sheetRowToFields(sheetRow);
      const { decision, winner } = decideMerge(dbF, sheetF, snap);

      if (decision === "pull") {
        await applyToDb(m.id, winner);
        summary.pulled++;
      } else if (decision === "push") {
        summary.pushed++;
      } else if (decision === "conflict") {
        if (CONFLICT_POLICY === "sheet") {
          await applyToDb(m.id, winner);
          summary.pulled++;
        } else summary.pushed++;
        summary.conflicts.push({ id: m.id, name: m.name, winner: CONFLICT_POLICY });
      }
      // noop mà snapshot cũ đã khớp winner → khỏi ghi lại (đa số vật tư không đổi mỗi lần sync).
      if (decision !== "noop" || !snap || !fieldsEqual(snap, winner)) {
        pendingSnapshots.push({ id: m.id, fields: winner });
      }
    }

    // 2) Dòng Sheet có ID nhưng không còn trong DB → bỏ qua (không tự xoá DB).
    for (const [id, row] of sheetById) {
      if (!dbIds.has(id)) {
        const rowNum = sheetRows.findIndex((r) => parseInt(String(r?.[0] ?? "")) === id) + 1;
        summary.skipped.push({
          row: rowNum,
          reason: `ID ${id} không còn trong DB — bỏ qua (không xoá), tên "${row[2] ?? ""}"`,
        });
      }
    }

    // 3) Dòng Sheet không ID → tạo vật tư mới trong DB.
    // Tra mã hệ → sheet_type_id (giống import). Mã BOQ trùng task/nhóm/vật tư khác → tạo không mã.
    const sheetTypes = await query<{ id: number; code: string }>(
      `SELECT id, code FROM sheet_types`,
    );
    const sheetTypeMap = new Map(sheetTypes.map((s) => [s.code.trim().toLowerCase(), s.id]));

    // sort_order lớn nhất hiện có theo từng sheet_type_id — tính 1 lần trước vòng lặp
    // thay vì query MAX() riêng cho mỗi dòng mới, tăng dần trong bộ nhớ khi gán.
    const maxSortByType = new Map<number | null, number>();
    for (const r of await query<{ sheetTypeId: number | null; m: number | null }>(
      `SELECT sheet_type_id AS "sheetTypeId", MAX(sort_order) AS m FROM materials GROUP BY sheet_type_id`,
    )) {
      maxSortByType.set(r.sheetTypeId, r.m ?? 0);
    }

    for (const { rowNum, row } of newSheetRows) {
      const f = sheetRowToFields(row);
      if (!f.name) {
        summary.skipped.push({ row: rowNum, reason: "Thiếu tên vật tư" });
        continue;
      }

      let boqCode: string | null = f.boqCode || null;
      if (boqCode) {
        const usedBy = await boqTakenBy(boqCode);
        if (usedBy) {
          summary.skipped.push({
            row: rowNum,
            reason: `Mã BOQ "${boqCode}" đã dùng bởi ${usedBy} — tạo vật tư không mã`,
          });
          boqCode = null;
        }
      }

      const sheetCode = String(row[11] ?? "")
        .trim()
        .toLowerCase();
      const sheetTypeId = sheetTypeMap.get(sheetCode) ?? null;
      const sortOrder = (maxSortByType.get(sheetTypeId) ?? 0) + 1;
      maxSortByType.set(sheetTypeId, sortOrder);

      const newId = await insertId(
        `INSERT INTO materials (sheet_type_id, boq_code, name, unit, qty_boq, qty_planned, qty_used, status, note, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
        sheetTypeId,
        boqCode,
        f.name,
        f.unit || null,
        parseFloat(f.qtyBoq) || 0,
        parseFloat(f.qtyPlanned) || 0,
        f.status,
        f.note || null,
        sortOrder,
      );

      pendingSnapshots.push({
        id: newId,
        fields: normalizeFields({ ...f, boqCode: boqCode ?? "" }),
      });
      summary.created++;
    }

    // 4) Ghi đè toàn bộ tab bằng dữ liệu DB đã gộp (header + mọi vật tư) — MỘT lệnh
    // ghi duy nhất (không clear() trước) để tránh cửa sổ Sheet trống nếu lỗi mạng giữa
    // chừng (trước đây clear() thành công nhưng writeRows() lỗi sẽ xoá trắng cả tab).
    // Đệm dòng rỗng nếu dữ liệu mới ít dòng hơn Sheet cũ để vẫn "xoá" phần dư thừa.
    const finalMaterials = await loadDbMaterials();
    const out: (string | number)[][] = [HEADER, ...finalMaterials.map(dbToSheetRow)];
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
