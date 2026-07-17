import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Test webhook ra ngoài (M49 PR2). Tích hợp thật với TEST_DATABASE_URL — tự skip nếu không có
// (giống recompute.test.ts). Mock globalThis.fetch để kiểm gửi/backoff/chữ ký mà không gọi mạng.

type FetchCall = { url: string; init: RequestInit };

// Cài mock fetch trả về status cố định, ghi lại mọi lời gọi. Trả hàm gỡ mock.
function installFetchMock(status: number, calls: FetchCall[]): () => void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return { status } as Response;
  }) as typeof fetch;
  return () => {
    globalThis.fetch = orig;
  };
}

// Dựng 1 user + project mới cho mỗi ca, dọn sạch bảng webhook trước.
async function freshEnv(): Promise<{ userId: number; projectId: number }> {
  const { run, insertId } = await import("@/lib/db");
  await run(`DELETE FROM webhook_deliveries`);
  await run(`DELETE FROM webhooks`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('WH Test', ?, 'x', 'admin')
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    `wh-${Date.now()}-${Math.random()}@xboss.vn`,
  );
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('DA Webhook Test')`);
  return { userId, projectId };
}

// Chèn 1 webhook active, trả id + secret.
async function makeWebhook(opts: {
  userId: number;
  projectId: number | null;
  events: string[];
  active?: boolean;
  secret?: string;
  url?: string;
}): Promise<{ id: number; secret: string }> {
  const { insertId } = await import("@/lib/db");
  const secret = opts.secret ?? "test-secret-xboss";
  const id = await insertId(
    `INSERT INTO webhooks (project_id, url, secret, events, active, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    opts.projectId,
    opts.url ?? "https://vi-du.test/webhook",
    secret,
    opts.events,
    opts.active ?? true,
    opts.userId,
  );
  return { id, secret };
}

