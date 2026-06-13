import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, withTransaction, todayISO } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { toSlug, SLUG_RE } from "@/lib/sheets";

export const dynamic = "force-dynamic";

// Danh sách sheet type + KPI tổng hợp.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const today = todayISO();
  const sheets = await query(
    `SELECT st.id, st.code, st.name, st.responsible, st.slug,
            COUNT(t.id) AS total,
            COALESCE(AVG(t.progress_percent), 0) AS "avgProgress",
            COALESCE(SUM(CASE WHEN t.end_date IS NOT NULL AND t.end_date < ? AND t.progress_percent < 1
                              AND t.status NOT IN ('hoan_thanh','nghiem_thu') THEN 1 ELSE 0 END), 0) AS delayed
       FROM sheet_types st
       LEFT JOIN work_packages wp ON wp.sheet_type_id = st.id
       LEFT JOIN tasks t ON t.package_id = wp.id
      GROUP BY st.id, st.code, st.name, st.responsible, st.slug
      ORDER BY st.id`,
    today,
  );
  return NextResponse.json({ sheets });
}

// POST /api/sheets — tạo trang tracking mới (Admin/PM). Body: { name, code?, slug?, copyFromId? }.
// copyFromId: copy nguyên cấu trúc sheet nguồn (nhóm, task, cột checkbox) — tiến độ reset về 0,
// BOQ không copy (phải duy nhất toàn hệ thống). Không có copyFromId thì tạo sheet rỗng.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Bạn không có quyền tạo sheet (chỉ Admin/PM)" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Thiếu tên sheet" }, { status: 400 });

  const code = (typeof body?.code === "string" && body.code.trim()) || name;
  const slug = (typeof body?.slug === "string" && body.slug.trim()) || toSlug(name);
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: "Đường dẫn không hợp lệ — chỉ dùng chữ thường a-z, số và gạch nối" }, { status: 400 });

  if (await queryOne(`SELECT id FROM sheet_types WHERE slug = ?`, slug))
    return NextResponse.json({ error: `Đường dẫn "${slug}" đã được dùng` }, { status: 409 });
  if (await queryOne(`SELECT id FROM sheet_types WHERE code = ?`, code))
    return NextResponse.json({ error: `Mã sheet "${code}" đã tồn tại` }, { status: 409 });

  // Gắn vào tower đầu tiên — DB trống thì tạo project/tower mặc định.
  let tower = await queryOne<{ id: number }>(`SELECT id FROM towers ORDER BY id LIMIT 1`);
  if (!tower) {
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Dự án mới')`);
    tower = { id: await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp A')`, projectId) };
  }

  // Sheet nguồn để copy cấu trúc (kiểm tra trước khi tạo để không để lại sheet rỗng khi lỗi).
  const copyFromId = body?.copyFromId ? Number(body.copyFromId) : null;
  if (copyFromId !== null) {
    if (!Number.isInteger(copyFromId) || !(await queryOne(`SELECT id FROM sheet_types WHERE id = ?`, copyFromId)))
      return NextResponse.json({ error: "Sheet nguồn để copy không tồn tại" }, { status: 400 });
  }

  const responsible = typeof body?.responsible === "string" ? body.responsible.trim() || null : null;

  // INSERT sheet + copy cấu trúc trong cùng 1 transaction — không bao giờ có sheet rỗng / nửa chừng.
  // 23505 từ INSERT sheet_types (slug/code trùng do TOCTOU) bị bắt ở outer catch và trả 409.
  let sheetId: number;
  let copied: number;
  try {
    const result = await withTransaction(async () => {
      const newId = await insertId(
        `INSERT INTO sheet_types (tower_id, code, name, responsible, slug) VALUES (?, ?, ?, ?, ?)`,
        tower.id, code, name, responsible, slug,
      );
      let n = 0;
      if (copyFromId !== null) {
        const pkgs = await query<{ id: number; code: string; seq_no: string | null; name: string; floor_label: string | null; drawing_url: string | null; start_date: string | null; end_date: string | null; duration_days: number | null; assigned_to: number | null; assigned_manual: boolean; sort_order: number }>(
          `SELECT id, code, seq_no, name, floor_label, drawing_url, start_date, end_date, duration_days, assigned_to, assigned_manual, sort_order
             FROM work_packages WHERE sheet_type_id = ? ORDER BY sort_order, id`, copyFromId);
        for (const p of pkgs) {
          const newPkgId = await insertId(
            `INSERT INTO work_packages (sheet_type_id, code, seq_no, name, floor_label, drawing_url, start_date, end_date, duration_days, assigned_to, assigned_manual, sort_order, status, progress)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
            newId, p.code, p.seq_no, p.name, p.floor_label, p.drawing_url, p.start_date, p.end_date, p.duration_days, p.assigned_to, p.assigned_manual, p.sort_order);

          const tasks = await query<{ id: number; code: string; seq_no: string | null; name: string; note: string | null; sort_order: number; start_date: string | null; end_date: string | null; duration_days: number | null; assigned_to: number | null; assigned_manual: boolean; drawing_url: string | null }>(
            `SELECT id, code, seq_no, name, note, sort_order, start_date, end_date, duration_days, assigned_to, assigned_manual, drawing_url
               FROM tasks WHERE package_id = ? ORDER BY sort_order, id`, p.id);
          for (const t of tasks) {
            const newTaskId = await insertId(
              `INSERT INTO tasks (package_id, code, seq_no, name, note, start_date, end_date, duration_days, assigned_to, assigned_manual, drawing_url, sort_order, status, progress_percent)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
              newPkgId, t.code, t.seq_no, t.name, t.note, t.start_date, t.end_date, t.duration_days, t.assigned_to, t.assigned_manual, t.drawing_url, t.sort_order);
            n++;

            const dims = await query<{ dimension_label: string; sort_order: number }>(
              `SELECT dimension_label, sort_order FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`, t.id);
            for (const d of dims) {
              await insertId(
                `INSERT INTO progress_dimensions (task_id, dimension_label, installed, sort_order) VALUES (?, ?, 0, ?)`,
                newTaskId, d.dimension_label, d.sort_order);
            }
          }
        }
      }
      return { id: newId, copied: n };
    });
    sheetId = result.id;
    copied = result.copied;
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: `Đường dẫn hoặc mã sheet đã được dùng` }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ sheet: { id: sheetId, code, name, responsible, slug }, copiedTasks: copied }, { status: 201 });
}
