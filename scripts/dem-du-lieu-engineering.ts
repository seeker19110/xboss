// Kiểm kê engineering trong một org/project; không suy ra mức dùng sản phẩm từ số dòng.
// Cấp riêng INVENTORY_DATABASE_URL cho role kiểm kê chỉ đọc, không dùng DATABASE_URL mặc định.
// Chạy: npm run dem:engineering -- --org <id> --project <id> [--tat-ca]
// Role bị RLS lọc/thiếu quyền sẽ nhận unknown, cần operator kiểm quyền đọc trước khi kết luận.
import { Client } from "pg";
import {
  collectEngineeringInventory,
  ENGINEERING_GROUPS,
  inventoryErrorReason,
  inventoryTotal,
  readInventoryInput,
} from "./lib/engineering-inventory";

async function main() {
  const input = readInventoryInput(process.argv.slice(2), process.env);
  const client = new Client({
    connectionString: input.connectionString,
    application_name: "xboss-engineering-inventory",
    connectionTimeoutMillis: 10_000,
    options: "-c default_transaction_read_only=on -c statement_timeout=30000",
  });
  try {
    await client.connect();
    const report = await collectEngineeringInventory(client, input.scope, input.all);
    console.log(`=== Kiểm kê chỉ đọc: org ${input.scope.org}, project ${input.scope.project} ===`);
    console.log(report.reason);
    for (const row of report.rows) {
      console.log(`${row.table}: ${row.count ?? row.state} — ${row.reason}`);
    }
    console.log("\nTổng theo nhóm (unknown nếu có bảng chưa kiểm chứng):");
    for (const group of ENGINEERING_GROUPS) {
      console.log(
        `${group.name}: gốc ${inventoryTotal(report.rows, group.base)}; engineering ${inventoryTotal(report.rows, group.engineering)}`,
      );
    }
    console.log(
      "\nSố 0 chỉ có nghĩa không có dòng trong scope/snapshot này. Cần đối chiếu caller, usage, hồ sơ lưu trữ và owner trước quyết định giữ/gộp/gỡ capability.",
    );
    if (!report.complete) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Không in error gốc: pg/parser có thể chứa URL, credential hoặc thông tin DB.
  console.error(`unknown — ${inventoryErrorReason(error)}`);
  process.exitCode = 1;
});
