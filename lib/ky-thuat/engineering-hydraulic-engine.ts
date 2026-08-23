// lib/engineering-hydraulic-engine.ts — Unified Hydraulic & Ductwork Engineering Engine (M68 / M76 / M92)
import { query, queryOne, run } from "@/lib/db";

// ============================================================================
// 1. TIÊU CHUẨN THÔNG SỐ VẬT LIỆU & ĐƯỜNG ỐNG
// ============================================================================

export type HydraulicSystemType =
  "chilled_water" | "condenser_water" | "domestic_water" | "firefighting_sprinkler" | "air_duct";

export interface PipeStandardSize {
  nominalSpec: string; // e.g. "DN15", "DN50", "DN100"
  innerDiameterMm: number;
  outerDiameterMm: number;
  weightEmptyKgM: number;
  standardHangerSpacingM: number;
  recommendedRodSize: "M8" | "M10" | "M12" | "M16";
}

export const STANDARD_STEEL_PIPES: PipeStandardSize[] = [
  {
    nominalSpec: "DN15",
    innerDiameterMm: 15.8,
    outerDiameterMm: 21.3,
    weightEmptyKgM: 1.28,
    standardHangerSpacingM: 2.0,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN20",
    innerDiameterMm: 21.0,
    outerDiameterMm: 26.9,
    weightEmptyKgM: 1.69,
    standardHangerSpacingM: 2.0,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN25",
    innerDiameterMm: 26.6,
    outerDiameterMm: 33.7,
    weightEmptyKgM: 2.44,
    standardHangerSpacingM: 2.2,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN32",
    innerDiameterMm: 35.1,
    outerDiameterMm: 42.4,
    weightEmptyKgM: 3.14,
    standardHangerSpacingM: 2.5,
    recommendedRodSize: "M8",
  },
  {
    nominalSpec: "DN40",
    innerDiameterMm: 40.9,
    outerDiameterMm: 48.3,
    weightEmptyKgM: 3.65,
    standardHangerSpacingM: 2.7,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN50",
    innerDiameterMm: 52.5,
    outerDiameterMm: 60.3,
    weightEmptyKgM: 5.1,
    standardHangerSpacingM: 3.0,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN65",
    innerDiameterMm: 62.7,
    outerDiameterMm: 73.0,
    weightEmptyKgM: 6.51,
    standardHangerSpacingM: 3.0,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN80",
    innerDiameterMm: 77.9,
    outerDiameterMm: 88.9,
    weightEmptyKgM: 8.63,
    standardHangerSpacingM: 3.2,
    recommendedRodSize: "M10",
  },
  {
    nominalSpec: "DN100",
    innerDiameterMm: 102.3,
    outerDiameterMm: 114.3,
    weightEmptyKgM: 12.5,
    standardHangerSpacingM: 3.5,
    recommendedRodSize: "M12",
  },
  {
    nominalSpec: "DN125",
    innerDiameterMm: 128.2,
    outerDiameterMm: 141.3,
    weightEmptyKgM: 16.2,
    standardHangerSpacingM: 3.8,
    recommendedRodSize: "M12",
  },
  {
    nominalSpec: "DN150",
    innerDiameterMm: 154.1,
    outerDiameterMm: 168.3,
    weightEmptyKgM: 21.8,
    standardHangerSpacingM: 4.2,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN200",
    innerDiameterMm: 202.7,
    outerDiameterMm: 219.1,
    weightEmptyKgM: 33.3,
    standardHangerSpacingM: 4.5,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN250",
    innerDiameterMm: 254.5,
    outerDiameterMm: 273.0,
    weightEmptyKgM: 42.6,
    standardHangerSpacingM: 5.0,
    recommendedRodSize: "M16",
  },
  {
    nominalSpec: "DN300",
    innerDiameterMm: 304.8,
    outerDiameterMm: 323.9,
    weightEmptyKgM: 54.2,
    standardHangerSpacingM: 5.5,
    recommendedRodSize: "M16",
  },
];

// ============================================================================
// 2. CÔNG THỨC THỦY LỰC CƠ BẢN (DARCY-WEISBACH, HAZEN-WILLIAMS, SWAMEE-JAIN)
// ============================================================================

