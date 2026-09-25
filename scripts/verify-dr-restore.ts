// Kiểm smoke sau restore trên bản sao cách ly; không tự restore hoặc áp migration.
// Dùng DR_VERIFY_DATABASE_URL + DR_VERIFY_EXPECTED_DATABASE + DR_VERIFY_EXPECTED_USER.
import "./env";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { readDrTarget, runDrChecks } from "./lib/dr-readonly";

async function main(): Promise<void> {
  const target = readDrTarget(process.env);
  const migrationNames = readdirSync(join(process.cwd(), "migrations"))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const client = new Client({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 10_000,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=30000 -c timezone=Asia/Ho_Chi_Minh",
  });
  try {
    await client.connect();
    const results = await runDrChecks(client, target, migrationNames);
    console.log(JSON.stringify({ kind: "dr-smoke", completeDrVerified: false, results }, null, 2));
    console.log("Chưa xác minh manifest, tệp đính kèm, PITR, RPO/RTO hoặc nghiệm thu production.");
    process.exitCode = results.every((result) => result.status === "PASS") ? 0 : 1;
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error(
    "Kiểm DR thất bại. Kiểm tra đích cách ly, cấu hình, quyền đọc và schema; không tự migrate.",
  );
  process.exitCode = 1;
});
