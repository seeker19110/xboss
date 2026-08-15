import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// C3 §6 — Dọn dữ liệu hết hạn theo chính sách (lib/retention.ts).
//
// Trọng tâm test là ba lời hứa dễ hỏng nhất, hỏng thì mất dữ liệu thật:
//   1. mặc định KHÔNG xoá gì (dry-run);
//   2. target `enabled: false` KHÔNG bao giờ bị xoá, kể cả khi apply;
//   3. `keepWhile` giữ đúng dòng còn cần dùng (webhook 'pending' đang chờ retry).
import { test } from "node:test";
import assert from "node:assert/strict";

const S = { skip: !HAS_TEST_DB };

test("Registry: audit_log KHÔNG được nằm trong danh sách xoá", async () => {
  const { RETENTION_TARGETS, AUDIT_LOG_KHONG_XOA } = await import("@/lib/retention");
  assert.ok(
    !RETENTION_TARGETS.some((t) => t.table === "audit_log"),
    "audit_log dùng chuỗi băm móc xích — không được xoá bằng DELETE",
  );
  assert.match(AUDIT_LOG_KHONG_XOA, /băm|xích/i, "phải giải thích lý do, không im lặng bỏ qua");
});

test("Registry: target đụng dữ liệu nghiệp vụ phải TẮT sẵn, chờ chủ sở hữu chốt", async () => {
  const { RETENTION_TARGETS } = await import("@/lib/retention");
  for (const key of ["engineering_source_revisions", "engineering_objects_rejected"]) {
    const t = RETENTION_TARGETS.find((x) => x.key === key);
    assert.ok(t, `phải khai báo sẵn ${key} để người sau thấy câu hỏi còn treo`);
    assert.equal(t!.enabled, false, `${key} là dữ liệu nghiệp vụ — không được tự bật`);
    assert.match(t!.reason, /CHỜ CHỦ SỞ HỮU/i, `${key} phải ghi rõ đang chờ ai quyết`);
  }
});

test("whereOf: dựng đúng mệnh đề cho cả 2 chế độ và có kèm keepWhile", async () => {
  const { whereOf } = await import("@/lib/retention");
  assert.equal(
    whereOf({
      key: "k",
      table: "t",
      mode: "deadline",
      column: "expires_at",
      enabled: true,
      reason: "",
    }),
    "expires_at < NOW()",
  );
  assert.equal(
    whereOf({
      key: "k",
      table: "t",
      mode: "age",
      column: "created_at",
      days: 30,
      enabled: true,
      reason: "",
    }),
    "created_at < NOW() - INTERVAL '30 days'",
  );
  assert.equal(
    whereOf({
      key: "k",
      table: "t",
      mode: "age",
      column: "created_at",
      days: 7,
      keepWhile: "status <> 'pending'",
      enabled: true,
      reason: "",
    }),
    "created_at < NOW() - INTERVAL '7 days' AND (status <> 'pending')",
  );
});

test("whereOf: mode 'age' thiếu days phải NÉM LỖI, không dựng ra INTERVAL 'NaN days'", async () => {
  const { whereOf, hasPeriod } = await import("@/lib/retention");
  const chuaChot = {
    key: "k",
    table: "t",
    mode: "age" as const,
    column: "created_at",
    days: null,
    enabled: false,
    reason: "",
  };
  assert.equal(hasPeriod(chuaChot), false);
  assert.throws(
    () => whereOf(chuaChot),
    /chưa chốt số ngày/i,
    "thiếu days mà vẫn dựng câu lệnh thì Postgres báo lỗi NaN — không ai lần ra nguồn",
  );
});