export function calcDarcyWeisbach(
  flowRateLps: number,
  diameterMm: number,
  lengthM: number,
  roughnessMm: number = 0.045,
): {
  velocityMs: number;
  reynolds: number;
  frictionFactor: number;
  headLossPa: number;
  headLossM: number;
} {
  const dM = diameterMm / 1000;
  const areaM2 = (Math.PI * Math.pow(dM, 2)) / 4;
  const flowM3s = flowRateLps / 1000;
  const velocityMs = flowM3s / areaM2;

  const nu = 1.004e-6; // Độ nhớt động học nước ở 20°C (m2/s)
  const reynolds = (velocityMs * dM) / nu;

  let f = 0.02;
  if (reynolds > 4000) {
    const e_D = roughnessMm / diameterMm;
    f = 0.25 / Math.pow(Math.log10(e_D / 3.7 + 5.74 / Math.pow(reynolds, 0.9)), 2);
  } else if (reynolds > 0) {
    f = 64 / Math.max(reynolds, 1);
  }

  const rho = 998.2;
  const g = 9.81;
  const headLossPa = (f * (lengthM / dM) * (rho * Math.pow(velocityMs, 2))) / 2;
  const headLossM = headLossPa / (rho * g);

  return {
    velocityMs: Math.round(velocityMs * 1000) / 1000,
    reynolds: Math.round(reynolds),
    frictionFactor: Math.round(f * 10000) / 10000,
    headLossPa: Math.round(headLossPa),
    headLossM: Math.round(headLossM * 1000) / 1000,
  };
}

export function calcHazenWilliams(
  flowRateM3h: number,
  lengthM: number,
  innerDiameterMm: number,
  cFactor: number = 120,
): { velocityMs: number; headLossM: number; headLossBar: number } {
  const dM = innerDiameterMm / 1000;
  const flowM3s = flowRateM3h / 3600;
  const areaM2 = (Math.PI * Math.pow(dM, 2)) / 4;
  const velocityMs = flowM3s / areaM2;

  const hf =
    (10.67 * Math.pow(flowM3s, 1.852) * lengthM) / (Math.pow(cFactor, 1.852) * Math.pow(dM, 4.87));
  const headLossBar = (hf * 9.81 * 1000) / 100000;

  return {
    velocityMs: Math.round(velocityMs * 1000) / 1000,
    headLossM: Math.round(hf * 1000) / 1000,
    headLossBar: Math.round(headLossBar * 10000) / 10000,
  };
}

export function validateVelocityLimit(
  systemType: HydraulicSystemType | string,
  velocityMs: number,
): { isAllowed: boolean; limitMs: number; message: string } {
  let limitMs = 2.0;
  if (systemType === "domestic_water" || systemType === "chilled_water") limitMs = 1.8;
  if (systemType === "condenser_water") limitMs = 2.2;
  if (systemType === "firefighting_sprinkler") limitMs = 3.5;
  if (systemType === "air_duct") limitMs = 6.0;

  const isAllowed = velocityMs <= limitMs;
  return {
    isAllowed,
    limitMs,
    message: isAllowed
      ? `Vận tốc ${velocityMs} m/s đạt chuẩn (ngưỡng max ${limitMs} m/s).`
      : `CẢNH BÁO: Vận tốc ${velocityMs} m/s vượt ngưỡng giới hạn ${limitMs} m/s gây ồn và xói mòn.`,
  };
}

// ============================================================================
// 3. TÍNH TOÁN GIÁ ĐỠ & CHỌN CỠ ỐNG AUTO-SIZING
// ============================================================================

export function autoSizePipeDiameter(
  flowOrRate: number,
  systemOrMaxV: HydraulicSystemType | number = "chilled_water",
  maxVelocityMsInput: number = 1.5,
): any {
  // Overload 1: autoSizePipeDiameter(flowRateLps: number, maxVelocityMs: number)
  if (typeof systemOrMaxV === "number") {
    const flowRateLps = flowOrRate;
    const maxVelocity = systemOrMaxV;
    const flowM3s = flowRateLps / 1000;

    for (const pipe of STANDARD_STEEL_PIPES) {
      const dM = pipe.innerDiameterMm / 1000;
      const area = (Math.PI * Math.pow(dM, 2)) / 4;
      const v = flowM3s / area;
      if (v <= maxVelocity) {
        return {
          standardDn: pipe.nominalSpec,
          nominalDiameterMm: pipe.innerDiameterMm,
          outerDiameterMm: pipe.outerDiameterMm,
          actualVelocityMs: Math.round(v * 1000) / 1000,
          pipeSpec: pipe,
        };
      }
    }
    const largest = STANDARD_STEEL_PIPES[STANDARD_STEEL_PIPES.length - 1];
    return {
      standardDn: largest.nominalSpec,
      nominalDiameterMm: largest.innerDiameterMm,
      outerDiameterMm: largest.outerDiameterMm,
      actualVelocityMs:
        Math.round(
          (flowM3s / ((Math.PI * Math.pow(largest.innerDiameterMm / 1000, 2)) / 4)) * 1000,
        ) / 1000,
      pipeSpec: largest,
    };
  }

  // Overload 2: autoSizePipeDiameter(flowRateM3h: number, systemType: HydraulicSystemType, maxVelocityMs: number)
  const flowRateM3h = flowOrRate;
  const systemType = systemOrMaxV;
  const maxVelocity = maxVelocityMsInput;
  const flowM3s = flowRateM3h / 3600;

  for (const pipe of STANDARD_STEEL_PIPES) {
    const dM = pipe.innerDiameterMm / 1000;
    const area = (Math.PI * Math.pow(dM, 2)) / 4;
    const v = flowM3s / area;
    if (v <= maxVelocity) {
      return pipe;
    }
  }
  return STANDARD_STEEL_PIPES[STANDARD_STEEL_PIPES.length - 1];
}

