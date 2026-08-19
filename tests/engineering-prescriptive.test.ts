import { HAS_TEST_DB } from "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";

test("PIN-2: calculateParetoFrontier lọc chính xác các phương án không bị chi phối (Non-dominated Sorting)", async () => {
  const { calculateParetoFrontier } = await import("@/lib/engineering-prescriptive");

  const options = [
    {
      optionIndex: 0,
      title: "Phương án A",
      strategyCategory: "overtime",
      strategyDescription: "Tăng ca",
      scheduleCompressionDays: 10,
      crashCostVnd: 100000000,
      riskScore: 20,
      clashMitigationCount: 5,
      isParetoOptimal: false,
      tradeOffRatio: 10000000,
      feasibilityScore: 0.9,
      actionItems: [],
    },
    {
      optionIndex: 1,
      title: "Phương án B (Bị chi phối bởi A: ít ngày hơn, đắt hơn, rủi ro hơn)",
      strategyCategory: "subcon",
      strategyDescription: "Thầu phụ",
      scheduleCompressionDays: 8,
      crashCostVnd: 150000000,
      riskScore: 30,
      clashMitigationCount: 3,
      isParetoOptimal: false,
      tradeOffRatio: 18750000,
      feasibilityScore: 0.8,
      actionItems: [],
    },
    {
      optionIndex: 2,
      title: "Phương án C (Rút ngắn nhiều ngày hơn nhưng tốn chi phí hơn)",
      strategyCategory: "prefab",
      strategyDescription: "Tiền chế",
      scheduleCompressionDays: 20,
      crashCostVnd: 250000000,
      riskScore: 15,
      clashMitigationCount: 12,
      isParetoOptimal: false,
      tradeOffRatio: 12500000,
      feasibilityScore: 0.95,
      actionItems: [],
    },
  ];

  const pareto = calculateParetoFrontier(options);
  assert.equal(pareto.length, 2);
  const indices = pareto.map((p) => p.optionIndex);
  assert.ok(indices.includes(0));
  assert.ok(indices.includes(2));
  assert.ok(!indices.includes(1)); // Phương án B bị loại vì bị chi phối
});

