import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// ENG-4 — Multi-Agent Engineering OS (docs/nang-cap/ENG-4-multi-agent-engineering-os.md).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  detectConflicts,
  classifyConflict,
  proposeResolution,
  assertVoteAllowed,
  computeConsensus,
  VoteNotAllowedError,
  type ClaimLike,
} from "@/lib/ky-thuat/engineering-agents";

const S = { skip: !HAS_TEST_DB };

const claim = (o: Partial<ClaimLike> & { id: string }): ClaimLike => ({
  agentRole: "specialist",
  topic: "t1",
  claim: "c",
  assumptions: [],
  confidence: "medium",
  sourceAuthority: "derived",
  sourceRevisionId: null,
  payload: {},
  ...o,
});

// ---------- Thuần ----------

test("detectConflicts: cùng nội dung KHÔNG phải xung đột (đồng thuận ≠ bỏ phiếu)", () => {
  // 3 agent nói cùng một điều → đồng thuận, không tạo xung đột và tuyệt đối không đếm phiếu.
  const same = detectConflicts([
    claim({ id: "a", claim: "Ống D200" }),
    claim({ id: "b", claim: "Ống D200" }),
    claim({ id: "c", claim: "Ống D200" }),
  ]);
  assert.equal(same.length, 0);

  const diff = detectConflicts([
    claim({ id: "a", claim: "Ống D200" }),
    claim({ id: "b", claim: "Ống D250" }),
  ]);
  assert.equal(diff.length, 1);
  assert.deepEqual(diff[0].claimIds, ["a", "b"]);

  // Khác topic thì không so với nhau.
  const other = detectConflicts([
    claim({ id: "a", topic: "t1", claim: "X" }),
    claim({ id: "b", topic: "t2", claim: "Y" }),
  ]);
  assert.equal(other.length, 0);
});

test("classifyConflict: chọn loại KHÓ nhất trước, không hạ cấp", () => {
  // Khác revision → data (kể cả khi cũng khác giả định).
  assert.equal(
    classifyConflict([
      claim({
        id: "a",
        sourceRevisionId: "11111111-1111-1111-1111-111111111111",
        assumptions: [1],
      }),
      claim({
        id: "b",
        sourceRevisionId: "22222222-2222-2222-2222-222222222222",
        assumptions: [2],
      }),
    ]),
    "data",
  );
  // Có executor → execution.
  assert.equal(
    classifyConflict([claim({ id: "a", agentRole: "executor" }), claim({ id: "b" })]),
    "execution",
  );
  // Có constraintKind → constraint.
  assert.equal(
    classifyConflict([
      claim({ id: "a", payload: { constraintKind: "safety_law" } }),
      claim({ id: "b" }),
    ]),
    "constraint",
  );
  // Cùng dữ liệu, khác giả định → interpretation.
  assert.equal(
    classifyConflict([
      claim({ id: "a", assumptions: ["x"] }),
      claim({ id: "b", assumptions: ["y"] }),
    ]),
    "interpretation",
  );
  // Còn lại → scope.
  assert.equal(classifyConflict([claim({ id: "a" }), claim({ id: "b" })]), "scope");
});

test("proposeResolution data: theo authority, KHÔNG bỏ phiếu", () => {
  // 2 claim "derived" cùng nói A, 1 claim "authoritative_source" nói B → nguồn có thẩm
  // quyền thắng, dù thiểu số. Đây chính là điều §19 cấm làm bằng majority vote.
  const r = proposeResolution("data", [
    claim({ id: "a", sourceAuthority: "derived", sourceRevisionId: "r1" }),
    claim({ id: "b", sourceAuthority: "derived", sourceRevisionId: "r1" }),
    claim({ id: "c", sourceAuthority: "authoritative_source", sourceRevisionId: "r2" }),
  ]);
  assert.equal(r.method, "source_authority");
  assert.equal(r.winnerClaimId, "c");
  assert.equal(r.needsHuman, false);

  // Cùng hạng + cùng revision → không tự phân xử được.
  const tie = proposeResolution("data", [
    claim({ id: "a", sourceAuthority: "specialist", sourceRevisionId: "r1" }),
    claim({ id: "b", sourceAuthority: "specialist", sourceRevisionId: "r1" }),
  ]);
  assert.equal(tie.winnerClaimId, null);
  assert.equal(tie.needsHuman, true);
});

