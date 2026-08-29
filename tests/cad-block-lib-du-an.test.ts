import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M113 PR1 — thư viện block HAI TẦNG (toàn cục + theo dự án).
// (1) Unit thuần: luật trộn §4 (đè theo id, giữ id lẻ, gắn nguon/libVersion, dự án rỗng ⇒ trùng
//     khít toàn cục).
// (2) Integration (TEST_DATABASE_URL, tự skip): layBlockLibHienHanh đúng tầng, AC4 (nhãn version
//     trùng nhau giữa 2 dự án vẫn phát hành được), AC7 (RLS 2 nhánh + dòng toàn cục ai cũng thấy)
//     bằng role `xboss_app` (NOBYPASSRLS) như production.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import type { BlockLibRow, BlockManifestEntry } from "@/lib/ky-thuat/cad/block-lib";

const S = { skip: !HAS_TEST_DB };

// ===== (1) Unit thuần =====

function block(id: string, blockName: string): BlockManifestEntry {
  return { id, blockName, kind: "fitting" };
}

function bo(version: string, blocks: BlockManifestEntry[]): BlockLibRow {
  return {
    id: 1,
    version,
    manifest: { version, dwgSha256: "a".repeat(64), blocks },
    storageKey: `blocklib-${version}.dwg`,
    dwgSha256: "a".repeat(64),
    nguoiPhatHanh: null,
    createdAt: null,
  };
}

test("tronThuVienBlock: bản của dự án ĐÈ theo id, id lẻ hai bên đều giữ, có nguon/libVersion", async () => {
  const { tronThuVienBlock } = await import("@/lib/ky-thuat/cad/block-lib");
  const toanCuc = bo("g3", [block("titleblock-a1", "XB-KHUNGTEN-A1"), block("co-90", "XB-CO90")]);
  const cuaDuAn = bo("b1", [
    block("titleblock-a1", "XB-KHUNGTEN-A1-CDT"),
    block("van-rieng", "XB-VAN-RIENG"),
  ]);

  const kq = tronThuVienBlock(toanCuc, cuaDuAn);
  assert.deepEqual(
    kq.map((b) => [b.id, b.nguon, b.libVersion]),
    [
      ["titleblock-a1", "project", "b1"],
      ["co-90", "global", "g3"],
      ["van-rieng", "project", "b1"],
    ],
  );
  assert.equal(kq[0].blockName, "XB-KHUNGTEN-A1-CDT", "bản của dự án thắng");
});

test("tronThuVienBlock: dự án chưa có bộ riêng ⇒ trùng khít bộ toàn cục (guardrail 1)", async () => {
  const { tronThuVienBlock } = await import("@/lib/ky-thuat/cad/block-lib");
  const toanCuc = bo("g3", [block("co-90", "XB-CO90"), block("te", "XB-TE")]);

  const kq = tronThuVienBlock(toanCuc, null);
  assert.equal(kq.length, 2);
  assert.ok(kq.every((b) => b.nguon === "global" && b.libVersion === "g3"));
  assert.deepEqual(
    kq.map(({ nguon: _n, libVersion: _v, ...goc }) => goc),
    toanCuc.manifest.blocks,
    "bỏ 2 trường thêm ra thì phải đúng manifest toàn cục",
  );
});

test("tronThuVienBlock: chưa có bộ toàn cục ⇒ chỉ block của dự án; cả hai rỗng ⇒ rỗng", async () => {
  const { tronThuVienBlock } = await import("@/lib/ky-thuat/cad/block-lib");
  const cuaDuAn = bo("b1", [block("van-rieng", "XB-VAN-RIENG")]);
  assert.deepEqual(
    tronThuVienBlock(null, cuaDuAn).map((b) => [b.id, b.nguon]),
    [["van-rieng", "project"]],
  );
  assert.deepEqual(tronThuVienBlock(null, null), []);
});

// ===== (2) Integration =====

let duAnA = 0;
let duAnB = 0;

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId, run } = await import("@/lib/db");
  await run(`DELETE FROM cad_block_libs`);
  duAnA = await insertId(`INSERT INTO projects (name) VALUES ('M113 A')`);
  duAnB = await insertId(`INSERT INTO projects (name) VALUES ('M113 B')`);
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM cad_block_libs`);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, duAnA, duAnB);
});

/** Ghi thẳng một bộ thư viện (đường phát hành theo dự án là việc của PR2). */
async function themBo(projectId: number | null, version: string, blocks: BlockManifestEntry[]) {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO cad_block_libs (version, manifest, storage_key, dwg_sha256, project_id)
     VALUES (?, ?::jsonb, ?, ?, ?)`,
    version,
    JSON.stringify({ version, dwgSha256: "b".repeat(64), blocks }),
    `blocklib-${version}-${projectId ?? "gc"}.dwg`,
    "b".repeat(64),
    projectId,
  );
}

