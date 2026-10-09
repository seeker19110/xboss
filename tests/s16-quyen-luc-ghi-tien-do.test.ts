import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import {
  SoFixture,
  jreq,
  P,
  goi,
  uniq,
  type CayWbs,
  type NguoiTest,
} from "./helpers/chuoi-nghiep-vu";

// D01 / A1-AC05 — tái kiểm quyền LÚC GHI cho route miền tiến độ / cấu trúc
// (docs/nang-cap/AUDIT-S16-QUYEN-LUC-GHI.md §2.x). Khuôn chèn: một kết nối riêng giữ khoá advisory
// ĐỘC QUYỀN của org (đúng khoá `setPermissionOverride` dùng) TRƯỚC khi gọi route. Route đã xác
// thực + nạp snapshot quyền (allow) rồi mới tới bước tái kiểm (khoá chia sẻ) ⇒ kẹt; trong lúc kẹt
// kết nối riêng ghi override deny (theo dự án của ca) rồi COMMIT ⇒ route đọc lại dữ liệu có hiệu
// lực và phải trả 403, DB không đổi. Code cũ không có bước tái kiểm nên ghi xong luôn (2xx).
// Không mock module nào; user/dự án thật (id do DB cấp).

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

type KetQua = { status: number; body: Record<string, unknown> | null };

const KHOA_QUYEN_ORG1 = "role_permissions:1";
const UPLOAD_DIR = join(process.cwd(), "data", "uploads");
const PDF_BYTES = Buffer.from("%PDF-1.4\n%%EOF");
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex",
);

const rq = <T>(fn: () => Promise<T>) => requestRieng(fn);

function formReq(url: string, kieu: "pdf" | "png", method = "POST"): NextRequest {
  const form = new FormData();
  form.set(
    "file",
    kieu === "pdf"
      ? new File([PDF_BYTES], "a.pdf", { type: "application/pdf" })
      : new File([PNG_BYTES], "a.png", { type: "image/png" }),
  );
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

function fileUpload(): Set<string> {
  return new Set(existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : []);
}

/**
 * Giữ khoá quyền độc quyền của org 1, gọi route, chờ route kẹt ở bước tái kiểm (hoặc tự xong —
 * code cũ không tái kiểm), ghi override deny `pm.permKey` theo dự án rồi COMMIT nhả khoá.
 */
async function thuHoiGiuaChung(
  projectId: number,
  permKey: string,
  r1: () => Promise<KetQua>,
): Promise<KetQua> {
  const { getPool } = await import("@/lib/db");
  const cn = await getPool().connect();
  try {
    await cn.query("BEGIN");
    await cn.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [KHOA_QUYEN_ORG1]);
    const pid = (await cn.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    let xong = false;
    const dangBay = r1().finally(() => {
      xong = true;
    });
    for (let i = 0; i < 400 && !xong; i++) {
      const r = await getPool().query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
        [pid],
      );
      if (r.rows[0].n > 0) break;
      await new Promise((ok) => setTimeout(ok, 25));
    }
    await cn.query(
      `INSERT INTO role_permissions (role, perm_key, allowed, project_id, org_id)
       VALUES ('pm', $1, false, $2, 1)
       ON CONFLICT (org_id, role, perm_key, COALESCE(project_id, 0))
       DO UPDATE SET allowed = false, updated_at = now()`,
      [permKey, projectId],
    );
    await cn.query("COMMIT");
    return await dangBay;
  } finally {
    await cn.query("ROLLBACK").catch(() => {});
    cn.release();
  }
}

type Ngu = {
  f: SoFixture;
  pm: NguoiTest;
  admin: NguoiTest;
  projectId: number;
  w: CayWbs;
  task2: number;
  pkg2: number;
};

