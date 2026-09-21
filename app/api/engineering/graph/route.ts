import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { traverseGraph, GraphDirection } from "@/lib/ky-thuat/engineering-graph";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/graph?objectId=&externalKey=&direction=&depth=&relationTypes=&maxNodes=
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem đồ thị quan hệ kỹ thuật" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  const blocked = await assertModuleEnabled("engineering-graph", projectId);
  if (blocked) return blocked;

  const sp = new URL(req.url).searchParams;
  const objectId = sp.get("objectId") || undefined;
  const externalKey = sp.get("externalKey") || undefined;
  const direction = (sp.get("direction") as GraphDirection) || "both";
  const depth = sp.get("depth") ? parseInt(sp.get("depth")!, 10) : 2;
  const maxNodes = sp.get("maxNodes") ? parseInt(sp.get("maxNodes")!, 10) : 100;
  const relationTypes = sp.get("relationTypes")
    ? sp
        .get("relationTypes")!
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  if (!objectId && !externalKey) {
    return NextResponse.json({ error: "Cần truyền objectId hoặc externalKey" }, { status: 400 });
  }

  try {
    const result = await traverseGraph(projectId, {
      objectId,
      externalKey,
      direction,
      depth,
      maxNodes,
      relationTypes,
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    // Hàm lib ném LoiNghiepVu mang sẵn mã (404 khi bản ghi không tồn tại/thuộc dự án
    // khác) — không còn dò chuỗi thông điệp; lỗi hệ thống thật vẫn ra 500.
    return phanHoiLoi(err);
  }
}