test(
  "AC4: hai dự án cùng nhãn version 'b1' đều phát hành được; toàn cục vẫn duy nhất theo nhãn",
  S,
  async () => {
    await themBo(null, "b1", [block("co-90", "XB-CO90")]);
    await themBo(duAnA, "b1", [block("titleblock-a1", "XB-KHUNGTEN-A")]);
    await themBo(duAnB, "b1", [block("titleblock-a1", "XB-KHUNGTEN-B")]);

    // Cùng (project_id, version) thì vẫn bị chặn — append-only giữ nguyên ở tầng dự án.
    await assert.rejects(
      () => themBo(duAnA, "b1", [block("co-90", "XB-CO90")]),
      /duplicate key|unique/i,
    );
  },
);

test(
  "layBlockLibHienHanh: không tham số ⇒ bộ toàn cục; có projectId ⇒ bộ của dự án đó",
  S,
  async () => {
    const { layBlockLibHienHanh, tronThuVienBlock } = await import("@/lib/ky-thuat/cad/block-lib");

    const toanCuc = await layBlockLibHienHanh();
    assert.equal(toanCuc?.version, "b1");
    assert.deepEqual(
      toanCuc?.manifest.blocks.map((b) => b.id),
      ["co-90"],
    );

    const cuaA = await layBlockLibHienHanh(duAnA);
    assert.deepEqual(
      cuaA?.manifest.blocks.map((b) => b.id),
      ["titleblock-a1"],
    );

    // AC2: dự án A đè khung tên, giữ block toàn cục còn lại.
    assert.deepEqual(
      tronThuVienBlock(toanCuc, cuaA).map((b) => [b.id, b.nguon]),
      [
        ["co-90", "global"],
        ["titleblock-a1", "project"],
      ],
    );

    // AC3: dự án chưa có bộ riêng ⇒ trùng khít toàn cục.
    const chuaCo = await layBlockLibHienHanh(duAnA + duAnB + 10_000);
    assert.equal(chuaCo, null);
    assert.deepEqual(
      tronThuVienBlock(toanCuc, chuaCo).map((b) => b.id),
      ["co-90"],
    );
  },
);

test(
  "AC7 — RLS cad_block_libs: dòng toàn cục ai cũng thấy, bộ dự án chỉ trong GUC của dự án đó",
  S,
  async () => {
    // TEST_DATABASE_URL trỏ role owner/superuser (chạy migration) — superuser BỎ QUA RLS, nên phải
    // mở pool riêng bằng `xboss_app` (0069 tạo, NOBYPASSRLS) mới kiểm được RLS thật.
    const u = new URL(process.env.TEST_DATABASE_URL as string);
    u.username = "xboss_app";
    u.password = "CHANGE_ME_ON_DEPLOY";
    const pool = new Pool({ connectionString: u.toString(), max: 2 });
    try {
      const chay = async <T>(guc: string, fn: (c: import("pg").PoolClient) => Promise<T>) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN");
          await c.query("SELECT set_config('app.project_id', $1, true)", [guc]);
          return await fn(c);
        } finally {
          await c.query("ROLLBACK").catch(() => {});
          c.release();
        }
      };
      // Parser BIGINT của lib/db đặt toàn cục cho pg nên project_id có thể về number hay string
      // tuỳ thứ tự nạp module — chuẩn hoá trước khi so.
      const thay = async (guc: string) => {
        const r = await chay(guc, (c) =>
          c.query<{ project_id: number | string | null }>(
            `SELECT project_id, version FROM cad_block_libs ORDER BY id`,
          ),
        );
        return r.rows.map((x) => (x.project_id === null ? null : Number(x.project_id)));
      };

      assert.deepEqual(
        await thay(String(duAnA)),
        [null, duAnA],
        "dự án A thấy bộ toàn cục + bộ của chính mình, KHÔNG thấy bộ của B",
      );

      assert.deepEqual(
        await thay(""),
        [null],
        "thiếu GUC (plugin bản cũ, đường toàn cục) vẫn thấy đúng bộ toàn cục và chỉ bộ toàn cục",
      );

      // WITH CHECK: đang ở ngữ cảnh dự án A mà ghi bộ của dự án B → bị chặn.
      await assert.rejects(
        () =>
          chay(String(duAnA), (c) =>
            c.query(
              `INSERT INTO cad_block_libs (version, manifest, storage_key, dwg_sha256, project_id)
             VALUES ('rls-lau', '{}'::jsonb, 'k.dwg', 'c', $1)`,
              [duAnB],
            ),
          ),
        /row-level security/i,
      );
    } finally {
      await pool.end();
    }
  },
);
