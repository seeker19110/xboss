import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// ENG-3 — Engineering Workflow OS (docs/nang-cap/ENG-3-engineering-workflow-os.md).
// Phần thuần (risk/profile/state machine) không cần DB; phần tích hợp cần TEST_DATABASE_URL.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRisk,
  selectProfile,
  gatesForProfile,
  canTransition,
  riskInputsSchema,
  HIGH_FINANCIAL_IMPACT_VND,
} from "@/lib/ky-thuat/engineering-workflow";

const S = { skip: !HAS_TEST_DB };

const risk = (o: Record<string, unknown>) => riskInputsSchema.parse({ reversible: true, ...o });

// ---------- Thuần ----------

test("classifyRisk: safetyRisk → critical bất kể mọi yếu tố khác", () => {
  // §10: không có đường nào hạ cấp một thay đổi có safety risk.
  assert.equal(classifyRisk(risk({ safetyRisk: true })), "critical");
  assert.equal(
    classifyRisk(
      risk({ safetyRisk: true, financialImpact: 0, uncertainty: "low", scopeImpact: "low" }),
    ),
    "critical",
  );
});

test("classifyRisk: regulatory hoặc không hoàn tác được → high", () => {
  assert.equal(classifyRisk(risk({ regulatoryRisk: true })), "high");
  assert.equal(classifyRisk(riskInputsSchema.parse({ reversible: false })), "high");
});

test("classifyRisk: tiền lớn / liên ngành / bất định cao → medium", () => {
  assert.equal(classifyRisk(risk({ financialImpact: HIGH_FINANCIAL_IMPACT_VND })), "medium");
  assert.equal(classifyRisk(risk({ crossDiscipline: true })), "medium");
  assert.equal(classifyRisk(risk({ uncertainty: "high" })), "medium");
  assert.equal(classifyRisk(risk({ scopeImpact: "high" })), "medium");
  // Ngay dưới ngưỡng tiền thì vẫn là low (kiểm biên off-by-one).
  assert.equal(classifyRisk(risk({ financialImpact: HIGH_FINANCIAL_IMPACT_VND - 1 })), "low");
});

test("selectProfile + gatesForProfile: số gate đúng theo từng profile", () => {
  assert.equal(selectProfile("low", false), "A"); // không side effect
  assert.equal(selectProfile("critical", false), "A");
  assert.equal(selectProfile("low", true), "B");
  assert.equal(selectProfile("medium", true), "C");
  assert.equal(selectProfile("high", true), "D");
  assert.equal(selectProfile("critical", true), "E");

  assert.equal(gatesForProfile("A").length, 0);
  assert.equal(gatesForProfile("B").length, 1);
  assert.equal(gatesForProfile("C").length, 2);
  assert.equal(gatesForProfile("D").length, 3);
  assert.equal(gatesForProfile("E").length, 4);

  // Gate phải đánh số liên tục 1..n (engine ký tuần tự dựa vào đây).
  for (const p of ["B", "C", "D", "E"] as const) {
    const seqs = gatesForProfile(p).map((g) => g.seq);
    assert.deepEqual(
      seqs,
      Array.from({ length: seqs.length }, (_, i) => i + 1),
    );
  }
  // Profile E phải có QA độc lập + thẩm quyền phát hành.
  const eTypes = gatesForProfile("E").map((g) => g.gateType);
  assert.ok(eTypes.includes("independent_qa"));
  assert.ok(eTypes.includes("authority_release"));
});

test("canTransition: chỉ cho phép chuyển hợp lệ theo §11", () => {
  assert.ok(canTransition("draft", "validating"));
  assert.ok(canTransition("awaiting_approval", "approved"));
  assert.ok(canTransition("approved", "executing"));
  assert.ok(canTransition("failed", "rolled_back"));

  // Nhảy cóc / đi lùi / rời trạng thái kết thúc đều bị chặn.
  assert.ok(!canTransition("draft", "completed"));
  assert.ok(!canTransition("draft", "approved"));
  assert.ok(!canTransition("completed", "draft"));
  assert.ok(!canTransition("rejected", "approved"));
  assert.ok(!canTransition("cancelled", "validating"));
});

// ---------- Tích hợp ----------

