import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  listCadSpools,
  calculatePhysicalEarnedValue,
  createCadSpoolsBatch,
  CadSpoolCreateInput,
  SpoolDiscipline,
} from "@/lib/engineering-cad-qto";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad-qto/spools — Danh sách phân đoạn Spool CAD & Tiến độ EV
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem Spool CAD" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const { searchParams } = new URL(req.url);
    const floor = searchParams.get("floor") || undefined;
    const discipline = searchParams.get("discipline") || undefined;
    const status = searchParams.get("status") || undefined;

    const spools = await listCadSpools(projectId, { floor, discipline, status });
    const ev = calculatePhysicalEarnedValue(spools);

    return NextResponse.json({
      spools,
      earnedValue: ev,
      totalCount: spools.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

const VALID_DISCIPLINES: SpoolDiscipline[] = [
  "hvac",
  "plumbing",
  "electrical",
  "firefighting",
  "structure",
  "architecture",
];

// POST /api/engineering/cad-qto/spools — Tạo hàng loạt Spool từ kết quả bóc tách CAD
// (Auto-QTO) sau khi kỹ sư đã soát/gán mã BOQCODE thủ công cho từng tuyến trên
// /engineering/cad-tracking. Không tạo boq_items mới — mỗi item phải khớp 1 dòng BOQ có sẵn.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền tạo Spool CAD" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const floorLabel = typeof body?.floorLabel === "string" ? body.floorLabel.trim() : "";
    const drawingId = Number.isInteger(body?.drawingId) ? Number(body.drawingId) : null;
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (!floorLabel) {
      return NextResponse.json({ error: "Cần cung cấp floorLabel (tầng)" }, { status: 422 });
    }
    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: "Cần ít nhất 1 tuyến đã bóc tách để tạo Spool" },
        { status: 422 },
      );
    }

    const items: CadSpoolCreateInput[] = [];
    for (const raw of rawItems) {
      if (!VALID_DISCIPLINES.includes(raw?.discipline)) {
        return NextResponse.json(
          { error: `Bộ môn "${raw?.discipline}" không hợp lệ` },
          { status: 422 },
        );
      }
      if (raw?.kind !== "duct" && raw?.kind !== "linear") {
        return NextResponse.json(
          { error: `Loại tuyến "${raw?.kind}" không hợp lệ (chỉ nhận duct/linear)` },
          { status: 422 },
        );
      }
      const systemCode = typeof raw?.systemCode === "string" ? raw.systemCode.trim() : "";
      const dimensionSpec = typeof raw?.dimensionSpec === "string" ? raw.dimensionSpec.trim() : "";
      const boqCode = typeof raw?.boqCode === "string" ? raw.boqCode.trim() : "";
      if (!systemCode || !dimensionSpec) {
        return NextResponse.json(
          { error: "Thiếu systemCode hoặc dimensionSpec cho 1 tuyến" },
          { status: 422 },
        );
      }
      items.push({
        routeId: typeof raw?.routeId === "string" ? raw.routeId : undefined,
        discipline: raw.discipline as SpoolDiscipline,
        systemCode,
        zoneLabel: typeof raw?.zoneLabel === "string" ? raw.zoneLabel.trim() : undefined,
        dimensionSpec,
        widthMm: Number(raw?.widthMm) || undefined,
        heightMm: Number(raw?.heightMm) || undefined,
        lengthM: Number(raw?.lengthM) || 0,
        kind: raw.kind,
        boqCode,
      });
    }

    const result = await createCadSpoolsBatch(projectId, drawingId, floorLabel, items);

    return NextResponse.json({
      success: true,
      createdCount: result.created.length,
      skippedCount: result.skipped.length,
      created: result.created,
      skipped: result.skipped,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
