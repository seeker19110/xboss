import { createHash } from "crypto";
import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";
import { loiKhongTimThay } from "@/lib/nen/loi";

export interface BiddingLineItem {
  itemCode: string;
  description: string;
  unit: string;
  quantity: number;
  targetUnitRateVnd: number;
  quotedUnitRateVnd?: number;
  stage: "early" | "middle" | "late"; // Giai đoạn thi công (để phát hiện Front-loading)
  isCritical: boolean;
}

export interface BiddingPackageRecord {
  id: string;
  projectId: number;
  packageCode: string;
  title: string;
  discipline: string;
  targetBudgetVnd: number;
  status: "draft" | "rfq_published" | "evaluating" | "awarded" | "closed" | "cancelled";
  rfqSpecs: Record<string, unknown>;
  awardedVendor: string | null;
  awardedAmountVnd: number | null;
  metadata: Record<string, unknown>;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface VendorQuoteRecord {
  id: string;
  projectId: number;
  packageId: string;
  vendorName: string;
  vendorType: "subcontractor" | "material_supplier" | "equipment_vendor" | "joint_venture";
  totalAmountVnd: number;
  lineItems: BiddingLineItem[];
  capacityScore: number;
  safetyScore: number;
  technicalComplianceScore: number;
  submittedAt: string;
  status: "submitted" | "under_review" | "shortlisted" | "awarded" | "rejected";
  metadata: Record<string, unknown>;
}

export interface LineVarianceResult {
  itemCode: string;
  description: string;
  targetRate: number;
  quotedRate: number;
  varianceRatePct: number; // Tỷ lệ chênh lệch %
  totalVarianceVnd: number;
  isFrontLoaded: boolean;
  isUnderquoted: boolean;
}

export interface SkewAnalysisResult {
  vendorName: string;
  earlyStageVariancePct: number;
  lateStageVariancePct: number;
  skewRatio: number; // Early / Late
  isFrontLoadingRisk: boolean;
  unbalancedItemsCount: number;
  anomalies: string[];
}

export interface VendorRankingResult {
  vendorName: string;
  totalAmountVnd: number;
  priceScore: number; // 0 - 100
  capacityScore: number;
  safetyScore: number;
  technicalScore: number;
  compositeScore: number;
  rank: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
}

/**
 * Thuật toán tính độ lệch đơn giá chi tiết từng hạng mục dòng
 */
export function calculateLineItemVariances(
  targetItems: BiddingLineItem[],
  quoteItems: BiddingLineItem[],
): LineVarianceResult[] {
  const targetMap = new Map<string, BiddingLineItem>();
  targetItems.forEach((it) => targetMap.set(it.itemCode, it));

  const results: LineVarianceResult[] = [];

  for (const qItem of quoteItems) {
    const tItem = targetMap.get(qItem.itemCode);
    const targetRate = tItem ? tItem.targetUnitRateVnd : qItem.targetUnitRateVnd || 1;
    const quotedRate = qItem.quotedUnitRateVnd || qItem.targetUnitRateVnd;
    const varianceRatePct = Number((((quotedRate - targetRate) / targetRate) * 100).toFixed(2));
    const totalVarianceVnd = (quotedRate - targetRate) * qItem.quantity;

    // Hạng mục giai đoạn đầu mà chào giá cao hơn 20% -> Front-load
    const isFrontLoaded =
      (tItem?.stage === "early" || qItem.stage === "early") && varianceRatePct > 20;
    // Chào giá quá thấp dưới 30% -> Nguy cơ bỏ dở/Underbidding
    const isUnderquoted = varianceRatePct < -30;

    results.push({
      itemCode: qItem.itemCode,
      description: qItem.description,
      targetRate,
      quotedRate,
      varianceRatePct,
      totalVarianceVnd,
      isFrontLoaded,
      isUnderquoted,
    });
  }

  return results;
}

/**
 * Thuật toán phát hiện bất thường giá (Price Skewing & Front-Loading)
 */
export function detectPriceSkewing(
  vendorName: string,
  lineVariances: (LineVarianceResult & { stage?: "early" | "middle" | "late" })[],
): SkewAnalysisResult {
  let earlySum = 0,
    earlyCount = 0;
  let lateSum = 0,
    lateCount = 0;
  const anomalies: string[] = [];
  let unbalancedCount = 0;

  for (const lv of lineVariances) {
    if (lv.stage === "early" || lv.isFrontLoaded) {
      earlySum += lv.varianceRatePct;
      earlyCount++;
    } else if (lv.stage === "late") {
      lateSum += lv.varianceRatePct;
      lateCount++;
    }

    if (Math.abs(lv.varianceRatePct) > 35) {
      unbalancedCount++;
      anomalies.push(
        `Hạng mục ${lv.itemCode} (${lv.description}) lệch ${lv.varianceRatePct}% so với dự toán`,
      );
    }
  }

  const avgEarly = earlyCount > 0 ? earlySum / earlyCount : 0;
  const avgLate = lateCount > 0 ? lateSum / lateCount : 0;

  // Skew Ratio: nếu giai đoạn đầu chào cao hơn đáng kể so với giai đoạn cuối
  const skewRatio =
    avgLate > 0
      ? Number((avgEarly / avgLate).toFixed(2))
      : avgEarly > 15
        ? Number((1 + (avgEarly - avgLate) / 100).toFixed(2))
        : 1.0;
  const isFrontLoadingRisk = avgEarly > 18 && (avgLate <= 0 || skewRatio > 1.25);

  if (isFrontLoadingRisk) {
    anomalies.unshift(
      `CẢNH BÁO: Nhà thầu có dấu hiệu dồn giá giai đoạn đầu (Front-loading) chênh lệch ${avgEarly.toFixed(1)}%`,
    );
  }

  return {
    vendorName,
    earlyStageVariancePct: Number(avgEarly.toFixed(2)),
    lateStageVariancePct: Number(avgLate.toFixed(2)),
    skewRatio,
    isFrontLoadingRisk,
    unbalancedItemsCount: unbalancedCount,
    anomalies,
  };
}

/**
 * Thuật toán xếp hạng và đánh giá đa tiêu chí Nhà Thầu (Multi-Criteria Ranking)
 */
export function evaluateVendorRanking(
  quotes: VendorQuoteRecord[],
  targetBudgetVnd: number,
  weights = { price: 0.5, capacity: 0.25, safety: 0.15, technical: 0.1 },
): VendorRankingResult[] {
  if (!quotes || quotes.length === 0) return [];

  // Tìm giá chào thấp nhất hợp lệ
  const minPrice = Math.min(...quotes.map((q) => q.totalAmountVnd).filter((p) => p > 0));

  const ranked = quotes.map((q) => {
    // Điểm giá: minPrice / quotePrice * 100
    const priceScore =
      q.totalAmountVnd > 0 ? Number(((minPrice / q.totalAmountVnd) * 100).toFixed(2)) : 0;
    const capacityScore = q.capacityScore || 80;
    const safetyScore = q.safetyScore || 85;
    const technicalScore = q.technicalComplianceScore || 80;

    const compositeScore = Number(
      (
        priceScore * weights.price +
        capacityScore * weights.capacity +
        safetyScore * weights.safety +
        technicalScore * weights.technical
      ).toFixed(2),
    );

    // Xác định mức rủi ro
    const priceDiffToTargetPct =
      targetBudgetVnd > 0 ? ((q.totalAmountVnd - targetBudgetVnd) / targetBudgetVnd) * 100 : 0;
    let riskLevel: "low" | "medium" | "high" = "low";
    if (priceDiffToTargetPct < -25 || safetyScore < 70) {
      riskLevel = "high";
    } else if (priceDiffToTargetPct > 15 || capacityScore < 75) {
      riskLevel = "medium";
    }

    let recommendation = "Đạt tiêu chuẩn kỹ thuật & thương mại.";
    if (riskLevel === "high") {
      recommendation =
        "CẢNH BÁO: Báo giá quá thấp hoặc điểm an toàn dưới chuẩn, rủi ro phát sinh tranh chấp FIDIC.";
    } else if (priceScore > 90 && compositeScore > 85) {
      recommendation = "ĐỀ XUẤT CHỌN THẦU: Tối ưu chi phí và năng lực thi công.";
    }

    return {
      vendorName: q.vendorName,
      totalAmountVnd: q.totalAmountVnd,
      priceScore,
      capacityScore,
      safetyScore,
      technicalScore,
      compositeScore,
      rank: 0,
      riskLevel,
      recommendation,
    };
  });

  // Sắp xếp theo Composite Score giảm dần
  ranked.sort((a, b) => b.compositeScore - a.compositeScore);
  ranked.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return ranked;
}

// ---------------------------------------------------------------------------
// DB Helpers
// ---------------------------------------------------------------------------

export async function createBiddingPackage(params: {
  projectId: number;
  packageCode: string;
  title: string;
  discipline: string;
  targetBudgetVnd: number;
  rfqSpecs?: Record<string, unknown>;
  createdBy?: number;
}): Promise<BiddingPackageRecord> {
  const {
    projectId,
    packageCode,
    title,
    discipline,
    targetBudgetVnd,
    rfqSpecs = {},
    createdBy = null,
  } = params;

  return withProjectScope(
    projectId,
    async () => {
      const rows = await query<any>(
        `INSERT INTO engineering_bidding_packages
         (project_id, package_code, title, discipline, target_budget_vnd, status, rfq_specs, created_by)
       VALUES (?, ?, ?, ?, ?, 'draft', ?::jsonb, ?)
       RETURNING id, project_id AS "projectId", package_code AS "packageCode", title, discipline,
                 target_budget_vnd::bigint AS "targetBudgetVnd", status, rfq_specs AS "rfqSpecs",
                 awarded_vendor AS "awardedVendor", awarded_amount_vnd::bigint AS "awardedAmountVnd",
                 metadata, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
        projectId,
        packageCode,
        title,
        discipline,
        targetBudgetVnd,
        JSON.stringify(rfqSpecs),
        createdBy,
      );

      return rows[0] as BiddingPackageRecord;
    },
    { readOnly: false },
  );
}

export async function listBiddingPackages(
  projectId: number,
  opts?: { discipline?: string; status?: string; limit?: number },
): Promise<BiddingPackageRecord[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);

  return withProjectScope(projectId, async () => {
    const conds = ["project_id = ?"];
    const params: unknown[] = [projectId];

    if (opts?.discipline) {
      conds.push("discipline = ?");
      params.push(opts.discipline);
    }
    if (opts?.status) {
      conds.push("status = ?");
      params.push(opts.status);
    }

    params.push(limit);

    return query<BiddingPackageRecord>(
      `SELECT id, project_id AS "projectId", package_code AS "packageCode", title, discipline,
              target_budget_vnd::bigint AS "targetBudgetVnd", status, rfq_specs AS "rfqSpecs",
              awarded_vendor AS "awardedVendor", awarded_amount_vnd::bigint AS "awardedAmountVnd",
              metadata, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM engineering_bidding_packages
       WHERE ${conds.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT ?`,
      ...params,
    );
  });
}

export async function createVendorQuote(params: {
  projectId: number;
  packageId: string;
  vendorName: string;
  vendorType?: string;
  totalAmountVnd: number;
  lineItems: BiddingLineItem[];
  capacityScore?: number;
  safetyScore?: number;
  technicalComplianceScore?: number;
  createdBy?: number;
}): Promise<VendorQuoteRecord> {
  const {
    projectId,
    packageId,
    vendorName,
    vendorType = "subcontractor",
    totalAmountVnd,
    lineItems,
    capacityScore = 80,
    safetyScore = 85,
    technicalComplianceScore = 80,
    createdBy = null,
  } = params;

  return withProjectScope(
    projectId,
    async () => {
      const rows = await query<any>(
        `INSERT INTO engineering_bidding_vendor_quotes
         (project_id, package_id, vendor_name, vendor_type, total_amount_vnd, line_items,
          capacity_score, safety_score, technical_compliance_score, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, 'submitted', ?)
       RETURNING id, project_id AS "projectId", package_id AS "packageId", vendor_name AS "vendorName",
                 vendor_type AS "vendorType", total_amount_vnd::bigint AS "totalAmountVnd",
                 line_items AS "lineItems", capacity_score::float AS "capacityScore",
                 safety_score::float AS "safetyScore",
                 technical_compliance_score::float AS "technicalComplianceScore",
                 submitted_at AS "submittedAt", status, metadata`,
        projectId,
        packageId,
        vendorName,
        vendorType,
        totalAmountVnd,
        JSON.stringify(lineItems),
        capacityScore,
        safetyScore,
        technicalComplianceScore,
        createdBy,
      );

      return rows[0] as VendorQuoteRecord;
    },
    { readOnly: false },
  );
}

export async function listVendorQuotes(
  projectId: number,
  packageId: string,
): Promise<VendorQuoteRecord[]> {
  return withProjectScope(projectId, async () => {
    return query<VendorQuoteRecord>(
      `SELECT id, project_id AS "projectId", package_id AS "packageId", vendor_name AS "vendorName",
              vendor_type AS "vendorType", total_amount_vnd::bigint AS "totalAmountVnd",
              line_items AS "lineItems", capacity_score::float AS "capacityScore",
              safety_score::float AS "safetyScore",
              technical_compliance_score::float AS "technicalComplianceScore",
              submitted_at AS "submittedAt", status, metadata
       FROM engineering_bidding_vendor_quotes
       WHERE project_id = ? AND package_id = ?
       ORDER BY total_amount_vnd ASC`,
      projectId,
      packageId,
    );
  });
}

/**
 * Chạy ma trận đối soát và phân tích tổng thể gói thầu
 */
export async function runBiddingAnalysis(
  projectId: number,
  packageId: string,
  userId?: number,
): Promise<{
  package: BiddingPackageRecord;
  quotesCount: number;
  rankings: VendorRankingResult[];
  skewReports: SkewAnalysisResult[];
  provenanceToken: string;
}> {
  return withProjectScope(
    projectId,
    async () => {
      const pkg = await queryOne<BiddingPackageRecord>(
        `SELECT id, project_id AS "projectId", package_code AS "packageCode", title, discipline,
              target_budget_vnd::bigint AS "targetBudgetVnd", status, rfq_specs AS "rfqSpecs",
              awarded_vendor AS "awardedVendor", awarded_amount_vnd::bigint AS "awardedAmountVnd",
              metadata, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM engineering_bidding_packages
       WHERE id = ? AND project_id = ?`,
        packageId,
        projectId,
      );

      if (!pkg) throw loiKhongTimThay(`Không tìm thấy gói thầu ${packageId}`);

      const quotes = await listVendorQuotes(projectId, packageId);
      const targetItems = ((pkg.rfqSpecs?.lineItems as BiddingLineItem[]) ||
        []) as BiddingLineItem[];

      // 1. Phân tích Price Skewing cho từng nhà thầu
      const skewReports: SkewAnalysisResult[] = quotes.map((q) => {
        const lineVars = calculateLineItemVariances(targetItems, q.lineItems || []);
        return detectPriceSkewing(q.vendorName, lineVars);
      });

      // 2. Đánh giá xếp hạng Ranking
      const rankings = evaluateVendorRanking(quotes, pkg.targetBudgetVnd);

      // 3. Khởi tạo Provenance Token
      const payloadHash = createHash("sha256")
        .update(
          JSON.stringify({
            packageId,
            rankings,
            skewReports,
            analyzedAt: new Date().toISOString(),
          }),
        )
        .digest("hex");
      const provenanceToken = `BID-ANALYTICS-${payloadHash.slice(0, 16).toUpperCase()}`;

      // 4. Lưu lại kết quả phân tích
      await query(
        `INSERT INTO engineering_bidding_analysis_runs
         (project_id, package_id, variance_matrix, skew_metrics, ranking_results,
          recommendation_summary, provenance_token, created_by)
       VALUES (?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?, ?)`,
        projectId,
        packageId,
        JSON.stringify(targetItems),
        JSON.stringify(skewReports),
        JSON.stringify(rankings),
        rankings[0]?.recommendation || "Đã phân tích hoàn tất.",
        provenanceToken,
        userId || null,
      );

      return {
        package: pkg,
        quotesCount: quotes.length,
        rankings,
        skewReports,
        provenanceToken,
      };
    },
    { readOnly: false },
  );
}
