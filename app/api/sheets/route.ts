import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, insertId, withTransaction, todayISO } from "@/lib/db";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { toSlug, SLUG_RE } from "@/lib/nen/sheets";
import { visibleProjectIds, getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

/** Giới hạn số sheet trong một lần sắp xếp — chặn payload phình to. */
const MAX_REORDER_IDS = 200;

// Danh sách sheet type + KPI tổng hợp — chỉ sheet của dự án đang chọn (P1-6).
// Dấu hiệu nội bộ: quyền bị thu hồi giữa lúc xác thực và lúc ghi (D01) → route trả 403.
const KHONG_CON_QUYEN = "KHONG_CON_QUYEN";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Cách ly dự án: sheet_types suy dự án qua tower_id → towers.project_id (+ org).
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ sheets: [] });

  const today = todayISO();
  const sheets = await query(
    `SELECT st.id, st.code, st.name, st.responsible, st.slug, st.system_id AS "systemId",
            sys.code AS "systemCode", sys.name AS "systemName", sys.color AS "systemColor",
            COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN COALESCE(t.end_date, wp.end_date) IS NOT NULL AND COALESCE(t.end_date, wp.end_date) < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM sheet_types st
       JOIN towers tw ON tw.id = st.tower_id
       JOIN projects p ON p.id = tw.project_id
       LEFT JOIN systems sys ON sys.id = st.system_id
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      WHERE tw.project_id = ? AND p.org_id = ?
      GROUP BY st.id, st.code, st.name, st.responsible, st.slug, st.system_id, sys.code, sys.name, sys.color
      ORDER BY st.sort_order, st.id`,
    today,
    projectId,
    user.orgId,
  );
  return NextResponse.json({ sheets });
}