test("Dry-run (mặc định) đếm được nhưng KHÔNG xoá dòng nào", S, async () => {
  const { runRetention } = await import("@/lib/retention");
  const { run, queryOne, insertId } = await import("@/lib/db");

  const projId = await insertId(`INSERT INTO projects (name) VALUES ('Retention DR')`);
  try {
    // Dòng ingest đã hết hạn từ hôm qua.
    await run(
      `INSERT INTO engineering_ingest_requests
         (project_id, idempotency_key, request_sha256, status, response_status, response_body, expires_at)
       VALUES (?, 'ret-dry', repeat('a',64), 'completed', 201, '{}'::jsonb, NOW() - INTERVAL '1 day')`,
      projId,
    );

    const rows = await runRetention(); // không truyền apply
    const ing = rows.find((r) => r.key === "engineering_ingest_requests");
    assert.ok((ing?.matched ?? 0) >= 1, "phải ĐẾM được dòng hết hạn");
    assert.equal(ing?.deleted, 0, "dry-run tuyệt đối không được xoá");

    const still = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_ingest_requests WHERE idempotency_key = 'ret-dry'`,
    );
    assert.equal(still?.n, 1, "dòng phải còn nguyên sau dry-run");
  } finally {
    await run(`DELETE FROM engineering_ingest_requests WHERE project_id = ?`, projId);
    await run(`DELETE FROM projects WHERE id = ?`, projId);
  }
});

test("apply=true xoá dòng HẾT HẠN nhưng giữ dòng CHƯA hết hạn", S, async () => {
  const { runRetention } = await import("@/lib/retention");
  const { run, queryOne, insertId } = await import("@/lib/db");

  const projId = await insertId(`INSERT INTO projects (name) VALUES ('Retention AP')`);
  try {
    await run(
      `INSERT INTO engineering_ingest_requests
         (project_id, idempotency_key, request_sha256, status, response_status, response_body, expires_at)
       VALUES (?, 'ret-old', repeat('b',64), 'completed', 201, '{}'::jsonb, NOW() - INTERVAL '1 day')`,
      projId,
    );
    await run(
      `INSERT INTO engineering_ingest_requests
         (project_id, idempotency_key, request_sha256, status, response_status, response_body, expires_at)
       VALUES (?, 'ret-new', repeat('c',64), 'completed', 201, '{}'::jsonb, NOW() + INTERVAL '10 days')`,
      projId,
    );

    await runRetention(true);

    const old = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_ingest_requests WHERE idempotency_key = 'ret-old'`,
    );
    const fresh = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM engineering_ingest_requests WHERE idempotency_key = 'ret-new'`,
    );
    assert.equal(old?.n, 0, "dòng hết hạn phải bị xoá");
    assert.equal(fresh?.n, 1, "dòng CHƯA hết hạn không được đụng tới");
  } finally {
    await run(`DELETE FROM engineering_ingest_requests WHERE project_id = ?`, projId);
    await run(`DELETE FROM projects WHERE id = ?`, projId);
  }
});

test("keepWhile: webhook 'pending' đang chờ retry KHÔNG bị dọn dù đã quá hạn", S, async () => {
  const { runRetention } = await import("@/lib/retention");
  const { run, queryOne, insertId } = await import("@/lib/db");

  const userId = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('Retention', ?, 'admin', 'x')`,
    `retention-${Date.now()}@test.local`,
  );
  const hookId = await insertId(
    `INSERT INTO webhooks (url, secret, events, created_by) VALUES ('https://x.test/h', 's', ARRAY['task.updated'], ?)`,
    userId,
  );
  try {
    // Cả hai đều cũ 60 ngày — chỉ khác trạng thái.
    await run(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload, status, created_at)
       VALUES (?, 'task.updated', '{}'::jsonb, 'ok', NOW() - INTERVAL '60 days')`,
      hookId,
    );
    await run(
      `INSERT INTO webhook_deliveries (webhook_id, event, payload, status, created_at)
       VALUES (?, 'task.updated', '{}'::jsonb, 'pending', NOW() - INTERVAL '60 days')`,
      hookId,
    );

    await runRetention(true);

    const done = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE webhook_id = ? AND status = 'ok'`,
      hookId,
    );
    const pending = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE webhook_id = ? AND status = 'pending'`,
      hookId,
    );
    assert.equal(done?.n, 0, "dòng đã kết thúc và quá hạn thì dọn");
    assert.equal(
      pending?.n,
      1,
      "dòng 'pending' còn trong hàng đợi retry — xoá là mất hẳn sự kiện, không phải dọn rác",
    );
  } finally {
    await run(`DELETE FROM webhook_deliveries WHERE webhook_id = ?`, hookId);
    await run(`DELETE FROM webhooks WHERE id = ?`, hookId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  }
});

test("Target TẮT không bị xoá kể cả khi apply=true", S, async () => {
  const { runRetention } = await import("@/lib/retention");
  const rows = await runRetention(true);
  for (const r of rows.filter((x) => !x.enabled)) {
    assert.equal(r.deleted, 0, `${r.key} đang tắt — apply cũng không được xoá`);
  }
});
