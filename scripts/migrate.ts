// Chạy migration thủ công: `npm run db:migrate`. App cũng tự áp lúc boot (ensureSchema),
// nhưng lệnh này để chủ động áp khi deploy hoặc kiểm tra trạng thái schema.
// `npm run db:migrate -- --dry-run` (M44 PR4): chỉ IN danh sách migration SẼ áp, không chạy
// gì — dùng kiểm tra trước deploy/staging (xem docs/ops/staging.md, CLAUDE.md mục Quy ước).
import "./env";
import { getPool } from "../lib/db";
import { runMigrations, pendingMigrations } from "../lib/db/migrate";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log("🔍 Dry-run: kiểm tra migration sẽ áp — KHÔNG chạy gì.");
    const pending = await pendingMigrations(getPool());
    if (pending.length === 0) {
      console.log("✅ DB đã cập nhật — không có migration nào sẽ áp.");
    } else {
      console.log(`⚠️  Sẽ áp ${pending.length} migration:`);
      for (const f of pending) console.log(`   - ${f}`);
    }
    await getPool().end();
    process.exit(0);
  }

  console.log("⏳ Đang áp migration…");
  const ran = await runMigrations(getPool());
  if (ran.length === 0) {
    console.log("✅ DB đã cập nhật — không có migration mới.");
  } else {
    console.log(`✅ Đã áp ${ran.length} migration:`);
    for (const f of ran) console.log(`   - ${f}`);
  }
  await getPool().end();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migrate lỗi:", err);
  process.exit(1);
});
