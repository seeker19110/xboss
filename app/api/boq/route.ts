import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
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
  voId: number | null;
  voCode: string | null;
  voStatus: string | null;
  qtyApproved: number | null;
  map: {
    taskId: number;
    taskCode: string;
    taskName: string;
    weight: number;
    progressPercent: number;
  }[];
};

// Trạng thái VO tính vào ngân sách/KL nhận thầu (đồng bộ lib/cost.ts + lib/vo.ts).
const VO_APPROVED_STATUSES = new Set(["approved", "partially_approved", "contract_added"]);

// GET /api/boq?discipline=<code>&includeVo=0 — danh sách dòng BOQ + tổng hợp KL 3
// lớp (nhận thầu / giao thầu / thực hiện). KL thực hiện tính động từ boq_task_map.
// includeVo mặc định true: hiện cả dòng phát sinh (VO, M6, badge "VO" ở UI) — dòng
// VO chưa duyệt vẫn hiện để theo dõi nhưng không cộng vào contractValue.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const discipline = req.nextUrl.searchParams.get("discipline")?.trim() || null;
  const includeVo = req.nextUrl.searchParams.get("includeVo") !== "0";
  const projectId = await getCurrentProjectId(user);

  const conds = [];
  const args: unknown[] = [];
  if (discipline) {
    conds.push("d.code = ?");
    args.push(discipline);
  }
  if (!includeVo) conds.push("bi.vo_id IS NULL");
  if (projectId != null) {
    conds.push("bi.project_id = ?");
    args.push(projectId);
  } else {
    conds.push("FALSE");
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

  const rows = await query<BoqRow>(
    `SELECT bi.id, bi.code, bi.name, bi.unit,
            bi.discipline_id AS "disciplineId", d.code AS "disciplineCode",
            d.name AS "disciplineName", d.color AS "disciplineColor",
            bi.qty_contract AS "qtyContract", bi.unit_price AS "unitPrice",
            bi.qty_sub AS "qtySub", bi.sub_unit_price AS "subUnitPrice",
            bi.note, bi.sort_order AS "sortOrder",
            bi.vo_id AS "voId", vo.code AS "voCode", vo.status AS "voStatus",
            bi.qty_approved AS "qtyApproved",
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
       LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
       LEFT JOIN boq_task_map m ON m.boq_item_id = bi.id
       LEFT JOIN tasks t ON t.id = m.task_id
      ${where}
      GROUP BY bi.id, d.code, d.name, d.color, vo.code, vo.status
      ORDER BY bi.sort_order, bi.id`,
    ...args,
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
    const isVo = r.voId != null;
    const countsTowardBudget =
      !isVo || (r.voStatus != null && VO_APPROVED_STATUSES.has(r.voStatus));
    const budgetQty = isVo ? Number(r.qtyApproved ?? 0) : Number(r.qtyContract);
    if (countsTowardBudget) contractValue += budgetQty * Number(r.unitPrice);
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

  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json({ error: "Chưa có dự án nào để tạo dòng BOQ" }, { status: 422 });

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
      `INSERT INTO boq_items (code, name, unit, discipline_id, qty_contract, unit_price, qty_sub, sub_unit_price, note, sort_order, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      projectId,
    );
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json({ error: `Mã "${code}" đã tồn tại` }, { status: 409 });
    throw err;
  }

  return NextResponse.json({ id }, { status: 201 });
}