export function calculateHydraulicLoss(
  flowRateM3h: number,
  pipeLengthM: number,
  innerDiameterMm: number,
  cFactor: number = 120,
) {
  return calcHazenWilliams(flowRateM3h, pipeLengthM, innerDiameterMm, cFactor);
}

export function calculateHangerLoadAndSpacing(
  pipe: PipeStandardSize,
  totalPipeLengthM: number,
): {
  pipeFilledWeightKgM: number;
  totalWeightKg: number;
  spacingM: number;
  hangersCount: number;
  rodSize: "M8" | "M10" | "M12" | "M16";
} {
  const dM = pipe.innerDiameterMm / 1000;
  const waterWeightKgM = ((Math.PI * Math.pow(dM, 2)) / 4) * 1000;
  const pipeFilledWeightKgM = pipe.weightEmptyKgM + waterWeightKgM;
  const totalWeightKg = Math.round(pipeFilledWeightKgM * totalPipeLengthM * 100) / 100;
  const spacingM = pipe.standardHangerSpacingM;
  const hangersCount = Math.ceil(totalPipeLengthM / spacingM) + 1;

  return {
    pipeFilledWeightKgM: Math.round(pipeFilledWeightKgM * 100) / 100,
    totalWeightKg,
    spacingM,
    hangersCount,
    rodSize: pipe.recommendedRodSize,
  };
}

export function runMepfHydraulicAnalysis(
  calcCode: string,
  systemType: HydraulicSystemType,
  flowRateM3h: number,
  totalLengthM: number,
  maxAllowedVelocityMs: number = 1.5,
) {
  const optimalPipe = autoSizePipeDiameter(
    flowRateM3h,
    systemType,
    maxAllowedVelocityMs,
  ) as PipeStandardSize;
  const hydraulicLoss = calculateHydraulicLoss(
    flowRateM3h,
    totalLengthM,
    optimalPipe.innerDiameterMm,
  );
  const hanger = calculateHangerLoadAndSpacing(optimalPipe, totalLengthM);

  return {
    calcCode,
    systemType,
    flowRateM3h,
    totalLengthM,
    selectedDiameterSpec: optimalPipe.nominalSpec,
    fluidVelocityMs: hydraulicLoss.velocityMs,
    velocityStatus: hydraulicLoss.velocityMs <= maxAllowedVelocityMs ? "optimal" : "exceeded",
    totalPressureLossBar: hydraulicLoss.headLossBar,
    totalHangersNeeded: hanger.hangersCount,
    recommendedHangerSpacingM: hanger.spacingM,
    recommendedRodSize: hanger.rodSize,
  };
}

// ============================================================================
// 4. MẠNG LƯỚI ĐỒ THỊ THỦY LỰC & CÂN BẰNG MẠCH (TOPOLOGICAL GRAPH & BALANCING)
// ============================================================================

export interface NetworkNode {
  id: string;
  name: string;
  type: "source" | "junction_tee" | "cross" | "valve" | "terminal" | "equipment";
  elevationM: number;
  demandFlowLps: number;
  pressureAvailableBar?: number;
}

export interface NetworkEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthM: number;
  nominalDiameterMm: number;
  flowRateLps: number;
  velocityMs: number;
  headLossPa: number;
  pressureDropBar: number;
  fittingLossFactorSum: number;
  isCriticalPath: boolean;
}

export interface BalancingValveScheduleItem {
  valveCode: string;
  edgeId: string;
  locationNode: string;
  designFlowLps: number;
  targetPressureDropBar: number;
  requiredKvCoefficient: number;
  valveSettingPresetPercent: number;
}

export interface HydraulicNetworkSolveResult {
  networkCode: string;
  sourceNodeId: string;
  totalSystemFlowLps: number;
  totalSystemFlowM3h: number;
  criticalIndexEdgeId: string;
  criticalPathLossBar: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  balancingSchedule: BalancingValveScheduleItem[];
  isHydraulicallyBalanced: boolean;
}

