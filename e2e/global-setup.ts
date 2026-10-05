import { execSync } from "node:child_process";
import { ADMIN_PW, E2E_DB } from "./constants";

// Migrate rồi seed tường minh vào DB test trước E2E; HTTP login/me không được tự tạo schema.
export default function globalSetup(): void {
  if (!E2E_DB) return;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: E2E_DB,
    MIGRATE_DATABASE_URL: E2E_DB,
    NODE_ENV: "test",
    XBOSS_ADMIN_PASSWORD: ADMIN_PW,
  };
  console.log("[e2e] Áp migration vào DB test disposable…");
  execSync("npx tsx scripts/migrate.ts", { stdio: "inherit", env });
  console.log("[e2e] Seed dữ liệu và tài khoản vào DB test…");
  execSync("npx tsx scripts/seed-sample.ts", { stdio: "inherit", env });
  execSync("npx tsx scripts/seed-demo-users.ts", { stdio: "inherit", env });
}
