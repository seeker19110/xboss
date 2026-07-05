import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { validateChecklistItems } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

type ChecklistRow = {
  id: number;
  name: string;
  category: string;
  disciplineId: number | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  required: boolean;
  items: unknown;
  active: boolean;
};

// GET /api/qc/checklists?discipline=<code> — mọi user đăng nhập xem mẫu checklist.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const discipline = req.nextUrl.searchParams.get("discipline")?.trim() || null;

  const rows = await query<ChecklistRow>(
    `SELECT c.id, c.name, c.category, c.discipline_id AS "disciplineId",
            d.code AS "disciplineCode", d.name AS "disciplineName",
            c.required, c.items, c.active
       FROM qc_checklists c
       LEFT JOIN disciplines d ON d.id = c.discipline_id
      ${discipline ? "WHERE d.code = ?" : ""}
      ORDER BY c.id`,
    ...(discipline ? [discipline] : []),
  );
  return NextResponse.json({ checklists: rows });
}

// POST /api/qc/checklists — tạo mẫu checklist mới (Admin/PM).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được tạo mẫu checklist" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const category = ["work", "tc", "hse"].includes(body?.category) ? body.category : "work";
  if (!name) return NextResponse.json({ error: "Thiếu tên checklist" }, { status: 422 });

  const items = body?.items ?? [];
  if (!validateChecklistItems(items))
    return NextResponse.json({ error: "Danh sách hạng mục không hợp lệ" }, { status: 422 });

  let disciplineId: number | null = null;
  if (body?.disciplineId != null) {
    disciplineId = Number(body.disciplineId);
    if (
      !Number.isInteger(disciplineId) ||
      !(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, disciplineId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  const required = body?.required === true;

  const id = await insertId(
    `INSERT INTO qc_checklists (name, category, discipline_id, required, items)
     VALUES (?, ?, ?, ?, ?::jsonb)`,
    name,
    category,
    disciplineId,
    required,
    JSON.stringify(items),
  );

  return NextResponse.json({ id }, { status: 201 });
}
