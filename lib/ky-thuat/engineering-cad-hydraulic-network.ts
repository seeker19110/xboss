// lib/engineering-cad-hydraulic-network.ts — Facade for Unified Hydraulic Network Engine (M76 / M92)
import { query, queryOne } from "@/lib/db";

import {
  type NetworkNode,
  type NetworkEdge,
  type BalancingValveScheduleItem,
} from "@/lib/ky-thuat/engineering-hydraulic-engine";

export { type NetworkNode, type NetworkEdge, type BalancingValveScheduleItem };

import { calcDarcyWeisbach, validateVelocityLimit } from "@/lib/ky-thuat/engineering-cad-nesting";

export interface HydraulicNetworkResult {
  networkCode: string;
  systemType: string;
  totalFlowRateLps: number;
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  criticalRunPath: string[];
  criticalPressureDropPa: number;
  criticalPressureDropBar: number;
  balancingValves: BalancingValveScheduleItem[];
  hydraulicStatus: "balanced" | "bottleneck_alert" | "over_velocity_risk";
  warnings: string[];
}

export function autoSizePipeDiameter(
  flowRateLps: number,
  targetMaxVelocityMs = 1.8,
): { diameterMm: number; standardDn: string; actualVelocityMs: number } {
  const STANDARD_PIPES = [
    { dn: "DN15", innerDiaMm: 16.0 },
    { dn: "DN20", innerDiaMm: 21.6 },
    { dn: "DN25", innerDiaMm: 27.2 },
    { dn: "DN32", innerDiaMm: 35.9 },
    { dn: "DN40", innerDiaMm: 41.8 },
    { dn: "DN50", innerDiaMm: 53.0 },
    { dn: "DN65", innerDiaMm: 68.8 },
    { dn: "DN80", innerDiaMm: 80.8 },
    { dn: "DN100", innerDiaMm: 105.3 },
    { dn: "DN125", innerDiaMm: 130.0 },
    { dn: "DN150", innerDiaMm: 155.4 },
    { dn: "DN200", innerDiaMm: 204.7 },
  ];

  const qM3s = flowRateLps / 1000;

  for (const p of STANDARD_PIPES) {
    const areaM2 = (Math.PI * Math.pow(p.innerDiaMm / 1000, 2)) / 4;
    const vel = areaM2 > 0 ? qM3s / areaM2 : 0;
    if (vel <= targetMaxVelocityMs) {
      return {
        diameterMm: p.innerDiaMm,
        standardDn: p.dn,
        actualVelocityMs: Math.round(vel * 100) / 100,
      };
    }
  }

  const largest = STANDARD_PIPES[STANDARD_PIPES.length - 1];
  const areaM2 = (Math.PI * Math.pow(largest.innerDiaMm / 1000, 2)) / 4;
  return {
    diameterMm: largest.innerDiaMm,
    standardDn: largest.dn,
    actualVelocityMs: Math.round((qM3s / areaM2) * 100) / 100,
  };
}

