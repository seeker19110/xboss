// A1-AC01: input cô lập 0% trong DB disposable; mọi thao tác cần kiểm chứng đi qua browser/HTTP.
import { randomBytes } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { Role } from "../../lib/nen/roles";
import { E2E_DB } from "../constants";
import { dungToChucCoLap } from "./co-lap";

export type NguoiA1 = { id: number; name: string; email: string; role: Role };
export type DuAnA1 = {
  id: number;
  name: string;
  code: string;
  sheetId: number;
  sheetCode: string;
  slug: string;
  groupName: string;
  taskId: number;
  taskCode: string;
  taskName: string;
};
export type ToChucA1 = {
  id: number;
  name: string;
  users: NguoiA1[];
  nguoi: Record<Role, NguoiA1>;
  projects: [DuAnA1, DuAnA1];
};
export type FixtureA1 = { orgs: [ToChucA1, ToChucA1]; pool: Pool };

const ROLES_A1: Role[] = ["admin", "pm", "engineer", "subcon", "bch", "cdt", "viewer"];

export async function dungFixtureA1(): Promise<FixtureA1> {
  if (!E2E_DB) throw new Error("Fixture A1 chỉ dùng E2E_DATABASE_URL disposable");
  const inputs = await Promise.all([dungToChucCoLap(ROLES_A1, 2), dungToChucCoLap(ROLES_A1, 2)]);
  const h = randomBytes(6).toString("hex");
  const pool = new Pool({ connectionString: E2E_DB, max: 2 });
  let client: PoolClient | undefined;
  let failed = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const orgs: ToChucA1[] = [];
    for (const [orgIndex, input] of inputs.entries()) {
      const org = await client.query<{ name: string }>(
        "SELECT name FROM organizations WHERE id = $1",
        [input.orgId],
      );
      const users = await client.query<NguoiA1>(
        "SELECT id, name, email, role FROM users WHERE org_id = $1 ORDER BY id",
        [input.orgId],
      );
      if (users.rows.length !== 7 || ROLES_A1.some((r) => !users.rows.some((u) => u.role === r)))
        throw new Error("Fixture A1 phải có đúng bảy role riêng trong mỗi org");
      const projects: DuAnA1[] = [];
      for (const [projectIndex, id] of input.duAn.entries()) {
        const suffix = `${h}-${orgIndex}-${projectIndex}`;
        const name = `Dự án A1 ${suffix}`;
        const code = `A1-${suffix}`;
        // Cùng sheet code ở bốn dự án: oracle phải dựa scope/sentinel, không chỉ tên tab.
        const sheetCode = `A1-${h}`;
        const slug = `a1-${suffix}`;
        const groupName = `Nhóm A1 ${suffix}`;
        const taskName = `Công việc A1 ${suffix}`;
        const taskCode = `TASK-${suffix}`;
        await client.query("UPDATE projects SET name = $1, code = $2 WHERE id = $3", [
          name,
          code,
          id,
        ]);
        const tower = await client.query<{ id: number }>(
          "INSERT INTO towers (project_id, name) VALUES ($1, $2) RETURNING id",
          [id, `Tháp A1 ${suffix}`],
        );
        const sheet = await client.query<{ id: number }>(
          `INSERT INTO sheet_types (tower_id, code, name, slug)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [tower.rows[0].id, sheetCode, `Sheet A1 ${suffix}`, slug],
        );
        const wp = await client.query<{ id: number }>(
          `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, sort_order)
           VALUES ($1, $2, $3, 'T1', 1) RETURNING id`,
          [sheet.rows[0].id, `PK-${suffix}`, groupName],
        );
        const task = await client.query<{ id: number }>(
          `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
           VALUES ($1, $2, $3, 1, 0, 'chuan_bi') RETURNING id`,
          [wp.rows[0].id, taskCode, taskName],
        );
        await client.query(
          `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order, installed)
           VALUES ($1, 'D1', 1, 0), ($1, 'D2', 2, 0)`,
          [task.rows[0].id],
        );
        projects.push({
          id,
          name,
          code,
          sheetId: sheet.rows[0].id,
          sheetCode,
          slug,
          groupName,
          taskId: task.rows[0].id,
          taskCode,
          taskName,
        });
      }
      orgs.push({
        id: input.orgId,
        name: org.rows[0].name,
        users: users.rows,
        nguoi: Object.fromEntries(users.rows.map((u) => [u.role, u])) as Record<Role, NguoiA1>,
        projects: projects as [DuAnA1, DuAnA1],
      });
    }
    await client.query("COMMIT");
    return { orgs: orgs as [ToChucA1, ToChucA1], pool };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    failed = true;
    throw error;
  } finally {
    client?.release();
    if (failed) await pool.end();
    // Giữ input/audit tới global-setup của DB disposable; caller đóng context và pool.
  }
}

export async function docNguoiA1(f: FixtureA1, id: number) {
  const r = await f.pool.query<{
    id: number;
    name: string;
    email: string;
    role: Role;
    orgId: number;
    disabledAt: Date | null;
    sessionVersion: number;
  }>(
    `SELECT id, name, email, role, org_id AS "orgId", disabled_at AS "disabledAt",
            session_version AS "sessionVersion" FROM users WHERE id = $1`,
    [id],
  );
  return r.rows;
}

/** Observer chỉ đọc các dòng business thuộc fixture, không audit/notification nền. */
export async function docNghiepVuA1(f: FixtureA1, org: ToChucA1) {
  const ids = org.projects.map((p) => p.id);
  const taskIds = org.projects.map((p) => p.taskId);
  const [projects, towers, sheets, packages, tasks, dims, history] = await Promise.all([
    f.pool.query("SELECT * FROM projects WHERE id = ANY($1::int[]) ORDER BY id", [ids]),
    f.pool.query("SELECT * FROM towers WHERE project_id = ANY($1::int[]) ORDER BY id", [ids]),
    f.pool.query("SELECT * FROM sheet_types WHERE project_id = ANY($1::int[]) ORDER BY id", [ids]),
    f.pool.query(
      `SELECT wp.* FROM work_packages wp JOIN sheet_types st ON st.id = wp.sheet_type_id
       WHERE st.project_id = ANY($1::int[]) ORDER BY wp.id`,
      [ids],
    ),
    f.pool.query("SELECT * FROM tasks WHERE id = ANY($1::int[]) ORDER BY id", [taskIds]),
    f.pool.query("SELECT * FROM progress_dimensions WHERE task_id = ANY($1::int[]) ORDER BY id", [
      taskIds,
    ]),
    f.pool.query("SELECT * FROM task_history WHERE task_id = ANY($1::int[]) ORDER BY id", [
      taskIds,
    ]),
  ]);
  return {
    projects: projects.rows,
    towers: towers.rows,
    sheets: sheets.rows,
    packages: packages.rows,
    tasks: tasks.rows,
    dims: dims.rows,
    history: history.rows,
  };
}
