import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { listGodTierClashes } from "@/lib/ky-thuat/engineering-god-tier-db";
import { createBcfTopicFromClash, BcfTopic } from "@/lib/ky-thuat/engineering-god-tier";

export const dynamic = "force-dynamic";

// GET /api/engineering/god-tier/bcf/topics — openBIM BCF 3.0 Topics List
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  const clashes = await listGodTierClashes(projectId);
  const topics: BcfTopic[] = clashes.map((clash) =>
    createBcfTopicFromClash(clash, user.name || "XBOSS_AI"),
  );

  return NextResponse.json({ topics });
}

// POST /api/engineering/god-tier/bcf/topics — Tạo BCF Topic mới
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
    const topic: BcfTopic = {
      guid: body.guid || `BCF-MANUAL-${Date.now()}`,
      topic_type: body.topic_type || "Issue",
      topic_status: body.topic_status || "Open",
      title: body.title || "Ghi chú phối hợp BCF mới",
      priority: body.priority || "Medium",
      creation_date: new Date().toISOString(),
      creation_author: user.name || "User",
      description: body.description || "",
      assigned_to: body.assigned_to,
      viewpoint: body.viewpoint || {
        guid: `VP-${Date.now()}`,
        perspective_camera: {
          camera_view_point: { x: 0, y: 0, z: 2000 },
          camera_direction: { x: 0, y: 1, z: 0 },
          camera_up_vector: { x: 0, y: 0, z: 1 },
          field_of_view: 60,
        },
        selection_guids: body.selection_guids || [],
      },
    };

    return NextResponse.json({ success: true, topic });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Lỗi tạo BCF Topic";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
