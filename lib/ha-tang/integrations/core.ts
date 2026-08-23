// Khung tích hợp chung (M48 PR1) — engine đồng bộ đẩy/kéo thực thể local ↔ hệ ngoài,
// chuẩn hoá từ pattern đã chạy ổn của lib/material-sync.ts:
//   - Khoá chống chạy chồng tái dùng bảng sync_locks (M18), tên khoá riêng mỗi
//     (provider, dự án).
//   - Con trỏ tiến (sync_cursors.last_local_id) để mỗi lần chạy chỉ đẩy dòng LOCAL
//     mới hơn lần trước — idempotent, chạy lại không tạo remote_links trùng.
//   - Ánh xạ local ↔ khoá hệ ngoài lưu ở remote_links (PK 3 cột → UPSERT idempotent).
//   - Mỗi lần chạy ghi 1 hàng integration_runs (running → ok/error) để trang admin theo dõi.
//
// Khung KHÔNG hard-code bảng nghiệp vụ nào: adapter tự biết truy vấn bảng nào qua
// fetchRows (giữ core tách biệt domain). PR1 chưa đăng ký adapter thật nào — đúng thiết
// kế "khung trước, adapter sau"; adapter thật (kế toán, hoá đơn điện tử) bổ sung ở PR sau.
import { query, queryOne, run } from "@/lib/db";

export type Row = Record<string, unknown>;
// Nội dung cột integrations.config — KHÔNG chứa secret, chỉ tham số không nhạy
// cảm (API key/token đọc từ biến môi trường, xem migrations/0057_integrations.sql).
export type Config = Record<string, unknown>;
export type PushResult = { remoteKey: string; remoteStatus?: string } | { error: string };
export type Link = { entityId: number; remoteKey: string; remoteStatus: string | null };
export type StatusUpdate = { entityId: number; remoteStatus: string };
export type RunSummary = {
  ok: boolean;
  stats: Record<string, { pushed: number; pulled: number; errors: number }>;
  error?: string;
};

export type Adapter = {
  provider: string;
  pushEntities: string[];
  // Lấy các dòng LOCAL mới hơn cursor để đẩy đi — mỗi entity do adapter tự biết truy vấn
  // bảng nào. Trả về rỗng khi hết dữ liệu mới. `row.id` (number) BẮT BUỘC có để làm
  // last_local_id con trỏ tiến. Nên trả về theo id tăng dần.
  fetchRows(entity: string, projectId: number, sinceId: number | null): Promise<Row[]>;
  // push trả mảng kết quả 1-1 theo thứ tự với `rows`.
  push(entity: string, rows: Row[], cfg: Config): Promise<PushResult[]>;
  pullStatus?(entity: string, links: Link[], cfg: Config): Promise<StatusUpdate[]>;
};

// ── Registry adapter ─────────────────────────────────────────────────────────
const registry = new Map<string, Adapter>();

/** Đăng ký adapter cho 1 provider — ghi đè nếu trùng (test tiện re-register). */
export function registerAdapter(adapter: Adapter): void {
  registry.set(adapter.provider, adapter);
}

export function getAdapter(provider: string): Adapter | undefined {
  return registry.get(provider);
}

// ── Khoá chống chạy chồng (tái dùng sync_locks, M18) ─────────────────────────
async function acquireLock(name: string): Promise<boolean> {
  const row = await queryOne<{ name: string }>(
    `INSERT INTO sync_locks (name, locked_at) VALUES (?, NOW())
     ON CONFLICT (name) DO UPDATE SET locked_at = NOW()
       WHERE sync_locks.locked_at IS NULL OR sync_locks.locked_at < NOW() - INTERVAL '10 minutes'
     RETURNING name`,
    name,
  );
  return !!row;
}

const releaseLock = (name: string) =>
  run(`UPDATE sync_locks SET locked_at = NULL WHERE name = ?`, name);

type Stat = { pushed: number; pulled: number; errors: number };
const emptyStat = (): Stat => ({ pushed: 0, pulled: 0, errors: 0 });

