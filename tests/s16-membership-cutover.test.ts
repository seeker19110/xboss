import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat, datCookie, requestRieng, COOKIE_DU_AN } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { strictMembershipEnabled } from "@/lib/nen/env";

// AUDIT-S16 mục 6(a) — cutover "membership rỗng không mở quyền" (D01, A1-AC02/A1-FR03) THEO CỜ
// `XBOSS_STRICT_MEMBERSHIP`. Gọi route handler thật với cookie phiên ký thật (tests/helpers/phien).
//
// Ca "bảng user_projects rỗng TOÀN HỆ" không dựng được bằng cách xoá thật (các file test chạy song
// song cần bảng đó): mọi lời gọi chạy TRONG một transaction đã `DELETE FROM user_projects` rồi
// ROLLBACK — lib/db dùng chung client của transaction cho mọi query lồng (AsyncLocalStorage), nên
// route thấy bảng rỗng còn tiến trình khác không thấy gì (MVCC).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
const HASH = `hash-s16-${RUN}`;

type U = { id: number; passwordHash: string; orgId: number };
let orgA = 0;
let orgB = 0;
let a1 = 0;
let a2 = 0;
let b1 = 0;
let pm0: U; // non-admin, không có membership nào
let pm1: U; // non-admin, gán đúng A1 (gán trong từng ca cần)
let admin: U;
const tenA1 = `S16 A1 ${RUN}`;

