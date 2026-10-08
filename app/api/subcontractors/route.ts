import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { stripSensitive } from "@/lib/bao-mat/sensitive-fields";
import {
  listSubcontractors,
  avgEvaluationScore,
  subcontractorDebt,
} from "@/lib/hien-truong/subcontractors";
import { MONEY_FORMAT_HEADER, isMoneyPrecisionError, moneyWireFormat } from "@/lib/nen/money";
import {
  HEADERS_API_TIEN,
  LOI_TIEN_VUOT_DINH_DANG_CU,
  moneyOrNullToWire,
  nhanDinhDangTien,
} from "@/lib/nen/money-dto";

export const dynamic = "force-dynamic";

// GET /api/subcontractors — danh sách NTP + tổng hợp cơ bản (điểm đánh giá TB kỳ gần
// nhất, công nợ). Mọi vai trò đăng nhập xem được; subcon chỉ thấy đúng NTP của mình
// (users.supplier_id, M15) — không phải 403, chỉ lọc danh sách còn 1 dòng hoặc rỗng.
// QUALITY-FINAL-1 S02 (A1-AC01/AC02): chỉ NCC cùng org; công nợ chỉ HĐ dự án đang chọn và
// che (null) cho vai trò thiếu CAN.viewPayments; không có dự án khả kiến → rỗng đúng shape.
// S10c (A3-FR06): header decimal-string-v1 → `outstanding` là chuỗi canonical + `moneyFormat`;
// legacy → number, ngoài biên round-trip → 422 `money_precision_unsupported`. Che TRƯỚC rồi mới
// đổi wire: giá trị bị che giữ null ở cả hai định dạng.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const format = moneyWireFormat(req.headers.get(MONEY_FORMAT_HEADER));
  const projectId = await getCurrentProjectId(user);
  if (projectId == null)
    return NextResponse.json(
      { items: [], ...nhanDinhDangTien(format) },
      { headers: HEADERS_API_TIEN },
    );
  let list = await listSubcontractors(user.orgId, projectId);

  if (user.role === "subcon") {
    const row = await queryOne<{ supplierId: number | null }>(
      `SELECT supplier_id AS "supplierId" FROM users WHERE id = ?`,
      user.id,
    );
    list = list.filter((s) => s.id === row?.supplierId);
  }

  const items = await Promise.all(
    list.map(async (s) => {
      const [avg, debt] = await Promise.all([
        avgEvaluationScore(s.id),
        subcontractorDebt(s.id, projectId),
      ]);
      return {
        ...s,
        avgScore: avg.avgScore,
        latestPeriod: avg.latestPeriod,
        outstanding: debt.outstanding as bigint | null,
      };
    }),
  );

  try {
    return NextResponse.json(
      {
        items: stripSensitive("subcontractor", items, user).map((it) => ({
          ...it,
          outstanding: moneyOrNullToWire(it.outstanding, format),
        })),
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
