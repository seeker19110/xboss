/**
 * Core Engine cho Module M82: AI Autonomous Subcontractor Performance & Auto-Bidding Recommendation
 * Đánh giá năng lực nhà thầu phụ bằng AI và tự động đề xuất danh sách mời thầu tối ưu
 */

export type SubconDiscipline =
  "HVAC" | "PLUMBING" | "ELECTRICAL" | "FIRE_FIGHTING" | "EXTRA_LOW_VOLTAGE" | "GENERAL_MEPF";

export type SubconTier = "TIER_A" | "TIER_B" | "TIER_C" | "TIER_D";

export interface SubconProfile {
  id: string;
  projectId: number;
  supplierId?: number;
  companyName: string;
  taxCode?: string;
  primaryDiscipline: SubconDiscipline;
  specialties: string[];
  workforceCapacity: number;
  equipmentAssets: string[];
  certifications: string[];
}

export interface SubconMetricsInput {
  onTimeCompletionRate: number; // 0 - 100%
  bbntPassRate: number; // 0 - 100%
  ncrIncidentCount: number; // Số biên bản không phù hợp
  hseSafetyScore: number; // 0 - 100
  costVarianceRate: number; // % phát sinh chi phí
}

export interface SubconEvaluationResult {
  trustScore: number;
  tierGrade: SubconTier;
  componentScores: {
    scheduleScore: number;
    qualityScore: number;
    ncrPenaltyScore: number;
    hseScore: number;
    costControlScore: number;
  };
  summary: string;
}

export interface BiddingPackageInput {
  packageName: string;
  discipline: SubconDiscipline;
  estimatedBudget: number;
  requiredCapacity: number;
  requiredSpecialties?: string[];
}

export interface ShortlistCandidate {
  profileId: string;
  companyName: string;
  matchScore: number; // 0 - 100
  trustScore: number;
  tierGrade: SubconTier;
  riskFactors: string[];
  strengths: string[];
}

/**
 * Tính toán điểm tín nhiệm tổng hợp AI Trust Score (0 - 100)
 * Trọng số: Tiến độ (30%), Chất lượng BBNT (25%), Không vi phạm NCR (20%), HSE (15%), Chi phí (10%)
 */
export function computeSubcontractorTrustScore(input: SubconMetricsInput): SubconEvaluationResult {
  const scheduleScore = Math.max(0, Math.min(100, input.onTimeCompletionRate));
  const qualityScore = Math.max(0, Math.min(100, input.bbntPassRate));
  const ncrPenaltyScore = Math.max(0, 100 - input.ncrIncidentCount * 15);
  const hseScore = Math.max(0, Math.min(100, input.hseSafetyScore));
  const costControlScore = Math.max(0, 100 - Math.max(0, input.costVarianceRate) * 3);

  const trustScore = Number(
    (
      scheduleScore * 0.3 +
      qualityScore * 0.25 +
      ncrPenaltyScore * 0.2 +
      hseScore * 0.15 +
      costControlScore * 0.1
    ).toFixed(2),
  );

  const tierGrade = classifySubconTier(trustScore);

  let summary = "";
  if (tierGrade === "TIER_A") {
    summary = "Nhà thầu xuất sắc: Tiến độ chuẩn xác, chất lượng BBNT cao và tuân thủ HSE tốt.";
  } else if (tierGrade === "TIER_B") {
    summary = "Nhà thầu đạt chuẩn: Đáp ứng tốt yêu cầu kỹ thuật, phát sinh không đáng kể.";
  } else if (tierGrade === "TIER_C") {
    summary = "Cần giám sát: Có phát sinh NCR hoặc chậm tiến độ cục bộ, cần theo dõi chặt.";
  } else {
    summary = "Cảnh báo rủi ro cao: Vi phạm NCR hoặc chậm tiến độ nghiêm trọng. Hạn chế mời thầu.";
  }

  return {
    trustScore,
    tierGrade,
    componentScores: {
      scheduleScore,
      qualityScore,
      ncrPenaltyScore,
      hseScore,
      costControlScore,
    },
    summary,
  };
}

