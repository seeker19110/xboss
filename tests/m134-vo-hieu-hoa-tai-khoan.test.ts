import { HAS_TEST_DB } from "./setup";
import { dangNhap, dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — trước mọi import route
// M134 — vô hiệu hoá tài khoản: user bị khoá mất mọi phiên, không đăng nhập được, tổ chức luôn còn
// ≥ 1 Admin hoạt động. Gọi route handler thật với đúng người bấm (TRAPS.md §6).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { generate } from "otplib";
import { insertId, queryOne, run } from "@/lib/db";
import { getCurrentUser, hashPassword, makeTotpPendingToken, COOKIE } from "@/lib/bao-mat/auth";
import { taiKhoanBiKhoa } from "@/lib/nen/trang-thai-tai-khoan";
import { encryptTotpSecret, generateNewTotpSecret } from "@/lib/bao-mat/totp";
import { upsertSsoUser } from "@/lib/bao-mat/oidc";
import { datKhoaTaiKhoan } from "@/lib/bao-mat/tai-khoan";
import { PATCH, DELETE } from "@/app/api/users/[id]/route";
import { POST as LOGIN } from "@/app/api/auth/login/route";
import { POST as LOGIN_2FA } from "@/app/api/auth/login/2fa/route";

const S = { skip: !HAS_TEST_DB };
const MK = "mat-khau-m134";
const pfx = `m134-${Date.now().toString(36)}`;
let seq = 0;
const orgs: number[] = [];
const users: number[] = [];

type U = { id: number; passwordHash: string; orgId: number; email: string };

async function taoOrg(): Promise<number> {
  const id = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `${pfx} org ${++seq}`);
  orgs.push(id);
  return id;
}

async function taoUser(orgId: number, role: string): Promise<U> {
  const passwordHash = hashPassword(MK);
  const email = `${pfx}-${role}-${++seq}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, role, password_hash, org_id) VALUES (?, ?, ?, ?, ?)`,
    `M134 ${role}`,
    email,
    role,
    passwordHash,
    orgId,
  );
  users.push(id);
  return { id, passwordHash, orgId, email };
}

async function phienCua(u: U) {
  const r = await queryOne<{ sv: number }>(
    `SELECT session_version AS sv FROM users WHERE id = ?`,
    u.id,
  );
  return { ...u, sessionVersion: Number(r?.sv ?? 0) };
}

