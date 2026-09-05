import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  createAndSealMerkleBatch,
  listMerkleRoots,
  getMerkleRoot,
} from "@/lib/ky-thuat/engineering-merkle-ledger";
import { phanHoiLoi } from "@/lib/nen/loi";

export const dynamic = "force-dynamic";

// GET /api/engineering/ledger/merkle — Lấy danh sách hoặc chi tiết Merkle Root Batch
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem sổ cái Merkle" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const batchCode = searchParams.get("batchCode");

  try {
    if (batchCode) {
      const root = await getMerkleRoot(projectId, batchCode);
      if (!root) return NextResponse.json({ error: "Không tìm thấy batch" }, { status: 404 });
      return NextResponse.json({ root });
    }

    const roots = await listMerkleRoots(projectId, 50);
    return NextResponse.json({ roots, totalCount: roots.length });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}

// POST /api/engineering/ledger/merkle — Đóng gói và niêm phong Merkle Batch mới
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền niêm phong khối Merkle" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const batchCode = body.batchCode || `MERKLE-BATCH-${Date.now().toString(36).toUpperCase()}`;
    const records = body.records || [
      {
        event: "ACCEPTANCE_BBNT",
        taskId: "TASK-001",
        status: "APPROVED",
        at: new Date().toISOString(),
      },
      {
        event: "MATERIAL_TX",
        materialId: "MAT-042",
        delta: -15,
        unit: "Cay",
        at: new Date().toISOString(),
      },
      { event: "PROGRESS_TICK", dimensionId: 108, checked: true, at: new Date().toISOString() },
      {
        event: "QAQC_INSPECTION",
        requestId: "INSP-099",
        result: "PASSED",
        at: new Date().toISOString(),
      },
    ];
    const metadata = body.metadata || { source: "XBoss Core Audit Stream", sealedBy: user.id };

    const { record, tree } = await createAndSealMerkleBatch(
      projectId,
      batchCode,
      records,
      metadata,
    );

    return NextResponse.json({
      success: true,
      record,
      merkleRoot: tree.root,
      leafCount: tree.leafCount,
      treeLevelsCount: tree.treeLevels.length,
    });
  } catch (err: unknown) {
    return phanHoiLoi(err);
  }
}
