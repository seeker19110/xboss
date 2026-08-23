import { query, queryOne } from "@/lib/db";

export type TargetMetricType =
  | "schedule_compression"
  | "cost_mitigation"
  | "clash_resolution"
  | "resource_leveling"
  | "multi_objective_pareto";

export type ScenarioStatus = "simulated" | "evaluating" | "approved" | "rejected" | "archived";

export type ComplianceDomain =
  | "structural"
  | "fire_safety"
  | "hvac"
  | "plumbing"
  | "electrical"
  | "environmental"
  | "general_building";

export type ComplianceSeverity = "advisory" | "mandatory" | "legal_strict";

export type ComplianceStatus =
  "compliant" | "non_compliant" | "exemption_granted" | "manual_review_required";

export interface PrescriptiveOption {
  optionIndex: number;
  title: string;
  strategyCategory: string;
  strategyDescription: string;
  scheduleCompressionDays: number;
  crashCostVnd: number;
  riskScore: number; // 0 (thấp nhất) -> 100 (cao nhất)
  clashMitigationCount: number;
  isParetoOptimal: boolean;
  tradeOffRatio: number; // Tỷ lệ chi phí bù trên mỗi ngày rút ngắn (VND/ngày)
  feasibilityScore: number; // 0.0 -> 1.0
  actionItems: string[];
}

