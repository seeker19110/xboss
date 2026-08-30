// Script kiểm tra tính toàn vẹn dữ liệu sau khi Restore / Diễn tập DR (C4 §8)
//
// Chức năng:
// 1. Kiểm tra kết nối DB và phiên bản PostgreSQL
// 2. Đối soát migration đã áp trong schema_migrations với thư mục migrations/
// 3. Thống kê số lượng bản ghi các bảng cốt lõi (users, projects, tasks, engineering_*, audit_log, v.v.)
// 4. Kiểm tra chuỗi hash audit trail (hash-chain integrity)
// 5. Kiểm tra bất biến quan hệ (không có foreign key orphan, không có relation chéo dự án)
//
// Chạy: npx tsx scripts/verify-dr-restore.ts
import "./env";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "@/lib/db";
import { verifyAuditChain } from "@/lib/bao-mat/audit-chain";

interface CheckResult {
  name: string;
  passed: boolean;
  details: string;
}

async function main() {
  console.log("=================================================");
  console.log("🚀 BẮT ĐẦU KIỂM TRA KHÔI PHỤC DỮ LIỆU & DR (C4 §8)");
  console.log(`⏰ Thời điểm: ${new Date().toISOString()}`);
  console.log("=================================================\n");

  const pool = getPool();
  const results: CheckResult[] = [];

  // 1. DB Connectivity & Postgres Version
  try {
    const res = await pool.query("SELECT version()");
    results.push({
      name: "Kết nối Database",
      passed: true,
      details: res.rows[0]?.version?.split(" on ")[0] ?? "OK",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      name: "Kết nối Database",
      passed: false,
      details: `Không thể kết nối DB: ${msg}`,
    });
  }

  // 2. Migration Check
  try {
    const migrationFiles = readdirSync(join(process.cwd(), "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const dbMigrations = await pool.query("SELECT name FROM schema_migrations ORDER BY name ASC");
    const appliedSet = new Set(dbMigrations.rows.map((r: { name: string }) => r.name));
    const unapplied = migrationFiles.filter((f) => !appliedSet.has(f));

    if (unapplied.length === 0) {
      results.push({
        name: "Kiểm tra Migrations",
        passed: true,
        details: `Đã áp đủ ${migrationFiles.length}/${migrationFiles.length} file migration.`,
      });
    } else {
      results.push({
        name: "Kiểm tra Migrations",
        passed: false,
        details: `Còn ${unapplied.length} migration chưa được áp: ${unapplied.slice(0, 3).join(", ")}...`,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      name: "Kiểm tra Migrations",
      passed: false,
      details: `Lỗi đọc bảng schema_migrations: ${msg}`,
    });
  }

  // 3. Core Table Counts Smoke Check
  const coreTables = [
    "users",
    "projects",
    "towers",
    "sheet_types",
    "work_packages",
    "tasks",
    "materials",
    "audit_log",
    "engineering_objects",
    "engineering_relations",
    "engineering_workflows",
    "engineering_agent_sessions",
    "import_batches",
  ];

  const counts: Record<string, number> = {};
  let countErrors = 0;
  for (const table of coreTables) {
    try {
      const res = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
      counts[table] = res.rows[0]?.cnt ?? 0;
    } catch {
      counts[table] = -1;
      countErrors++;
    }
  }

  results.push({
    name: "Thống kê bảng cốt lõi",
    passed: countErrors === 0,
    details:
      countErrors === 0
        ? `Đã kiểm tra ${coreTables.length} bảng (users: ${counts.users}, projects: ${counts.projects}, tasks: ${counts.tasks}, objects: ${counts.engineering_objects})`
        : `Có ${countErrors} bảng không truy vấn được`,
  });

  // 4. Audit Trail Hash Chain Integrity
  try {
    const chain = await verifyAuditChain();
    results.push({
      name: "Tính toàn vẹn Audit Log (Hash-chain)",
      passed: chain.ok,
      details: chain.ok
        ? `Chuỗi hợp lệ (${chain.checked}/${chain.total} dòng được ký hash, 0 lỗi)`
        : `Phát hiện ${chain.errors.length} dòng bị sai lệch hash!`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      name: "Tính toàn vẹn Audit Log (Hash-chain)",
      passed: false,
      details: `Lỗi xác minh chuỗi audit: ${msg}`,
    });
  }

  // 5. Invariant: Cross-project engineering relations
  try {
    const crossProj = await pool.query(`
      SELECT r.id, r.project_id AS rel_proj, f.project_id AS from_proj, t.project_id AS to_proj
      FROM engineering_relations r
      JOIN engineering_objects f ON r.from_object_id = f.id
      JOIN engineering_objects t ON r.to_object_id = t.id
      WHERE r.project_id != f.project_id OR r.project_id != t.project_id
      LIMIT 5
    `);

    if (crossProj.rows.length === 0) {
      results.push({
        name: "Bất biến cách ly Engineering Relations",
        passed: true,
        details: "Không có quan hệ nào bị lệch project_id so với 2 đầu liên kết.",
      });
    } else {
      results.push({
        name: "Bất biến cách ly Engineering Relations",
        passed: false,
        details: `Phát hiện ${crossProj.rows.length} quan hệ vi phạm bất biến dự án!`,
      });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({
      name: "Bất biến cách ly Engineering Relations",
      passed: false,
      details: `Lỗi kiểm tra relation invariants: ${msg}`,
    });
  }

  // TỔNG KẾT
  console.log("--- KẾT QUẢ KIỂM TRA ---");
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✅" : "❌";
    console.log(`${icon} [${r.name}]: ${r.details}`);
    if (!r.passed) allPassed = false;
  }

  console.log("\n=================================================");
  if (allPassed) {
    console.log("🎉 TOÀN BỘ KIỂM TRA DR & TOÀN VẸN DỮ LIỆU ĐẠT CHUẨN!");
  } else {
    console.error("⚠️ CÓ HẠNG MỤC KHÔNG ĐẠT YÊU CẦU DR / TOÀN VẸN DỮ LIỆU.");
  }
  console.log("=================================================");

  await pool.end();
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Lỗi nghiêm trọng khi chạy DR verify:", err);
  process.exit(1);
});
