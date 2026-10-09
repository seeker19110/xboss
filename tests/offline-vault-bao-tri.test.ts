import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { Pool } from "pg";
import type { Role } from "@/lib/nen/roles";
import { docKeyringKek, type KekKeyring } from "@/lib/nen/offline-crypto";
import {
  baoCaoTheoKek,
  retireKhoaVault,
  rewrapKhoaVault,
  soNgayKhoiPhuc,
  taoPoolBaoTri,
} from "@/lib/bao-mat/offline-vault-bao-tri";

// M131 phần 1 — role bảo trì vault (migration 0170) + rewrap KEK + retire tự động.
//
// Route vault chạy bằng role ứng dụng `xboss_app` (NOBYPASSRLS) như production; bảo trì chạy bằng
// role `xboss_vault_maint` (NOBYPASSRLS) đúng như script `npm run vault:maint`. Fixture/dọn dẹp dùng
// pool owner (TEST_DATABASE_URL). Assert theo dòng của chính file này (DB có thể còn dòng khác).

const S = { skip: !HAS_TEST_DB };

function connRole(user: string): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = user;
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}
if (HAS_TEST_DB) process.env.DATABASE_URL = connRole("xboss_app");

const KEK_V1 = `v1:${"k".repeat(40)}`;
const KEK_V2 = `v2:${"m".repeat(40)}`;
const RUN = Date.now().toString(36);
const HEX64 = "a".repeat(64);

const own = HAS_TEST_DB
  ? new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 })
  : (null as unknown as Pool);
let maint: Pool;
let app: Pool;

type U = { id: number; passwordHash: string; orgId: number; role: Role; sessionVersion: number };
const F = { p1: 0, t1: 0, users: [] as number[], a: {} as U, b: {} as U };

async function taoUser(ten: string, role: Role): Promise<U> {
  const hash = `hash-m131-${ten}-${RUN}`;
  const r = await own.query<{ id: number }>(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ($1, $2, $3, $4, 1)
     RETURNING id`,
    [`M131 ${ten}`, `m131-${ten}-${RUN}@test.local`, hash, role],
  );
  F.users.push(r.rows[0].id);
  return { id: r.rows[0].id, passwordHash: hash, orgId: 1, role, sessionVersion: 0 };
}

before(async () => {
  if (!HAS_TEST_DB) return;
  // CI/DB mới: role tạo bởi 0170 với mật khẩu mặc định — đặt lại cho chắc (DB dùng lại nhiều lần).
  await own.query(`ALTER ROLE xboss_vault_maint PASSWORD 'CHANGE_ME_ON_DEPLOY'`);
  maint = taoPoolBaoTri({ XBOSS_VAULT_MAINT_DATABASE_URL: connRole("xboss_vault_maint") });
  app = new Pool({ connectionString: connRole("xboss_app"), max: 1 });
  F.a = await taoUser("eng-a", "engineer");
  F.b = await taoUser("eng-b", "engineer");
  const p = await own.query<{ id: number }>(
    `INSERT INTO projects (name, org_id) VALUES ($1, 1) RETURNING id`,
    [`M131 P1 ${RUN}`],
  );
  F.p1 = p.rows[0].id;
  const tw = await own.query<{ id: number }>(
    `INSERT INTO towers (project_id, name) VALUES ($1, 'Tháp M131') RETURNING id`,
    [F.p1],
  );
  const code = `M131${RUN}`;
  const st = await own.query<{ id: number }>(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, $2, 'Sheet', $3) RETURNING id`,
    [tw.rows[0].id, code, code.toLowerCase()],
  );
  const wp = await own.query<{ id: number }>(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES ($1, $2, 'Nhóm', 1)
     RETURNING id`,
    [st.rows[0].id, `PK${code}`],
  );
  const t = await own.query<{ id: number }>(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
     VALUES ($1, $2, 'Task M131', 1, 0, 'chuan_bi') RETURNING id`,
    [wp.rows[0].id, `TK${code}`],
  );
  F.t1 = t.rows[0].id;
});