/**
 * Phân hạng thầu phụ dựa trên điểm tín nhiệm
 */
export function classifySubconTier(score: number): SubconTier {
  if (score >= 85) return "TIER_A";
  if (score >= 70) return "TIER_B";
  if (score >= 50) return "TIER_C";
  return "TIER_D";
}

/**
 * Thuật toán AI Matchmaker: Tự động so khớp hồ sơ nhà thầu với yêu cầu gói thầu để sinh Shortlist
 */
export function recommendShortlistForPackage(
  pkg: BiddingPackageInput,
  profiles: SubconProfile[],
  metricsMap: Map<string, SubconEvaluationResult>,
): ShortlistCandidate[] {
  const candidates: ShortlistCandidate[] = [];

  for (const p of profiles) {
    const evalRes = metricsMap.get(p.id) || {
      trustScore: 75,
      tierGrade: "TIER_B" as SubconTier,
      componentScores: {
        scheduleScore: 75,
        qualityScore: 75,
        ncrPenaltyScore: 85,
        hseScore: 80,
        costControlScore: 80,
      },
      summary: "Chưa có đủ dữ liệu lịch sử thi công",
    };

    // 1. Điểm chuyên ngành phù hợp
    let disciplineScore = 0;
    if (p.primaryDiscipline === pkg.discipline || p.primaryDiscipline === "GENERAL_MEPF") {
      disciplineScore = 100;
    } else {
      disciplineScore = 30; // Trái ngành
    }

    // 2. Điểm đáp ứng nhân lực/quy mô
    const capacityRatio = pkg.requiredCapacity > 0 ? p.workforceCapacity / pkg.requiredCapacity : 1;
    const capacityScore = Math.min(100, Math.round(capacityRatio * 100));

    // 3. Điểm chuyên môn sâu (specialties)
    let specialtyScore = 80;
    if (pkg.requiredSpecialties && pkg.requiredSpecialties.length > 0) {
      const matchCount = pkg.requiredSpecialties.filter((req) =>
        p.specialties.some((s) => s.toLowerCase().includes(req.toLowerCase())),
      ).length;
      specialtyScore = Math.round((matchCount / pkg.requiredSpecialties.length) * 100);
    }

    // Điểm tương thích tổng thể: 50% Trust Score + 25% Chuyên ngành + 15% Nhân lực + 10% Chuyên môn sâu
    const matchScore = Number(
      (
        evalRes.trustScore * 0.5 +
        disciplineScore * 0.25 +
        capacityScore * 0.15 +
        specialtyScore * 0.1
      ).toFixed(1),
    );

    const riskFactors: string[] = [];
    const strengths: string[] = [];

    if (evalRes.tierGrade === "TIER_D" || evalRes.trustScore < 60) {
      riskFactors.push("Điểm tín nhiệm lịch sử thấp (Trust Score < 60)");
    }
    if (p.workforceCapacity < pkg.requiredCapacity) {
      riskFactors.push(
        `Quy mô nhân sự (${p.workforceCapacity} người) nhỏ hơn yêu cầu (${pkg.requiredCapacity} người)`,
      );
    }
    if (disciplineScore < 100) {
      riskFactors.push("Chuyên ngành chính khác với hệ thống của gói thầu");
    }

    if (evalRes.tierGrade === "TIER_A") {
      strengths.push("Đối tác Hạng A uy tín cao");
    }
    if (evalRes.componentScores.qualityScore >= 95) {
      strengths.push("Tỷ lệ nghiệm thu BBNT lần 1 xuất sắc (≥95%)");
    }
    if (p.workforceCapacity >= pkg.requiredCapacity * 1.5) {
      strengths.push("Năng lực nhân sự dồi dào, đáp ứng tiến độ gấp");
    }

    candidates.push({
      profileId: p.id,
      companyName: p.companyName,
      matchScore,
      trustScore: evalRes.trustScore,
      tierGrade: evalRes.tierGrade,
      riskFactors,
      strengths,
    });
  }

  // Sắp xếp giảm dần theo Match Score
  return candidates.sort((a, b) => b.matchScore - a.matchScore);
}
