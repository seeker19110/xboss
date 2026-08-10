// API keys đọc-only cho namespace /api/v1 (M49 PR1). Bên thứ ba gọi bằng header
// `Authorization: Bearer xbk_...`. Key thô chỉ hiện 1 lần lúc tạo; DB giữ sha256 hex.
// Xem docs/nang-cap/M49-api-mo-sso.md mục PR1.
import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import { hitRateLimit } from "@/lib/ratelimit";

// Sinh key thô: `xbk_` + 32 byte ngẫu nhiên hex (64 ký tự). Chỉ trả về 1 lần lúc tạo.
export function generateApiKey(): string {
  return "xbk_" + randomBytes(32).toString("hex");
}

// Băm key thô sang sha256 hex để lưu/tra (không lưu key thô).
export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export type ApiKeyAuth = { keyId: number; projectId: number | null; scopes: string[] };

const FAIL_MAX_PER_IP = 30; // 30 lần key sai/thu hồi/thiếu header — 15 phút/IP
const FAIL_WINDOW_MINUTES = 15;

// IP client — cùng quy ước header proxy như app/api/auth/login/route.ts.
function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// Đọc header `Authorization: Bearer xbk_...` → tra key_hash (sha256 của input), check
// revoked_at IS NULL. Trả null khi sai/thiếu/revoked. So khớp bằng lookup UNIQUE key_hash
// (input đã qua sha256 — không cần constant-time so chuỗi). Cập nhật last_used_at có
// throttle: chỉ ghi khi chưa từng dùng hoặc cách hiện tại > 60s (tránh ghi mỗi request).
export async function verifyApiKey(authHeader: string | null): Promise<ApiKeyAuth | null> {
  if (!authHeader) return null;
  const m = /^Bearer\s+(xbk_[0-9a-fA-F]+)$/.exec(authHeader.trim());
  if (!m) return null;
  const hash = hashApiKey(m[1]);
  const row = await queryOne<{ id: number; projectId: number | null; scopes: string[] }>(
    `SELECT id, project_id AS "projectId", scopes
       FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`,
    hash,
  );
  if (!row) return null;
  await run(
    `UPDATE api_keys SET last_used_at = now()
      WHERE id = ? AND (last_used_at IS NULL OR last_used_at < now() - INTERVAL '60 seconds')`,
    row.id,
  );
  return { keyId: row.id, projectId: row.projectId, scopes: row.scopes ?? [] };
}

// Gói dùng chung cho mọi route v1: verify → 401; check scope → 403; rate limit
// `api:${keyId}` 120 req/phút qua hitRateLimit → 429 + Retry-After; suy projectId hiệu
// lực (key.project_id ?? ?project= — key toàn cục thiếu ?project= → 422). Trả Response
// lỗi ({ error } tiếng Việt) hoặc ngữ cảnh hợp lệ.
// Key sai/thu hồi/thiếu header cũng rate-limit theo IP (`api-fail:${ip}`, 30 lần/15 phút) —
// trước đó chỉ rate-limit sau khi xác thực THÀNH CÔNG nên dò key đúng bằng cách thử liên
// tục không bị chặn (rủi ro DoS nhẹ, ghi nhận đợt đánh giá lần 8, xem PROGRESS.md).
export async function requireApiKey(
  req: NextRequest,
  scope: "read" | "read_finance",
): Promise<{ auth: ApiKeyAuth; projectId: number } | Response> {
  const auth = await verifyApiKey(req.headers.get("authorization"));
  if (!auth) {
    const ip = clientIp(req);
    if (await hitRateLimit(`api-fail:${ip}`, FAIL_MAX_PER_IP, FAIL_WINDOW_MINUTES))
      return NextResponse.json(
        { error: "Vượt giới hạn thử API key sai — thử lại sau" },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    return NextResponse.json({ error: "API key không hợp lệ hoặc đã bị thu hồi" }, { status: 401 });
  }
  if (!auth.scopes.includes(scope))
    return NextResponse.json(
      { error: "API key không có quyền truy cập tài nguyên này" },
      { status: 403 },
    );
  if (await hitRateLimit(`api:${auth.keyId}`, 120, 1))
    return NextResponse.json(
      { error: "Vượt giới hạn gọi API (120 request/phút)" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  const projectId = auth.projectId ?? Number(req.nextUrl.searchParams.get("project"));
  if (!Number.isInteger(projectId) || projectId <= 0)
    return NextResponse.json(
      { error: "Key toàn cục cần chỉ định dự án qua ?project=<id>" },
      { status: 422 },
    );
  return { auth, projectId };
}