after(async () => {
  dangXuat();
  if (!HAS_TEST_DB) return;
  const ids = F.users;
  await own.query(`DELETE FROM offline_vault_recovery_requests WHERE user_id = ANY($1::int[])`, [
    ids,
  ]);
  await own.query(`DELETE FROM offline_vault_keys WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM offline_devices WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(
    `DELETE FROM login_rate_limits WHERE key ~ '^offline-' AND split_part(key, ':', 2) = ANY($1::text[])`,
    [ids.map(String)],
  );
  await own.query(
    `DELETE FROM tasks WHERE package_id IN (SELECT wp.id FROM work_packages wp
       JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
      WHERE tw.project_id = $1)`,
    [F.p1],
  );
  await own.query(
    `DELETE FROM work_packages WHERE sheet_type_id IN (SELECT st.id FROM sheet_types st
       JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = $1)`,
    [F.p1],
  );
  await own.query(
    `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = $1)`,
    [F.p1],
  );
  await own.query(`DELETE FROM towers WHERE project_id = $1`, [F.p1]);
  await own.query(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM projects WHERE id = $1`, [F.p1]);
  await own.query(`DELETE FROM notifications WHERE user_id = ANY($1::int[])`, [ids]);
  await own.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids]);
  await maint.end();
  await app.end();
  await own.end();
});

// ── Helper route + fixture ─────────────────────────────────────────────────────────────────

function req(url: string, o: { body?: unknown; proof?: string; ctx?: string } = {}) {
  const h: Record<string, string> = { host: "localhost", origin: "http://localhost" };
  if (o.proof) h.cookie = `xboss_offline_proof=${o.proof}`;
  if (o.ctx) h["x-xboss-context"] = o.ctx;
  h["content-type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(o.body ?? {}),
  });
}

const kr = (raw: string): KekKeyring => docKeyringKek(raw, undefined) as KekKeyring;

async function taoThietBi(u: U, revokedDaysAgo: number | null): Promise<string> {
  const id = randomUUID();
  await own.query(
    `INSERT INTO offline_devices (id, user_id, org_id, proof_hash, revoked_at)
     VALUES ($1, $2, 1, $3, CASE WHEN $4::int IS NULL THEN NULL
                                 ELSE now() - make_interval(days => $4::int) END)`,
    [id, u.id, randomBytes(32), revokedDaysAgo],
  );
  return id;
}

/** Khoá giả (wrapped_key ngẫu nhiên) — đủ cho retire/bỏ qua, không mở được. */
async function taoKhoaGia(u: U, deviceId: string, kekVersion: string, v = 1): Promise<string> {
  const id = randomUUID();
  await own.query(
    `INSERT INTO offline_vault_keys (id, device_id, user_id, org_id, project_id, key_version,
       resource_manifest, manifest_hash, permission_fingerprint, wrapped_key, kek_version)
     VALUES ($1, $2, $3, 1, $4, $5, '{}'::jsonb, $6, $6, $7, $8)`,
    [id, deviceId, u.id, F.p1, v, HEX64, randomBytes(61), kekVersion],
  );
  return id;
}

