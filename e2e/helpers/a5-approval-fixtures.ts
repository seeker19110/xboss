// A5-AC03: input riêng trong DB disposable; mọi tick/duyệt/huỷ đi qua HTTP thật.
import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { expect } from "@playwright/test";
import { E2E_DB } from "../constants";
import { dungToChucCoLap } from "./co-lap";

export type KetQuaHttpA5 = { status: number; body: Record<string, unknown> | null };
export type NguoiA5 = { id: number; name: string; email: string };
export type TaskA5 = { id: number; name: string; code: string; dimIds: number[] };
export type FixtureA5 = {
  orgId: number;
  projectId: number;
  sheetTypeId: number;
  sheetCode: string;
  slug: string;
  groupName: string;
  floorLabel: string;
  pm: [NguoiA5, NguoiA5];
  tasks: TaskA5[];
  pool: Pool;
};

export type TrangThaiA5 = {
  tasks: { id: number; progress: number; status: string; source: string | null }[];
  dims: { id: number; taskId: number; installed: number }[];
  history: {
    id: number;
    taskId: number;
    oldProgress: number;
    newProgress: number;
    status: string;
    note: string;
    changedBy: string;
  }[];
  floors: { id: number; approved: boolean; approvedBy: number | null }[];
};

export async function dungFixtureA5(): Promise<FixtureA5> {
  if (!E2E_DB) throw new Error("Fixture A5 chỉ dùng E2E_DATABASE_URL disposable");
  const co = await dungToChucCoLap(["pm"]);
  const h = randomBytes(6).toString("hex");
  const pool = new Pool({ connectionString: E2E_DB, max: 3 });
  const client = await pool.connect();
  const sheetCode = `A5${h}`;
  const slug = `a5-${h}`;
  const groupName = `Nhóm A5 ${h}`;
  const floorLabel = `T-${h}`;
  let failed = false;
  try {
    await client.query("BEGIN");
    const first = await client.query<NguoiA5>("SELECT id, name, email FROM users WHERE id = $1", [
      co.nguoi.pm.id,
    ]);
    // Hai PM khác ID/email, cùng mật khẩu TEST hợp lệ; không nhân role trong helper co-lap.
    const second = await client.query<NguoiA5>(
      `INSERT INTO users (name, email, password_hash, role, org_id)
       SELECT $1, $2, password_hash, 'pm', org_id FROM users WHERE id = $3
       RETURNING id, name, email`,
      [`PM thứ hai A5 ${h}`, `e2e-pm2-${h}@co-lap.test`, co.nguoi.pm.id],
    );
    await client.query("INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)", [
      second.rows[0].id,
      co.projectId,
    ]);
    const tower = await client.query<{ id: number }>(
      "INSERT INTO towers (project_id, name) VALUES ($1, $2) RETURNING id",
      [co.projectId, `Tháp A5 ${h}`],
    );
    const sheet = await client.query<{ id: number }>(
      `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES ($1, $2, $3, $4) RETURNING id`,
      [tower.rows[0].id, sheetCode, `Sheet A5 ${h}`, slug],
    );
    const wp = await client.query<{ id: number }>(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, sort_order)
       VALUES ($1, $2, $3, $4, 1) RETURNING id`,
      [sheet.rows[0].id, `PK${h}`, groupName, floorLabel],
    );
    const tasks: TaskA5[] = [];
    for (let i = 0; i < 2; i++) {
      const task = await client.query<{ id: number; name: string; code: string }>(
        `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
         VALUES ($1, $2, $3, $4, 0, 'chuan_bi') RETURNING id, name, code`,
        [wp.rows[0].id, `TK${h}-${i}`, `Task A5 ${h} ${i + 1}`, i + 1],
      );
      const dims = await client.query<{ id: number }>(
        `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order, installed)
         SELECT $1, 'D' || n, n, 0 FROM generate_series(1, 6) n RETURNING id`,
        [task.rows[0].id],
      );
      tasks.push({ ...task.rows[0], dimIds: dims.rows.map((d) => d.id).sort((a, b) => a - b) });
    }
    await client.query("COMMIT");
    return {
      orgId: co.orgId,
      projectId: co.projectId,
      sheetTypeId: sheet.rows[0].id,
      sheetCode,
      slug,
      groupName,
      floorLabel,
      pm: [first.rows[0], second.rows[0]],
      tasks,
      pool,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    failed = true;
    throw error;
  } finally {
    // Không DELETE audit/seed hoặc tắt trigger để dọn. Org/input cô lập được giữ đến khi
    // DB disposable bị huỷ, cùng quy ước co-lap/offline-deep; caller đóng context và pool.
    client.release();
    if (failed) await pool.end();
  }
}

export async function docTrangThaiA5(f: FixtureA5): Promise<TrangThaiA5> {
  const ids = f.tasks.map((t) => t.id);
  const [tasks, dims, history, floors] = await Promise.all([
    f.pool.query<TrangThaiA5["tasks"][number]>(
      `SELECT id, progress_percent AS progress, status, approval_source AS source
       FROM tasks WHERE id = ANY($1::int[]) ORDER BY id`,
      [ids],
    ),
    f.pool.query<TrangThaiA5["dims"][number]>(
      `SELECT id, task_id AS "taskId", installed
       FROM progress_dimensions WHERE task_id = ANY($1::int[]) ORDER BY id`,
      [ids],
    ),
    f.pool.query<TrangThaiA5["history"][number]>(
      `SELECT id, task_id AS "taskId", old_progress AS "oldProgress", new_progress AS "newProgress",
              status, note, changed_by AS "changedBy"
       FROM task_history WHERE task_id = ANY($1::int[]) ORDER BY id`,
      [ids],
    ),
    f.pool.query<TrangThaiA5["floors"][number]>(
      `SELECT id, is_approved AS approved, approved_by AS "approvedBy"
       FROM floor_approvals WHERE sheet_type_id = $1 AND floor_label = $2 ORDER BY id`,
      [f.sheetTypeId, f.floorLabel],
    ),
  ]);
  return { tasks: tasks.rows, dims: dims.rows, history: history.rows, floors: floors.rows };
}

type WaiterA5 = { pid: number; blockers: number[]; waitEvent: string | null };

/** Cây blocker gồm cả session xếp hàng sau session khác (row/transaction/advisory lock). */
async function docCayCho(observer: PoolClient, blockerPid: number): Promise<WaiterA5[]> {
  const r = await observer.query<WaiterA5>(
    `WITH RECURSIVE waiting(pid) AS (
       SELECT a.pid FROM pg_stat_activity a
       WHERE a.datname = current_database() AND $1::int = ANY(pg_blocking_pids(a.pid))
       UNION
       SELECT a.pid FROM pg_stat_activity a
       JOIN waiting w ON w.pid = ANY(pg_blocking_pids(a.pid))
       WHERE a.datname = current_database()
     )
     SELECT a.pid, pg_blocking_pids(a.pid) AS blockers, a.wait_event AS "waitEvent"
     FROM pg_stat_activity a JOIN waiting w ON w.pid = a.pid ORDER BY a.pid`,
    [blockerPid],
  );
  return r.rows;
}

/** Trả đường second → … → first bằng chính edges của một lần observer đọc. */
function timDuongCho(waiters: WaiterA5[], startPid: number, firstPid: number): number[] {
  const byPid = new Map(waiters.map((w) => [w.pid, w.blockers]));
  const paths: number[][] = [[startPid]];
  const seen = new Set<number>();
  while (paths.length) {
    const path = paths.shift()!;
    const pid = path[path.length - 1];
    if (pid === firstPid) return path;
    if (seen.has(pid)) continue;
    seen.add(pid);
    for (const blocker of byPid.get(pid) ?? []) {
      if (!seen.has(blocker)) paths.push([...path, blocker]);
    }
  }
  return [];
}

export async function dongThoiDuoiKhoa(
  f: FixtureA5,
  actions: [() => Promise<KetQuaHttpA5>, () => Promise<KetQuaHttpA5>],
  lockedTaskId: number,
  firstIndex?: 0 | 1,
) {
  if (!f.tasks.some((t) => t.id === lockedTaskId))
    throw new Error("Barrier A5 chỉ được khoá task thuộc fixture của ca");
  const locker = await f.pool.connect();
  let observer: PoolClient | undefined;
  const started: (Promise<PromiseSettledResult<KetQuaHttpA5>> | undefined)[] = [
    undefined,
    undefined,
  ];
  const start = (index: 0 | 1) => {
    // Gắn cả handler resolve/reject ngay khi khởi động, kể cả khi probe đầu thất bại.
    started[index] = Promise.resolve()
      .then(actions[index])
      .then(
        (value) => ({ status: "fulfilled", value }) as const,
        (reason: unknown) => ({ status: "rejected", reason }) as const,
      );
  };
  let transaction = false;
  let releaseError: Error | undefined;
  try {
    observer = await f.pool.connect();
    await locker.query("BEGIN");
    transaction = true;
    const pid = await locker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
    const blockerPid = pid.rows[0].pid;
    // Chỉ khoá task CHUNG của hai thao tác. Khoá cả A+B cho phép hai request đợi hai
    // row khác nhau: có overlap nhưng không bảo đảm thứ tự sau khi locker nhả.
    const locked = await locker.query<{ id: number }>(
      "SELECT id FROM tasks WHERE id = $1 FOR UPDATE",
      [lockedTaskId],
    );
    expect(locked.rows).toEqual([{ id: lockedTaskId }]);
    let firstWaiters: WaiterA5[] = [];
    let firstPid: number | null = null;
    let orderedChain: number[] = [];
    let waiters: WaiterA5[] = [];
    const probe = observer;
    if (firstIndex !== undefined) {
      start(firstIndex);
      await expect
        .poll(
          async () => {
            firstWaiters = await docCayCho(probe, blockerPid);
            return firstWaiters.length === 1 && firstWaiters[0].blockers.includes(blockerPid);
          },
          { timeout: 3_000, intervals: [25, 50, 100], message: "Request đầu phải thực sự chờ DB" },
        )
        .toBe(true);
      firstPid = firstWaiters[0].pid;
      // Chỉ gửi request thứ hai SAU bằng chứng request đã chọn đang chờ khoá task.
      start(firstIndex === 0 ? 1 : 0);
    } else {
      start(0);
      start(1);
    }
    await expect
      .poll(
        async () => {
          // Observer autocommit riêng: không giữ snapshot pg_stat_activity của transaction khoá.
          waiters = await docCayCho(probe, blockerPid);
          const count = new Set(waiters.map((w) => w.pid)).size;
          if (firstPid === null) return count;
          orderedChain = [];
          // Trong CÙNG snapshot, first vẫn đợi locker và second phải đợi first.
          // Hai waiter độc lập cùng đợi locker không chứng minh thứ tự, nên không nhả khoá.
          const first = waiters.filter((w) => w.pid === firstPid);
          if (first.length !== 1 || !first[0].blockers.includes(blockerPid)) return 0;
          for (const second of waiters) {
            if (second.pid === firstPid) continue;
            const path = timDuongCho(waiters, second.pid, firstPid);
            if (path.length >= 2) {
              orderedChain = path;
              break;
            }
          }
          return orderedChain.length >= 2 ? count : 0;
        },
        {
          timeout: firstIndex === undefined ? 7_500 : 4_500,
          intervals: [25, 50, 100],
          message:
            firstIndex === undefined
              ? "Hai request thật phải cùng chờ DB"
              : "Request thứ hai phải xếp sau request đầu trên cùng task",
        },
      )
      .toBeGreaterThanOrEqual(2);
    await locker.query("ROLLBACK");
    transaction = false;
    const outcomes = await Promise.all(started);
    const responses = outcomes.map((outcome) => {
      if (!outcome) throw new Error("Thiếu request trong barrier A5");
      if (outcome.status === "rejected") throw outcome.reason;
      return outcome.value;
    }) as [KetQuaHttpA5, KetQuaHttpA5];
    return {
      responses,
      barrier: {
        lockedTaskId,
        blockerPid,
        firstIndex: firstIndex ?? null,
        firstPid,
        firstWaiters,
        orderedChain,
        waiters,
      },
    };
  } finally {
    if (transaction) {
      try {
        await locker.query("ROLLBACK");
      } catch (error) {
        releaseError = error instanceof Error ? error : new Error(String(error));
      }
    }
    locker.release(releaseError);
    observer?.release();
    // Nhả khoá (hoặc huỷ connection lỗi) TRƯỚC khi thu mọi request đã khởi động, kể cả probe đỏ.
    await Promise.all(started);
  }
}
