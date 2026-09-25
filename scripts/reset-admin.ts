import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });
import { getPool } from "@/lib/db";
import { requireAdminPassword, resetBootstrapAdminPassword } from "@/lib/bao-mat/admin-bootstrap";

async function main(): Promise<void> {
  const password = requireAdminPassword(process.env.XBOSS_ADMIN_PASSWORD);
  try {
    await resetBootstrapAdminPassword(password);
    console.log("Đã đổi mật khẩu admin và thu hồi phiên cũ; không thay đổi tài khoản khác.");
  } finally {
    await getPool().end();
  }
}

main().catch(() => {
  console.error("Reset admin thất bại. Kiểm tra admin có sẵn, kết nối DB và XBOSS_ADMIN_PASSWORD.");
  process.exitCode = 1;
});