async function patch(actor: U, targetId: number, body: unknown) {
  dangNhap(await phienCua(actor));
  return requestRieng(() =>
    PATCH(
      new NextRequest(`http://localhost/api/users/${targetId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: String(targetId) }) },
    ),
  );
}

function login(email: string, password: string) {
  return requestRieng(() =>
    LOGIN(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "x-forwarded-for": `${pfx}-ip-${++seq}` },
        body: JSON.stringify({ email, password }),
      }),
    ),
  );
}

after(async () => {
  if (!HAS_TEST_DB) return;
  dangXuat();
  for (const id of users) {
    await run(`DELETE FROM push_subscriptions WHERE user_id = ?`, id);
    await run(`DELETE FROM totp_recovery_codes WHERE user_id = ?`, id);
    await run(`DELETE FROM users WHERE id = ?`, id);
  }
  await run(`DELETE FROM login_rate_limits WHERE key LIKE ?`, `%${pfx}%`);
  for (const id of users)
    await run(`DELETE FROM login_rate_limits WHERE key = ?`, `totp-acct|${id}`);
  for (const id of orgs) await run(`DELETE FROM organizations WHERE id = ?`, id);
});

test("taiKhoanBiKhoa: chỉ NULL/undefined là đang hoạt động", () => {
  assert.equal(taiKhoanBiKhoa(null), false);
  assert.equal(taiKhoanBiKhoa(undefined), false);
  assert.equal(taiKhoanBiKhoa("2026-10-12T00:00:00Z"), true);
});

test("AC1: user có disabled_at → getCurrentUser trả null dù token còn hợp lệ", S, async () => {
  const org = await taoOrg();
  const u = await taoUser(org, "engineer");
  dangNhap(await phienCua(u));
  assert.equal((await requestRieng(() => getCurrentUser()))?.id, u.id);
  // Đặt thẳng cột (không tăng session_version) để chứng minh chính disabled_at chặn phiên.
  await run(`UPDATE users SET disabled_at = now() WHERE id = ?`, u.id);
  assert.equal(await requestRieng(() => getCurrentUser()), null);
});

test("AC2/AC3: đăng nhập user bị khoá → 403 không cookie; kích hoạt lại → 200", S, async () => {
  const org = await taoOrg();
  const admin = await taoUser(org, "admin");
  const u = await taoUser(org, "engineer");
  assert.equal((await patch(admin, u.id, { disabled: true })).status, 200);

  const sai = await login(u.email, "sai-mat-khau");
  assert.equal(sai.status, 401);
  const dung = await login(u.email, MK);
  assert.equal(dung.status, 403);
  assert.equal((await dung.json()).code, "account_disabled");
  assert.equal(dung.cookies.get(COOKIE), undefined);

  const mo = await patch(admin, u.id, { disabled: false });
  assert.equal(mo.status, 200);
  assert.equal((await mo.json()).user.disabledAt, null);
  const lai = await login(u.email, MK);
  assert.equal(lai.status, 200);
  assert.ok(lai.cookies.get(COOKIE));
});

test("AC4: không tự khoá, không khoá Admin hoạt động cuối, không khoá xuyên org", S, async () => {
  const orgA = await taoOrg();
  const orgB = await taoOrg();
  const adminA = await taoUser(orgA, "admin");
  const adminA2 = await taoUser(orgA, "admin");
  const userB = await taoUser(orgB, "engineer");

  assert.equal((await patch(adminA, adminA.id, { disabled: true })).status, 400);
  assert.equal((await patch(adminA, userB.id, { disabled: true })).status, 404);
  assert.equal(
    (
      await queryOne<{ d: string | null }>(
        `SELECT disabled_at AS d FROM users WHERE id = ?`,
        userB.id,
      )
    )?.d,
    null,
  );
  // Còn 2 admin → khoá được 1; lặp lại idempotent; admin còn lại không tự khoá được (guard "tự khoá").
  assert.equal((await patch(adminA, adminA2.id, { disabled: true })).status, 200);
  assert.equal((await patch(adminA, adminA2.id, { disabled: true })).status, 200); // idempotent
  assert.equal((await patch(adminA, adminA.id, { disabled: true })).status, 400);
});

test("AC5: khoá tăng session_version đúng 1 lần + xoá push; lặp lại không tăng", S, async () => {
  const org = await taoOrg();
  const admin = await taoUser(org, "admin");
  const u = await taoUser(org, "engineer");
  await run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, 'k', 'a')`,
    u.id,
    `https://push.test/${pfx}/${u.id}`,
  );
  const truoc = (await phienCua(u)).sessionVersion;
  assert.equal((await patch(admin, u.id, { disabled: true })).status, 200);
  assert.equal((await patch(admin, u.id, { disabled: true })).status, 200);
  assert.equal((await phienCua(u)).sessionVersion, truoc + 1);
  const push = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = ?`,
    u.id,
  );
  assert.equal(push?.n, 0);
});

test(
  "AC6: Admin bị khoá không tính là Admin — không hạ cấp/xoá admin hoạt động cuối",
  S,
  async () => {
    const org = await taoOrg();
    const admin = await taoUser(org, "admin");
    const adminKhoa = await taoUser(org, "admin");
    assert.equal((await patch(admin, adminKhoa.id, { disabled: true })).status, 200);

    // Admin còn lại tự hạ cấp → bị chặn vì là admin hoạt động cuối cùng.
    assert.equal((await patch(admin, admin.id, { role: "pm" })).status, 400);
    // Hạ cấp chính admin đã bị khoá thì được (không ảnh hưởng quản trị).
    assert.equal((await patch(admin, adminKhoa.id, { role: "pm" })).status, 200);

    // Xoá admin đã bị khoá: guard "Admin cuối cùng" không chặn (chỉ còn 1 admin hoạt động).
    dangNhap(await phienCua(admin));
    const xoa = await requestRieng(() =>
      DELETE(new NextRequest(`http://localhost/api/users/${adminKhoa.id}`, { method: "DELETE" }), {
        params: Promise.resolve({ id: String(adminKhoa.id) }),
      }),
    );
    assert.equal(xoa.status, 200);
  },
);

async function soAdminHoatDong(orgId: number): Promise<number> {
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM users WHERE org_id = ? AND role = 'admin' AND disabled_at IS NULL`,
    orgId,
  );
  return Number(r?.n ?? 0);
}

test("FR3: bị khoá giữa bước 1 và bước 2 của 2FA → 403, không phát cookie", S, async () => {
  const org = await taoOrg();
  const admin = await taoUser(org, "admin");
  const u = await taoUser(org, "engineer");
  const secret = generateNewTotpSecret();
  await run(
    `UPDATE users SET totp_secret = ?, totp_enabled_at = now() WHERE id = ?`,
    encryptTotpSecret(secret),
    u.id,
  );
  const pending = makeTotpPendingToken(u.id, u.passwordHash);
  assert.equal((await patch(admin, u.id, { disabled: true })).status, 200);

  const code = await generate({ secret, digits: 6, period: 30 });
  const res = await requestRieng(() =>
    LOGIN_2FA(
      new NextRequest("http://localhost/api/auth/login/2fa", {
        method: "POST",
        headers: { "x-forwarded-for": `${pfx}-ip-${++seq}` },
        body: JSON.stringify({ pending, code }),
      }),
    ),
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "account_disabled");
  assert.equal(res.cookies.get(COOKIE), undefined);
});

test("FR3: SSO trả nguyên user bị khoá (không đồng bộ role) để callback từ chối", S, async () => {
  const org = await taoOrg();
  const admin = await taoUser(org, "admin");
  const u = await taoUser(org, "viewer");
  assert.equal((await patch(admin, u.id, { disabled: true })).status, 200);
  const sso = await upsertSsoUser({ email: u.email, name: "x", roleFromClaim: "pm" });
  assert.equal(sso.id, u.id);
  assert.ok(taiKhoanBiKhoa(sso.disabled_at));
  const r = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = ?`, u.id);
  assert.equal(r?.role, "viewer");
});

