import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { SoFixture, P, goi } from "./helpers/chuoi-nghiep-vu";
import { datCookie, COOKIE_DU_AN } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Pool } from "pg";

// A1-AC06 (GAP-5): RLS chỉ là lưới an toàn thật khi app chạy bằng role KHÔNG bỏ qua được policy.
// (1) Thuộc tính role ứng dụng `xboss_app`: NOBYPASSRLS, không superuser, không sở hữu (kể cả
//     gián tiếp qua membership) bảng nào đang bật RLS — owner bỏ qua RLS nếu bảng không FORCE.
// (2) Lớp H: route tài chính thật (GET /api/contracts, /api/contracts/:id) chạy TRỌN bằng pool
//     `xboss_app` thấy ĐÚNG dữ liệu dự án đang chọn (không chỉ rỗng), dự án khác → không lộ/404.

const S = { skip: !HAS_TEST_DB };
type G = { __xbossPool?: Pool };
const g = globalThis as unknown as G;

function appConnString(): string {
  const u = new URL(process.env.TEST_DATABASE_URL as string);
  u.username = "xboss_app";
  u.password = "CHANGE_ME_ON_DEPLOY";
  return u.toString();
}

test(
  "A1-AC06: role xboss_app NOBYPASSRLS, không superuser, không sở hữu bảng RLS nào",
  S,
  async () => {
    const appPool = new Pool({ connectionString: appConnString(), max: 1, allowExitOnIdle: true });
    try {
      const role = await appPool.query<{ rolbypassrls: boolean; rolsuper: boolean; u: string }>(
        `SELECT rolbypassrls, rolsuper, current_user AS u FROM pg_roles WHERE rolname = current_user`,
      );
      assert.deepEqual(role.rows[0], { rolbypassrls: false, rolsuper: false, u: "xboss_app" });
      const rls = await appPool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity`,
      );
      assert.ok(rls.rows[0].n > 0, "phải có bảng bật RLS để kiểm");
      const owned = await appPool.query<{ relname: string }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
          AND pg_has_role(current_user, c.relowner, 'MEMBER')
        ORDER BY 1`,
      );
      assert.deepEqual(
        owned.rows.map((r) => r.relname),
        [],
        "xboss_app sở hữu bảng RLS ⇒ policy bị bỏ qua (trừ khi FORCE)",
      );
    } finally {
      await appPool.end();
    }
  },
);

test(
  "A1-AC06: GET /api/contracts(+/:id) chạy bằng xboss_app thấy đúng dữ liệu đúng dự án",
  S,
  async () => {
    const { insertId, getPool } = await import("@/lib/db");
    const { GET: list } = await import("@/app/api/contracts/route");
    const { GET: detail } = await import("@/app/api/contracts/[id]/route");
    const ownerPool = getPool();
    const fx = new SoFixture();
    const appPool = new Pool({ connectionString: appConnString(), max: 3, allowExitOnIdle: true });
    try {
      const pm = await fx.user("pm");
      const projA = await fx.duAn("RLS-H A");
      const projB = await fx.duAn("RLS-H B");
      const sfx = `${projA}_${projB}`;
      const ma = (p: string, i: number) => `RLSH-${p}-${i}-${sfx}`;
      const idA: number[] = [];
      for (const i of [1, 2])
        idA.push(
          await insertId(
            `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'HĐ A', ?)`,
            ma("A", i),
            projA,
          ),
        );
      const idB = await insertId(
        `INSERT INTO contracts (code, kind, title, project_id) VALUES (?, 'nhan_thau', 'HĐ B', ?)`,
        ma("B", 1),
        projB,
      );
      await fx.vao(pm, projB); // gán thành viên dự án B
      await fx.vao(pm, projA); // gán dự án A + cookie chọn A

      g.__xbossPool = appPool;
      const ds = async () => {
        const r = await goi(list(new NextRequest("http://localhost/api/contracts")));
        assert.equal(r.status, 200, JSON.stringify(r.body));
        return ((r.body?.contracts ?? []) as { code: string }[]).map((c) => c.code).sort();
      };
      assert.deepEqual(await ds(), [ma("A", 1), ma("A", 2)], "dự án A: đúng 2 HĐ của A");
      assert.ok(appPool.totalCount > 0, "route phải chạy qua pool xboss_app, không phải owner");
      assert.equal(
        (await goi(detail(new NextRequest(`http://localhost/api/contracts/${idA[0]}`), P(idA[0]))))
          .status,
        200,
      );
      // HĐ của dự án B khi đang chọn A → 404 (không xác nhận tồn tại).
      assert.equal(
        (await goi(detail(new NextRequest(`http://localhost/api/contracts/${idB}`), P(idB))))
          .status,
        404,
      );
      datCookie(COOKIE_DU_AN, String(projB));
      assert.deepEqual(await ds(), [ma("B", 1)], "dự án B: đúng 1 HĐ của B");
      assert.equal(
        (await goi(detail(new NextRequest(`http://localhost/api/contracts/${idA[0]}`), P(idA[0]))))
          .status,
        404,
      );
    } finally {
      g.__xbossPool = ownerPool;
      await appPool.end();
      await fx.don();
    }
  },
);
