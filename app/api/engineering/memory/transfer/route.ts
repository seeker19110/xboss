import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { queryTransferredLessons } from "@/lib/engineering-memory-bank";

export const dynamic = "force-dynamic";

// POST /api/engineering/memory/transfer — Truy vấn chuyển giao tri thức & định mức cho gói thầu/hạng mục mới
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền tra cứu chuyển giao tri thức" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const { category, workPackageCode } = body;

    if (!category) {
      return NextResponse.json({ error: "Cần cung cấp category" }, { status: 422 });
    }

    const results = await queryTransferredLessons({
      category,
      workPackageCode,
    });

    return NextResponse.json(results);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
