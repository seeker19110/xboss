import "./env";
import { queryOne, run } from "../lib/db";
import { hashPassword } from "../lib/auth";
import { ROLES, type Role } from "../lib/roles";

// Tạo mới (hoặc cập nhật) một tài khoản bất kỳ.
// Dùng: npx tsx scripts/create-user.ts <email> <mật_khẩu> <vai_trò> [tên]
async function main() {
  const email = process.argv[2];
  const pw = process.argv[3];
  const role = (process.argv[4] ?? "viewer") as Role;
  const name = process.argv[5] ?? "Người xem";

  if (!email || !pw) {
    console.error("Thiếu tham số. Dùng: npx tsx scripts/create-user.ts <email> <mật_khẩu> <vai_trò> [tên]");
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`Vai trò không hợp lệ: ${role}. Hợp lệ: ${ROLES.join(", ")}`);
    process.exit(1);
  }

  const hash = hashPassword(pw);
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM users WHERE email = ?`, email);

  if (existing) {
    await run(`UPDATE users SET password_hash = ?, role = ? WHERE email = ?`, hash, role, email);
    console.log(`✅ Đã cập nhật tài khoản ${email} (vai trò: ${role})`);
  } else {
    await run(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      name, email, hash, role);
    console.log(`✅ Đã tạo tài khoản mới: ${email} (vai trò: ${role})`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
