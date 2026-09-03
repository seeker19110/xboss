import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  allProjectFloors,
  listStages,
  ensureFloorStageFronts,
  listFloorStageFronts,
  upsertFloorStageFront,
  computePlannedDates,
  type FloorStageFrontRow,
  type StageRow,
} from "@/lib/tien-do/constructionStages";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Gắn ngày kế hoạch đã tính (cascade nối tiếp) vào từng front — trả về mảng mới, không sửa
// giá trị raw plannedReceivedAt đọc từ DB (chỉ có ý nghĩa thật ở đúng row công tác đầu tiên).
type FrontWithPlanned = FloorStageFrontRow & { plannedHandedOverAt: string | null };
function withPlannedDates(
  stages: StageRow[],
  fronts: FloorStageFrontRow[],
  floors: string[],
): FrontWithPlanned[] {
  const byFloor = new Map(floors.map((f) => [f, computePlannedDates(stages, fronts, f)]));
  return fronts.map((front) => {
    const p = byFloor.get(front.floorLabel)?.get(front.stageId);
    return {
      ...front,
      plannedReceivedAt: p?.plannedReceivedAt ?? front.plannedReceivedAt,
      plannedHandedOverAt: p?.plannedHandedOverAt ?? null,
    };
  });
}

// GET /api/floor-stage-fronts?floor= — lưới mặt bằng bản mới (tầng × công tác thi công).
// Không có ?floor=: trả toàn bộ tầng dự án + toàn bộ ô (dùng cho trang lưới /work-fronts).
// Có ?floor=: trả riêng các ô của 1 tầng (dùng cho trang chi tiết tầng).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Dự án luôn suy từ phiên (cookie xboss_project), KHÔNG bao giờ nhận từ client.
  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const floor = req.nextUrl.searchParams.get("floor");
  if (!floor) {
    const floors = await allProjectFloors(projectId);
    const stages = await listStages(projectId);
    await ensureFloorStageFronts(projectId, floors);
    const fronts = withPlannedDates(stages, await listFloorStageFronts(projectId), floors);
    return NextResponse.json({ floors, stages, fronts });
  }

  await ensureFloorStageFronts(projectId, [floor]);
  const stages = await listStages(projectId);
  const fronts = withPlannedDates(stages, await listFloorStageFronts(projectId, floor), [floor]);
  return NextResponse.json({ stages, fronts });
}

// PUT /api/floor-stage-fronts { floorLabel, stageId, receivedAt, handedOverAt,
// plannedReceivedAt, note } — ghi ngày nhận/bàn giao thực tế, ngày bắt đầu kế hoạch (chỉ
// công tác đầu tiên của tầng) và ghi chú cho 1 ô (tầng × công tác). Admin/PM/kỹ sư.
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWorkFronts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền cập nhật mặt bằng (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const projectId = await getCurrentProjectId(user);
  if (projectId == null) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const floorLabel = typeof body.floorLabel === "string" ? body.floorLabel.trim() : "";
  if (!floorLabel) return NextResponse.json({ error: "Thiếu tầng" }, { status: 422 });

  const stageId = Number(body.stageId);
  if (!Number.isInteger(stageId))
    return NextResponse.json({ error: "Công tác không hợp lệ" }, { status: 422 });
  // Chỉ nhận công tác dự án đang chọn nhìn thấy: dùng chung hoặc riêng dự án (M123 · D1).
  const stage = await queryOne<{ id: number }>(
    `SELECT id FROM construction_stages WHERE id = ? AND (project_id IS NULL OR project_id = ?)`,
    stageId,
    projectId,
  );
  if (!stage) return NextResponse.json({ error: "Không tìm thấy công tác" }, { status: 404 });

  const receivedAt = body.receivedAt;
  if (receivedAt !== null && receivedAt !== undefined && !DATE_RE.test(receivedAt))
    return NextResponse.json({ error: "Ngày nhận không hợp lệ" }, { status: 422 });

  const handedOverAt = body.handedOverAt;
  if (handedOverAt !== null && handedOverAt !== undefined && !DATE_RE.test(handedOverAt))
    return NextResponse.json({ error: "Ngày bàn giao không hợp lệ" }, { status: 422 });

  const plannedReceivedAt = body.plannedReceivedAt;
  if (
    plannedReceivedAt !== null &&
    plannedReceivedAt !== undefined &&
    !DATE_RE.test(plannedReceivedAt)
  )
    return NextResponse.json({ error: "Ngày bắt đầu kế hoạch không hợp lệ" }, { status: 422 });
  if (plannedReceivedAt) {
    // listStages() đã ORDER BY sort_order, id nên phần tử đầu chính là công tác đầu tiên.
    const [firstStage] = await listStages(projectId);
    if (!firstStage || firstStage.id !== stageId)
      return NextResponse.json(
        { error: "Chỉ đặt được ngày bắt đầu kế hoạch cho công tác đầu tiên" },
        { status: 422 },
      );
  }

  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  // Thông tin bàn giao (tuỳ chọn) — nhà thầu bàn giao/nhận (suppliers), công tác bàn giao
  // chuyển bước (construction_stages) và đại diện 2 bên. Validate FK tồn tại như stageId ở trên.
  async function optionalRef(
    value: unknown,
    table: "suppliers" | "construction_stages",
    label: string,
  ): Promise<number | null | NextResponse> {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n))
      return NextResponse.json({ error: `${label} không hợp lệ` }, { status: 422 });
    const row = await queryOne<{ id: number }>(`SELECT id FROM ${table} WHERE id = ?`, n);
    if (!row)
      return NextResponse.json({ error: `Không tìm thấy ${label.toLowerCase()}` }, { status: 404 });
    return n;
  }

  const outgoingSupplierId = await optionalRef(
    body.outgoingSupplierId,
    "suppliers",
    "Nhà thầu bàn giao",
  );
  if (outgoingSupplierId instanceof NextResponse) return outgoingSupplierId;
  const incomingSupplierId = await optionalRef(
    body.incomingSupplierId,
    "suppliers",
    "Nhà thầu nhận bàn giao",
  );
  if (incomingSupplierId instanceof NextResponse) return incomingSupplierId;
  const transitionStageId = await optionalRef(
    body.transitionStageId,
    "construction_stages",
    "Công tác bàn giao chuyển bước",
  );
  if (transitionStageId instanceof NextResponse) return transitionStageId;

  const outgoingRepName =
    typeof body.outgoingRepName === "string" ? body.outgoingRepName.trim() || null : null;
  const incomingRepName =
    typeof body.incomingRepName === "string" ? body.incomingRepName.trim() || null : null;

  const id = await upsertFloorStageFront(
    projectId,
    floorLabel,
    stageId,
    {
      receivedAt: receivedAt ?? null,
      handedOverAt: handedOverAt ?? null,
      plannedReceivedAt: plannedReceivedAt ?? null,
      note,
      outgoingSupplierId,
      incomingSupplierId,
      transitionStageId,
      outgoingRepName,
      incomingRepName,
    },
    user.id,
  );
  return NextResponse.json({ id });
}
