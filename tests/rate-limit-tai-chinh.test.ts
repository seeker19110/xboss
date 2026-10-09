import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Rate-limit route ghi chuỗi tiền IPC → điều chỉnh → phiếu → chi (quyết định 2026-10-09: 60 lượt/
// 15 phút/người/loại thao tác). Ca đầy quota phải trả 429 + Retry-After TRƯỚC khi đọc body/ghi DB;
// bộ đếm tách theo loại và theo người (người khác/loại khác không bị chặn lây).

const S = { skip: !HAS_TEST_DB };
const sfx = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nguoi: number[] = [];

async function taoAdmin(): Promise<{ id: number; passwordHash: string }> {
  const { insertId } = await import("@/lib/db");
  const email = `rl-tc-${sfx}-${nguoi.length}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('RL tài chính', ?, 'hash-rl', 'admin', 1)`,
    email,
  );
  nguoi.push(id);
  return { id, passwordHash: "hash-rl" };
}

async function datDay(loai: string, userId: number): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `INSERT INTO login_rate_limits (key, count, reset_at) VALUES (?, 60, NOW() + interval '15 minutes')
     ON CONFLICT (key) DO UPDATE SET count = 60, reset_at = NOW() + interval '15 minutes'`,
    `tai-chinh:${loai}:${userId}`,
  );
}

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const id of nguoi) {
    await run(`DELETE FROM login_rate_limits WHERE key LIKE ?`, `tai-chinh:%:${id}`);
    await run(`DELETE FROM users WHERE id = ?`, id);
  }
});

type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
const p = { params: Promise.resolve({ id: "999999999" }) };
const yeuCau = (method: string) =>
  new NextRequest("http://localhost/api/x", {
    method,
    body: method === "DELETE" ? undefined : "{}",
  });

const CAC_DUONG: { loai: string; goi: () => Promise<Response> }[] = [
  {
    loai: "ipc-lap",
    goi: async () => (await import("@/app/api/payment-certs/route")).POST(yeuCau("POST")),
  },
  {
    loai: "ipc-sua",
    goi: async () =>
      ((await import("@/app/api/payment-certs/[id]/route")).PATCH as Handler)(yeuCau("PATCH"), p),
  },
  {
    loai: "ipc-trinh",
    goi: async () =>
      ((await import("@/app/api/payment-certs/[id]/submit/route")).POST as Handler)(
        yeuCau("POST"),
        p,
      ),
  },
  {
    loai: "ipc-duyet",
    goi: async () =>
      ((await import("@/app/api/payment-certs/[id]/decide/route")).POST as Handler)(
        yeuCau("POST"),
        p,
      ),
  },
  {
    loai: "dc-lap",
    goi: async () =>
      ((await import("@/app/api/payment-certs/[id]/adjustments/route")).POST as Handler)(
        yeuCau("POST"),
        p,
      ),
  },
  {
    loai: "dc-sua",
    goi: async () =>
      ((await import("@/app/api/adjustments/[id]/route")).PATCH as Handler)(yeuCau("PATCH"), p),
  },
  {
    loai: "dc-xoa",
    goi: async () =>
      ((await import("@/app/api/adjustments/[id]/route")).DELETE as Handler)(yeuCau("DELETE"), p),
  },
  {
    loai: "dc-trinh",
    goi: async () =>
      ((await import("@/app/api/adjustments/[id]/submit/route")).POST as Handler)(
        yeuCau("POST"),
        p,
      ),
  },
  {
    loai: "dc-duyet",
    goi: async () =>
      ((await import("@/app/api/adjustments/[id]/decide/route")).POST as Handler)(
        yeuCau("POST"),
        p,
      ),
  },
  {
    loai: "phieu-lap",
    goi: async () => (await import("@/app/api/payments/bills/route")).POST(yeuCau("POST")),
  },
  {
    loai: "phieu-sua",
    goi: async () =>
      ((await import("@/app/api/payments/bills/[id]/route")).PATCH as Handler)(yeuCau("PATCH"), p),
  },
  {
    loai: "phieu-xoa",
    goi: async () =>
      ((await import("@/app/api/payments/bills/[id]/route")).DELETE as Handler)(
        yeuCau("DELETE"),
        p,
      ),
  },
  {
    loai: "phieu-chi",
    goi: async () =>
      ((await import("@/app/api/payments/bills/[id]/pay/route")).POST as Handler)(
        yeuCau("POST"),
        p,
      ),
  },
  {
    loai: "gia-tri-hd",
    goi: async () => (await import("@/app/api/payments/route")).PATCH(yeuCau("PATCH")),
  },
];

for (const d of CAC_DUONG) {
  test(
    `rate-limit tài chính "${d.loai}": quota đầy → 429 + Retry-After; người khác vẫn qua`,
    S,
    async () => {
      const a = await taoAdmin();
      const b = await taoAdmin();
      await datDay(d.loai, a.id);

      dangNhap(a);
      const bi = await d.goi();
      assert.equal(bi.status, 429);
      assert.equal(bi.headers.get("Retry-After"), "60");
      assert.match(((await bi.json()) as { error: string }).error, /tối đa 60 lượt\/15 phút/);

      // Người khác (quota riêng) không bị chặn lây: đi tiếp tới kiểm tra nghiệp vụ (400/404/409/422…).
      dangNhap(b);
      assert.notEqual((await d.goi()).status, 429);
      dangXuat();
    },
  );
}

test("gioiHanGhiTaiChinh: lượt 1–60 qua, lượt 61 bị chặn; loại khác đếm riêng", S, async () => {
  const { gioiHanGhiTaiChinh } = await import("@/lib/bao-mat/ratelimit");
  const a = await taoAdmin();
  for (let i = 1; i <= 60; i++)
    assert.equal(await gioiHanGhiTaiChinh("ipc-duyet", a.id), null, `lượt ${i}`);
  assert.ok(await gioiHanGhiTaiChinh("ipc-duyet", a.id));
  assert.equal(await gioiHanGhiTaiChinh("phieu-chi", a.id), null);
});

test(
  "rate-limit tài chính: chưa đăng nhập vẫn 401 (không đếm), viewer chưa đầy quota vẫn 403",
  S,
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const { POST } = await import("@/app/api/payments/bills/[id]/pay/route");
    dangXuat();
    assert.equal((await (POST as Handler)(yeuCau("POST"), p)).status, 401);

    const viewer = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('RL viewer', ?, 'hash-rl', 'viewer', 1)`,
      `rl-tc-${sfx}-viewer@test.local`,
    );
    nguoi.push(viewer);
    dangNhap({ id: viewer, passwordHash: "hash-rl" });
    assert.equal((await (POST as Handler)(yeuCau("POST"), p)).status, 403);
    dangXuat();
    const dem = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM login_rate_limits WHERE key LIKE 'tai-chinh:%:' || ?`,
      String(viewer),
    );
    assert.ok((dem?.n ?? 0) <= 1, "viewer chỉ tốn tối đa 1 lượt quota, không 429");
  },
);
