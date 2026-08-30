import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";

export interface CashflowPeriodProjection {
  periodIndex: number;
  periodLabel: string;
  projectedEarnedValue: number;
  projectedCashIn: number;
  projectedCashOut: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
  workingCapitalGap: number;
}

export interface WorkingCapitalRiskAnalysis {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  dipPeriod: string;
  maxDeficitAmount: number;
  mitigationRecommendation: string;
}

export function calculateSCurveDistribution(
  duration: number,
  shape: "standard" | "front_loaded" | "back_loaded" = "standard",
): number[] {
  const weights: number[] = [];
  let totalWeight = 0;

  for (let i = 1; i <= duration; i++) {
    const t = i / duration;
    let w = 0;
    if (shape === "front_loaded") {
      w = Math.sin((t * Math.PI) / 2);
    } else if (shape === "back_loaded") {
      w = 1 - Math.cos((t * Math.PI) / 2);
    } else {
      w = Math.exp(-Math.pow((t - 0.5) / 0.25, 2));
    }
    weights.push(w);
    totalWeight += w;
  }

  return weights.map((w) => w / totalWeight);
}

export function computeCashflowSimulationEngine(params: {
  totalContractValue: number;
  advancePercent: number;
  retentionPercent: number;
  paymentDelayDays: number;
  durationPeriods: number;
  sCurveShape?: "standard" | "front_loaded" | "back_loaded";
  costRatio?: number;
}): { projections: CashflowPeriodProjection[]; risk: WorkingCapitalRiskAnalysis } {
  const {
    totalContractValue,
    advancePercent,
    retentionPercent,
    paymentDelayDays,
    durationPeriods = 12,
    sCurveShape = "standard",
    costRatio = 0.85,
  } = params;

  const advanceAmount = (totalContractValue * advancePercent) / 100;
  const retentionFactor = (100 - retentionPercent) / 100;
  const weights = calculateSCurveDistribution(durationPeriods, sCurveShape);
  const delayLagPeriods = Math.max(1, Math.round(paymentDelayDays / 30));

  const projections: CashflowPeriodProjection[] = [];
  let cumulative = 0;
  let maxDeficit = 0;
  let dipPeriod = "N/A";

  cumulative += advanceAmount;
  projections.push({
    periodIndex: 0,
    periodLabel: "Kỳ T0 (Tạm ứng)",
    projectedEarnedValue: 0,
    projectedCashIn: advanceAmount,
    projectedCashOut: 0,
    netCashFlow: advanceAmount,
    cumulativeCashFlow: cumulative,
    workingCapitalGap: 0,
  });

  const periodEVs: number[] = [];
  for (let i = 0; i < durationPeriods; i++) {
    periodEVs.push(totalContractValue * weights[i]);
  }

  for (let p = 1; p <= durationPeriods; p++) {
    const ev = periodEVs[p - 1];
    const cashOut = ev * costRatio;

    let cashIn = 0;
    const sourcePeriod = p - delayLagPeriods;
    if (sourcePeriod >= 0) {
      const earnedSource = periodEVs[sourcePeriod] || 0;
      const advanceDeduction = earnedSource * (advancePercent / 100);
      cashIn = (earnedSource - advanceDeduction) * retentionFactor;
    }

    if (p === durationPeriods) {
      const totalRetention = (totalContractValue * retentionPercent) / 100;
      cashIn += totalRetention;
    }

    const net = cashIn - cashOut;
    cumulative += net;
    const gap = cumulative < 0 ? Math.abs(cumulative) : 0;

    if (cumulative < -maxDeficit) {
      maxDeficit = Math.abs(cumulative);
      dipPeriod = `Tháng ${p}`;
    }

    projections.push({
      periodIndex: p,
      periodLabel: `Tháng ${p}`,
      projectedEarnedValue: Math.round(ev),
      projectedCashIn: Math.round(cashIn),
      projectedCashOut: Math.round(cashOut),
      netCashFlow: Math.round(net),
      cumulativeCashFlow: Math.round(cumulative),
      workingCapitalGap: Math.round(gap),
    });
  }

  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let recommendation = "Dòng tiền dự án cân bằng, không có rủi ro thiếu hụt vốn lưu động.";

  const deficitRatio = maxDeficit / totalContractValue;
  if (deficitRatio > 0.15) {
    riskLevel = "CRITICAL";
    recommendation = `Thâm hụt vốn lưu động nghiêm trọng (đạt đỉnh ${maxDeficit.toLocaleString("vi-VN")} VND tại ${dipPeriod}). Cần đàm phán tăng tạm ứng lên ${advancePercent + 10}% hoặc giãn điều khoản thanh toán thầu phụ.`;
  } else if (deficitRatio > 0.08) {
    riskLevel = "HIGH";
    recommendation = `Rủi ro thiếu hụt vốn vào ${dipPeriod}. Đề xuất rút ngắn chu kỳ nghiệm thu IPC xuống 15 ngày và kiểm soát hạn mức chi vật tư.`;
  } else if (deficitRatio > 0.02) {
    riskLevel = "MEDIUM";
    recommendation = `Có khoảng lõm dòng tiền nhẹ vào ${dipPeriod}. Có thể sử dụng hạn mức thấu chi ngắn hạn ngân hàng để bù đắp.`;
  }

  return {
    projections,
    risk: {
      riskLevel,
      dipPeriod,
      maxDeficitAmount: Math.round(maxDeficit),
      mitigationRecommendation: recommendation,
    },
  };
}

