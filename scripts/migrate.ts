// Chạy migration thủ công: `npm run db:migrate`. App cũng tự áp lúc boot (ensureSchema),
// nhưng lệnh này để chủ động áp khi deploy hoặc kiểm tra trạng thái schema.
import "./env";
import { getPool } from "../lib/db";
import { runMigrations } from "../lib/db/migrate";

async function main() {
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
