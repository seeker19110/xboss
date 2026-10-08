// Backfill khối lượng exact cho PR/PO/phiếu nhận — DATA-MIGRATIONS §6 (bước sau migration 0163).
// Mỗi cột float cũ → `*_exact = qty::text::numeric` (chuỗi shortest-roundtrip của float8 — biểu
// diễn float ĐÃ LƯU, không chứng minh số decimal người dùng nhập gốc, không round thêm), đánh dấu
// `*_provenance = 'legacy_float_text'`. Provenance theo TỪNG CỘT.
// - Chỉ chạm dòng có provenance NULL → chạy lại idempotent, không bao giờ đè 'exact_input_v1'.
// - Ghi dưới row lock (SELECT … FOR UPDATE trong transaction theo lô) và so old-value
//   (`qty::text = <giá trị vừa đọc>`) ngay trong UPDATE.
// - Null hợp lệ giữ Null; NaN/Infinity/âm → danh sách đối soát (in ra), KHÔNG ghi 0.
// - Lô theo id + checkpoint (in id cuối mỗi lô; tiếp tục bằng --from-id=<id>).
// Chạy (staging trước production): npx tsx scripts/backfill-po-qty-exact.ts [--dry-run]
//   [--batch=500] [--from-id=0]
import "./env";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { query, run, withTransaction } from "@/lib/db";

/** Các cột cần backfill: bảng + tên cột float (exact/provenance suy theo hậu tố). */
export const PO_QTY_FIELDS = [
  { table: "purchase_requests", column: "qty_requested" },
  { table: "po_items", column: "qty_ordered" },
  { table: "po_items", column: "qty_received" },
  { table: "receipt_items", column: "qty_received" },
] as const;

export type BackfillReport = {
  table: string;
  column: string;
  written: number;
  skippedNull: number;
  /** Dòng nonfinite/âm — cần đối soát chứng từ, không tự sửa. */
  reconciliation: { id: number; value: string }[];
  /** Dòng đổi giá trị giữa lúc đọc và ghi (không xảy ra dưới khoá — phòng thủ). */
  changed: number;
  lastId: number;
};

const NON_FINITE = new Set(["NaN", "Infinity", "-Infinity"]);

export async function backfillPoQtyExact(opts: {
  dryRun?: boolean;
  batch?: number;
  fromId?: number;
  onCheckpoint?: (r: BackfillReport) => void;
}): Promise<BackfillReport[]> {
  const batch = Math.max(1, opts.batch ?? 500);
  const reports: BackfillReport[] = [];
  for (const f of PO_QTY_FIELDS) {
    // Tên bảng/cột lấy từ hằng PO_QTY_FIELDS ở trên (không từ input) — nối an toàn.
    const exact = `${f.column}_exact`;
    const prov = `${f.column}_provenance`;
    const r: BackfillReport = {
      table: f.table,
      column: f.column,
      written: 0,
      skippedNull: 0,
      reconciliation: [],
      changed: 0,
      lastId: opts.fromId ?? 0,
    };
    for (;;) {
      const n = await withTransaction(async () => {
        const rows = await query<{ id: number; old: string | null }>(
          `SELECT id, ${f.column}::text AS old FROM ${f.table}
            WHERE id > ? AND ${prov} IS NULL
            ORDER BY id LIMIT ? FOR UPDATE`,
          r.lastId,
          batch,
        );
        for (const row of rows) {
          r.lastId = row.id;
          if (row.old == null) {
            r.skippedNull++;
            continue;
          }
          if (NON_FINITE.has(row.old) || row.old.startsWith("-")) {
            r.reconciliation.push({ id: row.id, value: row.old });
            continue;
          }
          if (opts.dryRun) {
            r.written++;
            continue;
          }
          const ok = await run(
            `UPDATE ${f.table}
                SET ${exact} = ${f.column}::text::numeric, ${prov} = 'legacy_float_text'
              WHERE id = ? AND ${prov} IS NULL AND ${f.column}::text = ?`,
            row.id,
            row.old,
          );
          if (ok.changes === 1) r.written++;
          else r.changed++;
        }
        return rows.length;
      });
      opts.onCheckpoint?.(r);
      if (n < batch) break;
    }
    reports.push(r);
  }
  return reports;
}

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a?.slice(name.length + 3);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const batch = Number(arg("batch") ?? 500);
  const fromId = Number(arg("from-id") ?? 0);
  console.log(dryRun ? "🔎 DRY-RUN — không ghi gì." : "✍️  Backfill khối lượng exact…");
  const reports = await backfillPoQtyExact({
    dryRun,
    batch,
    fromId,
    onCheckpoint: (r) => console.log(`  checkpoint ${r.table}.${r.column}: id ≤ ${r.lastId}`),
  });
  let canDoiSoat = 0;
  for (const r of reports) {
    console.log(
      `${r.table}.${r.column}: ${dryRun ? "sẽ ghi" : "đã ghi"} ${r.written}, null giữ nguyên ${r.skippedNull}, đổi giữa chừng ${r.changed}, cần đối soát ${r.reconciliation.length}`,
    );
    for (const x of r.reconciliation) console.log(`   ⚠️  đối soát id=${x.id} giá trị=${x.value}`);
    canDoiSoat += r.reconciliation.length + r.changed;
  }
  process.exit(canDoiSoat === 0 ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("❌", err);
    process.exit(1);
  });
}
