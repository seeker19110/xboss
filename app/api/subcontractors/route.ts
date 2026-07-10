import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { listSubcontractors, avgEvaluationScore, subcontractorDebt } from "@/lib/subcontractors";

export const dynamic = "force-dynamic";

// GET /api/subcontractors — danh sách NTP + tổng hợp cơ bản (điểm đánh giá TB kỳ gần
// nhất, công nợ). Mọi vai trò đăng nhập xem được; subcon chỉ thấy đúng NTP của mình
// (users.supplier_id, M15) — không phải 403, chỉ lọc danh sách còn 1 dòng hoặc rỗng.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  let list = await listSubcontractors(projectId ?? undefined);

  if (user.role === "subcon") {
    const row = await queryOne<{ supplierId: number | null }>(
      `SELECT supplier_id AS "supplierId" FROM users WHERE id = ?`,
      user.id,
    );
    list = list.filter((s) => s.id === row?.supplierId);
  }

  const items = await Promise.all(
    list.map(async (s) => {
      const [avg, debt] = await Promise.all([avgEvaluationScore(s.id), subcontractorDebt(s.id)]);
      return {
        ...s,
        avgScore: avg.avgScore,
        latestPeriod: avg.latestPeriod,
        outstanding: debt.outstanding,
      };
    }),
  );

  return NextResponse.json({ items });
}
