import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { DOC_CATEGORIES, type DocCategory } from "@/lib/qaqc";

export const dynamic = "force-dynamic";

type DocRow = {
  id: number;
  taskId: number;
  taskCode: string;
  taskName: string;
  floorLabel: string | null;
  sheetType: string | null;
  docCategory: string | null;
  caption: string | null;
  originalName: string | null;
  mimeType: string | null;
  createdAt: string;
  uploaderName: string | null;
  sha256: string | null;
};

// GET /api/qc/documents?sheetTypeId=&floor=&category= — hồ sơ chất lượng gắn task
// (vật liệu/công việc/giai đoạn/chuyển bước/hoàn công), lọc theo hệ/tầng/loại.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sheetTypeId = req.nextUrl.searchParams.get("sheetTypeId");
  const floor = req.nextUrl.searchParams.get("floor");
  const category = req.nextUrl.searchParams.get("category");

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
    if (!DOC_CATEGORIES.includes(category as DocCategory))
      return NextResponse.json({ error: "Loại hồ sơ không hợp lệ" }, { status: 422 });
    conds.push("d.doc_category = ?");
    values.push(category);
  }

  // task_documents không có project_id riêng — suy qua task/work_package (M22).
  const projectId = await getCurrentProjectId(user);
  if (projectId != null) {
    conds.push("tw.project_id = ?");
    values.push(projectId);
  }

  const rows = await query<DocRow>(
    `SELECT d.id, d.task_id AS "taskId", t.code AS "taskCode", t.name AS "taskName",
            wp.floor_label AS "floorLabel", st.code AS "sheetType",
            d.doc_category AS "docCategory", d.caption, d.original_name AS "originalName",
            d.mime_type AS "mimeType", d.created_at AS "createdAt", u.name AS "uploaderName",
            d.sha256
       FROM task_documents d
       JOIN tasks t ON t.id = d.task_id
       LEFT JOIN work_packages wp ON wp.id = t.package_id
       LEFT JOIN sheet_types st ON st.id = wp.sheet_type_id
       LEFT JOIN towers tw ON tw.id = st.tower_id
       LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE ${conds.join(" AND ")}
      ORDER BY d.id DESC`,
    ...values,
  );
  return NextResponse.json({ documents: rows });
}
