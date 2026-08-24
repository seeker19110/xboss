import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { query } from "@/lib/db";
import {
  recommendShortlistForPackage,
  BiddingPackageInput,
  SubconProfile,
  SubconEvaluationResult,
  SubconTier,
} from "@/lib/ky-thuat/engineering-subcon-ai";

export const dynamic = "force-dynamic";

// POST /api/engineering/subcon-ai/recommend-shortlist — Đề xuất danh sách mời thầu tối ưu
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  if (!CAN.manageEngineeringSubconAi(user.role)) {
    return NextResponse.json({ error: "Không có quyền thao tác đề xuất mời thầu" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    const body: BiddingPackageInput = await req.json();
    const { packageName, discipline, estimatedBudget, requiredCapacity, requiredSpecialties } =
      body;

    if (!packageName || !discipline) {
      return NextResponse.json({ error: "Thiếu tên gói thầu hoặc chuyên ngành" }, { status: 400 });
    }

    // 1. Lấy toàn bộ hồ sơ thầu phụ của dự án
    const profilesRows = await query<any>(
      `SELECT 
         id, project_id as "projectId", company_name as "companyName", tax_code as "taxCode",
         primary_discipline as "primaryDiscipline", specialties, workforce_capacity as "workforceCapacity",
         equipment_assets as "equipmentAssets", certifications
       FROM engineering_subcon_profiles
       WHERE project_id = $1`,
      [projectId],
    );

    const profiles: SubconProfile[] = profilesRows.map((r: any) => ({
      id: r.id,
      projectId: r.projectId,
      companyName: r.companyName,
      taxCode: r.taxCode,
      primaryDiscipline: r.primaryDiscipline,
      specialties: Array.isArray(r.specialties) ? r.specialties : [],
      workforceCapacity: r.workforceCapacity || 20,
      equipmentAssets: Array.isArray(r.equipmentAssets) ? r.equipmentAssets : [],
      certifications: Array.isArray(r.certifications) ? r.certifications : [],
    }));

    // 2. Lấy điểm đánh giá mới nhất
    const metricsRows = await query<any>(
      `SELECT DISTINCT ON (profile_id)
         profile_id as "profileId", trust_score as "trustScore", tier_grade as "tierGrade",
         on_time_completion_rate as "onTimeRate", bbnt_pass_rate as "bbntPassRate",
         ncr_incident_count as "ncrCount", hse_safety_score as "hseScore",
         cost_variance_rate as "costVarianceRate", ai_analysis_summary as "summary"
       FROM engineering_subcon_performance_metrics
       WHERE project_id = $1
       ORDER BY profile_id, evaluated_at DESC`,
      [projectId],
    );

    const metricsMap = new Map<string, SubconEvaluationResult>();
    const missingMetrics: { profileId: string; reasons: string[] }[] = [];

    for (const m of metricsRows) {
      const reasons: string[] = [];

      // Kiểm từng metric, nếu thiếu ghi vào lý do.
      if (m.onTimeRate == null) reasons.push("onTimeRate (% công việc đúng hạn)");
      if (m.bbntPassRate == null) reasons.push("bbntPassRate (% nghiệm thu đạt)");
      if (m.hseScore == null) reasons.push("hseScore (điểm an toàn HSE)");
      if (m.costVarianceRate == null) reasons.push("costVarianceRate (% phát sinh chi phí)");

      if (reasons.length > 0) {
        missingMetrics.push({ profileId: m.profileId, reasons });
        continue; // Bỏ qua profile này, không tạo mặc định
      }

      metricsMap.set(m.profileId, {
        trustScore: Number(m.trustScore),
        tierGrade: m.tierGrade as SubconTier,
        componentScores: {
          scheduleScore: Number(m.onTimeRate),
          qualityScore: Number(m.bbntPassRate),
          ncrPenaltyScore: Math.max(0, 100 - Number(m.ncrCount ?? 0) * 15),
          hseScore: Number(m.hseScore),
          costControlScore: Math.max(0, 100 - Math.max(0, Number(m.costVarianceRate)) * 3),
        },
        summary: m.summary || "",
      });
    }

    // Nếu có profile bị thiếu metric, báo lại.
    if (missingMetrics.length > 0) {
      return NextResponse.json(
        {
          error: "Dữ liệu đánh giá nhà thầu phụ chưa đủ",
          missingMetrics: missingMetrics.map((item) => ({
            profileId: item.profileId,
            reason: `Thiếu: ${item.reasons.join(", ")}`,
          })),
        },
        { status: 400 },
      );
    }

    // 3. Chạy Matchmaker AI
    const candidates = recommendShortlistForPackage(
      {
        packageName,
        discipline,
        estimatedBudget: Number(estimatedBudget || 0),
        requiredCapacity: Number(requiredCapacity || 10),
        requiredSpecialties: Array.isArray(requiredSpecialties) ? requiredSpecialties : [],
      },
      profiles,
      metricsMap,
    );

    // 4. Lưu lại lịch sử đề xuất
    await query(
      `INSERT INTO engineering_subcon_bidding_recommendations
       (project_id, package_name, discipline, estimated_budget, required_capacity, recommended_profiles, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        projectId,
        packageName,
        discipline,
        estimatedBudget || 0,
        requiredCapacity || 10,
        JSON.stringify(candidates),
        user.id,
      ],
    );

    return NextResponse.json({
      success: true,
      data: {
        package: { packageName, discipline, estimatedBudget, requiredCapacity },
        candidates,
      },
    });
  } catch (error: any) {
    console.error("[Subcon AI Recommend Shortlist POST]", error);
    return NextResponse.json(
      { error: error.message || "Lỗi tạo đề xuất mời thầu" },
      { status: 500 },
    );
  }
}