test("proposeResolution interpretation: chênh <2 bậc độ tin → cần người", () => {
  const close = proposeResolution("interpretation", [
    claim({ id: "a", confidence: "high" }),
    claim({ id: "b", confidence: "medium" }),
  ]);
  assert.equal(close.needsHuman, true);
  assert.equal(close.winnerClaimId, null);

  const decisive = proposeResolution("interpretation", [
    claim({ id: "a", confidence: "high" }),
    claim({ id: "b", confidence: "unknown" }),
  ]);
  assert.equal(decisive.needsHuman, false);
  assert.equal(decisive.winnerClaimId, "a");
});

test("proposeResolution constraint: chạm an toàn/hợp đồng → luôn cần người", () => {
  for (const kind of ["safety_law", "contract"] as const) {
    const r = proposeResolution("constraint", [
      claim({ id: "a", payload: { constraintKind: kind } }),
      claim({ id: "b", payload: { constraintKind: "cost_schedule" } }),
    ]);
    assert.equal(r.method, "constraint_hierarchy");
    assert.equal(r.needsHuman, true);
  }
  // Ràng buộc bậc thấp thì tự chọn được theo thứ bậc.
  const low = proposeResolution("constraint", [
    claim({ id: "a", payload: { constraintKind: "engineering" } }),
    claim({ id: "b", payload: { constraintKind: "preference" } }),
  ]);
  assert.equal(low.winnerClaimId, "a");
  assert.equal(low.needsHuman, false);
});

test("proposeResolution execution/scope: không agent nào tự quyết", () => {
  const ex = proposeResolution("execution", [claim({ id: "a" }), claim({ id: "b" })]);
  assert.equal(ex.needsHuman, true);
  assert.equal(ex.method, "independent_verification");
  const sc = proposeResolution("scope", [claim({ id: "a" }), claim({ id: "b" })]);
  assert.equal(sc.needsHuman, true);
});

test("assertVoteAllowed: chặn cứng mọi tình huống cấm bỏ phiếu (§19)", () => {
  const ok = [claim({ id: "a", confidence: "high" }), claim({ id: "b", confidence: "medium" })];
  // Hợp lệ: scope + low-risk + không nguồn thẩm quyền + đủ độ tin.
  assert.doesNotThrow(() => assertVoteAllowed("scope", ok, true));

  // 1) Không khai low-risk.
  assert.throws(() => assertVoteAllowed("scope", ok, false), VoteNotAllowedError);
  // 2) Sai loại xung đột.
  assert.throws(() => assertVoteAllowed("data", ok, true), VoteNotAllowedError);
  // 3) Có nguồn thẩm quyền — không được lật bằng phiếu.
  assert.throws(
    () =>
      assertVoteAllowed(
        "scope",
        [...ok, claim({ id: "c", sourceAuthority: "authoritative_source" })],
        true,
      ),
    VoteNotAllowedError,
  );
  // 4) Chạm ràng buộc an toàn.
  assert.throws(
    () =>
      assertVoteAllowed(
        "scope",
        [...ok, claim({ id: "d", payload: { constraintKind: "safety_law" } })],
        true,
      ),
    VoteNotAllowedError,
  );
  // 5) Có phương án độ tin thấp.
  assert.throws(
    () => assertVoteAllowed("scope", [...ok, claim({ id: "e", confidence: "low" })], true),
    VoteNotAllowedError,
  );
});

