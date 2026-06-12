import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { sheetVersion } from "@/lib/version";
import { boqTakenBy } from "@/lib/boq";

export const dynamic = "force-dynamic";

// POST /api/workpackages
// body: { sheetTypeId, code, name, floorLabel?, boqCode?, afterId? }
// afterId: chÃ¨n sau work package cÃ³ id nÃ y (null = thÃªm vÃ o cuá»‘i).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ChÆ°a Ä‘Äƒng nháº­p" }, { status: 401 });
  if (!CAN.editStructure(user.role)) return NextResponse.json({ error: "Chá»‰ Admin/PM má»›i thÃªm Ä‘Æ°á»£c nhÃ³m" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sheetTypeId = Number(body.sheetTypeId);
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (isNaN(sheetTypeId) || !code || !name)
    return NextResponse.json({ error: "Thiáº¿u sheetTypeId / code / name" }, { status: 400 });

  // Kiá»ƒm trÃ¹ng code trong sheet.
  const dup = await queryOne(`SELECT id FROM work_packages WHERE sheet_type_id = ? AND code = ?`, sheetTypeId, code);
  if (dup) return NextResponse.json({ error: `MÃ£ "${code}" Ä‘Ã£ tá»“n táº¡i trong sheet nÃ y` }, { status: 409 });

  const boqCode = String(body.boqCode ?? "").trim() || null;
  if (boqCode) {
    const taken = await boqTakenBy(boqCode);
    if (taken) return NextResponse.json({ error: `MÃ£ BOQ "${boqCode}" Ä‘Ã£ Ä‘Æ°á»£c dÃ¹ng bá»Ÿi ${taken}` }, { status: 409 });
  }

  const afterId = body.afterId ? Number(body.afterId) : null;
  let sortOrder: number;

  if (afterId) {
    const after = await queryOne<{ sort_order: number }>(
      `SELECT sort_order FROM work_packages WHERE id = ? AND sheet_type_id = ?`, afterId, sheetTypeId);
    if (!after) return NextResponse.json({ error: "afterId khÃ´ng há»£p lá»‡" }, { status: 400 });
    sortOrder = after.sort_order + 1;
    await run(`UPDATE work_packages SET sort_order = sort_order + 1 WHERE sheet_type_id = ? AND sort_order >= ?`, sheetTypeId, sortOrder);
  } else {
    const maxRow = await queryOne<{ m: number | null }>(`SELECT MAX(sort_order) AS m FROM work_packages WHERE sheet_type_id = ?`, sheetTypeId);
    sortOrder = (maxRow?.m ?? 0) + 1;
  }

  const id = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, boq_code, sort_order, status, progress)
     VALUES (?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
    sheetTypeId, code, name, body.floorLabel ? String(body.floorLabel).trim() : null, boqCode, sortOrder);

  // Bump version Ä‘á»ƒ SSE thÃ´ng bÃ¡o ngÆ°á»i khÃ¡c.
  const st = await queryOne<{ code: string }>(`SELECT code FROM sheet_types WHERE id = ?`, sheetTypeId);
  if (st) await sheetVersion(st.code);

  return NextResponse.json({ id }, { status: 201 });
}