export interface PrescriptiveScenarioRecord {
  id: string;
  project_id: number;
  scenario_code: string;
  trigger_reason: string;
  target_metric: TargetMetricType;
  baseline_schedule_days: number;
  baseline_cost_vnd: number | string;
  status: ScenarioStatus;
  simulated_options: PrescriptiveOption[];
  pareto_frontier: PrescriptiveOption[];
  recommended_option_index: number | null;
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceRuleRecord {
  id: string;
  standard_code: string;
  standard_title: string;
  section_clause: string;
  domain: ComplianceDomain;
  rule_expression: Record<string, unknown>;
  severity: ComplianceSeverity;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface ComplianceAuditRecord {
  id: string;
  project_id: number;
  object_id: string;
  rule_id: string;
  compliance_status: ComplianceStatus;
  finding_details: string | null;
  evidence_snapshot: Record<string, unknown>;
  audited_at: string;
  created_at: string;
  object_name?: string;
  object_code?: string;
  object_discipline?: string;
  standard_code?: string;
  standard_title?: string;
  section_clause?: string;
  rule_severity?: ComplianceSeverity;
  rule_domain?: ComplianceDomain;
}

export interface SimulateScenarioInput {
  scenarioCode: string;
  triggerReason: string;
  targetMetric?: TargetMetricType;
  baselineScheduleDays: number;
  baselineCostVnd: number;
  maxCrashBudgetVnd?: number;
  targetDaysSaved?: number;
  simulationIterations?: number;
}

/**
 * Thuật toán Pareto Frontier (Non-dominated Sorting) đa mục tiêu:
 * - Mục tiêu 1: Rút ngắn tiến độ (scheduleCompressionDays) -> Càng lớn càng tốt (MAX)
 * - Mục tiêu 2: Chi phí bù tiến độ (crashCostVnd) -> Càng nhỏ càng tốt (MIN)
 * - Mục tiêu 3: Chỉ số rủi ro (riskScore) -> Càng nhỏ càng tốt (MIN)
 *
 * Một phương án A chi phối (dominates) phương án B nếu:
 * A không kém B ở bất kỳ tiêu chí nào VÀ A tốt hơn hẳn B ở ít nhất 1 tiêu chí.
 */
export function calculateParetoFrontier(options: PrescriptiveOption[]): PrescriptiveOption[] {
  if (options.length === 0) return [];

  const pareto: PrescriptiveOption[] = [];

  for (let i = 0; i < options.length; i++) {
    const candidate = options[i];
    let isDominated = false;

    for (let j = 0; j < options.length; j++) {
      if (i === j) continue;
      const other = options[j];

      const betterOrEqualDays = other.scheduleCompressionDays >= candidate.scheduleCompressionDays;
      const betterOrEqualCost = other.crashCostVnd <= candidate.crashCostVnd;
      const betterOrEqualRisk = other.riskScore <= candidate.riskScore;

      const strictlyBetterDays = other.scheduleCompressionDays > candidate.scheduleCompressionDays;
      const strictlyBetterCost = other.crashCostVnd < candidate.crashCostVnd;
      const strictlyBetterRisk = other.riskScore < candidate.riskScore;

      if (
        betterOrEqualDays &&
        betterOrEqualCost &&
        betterOrEqualRisk &&
        (strictlyBetterDays || strictlyBetterCost || strictlyBetterRisk)
      ) {
        isDominated = true;
        break;
      }
    }

    if (!isDominated) {
      pareto.push({ ...candidate, isParetoOptimal: true });
    }
  }

  return pareto.sort((a, b) => a.scheduleCompressionDays - b.scheduleCompressionDays);
}

/**
 * Xác định phương án tối ưu cân bằng (Recommended Knee Point) trên đường cong Pareto Frontier.
 * Tính điểm cân đối dựa trên khoảng cách chuẩn hóa tới điểm lý tưởng (Ideal Point).
 */
export function identifyRecommendedOption(paretoOptions: PrescriptiveOption[]): number | null {
  if (paretoOptions.length === 0) return null;
  if (paretoOptions.length === 1) return paretoOptions[0].optionIndex;

  const maxDays = Math.max(...paretoOptions.map((o) => o.scheduleCompressionDays), 1);
  const minDays = Math.min(...paretoOptions.map((o) => o.scheduleCompressionDays));
  const maxCost = Math.max(...paretoOptions.map((o) => o.crashCostVnd), 1);
  const minCost = Math.min(...paretoOptions.map((o) => o.crashCostVnd));
  const maxRisk = Math.max(...paretoOptions.map((o) => o.riskScore), 1);
  const minRisk = Math.min(...paretoOptions.map((o) => o.riskScore));

  let bestIndex = paretoOptions[0].optionIndex;
  let bestScore = -Infinity;

  for (const opt of paretoOptions) {
    // Chuẩn hóa 0..1
    const normDays =
      maxDays === minDays ? 1 : (opt.scheduleCompressionDays - minDays) / (maxDays - minDays);
    const normCost = maxCost === minCost ? 0 : (opt.crashCostVnd - minCost) / (maxCost - minCost);
    const normRisk = maxRisk === minRisk ? 0 : (opt.riskScore - minRisk) / (maxRisk - minRisk);

    // Điểm đánh giá đa tiêu chí (Trọng số: 45% Ngày rút ngắn, 35% Chi phí, 20% Rủi ro)
    const compositeScore =
      normDays * 0.45 - normCost * 0.35 - normRisk * 0.2 + opt.feasibilityScore * 0.1;

    if (compositeScore > bestScore) {
      bestScore = compositeScore;
      bestIndex = opt.optionIndex;
    }
  }

  return bestIndex;
}

/**
 * Mô phỏng Monte Carlo đa phương án bù tiến độ & giải tỏa xung đột
 */
export function simulatePrescriptiveEngine(
  baselineDays: number,
  baselineCostVnd: number,
  params?: {
    maxCrashBudgetVnd?: number;
    targetDaysSaved?: number;
    iterations?: number;
  },
): {
  options: PrescriptiveOption[];
  paretoFrontier: PrescriptiveOption[];
  recommendedIndex: number | null;
} {
  const maxBudget = params?.maxCrashBudgetVnd ?? baselineCostVnd * 0.25;
  const targetDays = params?.targetDaysSaved ?? Math.max(5, Math.round(baselineDays * 0.15));
  const count = Math.min(Math.max(params?.iterations ?? 25, 10), 100);

  const STRATEGIES = [
    {
      title: "Tăng ca 2 ca kíp (Double Shift Overtime)",
      category: "labor_acceleration",
      desc: "Bổ sung ca làm việc đêm từ 18:00 - 22:00 cho các tổ đội đường găng MEPF.",
      costMultiplier: 0.05,
      daysSavedPct: 0.12,
      baseRisk: 25,
      feasibility: 0.9,
      actions: [
        "Tăng phụ cấp làm đêm 30%",
        "Bổ sung chiếu sáng công trường và giám sát an toàn ca 2",
      ],
    },
    {
      title: "Bổ sung nhà thầu phụ tăng cường (Auxiliary Subcontractor)",
      category: "resource_surge",
      desc: "Huy động 2 tổ đội thầu phụ chuyên trách công tác kéo cáp và hàn ống trục đứng.",
      costMultiplier: 0.09,
      daysSavedPct: 0.22,
      baseRisk: 35,
      feasibility: 0.85,
      actions: [
        "Ký phụ lục hợp đồng giao khoán theo khối lượng",
        "Cấp chứng chỉ an toàn cấp tốc cho nhân công mới",
      ],
    },
    {
      title: "Chuyển đổi thi công Modul tiền chế (Prefabricated MEPF Modules)",
      category: "modern_method",
      desc: "Gia công cụm ống van và giá đỡ kỹ thuật tại xưởng trước khi đưa vào lắp đặt trên công trường.",
      costMultiplier: 0.14,
      daysSavedPct: 0.32,
      baseRisk: 20,
      feasibility: 0.95,
      actions: [
        "Đặt hàng cụm Skid tiền chế tại nhà máy",
        "Kiểm tra nghiệm thu hình học 3D trước khi vận chuyển",
      ],
    },
    {
      title: "Kích hoạt thi công song song đa mặt bằng (Fast-Tracking)",
      category: "workflow_parallel",
      desc: "Mở mặt bằng thi công đồng thời từ tầng 5 lên tầng 10 thay vì cuốn chiếu từng tầng.",
      costMultiplier: 0.07,
      daysSavedPct: 0.18,
      baseRisk: 45,
      feasibility: 0.75,
      actions: [
        "Phân luồng vận chuyển thăng tải vật tư",
        "Điều phối an toàn chống rơi ngã khi làm việc nhiều tầng",
      ],
    },
    {
      title: "Thu mua vật tư đặc thù đường hàng không (Express Procurement)",
      category: "supply_chain",
      desc: "Vận chuyển khẩn cấp van điều áp và đầu báo khói laser để giải tỏa ách tắc nghiệm thu.",
      costMultiplier: 0.12,
      daysSavedPct: 0.15,
      baseRisk: 15,
      feasibility: 0.98,
      actions: [
        "Phê duyệt thanh toán khẩn cấp",
        "Làm thủ tục thông quan ưu tiên tại cảng hàng không",
      ],
    },
  ];

  const generatedOptions: PrescriptiveOption[] = [];

  for (let i = 0; i < count; i++) {
    const strat = STRATEGIES[i % STRATEGIES.length];
    // Biến thiên ngẫu nhiên Monte Carlo
    const randomFactor = 0.85 + ((i * 17) % 31) / 100; // 0.85 -> 1.15
    const varianceCost = 0.9 + ((i * 13) % 23) / 100; // 0.9 -> 1.12

    const daysSaved = Math.max(1, Math.round(baselineDays * strat.daysSavedPct * randomFactor));
    const rawCost = Math.round(baselineCostVnd * strat.costMultiplier * varianceCost);
    const crashCost = Math.min(rawCost, maxBudget * 1.5);
    const risk = Math.min(
      100,
      Math.max(5, Math.round(strat.baseRisk * (1 + (daysSaved / targetDays) * 0.2))),
    );
    const clashMitigation = Math.round(daysSaved * 1.5);

    const ratio = daysSaved > 0 ? Math.round(crashCost / daysSaved) : crashCost;

    generatedOptions.push({
      optionIndex: i,
      title: `${strat.title} (Phương án #${i + 1})`,
      strategyCategory: strat.category,
      strategyDescription: strat.desc,
      scheduleCompressionDays: daysSaved,
      crashCostVnd: crashCost,
      riskScore: risk,
      clashMitigationCount: clashMitigation,
      isParetoOptimal: false,
      tradeOffRatio: ratio,
      feasibilityScore: strat.feasibility,
      actionItems: strat.actions,
    });
  }

  // Lọc tập Pareto Frontier
  const paretoFrontier = calculateParetoFrontier(generatedOptions);

  // Đánh dấu các phương án Pareto
  const paretoIndices = new Set(paretoFrontier.map((p) => p.optionIndex));
  for (const opt of generatedOptions) {
    if (paretoIndices.has(opt.optionIndex)) {
      opt.isParetoOptimal = true;
    }
  }

  const recommendedIndex = identifyRecommendedOption(paretoFrontier);

  return {
    options: generatedOptions,
    paretoFrontier,
    recommendedIndex,
  };
}

/**
 * 1. Chạy mô phỏng Prescriptive và lưu vào CSDL
 */
export async function runPrescriptiveSimulation(
  projectId: number,
  input: SimulateScenarioInput,
): Promise<PrescriptiveScenarioRecord> {
  const targetMetric: TargetMetricType = input.targetMetric || "multi_objective_pareto";

  const { options, paretoFrontier, recommendedIndex } = simulatePrescriptiveEngine(
    input.baselineScheduleDays,
    input.baselineCostVnd,
    {
      maxCrashBudgetVnd: input.maxCrashBudgetVnd,
      targetDaysSaved: input.targetDaysSaved,
      iterations: input.simulationIterations || 25,
    },
  );

  const row = await queryOne<PrescriptiveScenarioRecord>(
    `INSERT INTO engineering_prescriptive_scenarios (
      project_id, scenario_code, trigger_reason, target_metric,
      baseline_schedule_days, baseline_cost_vnd, status,
      simulated_options, pareto_frontier, recommended_option_index
    ) VALUES (?, ?, ?, ?, ?, ?, 'simulated', ?, ?, ?)
    ON CONFLICT (project_id, scenario_code) DO UPDATE SET
      trigger_reason = EXCLUDED.trigger_reason,
      target_metric = EXCLUDED.target_metric,
      baseline_schedule_days = EXCLUDED.baseline_schedule_days,
      baseline_cost_vnd = EXCLUDED.baseline_cost_vnd,
      simulated_options = EXCLUDED.simulated_options,
      pareto_frontier = EXCLUDED.pareto_frontier,
      recommended_option_index = EXCLUDED.recommended_option_index,
      updated_at = NOW()
    RETURNING *`,
    projectId,
    input.scenarioCode,
    input.triggerReason,
    targetMetric,
    input.baselineScheduleDays,
    input.baselineCostVnd,
    JSON.stringify(options),
    JSON.stringify(paretoFrontier),
    recommendedIndex,
  );

  return row!;
}

/**
 * 2. Lấy danh sách kịch bản Prescriptive theo dự án
 */
export async function getPrescriptiveScenarios(
  projectId: number,
  filters?: { status?: string; limit?: number },
): Promise<PrescriptiveScenarioRecord[]> {
  let sql = `
    SELECT * FROM engineering_prescriptive_scenarios
    WHERE project_id = ?
  `;
  const params: unknown[] = [projectId];

  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND status = ?`;
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(filters?.limit || 50);

  const rows = await query<PrescriptiveScenarioRecord>(sql, ...params);
  return rows;
}

/**
 * 3. Phê duyệt kịch bản tối ưu
 */
export async function approvePrescriptiveScenario(
  projectId: number,
  scenarioId: string,
  userId: number,
): Promise<PrescriptiveScenarioRecord | null> {
  const row = await queryOne<PrescriptiveScenarioRecord>(
    `UPDATE engineering_prescriptive_scenarios
     SET status = 'approved',
         approved_by = ?,
         approved_at = NOW(),
         updated_at = NOW()
     WHERE id = ? AND project_id = ?
     RETURNING *`,
    userId,
    scenarioId,
    projectId,
  );
  return row || null;
}

/**
 * ============================================================================
 * PHẦN 2: BỘ QUY CHUẨN KỸ THUẬT & TỰ ĐỘNG SINH NCR (STANDARDS COMPLIANCE)
 * ============================================================================
 */

export interface ElementProperties {
  clearance_mm?: number;
  fire_rating_hours?: number;
  sprinkler_spacing_mm?: number;
  pipe_diameter_mm?: number;
  grounding_resistance_ohm?: number;
  material_grade?: string;
  [key: string]: unknown;
}

/**
 * Đánh giá tính tuân thủ của một đối tượng kỹ thuật đối với một điều khoản quy chuẩn
 */
export function evaluateElementCompliance(
  element: { name: string; discipline: string; metadata?: Record<string, unknown> },
  rule: ComplianceRuleRecord,
): { isCompliant: boolean; findingDetails: string; evidence: Record<string, unknown> } {
  const meta = (element.metadata || {}) as ElementProperties;
  const expr = rule.rule_expression as Record<string, number | string>;

  const violations: string[] = [];
  const evidence: Record<string, unknown> = {
    evaluated_at: new Date().toISOString(),
    rule_clause: rule.section_clause,
    standard_code: rule.standard_code,
    element_metadata: meta,
  };

  // 1. Kiểm tra QCVN 06:2022/BXD (Khoảng cách thông thủy & Bậc chịu lửa)
  if (expr.min_clearance_mm != null) {
    const minClearance = Number(expr.min_clearance_mm);
    const actualClearance = meta.clearance_mm != null ? Number(meta.clearance_mm) : null;
    if (actualClearance != null && actualClearance < minClearance) {
      violations.push(
        `Khoảng cách thông thủy thực tế (${actualClearance}mm) nhỏ hơn mức tối thiểu theo quy chuẩn (${minClearance}mm)`,
      );
    }
  }

  if (expr.fire_rating_hours != null) {
    const minRating = Number(expr.fire_rating_hours);
    const actualRating = meta.fire_rating_hours != null ? Number(meta.fire_rating_hours) : null;
    if (actualRating != null && actualRating < minRating) {
      violations.push(
        `Giới hạn chịu lửa (${actualRating}h) không đạt yêu cầu bậc chịu lửa tối thiểu (${minRating}h)`,
      );
    }
  }

  // 2. Kiểm tra NFPA 13 (Sprinkler & Đường kính ống chữa cháy)
  if (expr.max_sprinkler_spacing_mm != null) {
    const maxSpacing = Number(expr.max_sprinkler_spacing_mm);
    const actualSpacing =
      meta.sprinkler_spacing_mm != null ? Number(meta.sprinkler_spacing_mm) : null;
    if (actualSpacing != null && actualSpacing > maxSpacing) {
      violations.push(
        `Khoảng cách đầu phun sprinkler (${actualSpacing}mm) vượt quá giới hạn tối đa (${maxSpacing}mm)`,
      );
    }
  }

  if (expr.min_pipe_diameter_mm != null) {
    const minDia = Number(expr.min_pipe_diameter_mm);
    const actualDia = meta.pipe_diameter_mm != null ? Number(meta.pipe_diameter_mm) : null;
    if (actualDia != null && actualDia < minDia) {
      violations.push(
        `Đường kính ống cấp (${actualDia}mm) nhỏ hơn kích thước danh định tối thiểu (${minDia}mm)`,
      );
    }
  }

  // 3. Kiểm tra TCVN 9385:2012 (Điện trở nối đất an toàn)
  if (expr.max_grounding_resistance_ohm != null) {
    const maxOhm = Number(expr.max_grounding_resistance_ohm);
    const actualOhm =
      meta.grounding_resistance_ohm != null ? Number(meta.grounding_resistance_ohm) : null;
    if (actualOhm != null && actualOhm > maxOhm) {
      violations.push(
        `Điện trở tiếp địa nối đất (${actualOhm}Ω) vượt quá ngưỡng an toàn cho phép (${maxOhm}Ω)`,
      );
    }
  }

  const isCompliant = violations.length === 0;
  const findingDetails = isCompliant
    ? `Thỏa mãn toàn diện các yêu cầu kỹ thuật theo điều khoản ${rule.section_clause} (${rule.standard_code}).`
    : `Phát hiện không phù hợp: ${violations.join("; ")}`;

  return {
    isCompliant,
    findingDetails,
    evidence,
  };
}

/**
 * 4. Audit kiểm tra đối tượng cụ thể với một quy chuẩn
 */
export async function auditEngineeringElement(
  projectId: number,
  objectId: string,
  ruleId: string,
): Promise<ComplianceAuditRecord> {
  const element = await queryOne<{
    id: string;
    name: string;
    discipline: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, name, discipline, properties AS metadata FROM engineering_objects WHERE id = ? AND project_id = ?`,
    objectId,
    projectId,
  );
  if (!element) {
    throw new Error("Không tìm thấy đối tượng kỹ thuật");
  }

  const rule = await queryOne<ComplianceRuleRecord>(
    `SELECT * FROM engineering_compliance_rules WHERE id = ?`,
    ruleId,
  );
  if (!rule) {
    throw new Error("Không tìm thấy quy chuẩn kỹ thuật");
  }

  const { isCompliant, findingDetails, evidence } = evaluateElementCompliance(element, rule);
  const complianceStatus: ComplianceStatus = isCompliant ? "compliant" : "non_compliant";

  const row = await queryOne<ComplianceAuditRecord>(
    `INSERT INTO engineering_compliance_audits (
      project_id, object_id, rule_id, compliance_status, finding_details, evidence_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *`,
    projectId,
    objectId,
    ruleId,
    complianceStatus,
    findingDetails,
    JSON.stringify(evidence),
  );

  return row!;
}

/**
 * 5. Tự động rà soát quy chuẩn theo lô toàn bộ đối tượng dự án (Batch Scan) và sinh NCR
 */
export async function scanAllElementsCompliance(projectId: number): Promise<{
  totalObjects: number;
  totalRules: number;
  compliantCount: number;
  nonCompliantCount: number;
  createdAudits: number;
}> {
  const objects = await query<{
    id: string;
    name: string;
    discipline: string;
    metadata: Record<string, unknown>;
  }>(
    `SELECT id, name, discipline, properties AS metadata FROM engineering_objects WHERE project_id = ?`,
    projectId,
  );

  const rules = await query<ComplianceRuleRecord>(
    `SELECT * FROM engineering_compliance_rules WHERE is_active = true`,
  );

  let compliantCount = 0;
  let nonCompliantCount = 0;
  let createdAudits = 0;

  for (const obj of objects) {
    for (const rule of rules) {
      // Chỉ kiểm tra các quy chuẩn liên quan hoặc chung
      const domainMatch =
        rule.domain === "general_building" ||
        rule.domain === obj.discipline ||
        (rule.domain === "fire_safety" &&
          (obj.discipline === "fire" ||
            obj.discipline === "plumbing" ||
            obj.discipline === "hvac"));

      if (!domainMatch) continue;

      const { isCompliant, findingDetails, evidence } = evaluateElementCompliance(obj, rule);
      const status: ComplianceStatus = isCompliant ? "compliant" : "non_compliant";

      if (isCompliant) {
        compliantCount++;
      } else {
        nonCompliantCount++;
      }

      await query(
        `INSERT INTO engineering_compliance_audits (
          project_id, object_id, rule_id, compliance_status, finding_details, evidence_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        projectId,
        obj.id,
        rule.id,
        status,
        findingDetails,
        JSON.stringify(evidence),
      );
      createdAudits++;
    }
  }

  return {
    totalObjects: objects.length,
    totalRules: rules.length,
    compliantCount,
    nonCompliantCount,
    createdAudits,
  };
}

/**
 * 6. Truy vấn danh sách biên bản kiểm định & hồ sơ NCR
 */
export async function getComplianceAudits(
  projectId: number,
  filters?: { status?: string; domain?: string; limit?: number },
): Promise<ComplianceAuditRecord[]> {
  let sql = `
    SELECT a.*,
           o.name as object_name, o.external_key as object_code, o.discipline as object_discipline,
           r.standard_code, r.standard_title, r.section_clause, r.severity as rule_severity, r.domain as rule_domain
    FROM engineering_compliance_audits a
    JOIN engineering_objects o ON a.object_id = o.id
    JOIN engineering_compliance_rules r ON a.rule_id = r.id
    WHERE a.project_id = ?
  `;
  const params: unknown[] = [projectId];

  if (filters?.status) {
    params.push(filters.status);
    sql += ` AND a.compliance_status = ?`;
  }
  if (filters?.domain) {
    params.push(filters.domain);
    sql += ` AND r.domain = ?`;
  }

  sql += ` ORDER BY a.audited_at DESC LIMIT ?`;
  params.push(filters?.limit || 100);

  const rows = await query<ComplianceAuditRecord>(sql, ...params);
  return rows;
}

/**
 * 7. Lấy danh mục tất cả quy chuẩn kỹ thuật
 */
export async function getComplianceRules(): Promise<ComplianceRuleRecord[]> {
  const rows = await query<ComplianceRuleRecord>(
    `SELECT * FROM engineering_compliance_rules ORDER BY domain ASC, standard_code ASC`,
  );
  return rows;
}
