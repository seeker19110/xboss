// Xác minh chuỗi hash-chain của audit_log (M43 PR3) — phát hiện dòng bị sửa/xoá tay
// ngoài luồng app (UPDATE/DELETE trực tiếp trên DB, bỏ qua trigger audit_row_change()).
// Logic thuần nằm ở lib/audit-chain.ts (dùng chung với cron báo cáo tuần).
// Chạy tay: npx tsx scripts/verify-audit-chain.ts
import "./env";
import { getPool } from "../lib/db";
import { verifyAuditChain } from "../lib/audit-chain";

async function main() {
  console.log("⏳ Đang xác minh chuỗi hash audit_log…");
  const result = await verifyAuditChain();

  console.log(`— Tổng số dòng đọc:  ${result.total}`);
  console.log(`— Số dòng đối chiếu được (có row_hash): ${result.checked}`);
  console.log(`— Số dòng lỗi: ${result.errors.length}`);

  if (result.ok) {
    console.log("🎉 Chuỗi hợp lệ — không phát hiện thay đổi ngoài luồng app.");
  } else {
    console.error(`❌ PHÁT HIỆN ${result.errors.length} dòng bị thay đổi/không khớp:`);
    for (const e of result.errors) {
      console.error(`   - id=${e.id}: kỳ vọng ${e.expected} nhưng thực tế ${e.actual ?? "(NULL)"}`);
    }
  }

  await getPool().end();
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ Verify lỗi:", err);
  process.exit(1);
});
