import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
// import type bị xoá lúc biên dịch (không kéo lib/db) — an toàn ở đầu file.
import type { Row, PushResult } from "@/lib/integrations/core";

// Test khung tích hợp chung (M48 PR1, lib/integrations/core.ts). Dùng adapter GIẢ in-memory
// (không phụ thuộc nhà cung cấp thật nào) + tích hợp thật với TEST_DATABASE_URL. Tự skip nếu
// không có TEST_DATABASE_URL (giống recompute.test.ts).
//
// Quyết định về adapter giả (trong ranh giới brief cho phép tự quyết):
//  (a) fetchRows: giữ 1 mảng Row[] cứng trong bộ nhớ với id tăng dần; mỗi lần gọi trả về
//      các dòng có id > sinceId (sinceId null → toàn bộ), đã sắp id tăng — mô phỏng đúng
//      "lấy dòng local mới hơn con trỏ". Cách này để kiểm cursor tiến/không tiến trực tiếp.
//  (b) tranh khoá đồng thời: push của adapter chờ 1 "cổng" (deferred) do test điều khiển,
//      nên lần chạy A giữ khoá (đang kẹt trong push) trong khi test khởi động lần chạy B —
//      B gọi acquireLock thất bại và trả lỗi ngay (không đợi cổng). Verify tranh khoá thật
//      sự chứ không dựa may rủi thời điểm.

type Deferred = { promise: Promise<void>; resolve: () => void };
function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

test(
  "runSync: provider chưa đăng ký → lỗi rõ ràng, không throw",
  { skip: !HAS_TEST_DB },
  async () => {
    const { runSync } = await import("@/lib/integrations/core");
    const res = await runSync("khong-ton-tai-provider", 999999);
    assert.equal(res.ok, false);
    assert.match(res.error ?? "", /adapter/i);
  },
);

// Tạo 1 project + 1 integration active cho provider, trả integrationId + projectId.
async function setupIntegration(
  provider: string,
): Promise<{ integrationId: number; projectId: number }> {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test tích hợp')`);
  const integrationId = await insertId(
    `INSERT INTO integrations (provider, project_id, config, active) VALUES (?, ?, '{}', true)`,
    provider,
    projectId,
  );
  return { integrationId, projectId };
}

test(
  "runSync (1): chạy lần đầu — cursor tiến tới id dòng cuối, remote_links đủ, run status ok",
  { skip: !HAS_TEST_DB },
  async () => {
    const { registerAdapter, runSync } = await import("@/lib/integrations/core");
    const { queryOne, query } = await import("@/lib/db");

    const provider = "fake_ok";
    const { integrationId, projectId } = await setupIntegration(provider);

    // 3 dòng id 1..3 (id local giả — không đụng bảng nghiệp vụ nào).
    const allRows: Row[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
    ];
    registerAdapter({
      provider,
      pushEntities: ["hoa_don"],
      async fetchRows(_entity, _projectId, sinceId) {
        return allRows.filter((r) => (sinceId == null ? true : (r.id as number) > sinceId));
      },
      async push(_entity, rows): Promise<PushResult[]> {
        return rows.map((r) => ({ remoteKey: `R${r.id}` }));
      },
    });

    const res = await runSync(provider, projectId);
    assert.equal(res.ok, true);
    assert.equal(res.stats.hoa_don.pushed, 3);
    assert.equal(res.stats.hoa_don.errors, 0);

    const cursor = await queryOne<{ lastLocalId: number }>(
      `SELECT last_local_id AS "lastLocalId" FROM sync_cursors WHERE integration_id = ? AND entity = 'hoa_don'`,
      integrationId,
    );
    assert.equal(Number(cursor?.lastLocalId), 3);

    const links = await query<{ entityId: number; remoteKey: string }>(
      `SELECT entity_id AS "entityId", remote_key AS "remoteKey" FROM remote_links
        WHERE integration_id = ? AND entity_type = 'hoa_don' ORDER BY entity_id`,
      integrationId,
    );
    assert.equal(links.length, 3);
    assert.deepEqual(
      links.map((l) => l.remoteKey),
      ["R1", "R2", "R3"],
    );

    const runRow = await queryOne<{ status: string }>(
      `SELECT status FROM integration_runs WHERE integration_id = ? ORDER BY started_at DESC LIMIT 1`,
      integrationId,
    );
    assert.equal(runRow?.status, "ok");
  },
);

