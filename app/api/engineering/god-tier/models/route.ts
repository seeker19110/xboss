import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  generateInstancedMeshGroups,
  calculateMerkleRootHex,
  GodTierElementData,
} from "@/lib/ky-thuat/engineering-god-tier";
import { listGodTierModels, saveGodTierModel } from "@/lib/ky-thuat/engineering-god-tier-db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const models = await listGodTierModels(projectId);
  return NextResponse.json({ models });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (!body.name || !body.model_code) {
      return NextResponse.json({ error: "Thiếu tên hoặc mã mô hình" }, { status: 400 });
    }

    const modelId = await saveGodTierModel(projectId, {
      model_code: body.model_code,
      name: body.name,
      discipline: body.discipline || "combined",
      lod_level: body.lod_level || "LOD_400",
      total_elements: parseInt(body.total_elements, 10) || 0,
      spatial_octree_data: body.spatial_octree_data || {},
      bounding_box: body.bounding_box || { min: [0, 0, 0], max: [0, 0, 0] },
      merkle_root_hash: body.merkle_root_hash || null,
      created_by: user.id,
    });

    return NextResponse.json({ success: true, modelId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi lưu mô hình God-Tier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