let admin = 0;
let pm = 0;
let engineer = 0;
let engineer2 = 0;
let pm2 = 0;
let pA = 0;
let pB = 0;
let acceptedSuggestion = "";

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const mkUser = (name: string, email: string, role: string) =>
    insertId(
      `INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, ?, 'x')`,
      name,
      email,
      role,
    );
  admin = await mkUser("WfAdmin", "wf-admin@x.vn", "admin");
  pm = await mkUser("WfPM", "wf-pm@x.vn", "pm");
  pm2 = await mkUser("WfPM2", "wf-pm2@x.vn", "pm");
  engineer = await mkUser("WfEng", "wf-eng@x.vn", "engineer");
  engineer2 = await mkUser("WfEng2", "wf-eng2@x.vn", "engineer");
  pA = await insertId(`INSERT INTO projects (name, code) VALUES ('DA WF A', 'PJT-WFA')`);
  pB = await insertId(`INSERT INTO projects (name, code) VALUES ('DA WF B', 'PJT-WFB')`);

  // 1 suggestion đã accepted để Gate 0 đi qua được.
  const { ingestIntelligencePackage, intelligencePackageInputSchema, decideSuggestion } =
    await import("@/lib/ky-thuat/engineering-intel");
  const r = await ingestIntelligencePackage(
    pA,
    null,
    intelligencePackageInputSchema.parse({
      objective: "Nguồn cho workflow",
      suggestions: [
        {
          suggestionClass: "design",
          title: "Đề xuất đã duyệt",
          priority: "quality",
          confidenceSignals: { sourceQuality: 0.9, extractionConfidence: 0.9, freshness: 0.9 },
          evidence: [{ kind: "fact", statement: "f" }],
        },
      ],
    }),
  );
  acceptedSuggestion = r.suggestions[0].id;
  await decideSuggestion(pA, acceptedSuggestion, admin, "accepted");
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM engineering_workflow_events WHERE workflow_id IN (SELECT id FROM engineering_workflows WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(
    `DELETE FROM engineering_workflow_gates WHERE workflow_id IN (SELECT id FROM engineering_workflows WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(`DELETE FROM engineering_workflows WHERE project_id IN (?, ?)`, pA, pB);
  await run(
    `DELETE FROM engineering_evidence WHERE suggestion_id IN (SELECT id FROM engineering_suggestions WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(`DELETE FROM engineering_suggestions WHERE project_id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM engineering_intelligence_packages WHERE project_id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM users WHERE id IN (?, ?, ?, ?, ?)`, admin, pm, pm2, engineer, engineer2);
});

test("Gate 0 CHẶN: suggestion chưa accepted → không tạo được workflow", S, async () => {
  const { ingestIntelligencePackage, intelligencePackageInputSchema } =
    await import("@/lib/ky-thuat/engineering-intel");
  const { createWorkflow, Gate0FailedError, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");
  const { queryOne } = await import("@/lib/db");

  const r = await ingestIntelligencePackage(
    pA,
    null,
    intelligencePackageInputSchema.parse({
      objective: "Chưa duyệt",
      suggestions: [
        {
          suggestionClass: "design",
          title: "Đề xuất chưa duyệt",
          priority: "quality",
          confidenceSignals: { sourceQuality: 0.9, extractionConfidence: 0.9, freshness: 0.9 },
          evidence: [{ kind: "fact", statement: "f" }],
        },
      ],
    }),
  );

  const before = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM engineering_workflows WHERE project_id = ?`,
    pA,
  );
  await assert.rejects(
    () =>
      createWorkflow(
        pA,
        engineer,
        workflowInputSchema.parse({
          suggestionId: r.suggestions[0].id,
          title: "Không được tạo",
          riskInputs: { reversible: true },
        }),
      ),
    Gate0FailedError,
  );
  const after = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM engineering_workflows WHERE project_id = ?`,
    pA,
  );
  // Gate 0 fail thì KHÔNG được để lại bản ghi nào (§8).
  assert.equal(after?.n, before?.n);
});

test("Gate 0 CHẶN: non-reversible mà không khai rollback strategy", S, async () => {
  const { createWorkflow, Gate0FailedError, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");
  await assert.rejects(
    () =>
      createWorkflow(
        pA,
        engineer,
        workflowInputSchema.parse({
          title: "Không hoàn tác được",
          riskInputs: { reversible: false },
        }),
      ),
    Gate0FailedError,
  );
});

test("Luồng đủ PROFILE-C: tạo → submit → ký 2 gate → approved", S, async () => {
  const { createWorkflow, submitForApproval, approveGate, getWorkflow, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");

  const wf = await createWorkflow(
    pA,
    engineer,
    workflowInputSchema.parse({
      suggestionId: acceptedSuggestion,
      title: "Thay ống D200 tầng 3",
      riskInputs: { reversible: true, crossDiscipline: true }, // → medium → PROFILE-C
    }),
  );
  assert.equal(wf.riskClass, "medium");
  assert.equal(wf.profile, "C");

  await submitForApproval(pA, wf.id, engineer);
  let got = await getWorkflow(pA, wf.id);
  assert.equal(got?.workflow.state, "awaiting_approval");
  assert.equal(got?.gates.length, 2);

  // Gate 2 trước gate 1 → bị chặn (ký tuần tự).
  await assert.rejects(() => approveGate(pA, wf.id, 2, pm, "pm", "approved"));

  // Gate 1 = technical_review, yêu cầu vai trò engineer (và không phải người tạo).
  await approveGate(pA, wf.id, 1, engineer2, "engineer", "approved", "Kỹ thuật đạt");
  got = await getWorkflow(pA, wf.id);
  assert.equal(got?.workflow.state, "awaiting_approval"); // còn gate 2

  await approveGate(pA, wf.id, 2, pm, "pm", "approved", "QA đạt");
  got = await getWorkflow(pA, wf.id);
  assert.equal(got?.workflow.state, "approved");
  // Mọi chuyển trạng thái đều có event (§11).
  assert.ok((got?.events.length ?? 0) >= 3);
});

test("Separation of duties: người tạo không được tự ký", S, async () => {
  const { createWorkflow, submitForApproval, approveGate, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");
  const wf = await createWorkflow(
    pA,
    engineer,
    workflowInputSchema.parse({ title: "Kỹ sư tự tạo", riskInputs: { reversible: true } }),
  );
  await submitForApproval(pA, wf.id, engineer);
  // Đúng vai trò cho gate 1 nhưng là người tạo → phải bị chặn bởi SoD.
  await assert.rejects(
    () => approveGate(pA, wf.id, 1, engineer, "engineer", "approved"),
    /separation of duties/i,
  );
});

test("Separation of duties: rủi ro cao — 1 người không ký 2 gate", S, async () => {
  const { createWorkflow, submitForApproval, approveGate, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");
  const wf = await createWorkflow(
    pA,
    engineer,
    workflowInputSchema.parse({
      title: "Đổi thiết bị PCCC",
      riskInputs: { reversible: false, regulatoryRisk: true }, // → high → PROFILE-D (3 gate)
      rollbackStrategy: "Lắp lại thiết bị cũ trong 24h",
    }),
  );
  assert.equal(wf.profile, "D");
  await submitForApproval(pA, wf.id, engineer);

  // Admin ký được mọi gate (vai trò cao nhất) — đúng kịch bản để chạm luật "1 người không
  // ký 2 gate" của workflow rủi ro cao.
  await approveGate(pA, wf.id, 1, admin, "admin", "approved");
  await assert.rejects(() => approveGate(pA, wf.id, 2, admin, "admin", "approved"), /2 gate/i);
  // Người khác thì được.
  await approveGate(pA, wf.id, 2, pm2, "pm", "approved");
});

test("Từ chối 1 gate → workflow rejected ngay, không cần ký gate còn lại", S, async () => {
  const { createWorkflow, submitForApproval, approveGate, getWorkflow, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");
  const wf = await createWorkflow(
    pA,
    engineer,
    workflowInputSchema.parse({
      title: "Sẽ bị từ chối",
      riskInputs: { reversible: true, crossDiscipline: true },
    }),
  );
  await submitForApproval(pA, wf.id, engineer);
  await approveGate(pA, wf.id, 1, engineer2, "engineer", "rejected", "Chưa đủ cơ sở");
  const got = await getWorkflow(pA, wf.id);
  assert.equal(got?.workflow.state, "rejected");
  assert.equal(got?.gates.find((g) => g.seq === 2)?.decision, null);
});

test("PROFILE-A (không side effect): không gate, submit là approved luôn", S, async () => {
  const { createWorkflow, submitForApproval, getWorkflow, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");
  const wf = await createWorkflow(
    pA,
    engineer,
    workflowInputSchema.parse({
      title: "Chỉ công bố thông tin",
      riskInputs: { reversible: true },
      hasSideEffect: false,
    }),
  );
  assert.equal(wf.profile, "A");
  await submitForApproval(pA, wf.id, engineer);
  const got = await getWorkflow(pA, wf.id);
  assert.equal(got?.workflow.state, "approved");
  assert.equal(got?.gates.length, 0);
});

test("Cách ly đa dự án: không đọc/ký được workflow của dự án khác", S, async () => {
  const { createWorkflow, getWorkflow, submitForApproval, workflowInputSchema } =
    await import("@/lib/ky-thuat/engineering-workflow");
  const wf = await createWorkflow(
    pA,
    engineer,
    workflowInputSchema.parse({ title: "Chỉ của dự án A", riskInputs: { reversible: true } }),
  );
  assert.equal(await getWorkflow(pB, wf.id), null);
  await assert.rejects(() => submitForApproval(pB, wf.id, engineer));
});