test(
  "runSync (2): chạy lại không có dòng mới — không tạo remote_links trùng, pushed=0",
  { skip: !HAS_TEST_DB },
  async () => {
    const { registerAdapter, runSync } = await import("@/lib/integrations/core");
    const { queryOne } = await import("@/lib/db");

    const provider = "fake_rerun";
    const { integrationId, projectId } = await setupIntegration(provider);

    const allRows: Row[] = [
      { id: 10, name: "x" },
      { id: 11, name: "y" },
    ];
    registerAdapter({
      provider,
      pushEntities: ["chung_tu"],
      async fetchRows(_e, _p, sinceId) {
        return allRows.filter((r) => (sinceId == null ? true : (r.id as number) > sinceId));
      },
      async push(_e, rows): Promise<PushResult[]> {
        return rows.map((r) => ({ remoteKey: `K${r.id}` }));
      },
    });

    const first = await runSync(provider, projectId);
    assert.equal(first.stats.chung_tu.pushed, 2);

    const second = await runSync(provider, projectId);
    assert.equal(second.ok, true);
    assert.equal(second.stats.chung_tu.pushed, 0);

    const cnt = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM remote_links WHERE integration_id = ? AND entity_type = 'chung_tu'`,
      integrationId,
    );
    assert.equal(Number(cnt?.n), 2); // vẫn đúng 2, không nhân đôi
  },
);

test(
  "runSync (3): 1 dòng giữa batch lỗi — dòng lỗi + các dòng sau không vào remote_links, cursor không vượt qua",
  { skip: !HAS_TEST_DB },
  async () => {
    const { registerAdapter, runSync } = await import("@/lib/integrations/core");
    const { queryOne, query } = await import("@/lib/db");

    const provider = "fake_err";
    const { integrationId, projectId } = await setupIntegration(provider);

    // 4 dòng id 1..4; dòng thứ 2 (id 2) lỗi → 1,  dừng cursor tại 1, dòng 3&4 bị đẩy lại lần sau.
    const allRows: Row[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 3, name: "c" },
      { id: 4, name: "d" },
    ];
    registerAdapter({
      provider,
      pushEntities: ["ke_toan"],
      async fetchRows(_e, _p, sinceId) {
        return allRows.filter((r) => (sinceId == null ? true : (r.id as number) > sinceId));
      },
      async push(_e, rows): Promise<PushResult[]> {
        return rows.map((r) =>
          r.id === 2 ? { error: "giả lập lỗi dòng 2" } : { remoteKey: `R${r.id}` },
        );
      },
    });

    const res = await runSync(provider, projectId);
    assert.equal(res.ok, true); // lỗi 1 dòng không panic cả runSync
    assert.equal(res.stats.ke_toan.errors, 1);
    // Chỉ dòng 1 (thành công, trước dòng lỗi) được đẩy; gặp dòng lỗi id 2 thì DỪNG —
    // dòng 3,4 để lại lần chạy sau (cursor chưa vượt qua id 2).
    assert.equal(res.stats.ke_toan.pushed, 1);

    const links = await query<{ entityId: number }>(
      `SELECT entity_id AS "entityId" FROM remote_links WHERE integration_id = ? AND entity_type = 'ke_toan' ORDER BY entity_id`,
      integrationId,
    );
    assert.deepEqual(
      links.map((l) => Number(l.entityId)),
      [1],
    );

    const cursor = await queryOne<{ lastLocalId: number }>(
      `SELECT last_local_id AS "lastLocalId" FROM sync_cursors WHERE integration_id = ? AND entity = 'ke_toan'`,
      integrationId,
    );
    assert.equal(Number(cursor?.lastLocalId), 1); // không vượt qua dòng lỗi id 2
  },
);

test(
  "runSync (4): 2 lệnh gọi đồng thời cùng (provider, projectId) — 1 cái bị khoá trả ok:false",
  { skip: !HAS_TEST_DB },
  async () => {
    const { registerAdapter, runSync } = await import("@/lib/integrations/core");

    const provider = "fake_lock";
    const { projectId } = await setupIntegration(provider);

    const fetchCalled = deferred(); // resolve khi A đã vào fetchRows (đã giữ khoá)
    const releaseGate = deferred(); // A kẹt trong push cho tới khi test mở cổng
    let fetchSignaled = false;

    registerAdapter({
      provider,
      pushEntities: ["hoa_don"],
      async fetchRows(): Promise<Row[]> {
        if (!fetchSignaled) {
          fetchSignaled = true;
          fetchCalled.resolve();
        }
        return [{ id: 1, name: "a" }];
      },
      async push(_e, rows): Promise<PushResult[]> {
        await releaseGate.promise; // giữ khoá đến khi test cho phép
        return rows.map((r) => ({ remoteKey: `R${r.id}` }));
      },
    });

    // A khởi động: acquireLock thành công → fetchRows (resolve fetchCalled) → push (kẹt ở cổng).
    const a = runSync(provider, projectId);
    await fetchCalled.promise; // đảm bảo A đang giữ khoá trước khi B thử

    // B: acquireLock thất bại (A đang giữ) → trả lỗi ngay, không đợi cổng.
    const b = await runSync(provider, projectId);
    assert.equal(b.ok, false);
    assert.match(b.error ?? "", /đồng bộ/i);

    releaseGate.resolve(); // cho A hoàn tất
    const aRes = await a;
    assert.equal(aRes.ok, true);
  },
);
