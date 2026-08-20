// Script reset mật khẩu tài khoản mặc định và dọn rate-limit trên DB.
import "./env";
import { run } from "../lib/db";
import { hashPassword, type Role } from "../lib/auth";

const DEFAULTS: { name: string; email: string; pw: string; role: Role }[] = [
  {
    name: "Quản trị",
    email: "admin@xboss.vn",
    pw: process.env.XBOSS_ADMIN_PASSWORD || "admin123",
    role: "admin",
  },
  { name: "Trưởng dự án", email: "pm@xboss.vn", pw: "pm123", role: "pm" },
  { name: "Kỹ sư", email: "engineer@xboss.vn", pw: "eng123", role: "engineer" },
  { name: "Thầu phụ", email: "subcon@xboss.vn", pw: "sub123", role: "subcon" },
];

async function main() {
  console.log("🔄 Đang đặt lại tài khoản mặc định và mở khoá đăng nhập...");

  for (const u of DEFAULTS) {
    await run(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
      u.name,
      u.email,
      hashPassword(u.pw),
      u.role,
    );
    console.log(`✅ ${u.name} (${u.email}) -> Mật khẩu: ${u.pw}`);
  }

  // Dọn sạch bảng login_rate_limits để mở khoá IP/email nếu bị rate limit
  try {
    await run(`DELETE FROM login_rate_limits`);
    console.log("✅ Đã dọn sạch bảng rate limit (mở khoá đăng nhập cho mọi IP)");
  } catch {
    // Bảng chưa có nếu chưa migrate
  }

  console.log("\n🎉 Đặt lại tài khoản thành công! Bạn có thể đăng nhập ngay bây giờ.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Lỗi:", err);
  process.exit(1);
});