// POST /api/sheets — tạo trang tracking mới (Admin/PM). Body: { name, code?, slug?, copyFromId? }.
// copyFromId: copy nguyên cấu trúc sheet nguồn (nhóm, task, cột checkbox) — tiến độ reset về 0,
// BOQ không copy (phải duy nhất toàn hệ thống). Không có copyFromId thì tạo sheet rỗng.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo sheet (chỉ Admin/PM)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Thiếu tên sheet" }, { status: 400 });

  const code = (typeof body?.code === "string" && body.code.trim()) || name;
  const slug = (typeof body?.slug === "string" && body.slug.trim()) || toSlug(name);
  if (!SLUG_RE.test(slug))
    return NextResponse.json(
      { error: "Đường dẫn không hợp lệ — chỉ dùng chữ thường a-z, số và gạch nối" },
      { status: 400 },
    );

  // S02e: sheet thuộc DỰ ÁN ĐANG CHỌN — slug/mã chỉ cần duy nhất trong dự án đó
  // (uq_sheet_types_project_slug). Trước đây gắn vào "tháp đầu tiên toàn hệ" (có thể là dự án/
  // tổ chức khác) và kiểm trùng toàn hệ (lộ sự tồn tại slug của org khác). Không có dự án → 404.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });
  if (
    await queryOne(`SELECT id FROM sheet_types WHERE slug = ? AND project_id = ?`, slug, projectId)
  )
    return NextResponse.json({ error: `Đường dẫn "${slug}" đã được dùng` }, { status: 409 });
  if (
    await queryOne(`SELECT id FROM sheet_types WHERE code = ? AND project_id = ?`, code, projectId)
  )
    return NextResponse.json({ error: `Mã sheet "${code}" đã tồn tại` }, { status: 409 });

  // Gắn vào tháp đầu tiên của dự án đang chọn — dự án chưa có tháp thì tạo "Tháp A".
  let tower = await queryOne<{ id: number }>(
    `SELECT id FROM towers WHERE project_id = ? ORDER BY id LIMIT 1`,
    projectId,
  );
  if (!tower) {
    tower = {
      id: await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`, projectId),
    };
  }

  // Sheet nguồn để copy cấu trúc (kiểm tra trước khi tạo để không để lại sheet rỗng khi lỗi).
  const copyFromId = body?.copyFromId ? Number(body.copyFromId) : null;
  if (copyFromId !== null) {
    // Cách ly dự án (Đợt 6, Việc G): sheet_types không có cột dự án trực tiếp — suy qua
    // tower_id → towers.project_id. Thiếu lọc thì copy được nguyên cấu trúc (tên nhóm/task/
    // cột checkbox) của một sheet thuộc dự án người gọi không thấy được (id đoán được).
    const visible = await visibleProjectIds(user);
    const src =
      Number.isInteger(copyFromId) && visible.length > 0
        ? await queryOne<{ id: number }>(
            `SELECT st.id FROM sheet_types st
               JOIN towers tw ON tw.id = st.tower_id
              WHERE st.id = ? AND tw.project_id = ANY(?)`,
            copyFromId,
            visible,
          )
        : null;
    if (!src)
      return NextResponse.json({ error: "Sheet nguồn để copy không tồn tại" }, { status: 400 });
  }

  const responsible =
    typeof body?.responsible === "string" ? body.responsible.trim() || null : null;

  // Hệ (system) gán cho sheet mới — dùng khi tạo sheet từ trang hệ /system/[code] (M15).
  let systemId: number | null = null;
  if (body?.systemId != null) {
    systemId = Number(body.systemId);
    if (
      !Number.isInteger(systemId) ||
      !(await queryOne(`SELECT id FROM systems WHERE id = ?`, systemId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  // INSERT sheet + copy cấu trúc trong cùng 1 transaction — không bao giờ có sheet rỗng / nửa chừng.
  // 23505 từ INSERT sheet_types (slug/code trùng do TOCTOU) bị bắt ở outer catch và trả 409.
  let sheetId: number;
  let copied: number;
  try {
    const result = await withTransaction(async () => {
      // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
      if (!(await kiemQuyenTaiLucGhi(() => CAN.editStructure(user.role))))
        throw new Error(KHONG_CON_QUYEN);
      const newId = await insertId(
        `INSERT INTO sheet_types (tower_id, code, name, responsible, slug, system_id) VALUES (?, ?, ?, ?, ?, ?)`,
        tower.id,
        code,
        name,
        responsible,
        slug,
        systemId,
      );
      let n = 0;
      if (copyFromId !== null) {
        const pkgs = await query<{
          id: number;
          code: string;
          seq_no: string | null;
          name: string;
          floor_label: string | null;
          drawing_url: string | null;
          start_date: string | null;
          end_date: string | null;
          duration_days: number | null;
          assigned_to: number | null;
          assigned_manual: boolean;
          sort_order: number;
        }>(
          `SELECT id, code, seq_no, name, floor_label, drawing_url, start_date, end_date, duration_days, assigned_to, assigned_manual, sort_order
             FROM work_packages WHERE sheet_type_id = ? ORDER BY sort_order, id`,
          copyFromId,
        );
        for (const p of pkgs) {
          const newPkgId = await insertId(
            `INSERT INTO work_packages (sheet_type_id, code, seq_no, name, floor_label, drawing_url, start_date, end_date, duration_days, assigned_to, assigned_manual, sort_order, status, progress)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
            newId,
            p.code,
            p.seq_no,
            p.name,
            p.floor_label,
            p.drawing_url,
            p.start_date,
            p.end_date,
            p.duration_days,
            p.assigned_to,
            p.assigned_manual,
            p.sort_order,
          );

          const tasks = await query<{
            id: number;
            code: string;
            seq_no: string | null;
            name: string;
            note: string | null;
            sort_order: number;
            start_date: string | null;
            end_date: string | null;
            duration_days: number | null;
            assigned_to: number | null;
            assigned_manual: boolean;
            drawing_url: string | null;
          }>(
            `SELECT id, code, seq_no, name, note, sort_order, start_date, end_date, duration_days, assigned_to, assigned_manual, drawing_url
               FROM tasks WHERE package_id = ? ORDER BY sort_order, id`,
            p.id,
          );
          for (const t of tasks) {
            const newTaskId = await insertId(
              `INSERT INTO tasks (package_id, code, seq_no, name, note, start_date, end_date, duration_days, assigned_to, assigned_manual, drawing_url, sort_order, status, progress_percent)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
              newPkgId,
              t.code,
              t.seq_no,
              t.name,
              t.note,
              t.start_date,
              t.end_date,
              t.duration_days,
              t.assigned_to,
              t.assigned_manual,
              t.drawing_url,
              t.sort_order,
            );
            n++;

            const dims = await query<{ dimension_label: string; sort_order: number }>(
              `SELECT dimension_label, sort_order FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`,
              t.id,
            );
            if (dims.length > 0) {
              const ph = dims.map(() => "(?, ?, 0, ?)").join(", ");
              const vals = dims.flatMap((d) => [newTaskId, d.dimension_label, d.sort_order]);
              await run(
                `INSERT INTO progress_dimensions (task_id, dimension_label, installed, sort_order) VALUES ${ph}`,
                ...vals,
              );
            }
          }
        }
      }
      return { id: newId, copied: n };
    });
    sheetId = result.id;
    copied = result.copied;
  } catch (err) {
    if ((err as Error).message === KHONG_CON_QUYEN)
      return NextResponse.json(
        { error: "Bạn không có quyền tạo sheet (chỉ Admin/PM)" },
        { status: 403 },
      );
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: `Đường dẫn hoặc mã sheet đã được dùng` }, { status: 409 });
    throw err;
  }

  return NextResponse.json(
    { sheet: { id: sheetId, code, name, responsible, slug }, copiedTasks: copied },
    { status: 201 },
  );
}

// PUT /api/sheets — lưu thứ tự mới cho các sheet (Admin/PM).
// body: { ids: number[] } — mảng sheetId theo thứ tự mong muốn.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được sắp xếp thứ tự" }, { status: 403 });

  // Cách ly dự án (P1-6): chỉ sắp xếp sheet của dự án đang chọn.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Không tìm thấy dự án đang chọn" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const rawIds: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
  if (rawIds.length === 0) return NextResponse.json({ error: "ids rỗng" }, { status: 400 });
  if (rawIds.length > MAX_REORDER_IDS)
    return NextResponse.json(
      { error: `Tối đa ${MAX_REORDER_IDS} sheet mỗi lần sắp xếp` },
      { status: 422 },
    );

  const ids = rawIds.map((v) => Number(v));
  if (ids.some((n) => !Number.isInteger(n) || n <= 0))
    return NextResponse.json({ error: "ids phải là số nguyên dương" }, { status: 422 });
  if (new Set(ids).size !== ids.length)
    return NextResponse.json({ error: "ids bị trùng" }, { status: 422 });

  // 1 transaction: chỉ cập nhật sheet thuộc dự án đang chọn (+ org); số dòng cập nhật phải
  // bằng số id — lệch (có id ngoài scope/không tồn tại) thì rollback toàn bộ và trả 404.
  const NGOAI_SCOPE = "SHEET_NGOAI_SCOPE";
  try {
    await withTransaction(async () => {
      // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale).
      if (!(await kiemQuyenTaiLucGhi(() => CAN.editStructure(user.role))))
        throw new Error(KHONG_CON_QUYEN);
      const { changes } = await run(
        `UPDATE sheet_types st SET sort_order = v.ord
           FROM unnest(?::int[]) WITH ORDINALITY AS v(id, ord), towers tw, projects p
          WHERE st.id = v.id AND tw.id = st.tower_id AND p.id = tw.project_id
            AND tw.project_id = ? AND p.org_id = ?`,
        ids,
        projectId,
        user.orgId,
      );
      if (changes !== ids.length) throw new Error(NGOAI_SCOPE);
    });
  } catch (err) {
    if ((err as Error).message === KHONG_CON_QUYEN)
      return NextResponse.json({ error: "Chỉ Admin/PM được sắp xếp thứ tự" }, { status: 403 });
    if ((err as Error).message === NGOAI_SCOPE)
      return NextResponse.json({ error: "Không tìm thấy sheet" }, { status: 404 });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