async function dung(f: SoFixture): Promise<Ngu> {
  const { insertId, run } = await import("@/lib/db");
  const projectId = await f.duAn("S16TD");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  const w = await f.wbs(projectId, { soO: 2, floorLabel: "T1" });
  await run(
    `UPDATE progress_dimensions SET sort_order = CASE dimension_label WHEN 'O1' THEN 1 ELSE 2 END
      WHERE task_id = ?`,
    w.taskId,
  );
  const task2 = await insertId(
    `INSERT INTO tasks (package_id, code, name, sort_order, progress_percent, status)
     VALUES (?, ?, 'Task 2', 2, 0, 'chuan_bi')`,
    w.packageId,
    uniq("TK2"),
  );
  const pkg2 = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, sort_order, floor_label)
     VALUES (?, ?, 'Nhóm 2', 2, 'T1')`,
    w.sheetTypeId,
    uniq("PK2"),
  );
  await f.vao(pm, projectId);
  return { f, pm, admin, projectId, w, task2, pkg2 };
}

/** Dọn các bảng phụ mà SoFixture.don() không biết, theo dự án của ca. */
async function donThem(projectId: number): Promise<void> {
  const { query, run } = await import("@/lib/db");
  const taskIds = (
    await query<{ id: number }>(
      `SELECT t.id FROM tasks t JOIN work_packages wp ON wp.id = t.package_id
         JOIN sheet_types st ON st.id = wp.sheet_type_id JOIN towers tw ON tw.id = st.tower_id
        WHERE tw.project_id = ?`,
      projectId,
    )
  ).map((r) => r.id);
  const albumIds = (
    await query<{ id: number }>(`SELECT id FROM progress_albums WHERE project_id = ?`, projectId)
  ).map((r) => r.id);
  await run(`DELETE FROM role_permissions WHERE project_id = ?`, projectId);
  await run(`DELETE FROM raci_matrix WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM baseline_tasks WHERE baseline_id IN (SELECT id FROM baselines WHERE project_id = ?)
        OR task_id = ANY(?::int[])`,
    projectId,
    taskIds,
  );
  await run(`DELETE FROM baselines WHERE project_id = ?`, projectId);
  await run(`DELETE FROM floor_stage_fronts WHERE project_id = ?`, projectId);
  await run(`DELETE FROM construction_stages WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM task_photos WHERE task_id = ANY(?::int[]) OR album_id = ANY(?::int[])`,
    taskIds,
    albumIds,
  );
  await run(`DELETE FROM photo_upload_staging WHERE task_id = ANY(?::int[])`, taskIds);
  await run(`DELETE FROM progress_albums WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM task_documents WHERE task_id = ANY(?::int[])
        OR floor_approval_id IN (SELECT fa.id FROM floor_approvals fa
                                   JOIN sheet_types st ON st.id = fa.sheet_type_id
                                   JOIN towers tw ON tw.id = st.tower_id
                                  WHERE tw.project_id = ?)`,
    taskIds,
    projectId,
  );
  await run(`DELETE FROM task_comments WHERE task_id = ANY(?::int[])`, taskIds);
}

async function mot<T>(sql: string, ...args: unknown[]): Promise<T | undefined> {
  const { queryOne } = await import("@/lib/db");
  return queryOne<T>(sql, ...args);
}

async function dem(sql: string, ...args: unknown[]): Promise<number> {
  return (await mot<{ n: number }>(sql, ...args))?.n ?? 0;
}

async function chen(sql: string, ...args: unknown[]): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(sql, ...args);
}

type Ca = {
  ten: string;
  perm: string;
  /** Có ghi file lên storage — tiền tố tên file của CHÍNH ca này (newXxxFileName), để kiểm file
   *  vừa lưu bị dọn khi bị thu hồi mà không đếm nhầm file của test khác chạy song song. */
  file?: (n: Ngu, x: number) => string;
  /** Dựng dữ liệu riêng của ca; trả id/ngữ cảnh cho goi + chup. */
  dung?: (n: Ngu) => Promise<number>;
  goi: (n: Ngu, x: number) => Promise<Response>;
  chup: (n: Ngu, x: number) => Promise<unknown>;
};

const CA: Ca[] = [
  // ── tasks ──────────────────────────────────────────────────────────────────────────────
  {
    ten: "tasks/:id/copy POST",
    perm: "editStructure",
    goi: async (n) => {
      const { POST } = await import("@/app/api/tasks/[id]/copy/route");
      return POST(jreq(`/api/tasks/${n.w.taskId}/copy`, { code: uniq("CP") }), P(n.w.taskId));
    },
    chup: (n) => dem(`SELECT COUNT(*)::int AS n FROM tasks WHERE package_id = ?`, n.w.packageId),
  },
  {
    ten: "tasks/:id/delay-reason POST",
    perm: "editProgress",
    goi: async (n) => {
      const { POST } = await import("@/app/api/tasks/[id]/delay-reason/route");
      return POST(jreq(`/api/tasks/${n.w.taskId}/delay-reason`, { reason: "khac" }), P(n.w.taskId));
    },
    chup: (n) => mot(`SELECT delay_reason FROM tasks WHERE id = ?`, n.w.taskId),
  },
  {
    ten: "tasks/:id/documents POST (file)",
    perm: "editProgress",
    file: (n) => `d${n.w.taskId}-`,
    goi: async (n) => {
      const { POST } = await import("@/app/api/tasks/[id]/documents/route");
      return POST(formReq(`/api/tasks/${n.w.taskId}/documents`, "pdf"), P(n.w.taskId));
    },
    chup: (n) => dem(`SELECT COUNT(*)::int AS n FROM task_documents WHERE task_id = ?`, n.w.taskId),
  },
  {
    ten: "tasks/:id/move PATCH",
    perm: "editStructure",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/tasks/[id]/move/route");
      return PATCH(
        jreq(`/api/tasks/${n.w.taskId}/move`, { direction: "down" }, "PATCH"),
        P(n.w.taskId),
      );
    },
    chup: (n) =>
      mot(
        `SELECT array_agg(sort_order ORDER BY id) AS s FROM tasks WHERE package_id = ?`,
        n.w.packageId,
      ),
  },
  {
    ten: "tasks/:id/photos POST (file)",
    perm: "editProgress",
    file: (n) => `t${n.w.taskId}-`,
    goi: async (n) => {
      const { POST } = await import("@/app/api/tasks/[id]/photos/route");
      return POST(formReq(`/api/tasks/${n.w.taskId}/photos`, "png"), P(n.w.taskId));
    },
    chup: async (n) => ({
      anh: await dem(`SELECT COUNT(*)::int AS n FROM task_photos WHERE task_id = ?`, n.w.taskId),
      staging: await dem(
        `SELECT COUNT(*)::int AS n FROM photo_upload_staging WHERE task_id = ?`,
        n.w.taskId,
      ),
    }),
  },
  {
    ten: "tasks/:id/progress PATCH",
    perm: "editProgress",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/tasks/[id]/progress/route");
      return PATCH(
        jreq(`/api/tasks/${n.w.taskId}/progress`, { progress: 0.5 }, "PATCH"),
        P(n.w.taskId),
      );
    },
    chup: (n) => mot(`SELECT progress_percent, status FROM tasks WHERE id = ?`, n.w.taskId),
  },
  {
    ten: "tasks/:id PATCH",
    perm: "editStructure",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/tasks/[id]/route");
      return PATCH(jreq(`/api/tasks/${n.w.taskId}`, { name: "Tên mới" }, "PATCH"), P(n.w.taskId));
    },
    chup: (n) => mot(`SELECT name FROM tasks WHERE id = ?`, n.w.taskId),
  },
  {
    ten: "tasks/batch PATCH",
    perm: "editStructure",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/tasks/batch/route");
      return PATCH(
        jreq(
          `/api/tasks/batch`,
          { updates: [{ id: n.w.taskId, patch: { name: "Tên lô" } }] },
          "PATCH",
        ),
      );
    },
    chup: (n) => mot(`SELECT name FROM tasks WHERE id = ?`, n.w.taskId),
  },
  // ── workpackages ───────────────────────────────────────────────────────────────────────
  {
    ten: "workpackages/:id/bbnt POST (file)",
    perm: "editProgress",
    file: (n) => `wp${n.w.packageId}-bbnt-`,
    goi: async (n) => {
      const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
      return POST(formReq(`/api/workpackages/${n.w.packageId}/bbnt`, "pdf"), P(n.w.packageId));
    },
    chup: (n) => mot(`SELECT bbnt_file_name FROM work_packages WHERE id = ?`, n.w.packageId),
  },
  {
    ten: "workpackages/:id/copy POST",
    perm: "editStructure",
    goi: async (n) => {
      const { POST } = await import("@/app/api/workpackages/[id]/copy/route");
      return POST(
        jreq(`/api/workpackages/${n.w.packageId}/copy`, { code: uniq("CPK") }),
        P(n.w.packageId),
      );
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM work_packages WHERE sheet_type_id = ?`, n.w.sheetTypeId),
  },
  {
    ten: "workpackages/:id/dimensions/column/move PATCH",
    perm: "editStructure",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/workpackages/[id]/dimensions/column/move/route");
      return PATCH(
        jreq(
          `/api/workpackages/${n.w.packageId}/dimensions/column/move`,
          { label: "O1", direction: "right" },
          "PATCH",
        ),
        P(n.w.packageId),
      );
    },
    chup: (n) =>
      mot(
        `SELECT array_agg(sort_order ORDER BY id) AS s FROM progress_dimensions WHERE task_id = ?`,
        n.w.taskId,
      ),
  },
  {
    ten: "workpackages/:id/dimensions/column POST",
    perm: "editStructure",
    goi: async (n) => {
      const { POST } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
      return POST(
        jreq(`/api/workpackages/${n.w.packageId}/dimensions/column`, { label: "MOI" }),
        P(n.w.packageId),
      );
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM progress_dimensions WHERE task_id = ANY(?::int[])`, [
        n.w.taskId,
        n.task2,
      ]),
  },
  {
    ten: "workpackages/:id/drawing POST (file)",
    perm: "editProgress",
    file: (n) => `wp${n.w.packageId}-drw-`,
    goi: async (n) => {
      const { POST } = await import("@/app/api/workpackages/[id]/drawing/route");
      return POST(formReq(`/api/workpackages/${n.w.packageId}/drawing`, "pdf"), P(n.w.packageId));
    },
    chup: (n) => mot(`SELECT drawing_file_name FROM work_packages WHERE id = ?`, n.w.packageId),
  },
  {
    ten: "workpackages/:id/move PATCH",
    perm: "editStructure",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/workpackages/[id]/move/route");
      return PATCH(
        jreq(`/api/workpackages/${n.w.packageId}/move`, { direction: "down" }, "PATCH"),
        P(n.w.packageId),
      );
    },
    chup: (n) =>
      mot(
        `SELECT array_agg(sort_order ORDER BY id) AS s FROM work_packages WHERE sheet_type_id = ?`,
        n.w.sheetTypeId,
      ),
  },
  {
    ten: "workpackages/:id PATCH",
    perm: "editStructure",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/workpackages/[id]/route");
      return PATCH(
        jreq(`/api/workpackages/${n.w.packageId}`, { name: "Nhóm mới" }, "PATCH"),
        P(n.w.packageId),
      );
    },
    chup: (n) => mot(`SELECT name FROM work_packages WHERE id = ?`, n.w.packageId),
  },
  {
    ten: "workpackages/:id/tasks POST",
    perm: "editStructure",
    goi: async (n) => {
      const { POST } = await import("@/app/api/workpackages/[id]/tasks/route");
      return POST(
        jreq(`/api/workpackages/${n.w.packageId}/tasks`, { code: uniq("NT"), name: "Task mới" }),
        P(n.w.packageId),
      );
    },
    chup: (n) => dem(`SELECT COUNT(*)::int AS n FROM tasks WHERE package_id = ?`, n.w.packageId),
  },
  {
    ten: "workpackages POST",
    perm: "editStructure",
    goi: async (n) => {
      const { POST } = await import("@/app/api/workpackages/route");
      return POST(
        jreq(`/api/workpackages`, {
          sheetTypeId: n.w.sheetTypeId,
          code: uniq("NP"),
          name: "Nhóm mới",
        }),
      );
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM work_packages WHERE sheet_type_id = ?`, n.w.sheetTypeId),
  },
  // ── dimensions ─────────────────────────────────────────────────────────────────────────
  {
    ten: "dimensions/:id PATCH (tick)",
    perm: "editProgress",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/dimensions/[id]/route");
      return PATCH(
        jreq(`/api/dimensions/${n.w.dims[0]}`, { installed: true }, "PATCH"),
        P(n.w.dims[0]),
      );
    },
    chup: async (n) => ({
      o: await mot(`SELECT installed FROM progress_dimensions WHERE id = ?`, n.w.dims[0]),
      t: await mot(`SELECT progress_percent FROM tasks WHERE id = ?`, n.w.taskId),
    }),
  },
  {
    ten: "dimensions/batch PATCH",
    perm: "editProgress",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/dimensions/batch/route");
      return PATCH(jreq(`/api/dimensions/batch`, { ids: n.w.dims, installed: true }, "PATCH"));
    },
    chup: (n) =>
      dem(
        `SELECT COUNT(*)::int AS n FROM progress_dimensions WHERE task_id = ? AND installed = 1`,
        n.w.taskId,
      ),
  },
  {
    ten: "dimensions/rename POST",
    perm: "editStructure",
    goi: async (n) => {
      const { POST } = await import("@/app/api/dimensions/rename/route");
      return POST(
        jreq(`/api/dimensions/rename`, {
          packageId: n.w.packageId,
          oldLabel: "O1",
          newLabel: "O1-moi",
        }),
      );
    },
    chup: (n) =>
      mot(
        `SELECT array_agg(dimension_label ORDER BY id) AS l FROM progress_dimensions WHERE task_id = ?`,
        n.w.taskId,
      ),
  },
  // ── towers / baselines / phụ thuộc / công tác ─────────────────────────────────────────
  {
    ten: "towers/:id PATCH",
    perm: "editStructure",
    goi: async (n) => {
      const { PATCH } = await import("@/app/api/towers/[id]/route");
      return PATCH(
        jreq(`/api/towers/${n.w.towerId}`, { name: "Tháp mới" }, "PATCH"),
        P(n.w.towerId),
      );
    },
    chup: (n) => mot(`SELECT name FROM towers WHERE id = ?`, n.w.towerId),
  },
  {
    ten: "towers POST",
    perm: "editStructure",
    goi: async () => {
      const { POST } = await import("@/app/api/towers/route");
      return POST(jreq(`/api/towers`, { name: "Tháp B" }));
    },
    chup: (n) => dem(`SELECT COUNT(*)::int AS n FROM towers WHERE project_id = ?`, n.projectId),
  },
  {
    ten: "baselines/:id DELETE",
    perm: "editStructure",
    dung: (n) =>
      chen(
        `INSERT INTO baselines (name, created_by, project_id) VALUES ('BL', ?, ?)`,
        n.admin.id,
        n.projectId,
      ),
    goi: async (_n, id) => {
      const { DELETE } = await import("@/app/api/baselines/[id]/route");
      return DELETE(jreq(`/api/baselines/${id}`, undefined, "DELETE"), P(id));
    },
    chup: (_n, id) => dem(`SELECT COUNT(*)::int AS n FROM baselines WHERE id = ?`, id),
  },
  {
    ten: "baselines POST",
    perm: "editStructure",
    goi: async () => {
      const { POST } = await import("@/app/api/baselines/route");
      return POST(jreq(`/api/baselines`, { name: "BL mới" }));
    },
    chup: (n) => dem(`SELECT COUNT(*)::int AS n FROM baselines WHERE project_id = ?`, n.projectId),
  },
  {
    ten: "packages/:id/dependencies POST",
    perm: "editStructure",
    goi: async (n) => {
      const { POST } = await import("@/app/api/packages/[id]/dependencies/route");
      return POST(
        jreq(`/api/packages/${n.pkg2}/dependencies`, { predecessorId: n.w.packageId }),
        P(n.pkg2),
      );
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM package_dependencies WHERE successor_id = ?`, n.pkg2),
  },
  {
    ten: "package-dependencies/:id DELETE",
    perm: "editStructure",
    dung: (n) =>
      chen(
        `INSERT INTO package_dependencies (predecessor_id, successor_id) VALUES (?, ?)`,
        n.w.packageId,
        n.pkg2,
      ),
    goi: async (_n, id) => {
      const { DELETE } = await import("@/app/api/package-dependencies/[id]/route");
      return DELETE(jreq(`/api/package-dependencies/${id}`, undefined, "DELETE"), P(id));
    },
    chup: (_n, id) => dem(`SELECT COUNT(*)::int AS n FROM package_dependencies WHERE id = ?`, id),
  },
  {
    ten: "construction-stages/:id PATCH",
    perm: "editStructure",
    dung: (n) =>
      chen(
        `INSERT INTO construction_stages (name, sort_order, project_id) VALUES ('CT', 1, ?)`,
        n.projectId,
      ),
    goi: async (_n, id) => {
      const { PATCH } = await import("@/app/api/construction-stages/[id]/route");
      return PATCH(jreq(`/api/construction-stages/${id}`, { name: "CT mới" }, "PATCH"), P(id));
    },
    chup: (_n, id) => mot(`SELECT name FROM construction_stages WHERE id = ?`, id),
  },
  {
    ten: "construction-stages POST",
    perm: "editStructure",
    goi: async () => {
      const { POST } = await import("@/app/api/construction-stages/route");
      return POST(jreq(`/api/construction-stages`, { name: "CT riêng", durationDays: 2 }));
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM construction_stages WHERE project_id = ?`, n.projectId),
  },
  // ── mặt bằng theo tầng × công tác ──────────────────────────────────────────────────────
  {
    ten: "floor-stage-fronts/:id/documents POST (file)",
    perm: "manageWorkFronts",
    file: (_n, x) => `fsf${x}-`,
    dung: async (n) => {
      const st = await chen(
        `INSERT INTO construction_stages (name, sort_order, project_id) VALUES ('CT', 1, ?)`,
        n.projectId,
      );
      return chen(
        `INSERT INTO floor_stage_fronts (floor_label, stage_id, project_id) VALUES ('T1', ?, ?)`,
        st,
        n.projectId,
      );
    },
    goi: async (_n, id) => {
      const { POST } = await import("@/app/api/floor-stage-fronts/[id]/documents/route");
      return POST(formReq(`/api/floor-stage-fronts/${id}/documents`, "pdf"), P(id));
    },
    chup: (_n, id) =>
      dem(
        `SELECT COUNT(*)::int AS n FROM floor_stage_front_documents WHERE floor_stage_front_id = ?`,
        id,
      ),
  },
  {
    ten: "floor-stage-fronts PUT",
    perm: "manageWorkFronts",
    dung: (n) =>
      chen(
        `INSERT INTO construction_stages (name, sort_order, project_id) VALUES ('CT', 1, ?)`,
        n.projectId,
      ),
    goi: async (_n, stageId) => {
      const { PUT } = await import("@/app/api/floor-stage-fronts/route");
      return PUT(
        jreq(
          `/api/floor-stage-fronts`,
          { floorLabel: "T1", stageId, receivedAt: "2026-10-01" },
          "PUT",
        ),
      );
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM floor_stage_fronts WHERE project_id = ?`, n.projectId),
  },
  {
    ten: "floor-stage-front-documents/:id DELETE",
    perm: "manageWorkFronts",
    dung: async (n) => {
      const st = await chen(
        `INSERT INTO construction_stages (name, sort_order, project_id) VALUES ('CT', 1, ?)`,
        n.projectId,
      );
      const front = await chen(
        `INSERT INTO floor_stage_fronts (floor_label, stage_id, project_id) VALUES ('T1', ?, ?)`,
        st,
        n.projectId,
      );
      return chen(
        `INSERT INTO floor_stage_front_documents (floor_stage_front_id, file_path, file_name, mime, uploaded_by)
         VALUES (?, 'khong-co.pdf', 'khong-co.pdf', 'application/pdf', ?)`,
        front,
        n.admin.id,
      );
    },
    goi: async (_n, id) => {
      const { DELETE } = await import("@/app/api/floor-stage-front-documents/[id]/route");
      return DELETE(jreq(`/api/floor-stage-front-documents/${id}`, undefined, "DELETE"), P(id));
    },
    chup: (_n, id) =>
      dem(`SELECT COUNT(*)::int AS n FROM floor_stage_front_documents WHERE id = ?`, id),
  },
  // ── nghiệm thu tầng (nộp hồ sơ) ────────────────────────────────────────────────────────
  {
    ten: "floor-approvals/:id/documents POST (link)",
    perm: "editProgress",
    dung: (n) =>
      chen(
        `INSERT INTO floor_approvals (sheet_type_id, floor_label, is_approved) VALUES (?, 'T1', FALSE)`,
        n.w.sheetTypeId,
      ),
    goi: async (_n, id) => {
      const { POST } = await import("@/app/api/floor-approvals/[id]/documents/route");
      return POST(
        jreq(
          `/api/floor-approvals/${id}/documents`,
          { url: "https://example.com/bb.pdf" },
          "POST",
          {
            "content-type": "application/json",
          },
        ),
        P(id),
      );
    },
    chup: (_n, id) =>
      dem(`SELECT COUNT(*)::int AS n FROM task_documents WHERE floor_approval_id = ?`, id),
  },
  {
    ten: "floor-approvals POST",
    perm: "editProgress",
    goi: async (n) => {
      const { POST } = await import("@/app/api/floor-approvals/route");
      return POST(jreq(`/api/floor-approvals`, { sheetTypeId: n.w.sheetTypeId, floorLabel: "T1" }));
    },
    chup: (n) =>
      dem(
        `SELECT COUNT(*)::int AS n FROM floor_approvals WHERE sheet_type_id = ?`,
        n.w.sheetTypeId,
      ),
  },
  // ── mặt bằng (work fronts) ─────────────────────────────────────────────────────────────
  {
    ten: "work-fronts/:id/documents POST (file)",
    perm: "manageWorkFronts",
    file: (_n, x) => `wf${x}-`,
    dung: (n) =>
      chen(
        `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, 'T1')`,
        n.w.sheetTypeId,
      ),
    goi: async (_n, id) => {
      const { POST } = await import("@/app/api/work-fronts/[id]/documents/route");
      return POST(formReq(`/api/work-fronts/${id}/documents`, "pdf"), P(id));
    },
    chup: (_n, id) =>
      dem(`SELECT COUNT(*)::int AS n FROM work_front_documents WHERE work_front_id = ?`, id),
  },
  {
    ten: "work-fronts/:id PATCH",
    perm: "manageWorkFronts",
    dung: (n) =>
      chen(
        `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, 'T1')`,
        n.w.sheetTypeId,
      ),
    goi: async (_n, id) => {
      const { PATCH } = await import("@/app/api/work-fronts/[id]/route");
      return PATCH(
        jreq(
          `/api/work-fronts/${id}`,
          { status: "handed_over", handedOverAt: "2026-10-01" },
          "PATCH",
        ),
        P(id),
      );
    },
    chup: (_n, id) => mot(`SELECT status FROM work_fronts WHERE id = ?`, id),
  },
  {
    ten: "work-front-documents/:id DELETE",
    perm: "manageWorkFronts",
    dung: async (n) => {
      const wf = await chen(
        `INSERT INTO work_fronts (sheet_type_id, floor_label) VALUES (?, 'T1')`,
        n.w.sheetTypeId,
      );
      return chen(
        `INSERT INTO work_front_documents (work_front_id, file_path, file_name, mime, uploaded_by)
         VALUES (?, 'khong-co.pdf', 'khong-co.pdf', 'application/pdf', ?)`,
        wf,
        n.admin.id,
      );
    },
    goi: async (_n, id) => {
      const { DELETE } = await import("@/app/api/work-front-documents/[id]/route");
      return DELETE(jreq(`/api/work-front-documents/${id}`, undefined, "DELETE"), P(id));
    },
    chup: (_n, id) => dem(`SELECT COUNT(*)::int AS n FROM work_front_documents WHERE id = ?`, id),
  },
  // ── album tiến độ / ảnh / bình luận / tài liệu / RACI ──────────────────────────────────
  {
    ten: "progress-albums/:id/photos POST (file)",
    perm: "manageTech",
    file: (_n, x) => `alb${x}-`,
    dung: (n) =>
      chen(
        `INSERT INTO progress_albums (project_id, milestone_label) VALUES (?, 'Mốc')`,
        n.projectId,
      ),
    goi: async (_n, id) => {
      const { POST } = await import("@/app/api/progress-albums/[id]/photos/route");
      return POST(formReq(`/api/progress-albums/${id}/photos`, "png"), P(id));
    },
    chup: (_n, id) => dem(`SELECT COUNT(*)::int AS n FROM task_photos WHERE album_id = ?`, id),
  },
  {
    ten: "progress-albums/:id PATCH",
    perm: "manageTech",
    dung: (n) =>
      chen(
        `INSERT INTO progress_albums (project_id, milestone_label) VALUES (?, 'Mốc')`,
        n.projectId,
      ),
    goi: async (_n, id) => {
      const { PATCH } = await import("@/app/api/progress-albums/[id]/route");
      return PATCH(
        jreq(`/api/progress-albums/${id}`, { milestoneLabel: "Mốc mới" }, "PATCH"),
        P(id),
      );
    },
    chup: (_n, id) => mot(`SELECT milestone_label FROM progress_albums WHERE id = ?`, id),
  },
  {
    ten: "progress-albums POST",
    perm: "manageTech",
    goi: async () => {
      const { POST } = await import("@/app/api/progress-albums/route");
      return POST(jreq(`/api/progress-albums`, { milestoneLabel: "Mốc A" }));
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM progress_albums WHERE project_id = ?`, n.projectId),
  },
  {
    ten: "photos/:id DELETE (ảnh người khác)",
    perm: "editStructure",
    dung: (n) =>
      chen(
        `INSERT INTO task_photos (task_id, file_name, mime_type, uploaded_by)
         VALUES (?, 'khong-co.png', 'image/png', ?)`,
        n.w.taskId,
        n.admin.id,
      ),
    goi: async (_n, id) => {
      const { DELETE } = await import("@/app/api/photos/[id]/route");
      return DELETE(jreq(`/api/photos/${id}`, undefined, "DELETE"), P(id));
    },
    chup: (_n, id) => dem(`SELECT COUNT(*)::int AS n FROM task_photos WHERE id = ?`, id),
  },
  {
    ten: "comments/:id DELETE (bình luận người khác)",
    perm: "editStructure",
    dung: (n) =>
      chen(
        `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, 'BL')`,
        n.w.taskId,
        n.admin.id,
      ),
    goi: async (_n, id) => {
      const { DELETE } = await import("@/app/api/comments/[id]/route");
      return DELETE(jreq(`/api/comments/${id}`, undefined, "DELETE"), P(id));
    },
    chup: (_n, id) => dem(`SELECT COUNT(*)::int AS n FROM task_comments WHERE id = ?`, id),
  },
  {
    ten: "documents/:id DELETE (tài liệu người khác)",
    perm: "editStructure",
    dung: (n) =>
      chen(
        `INSERT INTO task_documents (task_id, file_name, link_url, uploaded_by)
         VALUES (?, '', 'https://example.com/x', ?)`,
        n.w.taskId,
        n.admin.id,
      ),
    goi: async (_n, id) => {
      const { DELETE } = await import("@/app/api/documents/[id]/route");
      return DELETE(jreq(`/api/documents/${id}`, undefined, "DELETE"), P(id));
    },
    chup: (_n, id) => dem(`SELECT COUNT(*)::int AS n FROM task_documents WHERE id = ?`, id),
  },
  {
    ten: "raci PUT",
    perm: "manageHr",
    goi: async () => {
      const { PUT } = await import("@/app/api/raci/route");
      return PUT(
        jreq(`/api/raci`, { scope: "Hạng mục A", rows: [{ roleLabel: "PM", raci: "R" }] }, "PUT"),
      );
    },
    chup: (n) =>
      dem(`SELECT COUNT(*)::int AS n FROM raci_matrix WHERE project_id = ?`, n.projectId),
  },
];