test(
  "(1) emitWebhook chỉ tạo delivery cho webhook active + khớp event + khớp project",
  { skip: !HAS_TEST_DB },
  async () => {
    const { emitWebhook } = await import("@/lib/webhooks");
    const { query } = await import("@/lib/db");
    const { userId, projectId } = await freshEnv();

    const match = await makeWebhook({
      userId,
      projectId,
      events: ["task.approved", "ping"],
    });
    // inactive → không nhận
    const inactive = await makeWebhook({
      userId,
      projectId,
      events: ["task.approved"],
      active: false,
    });
    // khác event → không nhận
    const otherEvent = await makeWebhook({ userId, projectId, events: ["material.over_norm"] });
    // khác project → không nhận (dùng 1 dự án THẬT khác để không vướng FK)
    const { insertId } = await import("@/lib/db");
    const otherProjectId = await insertId(`INSERT INTO projects (name) VALUES ('DA Webhook Khac')`);
    const otherProject = await makeWebhook({
      userId,
      projectId: otherProjectId,
      events: ["task.approved"],
    });

    await emitWebhook("task.approved", projectId, { taskId: 1, code: "A1" });

    const rows = await query<{ webhookId: number }>(
      `SELECT webhook_id AS "webhookId" FROM webhook_deliveries`,
    );
    const hookIds = rows.map((r) => r.webhookId);
    assert.deepEqual(hookIds, [match.id], "chỉ webhook khớp mới có delivery");
    assert.ok(!hookIds.includes(inactive.id));
    assert.ok(!hookIds.includes(otherEvent.id));
    assert.ok(!hookIds.includes(otherProject.id));

    // Webhook project_id NULL (mọi dự án) cũng nhận khi emit có projectId cụ thể.
    const anyProject = await makeWebhook({ userId, projectId: null, events: ["task.approved"] });
    await emitWebhook("task.approved", projectId, { taskId: 2 });
    const cnt = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE webhook_id = ?`,
      anyProject.id,
    );
    assert.equal(Number(cnt[0].n), 1, "webhook toàn cục (project NULL) nhận sự kiện");
  },
);

test(
  "(2) deliverDueWebhooks: 2xx → ok; 500 → attempts+1 + backoff [5m,30m,2h,2h]; attempts>=5 → failed",
  { skip: !HAS_TEST_DB },
  async () => {
    const { emitWebhook, deliverDueWebhooks } = await import("@/lib/webhooks");
    const { query, queryOne, run } = await import("@/lib/db");
    const { userId, projectId } = await freshEnv();

    // --- 2xx → ok ---
    await makeWebhook({ userId, projectId, events: ["ping"], url: "https://ok.test/h" });
    await emitWebhook("ping", projectId, { hello: 1 });
    let restore = installFetchMock(200, []);
    let res = await deliverDueWebhooks();
    restore();
    assert.equal(res.sent, 1);
    assert.equal(res.failed, 0);
    let d = await queryOne<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM webhook_deliveries ORDER BY id DESC LIMIT 1`,
    );
    assert.equal(d?.status, "ok");

    // --- 500 → backoff dần rồi failed ---
    await run(`DELETE FROM webhook_deliveries`);
    await emitWebhook("ping", projectId, { hello: 2 });
    const deliveryId = (
      await queryOne<{ id: number }>(`SELECT id FROM webhook_deliveries ORDER BY id DESC LIMIT 1`)
    )?.id;
    assert.ok(deliveryId);

    // Kỳ vọng next_retry_at ≈ now + [phút] cho từng lần thử.
    const expectMinutes = [5, 30, 120, 120];
    for (let attempt = 1; attempt <= 4; attempt++) {
      // ép đến hạn lại để lượt gửi kế tiếp nhặt được
      await run(`UPDATE webhook_deliveries SET next_retry_at = now() WHERE id = ?`, deliveryId);
      restore = installFetchMock(500, []);
      res = await deliverDueWebhooks();
      restore();
      assert.equal(res.failed, 1, `lần ${attempt} phải tính là thất bại`);

      const row: { status: string; attempts: number; diffMin: number } | undefined =
        await queryOne(
          `SELECT status, attempts,
                EXTRACT(EPOCH FROM (next_retry_at - now())) / 60 AS "diffMin"
           FROM webhook_deliveries WHERE id = ?`,
          deliveryId,
        );
      assert.equal(Number(row?.attempts), attempt, `attempts = ${attempt}`);
      assert.equal(row?.status, "pending", "chưa hết lượt → vẫn pending");
      const wantMin = expectMinutes[attempt - 1];
      assert.ok(
        Math.abs(Number(row?.diffMin) - wantMin) < 2,
        `backoff lần ${attempt} ≈ ${wantMin} phút (thực tế ${row?.diffMin})`,
      );
    }

    // Lần 5 vẫn lỗi → attempts=5 → status='failed' (dừng hẳn).
    await run(`UPDATE webhook_deliveries SET next_retry_at = now() WHERE id = ?`, deliveryId);
    restore = installFetchMock(500, []);
    res = await deliverDueWebhooks();
    restore();
    const final = await queryOne<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM webhook_deliveries WHERE id = ?`,
      deliveryId,
    );
    assert.equal(Number(final?.attempts), 5);
    assert.equal(final?.status, "failed");

    // Đã 'failed' → lượt sau không nhặt lại nữa (dù ép next_retry_at về now).
    await run(`UPDATE webhook_deliveries SET next_retry_at = now() WHERE id = ?`, deliveryId);
    restore = installFetchMock(200, []);
    res = await deliverDueWebhooks();
    restore();
    assert.equal(res.sent, 0);
    assert.equal(res.failed, 0);

    void query; // giữ import dùng đủ
  },
);

test(
  "(3) chữ ký X-Xboss-Signature verify lại đúng bằng secret; 3xx tính là lỗi",
  { skip: !HAS_TEST_DB },
  async () => {
    const { emitWebhook, deliverDueWebhooks } = await import("@/lib/webhooks");
    const { userId, projectId } = await freshEnv();
    const secret = "sieu-bi-mat-123";
    await makeWebhook({ userId, projectId, events: ["ping"], secret });
    await emitWebhook("ping", projectId, { k: "v", n: 42 });

    const calls: FetchCall[] = [];
    const restore = installFetchMock(200, calls);
    await deliverDueWebhooks();
    restore();

    assert.equal(calls.length, 1);
    const call = calls[0];
    const headers = call.init.headers as Record<string, string>;
    const body = call.init.body as string;
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["X-Xboss-Event"], "ping");
    assert.ok(headers["X-Xboss-Delivery"]);

    const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    assert.equal(headers["X-Xboss-Signature"], expected, "chữ ý HMAC khớp body gửi đi");

    // 3xx (redirect) tính là lỗi — không đánh dấu ok.
    const { run, queryOne } = await import("@/lib/db");
    await run(`DELETE FROM webhook_deliveries`);
    await emitWebhook("ping", projectId, { redirect: true });
    const r2 = installFetchMock(302, []);
    const res = await deliverDueWebhooks();
    r2();
    assert.equal(res.sent, 0);
    assert.equal(res.failed, 1);
    const row = await queryOne<{ status: string; lastError: string }>(
      `SELECT status, last_error AS "lastError" FROM webhook_deliveries ORDER BY id DESC LIMIT 1`,
    );
    assert.equal(row?.status, "pending");
    assert.match(row?.lastError ?? "", /302/);
  },
);

test("(4) validateWebhookUrl: http production/IP nội bộ → ok:false", { skip: !HAS_TEST_DB }, async () => {
  const { validateWebhookUrl } = await import("@/lib/webhooks");
  // NODE_ENV là read-only trong @types/node mới → gán qua bản ghi động.
  const env = process.env as Record<string, string | undefined>;
  const origEnv = env.NODE_ENV;
  try {
    // https hợp lệ luôn qua
    assert.equal(validateWebhookUrl("https://vi-du.com/hook").ok, true);

    // production: http:// bị chặn
    env.NODE_ENV = "production";
    assert.equal(validateWebhookUrl("http://vi-du.com/hook").ok, false);
    // production: https vẫn qua
    assert.equal(validateWebhookUrl("https://vi-du.com/hook").ok, true);

    // IP private/loopback/link-local bị chặn (mọi môi trường)
    for (const bad of [
      "https://127.0.0.1/h",
      "https://10.0.0.5/h",
      "https://192.168.1.1/h",
      "https://172.16.0.9/h",
      "https://169.254.1.1/h",
      "https://localhost/h",
      "https://[::1]/h",
    ]) {
      assert.equal(validateWebhookUrl(bad).ok, false, `${bad} phải bị chặn`);
    }

    // dev: http:// cho phép (không production)
    env.NODE_ENV = "test";
    assert.equal(validateWebhookUrl("http://vi-du.com/hook").ok, true);

    // URL rác
    assert.equal(validateWebhookUrl("khong-phai-url").ok, false);
  } finally {
    env.NODE_ENV = origEnv;
  }
});

test(
  "(5) emitWebhook không throw khi không có webhook nào khớp (bảng rỗng)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { emitWebhook } = await import("@/lib/webhooks");
    const { run } = await import("@/lib/db");
    await run(`DELETE FROM webhook_deliveries`);
    await run(`DELETE FROM webhooks`);
    // Không throw, không tạo delivery.
    await emitWebhook("task.approved", 123, { taskId: 9 });
    await emitWebhook("variation.approved", null, { voId: 1 });
    const { query } = await import("@/lib/db");
    const rows = await query(`SELECT id FROM webhook_deliveries`);
    assert.equal(rows.length, 0);
  },
);
