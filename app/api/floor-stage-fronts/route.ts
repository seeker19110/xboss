import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  allProjectFloors,
  listStages,
  ensureFloorStageFronts,
  listFloorStageFronts,
  upsertFloorStageFront,
} from "@/lib/constructionStages";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/floor-stage-fronts?floor= — lưới mặt bằng bản mới (tầng × công tác thi công).
// Không có ?floor=: trả toàn bộ tầng dự án + toàn bộ ô (dùng cho trang lưới /work-fronts).
// Có ?floor=: trả riêng các ô của 1 tầng (dùng cho trang chi tiết tầng).
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const floor = req.nextUrl.searchParams.get("floor");
  if (!floor) {
    const floors = await allProjectFloors();
    const stages = await listStages();
    await ensureFloorStageFronts(floors);
    const fronts = await listFloorStageFronts();
    return NextResponse.json({ floors, stages, fronts });
  }

  await ensureFloorStageFronts([floor]);
  const stages = await listStages();
  const fronts = await listFloorStageFronts(floor);
  return NextResponse.json({ stages, fronts });
}

// PUT /api/floor-stage-fronts { floorLabel, stageId, handedOverAt, note } — ghi ngày bàn
// giao/ghi chú cho 1 ô (tầng × công tác). Admin/PM/kỹ sư (ghi tiến độ hiện trường).
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageWorkFronts(user.role))
    return NextResponse.json(
      { error: "Bạn không có quyền cập nhật mặt bằng (chỉ Admin/PM/kỹ sư)" },
      { status: 403 },
    );

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });

  const floorLabel = typeof body.floorLabel === "string" ? body.floorLabel.trim() : "";
  if (!floorLabel) return NextResponse.json({ error: "Thiếu tầng" }, { status: 422 });

  const stageId = Number(body.stageId);
  if (!Number.isInteger(stageId))
    return NextResponse.json({ error: "Công tác không hợp lệ" }, { status: 422 });
  const stage = await queryOne<{ id: number }>(
    `SELECT id FROM construction_stages WHERE id = ?`,
    stageId,
  );
  if (!stage) return NextResponse.json({ error: "Không tìm thấy công tác" }, { status: 404 });

  const handedOverAt = body.handedOverAt;
  if (handedOverAt !== null && handedOverAt !== undefined && !DATE_RE.test(handedOverAt))
    return NextResponse.json({ error: "Ngày bàn giao không hợp lệ" }, { status: 422 });

  const note = typeof body.note === "string" ? body.note.trim() || null : null;

  const id = await upsertFloorStageFront(
    floorLabel,
    stageId,
    { handedOverAt: handedOverAt ?? null, note },
    user.id,
  );
  return NextResponse.json({ id });
}