export function solveHydraulicNetwork(
  networkCode: string,
  nodes: NetworkNode[],
  rawEdges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    lengthM: number;
    nominalDiameterMm?: number;
  }>,
): HydraulicNetworkSolveResult {
  const nodeMap = new Map<string, NetworkNode>();
  for (const n of nodes) nodeMap.set(n.id, { ...n });

  const childrenMap = new Map<
    string,
    Array<{ edgeId: string; toNodeId: string; lengthM: number }>
  >();
  for (const e of rawEdges) {
    if (!childrenMap.has(e.fromNodeId)) childrenMap.set(e.fromNodeId, []);
    childrenMap.get(e.fromNodeId)!.push({ edgeId: e.id, toNodeId: e.toNodeId, lengthM: e.lengthM });
  }

  const computedEdges: NetworkEdge[] = [];
  const edgeCumulativeLossMap = new Map<string, number>();

  function calculateSubtreeFlow(nodeId: string): number {
    const node = nodeMap.get(nodeId);
    let totalFlow = node ? node.demandFlowLps : 0;
    const branches = childrenMap.get(nodeId) || [];

    for (const b of branches) {
      const childFlow = calculateSubtreeFlow(b.toNodeId);
      totalFlow += childFlow;

      const rawE = rawEdges.find((x) => x.id === b.edgeId)!;
      let dn: number = rawE.nominalDiameterMm || 0;
      if (!dn || dn <= 0) {
        const sizing = autoSizePipeDiameter(childFlow, 1.8);
        dn = (sizing as any).nominalDiameterMm || 25;
      }

      const loss = calcDarcyWeisbach(childFlow, dn, b.lengthM);
      const pressureDropBar = loss.headLossPa / 100000;

      computedEdges.push({
        id: b.edgeId,
        fromNodeId: nodeId,
        toNodeId: b.toNodeId,
        lengthM: b.lengthM,
        nominalDiameterMm: dn,
        flowRateLps: Math.round(childFlow * 1000) / 1000,
        velocityMs: loss.velocityMs,
        headLossPa: loss.headLossPa,
        pressureDropBar: Math.round(pressureDropBar * 10000) / 10000,
        fittingLossFactorSum: 1.5,
        isCriticalPath: false,
      });
    }
    return totalFlow;
  }

  const sourceNode = nodes.find((n) => n.type === "source") || nodes[0];
  const totalFlowLps = calculateSubtreeFlow(sourceNode.id);

  function accumulatePathLoss(nodeId: string, currentLossBar: number) {
    const branches = computedEdges.filter((e) => e.fromNodeId === nodeId);
    for (const b of branches) {
      const cumLoss = currentLossBar + b.pressureDropBar;
      edgeCumulativeLossMap.set(b.id, cumLoss);
      accumulatePathLoss(b.toNodeId, cumLoss);
    }
  }
  accumulatePathLoss(sourceNode.id, 0);

  let maxLossBar = 0;
  let criticalEdgeId = "";
  for (const [edgeId, cumLoss] of edgeCumulativeLossMap.entries()) {
    if (cumLoss > maxLossBar) {
      maxLossBar = cumLoss;
      criticalEdgeId = edgeId;
    }
  }

  for (const e of computedEdges) {
    if (e.id === criticalEdgeId) e.isCriticalPath = true;
  }

  const balancingSchedule: BalancingValveScheduleItem[] = [];
  let valveSeq = 1;
  const terminalNodes = nodes.filter((n) => n.type === "terminal" || n.demandFlowLps > 0);

  for (const t of terminalNodes) {
    const incomingEdge = computedEdges.find((e) => e.toNodeId === t.id);
    if (incomingEdge) {
      const branchLoss = edgeCumulativeLossMap.get(incomingEdge.id) || incomingEdge.pressureDropBar;
      const deltaPNeededBar = Math.max(0, maxLossBar - branchLoss);

      if (deltaPNeededBar > 0.005) {
        const flowM3h = (t.demandFlowLps * 3600) / 1000;
        const requiredKv = Math.round((flowM3h / Math.sqrt(deltaPNeededBar)) * 100) / 100;
        const presetPercent = Math.min(100, Math.max(10, Math.round((requiredKv / 15.0) * 100)));

        balancingSchedule.push({
          valveCode: `BV-${String(valveSeq++).padStart(2, "0")}`,
          edgeId: incomingEdge.id,
          locationNode: t.id,
          designFlowLps: t.demandFlowLps,
          targetPressureDropBar: Math.round(deltaPNeededBar * 10000) / 10000,
          requiredKvCoefficient: requiredKv,
          valveSettingPresetPercent: presetPercent,
        });
      }
    }
  }

  return {
    networkCode,
    sourceNodeId: sourceNode.id,
    totalSystemFlowLps: Math.round(totalFlowLps * 1000) / 1000,
    totalSystemFlowM3h: Math.round(((totalFlowLps * 3600) / 1000) * 100) / 100,
    criticalIndexEdgeId: criticalEdgeId,
    criticalPathLossBar: Math.round(maxLossBar * 10000) / 10000,
    nodes,
    edges: computedEdges,
    balancingSchedule,
    isHydraulicallyBalanced: balancingSchedule.length > 0 || computedEdges.length <= 1,
  };
}
