import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  listSubcontractors,
  avgEvaluationScore,
  subcontractorDebt,
} from "@/lib/hien-truong/subcontractors";
import {
  MONEY_FORMAT_HEADER,
  isMoneyPrecisionError,
  moneyToWire,
  moneyWireFormat,
} from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

// GET /api/subcontractors — danh sách NTP + tổng hợp cơ bản (điểm đánh giá TB kỳ gần
// nhất, công nợ). Mọi vai trò đăng nhập xem được; subcon chỉ thấy đúng NTP của mình
// (users.supplier_id, M15) — không phải 403, chỉ lọc danh sách còn 1 dòng hoặc rỗng.
// S10c (A3-FR06): header decimal-string-v1 → `outstanding` là chuỗi canonical + `moneyFormat`;
// legacy → number, ngoài biên round-trip → 422 `money_precision_unsupported`.
export async function GET(req: NextRequest) {
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

  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  try {
    return NextResponse.json(
      {
        items: items.map((it) => ({ ...it, outstanding: moneyToWire(it.outstanding, format) })),
        ...nhanDinhDangTien(format),
      },
      { headers: HEADERS_API_TIEN },
    );
  } catch (err) {
    if (!isMoneyPrecisionError(err)) throw err;
    return NextResponse.json(LOI_TIEN_VUOT_DINH_DANG_CU, {
      status: 422,
      headers: HEADERS_API_TIEN,
    });
  }
}
