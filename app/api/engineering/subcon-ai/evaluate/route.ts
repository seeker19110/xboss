import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { query } from "@/lib/db";
import { computeSubcontractorTrustScore } from "@/lib/engineering-subcon-ai";

export const dynamic = "force-dynamic";

// POST /api/engineering/subcon-ai/evaluate — Đánh giá lại điểm tín nhiệm cho 1 thầu phụ
export async function POST(req: Request) {
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
    const { profileId, onTimeRate, bbntPassRate, ncrCount, hseScore, costVarianceRate } = body;

    if (!profileId) {
      return NextResponse.json({ error: "Thiếu profileId nhà thầu phụ" }, { status: 400 });
    }

    const evalRes = computeSubcontractorTrustScore({
      onTimeCompletionRate: Number(onTimeRate ?? 90),
      bbntPassRate: Number(bbntPassRate ?? 95),
      ncrIncidentCount: Number(ncrCount ?? 0),
      hseSafetyScore: Number(hseScore ?? 95),
      costVarianceRate: Number(costVarianceRate ?? 0),
    });

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const insertRes = await query(
      `INSERT INTO engineering_subcon_performance_metrics 
       (project_id, profile_id, evaluation_period, on_time_completion_rate, bbnt_pass_rate, ncr_incident_count, hse_safety_score, cost_variance_rate, trust_score, tier_grade, ai_analysis_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        projectId,
        profileId,
        period,
        onTimeRate ?? 90,
        bbntPassRate ?? 95,
        ncrCount ?? 0,
        hseScore ?? 95,
        costVarianceRate ?? 0,
        evalRes.trustScore,
        evalRes.tierGrade,
        evalRes.summary,
      ],
    );

    return NextResponse.json({
      success: true,
      data: insertRes[0],
      evaluation: evalRes,
    });
  } catch (error: any) {
    console.error("[Subcon AI Evaluate POST]", error);
    return NextResponse.json({ error: error.message || "Lỗi chấm điểm thầu phụ" }, { status: 500 });
  }
}
