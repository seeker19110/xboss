// Khởi tạo/khôi phục admin chỉ qua lệnh vận hành, không gọi từ HTTP request.
import { queryOne, run, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/bao-mat/auth";

export const BOOTSTRAP_ADMIN_EMAIL = "admin@xboss.vn";

export function requireAdminPassword(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 16 || value.length > 1024) {
    throw new Error("XBOSS_ADMIN_PASSWORD phải có 16–1024 ký tự, không dùng mật khẩu demo.");
  }
  return value;
}

/** Chỉ tạo 1 admin khi bảng users trống; không sửa tài khoản hay mật khẩu đã tồn tại. */
export async function bootstrapAdmin(password: string): Promise<"created" | "already-initialized"> {
  const passwordHash = hashPassword(requireAdminPassword(password));
  return withTransaction(async () => {
    // Khoá bảng để hai lệnh bootstrap đồng thời không cùng quan sát users trống.
    // Khoá cũng tuần tự hoá với đường tạo user thông thường, không chỉ với bootstrap.
    await run("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE");
    const existing = await queryOne<{ id: number }>("SELECT id FROM users LIMIT 1");
    if (existing) return "already-initialized";
    await run(
      `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`,
      "Quản trị",
      BOOTSTRAP_ADMIN_EMAIL,
      passwordHash,
      "admin",
    );
    return "created";
  });
}

/** Chỉ đổi mật khẩu admin có sẵn; không nâng vai trò, không tạo thêm tài khoản. */
export async function resetBootstrapAdminPassword(password: string): Promise<void> {
  const passwordHash = hashPassword(requireAdminPassword(password));
  await withTransaction(async () => {
    const admin = await queryOne<{ id: number }>(
      "SELECT id FROM users WHERE email = ? AND role = 'admin' FOR UPDATE",
      BOOTSTRAP_ADMIN_EMAIL,
    );
    if (!admin) throw new Error("Không có admin khởi tạo. Không tự tạo hoặc nâng quyền tài khoản.");
    await run(
      "UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?",
      passwordHash,
      admin.id,
    );
    // Giữ nguyên mọi bộ đếm chống brute-force, kể cả giới hạn theo IP dùng chung.
  });
}
