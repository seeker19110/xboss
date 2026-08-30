import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { normalizeCadLayers, convertTcvn3ToUnicode } from "@/lib/ky-thuat/engineering-cad-skills";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad/normalize — Chuẩn hóa layer và sửa lỗi font tiếng Việt
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền chuẩn hóa CAD" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { rawLayers, legacyText } = body;

    const normalizedLayers = rawLayers ? normalizeCadLayers(rawLayers) : {};
    const unicodeText = legacyText ? convertTcvn3ToUnicode(legacyText) : null;

    return NextResponse.json({
      normalizedLayers,
      unicodeText,
      status: "success",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
