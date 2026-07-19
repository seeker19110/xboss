import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import dns from "node:dns";
import http from "node:http";

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

      const row: { status: string; attempts: number; diffMin: number } | undefined = await queryOne(
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

test(
  "(4) validateWebhookUrl: http production/IP nội bộ → ok:false",
  { skip: !HAS_TEST_DB },
  async () => {
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
  },
);

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

// ===== M63 — chống SSRF DNS rebinding: isPrivateIp mở rộng + safeLookup pin IP =====
// Unit thuần, không cần TEST_DATABASE_URL (isPrivateIp không chạm DB).

test("(6) isPrivateIp: bảng ca đủ các dải IPv4/IPv6 (mỗi dải 1 IP trong + 1 IP ngoài biên)", async () => {
  const { isPrivateIp } = await import("@/lib/webhooks");

  const cases: Array<[string, boolean, string]> = [
    // IPv4
    ["0.0.0.1", true, "0.0.0.0/8"],
    ["1.0.0.1", false, "ngoài 0.0.0.0/8"],
    ["10.1.2.3", true, "10.0.0.0/8"],
    ["11.0.0.1", false, "ngoài 10.0.0.0/8"],
    ["127.0.0.1", true, "loopback 127.0.0.0/8"],
    ["126.255.255.255", false, "ngoài loopback"],
    ["169.254.1.1", true, "link-local 169.254.0.0/16"],
    ["169.253.255.255", false, "ngoài link-local"],
    ["172.16.0.1", true, "172.16.0.0/12"],
    ["172.15.255.255", false, "ngoài 172.16.0.0/12 (dưới)"],
    ["172.32.0.0", false, "ngoài 172.16.0.0/12 (trên)"],
    ["192.168.1.1", true, "192.168.0.0/16"],
    ["192.167.255.255", false, "ngoài 192.168.0.0/16"],
    ["100.64.0.1", true, "CGNAT 100.64.0.0/10"],
    ["100.63.255.255", false, "ngoài CGNAT (dưới)"],
    ["100.128.0.0", false, "ngoài CGNAT (trên)"],
    ["192.0.0.5", true, "192.0.0.0/24"],
    ["192.0.1.0", false, "ngoài 192.0.0.0/24"],
    ["198.18.5.5", true, "benchmark 198.18.0.0/15"],
    ["198.19.5.5", true, "benchmark 198.18.0.0/15 (nửa trên)"],
    ["198.17.255.255", false, "ngoài benchmark (dưới)"],
    ["198.20.0.0", false, "ngoài benchmark (trên)"],
    ["224.0.0.1", true, "multicast 224.0.0.0/4"],
    ["240.0.0.1", true, "reserved 240.0.0.0/4"],
    ["255.255.255.255", true, "broadcast"],
    ["223.255.255.255", false, "ngoài multicast/reserved"],
    ["8.8.8.8", false, "public thường"],
    // IPv6
    ["::1", true, "loopback"],
    ["::", true, "unspecified"],
    ["fe80::1", true, "link-local fe80::/10"],
    ["fe7f::1", false, "ngoài fe80::/10 (dưới)"],
    ["fec0::1", false, "ngoài fe80::/10 (trên)"],
    ["fc00::1", true, "unique-local fc00::/7"],
    ["fdff::1", true, "unique-local fc00::/7 (nửa trên)"],
    ["fbff::1", false, "ngoài fc00::/7 (dưới)"],
    ["fe00::1", false, "ngoài fc00::/7 (trên)"],
    ["::ffff:127.0.0.1", true, "IPv4-mapped loopback"],
    ["::ffff:8.8.8.8", false, "IPv4-mapped public"],
    ["2606:4700::1", false, "IPv6 public (Cloudflare)"],
    // Không phải IP → domain, cho qua
    ["vi-du.com", false, "domain thường"],
    ["khong-phai-ip", false, "chuỗi rác"],
  ];

  for (const [host, want, label] of cases) {
    assert.equal(isPrivateIp(host), want, `${host} (${label}) phải = ${want}`);
  }
});

test("(7) safeLookup: fail-closed khi lẫn IP private, propagate lỗi resolve, OK khi toàn public", async () => {
  const { safeLookup } = await import("@/lib/webhooks");
  const origLookup = dns.promises.lookup;
  try {
    // (a) toàn IP public → trả đúng danh sách.
    dns.promises.lookup = (async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "1.1.1.1", family: 4 },
    ]) as unknown as typeof dns.promises.lookup;
    await new Promise<void>((resolve, reject) => {
      safeLookup("public.test", { all: true }, (err, addresses) => {
        try {
          assert.equal(err, null);
          assert.deepEqual(
            (addresses as { address: string }[]).map((a) => a.address),
            ["8.8.8.8", "1.1.1.1"],
          );
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    // (b) lẫn 1 IP private trong nhiều IP public → lỗi (fail-closed).
    dns.promises.lookup = (async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]) as unknown as typeof dns.promises.lookup;
    await new Promise<void>((resolve, reject) => {
      safeLookup("rebind.test", { all: true }, (err) => {
        try {
          assert.ok(err, "phải có lỗi khi lẫn IP private");
          assert.match(err!.message, /nội bộ/);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });

    // (c) resolve lỗi → propagate lỗi.
    dns.promises.lookup = (async () => {
      throw new Error("ENOTFOUND boom");
    }) as unknown as typeof dns.promises.lookup;
    await new Promise<void>((resolve, reject) => {
      safeLookup("notfound.test", { all: true }, (err) => {
        try {
          assert.ok(err);
          assert.match(err!.message, /ENOTFOUND/);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  } finally {
    dns.promises.lookup = origLookup;
  }
});

test(
  "(8) sendOne qua deliverDueWebhooks: hostname rebind về IP nội bộ (mock DNS) bị chặn ở tầng connect",
  { skip: !HAS_TEST_DB },
  async () => {
    // Dựng HTTP server cục bộ để chứng minh: NẾU safeLookup không chặn, request này sẽ tới
    // được server thật (port cục bộ) — nhưng vì domain giả "rebind-alias.test" được mock DNS
    // trỏ về 127.0.0.1 (địa chỉ nội bộ), safeLookup phải chặn TRƯỚC khi kết nối, nên server
    // này không bao giờ nhận request.
    let serverHit = false;
    const server = http.createServer((_req, res) => {
      serverHit = true;
      res.writeHead(200).end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    const origLookup = dns.promises.lookup;
    dns.promises.lookup = (async (hostname: string) => {
      if (hostname === "rebind-alias.test") return [{ address: "127.0.0.1", family: 4 }];
      return origLookup(hostname, { all: true } as never) as unknown as Promise<
        { address: string; family: number }[]
      >;
    }) as unknown as typeof dns.promises.lookup;

    try {
      const { emitWebhook, deliverDueWebhooks } = await import("@/lib/webhooks");
      const { run, queryOne } = await import("@/lib/db");
      const { userId, projectId } = await freshEnv();
      await makeWebhook({
        userId,
        projectId,
        events: ["ping"],
        url: `http://rebind-alias.test:${port}/hook`,
      });
      await emitWebhook("ping", projectId, { hello: "rebind" });

      const res = await deliverDueWebhooks();
      assert.equal(res.sent, 0);
      assert.equal(res.failed, 1);
      assert.equal(serverHit, false, "server cục bộ KHÔNG được nhận request — chặn ở tầng connect");

      const row = await queryOne<{ status: string; lastError: string }>(
        `SELECT status, last_error AS "lastError" FROM webhook_deliveries ORDER BY id DESC LIMIT 1`,
      );
      assert.equal(row?.status, "pending", "tính là 1 lần thử thất bại bình thường, đi backoff");
      assert.match(row?.lastError ?? "", /nội bộ/, "last_error phải nêu rõ lý do chặn");

      await run(`DELETE FROM webhook_deliveries`);
      await run(`DELETE FROM webhooks`);
    } finally {
      dns.promises.lookup = origLookup;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