async function dongKhoa(id: string) {
  const { rows } = await own.query<{ kek: string; wk: Buffer; retired: Date | null }>(
    `SELECT kek_version AS kek, wrapped_key AS wk, retired_at AS retired
       FROM offline_vault_keys WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function maLoi(pool: Pool, sql: string, params: unknown[] = []): Promise<string | null> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(
      `SELECT set_config('app.user_id', $1, true), set_config('app.org_id', '1', true),
                          set_config('app.project_id', $2, true), set_config('app.role', 'admin', true)`,
      [String(F.a.id), String(F.p1)],
    );
    await c.query(sql, params);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? "?";
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    c.release();
  }
}

// ── Cấu hình ───────────────────────────────────────────────────────────────────────────────

test("cấu hình: thiếu XBOSS_VAULT_MAINT_DATABASE_URL → throw; cửa sổ khôi phục mặc định 30, ≥1", () => {
  assert.throws(() => taoPoolBaoTri({}), /XBOSS_VAULT_MAINT_DATABASE_URL/);
  assert.equal(soNgayKhoiPhuc({}), 30);
  assert.equal(soNgayKhoiPhuc({ XBOSS_VAULT_RECOVERY_DAYS: "7" }), 7);
  for (const sai of ["0", "-1", "abc", "1.5"])
    assert.throws(() => soNgayKhoiPhuc({ XBOSS_VAULT_RECOVERY_DAYS: sai }), /số nguyên/);
});

// ── Grant ─────────────────────────────────────────────────────────────────────────────────

test(
  "grant: xboss_app không UPDATE/DELETE khoá; xboss_vault_maint chỉ UPDATE 3 cột",
  S,
  async () => {
    const cot = async (role: string, c: string) =>
      (
        await own.query<{ ok: boolean }>(
          `SELECT has_column_privilege($1, 'offline_vault_keys', $2, 'UPDATE') AS ok`,
          [role, c],
        )
      ).rows[0].ok;
    const COT_SUA = ["wrapped_key", "kek_version", "retired_at"];
    const COT_BAT_BIEN = [
      "id",
      "device_id",
      "user_id",
      "org_id",
      "project_id",
      "key_version",
      "resource_manifest",
      "manifest_hash",
      "permission_fingerprint",
      "created_at",
    ];
    for (const c of [...COT_SUA, ...COT_BAT_BIEN]) {
      assert.equal(await cot("xboss_app", c), false, `xboss_app UPDATE ${c}`);
      assert.equal(await cot("xboss_vault_maint", c), COT_SUA.includes(c), `maint UPDATE ${c}`);
    }
    const bang = async (role: string, t: string, p: string) =>
      (
        await own.query<{ ok: boolean }>(`SELECT has_table_privilege($1, $2, $3) AS ok`, [
          role,
          t,
          p,
        ])
      ).rows[0].ok;
    assert.equal(await bang("xboss_app", "offline_vault_keys", "DELETE"), false);
    assert.equal(await bang("xboss_vault_maint", "offline_vault_keys", "DELETE"), false);
    assert.equal(await bang("xboss_vault_maint", "offline_vault_keys", "INSERT"), false);
    assert.equal(await bang("xboss_vault_maint", "offline_devices", "UPDATE"), false);
    assert.equal(await bang("xboss_vault_maint", "users", "SELECT"), false);
    const r = await own.query<{ super: boolean; bypass: boolean }>(
      `SELECT rolsuper AS super, rolbypassrls AS bypass FROM pg_roles WHERE rolname = 'xboss_vault_maint'`,
    );
    assert.deepEqual(r.rows[0], { super: false, bypass: false });

    // Thử thật: lệnh bị chặn ở quyền cột (42501), không phải 0 dòng.
    const dev = await taoThietBi(F.a, null);
    const id = await taoKhoaGia(F.a, dev, "v1");
    for (const c of COT_SUA) {
      const sql =
        c === "wrapped_key"
          ? `UPDATE offline_vault_keys SET wrapped_key = '\\x00' WHERE id = $1`
          : c === "kek_version"
            ? `UPDATE offline_vault_keys SET kek_version = 'v9' WHERE id = $1`
            : `UPDATE offline_vault_keys SET retired_at = now() WHERE id = $1`;
      assert.equal(await maLoi(app, sql, [id]), "42501", `xboss_app ${c}`);
      assert.equal(await maLoi(maint, sql, [id]), null, `maint ${c}`);
    }
    assert.equal(await maLoi(app, `DELETE FROM offline_vault_keys WHERE id = $1`, [id]), "42501");
    assert.equal(
      await maLoi(maint, `UPDATE offline_vault_keys SET device_id = $2 WHERE id = $1`, [id, dev]),
      "42501",
    );
    assert.equal(
      await maLoi(maint, `UPDATE offline_vault_keys SET user_id = user_id WHERE id = $1`, [id]),
      "42501",
    );
    assert.equal(
      await maLoi(maint, `UPDATE offline_vault_recovery_requests SET decided_by = NULL`),
      "42501",
    );
  },
);

// ── Rewrap ─────────────────────────────────────────────────────────────────────────────────

test(
  "rewrap v1→v2: dry-run không ghi; --apply bọc lại tại chỗ, unlock chỉ với KEK v2 ra đúng DEK; " +
    "thiếu KEK cũ/giải bọc lỗi → bỏ qua có đếm; audit chỉ ghi kek_version, không wrapped_key",
  S,
  async () => {
    process.env.XBOSS_OFFLINE_KEK = KEK_V1;
    await dangNhapDuAn(F.a, F.p1);
    const devR = await import("@/app/api/offline/devices/route");
    const ctxR = await import("@/app/api/offline/context/route");
    const keysR = await import("@/app/api/offline/vault/keys/route");
    const unlockR = await import("@/app/api/offline/vault/unlock/route");
    const d = await devR.POST(req("/api/offline/devices"));
    assert.equal(d.status, 201);
    const proof = d.cookies.get("xboss_offline_proof")?.value as string;
    const c = await ctxR.POST(req("/api/offline/context", { proof }));
    const ctx = (await c.json()).context.contextId as string;
    const k = await keysR.POST(
      req("/api/offline/vault/keys", {
        proof,
        ctx,
        body: { manifest: { tasks: [F.t1], taskActions: ["tick"] } },
      }),
    );
    assert.equal(k.status, 201);
    const { key } = await k.json();
    const truoc = await dongKhoa(key.keyId);
    assert.equal(truoc.kek, "v1");

    // Dòng bỏ qua: KEK version không còn trong keyring + wrapped_key hỏng dưới v1.
    const devGia = await taoThietBi(F.a, null);
    const kThieu = await taoKhoaGia(F.a, devGia, "v0", 1);
    const kHong = await taoKhoaGia(F.a, devGia, "v1", 2);

    const keyring = kr(`${KEK_V2},${KEK_V1}`);
    const kho = await rewrapKhoaVault(maint, keyring, { apply: false });
    assert.equal(kho.apply, false);
    assert.ok(kho.canRewrap >= 3);
    assert.ok(kho.boQuaThieuKek >= 1);
    assert.equal(kho.daRewrap, 0);
    assert.deepEqual(await dongKhoa(key.keyId), truoc, "dry-run không được ghi");

    const kq = await rewrapKhoaVault(maint, keyring, { apply: true, loSize: 1 });
    assert.ok(kq.daRewrap >= 1);
    assert.ok(kq.boQuaThieuKek >= 1);
    assert.ok(kq.boQuaGiaiBocLoi >= 1);
    const sau = await dongKhoa(key.keyId);
    assert.equal(sau.kek, "v2");
    assert.notDeepEqual(sau.wk, truoc.wk);
    assert.equal((await dongKhoa(kThieu)).kek, "v0", "thiếu KEK cũ → giữ nguyên");
    assert.equal((await dongKhoa(kHong)).kek, "v1", "giải bọc lỗi → giữ nguyên");

    // Gỡ v1 khỏi keyring: khoá vẫn mở ra đúng DEK cũ qua route thật (role xboss_app).
    process.env.XBOSS_OFFLINE_KEK = KEK_V2;
    await dangNhapDuAn(F.a, F.p1);
    const u = await unlockR.POST(
      req("/api/offline/vault/unlock", { proof, ctx, body: { keyIds: [key.keyId] } }),
    );
    assert.equal(u.status, 200);
    const uj = await u.json();
    assert.equal(uj.keys.length, 1, JSON.stringify(uj.locked));
    assert.equal(uj.keys[0].dek, key.dek);

    // Audit: 1 dòng đổi kek_version, actor_role vault_maint, không có vật liệu khoá.
    const { rows } = await own.query<{
      changes: Record<string, unknown>;
      role: string;
      txt: string;
    }>(
      `SELECT changes, actor_role AS role, row_to_json(a)::text AS txt FROM audit_log a
        WHERE entity_type = 'offline_vault_keys' AND entity_key = $1`,
      [key.keyId],
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].changes, { kek_version: ["v1", "v2"] });
    assert.equal(rows[0].role, "vault_maint");
    assert.ok(!rows[0].txt.includes("wrapped_key"));
    assert.ok(!rows[0].txt.includes(sau.wk.toString("hex")));

    // Chạy lại: không còn gì cần rewrap ở khoá này (idempotent).
    const lai = await rewrapKhoaVault(maint, keyring, { apply: true });
    assert.equal(lai.daRewrap, 0);
    const bc = await baoCaoTheoKek(maint);
    assert.ok(bc.some((r) => r.kekVersion === "v2" && r.conDung >= 1));
    delete process.env.XBOSS_OFFLINE_KEK;
  },
);

// ── Retire ─────────────────────────────────────────────────────────────────────────────────

test(
  "retire: quá cửa sổ → đánh dấu; trong cửa sổ / còn yêu cầu mở → giữ; pending quá hạn → expired",
  S,
  async () => {
    const moi = await taoThietBi(F.b, null);
    const dQua = await taoThietBi(F.b, 40);
    const dTrong = await taoThietBi(F.b, 10);
    const dYeuCau = await taoThietBi(F.b, 40);
    const dHetHan = await taoThietBi(F.b, 40);
    const dDuyet = await taoThietBi(F.b, 40);
    const kQua = await taoKhoaGia(F.b, dQua, "v2");
    const kTrong = await taoKhoaGia(F.b, dTrong, "v2");
    const kYeuCau = await taoKhoaGia(F.b, dYeuCau, "v2");
    const kHetHan = await taoKhoaGia(F.b, dHetHan, "v2");
    const kDuyet = await taoKhoaGia(F.b, dDuyet, "v2");
    const kMoi = await taoKhoaGia(F.b, moi, "v2");
    const yc = async (old: string, status: string, daysAgo: number) =>
      (
        await own.query<{ id: string }>(
          `INSERT INTO offline_vault_recovery_requests
             (org_id, user_id, old_device_id, new_device_id, status, decided_by, decided_at,
              requested_at)
           VALUES (1, $1, $2, $3, $4, CASE WHEN $4 = 'approved' THEN $5::int END,
                   CASE WHEN $4 = 'approved' THEN now() END,
                   now() - make_interval(days => $6::int))
           RETURNING id`,
          [F.b.id, old, moi, status, F.a.id, daysAgo],
        )
      ).rows[0].id;
    const ycMo = await yc(dYeuCau, "pending", 1);
    const ycCu = await yc(dHetHan, "pending", 40);
    await yc(dDuyet, "approved", 40);

    const kho = await retireKhoaVault(maint, { apply: false, soNgay: 30 });
    assert.ok(kho.khoaRetire >= 2 && kho.yeuCauHetHan >= 1);
    assert.equal((await dongKhoa(kQua)).retired, null, "dry-run không ghi");

    const kq = await retireKhoaVault(maint, { apply: true, soNgay: 30 });
    assert.ok(kq.khoaRetire >= 2 && kq.yeuCauHetHan >= 1);
    assert.ok((await dongKhoa(kQua)).retired, "thu hồi quá cửa sổ → retire");
    assert.ok((await dongKhoa(kHetHan)).retired, "yêu cầu pending quá hạn không giữ khoá");
    assert.equal((await dongKhoa(kTrong)).retired, null, "còn trong cửa sổ");
    assert.equal((await dongKhoa(kYeuCau)).retired, null, "còn yêu cầu pending");
    assert.equal((await dongKhoa(kDuyet)).retired, null, "còn yêu cầu approved");
    assert.equal((await dongKhoa(kMoi)).retired, null, "thiết bị chưa thu hồi");
    const st = await own.query<{ id: string; status: string }>(
      `SELECT id::text, status FROM offline_vault_recovery_requests WHERE id = ANY($1::uuid[])`,
      [[ycMo, ycCu]],
    );
    const theoId = new Map(st.rows.map((r) => [r.id, r.status]));
    assert.equal(theoId.get(ycCu), "expired");
    assert.equal(theoId.get(ycMo), "pending");

    const { rows } = await own.query<{ changes: Record<string, unknown> }>(
      `SELECT changes FROM audit_log WHERE entity_type = 'offline_vault_keys' AND entity_key = $1`,
      [kQua],
    );
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0].changes), ["retired_at"]);
  },
);
