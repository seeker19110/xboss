import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

// A4-FR06: READ ONLY/isolation nằm ngay trong câu BEGIN, không còn SET TRANSACTION sau đó.

// Ghi lại mọi câu SQL gửi qua client mượn từ pool (kể cả BEGIN/COMMIT).
async function ghiCauLenh(fn: () => Promise<unknown>): Promise<string[]> {
  const { getPool } = await import("@/lib/db");
  const pool = getPool();
  const goc = pool.connect.bind(pool) as (...a: unknown[]) => Promise<unknown>;
  const log: string[] = [];
  // Pool.query nội bộ gọi connect(callback) — chỉ bọc dạng promise (withTransaction dùng).
  (pool as unknown as { connect: unknown }).connect = async (...ca: unknown[]) => {
    if (typeof ca[0] === "function") return goc(...ca);
    const client = (await goc()) as { query: (...a: unknown[]) => unknown };
    const q = client.query.bind(client);
    client.query = (...a: unknown[]) => {
      const text = typeof a[0] === "string" ? a[0] : (a[0] as { text?: string })?.text;
      if (text) log.push(text.trim());
      return q(...a);
    };
    return client;
  };
  try {
    await fn();
  } finally {
    (pool as unknown as { connect: unknown }).connect = goc;
  }
  return log;
}

test(
  "withProjectScope: BEGIN chứa READ ONLY, không SET TRANSACTION",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, query } = await import("@/lib/db");
    const log = await ghiCauLenh(() => withProjectScope(1, () => query("SELECT 1")));
    assert.equal(log[0], "BEGIN READ ONLY");
    assert.ok(!log.some((s) => /^SET TRANSACTION/i.test(s)), "không còn SET TRANSACTION");
  },
);

test(
  "withProjectScope: repeatable_read + readOnly gộp trong 1 câu BEGIN",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, query } = await import("@/lib/db");
    let iso = "";
    let ro = "";
    const log = await ghiCauLenh(() =>
      withProjectScope(
        1,
        async () => {
          iso = (
            await query<{ v: string }>("SELECT current_setting('transaction_isolation') AS v")
          )[0].v;
          ro = (
            await query<{ v: string }>("SELECT current_setting('transaction_read_only') AS v")
          )[0].v;
        },
        { isolation: "repeatable_read" },
      ),
    );
    assert.equal(log[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal(iso, "repeatable read");
    assert.equal(ro, "on");
  },
);

test(
  "withProjectScope readOnly:false / withTransaction: BEGIN không READ ONLY",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, withTransaction, query } = await import("@/lib/db");
    const l1 = await ghiCauLenh(() =>
      withProjectScope(1, () => query("SELECT 1"), { readOnly: false }),
    );
    assert.equal(l1[0], "BEGIN");
    const l2 = await ghiCauLenh(() =>
      withTransaction(() => query("SELECT 1"), { isolation: "repeatable_read" }),
    );
    assert.equal(l2[0], "BEGIN ISOLATION LEVEL REPEATABLE READ");
  },
);

test(
  "withProjectScope lồng trong transaction ghi: không ép READ ONLY, không BEGIN thứ 2",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, withTransaction, query } = await import("@/lib/db");
    const log = await ghiCauLenh(() =>
      withTransaction(async () => {
        await withProjectScope(1, () => query("SELECT 1"));
        const ro = (
          await query<{ v: string }>("SELECT current_setting('transaction_read_only') AS v")
        )[0].v;
        assert.equal(ro, "off");
      }),
    );
    assert.equal(log.filter((s) => /^BEGIN/.test(s)).length, 1);
  },
);

test(
  "readOnly scope: ghi ngay câu đầu tiên bị Postgres từ chối",
  { skip: !HAS_TEST_DB },
  async () => {
    const { withProjectScope, run } = await import("@/lib/db");
    await assert.rejects(
      () => withProjectScope(1, () => run("CREATE TEMP TABLE _ro_probe (x int)")),
      /read-only transaction/i,
    );
  },
);
