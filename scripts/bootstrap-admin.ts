import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });
import { getPool } from "@/lib/db";
import { bootstrapAdmin, requireAdminPassword } from "@/lib/bao-mat/admin-bootstrap";

async function main(): Promise<void> {
  const password = requireAdminPassword(process.env.XBOSS_ADMIN_PASSWORD);
  try {
    const result = await bootstrapAdmin(password);
    console.log(
      result === "created"
        ? "Đã tạo admin. Không in mật khẩu vào log."
        : "DB đã có người dùng; không tạo hoặc thay đổi tài khoản.",
    );
  } finally {
    await getPool().end();
  }
}

main().catch(() => {
  console.error(
    "Khởi tạo admin thất bại. Kiểm tra kết nối DB và XBOSS_ADMIN_PASSWORD (16–1024 ký tự).",
  );
  process.exitCode = 1;
});
