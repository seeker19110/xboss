import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { query } from "@/lib/db";
import { taoHoSoThauPhu } from "@/lib/hien-truong/subcon-metrics";
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
  // BUG THẬT (Đợt 5, W3): route này trước đây không kiểm quyền gì — mọi user đăng nhập
  // (kể cả subcon) đều đọc được bảng điểm tín nhiệm + chỉ số thương mại (costVarianceRate)
  // của TẤT CẢ thầu phụ trong dự án, trong khi POST cùng file đã đúng dùng
  // `CAN.manageEngineeringSubconAi`. Bám khuôn `viewEngineeringSubconAi` đã khai sẵn trong
  // lib/bao-mat/auth.ts (view mở tới BCH, loại subcon) nhưng chưa route nào gọi tới.
  if (!CAN.viewEngineeringSubconAi(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền xem bảng điểm thầu phụ" },
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
    // Trước đây GET này TỰ CHÈN 4 hồ sơ thầu phụ bịa (kèm mã số thuế giả) và bộ chỉ số
    // năng lực bịa vào dự án ngay lần xem đầu tiên — một request đọc lại ghi dữ liệu
    // nghiệp vụ không có thật vào DB thật (audit 2026-08-25 §3.3). Đã bỏ hẳn: dự án chưa
    // có hồ sơ nào thì trả danh sách rỗng, UI hiện trạng thái rỗng.
    // Danh sách hồ sơ kèm chỉ số đánh giá mới nhất
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
      projectId,
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

// POST /api/engineering/subcon-ai/scores { supplierId, primaryDiscipline, taxCode? } —
// tạo hồ sơ thầu phụ M82 TỪ một nhà cung cấp đã có. Đây là đường tạo hồ sơ duy nhất; trước
// đây module không có đường tạo nào nên GET tự seed 4 hồ sơ bịa (audit 2026-08-25 §3.3).
// Tên công ty chép từ `suppliers`, không nhận từ client — danh tính chỉ có một nguồn.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringSubconAi(user.role)) {
    return NextResponse.json(
      { error: "Không có quyền quản lý hồ sơ thầu phụ AI" },
      { status: 403 },
    );
  }

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("engineering-subcon-ai", projectId);
  if (blocked) return blocked;
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const supplierId = Number(body?.supplierId);
  if (!Number.isInteger(supplierId) || supplierId <= 0)
    return NextResponse.json({ error: "Thiếu hoặc sai nhà cung cấp" }, { status: 422 });

  const ket = await taoHoSoThauPhu(projectId, {
    supplierId,
    primaryDiscipline: String(body?.primaryDiscipline ?? ""),
    taxCode: body?.taxCode == null ? null : String(body.taxCode),
  });
  if (!ket.ok) return NextResponse.json({ error: ket.error }, { status: ket.status });
  return NextResponse.json({ id: ket.id }, { status: 201 });
}
