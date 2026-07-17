import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M49 PR1 — API keys đọc-only + namespace /api/v1. Integration (cần Postgres qua
// TEST_DATABASE_URL, không có thì tự skip). Kiểm 5 nhóm: auth/scope/scope dự án/rate
// limit/throttle last_used_at.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };

// Ngữ cảnh dựng sẵn cho cả file.
let U = 0;
let pA = 0;
let pB = 0;
let taskA = 0;
let taskB = 0;
let keyReadA = "";
let keyFinanceA = "";
let keyGlobal = "";
let keyRevoked = "";
let keyReadAId = 0;

function reqOf(path: string, key?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    headers: key ? { authorization: `Bearer ${key}` } : {},
  });
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/api-keys");

  U = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('APIKeyTest','apikey-test@x.vn','admin','x')`,
  );

  // Dựng 2 dự án đầy đủ WBS + 1 task/mỗi dự án để kiểm scope.
  async function seedProject(suffix: string) {
    const p = await insertId(
      `INSERT INTO projects (name, code) VALUES (?, ?)`,
      `DA ${suffix}`,
      `PJT-AK${suffix}`,
    );
    const tw = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`, p);
    const st = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'OGTD', 'OGTĐ', ?)`,
      tw,
      `v1-ak-${suffix}`,
    );
    const wp = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, boq_code, progress, status)
       VALUES (?, 'A1', 'Nhóm A1', 'T27', ?, 0.5, 'dang_thi_cong')`,
      st,
      `BOQ-AK${suffix}`,
    );
    const task = await insertId(
      `INSERT INTO tasks (package_id, code, name, status, progress_percent, boq_code, start_date, end_date)
       VALUES (?, 'A1,01', 'Task A1', 'dang_thi_cong', 0.5, ?, '2026-01-01', '2026-02-01')`,
      wp,
      `BOQ-AK${suffix}-01`,
    );
    await insertId(
      `INSERT INTO materials (name, unit, project_id, boq_code, qty_boq, qty_planned, qty_used, qty_stock, status)
       VALUES (?, 'm', ?, ?, 100, 80, 40, 60, 'dat_hang')`,
      `VT ${suffix}`,
      p,
      `MAT-AK${suffix}`,
    );
    return { p, task };
  }

  const a = await seedProject("A");
  const b = await seedProject("B");
  pA = a.p;
  pB = b.p;
  taskA = a.task;
  taskB = b.task;

  // Chứng chỉ thanh toán cho dự án A (kiểm scope read_finance).
  const contract = await insertId(
    `INSERT INTO contracts (code, kind, title, project_id) VALUES ('HD-AK-A', 'nhan_thau', 'HĐ A', ?)`,
    pA,
  );
  await insertId(
    `INSERT INTO payment_certs (code, contract_id, period_no, status) VALUES ('IPC-AK-A', ?, 1, 'submitted')`,
    contract,
  );

  async function mkKey(
    scopes: string[],
    projectId: number | null,
    revoked = false,
  ): Promise<{ id: number; raw: string }> {
    const raw = generateApiKey();
    const id = await insertId(
      `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by, revoked_at)
       VALUES ('k', ?, ?, ?, ?, ?)`,
      hashApiKey(raw),
      projectId,
      scopes,
      U,
      revoked ? new Date() : null,
    );
    return { id, raw };
  }

  const kRead = await mkKey(["read"], pA);
  keyReadA = kRead.raw;
  keyReadAId = kRead.id;
  keyFinanceA = (await mkKey(["read", "read_finance"], pA)).raw;
  keyGlobal = (await mkKey(["read"], null)).raw;
  keyRevoked = (await mkKey(["read"], pA, true)).raw;
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM api_keys WHERE created_by = ?`, U);
  await run(`DELETE FROM payment_certs WHERE code = 'IPC-AK-A'`);
  await run(`DELETE FROM contracts WHERE code = 'HD-AK-A'`);
  await run(`DELETE FROM materials WHERE project_id IN (?, ?)`, pA, pB);
  await run(
    `DELETE FROM tasks WHERE package_id IN (SELECT wp.id FROM work_packages wp JOIN sheet_types st ON wp.sheet_type_id = st.id JOIN towers tw ON st.tower_id = tw.id WHERE tw.project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(
    `DELETE FROM work_packages WHERE sheet_type_id IN (SELECT st.id FROM sheet_types st JOIN towers tw ON st.tower_id = tw.id WHERE tw.project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(
    `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(`DELETE FROM towers WHERE project_id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM users WHERE id = ?`, U);
  await run(`DELETE FROM login_rate_limits WHERE key LIKE 'api:%'`);
});

// (1) key đúng → 200; sai/revoked/thiếu header → 401.
test("api-keys: key đúng → 200; sai/revoked/thiếu header → 401", S, async () => {
  const { GET } = await import("@/app/api/v1/tasks/route");

  const ok = await GET(reqOf("/api/v1/tasks", keyReadA));
  assert.equal(ok.status, 200);

  const wrong = await GET(reqOf("/api/v1/tasks", "xbk_deadbeef"));
  assert.equal(wrong.status, 401);

  const revoked = await GET(reqOf("/api/v1/tasks", keyRevoked));
  assert.equal(revoked.status, 401);

  const noHeader = await GET(reqOf("/api/v1/tasks"));
  assert.equal(noHeader.status, 401);
});