for (const ca of CA) {
  test(
    `A1-AC05 (D01): ${ca.ten} — admin siết pm.${ca.perm} khi request còn kẹt ở bước ghi ⇒ 403, DB không đổi`,
    S,
    async () => {
      const f = new SoFixture();
      let projectId = 0;
      try {
        const n = await dung(f);
        projectId = n.projectId;
        const x = ca.dung ? await ca.dung(n) : 0;
        await f.vao(n.pm, n.projectId);
        const truoc = await ca.chup(n, x);
        const fileTruoc = fileUpload();
        const r = await thuHoiGiuaChung(n.projectId, ca.perm, () => goi(rq(() => ca.goi(n, x))));
        assert.equal(r.status, 403, `ghi bằng snapshot stale: ${JSON.stringify(r.body)}`);
        assert.deepEqual(await ca.chup(n, x), truoc, "DB đổi dù đã bị thu hồi quyền");
        if (ca.file) {
          const tienTo = ca.file(n, x);
          const moi = [...fileUpload()].filter((t) => t.startsWith(tienTo) && !fileTruoc.has(t));
          assert.deepEqual(moi, [], "file vừa lưu không được dọn khi bị thu hồi");
        }
      } finally {
        if (projectId) await donThem(projectId);
        await f.don();
      }
    },
  );
}

