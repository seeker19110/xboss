import "./env";
import { queryOne, run } from "../lib/db";
import { hashPassword } from "../lib/auth";

// Đặt lại (hoặc tạo mới) tài khoản admin.
// Dùng: npx tsx scripts/reset-admin.ts <mật_khẩu_mới> [email]
async function main() {
  const pw = process.argv[2];
  const email = process.argv[3] ?? "admin@xboss.vn";
  if (!pw) {
    console.error("Thiếu mật khẩu. Dùng: npx tsx scripts/reset-admin.ts <mật_khẩu_mới> [email]");
    process.exit(1);
  }

  const hash = hashPassword(pw);
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM users WHERE email = ?`, email);

  if (existing) {
    await run(`UPDATE users SET password_hash = ?, role = 'admin' WHERE email = ?`, hash, email);
    console.log(`✅ Đã đặt lại mật khẩu cho admin hiện có: ${email}`);
  } else {
    await run(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`,
      "Quản trị", email, hash);
    console.log(`✅ Đã tạo admin mới: ${email}`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
