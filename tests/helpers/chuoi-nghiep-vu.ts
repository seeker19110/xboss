// Fixture dùng chung cho bộ hồi quy CHUỖI NGHIỆP VỤ (QUALITY-FINAL-1 S13a, A5).
//
// Nguyên tắc (TRAPS.md §6, A5 §6):
//   - Trạng thái nghiệp vụ (tick, nghiệm thu, lập/trình/duyệt IPC, phiếu thanh toán) đi qua
//     ROUTE HANDLER THẬT với đúng người bấm — helper này KHÔNG dựng trạng thái giữa chừng.
//   - Chỉ dữ liệu ĐẦU VÀO được chèn bằng SQL tối thiểu đúng ràng buộc schema: cây WBS
//     (dự án → tháp → sheet → nhóm → task → ô), hệ (systems), và liên kết dòng BOQ ↔ hợp đồng
//     (không route nào ghi `boq_items.contract_id` — import/seed là đường thật duy nhất).
//   - User là user THẬT (id do DB cấp, không id cứng — `npm run check:test-fk-ids`).
//   - `don()` dọn sạch mọi thứ đã tạo theo đúng thứ tự khoá ngoại, kể cả khi assert đỏ.
//
// File này import `./phien` (mock `next/headers`) nên file test phải import `./setup` TRƯỚC.
import { NextRequest } from "next/server";
import type { Role } from "@/lib/nen/roles";
import { dangNhapDuAn, type NguoiDungTest } from "./phien";

const RUN = Date.now().toString(36);
let seq = 0;
/** Chuỗi duy nhất cho mỗi lần chạy — tránh đụng mã unique của file test chạy song song. */
export const uniq = (ten: string): string => `${ten}${RUN}${++seq}`;

/** Header chọn định dạng tiền exact (A3-FR06) — so tiền bằng chuỗi, không qua float. */
export const TIEN_EXACT = { "X-XBoss-Money-Format": "decimal-string-v1" } as const;

export function jreq(
  url: string,
  body?: unknown,
  method = "POST",
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
  });
}

/** Tham số động `{ params }` của route `[id]`. */
export const P = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

export type NguoiTest = NguoiDungTest & { role: Role; name: string };

export type CayWbs = {
  towerId: number;
  sheetTypeId: number;
  packageId: number;
  taskId: number;
  dims: number[];
};

/**
 * Sổ ghi mọi thứ một ca test tạo ra. Mỗi ca dùng MỘT instance riêng và gọi `don()` trong
 * `finally` — không chia sẻ trạng thái giữa các ca (todo đỏ không làm bẩn ca sau).
 */
export class SoFixture {
  private users: number[] = [];
  private projects: number[] = [];
  private systems: number[] = [];

