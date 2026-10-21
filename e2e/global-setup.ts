import { execSync } from "node:child_process";
import { Pool } from "pg";
import { ADMIN_EMAIL, ADMIN_PW, E2E_DB } from "./constants";

// Migrate rồi seed tường minh vào DB test trước E2E; HTTP login/me không được tự tạo schema.
export default async function globalSetup(): Promise<void> {
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

  // Membership tường minh: fixture mới không được đổi phạm vi của tài khoản demo.
  const demoEmails = [ADMIN_EMAIL, "pm@xboss.vn", "engineer@xboss.vn", "subcon@xboss.vn"];
  const projectCodes = ["AVIO-A", "TESTB"];
  const pool = new Pool({ connectionString: E2E_DB, max: 1 });
  try {
    const { rows } = await pool.query<{ userId: number; projectId: number }>(
      `SELECT u.id AS "userId", p.id AS "projectId"
       FROM users u JOIN projects p ON p.org_id = u.org_id
       WHERE u.email = ANY($1::text[]) AND p.code = ANY($2::text[])`,
      [demoEmails, projectCodes],
    );
    if (rows.length !== demoEmails.length * projectCodes.length) {
      throw new Error("Thiếu tài khoản demo hoặc dự án seed cùng tổ chức trong DB E2E");
    }
    for (const { userId, projectId } of rows) {
      await pool.query(
        `INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)
         ON CONFLICT (user_id, project_id) DO NOTHING`,
        [userId, projectId],
      );
    }
  } finally {
    await pool.end();
  }
}