// ── Đối chứng: không đổi quyền ⇒ route vẫn ghi bình thường ────────────────────────────────

const DOI_CHUNG = [
  "tasks/:id/progress PATCH",
  "dimensions/:id PATCH (tick)",
  "workpackages/:id/dimensions/column POST",
  "towers POST",
  "floor-stage-fronts PUT",
];

for (const ten of DOI_CHUNG) {
  const ca = CA.find((c) => c.ten === ten)!;
  test(`A1-AC05 (đối chứng): ${ten} — không đổi quyền ⇒ 2xx và DB đổi`, S, async () => {
    const f = new SoFixture();
    let projectId = 0;
    try {
      const n = await dung(f);
      projectId = n.projectId;
      const x = ca.dung ? await ca.dung(n) : 0;
      await f.vao(n.pm, n.projectId);
      const truoc = await ca.chup(n, x);
      const r = await goi(rq(() => ca.goi(n, x)));
      assert.ok(r.status >= 200 && r.status < 300, `${r.status} ${JSON.stringify(r.body)}`);
      assert.notDeepEqual(await ca.chup(n, x), truoc, "route không ghi gì");
    } finally {
      if (projectId) await donThem(projectId);
      await f.don();
    }
  });
}

test(
  "A1-AC05 (đối chứng): workpackages/:id/bbnt POST thay file — DB trỏ file mới, file cũ chỉ xoá sau khi ghi",
  S,
  async () => {
    const f = new SoFixture();
    let projectId = 0;
    try {
      const n = await dung(f);
      projectId = n.projectId;
      const { POST } = await import("@/app/api/workpackages/[id]/bbnt/route");
      const gui = () =>
        goi(
          rq(() =>
            POST(formReq(`/api/workpackages/${n.w.packageId}/bbnt`, "pdf"), P(n.w.packageId)),
          ),
        );
      const r1 = await gui();
      assert.equal(r1.status, 201, JSON.stringify(r1.body));
      const cu = (await mot<{ f: string }>(
        `SELECT bbnt_file_name AS f FROM work_packages WHERE id = ?`,
        n.w.packageId,
      ))!.f;
      assert.ok(fileUpload().has(cu));
      const r2 = await gui();
      assert.equal(r2.status, 201, JSON.stringify(r2.body));
      const moi = (await mot<{ f: string }>(
        `SELECT bbnt_file_name AS f FROM work_packages WHERE id = ?`,
        n.w.packageId,
      ))!.f;
      assert.notEqual(moi, cu);
      const ds = fileUpload();
      assert.ok(ds.has(moi), "file mới phải còn");
      assert.ok(!ds.has(cu), "file cũ phải được dọn sau khi DB trỏ sang file mới");
      const { storageDelete } = await import("@/lib/nen/storage");
      await storageDelete(1, moi);
    } finally {
      if (projectId) await donThem(projectId);
      await f.don();
    }
  },
);

test(
  "A1-AC05 (đối chứng): comments/:id DELETE — tác giả vẫn xoá được bình luận của mình dù pm.editStructure bị siết",
  S,
  async () => {
    const f = new SoFixture();
    let projectId = 0;
    try {
      const n = await dung(f);
      projectId = n.projectId;
      const id = await chen(
        `INSERT INTO task_comments (task_id, user_id, body) VALUES (?, ?, 'của pm')`,
        n.w.taskId,
        n.pm.id,
      );
      const { DELETE } = await import("@/app/api/comments/[id]/route");
      const r = await thuHoiGiuaChung(n.projectId, "editStructure", () =>
        goi(rq(() => DELETE(jreq(`/api/comments/${id}`, undefined, "DELETE"), P(id)))),
      );
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.equal(await dem(`SELECT COUNT(*)::int AS n FROM task_comments WHERE id = ?`, id), 0);
    } finally {
      if (projectId) await donThem(projectId);
      await f.don();
    }
  },
);
