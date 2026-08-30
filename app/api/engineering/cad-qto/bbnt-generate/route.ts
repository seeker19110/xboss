import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { generateInspectionRequestForSpools } from "@/lib/ky-thuat/engineering-cad-qto";

export const dynamic = "force-dynamic";

// POST /api/engineering/cad-qto/bbnt-generate — Sinh phiếu nghiệm thu (YCNT / BBNT) tự động từ Spools
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo yêu cầu nghiệm thu" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const { spoolIds, note } = body;

    if (!spoolIds || !Array.isArray(spoolIds) || spoolIds.length === 0) {
      return NextResponse.json(
        { error: "Cần chọn ít nhất 1 Spool để lập hồ sơ nghiệm thu" },
        { status: 422 },
      );
    }

    const result = await generateInspectionRequestForSpools(projectId, spoolIds, user.id, note);
    const { listCadSpools, generateElectronicBbntDocument } =
      await import("@/lib/ky-thuat/engineering-cad-qto");
    const spools = await listCadSpools(projectId);
    const selectedSpools = spools.filter((s) => spoolIds.includes(s.id));
    const electronicBbnt = generateElectronicBbntDocument("TT AVIO Tháp A (MEPF)", selectedSpools, {
      name: user.name,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      ...result,
      electronicBbnt,
      message: `Đã tạo thành công phiếu nghiệm thu ${result.code} cho ${result.spoolCount} phân đoạn Spool.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
