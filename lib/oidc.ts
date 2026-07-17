// SSO OIDC (M49 PR3) — đăng nhập bằng tài khoản công ty (Google Workspace / Microsoft
// Entra) qua `openid-client` v6. SSO là CỬA PHỤ: callback thành công phát đúng cookie
// `xboss_session` qua makeToken() (lib/auth.ts) — KHÔNG có cơ chế phiên thứ hai; mật khẩu
// vẫn là fallback (admin thoát hiểm khi IdP hỏng).
//
// Đọc cấu hình trực tiếp từ process.env (như lib/push.ts / lib/google-sheets.ts) để
// resolveSsoUser THUẦN, test được mà không cần DATABASE_URL. Thiếu bất kỳ biến bắt buộc
// → ssoEnabled()=false, nút SSO tự ẩn, mọi thứ như cũ.
import { randomBytes } from "node:crypto";
import * as oidc from "openid-client";
import { query, queryOne, run } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { log } from "@/lib/log";
import { ROLES, type Role } from "@/lib/roles";

// ===== Bật/tắt SSO =====
// Đủ cả 4 biến bắt buộc → true. KHÔNG suy redirect_uri từ request origin (sau proxy dễ
// sai) — redirect_uri tường minh từ APP_URL.
export function ssoEnabled(): boolean {
  return !!(
    process.env.OIDC_ISSUER?.trim() &&
    process.env.OIDC_CLIENT_ID?.trim() &&
    process.env.OIDC_CLIENT_SECRET?.trim() &&
    process.env.APP_URL?.trim()
  );
}

export function redirectUri(): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/api/auth/oidc/callback`;
}

// Vai trò mặc định cho user SSO mới khi claim không cho role hợp lệ. Validate thuộc ROLES;
// giá trị lạ → 'viewer' (an toàn nhất — chỉ xem).
function defaultRole(): Role {
  const r = process.env.OIDC_DEFAULT_ROLE?.trim();
  return r && (ROLES as string[]).includes(r) ? (r as Role) : "viewer";
}

// ===== Discovery (cache ở module scope) =====
// discovery() gọi 1 lần; nếu lần trước lỗi thì gọi lại (KHÔNG cache vĩnh viễn lỗi).
let configCache: oidc.Configuration | null = null;

export async function getOidcConfig(): Promise<oidc.Configuration> {
  if (configCache) return configCache;
  if (!ssoEnabled()) throw new Error("SSO OIDC chưa được cấu hình.");
  const config = await oidc.discovery(
    new URL(process.env.OIDC_ISSUER!.trim()),
    process.env.OIDC_CLIENT_ID!.trim(),
    process.env.OIDC_CLIENT_SECRET!.trim(),
  );
  configCache = config;
  return config;
}

// Chỉ dùng trong test: xoá cache discovery giữa các ca.
export function __resetOidcConfigCacheForTests(): void {
  configCache = null;
}

// ===== Ánh xạ claims → quyết định user (THUẦN, không chạm DB) =====
export type ResolvedSsoUser = { email: string; name: string; roleFromClaim: Role | null };
export type SsoClaims = { email?: string; name?: string; [k: string]: unknown };

// Đọc role từ claim đã cấu hình. string → khớp ROLES hay không; string[] → phần tử đầu
// khớp ROLES. Giá trị lạ / claim không đặt → null (caller giữ role cũ / dùng default).
function roleFromClaims(claims: SsoClaims): Role | null {
  const key = process.env.OIDC_ROLE_CLAIM?.trim();
  if (!key) return null;
  const raw = claims[key];
  const candidates: unknown[] = Array.isArray(raw) ? raw : [raw];
  for (const c of candidates) {
    if (typeof c === "string" && (ROLES as string[]).includes(c)) return c as Role;
  }
  return null;
}

export function resolveSsoUser(claims: SsoClaims): ResolvedSsoUser | { error: string } {
  const rawEmail = typeof claims.email === "string" ? claims.email.trim() : "";
  if (!rawEmail) return { error: "IdP không trả email" };
  const email = rawEmail.toLowerCase();
  const name =
    (typeof claims.name === "string" && claims.name.trim()) || email.split("@")[0];
  return { email, name, roleFromClaim: roleFromClaims(claims) };
}

// ===== Upsert user (chạm DB) =====
export type SsoUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  password_hash: string;
};

export async function upsertSsoUser(resolved: ResolvedSsoUser): Promise<SsoUser> {
  const existing = await queryOne<SsoUser>(
    `SELECT id, name, email, role, password_hash FROM users WHERE email = ?`,
    resolved.email,
  );

  if (existing) {
    // Đồng bộ role theo claim nếu khác role hiện tại. KHÔNG hạ cấp admin cuối cùng
    // (chống tự khoá hệ thống — cùng mẫu guard app/api/users/[id]/route.ts / M50 PR1).
    if (resolved.roleFromClaim && resolved.roleFromClaim !== existing.role) {
      if (existing.role === "admin" && resolved.roleFromClaim !== "admin") {
        const admins = await queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`,
        );
        if (Number(admins?.n) <= 1) {
          log.warn("Bỏ qua hạ cấp admin cuối cùng theo claim SSO", {
            route: "oidc.upsertSsoUser",
            email: resolved.email,
            requestedRole: resolved.roleFromClaim,
          });
          return existing;
        }
      }
      await run(`UPDATE users SET role = ? WHERE id = ?`, resolved.roleFromClaim, existing.id);
      return { ...existing, role: resolved.roleFromClaim };
    }
    return existing;
  }

  // User mới: role = claim nếu có, không thì OIDC_DEFAULT_ROLE ?? 'viewer'. password_hash
  // là hash NGẪU NHIÊN — vừa thoả NOT NULL vừa để makeToken() nhúng pwFrag hoạt động;
  // không ai biết mật khẩu này nên KHÔNG đăng nhập được bằng form (đúng chủ đích).
  const role = resolved.roleFromClaim ?? defaultRole();
  const passwordHash = hashPassword(randomBytes(32).toString("hex"));
  const created = await queryOne<SsoUser>(
    `INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, name, email, role, password_hash`,
    resolved.name,
    resolved.email,
    passwordHash,
    role,
  );
  if (!created) throw new Error("Không tạo được user SSO");
  return created;
}

