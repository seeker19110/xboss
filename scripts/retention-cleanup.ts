// Dọn evidence JSON DR/PITR và thư mục diễn tập run-* theo chính sách retention (M130).
// Dry-run mặc định; chỉ --apply mới xoá. Xem docs/ops/backup.md "Retention evidence & diễn tập".
//   npx tsx scripts/retention-cleanup.ts --evidence-dir <dir> [--drill-dir <dir>] [--apply]
//     [--evidence-pass-days 35] [--evidence-fail-days 365] [--drill-pass-days 7]
//     [--drill-fail-days 35] [--force-run <run-id>]... [--json] [--now <ISO>]
// Mã thoát: 0 xong · 2 tham số sai/thư mục nguy hiểm.
import { runRetention } from "./lib/retention";

process.exitCode = runRetention(process.argv.slice(2), process.env, (line) => console.log(line));
