import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { query } from "@/lib/db";
import { getCurrentProjectId } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ code: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { code } = await paramsP;
  const systemId = await resolveSystemId(code);
  if (!systemId || systemId === -1) {
    return NextResponse.json({ error: "Không tìm thấy hệ" }, { status: 404 });
  }

  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "ke_hoach" && kind !== "tracking") {
    return NextResponse.json({ error: "Tham số kind không hợp lệ" }, { status: 400 });
  }

  const projectId = await getCurrentProjectId(user);

  const list = await query<{
    id: number;
    kind: string;
    originalName: string | null;
    uploadedById: number | null;
    uploadedByName: string | null;
    rowCount: number;
    matchedCount: number;
    unmatchedCount: number;
    warnings: any;
    createdAt: string;
  }>(
    `SELECT su.id, su.kind, su.original_name AS "originalName",
            su.uploaded_by AS "uploadedById", u.name AS "uploadedByName",
            su.row_count AS "rowCount", su.matched_count AS "matchedCount",
            su.unmatched_count AS "unmatchedCount", su.warnings,
            su.created_at AS "createdAt"
       FROM system_uploads su
       LEFT JOIN users u ON su.uploaded_by = u.id
      WHERE su.system_id = ? AND su.kind = ? AND (su.project_id = ? OR (su.project_id IS NULL AND ? IS NULL))
      ORDER BY su.created_at DESC
      LIMIT 20`,
    [systemId, kind, projectId, projectId],
  );

  const formatted = list.map((item) => ({
    id: item.id,
    kind: item.kind,
    originalName: item.originalName,
    uploadedBy: item.uploadedById
      ? { id: item.uploadedById, name: item.uploadedByName ?? "Unknown" }
      : null,
    rowCount: item.rowCount,
    matchedCount: item.matchedCount,
    unmatchedCount: item.unmatchedCount,
    warnings: typeof item.warnings === "string" ? JSON.parse(item.warnings) : item.warnings,
    createdAt: item.createdAt,
  }));

  return NextResponse.json(formatted);
}