// ===== Rate limit callback lỗi (riêng, tái dùng bảng login_rate_limits) =====
// Đính chính brief §2: KHÔNG dùng hitRateLimit (thuộc M49 PR1 chưa tồn tại), KHÔNG sửa
// lib/ratelimit.ts. Khoá riêng `oidc|<ip>`, ngưỡng 10 lần/15 phút. Chỉ ĐẾM khi callback
// kết thúc lỗi (gọi ở mọi nhánh lỗi), KHÔNG đếm lần thành công.
const OIDC_WINDOW_MINUTES = 15;
const OIDC_MAX_FAILURES = 10;
const oidcKey = (ip: string) => `oidc|${ip}`;

// Còn bị khoá không? Trả số giây phải chờ, hoặc 0 nếu được phép thử.
export async function oidcCallbackBlocked(ip: string): Promise<number> {
  const rows = await query<{ count: number; reset_at: Date }>(
    `SELECT count, reset_at FROM login_rate_limits WHERE key = ? AND reset_at > NOW()`,
    oidcKey(ip),
  );
  const row = rows[0];
  if (!row || row.count < OIDC_MAX_FAILURES) return 0;
  const wait = Math.ceil((row.reset_at.getTime() - Date.now()) / 1000);
  return wait > 0 ? wait : 0;
}

// Ghi nhận 1 lần callback lỗi — upsert atomic (INSERT ... ON CONFLICT) cùng mẫu bump()
// trong lib/ratelimit.ts, reset đếm theo cửa sổ.
export async function recordOidcCallbackFailure(ip: string): Promise<void> {
  await run(
    `INSERT INTO login_rate_limits (key, count, reset_at)
     VALUES (?, 1, NOW() + make_interval(mins => ?))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN login_rate_limits.reset_at <= NOW() THEN 1 ELSE login_rate_limits.count + 1 END,
       reset_at = CASE WHEN login_rate_limits.reset_at <= NOW() THEN NOW() + make_interval(mins => ?) ELSE login_rate_limits.reset_at END`,
    oidcKey(ip),
    OIDC_WINDOW_MINUTES,
    OIDC_WINDOW_MINUTES,
  );
}
