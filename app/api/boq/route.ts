import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

type BoqRow = {
  id: number;
  code: string;
  name: string;
  unit: string;
  disciplineId: number | null;
  disciplineCode: string | null;
  disciplineName: string | null;
  disciplineColor: string | null;
  qtyContract: number;
  unitPrice: number;
  qtySub: number;
  subUnitPrice: number;
  note: string | null;
  sortOrder: number;
  map: {
    taskId: number;
    taskCode: string;
    taskName: string;
    weight: number;
    progressPercent: number;
  }[];
};

// GET /api/boq?discipline=<code> — danh sách dòng BOQ + tổng hợp KL 3 lớp
// (nhận thầu / giao thầu / thực hiện). KL thực hiện tính động từ boq_task_map.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const discipline = req.nextUrl.searchParams.get("discipline")?.trim() || null;

  const rows = await query<BoqRow>(
    `SELECT bi.id, bi.code, bi.name, bi.unit,
            bi.discipline_id AS "disciplineId", d.code AS "disciplineCode",
            d.name AS "disciplineName", d.color AS "disciplineColor",
            bi.qty_contract AS "qtyContract", bi.unit_price AS "unitPrice",
            bi.qty_sub AS "qtySub", bi.sub_unit_price AS "subUnitPrice",
            bi.note, bi.sort_order AS "sortOrder",
            COALESCE(
              json_agg(
                json_build_object(
                  'taskId', t.id, 'taskCode', t.code, 'taskName', t.name,
                  'weight', m.weight, 'progressPercent', t.progress_percent
                ) ORDER BY t.code
              ) FILTER (WHERE t.id IS NOT NULL),
              '[]'
            ) AS map
       FROM boq_items bi
       LEFT JOIN disciplines d ON d.id = bi.discipline_id
       LEFT JOIN boq_task_map m ON m.boq_item_id = bi.id
       LEFT JOIN tasks t ON t.id = m.task_id
      ${discipline ? "WHERE d.code = ?" : ""}
      GROUP BY bi.id, d.code, d.name, d.color
      ORDER BY bi.sort_order, bi.id`,
    ...(discipline ? [discipline] : []),
  );

  let contractValue = 0;
  let subValue = 0;
  let executedValue = 0;
  const items = rows.map((r) => {
    const executedFraction = r.map.reduce(
      (sum, m) => sum + Number(m.weight) * Number(m.progressPercent ?? 0),
      0,
    );
    const executedQty = Number(r.qtyContract) * executedFraction;
    contractValue += Number(r.qtyContract) * Number(r.unitPrice);
    subValue += Number(r.qtySub) * Number(r.subUnitPrice);
    executedValue += executedQty * Number(r.unitPrice);
    return { ...r, executedQty };
  });

  return NextResponse.json({ items, totals: { contractValue, subValue, executedValue } });
}

// POST /api/boq — tạo dòng BOQ mới (Admin/PM). Check trùng BOQCODE xuyên toàn hệ thống.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền tạo dòng BOQ (chỉ Admin/PM)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const unit = typeof body?.unit === "string" ? body.unit.trim() : "";
  if (!code || !name || !unit)
    return NextResponse.json({ error: "Thiếu mã, tên hoặc đơn vị tính" }, { status: 422 });

  const takenBy = await boqTakenBy(code);
  if (takenBy)
    return NextResponse.json(
      { error: `Mã "${code}" đã được dùng bởi ${takenBy}` },
      { status: 409 },
    );

  let disciplineId: number | null = null;
  if (body?.disciplineId != null) {
    disciplineId = Number(body.disciplineId);
    if (
      !Number.isInteger(disciplineId) ||
      !(await queryOne(`SELECT id FROM disciplines WHERE id = ?`, disciplineId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  const qtyContract = Number(body?.qtyContract) || 0;
  const unitPrice = Number(body?.unitPrice) || 0;
  const qtySub = Number(body?.qtySub) || 0;
  const subUnitPrice = Number(body?.subUnitPrice) || 0;
  const note = typeof body?.note === "string" ? body.note.trim() || null : null;
  const sortOrder = Number.isInteger(body?.sortOrder) ? Number(body.sortOrder) : 0;

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO boq_items (code, name, unit, discipline_id, qty_contract, unit_price, qty_sub, sub_unit_price, note, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      name,
      unit,
      disciplineId,
      qtyContract,
      unitPrice,
      qtySub,
      subUnitPrice,
      note,
      sortOrder,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: `Mã "${code}" đã tồn tại` }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ id }, { status: 201 });
}