test("computeConsensus: đủ 5 mức, hết vòng → no_consensus (hợp lệ)", () => {
  assert.equal(computeConsensus([], 1, 5), "consensus_confirmed");
  assert.equal(
    computeConsensus([{ stage: "verified", conflictType: "scope" }], 1, 5),
    "consensus_confirmed",
  );
  // Đã xong nhưng từng chạm ràng buộc/thực thi → ghi nhận có rủi ro.
  assert.equal(
    computeConsensus([{ stage: "verified", conflictType: "constraint" }], 1, 5),
    "consensus_with_risk",
  );
  assert.equal(
    computeConsensus(
      [
        { stage: "verified", conflictType: "scope" },
        { stage: "classified", conflictType: "scope" },
      ],
      1,
      5,
    ),
    "partial_agreement",
  );
  assert.equal(
    computeConsensus([{ stage: "unresolved", conflictType: "scope" }], 1, 5),
    "conflict_requires_review",
  );
  // Hết vòng mà còn xung đột → no_consensus, KHÔNG ép đồng thuận giả (§21).
  assert.equal(
    computeConsensus([{ stage: "classified", conflictType: "scope" }], 5, 5),
    "no_consensus",
  );
});

// ---------- Tích hợp ----------

let U = 0;
let pA = 0;
let pB = 0;
let keyEng = "";
let keyRead = "";

function reqOf(path: string, key: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  const { generateApiKey, hashApiKey } = await import("@/lib/bao-mat/api-keys");
  U = await insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('AgentTest','agent-test@x.vn','admin','x')`,
  );
  pA = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Agent A', 'PJT-AGA')`);
  pB = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Agent B', 'PJT-AGB')`);
  keyEng = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('AgEng', ?, ?, ?, ?)`,
    hashApiKey(keyEng),
    pA,
    ["engineering"],
    U,
  );
  keyRead = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('AgRead', ?, ?, ?, ?)`,
    hashApiKey(keyRead),
    pA,
    ["read"],
    U,
  );
});

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM engineering_conflicts WHERE session_id IN (SELECT id FROM engineering_agent_sessions WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(
    `DELETE FROM engineering_agent_claims WHERE session_id IN (SELECT id FROM engineering_agent_sessions WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(`DELETE FROM engineering_agent_sessions WHERE project_id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM api_keys WHERE created_by = ?`, U);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM users WHERE id = ?`, U);
  await run(`DELETE FROM login_rate_limits WHERE key LIKE 'api%'`);
});

const twoConflictingClaims = [
  {
    agentRole: "specialist",
    agentName: "mep-hvac",
    topic: "AHU-03 capacity",
    claim: "Cần 45kW",
    assumptions: ["tải đỉnh mùa hè"],
    confidenceSignals: { sourceQuality: 0.9, extractionConfidence: 0.9, freshness: 0.9 },
    sourceAuthority: "specialist",
  },
  {
    agentRole: "critic",
    agentName: "mep-review",
    topic: "AHU-03 capacity",
    claim: "30kW là đủ",
    assumptions: ["tải trung bình"],
    confidenceSignals: { sourceQuality: 0.8, extractionConfidence: 0.8, freshness: 0.8 },
    sourceAuthority: "derived",
  },
];

