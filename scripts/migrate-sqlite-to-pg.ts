// Di trú một lần: SQLite (xboss.db) → PostgreSQL (DATABASE_URL).
// - DROP các bảng cũ trên Postgres (kể cả bảng dở dang từ pipeline trước)
// - Tạo schema mới, copy toàn bộ dữ liệu GIỮ NGUYÊN ID, chỉnh lại sequence
// Chạy: npx tsx scripts/migrate-sqlite-to-pg.ts
import "./env";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getPool, SCHEMA } from "../lib/db";

const SQLITE_PATH = process.env.XBOSS_DB ?? path.join(process.cwd(), "xboss.db");

// Thứ tự copy phải theo FK (cha trước con).
const TABLES: { name: string; cols: string[] }[] = [
  { name: "users", cols: ["id", "name", "email", "password_hash", "role", "created_at"] },
  { name: "projects", cols: ["id", "name", "code", "investor", "contractor", "start_date", "end_date", "created_at"] },
  { name: "towers", cols: ["id", "project_id", "name", "description"] },
  { name: "sheet_types", cols: ["id", "tower_id", "code", "name", "responsible"] },
  { name: "work_packages", cols: ["id", "sheet_type_id", "code", "seq_no", "floor_label", "name", "start_date", "end_date", "duration_days", "status", "progress", "created_at"] },
  { name: "tasks", cols: ["id", "package_id", "code", "seq_no", "name", "note", "status", "start_date", "end_date", "duration_days", "progress_percent", "updated_at"] },
  { name: "progress_dimensions", cols: ["id", "task_id", "dimension_label", "installed", "value", "updated_at"] },
  { name: "task_history", cols: ["id", "task_id", "old_progress", "new_progress", "status", "note", "changed_by", "changed_at"] },
  { name: "notifications", cols: ["id", "user_id", "task_id", "type", "message", "is_read", "created_at"] },
];

const CHUNK = 500;

async function main() {
  console.log(`📦 Nguồn SQLite: ${SQLITE_PATH}`);
  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
  const pool = getPool();

  // 1. Drop bảng cũ (bao gồm bảng dở dang từ lần thử drizzle trước).
  console.log("🗑️  Xoá bảng cũ trên Postgres...");
  for (const t of [...TABLES].reverse()) {
    await pool.query(`DROP TABLE IF EXISTS ${t.name} CASCADE`);
  }

  // 2. Tạo schema mới.
  console.log("🏗️  Tạo schema...");
  await pool.query(SCHEMA);

  // 3. Copy dữ liệu theo lô, giữ nguyên id.
  for (const t of TABLES) {
    const rows = sqlite.prepare(`SELECT ${t.cols.join(", ")} FROM ${t.name}`).all() as Record<string, unknown>[];
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((row) => {
        const ph = t.cols.map((c) => { params.push(row[c] ?? null); return `$${params.length}`; });
        return `(${ph.join(",")})`;
      });
      await pool.query(
        `INSERT INTO ${t.name} (${t.cols.join(", ")}) VALUES ${tuples.join(",")}`,
        params,
      );
    }
    // Sequence tiếp tục từ MAX(id)+1.
    await pool.query(
      `SELECT setval(pg_get_serial_sequence('${t.name}','id'), COALESCE((SELECT MAX(id) FROM ${t.name}), 0) + 1, false)`);
    console.log(`✅ ${t.name.padEnd(22)} ${rows.length} dòng`);
  }

  // 4. Đối chiếu số dòng.
  console.log("\n🔍 Đối chiếu:");
  let ok = true;
  for (const t of TABLES) {
    const src = (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`).get() as { n: number }).n;
    const dst = Number((await pool.query(`SELECT COUNT(*) AS n FROM ${t.name}`)).rows[0].n);
    const match = src === dst;
    if (!match) ok = false;
    console.log(`${match ? "✅" : "❌"} ${t.name.padEnd(22)} SQLite=${src}  PG=${dst}`);
  }

  console.log(ok ? "\n🎉 Di trú hoàn tất, dữ liệu khớp 100%." : "\n❌ Có bảng lệch số dòng — kiểm tra lại!");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => { console.error("❌ Di trú lỗi:", err); process.exit(1); });
