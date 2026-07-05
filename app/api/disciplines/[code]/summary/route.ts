import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDisciplineSummary } from "@/lib/disciplines";

export const dynamic = "force-dynamic";

// GET /api/disciplines/:code/summary — KPI hệ (mọi user đăng nhập): % tiến độ bình quân
// theo task các sheet thuộc hệ, số task trễ, chờ nghiệm thu, sheet con kèm % từng sheet,
// nhà thầu phụ trách theo phạm vi tầng/khu. Khối mở rộng (ngân sách M2, NCR M3, bản vẽ M8,
// mặt bằng M14) trả null tới khi module tương ứng được triển khai — UI ẩn khi null.
export async function GET(
  _req: Request,
  { params: paramsP }: { params: Promise<{ code: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { code } = await paramsP;
  const summary = await getDisciplineSummary(code);
  if (!summary) return NextResponse.json({ error: "Không tìm thấy hệ" }, { status: 404 });

  return NextResponse.json(summary);
}