export function solveHydraulicNetwork(
  networkCode: string,
  systemType: "chilled_water" | "domestic_water" | "fire_sprinkler",
  nodesInput: NetworkNode[],
  rawEdges: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    lengthM: number;
    fittingLossFactorSum?: number;
    fixedDiameterMm?: number;
  }>,
): HydraulicNetworkResult {
  const warnings: string[] = [];
  const nodeMap = new Map<string, NetworkNode>();
  for (const n of nodesInput) {
    nodeMap.set(n.id, { ...n });
  }

  const edgeFlows = new Map<string, number>();

  function computeFlowForEdge(edgeId: string): number {
    const edge = rawEdges.find((e) => e.id === edgeId);
    if (!edge) return 0;

    const targetNode = nodeMap.get(edge.toNodeId);
    let childFlow = targetNode ? targetNode.demandFlowLps : 0;

    const outgoingEdges = rawEdges.filter((e) => e.fromNodeId === edge.toNodeId);
    for (const outE of outgoingEdges) {
      childFlow += computeFlowForEdge(outE.id);
    }

    edgeFlows.set(edgeId, childFlow);
    return childFlow;
  }

  const sourceNodes = nodesInput.filter((n) => n.type === "source");
  let totalNetFlow = 0;

  for (const src of sourceNodes) {
    const startEdges = rawEdges.filter((e) => e.fromNodeId === src.id);
    for (const se of startEdges) {
      totalNetFlow += computeFlowForEdge(se.id);
    }
  }

  const resolvedEdges: NetworkEdge[] = [];

  for (const re of rawEdges) {
    const flowLps = edgeFlows.get(re.id) || 0;
    const sizing = re.fixedDiameterMm
      ? {
          diameterMm: re.fixedDiameterMm,
          standardDn: `DN${Math.round(re.fixedDiameterMm)}`,
          actualVelocityMs:
            flowLps / 1000 / ((Math.PI * Math.pow(re.fixedDiameterMm / 1000, 2)) / 4),
        }
      : autoSizePipeDiameter(flowLps, systemType === "chilled_water" ? 2.2 : 1.8);

    const dw = calcDarcyWeisbach(
      flowLps,
      sizing.diameterMm,
      0.046,
      re.lengthM,
      systemType === "chilled_water" ? 7.0 : 25.0,
    );

    const zeta = re.fittingLossFactorSum || 1.5;
    const localLossPa = (zeta * 1000 * Math.pow(dw.velocityMs, 2)) / 2;
    const totalHeadLossPa = dw.totalHeadLossPa + localLossPa;
    const totalDpBar = totalHeadLossPa / 100000;

    const velCheck = validateVelocityLimit(
      dw.velocityMs,
      systemType === "chilled_water" ? "chilled_water" : "domestic_water",
    );
    if (!velCheck.ok) {
      warnings.push(`Đoạn ${re.id} (${sizing.standardDn}): ${velCheck.message}`);
    }

    resolvedEdges.push({
      id: re.id,
      fromNodeId: re.fromNodeId,
      toNodeId: re.toNodeId,
      lengthM: re.lengthM,
      nominalDiameterMm: sizing.diameterMm,
      flowRateLps: Math.round(flowLps * 1000) / 1000,
      velocityMs: dw.velocityMs,
      headLossPa: Math.round(totalHeadLossPa * 10) / 10,
      pressureDropBar: Math.round(totalDpBar * 10000) / 10000,
      fittingLossFactorSum: zeta,
      isCriticalPath: false,
    });
  }

  let maxPathPressurePa = 0;
  let criticalPathEdges: string[] = [];

  function tracePath(currentNodeId: string, currentAccumPa: number, currentPath: string[]) {
    const outgoing = resolvedEdges.filter((e) => e.fromNodeId === currentNodeId);
    if (outgoing.length === 0) {
      if (currentAccumPa > maxPathPressurePa) {
        maxPathPressurePa = currentAccumPa;
        criticalPathEdges = [...currentPath];
      }
      return;
    }

    for (const outE of outgoing) {
      tracePath(outE.toNodeId, currentAccumPa + outE.headLossPa, [...currentPath, outE.id]);
    }
  }

  for (const src of sourceNodes) {
    tracePath(src.id, 0, []);
  }

  for (const e of resolvedEdges) {
    if (criticalPathEdges.includes(e.id)) {
      e.isCriticalPath = true;
    }
  }

  const balancingValves: BalancingValveScheduleItem[] = [];

  function calculateBalancingForBranch(currentNodeId: string, currentAccumPa: number) {
    const outgoing = resolvedEdges.filter((e) => e.fromNodeId === currentNodeId);
    for (const outE of outgoing) {
      const pathPa = currentAccumPa + outE.headLossPa;
      const excessPressurePa = Math.max(0, maxPathPressurePa - pathPa);
      const excessPressureBar = excessPressurePa / 100000;

      if (excessPressureBar > 0.05 && outE.flowRateLps > 0.1 && !outE.isCriticalPath) {
        const qM3h = outE.flowRateLps * 3.6;
        const reqKv = excessPressureBar > 0 ? qM3h / Math.sqrt(excessPressureBar) : 10.0;
        const presetPercent = Math.min(100, Math.max(10, Math.round((reqKv / 25.0) * 100)));

        balancingValves.push({
          valveCode: `CBV-${outE.id.slice(0, 8).toUpperCase()}`,
          edgeId: outE.id,
          locationNode: outE.toNodeId,
          designFlowLps: outE.flowRateLps,
          targetPressureDropBar: Math.round(excessPressureBar * 1000) / 1000,
          requiredKvCoefficient: Math.round(reqKv * 100) / 100,
          valveSettingPresetPercent: presetPercent,
        });
      }

      calculateBalancingForBranch(outE.toNodeId, pathPa);
    }
  }

  for (const src of sourceNodes) {
    calculateBalancingForBranch(src.id, 0);
  }

  const status: HydraulicNetworkResult["hydraulicStatus"] =
    warnings.length > 0 ? "bottleneck_alert" : "balanced";

  return {
    networkCode,
    systemType,
    totalFlowRateLps: Math.round(totalNetFlow * 1000) / 1000,
    nodes: Array.from(nodeMap.values()),
    edges: resolvedEdges,
    criticalRunPath: criticalPathEdges,
    criticalPressureDropPa: Math.round(maxPathPressurePa * 10) / 10,
    criticalPressureDropBar: Math.round((maxPathPressurePa / 100000) * 10000) / 10000,
    balancingValves,
    hydraulicStatus: status,
    warnings,
  };
}

export async function saveHydraulicNetwork(
  projectId: number,
  result: HydraulicNetworkResult,
  userId?: number | null,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_hydraulic_networks (
      project_id, network_code, system_type, title,
      nodes_graph, edges_graph, total_flow_rate_lps,
      critical_run_path, critical_pressure_drop_pa, critical_pressure_drop_bar,
      balancing_valves_schedule, status, created_by
    ) VALUES (
      ?, ?, ?, ?,
      ?::jsonb, ?::jsonb, ?,
      ?::jsonb, ?, ?,
      ?::jsonb, ?, ?
    )
    ON CONFLICT (project_id, network_code) DO UPDATE SET
      nodes_graph = EXCLUDED.nodes_graph,
      edges_graph = EXCLUDED.edges_graph,
      total_flow_rate_lps = EXCLUDED.total_flow_rate_lps,
      critical_run_path = EXCLUDED.critical_run_path,
      critical_pressure_drop_pa = EXCLUDED.critical_pressure_drop_pa,
      critical_pressure_drop_bar = EXCLUDED.critical_pressure_drop_bar,
      balancing_valves_schedule = EXCLUDED.balancing_valves_schedule,
      status = EXCLUDED.status,
      updated_at = NOW()
    RETURNING id`,
    [
      projectId,
      result.networkCode,
      result.systemType,
      `Mạng lưới thủy lực ${result.networkCode}`,
      JSON.stringify(result.nodes),
      JSON.stringify(result.edges),
      result.totalFlowRateLps,
      JSON.stringify(result.criticalRunPath),
      result.criticalPressureDropPa,
      result.criticalPressureDropBar,
      JSON.stringify(result.balancingValves),
      result.hydraulicStatus,
      userId ?? null,
    ],
  );

  if (!row) throw new Error("Failed to save hydraulic network");
  return row;
}

export async function listHydraulicNetworks(projectId: number) {
  return await query(
    `SELECT * FROM engineering_hydraulic_networks WHERE project_id = ? ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