test("Mở phiên: 2 claim mâu thuẫn → tạo xung đột + đề xuất phân xử", S, async () => {
  const { POST } = await import("@/app/api/v1/engineering/agent-sessions/route");
  const res = await POST(
    reqOf("/api/v1/engineering/agent-sessions", keyEng, {
      intent: "Chốt công suất AHU-03",
      claims: twoConflictingClaims,
    }),
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as {
    session: { consensus: string };
    conflicts: { conflictType: string; proposal: { needsHuman: boolean; method: string } }[];
  };
  assert.equal(body.conflicts.length, 1);
  // Cùng dữ liệu (không revision), khác giả định → interpretation.
  assert.equal(body.conflicts[0].conflictType, "interpretation");
  assert.equal(body.conflicts[0].proposal.method, "evidence_comparison");
  assert.equal(body.session.consensus, "conflict_requires_review");
});

test(
  "Vượt max_rounds → no_consensus + đóng phiên (kết quả hợp lệ, không phải lỗi)",
  S,
  async () => {
    const { openAgentSession, addClaims, agentSessionInputSchema } =
      await import("@/lib/ky-thuat/engineering-agents");
    const opened = await openAgentSession(
      pA,
      null,
      agentSessionInputSchema.parse({
        intent: "Phiên giới hạn 2 vòng",
        maxRounds: 2,
        claims: twoConflictingClaims,
      }),
    );
    assert.equal(opened.consensus, "conflict_requires_review");

    const r = await addClaims(pA, opened.sessionId, [
      {
        agentRole: "specialist",
        agentName: "mep-hvac",
        topic: "AHU-03 capacity",
        claim: "Vẫn giữ 45kW",
        assumptions: ["tải đỉnh"],
        payload: {},
        confidenceSignals: {},
        sourceAuthority: "specialist",
      },
    ]);
    assert.equal(r.consensus, "no_consensus");
    assert.equal(r.closed, true);

    // Phiên đã đóng thì không nhận thêm claim.
    await assert.rejects(() =>
      addClaims(pA, opened.sessionId, [
        {
          agentRole: "critic",
          agentName: "x",
          topic: "AHU-03 capacity",
          claim: "y",
          assumptions: [],
          payload: {},
          confidenceSignals: {},
          sourceAuthority: "derived",
        },
      ]),
    );
  },
);

test("resolveConflict: ghi phương pháp + người chốt; vote sai chỗ bị chặn", S, async () => {
  const {
    openAgentSession,
    getAgentSession,
    resolveConflict,
    agentSessionInputSchema,
    VoteNotAllowedError: VErr,
  } = await import("@/lib/ky-thuat/engineering-agents");

  const opened = await openAgentSession(
    pA,
    null,
    agentSessionInputSchema.parse({ intent: "Chốt xung đột", claims: twoConflictingClaims }),
  );
  const detail = await getAgentSession(pA, opened.sessionId);
  const conflictId = detail!.conflicts[0].id;

  // Xung đột loại interpretation → không được dùng bỏ phiếu.
  await assert.rejects(
    () =>
      resolveConflict(pA, opened.sessionId, conflictId, U, "Chọn 45kW", "preference_vote", {
        lowRiskPreference: true,
      }),
    VErr,
  );

  await resolveConflict(
    pA,
    opened.sessionId,
    conflictId,
    U,
    "Lấy 45kW theo tính toán tải đỉnh",
    "independent_verification",
  );
  const after = await getAgentSession(pA, opened.sessionId);
  assert.equal(after?.conflicts[0].stage, "verified");
  assert.equal(after?.conflicts[0].resolvedBy, U);
  assert.equal(after?.conflicts[0].resolutionMethod, "independent_verification");
  // Xong hết xung đột → đồng thuận (loại interpretation không tính là "có rủi ro").
  assert.equal(after?.session.consensus, "consensus_confirmed");
});

test("Cách ly đa dự án + scope read bị chặn", S, async () => {
  const { openAgentSession, getAgentSession, agentSessionInputSchema } =
    await import("@/lib/ky-thuat/engineering-agents");
  const opened = await openAgentSession(
    pA,
    null,
    agentSessionInputSchema.parse({ intent: "Chỉ dự án A", claims: twoConflictingClaims }),
  );
  assert.equal(await getAgentSession(pB, opened.sessionId), null);

  const { POST } = await import("@/app/api/v1/engineering/agent-sessions/route");
  const forbidden = await POST(
    reqOf("/api/v1/engineering/agent-sessions", keyRead, {
      intent: "x",
      claims: twoConflictingClaims,
    }),
  );
  assert.equal(forbidden.status, 403);
});

test("Bất biến ranh giới: ENG-4 không bao giờ tự gắn workflow_id", S, async () => {
  const { openAgentSession, agentSessionInputSchema } =
    await import("@/lib/ky-thuat/engineering-agents");
  const { queryOne } = await import("@/lib/db");
  const opened = await openAgentSession(
    pA,
    null,
    agentSessionInputSchema.parse({ intent: "Kiểm ranh giới", claims: twoConflictingClaims }),
  );
  const row = await queryOne<{ workflowId: string | null }>(
    `SELECT workflow_id AS "workflowId" FROM engineering_agent_sessions WHERE id = ?`,
    opened.sessionId,
  );
  // ENG-3 vẫn là ranh giới uỷ quyền — phiên agent không tự sinh/duyệt workflow nào.
  assert.equal(row?.workflowId, null);
});
