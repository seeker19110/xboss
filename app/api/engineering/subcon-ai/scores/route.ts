import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { query } from "@/lib/db";
import {
  computeSubcontractorTrustScore,
  SubconProfile,
  SubconEvaluationResult,
} from "@/lib/ky-thuat/engineering-subcon-ai";

export const dynamic = "force-dynamic";

// GET /api/engineering/subcon-ai/scores — Danh sách bảng điểm năng lực AI của tất cả thầu phụ
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) {
    return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });
  }

  try {
    // 1. Kiểm tra và auto-seed 4 hồ sơ thầu phụ mẫu nếu chưa có
    const existing = await query(
      `SELECT COUNT(*)::int as count FROM engineering_subcon_profiles WHERE project_id = $1`,
      [projectId],
    );

    if (existing[0]?.count === 0) {
      await query(
        `INSERT INTO engineering_subcon_profiles (project_id, company_name, tax_code, primary_discipline, specialties, workforce_capacity, equipment_assets, certifications)
         VALUES 
         ($1, 'Công ty CP Cơ Điện Lạnh Hưng Phát', '0312345678', 'HVAC', '["Chiller", "VRV/VRF", "Ống gió kháng cháy"]'::jsonb, 45, '["Máy loe ống", "Máy lốc ống tròn", "Đồng hồ đo gió"]'::jsonb, '["ISO 9001:2015", "Chứng chỉ năng lực Hạng 1"]'::jsonb),
         ($1, 'Công ty TNHH Kỹ Thuật Điện Quang Minh', '0319876543', 'ELECTRICAL', '["Trạm biến áp 22kV", "Tủ MSB", "Busway"]'::jsonb, 30, '["Máy ép cốt thủy lực", "Thiết bị đo Megomet"]'::jsonb, '["Chứng chỉ xây dựng Hạng 2"]'::jsonb),
         ($1, 'Công ty CP PCCC & Cấp Thoát Nước Thăng Long', '0105678901', 'FIRE_FIGHTING', '["Hệ thống Sprinkler", "Bơm chữa cháy", "Khí FM200"]'::jsonb, 25, '["Máy ren ống", "Máy tạo rãnh Victaulic"]'::jsonb, '["Giấy xác nhận đủ điều kiện PCCC"]'::jsonb),
         ($1, 'Công ty TNHH Dịch Vụ MEP Toàn Cầu', '0309998888', 'PLUMBING', '["Cấp thoát nước trục đứng", "Bơm chìm", "Xử lý nước thải"]'::jsonb, 15, '["Máy hàn nhiệt PPR", "Máy nội soi đường ống"]'::jsonb, '["Chứng chỉ Hạng 3"]'::jsonb)`,
        [projectId],
      );

      // Seed chỉ số đánh giá tương ứng
      const newProfiles = await query<any>(
        `SELECT id, company_name as "company_name" FROM engineering_subcon_profiles WHERE project_id = $1 ORDER BY company_name ASC`,
        [projectId],
      );

      for (const p of newProfiles) {
        let metrics = {
          onTimeCompletionRate: 92,
          bbntPassRate: 96,
          ncrIncidentCount: 0,
          hseSafetyScore: 98,
          costVarianceRate: 1.5,
        };
        if (p.company_name.includes("PCCC")) {
          metrics = {
            onTimeCompletionRate: 85,
            bbntPassRate: 88,
            ncrIncidentCount: 1,
            hseSafetyScore: 92,
            costVarianceRate: 3.0,
          };
        } else if (p.company_name.includes("Toàn Cầu")) {
          metrics = {
            onTimeCompletionRate: 65,
            bbntPassRate: 72,
            ncrIncidentCount: 3,
            hseSafetyScore: 80,
            costVarianceRate: 12.0,
          };
        }
        const evalRes = computeSubcontractorTrustScore(metrics);

        await query(
          `INSERT INTO engineering_subcon_performance_metrics 
           (project_id, profile_id, evaluation_period, on_time_completion_rate, bbnt_pass_rate, ncr_incident_count, hse_safety_score, cost_variance_rate, trust_score, tier_grade, ai_analysis_summary)
           VALUES ($1, $2, '2026-08', $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            projectId,
            p.id,
            metrics.onTimeCompletionRate,
            metrics.bbntPassRate,
            metrics.ncrIncidentCount,
            metrics.hseSafetyScore,
            metrics.costVarianceRate,
            evalRes.trustScore,
            evalRes.tierGrade,
            evalRes.summary,
          ],
        );
      }
    }

    // 2. Truy vấn danh sách kèm chỉ số đánh giá mới nhất
    const rows = await query(
      `SELECT 
         p.id, p.project_id as "projectId", p.company_name as "companyName", p.tax_code as "taxCode",
         p.primary_discipline as "primaryDiscipline", p.specialties, p.workforce_capacity as "workforceCapacity",
         p.equipment_assets as "equipmentAssets", p.certifications,
         m.on_time_completion_rate as "onTimeRate", m.bbnt_pass_rate as "bbntPassRate",
         m.ncr_incident_count as "ncrCount", m.hse_safety_score as "hseScore",
         m.cost_variance_rate as "costVarianceRate", m.trust_score as "trustScore",
         m.tier_grade as "tierGrade", m.ai_analysis_summary as "summary",
         m.evaluated_at as "evaluatedAt"
       FROM engineering_subcon_profiles p
       LEFT JOIN LATERAL (
         SELECT * FROM engineering_subcon_performance_metrics 
         WHERE profile_id = p.id 
         ORDER BY evaluated_at DESC 
         LIMIT 1
       ) m ON true
       WHERE p.project_id = $1
       ORDER BY m.trust_score DESC NULLS LAST, p.company_name ASC`,
      [projectId],
    );

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    console.error("[Subcon AI Scores GET]", error);
    return NextResponse.json(
      { error: error.message || "Lỗi tải bảng điểm thầu phụ" },
      { status: 500 },
    );
  }
}
