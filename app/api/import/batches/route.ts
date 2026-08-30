import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";

export const dynamic = "force-dynamic";

// GET /api/import/batches — sổ các lần import Excel (C3 §5, xem migrations/0093).
//
// Lý do tồn tại: `dim_denominator_mode` quyết định MẪU SỐ khi quy lưới checkbox → %.
// Không có endpoint này thì dữ liệu đã ghi vẫn nằm im trong DB và không ai tra được
// "task đó tính % theo chế độ nào, từ file nào" — tức là chưa thật sự tái lập được.
//
// Cùng quyền với import (Admin/PM): sổ này lộ tên file + người import.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.import(user.role))
    return NextResponse.json({ error: "Chỉ Admin/PM xem được sổ import" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200) : 50;

  const rows = await query<{
    id: number;
    sourceName: string;
    sourceSha256: string;
    sourceBytes: number | null;
    dimDenominatorMode: string;
    stats: unknown;
    importedBy: number | null;
    importedByName: string | null;
    createdAt: string;
    taskCount: number;
  }>(
    `SELECT b.id,
            b.source_name AS "sourceName",
            b.source_sha256 AS "sourceSha256",
            b.source_bytes AS "sourceBytes",
            b.dim_denominator_mode AS "dimDenominatorMode",
            b.stats,
            b.imported_by AS "importedBy",
            u.name AS "importedByName",
            b.created_at AS "createdAt",
            (SELECT COUNT(*) FROM tasks t WHERE t.import_batch_id = b.id)::int AS "taskCount"
       FROM import_batches b
       LEFT JOIN users u ON u.id = b.imported_by
      WHERE b.project_id = ?
      ORDER BY b.created_at DESC
      LIMIT ?`,
    projectId,
    limit,
  );

  return NextResponse.json({ batches: rows });
}