test("PIN-2: evaluateElementCompliance kiểm tra chính xác các điều khoản QCVN 06, NFPA 13 và TCVN 9385", async () => {
  const { evaluateElementCompliance } = await import("@/lib/engineering-prescriptive");

  const qcvnRule = {
    id: "rule-qcvn",
    standard_code: "QCVN 06:2022/BXD",
    standard_title: "Quy chuẩn kỹ thuật quốc gia về An toàn cháy",
    section_clause: "Clause 5.1.2",
    domain: "fire_safety" as const,
    rule_expression: { min_clearance_mm: 1200, fire_rating_hours: 2 },
    severity: "legal_strict" as const,
    description: "Khoảng cách thông thủy và bậc chịu lửa",
    is_active: true,
    created_at: new Date().toISOString(),
  };

  // 1. Vi phạm khoảng cách thông thủy (1000mm < 1200mm)
  const nonCompliantElem = {
    name: "Cửa thoát hiểm Trục A",
    discipline: "fire",
    metadata: { clearance_mm: 1000, fire_rating_hours: 2 },
  };
  const res1 = evaluateElementCompliance(nonCompliantElem, qcvnRule);
  assert.equal(res1.isCompliant, false);
  assert.ok(res1.findingDetails.includes("Khoảng cách thông thủy"));

  // 2. Đạt chuẩn đầy đủ
  const compliantElem = {
    name: "Cửa thoát hiểm Trục B",
    discipline: "fire",
    metadata: { clearance_mm: 1300, fire_rating_hours: 2.5 },
  };
  const res2 = evaluateElementCompliance(compliantElem, qcvnRule);
  assert.equal(res2.isCompliant, true);

  // 3. NFPA 13: Vi phạm khoảng cách sprinkler (> 4600mm)
  const nfpaRule = {
    id: "rule-nfpa",
    standard_code: "NFPA 13",
    standard_title: "Standard for Sprinkler Systems",
    section_clause: "Section 8.5.5",
    domain: "fire_safety" as const,
    rule_expression: { max_sprinkler_spacing_mm: 4600, min_pipe_diameter_mm: 25 },
    severity: "mandatory" as const,
    description: "Khoảng cách đầu phun",
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const sprinklerBad = {
    name: "Đầu phun Sprinkler Zone 2",
    discipline: "fire",
    metadata: { sprinkler_spacing_mm: 5000, pipe_diameter_mm: 32 },
  };
  const res3 = evaluateElementCompliance(sprinklerBad, nfpaRule);
  assert.equal(res3.isCompliant, false);
  assert.ok(res3.findingDetails.includes("Khoảng cách đầu phun"));
});

test(
  "PIN-2: Prescriptive Scenario Simulation, Approval & Batch Compliance Scanning",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne } = await import("@/lib/db");
    const {
      runPrescriptiveSimulation,
      getPrescriptiveScenarios,
      approvePrescriptiveScenario,
      auditEngineeringElement,
      scanAllElementsCompliance,
      getComplianceAudits,
    } = await import("@/lib/engineering-prescriptive");

    const projId = await insertId(
      `INSERT INTO projects (name) VALUES ('Prescriptive Test Project')`,
    );
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Prescriptive Tester', ?, 'x', 'pm')`,
      `prescriptive-test-${projId}@test.local`,
    );

    try {
      // 1. Chạy mô phỏng Prescriptive
      const scenario = await runPrescriptiveSimulation(projId, {
        scenarioCode: "SCENARIO-CRASH-01",
        triggerReason: "Tiến độ trễ 15 ngày tại trục MEPF Tầng 4",
        baselineScheduleDays: 90,
        baselineCostVnd: 5000000000, // 5 tỷ VND
        targetDaysSaved: 15,
        maxCrashBudgetVnd: 800000000,
        simulationIterations: 20,
      });

      assert.equal(scenario.scenario_code, "SCENARIO-CRASH-01");
      assert.ok(scenario.simulated_options.length > 0);
      assert.ok(scenario.pareto_frontier.length > 0);
      assert.notEqual(scenario.recommended_option_index, null);

      // 2. Truy vấn danh sách kịch bản
      const list = await getPrescriptiveScenarios(projId);
      assert.equal(list.length, 1);

      // 3. Phê duyệt kịch bản
      const approved = await approvePrescriptiveScenario(projId, scenario.id, userId);
      assert.ok(approved);
      assert.equal(approved.status, "approved");
      assert.equal(approved.approved_by, userId);

      // 4. Tạo đối tượng và rà soát Quy chuẩn
      const obj = await queryOne<{ id: string }>(
        `INSERT INTO engineering_objects (project_id, external_key, object_type, name, discipline, status, metadata, created_by, updated_by)
         VALUES (?, 'SPRINKLER-Z1', 'element', 'Hệ thống đầu phun Zone 1', 'fire', 'approved', '{"sprinkler_spacing_mm": 5200, "pipe_diameter_mm": 20}'::jsonb, ?, ?)
         RETURNING id`,
        projId,
        userId,
        userId,
      );
      assert.ok(obj?.id);

      const rule = await queryOne<{ id: string }>(
        `SELECT id FROM engineering_compliance_rules WHERE standard_code = 'NFPA 13' LIMIT 1`,
      );
      assert.ok(rule?.id);

      // 5. Audit đối tượng đơn lẻ
      const audit = await auditEngineeringElement(projId, obj!.id, rule!.id);
      assert.equal(audit.compliance_status, "non_compliant");
      assert.ok(audit.finding_details?.includes("không phù hợp"));

      // 6. Quét toàn bộ dự án (Batch Scan)
      const scanSummary = await scanAllElementsCompliance(projId);
      assert.ok(scanSummary.totalObjects >= 1);
      assert.ok(scanSummary.createdAudits >= 1);

      // 7. Lấy danh sách hồ sơ NCR
      const ncrs = await getComplianceAudits(projId, { status: "non_compliant" });
      assert.ok(ncrs.length >= 1);
      assert.equal(ncrs[0].standard_code, "NFPA 13");
    } finally {
      // Clean up handled by test runner
    }
  },
);
