// app/api/systems/[code]/upload-template/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveSystemId } from "@/lib/systems";
import { getCurrentProjectId } from "@/lib/projects";
import { buildPlanTemplate, buildTrackingTemplate } from "@/lib/system-upload";
import { todayISO } from "@/lib/db";

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
  let wb;
  if (kind === "ke_hoach") {
    wb = await buildPlanTemplate(systemId, projectId);
  } else {
    wb = await buildTrackingTemplate(systemId, projectId);
  }

  const today = todayISO();
  const filename =
    kind === "ke_hoach" ? `KeHoach-${code}-${today}.xlsx` : `Tracking-${code}-${today}.xlsx`;
  const buf = await wb.xlsx.writeBuffer();

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