// (2) scope read gọi payment-certs → 403; read_finance → 200.
test("api-keys: scope read → 403 ở payment-certs; read_finance → 200", S, async () => {
  const { GET } = await import("@/app/api/v1/payment-certs/route");

  const forbidden = await GET(reqOf("/api/v1/payment-certs", keyReadA));
  assert.equal(forbidden.status, 403);

  const allowed = await GET(reqOf("/api/v1/payment-certs", keyFinanceA));
  assert.equal(allowed.status, 200);
  const j = await allowed.json();
  assert.ok(Array.isArray(j.data));
  assert.ok(j.data.some((r: { code: string }) => r.code === "IPC-AK-A"));
});

// (3) key dự án A chỉ thấy dữ liệu dự án A; key toàn cục thiếu ?project= → 422.
test(
  "api-keys: scope dự án — key A không thấy dữ liệu B; key toàn cục thiếu project → 422",
  S,
  async () => {
    const { GET } = await import("@/app/api/v1/tasks/route");

    const resA = await GET(reqOf("/api/v1/tasks", keyReadA));
    const jA = await resA.json();
    const ids = jA.data.map((r: { id: number }) => r.id);
    assert.ok(ids.includes(taskA), "phải thấy task dự án A");
    assert.ok(!ids.includes(taskB), "KHÔNG được thấy task dự án B");

    // Key toàn cục thiếu ?project= → 422.
    const noProject = await GET(reqOf("/api/v1/tasks", keyGlobal));
    assert.equal(noProject.status, 422);

    // Key toàn cục có ?project=A → 200, chỉ thấy A.
    const withProject = await GET(reqOf(`/api/v1/tasks?project=${pA}`, keyGlobal));
    assert.equal(withProject.status, 200);
    const jG = await withProject.json();
    const idsG = jG.data.map((r: { id: number }) => r.id);
    assert.ok(idsG.includes(taskA) && !idsG.includes(taskB));
  },
);

// (4) vượt giới hạn → 429 kèm Retry-After. Test helper trực tiếp cho ngưỡng, +1 ca route.
test("api-keys: hitRateLimit đếm-trước-chặn-sau + route trả 429 + Retry-After", S, async () => {
  const { hitRateLimit } = await import("@/lib/ratelimit");
  const { run } = await import("@/lib/db");
  const key = `api:test-${Date.now()}`;

  assert.equal(await hitRateLimit(key, 2, 15), false); // count=1
  assert.equal(await hitRateLimit(key, 2, 15), false); // count=2
  assert.equal(await hitRateLimit(key, 2, 15), true); // count=3 > 2 → vượt
  await run(`DELETE FROM login_rate_limits WHERE key = ?`, key);

  // Route: nạp sẵn count vượt 120 cho key thật rồi gọi → 429 + Retry-After.
  await run(
    `INSERT INTO login_rate_limits (key, count, reset_at) VALUES (?, 121, NOW() + INTERVAL '1 minute')
     ON CONFLICT (key) DO UPDATE SET count = 121, reset_at = NOW() + INTERVAL '1 minute'`,
    `api:${keyReadAId}`,
  );
  const { GET } = await import("@/app/api/v1/tasks/route");
  const res = await GET(reqOf("/api/v1/tasks", keyReadA));
  assert.equal(res.status, 429);
  assert.ok(res.headers.get("Retry-After"), "phải có header Retry-After");
  await run(`DELETE FROM login_rate_limits WHERE key = ?`, `api:${keyReadAId}`);
});

// (5) last_used_at cập nhật có throttle (chỉ ghi khi chưa dùng hoặc cách > 60s).
test("api-keys: last_used_at cập nhật có throttle", S, async () => {
  const { verifyApiKey } = await import("@/lib/api-keys");
  const { queryOne, run } = await import("@/lib/db");
  const { hashApiKey } = await import("@/lib/api-keys");
  const hash = hashApiKey(keyReadA);

  await run(`UPDATE api_keys SET last_used_at = NULL WHERE key_hash = ?`, hash);
  await verifyApiKey(`Bearer ${keyReadA}`);
  const r1 = await queryOne<{ ts: string | null }>(
    `SELECT last_used_at AS ts FROM api_keys WHERE key_hash = ?`,
    hash,
  );
  assert.ok(r1?.ts, "lần đầu phải ghi last_used_at");

  // Gọi lại ngay → throttle, KHÔNG ghi lại (giữ nguyên timestamp).
  await verifyApiKey(`Bearer ${keyReadA}`);
  const r2 = await queryOne<{ ts: string | null }>(
    `SELECT last_used_at AS ts FROM api_keys WHERE key_hash = ?`,
    hash,
  );
  assert.equal(String(r2?.ts), String(r1?.ts), "trong 60s không ghi lại");

  // Lùi timestamp > 60s rồi gọi lại → ghi mới.
  await run(
    `UPDATE api_keys SET last_used_at = NOW() - INTERVAL '2 minutes' WHERE key_hash = ?`,
    hash,
  );
  await verifyApiKey(`Bearer ${keyReadA}`);
  const r3 = await queryOne<{ ts: string | null }>(
    `SELECT last_used_at AS ts FROM api_keys WHERE key_hash = ?`,
    hash,
  );
  assert.ok(r3?.ts && new Date(r3.ts).getTime() > Date.now() - 60_000, "phải ghi timestamp mới");
});