export async function runAndSaveCashflowForecast(params: {
  projectId: number;
  runName: string;
  totalContractValue: number;
  advancePercent: number;
  retentionPercent: number;
  paymentDelayDays: number;
  durationPeriods?: number;
  createdBy?: number | null;
}) {
  const {
    projectId,
    runName,
    totalContractValue,
    advancePercent,
    retentionPercent,
    paymentDelayDays,
    durationPeriods = 12,
    createdBy = null,
  } = params;

  const simulation = computeCashflowSimulationEngine({
    totalContractValue,
    advancePercent,
    retentionPercent,
    paymentDelayDays,
    durationPeriods,
  });

  return withProjectScope(
    projectId,
    async () => {
      return withTransaction(async () => {
        const runs = await query<any>(
          `INSERT INTO engineering_cashflow_forecast_runs
           (project_id, run_name, parameters, total_contract_value, advance_percent, retention_percent, payment_delay_days, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING id, project_id AS "projectId", run_name AS "runName", total_contract_value AS "totalContractValue",
                   advance_percent AS "advancePercent", retention_percent AS "retentionPercent", payment_delay_days AS "paymentDelayDays",
                   created_at AS "createdAt"`,
          projectId,
          runName,
          JSON.stringify(params),
          totalContractValue,
          advancePercent,
          retentionPercent,
          paymentDelayDays,
          createdBy,
        );

        const run = runs[0];

        for (const p of simulation.projections) {
          await query(
            `INSERT INTO engineering_cashflow_period_projections
             (run_id, project_id, period_index, period_label, projected_earned_value, projected_cash_in, projected_cash_out, net_cash_flow, cumulative_cash_flow, working_capital_gap)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            run.id,
            projectId,
            p.periodIndex,
            p.periodLabel,
            p.projectedEarnedValue,
            p.projectedCashIn,
            p.projectedCashOut,
            p.netCashFlow,
            p.cumulativeCashFlow,
            p.workingCapitalGap,
          );
        }

        await query(
          `INSERT INTO engineering_working_capital_risks
           (run_id, project_id, risk_level, dip_period, max_deficit_amount, mitigation_recommendation)
         VALUES (?, ?, ?, ?, ?, ?)`,
          run.id,
          projectId,
          simulation.risk.riskLevel,
          simulation.risk.dipPeriod,
          simulation.risk.maxDeficitAmount,
          simulation.risk.mitigationRecommendation,
        );

        return {
          run,
          projections: simulation.projections,
          risk: simulation.risk,
        };
      });
    },
    { readOnly: false },
  );
}

export async function listCashflowForecasts(projectId: number) {
  return withProjectScope(projectId, async () => {
    return query<any>(
      `SELECT r.id, r.project_id AS "projectId", r.run_name AS "runName",
              r.total_contract_value::text AS "totalContractValue",
              r.advance_percent::text AS "advancePercent",
              r.retention_percent::text AS "retentionPercent",
              r.payment_delay_days AS "paymentDelayDays",
              r.created_at AS "createdAt",
              k.risk_level AS "riskLevel",
              k.dip_period AS "dipPeriod",
              k.max_deficit_amount::text AS "maxDeficitAmount",
              k.mitigation_recommendation AS "mitigationRecommendation"
       FROM engineering_cashflow_forecast_runs r
       LEFT JOIN engineering_working_capital_risks k ON k.run_id = r.id
       WHERE r.project_id = ?
       ORDER BY r.created_at DESC`,
      projectId,
    );
  });
}
