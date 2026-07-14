import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { DOCUMENT_SOURCES, listAllDocuments, type DocumentSource } from "@/lib/documents-hub";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

// GET /api/documents-hub?system=&floor=&source=&q= — view hợp nhất mọi loại file
// đã có (nghiệm thu/hồ sơ chất lượng, hợp đồng, phát sinh, bản vẽ) + file tự do cấp
// dự án. Mọi user đăng nhập gọi được — quyền xem từng nguồn lọc bên trong
// listAllDocuments (giữ nguyên logic gốc của module đó, không nới lỏng quyền).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const sourceRaw = sp.get("source")?.trim() || undefined;
  if (sourceRaw && !DOCUMENT_SOURCES.includes(sourceRaw as DocumentSource))
    return NextResponse.json({ error: "Loại nguồn không hợp lệ" }, { status: 422 });

  const projectId = await getCurrentProjectId(user);
  const documents = await listAllDocuments(user, projectId, {
    system: sp.get("system")?.trim() || undefined,
    floor: sp.get("floor")?.trim() || undefined,
    source: sourceRaw as DocumentSource | undefined,
    q: sp.get("q")?.trim() || undefined,
  });
  return NextResponse.json({ documents });
}