async function taoUser(role: string, orgId: number, ten: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, ?, ?, ?)`,
    ten,
    `s16-${ten}-${RUN}@test.local`,
    HASH,
    role,
    orgId,
  );
  return { id, passwordHash: HASH, orgId };
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  orgA = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S16 org A ${RUN}`);
  orgB = await insertId(`INSERT INTO organizations (name) VALUES (?)`, `S16 org B ${RUN}`);
  a1 = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, ?)`, tenA1, orgA);
  a2 = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, ?)`, `S16 A2 ${RUN}`, orgA);
  b1 = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, ?)`, `S16 B1 ${RUN}`, orgB);
  pm0 = await taoUser("pm", orgA, "pm0");
  pm1 = await taoUser("pm", orgA, "pm1");
  admin = await taoUser("admin", orgA, "admin");
});

after(async () => {
  dangXuat();
  delete process.env.XBOSS_STRICT_MEMBERSHIP;
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  const users = [pm0, pm1, admin].filter(Boolean).map((u) => u.id);
  if (users.length) {
    await run(`DELETE FROM user_projects WHERE user_id = ANY(?)`, users);
    await run(`DELETE FROM users WHERE id = ANY(?)`, users);
  }
  await run(`DELETE FROM projects WHERE id = ANY(?)`, [a1, a2, b1].filter(Boolean));
  await run(`DELETE FROM organizations WHERE id = ANY(?)`, [orgA, orgB].filter(Boolean));
});

beforeEach(() => {
  delete process.env.XBOSS_STRICT_MEMBERSHIP;
  dangXuat();
});

const batCo = () => void (process.env.XBOSS_STRICT_MEMBERSHIP = "1");

class HoanTac extends Error {
  constructor(readonly ketQua: unknown) {
    super("hoàn tác transaction test");
  }
}

/** Chạy `fn` khi bảng user_projects RỖNG TOÀN HỆ (trong transaction rồi ROLLBACK). */
async function trongBangRong<T>(fn: () => Promise<T>): Promise<T> {
  const { withTransaction, run } = await import("@/lib/db");
  try {
    await requestRieng(() =>
      withTransaction(async () => {
        await run(`DELETE FROM user_projects`);
        throw new HoanTac(await fn());
      }),
    );
  } catch (e) {
    if (e instanceof HoanTac) return e.ketQua as T;
    throw e;
  }
  throw new Error("không thể tới đây");
}

async function ganA1ChoPm1(): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
    pm1.id,
    a1,
  );
}

async function duAnThay(): Promise<{ status: number; ids: number[] }> {
  const { GET } = await import("@/app/api/projects/route");
  const res = await GET(new NextRequest("http://localhost/api/projects"));
  const body = (await res.json()) as { projects?: { id: number }[] };
  return { status: res.status, ids: (body.projects ?? []).map((p) => p.id) };
}

async function tenDuAnHienTai(): Promise<{ status: number; name: string | null }> {
  const { GET } = await import("@/app/api/project/route");
  const res = await GET();
  const body = (await res.json()) as { name: string | null };
  return { status: res.status, name: body.name };
}

async function dashboard(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/dashboard/route");
  const res = await GET(new NextRequest("http://localhost/api/dashboard"));
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test("A1-AC02: cờ XBOSS_STRICT_MEMBERSHIP mặc định TẮT, chỉ nhận 0/1/true/false", () => {
  assert.equal(strictMembershipEnabled({}), false);
  assert.equal(strictMembershipEnabled({ XBOSS_STRICT_MEMBERSHIP: "" }), false);
  assert.equal(strictMembershipEnabled({ XBOSS_STRICT_MEMBERSHIP: "0" }), false);
  assert.equal(strictMembershipEnabled({ XBOSS_STRICT_MEMBERSHIP: "false" }), false);
  assert.equal(strictMembershipEnabled({ XBOSS_STRICT_MEMBERSHIP: "1" }), true);
  assert.equal(strictMembershipEnabled({ XBOSS_STRICT_MEMBERSHIP: "true" }), true);
  for (const sai of ["yes", "on", "TRUE", " 1"])
    assert.throws(
      () => strictMembershipEnabled({ XBOSS_STRICT_MEMBERSHIP: sai }),
      /XBOSS_STRICT_MEMBERSHIP/,
    );
});

test(
  "A1-AC02: cờ TẮT — bảng user_projects rỗng toàn hệ, pm 0 membership vẫn thấy dự án cùng org (tương thích ngược)",
  S,
  async () => {
    const kq = await trongBangRong(async () => {
      dangNhap(pm0);
      return { thay: await duAnThay(), ten: await tenDuAnHienTai() };
    });
    assert.deepEqual(kq.thay, { status: 200, ids: [a1, a2] });
    assert.equal(kq.ten.name, tenA1);
  },
);

test(
  "A1-AC02: cờ BẬT — pm 0 membership không thấy dự án nào kể cả khi bảng rỗng toàn hệ (404/rỗng, không 500)",
  S,
  async () => {
    batCo();
    const kq = await trongBangRong(async () => {
      dangNhap(pm0, a1); // cookie trỏ dự án cùng org vẫn không mở quyền
      return { thay: await duAnThay(), ten: await tenDuAnHienTai() };
    });
    assert.deepEqual(kq.thay, { status: 200, ids: [] });
    assert.deepEqual(kq.ten, { status: 200, name: null });
    // Gọi riêng: dashboard có dự án sẽ mở REPEATABLE READ (không lồng được vào transaction test).
    const dash = await trongBangRong(async () => {
      dangNhap(pm0, a1);
      return dashboard();
    });
    assert.equal(dash.status, 200);
    assert.deepEqual(dash.body.kpi, []);
    assert.deepEqual(dash.body.delayedTasks, []);
    assert.equal(dash.body.totalDelayed, 0);
  },
);

test(
  "A1-AC02: cờ BẬT — admin cùng org vẫn thấy đủ dự án org (recovery), không thấy org khác",
  S,
  async () => {
    batCo();
    const kq = await trongBangRong(async () => {
      dangNhap(admin);
      return { thay: await duAnThay(), ten: await tenDuAnHienTai() };
    });
    assert.deepEqual(kq.thay, { status: 200, ids: [a1, a2] });
    assert.ok(!kq.thay.ids.includes(b1));
    assert.equal(kq.ten.name, tenA1);
    // Quyền admin không phụ thuộc bảng user_projects — dashboard gọi ngoài transaction test.
    dangNhap(admin);
    const dash = await dashboard();
    assert.equal(dash.status, 200);
    assert.ok(Array.isArray(dash.body.kpi));
  },
);

test("A1-AC02: cờ BẬT — pm được gán 1 dự án chỉ thấy đúng dự án đó", S, async () => {
  batCo();
  await ganA1ChoPm1();
  dangNhap(pm1);
  assert.deepEqual(await duAnThay(), { status: 200, ids: [a1] });
  dangNhap(pm0);
  assert.deepEqual(await duAnThay(), { status: 200, ids: [] });
});

test(
  "A1-AC03: cờ BẬT — cookie trỏ dự án không được cấp không mở dự án đó (nhánh (ii) chưa bật: rơi về dự án được gán)",
  S,
  async () => {
    batCo();
    await ganA1ChoPm1();
    for (const cookieSai of [String(a2), String(b1), "abc", "0"]) {
      dangNhap(pm1);
      datCookie(COOKIE_DU_AN, cookieSai);
      const ten = await tenDuAnHienTai();
      assert.equal(ten.name, tenA1, `cookie ${cookieSai} phải rơi về dự án được gán A1`);
    }
    dangNhap(pm0);
    datCookie(COOKIE_DU_AN, String(a1));
    assert.deepEqual(await tenDuAnHienTai(), { status: 200, name: null });
  },
);

test(
  "A1-AC02: người nhận báo cáo dự án theo cùng luật — cờ BẬT không gửi cho PM chưa gán",
  S,
  async () => {
    const { reportRecipients } = await import("@/lib/tien-do/report");
    const nhan = () => trongBangRong(async () => (await reportRecipients(a1)).map((r) => r.id));
    const tat = await nhan();
    assert.ok(tat.includes(pm0.id) && tat.includes(admin.id), "cờ tắt: giữ hành vi cũ");
    batCo();
    const bat = await nhan();
    assert.ok(!bat.includes(pm0.id), "cờ bật: PM 0 membership không nhận báo cáo");
    assert.ok(bat.includes(admin.id), "cờ bật: admin cùng org vẫn nhận");
  },
);

/** Ghi lại mọi câu SQL gửi tới Postgres (kể cả BEGIN/COMMIT) trong lúc chạy `fn`. */
async function ghiSql<T>(fn: () => Promise<T>): Promise<{ ket: T; sql: string[] }> {
  const proto = Client.prototype as unknown as { query: (...a: unknown[]) => unknown };
  const goc = proto.query;
  const sql: string[] = [];
  proto.query = function (this: unknown, ...a: unknown[]) {
    const q = a[0];
    sql.push(typeof q === "string" ? q : String((q as { text?: string })?.text ?? ""));
    return goc.apply(this, a);
  };
  try {
    return { ket: await fn(), sql };
  } finally {
    proto.query = goc;
  }
}

const CAU_GHI =
  /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY|LOCK)\b/i;

test(
  "A1-FR03: dry-run membership chạy trong transaction READ ONLY, không có câu SQL ghi",
  S,
  async () => {
    const { thuThapMembershipDryRun } = await import("../scripts/lib/membership-dry-run");
    const { ket, sql } = await ghiSql(() => thuThapMembershipDryRun());
    assert.equal(sql[0], "BEGIN READ ONLY");
    assert.equal(sql[sql.length - 1], "COMMIT");
    assert.deepEqual(
      sql.filter((q) => CAU_GHI.test(q)),
      [],
    );
    const org = ket.orgs.find((o) => o.id === orgA);
    assert.ok(org, "có org A trong kết quả");
    const u = org.userKhongMembership.find((x) => x.id === pm0.id);
    assert.ok(u, "pm0 (0 membership) được liệt kê");
    assert.equal(u.duAnDangThayNhoLegacy, ket.bangUserProjectsRongToanHe ? 2 : 0);
    assert.ok(!org.userKhongMembership.some((x) => x.id === admin.id), "admin không bị liệt kê");
  },
);

test(
  "A1-FR03: dry-run khi bảng rỗng toàn hệ — liệt kê user sẽ mất quyền xem và org chưa có gán",
  S,
  async () => {
    const { thuThapMembershipDryRun } = await import("../scripts/lib/membership-dry-run");
    const ket = await trongBangRong(() => thuThapMembershipDryRun());
    assert.equal(ket.bangUserProjectsRongToanHe, true);
    const org = ket.orgs.find((o) => o.id === orgA)!;
    assert.equal(org.soDuAn, 2);
    assert.equal(org.soMembership, 0);
    const ids = org.userKhongMembership.map((x) => x.id).sort((x, y) => x - y);
    assert.deepEqual(
      ids,
      [pm0.id, pm1.id].sort((x, y) => x - y),
    );
    for (const x of org.userKhongMembership) {
      assert.equal(x.duAnDangThayNhoLegacy, 2);
      assert.equal(x.seMatQuyen, true);
    }
    assert.ok(ket.tongUserSeMatQuyen >= 2);
    const orgRong = ket.orgKhongCoMembership.map((o) => o.id);
    assert.ok(orgRong.includes(orgA) && orgRong.includes(orgB));
    // Org B không có user nào → không ai trong org B bị liệt kê.
    assert.deepEqual(ket.orgs.find((o) => o.id === orgB)!.userKhongMembership, []);
  },
);

test(
  "A1-FR03: CLI `npm run membership:dry-run -- --json` thoát 0, JSON hợp lệ, không lộ hash mật khẩu",
  S,
  () => {
    const goc = process.cwd();
    const r = spawnSync(
      process.execPath,
      [join(goc, "node_modules/tsx/dist/cli.mjs"), "scripts/membership-dry-run.ts", "--json"],
      {
        cwd: goc,
        env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    assert.equal(r.status, 0, r.stderr);
    const ket = JSON.parse(r.stdout) as {
      orgs: { id: number; userKhongMembership: Record<string, unknown>[] }[];
    };
    assert.ok(ket.orgs.some((o) => o.id === orgA));
    assert.ok(!r.stdout.includes(HASH), "không in password_hash");
    // Chỉ đúng các trường công bố — không trường mật khẩu/2FA nào lọt ra.
    for (const o of ket.orgs)
      for (const u of o.userKhongMembership)
        assert.deepEqual(Object.keys(u).sort(), [
          "duAnDangThayNhoLegacy",
          "email",
          "id",
          "role",
          "seMatQuyen",
        ]);

    const bang = spawnSync(
      process.execPath,
      [join(goc, "node_modules/tsx/dist/cli.mjs"), "scripts/membership-dry-run.ts"],
      {
        cwd: goc,
        env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    assert.equal(bang.status, 0, bang.stderr);
    assert.match(bang.stdout, /CHỈ ĐỌC/);
    assert.ok(bang.stdout.includes(`s16-pm0-${RUN}@test.local`));
  },
);