test(
  "FR4: SSO không hạ cấp Admin hoạt động cuối của org (Admin bị khoá không tính)",
  S,
  async () => {
    const org = await taoOrg();
    const admin = await taoUser(org, "admin");
    const adminKhoa = await taoUser(org, "admin");
    assert.equal((await patch(admin, adminKhoa.id, { disabled: true })).status, 200);
    const sso = await upsertSsoUser({ email: admin.email, name: "x", roleFromClaim: "pm" });
    assert.equal(sso.role, "admin");
    assert.equal(await soAdminHoatDong(org), 1);
  },
);

test(
  "FR4: tự hạ cấp và khoá Admin kia ĐỒNG THỜI → tổ chức vẫn còn ≥ 1 Admin hoạt động",
  S,
  async () => {
    for (let i = 0; i < 5; i++) {
      const org = await taoOrg();
      const a = await taoUser(org, "admin");
      const b = await taoUser(org, "admin");
      dangNhap(await phienCua(a));
      const goi = (targetId: number, body: unknown) =>
        requestRieng(() =>
          PATCH(
            new NextRequest(`http://localhost/api/users/${targetId}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            }),
            { params: Promise.resolve({ id: String(targetId) }) },
          ),
        );
      const kq = await Promise.all([goi(a.id, { role: "pm" }), goi(b.id, { disabled: true })]);
      // Một bên thắng (200); bên kia bị chặn — 400 "Admin cuối cùng", hoặc 403 nếu lần tự hạ cấp
      // đã commit trước khi request khoá đọc phiên (người gọi lúc đó là PM).
      const ma = kq.map((r) => r.status).sort();
      assert.equal(ma[0], 200);
      assert.ok(ma[1] === 400 || ma[1] === 403, `mã thứ hai ${ma[1]}`);
      assert.equal(await soAdminHoatDong(org), 1);
    }
  },
);

test(
  "FR4: xoá Admin bị chặn khi đó là Admin hoạt động cuối (sau khi Admin kia bị khoá)",
  S,
  async () => {
    const org = await taoOrg();
    const a = await taoUser(org, "admin");
    const b = await taoUser(org, "admin");
    const c = await taoUser(org, "admin");
    assert.equal((await patch(a, b.id, { disabled: true })).status, 200);
    // a, c hoạt động → xoá c được; còn mình a → không khoá/hạ cấp được chính a.
    dangNhap(await phienCua(a));
    const xoa = await requestRieng(() =>
      DELETE(new NextRequest(`http://localhost/api/users/${c.id}`, { method: "DELETE" }), {
        params: Promise.resolve({ id: String(c.id) }),
      }),
    );
    assert.equal(xoa.status, 200);
    assert.equal(await soAdminHoatDong(org), 1);
    assert.equal((await patch(a, a.id, { role: "engineer" })).status, 400);
  },
);

test("PATCH body sai kiểu `disabled` → 400 và KHÔNG ghi các trường khác", S, async () => {
  const org = await taoOrg();
  const admin = await taoUser(org, "admin");
  const u = await taoUser(org, "engineer");
  assert.equal((await patch(admin, u.id, { name: "Tên mới", disabled: "co" })).status, 400);
  const r = await queryOne<{ name: string }>(`SELECT name FROM users WHERE id = ?`, u.id);
  assert.equal(r?.name, "M134 engineer");
});

test(
  "FR1: datKhoaTaiKhoan không khoá Admin hoạt động cuối (người gọi không phải Admin đó)",
  S,
  async () => {
    // Qua HTTP người gọi luôn là một Admin hoạt động khác target nên guard này khó với tới — gọi
    // thẳng hàm dịch vụ với actor là user thường cùng org để kiểm lớp phòng thủ cuối.
    const org = await taoOrg();
    const admin = await taoUser(org, "admin");
    const nguoiGoi = await taoUser(org, "engineer");
    const kq = await datKhoaTaiKhoan(admin.id, true, { id: nguoiGoi.id, orgId: org });
    assert.deepEqual(kq.ok ? null : kq.status, 400);
    assert.equal(await soAdminHoatDong(org), 1);
  },
);
