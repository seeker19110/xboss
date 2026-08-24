import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { query } from "@/lib/db";
import { computeSubcontractorTrustScore } from "@/lib/ky-thuat/engineering-subcon-ai";
import { tinhChiSoThauPhu } from "@/lib/hien-truong/subcon-metrics";

export const dynamic = "force-dynamic";

// POST /api/engineering/subcon-ai/evaluate — Đánh giá lại điểm tín nhiệm cho 1 thầu phụ
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringSubconAi(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền thao tác chấm điểm thầu phụ" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-subcon-ai", projectId);
  if (blocked) return blocked;
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    // V3: KHÔNG nhận bất kỳ chỉ số nào từ body — chỉ nhận profileId. Mọi chỉ số phải
    // tính từ dữ liệu hệ thống (xem lib/hien-truong/subcon-metrics.ts).
    const body = await req.json();
    const { profileId } = body;

    if (!profileId) {
      return NextResponse.json({ error: "Thiếu profileId nhà thầu phụ" }, { status: 400 });
    }

    const chiSo = await tinhChiSoThauPhu(projectId, String(profileId));
    if (!chiSo) {
      return NextResponse.json({ error: "Không tìm thấy hồ sơ thầu phụ" }, { status: 404 });
    }

    // Thiếu bất kỳ chỉ số nào → KHÔNG chấm điểm, KHÔNG ghi dòng nào. Trả nguyên trạng
    // chỉ số (null) + lý do để người dùng biết cần bổ sung dữ liệu gì.
    if (
      chiSo.onTimeCompletionRate == null ||
      chiSo.bbntPassRate == null ||
      chiSo.hseSafetyScore == null ||
      chiSo.ncrIncidentCount == null ||
      chiSo.costVarianceRate == null
    ) {
      return NextResponse.json(
        {
          error: "Chưa đủ dữ liệu hệ thống để chấm điểm tín nhiệm nhà thầu phụ",
          metrics: chiSo,
          thieuDuLieu: chiSo.thieuDuLieu,
        },
        { status: 422 },
      );
    }

    const evalRes = computeSubcontractorTrustScore({
      onTimeCompletionRate: chiSo.onTimeCompletionRate,
      bbntPassRate: chiSo.bbntPassRate,
      ncrIncidentCount: chiSo.ncrIncidentCount,
      hseSafetyScore: chiSo.hseSafetyScore,
      costVarianceRate: chiSo.costVarianceRate,
    });

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const insertRes = await query(
      `INSERT INTO engineering_subcon_performance_metrics 
       (project_id, profile_id, evaluation_period, on_time_completion_rate, bbnt_pass_rate, ncr_incident_count, hse_safety_score, cost_variance_rate, trust_score, tier_grade, ai_analysis_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,

      projectId,
      profileId,
      period,
      chiSo.onTimeCompletionRate,
      chiSo.bbntPassRate,
      chiSo.ncrIncidentCount,
      chiSo.hseSafetyScore,
      chiSo.costVarianceRate,
      evalRes.trustScore,
      evalRes.tierGrade,
      evalRes.summary,
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
