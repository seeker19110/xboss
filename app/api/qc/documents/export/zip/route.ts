import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { ZipArchive } from "archiver";
import { query } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/qaqc";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

// Đóng gói zip thật các file gốc của hồ sơ chất lượng khớp bộ lọc (bổ sung cho
// route PDF danh mục /api/qc/documents/export — route đó chỉ liệt kê, không nén file).
type DocRow = {
  taskCode: string;
  fileName: string | null;
  originalName: string | null;
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.export(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM được xuất hồ sơ" }, { status: 403 });

  const sheetTypeId = req.nextUrl.searchParams.get("sheetTypeId");
  const floor = req.nextUrl.searchParams.get("floor");
  const category = req.nextUrl.searchParams.get("category");
  if (category && !DOC_CATEGORIES.includes(category as DocCategory))
    return NextResponse.json({ error: "Loại hồ sơ không hợp lệ" }, { status: 422 });

  const conds: string[] = ["d.task_id IS NOT NULL"];
  const values: unknown[] = [];
  if (sheetTypeId) {
    conds.push("wp.sheet_type_id = ?");
    values.push(parseInt(sheetTypeId));
  }
  if (floor) {
    conds.push("wp.floor_label = ?");
    values.push(floor);
  }
  if (category) {
    conds.push("d.doc_category = ?");
    values.push(category);
  }

  const rows = await query<DocRow>(
    `SELECT t.code AS "taskCode", d.file_name AS "fileName", d.original_name AS "originalName"
       FROM task_documents d
       JOIN tasks t ON t.id = d.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
      WHERE ${conds.join(" AND ")}
      ORDER BY t.code`,
    ...values,
  );

  const archive = new ZipArchive();
  const chunks: Buffer[] = [];
  const done = new Promise<void>((resolve, reject) => {
    archive.on("data", (c: Buffer) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    archive.on("end", resolve);
    archive.on("error", reject);
  });

  const usedNames = new Set<string>();
  for (const r of rows) {
    if (!r.fileName) continue;
    const p = photoPath(r.fileName);
    if (!p || !existsSync(p)) continue;
    let entryName = `${r.taskCode}_${r.originalName || r.fileName}`;
    // Tránh trùng tên entry trong zip (vd nhiều hồ sơ cùng task + cùng tên file gốc).
    if (usedNames.has(entryName)) entryName = `${r.taskCode}_${r.fileName}`;
    usedNames.add(entryName);
    archive.file(p, { name: entryName });
  }
  archive.finalize();
  await done;

  return new NextResponse(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="ho-so-${floor ?? "tat-ca"}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