  async user(role: Role): Promise<NguoiTest> {
    const { insertId } = await import("@/lib/db");
    const name = `S13a ${role}`;
    const id = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id)
       VALUES (?, ?, 'hash-test-s13a', ?, 1)`,
      name,
      `s13a-${uniq(role)}@test.local`,
      role,
    );
    this.users.push(id);
    return { id, passwordHash: "hash-test-s13a", orgId: 1, role, name };
  }

  async duAn(ten: string): Promise<number> {
    const { insertId } = await import("@/lib/db");
    const id = await insertId(`INSERT INTO projects (name) VALUES (?)`, `S13a ${uniq(ten)}`);
    this.projects.push(id);
    return id;
  }

  /** Hệ riêng của ca — checklist QA/BOQ gắn hệ này không ảnh hưởng dữ liệu file test khác. */
  async heThong(): Promise<number> {
    const { insertId } = await import("@/lib/db");
    const id = await insertId(
      `INSERT INTO systems (code, name) VALUES (?, 'Hệ S13a')`,
      uniq("HS13A"),
    );
    this.systems.push(id);
    return id;
  }

  /** Cây WBS tối thiểu: 1 tháp → 1 sheet → 1 nhóm → 1 task chưa tick với `soO` ô dimension. */
  async wbs(
    projectId: number,
    opts: { soO: number; systemId?: number | null; floorLabel?: string | null },
  ): Promise<CayWbs> {
    const { insertId, query } = await import("@/lib/db");
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S13a')`,
      projectId,
    );
    const ma = uniq("S13A");
    const sheetTypeId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, slug, system_id)
       VALUES (?, ?, 'Sheet S13a', ?, ?)`,
      towerId,
      ma,
      ma.toLowerCase(),
      opts.systemId ?? null,
    );
    const packageId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, sort_order, floor_label)
       VALUES (?, ?, 'Nhóm S13a', 1, ?)`,
      sheetTypeId,
      uniq("PK"),
      opts.floorLabel ?? null,
    );
    const taskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
       VALUES (?, ?, 'Task S13a', 1, 0, 'chuan_bi')`,
      packageId,
      uniq("TK"),
    );
    const rows = await query<{ id: number }>(
      `INSERT INTO progress_dimensions (task_id, dimension_label, installed)
       SELECT ?, 'O' || g, 0 FROM generate_series(1, ?::int) g
       RETURNING id`,
      taskId,
      opts.soO,
    );
    return {
      towerId,
      sheetTypeId,
      packageId,
      taskId,
      dims: rows.map((r) => r.id).sort((a, b) => a - b),
    };
  }

  /** Đăng nhập (cookie ký thật) + gán thành viên dự án. */
  async vao(u: NguoiTest, projectId: number | null): Promise<void> {
    await dangNhapDuAn(u, projectId);
  }

  async don(): Promise<void> {
    const { query, run } = await import("@/lib/db");
    for (const pid of this.projects) {
      const contracts = (
        await query<{ id: number }>(`SELECT id FROM contracts WHERE project_id = ?`, pid)
      ).map((r) => r.id);
      const tasks = (
        await query<{ id: number }>(
          `SELECT t.id FROM tasks t
             JOIN work_packages wp ON wp.id = t.package_id
             JOIN sheet_types st ON st.id = wp.sheet_type_id
             JOIN towers tw ON tw.id = st.tower_id
            WHERE tw.project_id = ?`,
          pid,
        )
      ).map((r) => r.id);
      await run(
        `DELETE FROM payment_bills
          WHERE project_id = ? OR contract_id = ANY(?::int[])
             OR payment_cert_id IN (SELECT id FROM payment_certs WHERE contract_id = ANY(?::int[]))`,
        pid,
        contracts,
        contracts,
      );
      // Snapshot quyết định IPC (S13c) bất biến ở tầng app — chỉ fixture (owner) được dọn.
      await run(
        `DELETE FROM payment_cert_decision_snapshots WHERE project_id = ? OR contract_id = ANY(?::int[])`,
        pid,
        contracts,
      );
      await run(`DELETE FROM approval_requests WHERE project_id = ?`, pid);
      await run(`DELETE FROM approval_flows WHERE project_id = ?`, pid);
      await run(`DELETE FROM payment_certs WHERE contract_id = ANY(?::int[])`, contracts);
      await run(
        `DELETE FROM boq_items WHERE project_id = ? OR contract_id = ANY(?::int[])`,
        pid,
        contracts,
      );
      await run(`DELETE FROM contracts WHERE project_id = ?`, pid);
      await run(`DELETE FROM notifications WHERE task_id = ANY(?::int[])`, tasks);
      await run(`DELETE FROM task_history WHERE task_id = ANY(?::int[])`, tasks);
      await run(`DELETE FROM progress_dimensions WHERE task_id = ANY(?::int[])`, tasks);
      await run(
        `DELETE FROM floor_approvals
          WHERE sheet_type_id IN (SELECT st.id FROM sheet_types st
                                    JOIN towers tw ON tw.id = st.tower_id
                                   WHERE tw.project_id = ?)`,
        pid,
      );
      await run(`DELETE FROM tasks WHERE id = ANY(?::int[])`, tasks); // qc_inspections cascade
      await run(`DELETE FROM qc_checklists WHERE project_id = ?`, pid);
      await run(
        `DELETE FROM work_packages
          WHERE sheet_type_id IN (SELECT st.id FROM sheet_types st
                                    JOIN towers tw ON tw.id = st.tower_id
                                   WHERE tw.project_id = ?)`,
        pid,
      );
      await run(
        `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
        pid,
      );
      await run(`DELETE FROM towers WHERE project_id = ?`, pid);
      await run(`DELETE FROM user_projects WHERE project_id = ?`, pid);
      await run(`DELETE FROM projects WHERE id = ?`, pid);
    }
    await run(`DELETE FROM systems WHERE id = ANY(?::int[])`, this.systems);
    await run(`DELETE FROM notifications WHERE user_id = ANY(?::int[])`, this.users);
    // Nhật ký phân công (PATCH /api/tasks/:id { assignedTo }) giữ khoá tới người gán/được gán.
    await run(
      `DELETE FROM assignment_log
        WHERE changed_by = ANY(?::int[]) OR new_user_id = ANY(?::int[]) OR prev_user_id = ANY(?::int[])`,
      this.users,
      this.users,
      this.users,
    );
    await run(`DELETE FROM user_projects WHERE user_id = ANY(?::int[])`, this.users);
    await run(`DELETE FROM users WHERE id = ANY(?::int[])`, this.users);
  }
}

/** Gửi một request tới handler và trả `{ status, body }` (body JSON hoặc null). */
export async function goi(
  res: Response | Promise<Response>,
): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const r = await res;
  const text = await r.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { status: r.status, body };
}
