import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, insertId, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { boqTakenBy } from "@/lib/khoi-luong/boq";
import { visibleProjectIds } from "@/lib/ha-tang/projects";
import { sheetTypeProjectId } from "@/lib/tien-do/workpackages";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

// POST /api/workpackages
// body: { sheetTypeId, code, name, floorLabel?, boqCode?, afterId? }
// afterId: chèn sau work package có id này (null = thêm vào cuối).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM mới thêm được nhóm" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sheetTypeId = Number(body.sheetTypeId);
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (isNaN(sheetTypeId) || !code || !name)
    return NextResponse.json({ error: "Thiếu sheetTypeId / code / name" }, { status: 400 });

  // Chống tạo xuyên dự án: sheetTypeId phải thuộc dự án user thấy được (vá W0).
  const visible = await visibleProjectIds(user);
  const sheetProjectId = await sheetTypeProjectId(sheetTypeId);
  if (sheetProjectId == null || !visible.includes(sheetProjectId))
    return NextResponse.json({ error: "sheetTypeId không tồn tại" }, { status: 404 });

  // Kiểm trùng code trong sheet.
  const dup = await queryOne(
    `SELECT id FROM work_packages WHERE sheet_type_id = ? AND code = ?`,
    sheetTypeId,
    code,
  );
  if (dup)
    return NextResponse.json({ error: `Mã "${code}" đã tồn tại trong sheet này` }, { status: 409 });

  const boqCode = String(body.boqCode ?? "").trim() || null;
  if (boqCode) {
    const taken = await boqTakenBy(boqCode, user.orgId);
    if (taken)
      return NextResponse.json(
        { error: `Mã BOQ "${boqCode}" đã được dùng bởi ${taken}` },
        { status: 409 },
      );
  }

  // 23505 từ unique index (sheet_type_id, lower(code)) bắt race 2 người dùng cùng thêm
  // trùng mã đồng thời (check-rồi-insert ở trên không đủ chống TOCTOU).
  let id: number;
  try {
    // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (dời thứ tự + chèn nhóm).
    const kq = await ghiNeuConQuyen(
      () => CAN.editStructure(user.role),
      async () => {
        const afterId = body.afterId ? Number(body.afterId) : null;
        let sortOrder: number;

        if (afterId) {
          const after = await queryOne<{ sort_order: number }>(
            `SELECT sort_order FROM work_packages WHERE id = ? AND sheet_type_id = ?`,
            afterId,
            sheetTypeId,
          );
          if (!after) return { loi: "afterId không hợp lệ" } as const;
          sortOrder = after.sort_order + 1;
          await run(
            `UPDATE work_packages SET sort_order = sort_order + 1 WHERE sheet_type_id = ? AND sort_order >= ?`,
            sheetTypeId,
            sortOrder,
          );
        } else {
          const maxRow = await queryOne<{ m: number | null }>(
            `SELECT MAX(sort_order) AS m FROM work_packages WHERE sheet_type_id = ?`,
            sheetTypeId,
          );
          sortOrder = (maxRow?.m ?? 0) + 1;
        }

        const newId = await insertId(
          `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, boq_code, sort_order, status, progress)
       VALUES (?, ?, ?, ?, ?, ?, 'chuan_bi', 0)`,
          sheetTypeId,
          code,
          name,
          body.floorLabel ? String(body.floorLabel).trim() : null,
          boqCode,
          sortOrder,
        );
        return { id: newId } as const;
      },
    );
    if (!kq.ok)
      return NextResponse.json({ error: "Chỉ Admin/PM mới thêm được nhóm" }, { status: 403 });
    if ("loi" in kq.value) return NextResponse.json({ error: kq.value.loi }, { status: 400 });
    id = kq.value.id;
  } catch (err) {
    if ((err as { code?: string }).code === "23505")
      return NextResponse.json(
        { error: `Mã "${code}" đã tồn tại trong sheet này` },
        { status: 409 },
      );
    throw err;
  }

  return NextResponse.json({ id }, { status: 201 });
}
