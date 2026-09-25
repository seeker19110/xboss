import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local" });
import { getPool } from "@/lib/db";
import { ensureDefaultUsers } from "@/lib/bao-mat/auth";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Không được seed demo ở production.");
  }
  try {
    await ensureDefaultUsers();
    console.log("Đã seed tài khoản demo cho dev/test; không in mật khẩu.");
  } finally {
    await getPool().end();
  }
}

main().catch(() => {
  console.error("Seed demo thất bại. Chỉ chạy trên DB dev/test, không phải production.");
  process.exitCode = 1;
});