// row.id BẮT BUỘC là number — dòng thiếu id không tiến được cursor nên bị loại sớm.
function rowId(row: Row): number | null {
  const v = row.id;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Chạy 1 lần đồng bộ cho (provider, projectId). Không throw ra ngoài với lỗi nghiệp vụ
 * dự kiến (chưa đăng ký adapter / chưa bật / đang khoá) — trả RunSummary.ok=false kèm
 * error để route trả JSON 422 thay vì 500.
 */
export async function runSync(provider: string, projectId: number): Promise<RunSummary> {
  const adapter = getAdapter(provider);
  if (!adapter) return { ok: false, stats: {}, error: "Chưa đăng ký adapter cho provider này" };

  const integration = await queryOne<{ id: number; config: Config; active: boolean }>(
    `SELECT id, config, active FROM integrations WHERE provider = ? AND project_id = ?`,
    provider,
    projectId,
  );
  if (!integration || !integration.active)
    return { ok: false, stats: {}, error: "Tích hợp chưa được bật" };

  const lockName = `integration:${provider}:${projectId}`;
  if (!(await acquireLock(lockName)))
    return { ok: false, stats: {}, error: "Đang đồng bộ, thử lại sau" };

  const integrationId = integration.id;
  const config = integration.config ?? {};
  const stats: Record<string, Stat> = {};

  // Ghi hàng integration_runs 'running' — luôn cập nhật status/finished_at lúc kết thúc
  // (kể cả lỗi tổng) để không treo hàng 'running' mãi.
  const runRow = await queryOne<{ id: number }>(
    `INSERT INTO integration_runs (integration_id, status) VALUES (?, 'running') RETURNING id`,
    integrationId,
  );
  const runId = runRow!.id;

  try {
    try {
      for (const entity of adapter.pushEntities) {
        stats[entity] = stats[entity] ?? emptyStat();

        // 1) Con trỏ tiến hiện tại của entity.
        const cursor = await queryOne<{ lastLocalId: number | null }>(
          `SELECT last_local_id AS "lastLocalId" FROM sync_cursors
            WHERE integration_id = ? AND entity = ?`,
          integrationId,
          entity,
        );
        const sinceId = cursor?.lastLocalId ?? null;

        // 2) Lấy các dòng local mới hơn cursor.
        const rows = await adapter.fetchRows(entity, projectId, sinceId);
        if (rows.length) {
          // 3) Đẩy đi — lỗi TỪNG dòng không chặn cả batch.
          const results = await adapter.push(entity, rows, config);

          // Đẩy các dòng THÀNH CÔNG LIÊN TỤC từ đầu batch. Gặp dòng lỗi (hoặc dòng thiếu
          // id — không làm mốc cursor được) đầu tiên thì DỪNG: cursor không vượt qua dòng
          // đó nên fetchRows sẽ trả lại dòng lỗi + các dòng sau ở lần chạy kế tiếp ("đẩy
          // lại lần sau"). Lỗi 1 dòng không panic cả runSync — chỉ đếm errors rồi dừng
          // entity này, sang entity kế. (Không đếm/đẩy các dòng SAU dòng lỗi trong lần này.)
          let advanceTo: number | null = sinceId;
          for (let i = 0; i < rows.length; i++) {
            const res = results[i];
            const id = rowId(rows[i]);
            if (!res || "error" in res || id == null) {
              stats[entity].errors++;
              break;
            }
            await run(
              `INSERT INTO remote_links
                 (entity_type, entity_id, integration_id, remote_key, remote_status, synced_at)
               VALUES (?, ?, ?, ?, ?, NOW())
               ON CONFLICT (entity_type, entity_id, integration_id)
               DO UPDATE SET remote_key = EXCLUDED.remote_key,
                             remote_status = EXCLUDED.remote_status, synced_at = NOW()`,
              entity,
              id,
              integrationId,
              res.remoteKey,
              res.remoteStatus ?? null,
            );
            stats[entity].pushed++;
            advanceTo = id;
          }

          // 4) Cập nhật con trỏ tới dòng thành công liên tục cuối cùng.
          if (advanceTo != null && advanceTo !== sinceId) {
            await run(
              `INSERT INTO sync_cursors (integration_id, entity, last_local_id, last_at)
               VALUES (?, ?, ?, NOW())
               ON CONFLICT (integration_id, entity)
               DO UPDATE SET last_local_id = EXCLUDED.last_local_id, last_at = NOW()`,
              integrationId,
              entity,
              advanceTo,
            );
          }
        }

        // 5) Kéo trạng thái hệ ngoài về nếu adapter hỗ trợ.
        if (adapter.pullStatus) {
          const links = await query<Link>(
            `SELECT entity_id AS "entityId", remote_key AS "remoteKey",
                    remote_status AS "remoteStatus"
               FROM remote_links WHERE integration_id = ? AND entity_type = ?`,
            integrationId,
            entity,
          );
          if (links.length) {
            const updates = await adapter.pullStatus(entity, links, config);
            for (const u of updates) {
              await run(
                `UPDATE remote_links SET remote_status = ?, synced_at = NOW()
                  WHERE entity_type = ? AND entity_id = ? AND integration_id = ?`,
                u.remoteStatus,
                entity,
                u.entityId,
                integrationId,
              );
              stats[entity].pulled++;
            }
          }
        }
      }
    } catch (e) {
      // Lỗi tổng (vd adapter throw) → ghi run 'error' trước khi trả về, không để treo 'running'.
      const msg = e instanceof Error ? e.message : "Lỗi đồng bộ tích hợp";
      await run(
        `UPDATE integration_runs SET status = 'error', finished_at = NOW(), stats = ?, error = ?
          WHERE id = ?`,
        JSON.stringify(stats),
        msg,
        runId,
      );
      return { ok: false, stats, error: msg };
    }

    await run(
      `UPDATE integration_runs SET status = 'ok', finished_at = NOW(), stats = ? WHERE id = ?`,
      JSON.stringify(stats),
      runId,
    );
    return { ok: true, stats };
  } finally {
    await releaseLock(lockName);
  }
}
