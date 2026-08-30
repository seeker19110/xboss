// tests/engineering-cad-hydraulic-network.test.ts — Unit tests for Hydraulic Graph & Loop Balancing (M76 / M92)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoSizePipeDiameter,
  solveHydraulicNetwork,
} from "@/lib/ky-thuat/engineering-cad-hydraulic-network";

test("M76: autoSizePipeDiameter tự động chọn đường kính DN phù hợp vận tốc", () => {
  // Lưu lượng nhỏ 0.3 L/s (~1.08 m3/h) -> DN20 hoặc DN25
  const small = autoSizePipeDiameter(0.3, 1.8);
  assert.ok(["DN15", "DN20", "DN25"].includes(small.standardDn));
  assert.ok(small.actualVelocityMs <= 1.8);

  // Lưu lượng trung bình 5.0 L/s (~18 m3/h) -> DN65 hoặc DN80
  const med = autoSizePipeDiameter(5.0, 1.8);
  assert.ok(["DN50", "DN65", "DN80"].includes(med.standardDn));
  assert.ok(med.actualVelocityMs <= 1.8);

  // Lưu lượng lớn 25.0 L/s (~90 m3/h) -> DN150
  const large = autoSizePipeDiameter(25.0, 2.0);
  assert.ok(["DN125", "DN150", "DN200"].includes(large.standardDn));
  assert.ok(large.actualVelocityMs <= 2.0);
});

test("M76: solveHydraulicNetwork tính toán tích lũy lưu lượng, tìm tuyến bất lợi và van cân bằng", () => {
  const nodes = [
    {
      id: "SRC-PUMP",
      name: "Bơm Chiller",
      type: "source" as const,
      elevationM: 0,
      demandFlowLps: 0,
    },
    {
      id: "JUNC-01",
      name: "Nút chia trục",
      type: "junction_tee" as const,
      elevationM: 0,
      demandFlowLps: 0,
    },
    {
      id: "AHU-01",
      name: "Dàn lạnh AHU 01 (Gần)",
      type: "terminal" as const,
      elevationM: 0,
      demandFlowLps: 3.0,
    },
    {
      id: "AHU-02",
      name: "Dàn lạnh AHU 02 (Xa)",
      type: "terminal" as const,
      elevationM: 0,
      demandFlowLps: 4.0,
    },
  ];

  const rawEdges = [
    { id: "E-MAIN", fromNodeId: "SRC-PUMP", toNodeId: "JUNC-01", lengthM: 20.0 }, // 7.0 L/s
    { id: "E-BRANCH-01", fromNodeId: "JUNC-01", toNodeId: "AHU-01", lengthM: 10.0 }, // 3.0 L/s (Nhánh ngắn)
    { id: "E-BRANCH-02", fromNodeId: "JUNC-01", toNodeId: "AHU-02", lengthM: 50.0 }, // 4.0 L/s (Nhánh dài -> Critical)
  ];

  const result = solveHydraulicNetwork("NET-CHW-01", "chilled_water", nodes, rawEdges);

  assert.equal(result.networkCode, "NET-CHW-01");
  assert.equal(result.totalFlowRateLps, 7.0);
  assert.equal(result.edges.length, 3);

  // Tuyến bất lợi nhất phải đi qua E-MAIN và E-BRANCH-02 (nhánh dài 50m)
  assert.ok(result.criticalRunPath.includes("E-MAIN"));
  assert.ok(result.criticalRunPath.includes("E-BRANCH-02"));
  assert.ok(result.criticalPressureDropPa > 0);

  // Nhánh ngắn E-BRANCH-01 phải có van cân bằng để triệt tiêu chênh áp dư thừa
  const valve = result.balancingValves.find((v) => v.edgeId === "E-BRANCH-01");
  assert.ok(valve);
  assert.ok(valve.requiredKvCoefficient > 0);
});
