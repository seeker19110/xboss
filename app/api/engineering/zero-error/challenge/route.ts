// app/api/engineering/zero-error/challenge/route.ts — Dynamic Challenge Code API
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import {
  generateFieldDynamicChallenge,
  verifyFieldProofChallenge,
} from "@/lib/engineering-zero-error-tracker";

export const dynamic = "force-dynamic";

// GET: Sinh mã thử thách động cho người dùng hiện trường (TTL 90s)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền truy cập module Zero-Error" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const challenge = generateFieldDynamicChallenge(projectId, user.id);
  return NextResponse.json({
    projectId,
    userId: user.id,
    userName: user.name,
    challenge,
  });
}

// POST: Xác minh nhanh tính hợp lệ của mã thử thách
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const code = String(body.code || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Thiếu mã thử thách" }, { status: 400 });
    }

    const isValid = verifyFieldProofChallenge(code, projectId, user.id);
    return NextResponse.json({
      code,
      isValid,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
