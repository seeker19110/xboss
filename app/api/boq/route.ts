import { NextRequest, NextResponse } from "next/server";
import { moneyInputErrorBody, parseOptionalMoneyInput } from "@/lib/nen/money";
import { query, queryOne, insertId, withProjectScope } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { boqTakenBy } from "@/lib/khoi-luong/boq";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyWireFormat,
  parseMoneyExact,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  moneyFieldsToWire,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

type BoqRow = {
  id: number;
  code: string;
  name: string;
  unit: string;
  systemId: number | null;
  systemCode: string | null;
  systemName: string | null;
  systemColor: string | null;
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
const VO_APPROVED_STATUSES = ["approved", "partially_approved", "contract_added"];

type TotalsRow = { contractValue: string; subValue: string; executedValue: string };

// GET /api/boq?system=<code>&includeVo=0 — danh sách dòng BOQ + tổng hợp KL 3
// lớp (nhận thầu / giao thầu / thực hiện). KL thực hiện tính động từ boq_task_map.
// includeVo mặc định true: hiện cả dòng phát sinh (VO, M6, badge "VO" ở UI) — dòng
// VO chưa duyệt vẫn hiện để theo dõi nhưng không cộng vào contractValue.
// S10 đuôi (A3): totals tính exact trong SQL (NUMERIC, SUM rồi mới ROUND 2 số lẻ) — không cộng
// float JS. Header decimal-string-v1 → totals là chuỗi canonical + `moneyFormat`; legacy → number,
// ngoài biên → 422 `money_precision_unsupported`.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const system = req.nextUrl.searchParams.get("system")?.trim() || null;
  const includeVo = req.nextUrl.searchParams.get("includeVo") !== "0";
  const projectId = await getCurrentProjectId(user);
  // A1-AC02: không có dự án khả kiến → danh sách rỗng đúng shape, không query nghiệp vụ.
  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  if (projectId == null)
    return NextResponse.json(
      {
        items: [],
        totals: moneyFieldsToWire(
          { contractValue: 0n, subValue: 0n, executedValue: 0n },
          ["contractValue", "subValue", "executedValue"],
          format,
        ),
        ...nhanDinhDangTien(format),
      },
      { headers: HEADERS_API_TIEN },
    );
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  const conds = [];
  const args: unknown[] = [];
  if (system) {
    conds.push("d.code = ?");
    args.push(system);
  }
  if (!includeVo) conds.push("bi.vo_id IS NULL");
  conds.push("bi.project_id = ?");
  args.push(projectId);
  const where = `WHERE ${conds.join(" AND ")}`;

  const statusIn = VO_APPROVED_STATUSES.map(() => "?").join(",");
  const [rows, totalsRows] = await withProjectScope(projectId, () =>
    Promise.all([
      query<BoqRow>(
        `SELECT bi.id, bi.code, bi.name, bi.unit,
              bi.system_id AS "systemId", d.code AS "systemCode",
              d.name AS "systemName", d.color AS "systemColor",
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
         LEFT JOIN systems d ON d.id = bi.system_id
         LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
         LEFT JOIN boq_task_map m ON m.boq_item_id = bi.id
         LEFT JOIN tasks t ON t.id = m.task_id
        ${where}
        GROUP BY bi.id, d.code, d.name, d.color, vo.code, vo.status
        ORDER BY bi.sort_order, bi.id`,
        ...args,
      ),
      query<TotalsRow>(
        `SELECT ROUND(COALESCE(SUM(
                CASE WHEN bi.vo_id IS NULL OR vo.status IN (${statusIn})
                     THEN (CASE WHEN bi.vo_id IS NULL THEN bi.qty_contract
                                ELSE COALESCE(bi.qty_approved, 0) END) * bi.unit_price
                     ELSE 0 END), 0), 2)::text AS "contractValue",
              ROUND(COALESCE(SUM(
                COALESCE(bi.qty_sub, 0) * COALESCE(bi.sub_unit_price, 0)), 0), 2)::text AS "subValue",
              ROUND(COALESCE(SUM(
                bi.qty_contract * bi.unit_price * COALESCE((
                  SELECT SUM(m.weight * COALESCE(t.progress_percent, 0)::text::numeric)
                    FROM boq_task_map m JOIN tasks t ON t.id = m.task_id
                   WHERE m.boq_item_id = bi.id), 0)), 0), 2)::text AS "executedValue"
         FROM boq_items bi
         LEFT JOIN systems d ON d.id = bi.system_id
         LEFT JOIN variation_orders vo ON vo.id = bi.vo_id
        ${where}`,
        ...VO_APPROVED_STATUSES,
        ...args,
      ),
    ]),
  );

  const items = rows.map((r) => {
    const executedFraction = r.map.reduce(
      (sum, m) => sum + Number(m.weight) * Number(m.progressPercent ?? 0),
      0,
    );
    const executedQty = Number(r.qtyContract) * executedFraction;
    return { ...r, executedQty };
  });

  const t = totalsRows[0];
  try {
    const totals = moneyFieldsToWire(
      {
        contractValue: parseMoneyExact(t.contractValue),
        subValue: parseMoneyExact(t.subValue),
        executedValue: parseMoneyExact(t.executedValue),
      },
      ["contractValue", "subValue", "executedValue"],
      format,
    );
    return NextResponse.json(
      { items, totals, ...nhanDinhDangTien(format) },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
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
  const blocked = await assertModuleEnabled("materials", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const unit = typeof body?.unit === "string" ? body.unit.trim() : "";
  if (!code || !name || !unit)
    return NextResponse.json({ error: "Thiếu mã, tên hoặc đơn vị tính" }, { status: 422 });

  const takenBy = await boqTakenBy(code, user.orgId);
  if (takenBy)
    return NextResponse.json(
      { error: `Mã "${code}" đã được dùng bởi ${takenBy}` },
      { status: 409 },
    );

  let systemId: number | null = null;
  if (body?.systemId != null) {
    systemId = Number(body.systemId);
    if (
      !Number.isInteger(systemId) ||
      !(await queryOne(`SELECT id FROM systems WHERE id = ?`, systemId))
    )
      return NextResponse.json({ error: "Hệ không hợp lệ" }, { status: 422 });
  }

  const qtyContract = Number(body?.qtyContract) || 0;
  const qtySub = Number(body?.qtySub) || 0;
  // S10: đơn giá qua parser tiền (trước đây `Number(..) || 0` nuốt cả "1.500" lẫn chữ rác).
  let unitPrice: string;
  let subUnitPrice: string;
  try {
    unitPrice = parseOptionalMoneyInput(body?.unitPrice, { label: "Đơn giá" })?.text ?? "0.00";
    subUnitPrice =
      parseOptionalMoneyInput(body?.subUnitPrice, { label: "Đơn giá thầu phụ" })?.text ?? "0.00";
  } catch (e) {
    const loi = moneyInputErrorBody(e);
    if (!loi) throw e;
    return NextResponse.json(loi.body, { status: loi.status });
  }
  if (unitPrice.startsWith("-") || subUnitPrice.startsWith("-"))
    return NextResponse.json({ error: "Đơn giá phải là số không âm" }, { status: 422 });
  const note = typeof body?.note === "string" ? body.note.trim() || null : null;
  const sortOrder = Number.isInteger(body?.sortOrder) ? Number(body.sortOrder) : 0;

  let id: number;
  try {
    id = await insertId(
      `INSERT INTO boq_items (code, name, unit, system_id, qty_contract, unit_price, qty_sub, sub_unit_price, note, sort_order, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code,
      name,
      unit,
      systemId,
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
