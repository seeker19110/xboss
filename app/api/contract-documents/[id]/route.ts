import { NextRequest, NextResponse } from "next/server";
import { readFile, unlink } from "node:fs/promises";
import { queryOne, run } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { photoPath } from "@/lib/photos";

export const dynamic = "force-dynamic";

type ContractDocRow = {
  id: number;
  file_name: string;
  mime_type: string;
  original_name: string | null;
  uploaded_by: number | null;
};

// Lấy tài liệu hợp đồng, lọc theo dự án đang chọn (M22) — chặn xem/xoá tài liệu
// của hợp đồng thuộc dự án khác qua đoán/liệt kê id.
async function getDocInProject(
  id: number,
  projectId: number | null,
): Promise<ContractDocRow | undefined> {
  const conds = ["cd.id = ?"];
  const args: unknown[] = [id];
  if (projectId != null) {
    conds.push("c.project_id = ?");
    args.push(projectId);
  }
  return queryOne<ContractDocRow>(
    `SELECT cd.id, cd.file_name, cd.mime_type, cd.original_name, cd.uploaded_by
       FROM contract_documents cd JOIN contracts c ON c.id = cd.contract_id
      WHERE ${conds.join(" AND ")}`,
    ...args,
  );
}

// GET /api/contract-documents/:id — stream file đính kèm hợp đồng (vai trò xem thanh toán).
export async function GET(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewPayments(user.role))
    return NextResponse.json({ error: "Không có quyền xem tài liệu này" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const doc = await getDocInProject(id, projectId);
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  const path = photoPath(doc.file_name);
  if (!path) return NextResponse.json({ error: "Tên file không hợp lệ" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch {
    return NextResponse.json({ error: "File không còn trên đĩa" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": doc.mime_type,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${encodeURIComponent(doc.original_name ?? doc.file_name)}"`,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

// DELETE /api/contract-documents/:id — xoá file đính kèm. Người upload hoặc Admin/PM.
export async function DELETE(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const projectId = await getCurrentProjectId(user);
  const doc = await getDocInProject(id, projectId);
  if (!doc) return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });

  if (doc.uploaded_by !== user.id && !CAN.manageContracts(user.role))
    return NextResponse.json(
      { error: "Chỉ người upload hoặc Admin/PM được xoá tài liệu" },
      { status: 403 },
    );

  await run(`DELETE FROM contract_documents WHERE id = ?`, id);
  const path = photoPath(doc.file_name);
  if (path)
    await unlink(path).catch(() => {
      /* file đã mất trên đĩa — bỏ qua */
    });

  return NextResponse.json({ deleted: id });
}
