import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, withProjectScope } from "@/lib/db";
import { requireApiKey } from "@/lib/api-keys";

export const dynamic = "force-dynamic";

// GET /api/v1/payment-certs?page= — chứng chỉ thanh toán đọc-only (M49 PR1). Scope
// read_finance (dữ liệu tài chính). KHÔNG kèm số tiền chi tiết items ở v1. Lọc theo dự
// án của key qua contracts.project_id (M27).
export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req, "read_finance");
  if (ctx instanceof Response) return ctx;
  const { projectId } = ctx;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = 100;
  const offset = (page - 1) * limit;

  const from = `FROM payment_certs pc
       JOIN contracts c ON pc.contract_id = c.id
      WHERE c.project_id = ?`;

  const { totalRow, rows } = await withProjectScope(projectId, async () => ({
    totalRow: await queryOne<{ total: number }>(`SELECT COUNT(*) AS total ${from}`, projectId),
    rows: await query(
      `SELECT pc.id, pc.code, pc.contract_id AS "contractId", pc.period_no AS "periodNo",
              pc.status, pc.submitted_at AS "submittedAt", pc.decided_at AS "decidedAt"
         ${from}
        ORDER BY pc.id
        LIMIT ? OFFSET ?`,
      projectId,
      limit,
      offset,
    ),
  }));

  return NextResponse.json({ data: rows, page, total: totalRow?.total ?? 0 });
}
