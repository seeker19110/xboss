import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// ENG-2 — Engineering Intelligence (docs/nang-cap/ENG-2-engineering-intelligence.md).
// Phần thuần (ranking/confidence/evidence gate) chạy không cần DB; phần tích hợp cần
// TEST_DATABASE_URL, không có thì tự skip.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  rankSuggestion,
  computeConfidence,
  initialStatus,
  PRIORITY_ORDER,
} from "@/lib/ky-thuat/engineering-intel";

const S = { skip: !HAS_TEST_DB };

// ---------- Thuần (không cần DB) ----------

test("rankSuggestion: priority là trục chính, confidence KHÔNG vượt mặt được", () => {
  // §3 + §10: cảnh báo an toàn dù confidence 'unknown' vẫn phải xếp TRÊN tối ưu hoá
  // confidence 'high' — đây là bất biến chống việc "AI tự tin" đè cảnh báo an toàn.
  const safetyUnknown = rankSuggestion({
    priority: "critical_safety",
    severity: "low",
    confidence: "unknown",
  });
  const optimizationHigh = rankSuggestion({
    priority: "optimization",
    severity: "critical",
    confidence: "high",
  });
  assert.ok(safetyUnknown < optimizationHigh);

  // Toàn bộ 7 mức giữ đúng thứ tự khi các yếu tố khác bằng nhau.
  const scores = PRIORITY_ORDER.map((p) =>
    rankSuggestion({ priority: p, severity: "medium", confidence: "medium" }),
  );
  for (let i = 1; i < scores.length; i++)
    assert.ok(scores[i - 1] < scores[i], `mức ${i} sai thứ tự`);
});

test("computeConfidence: thiếu cơ sở → unknown, không phải low", () => {
  // §5: 'unknown' (không đủ cơ sở) khác hẳn 'low' (đo được và thấp).
  assert.equal(computeConfidence(undefined), "unknown");
  assert.equal(computeConfidence({}), "unknown");
  assert.equal(computeConfidence({ sourceQuality: 0.9, freshness: 0.9 }), "unknown"); // chỉ 2 < 3 signal
});

test("computeConfidence: 3 mức theo trung bình signal", () => {
  assert.equal(
    computeConfidence({ sourceQuality: 0.9, extractionConfidence: 0.9, freshness: 0.9 }),
    "high",
  );
  assert.equal(
    computeConfidence({ sourceQuality: 0.6, extractionConfidence: 0.6, freshness: 0.6 }),
    "medium",
  );
  assert.equal(
    computeConfidence({ sourceQuality: 0.2, extractionConfidence: 0.3, freshness: 0.2 }),
    "low",
  );
});

test("computeConfidence: ruleValidated=false ghim trần medium", () => {
  // Rule xác định đã BÁC thì không được nhận 'high' dù mọi signal khác đều đẹp.
  const level = computeConfidence({
    sourceQuality: 1,
    extractionConfidence: 1,
    crossSourceAgreement: 1,
    freshness: 1,
    completeness: 1,
    ruleValidated: false,
  });
  assert.equal(level, "medium");
});

test("initialStatus: thiếu evidence loại fact → needs_review", () => {
  assert.equal(
    initialStatus({
      evidence: [{ kind: "inference" }, { kind: "recommendation" }],
      priority: "quality",
      confidence: "high",
    }),
    "needs_review",
  );
  assert.equal(
    initialStatus({ evidence: [{ kind: "fact" }], priority: "quality", confidence: "high" }),
    "open",
  );
});

test("initialStatus: cảnh báo an toàn/pháp lý mà confidence unknown → needs_review", () => {
  for (const p of ["critical_safety", "regulatory"] as const) {
    assert.equal(
      initialStatus({ evidence: [{ kind: "fact" }], priority: p, confidence: "unknown" }),
      "needs_review",
    );
    // Cùng priority nhưng có cơ sở đo được thì vào danh sách chính bình thường.
    assert.equal(
      initialStatus({ evidence: [{ kind: "fact" }], priority: p, confidence: "medium" }),
      "open",
    );
  }
});

// ---------- Tích hợp (cần TEST_DATABASE_URL) ----------

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
    `INSERT INTO users (name, email, role, password_hash) VALUES ('IntelTest','intel-test@x.vn','admin','x')`,
  );
  pA = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Intel A', 'PJT-INTA')`);
  pB = await insertId(`INSERT INTO projects (name, code) VALUES ('DA Intel B', 'PJT-INTB')`);

  keyEng = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('IntelEng', ?, ?, ?, ?)`,
    hashApiKey(keyEng),
    pA,
    ["engineering"],
    U,
  );
  keyRead = generateApiKey();
  await insertId(
    `INSERT INTO api_keys (name, key_hash, project_id, scopes, created_by) VALUES ('IntelRead', ?, ?, ?, ?)`,
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
    `DELETE FROM engineering_evidence WHERE suggestion_id IN (SELECT id FROM engineering_suggestions WHERE project_id IN (?, ?))`,
    pA,
    pB,
  );
  await run(`DELETE FROM engineering_suggestions WHERE project_id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM engineering_intelligence_packages WHERE project_id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM api_keys WHERE created_by = ?`, U);
  await run(`DELETE FROM projects WHERE id IN (?, ?)`, pA, pB);
  await run(`DELETE FROM users WHERE id = ?`, U);
  await run(`DELETE FROM login_rate_limits WHERE key LIKE 'api%'`);
});

test("ingest: confidence tính LẠI ở server, giá trị bên gọi khai bị bỏ qua", S, async () => {
  const { POST } = await import("@/app/api/v1/engineering/intelligence/route");
  const res = await POST(
    reqOf("/api/v1/engineering/intelligence", keyEng, {
      objective: "Rà soát tải lạnh tầng 3",
      suggestions: [
        {
          suggestionClass: "mep",
          title: "AHU-03 có thể thiếu công suất",
          priority: "high_impact",
          // Bên gọi cố khai confidence cao — phải bị bỏ qua hoàn toàn, chỉ signals mới
          // được dùng (§5). Ở đây chỉ có 2 signal (<3) nên kết quả phải là 'unknown'.
          confidence: "high",
          confidenceSignals: { sourceQuality: 0.95, extractionConfidence: 0.95 },
          evidence: [
            { kind: "fact", statement: "Bản vẽ M-101 rev 7 ghi AHU-03 công suất 30kW" },
            { kind: "inference", statement: "Tải tính toán vượt 30kW" },
          ],
        },
      ],
    }),
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as { suggestions: { confidence: string; status: string }[] };
  assert.equal(body.suggestions[0].confidence, "unknown");
});

test("ingest: thiếu evidence loại fact → needs_review; evidence rỗng → 422", S, async () => {
  const { POST } = await import("@/app/api/v1/engineering/intelligence/route");

  const noFact = await POST(
    reqOf("/api/v1/engineering/intelligence", keyEng, {
      objective: "Kiểm tra bản vẽ",
      suggestions: [
        {
          suggestionClass: "drawing",
          title: "Thiếu dimension",
          priority: "quality",
          confidenceSignals: { sourceQuality: 0.9, extractionConfidence: 0.9, freshness: 0.9 },
          evidence: [{ kind: "inference", statement: "Có vẻ thiếu kích thước" }],
        },
      ],
    }),
  );
  assert.equal(noFact.status, 201);
  const j = (await noFact.json()) as { suggestions: { status: string }[] };
  assert.equal(j.suggestions[0].status, "needs_review");

  const emptyEvidence = await POST(
    reqOf("/api/v1/engineering/intelligence", keyEng, {
      objective: "x",
      suggestions: [{ suggestionClass: "design", title: "y", priority: "quality", evidence: [] }],
    }),
  );
  assert.equal(emptyEvidence.status, 422);
});

test("ingest: scope read → 403", S, async () => {
  const { POST } = await import("@/app/api/v1/engineering/intelligence/route");
  const res = await POST(
    reqOf("/api/v1/engineering/intelligence", keyRead, {
      objective: "x",
      suggestions: [
        {
          suggestionClass: "design",
          title: "y",
          priority: "quality",
          evidence: [{ kind: "fact", statement: "z" }],
        },
      ],
    }),
  );
  assert.equal(res.status, 403);
});

test("listSuggestions: sắp đúng ranking + cách ly đa dự án", S, async () => {
  const { ingestIntelligencePackage, listSuggestions } =
    await import("@/lib/ky-thuat/engineering-intel");

  const { intelligencePackageInputSchema } = await import("@/lib/ky-thuat/engineering-intel");
  await ingestIntelligencePackage(
    pA,
    null,
    intelligencePackageInputSchema.parse({
      objective: "Bộ hỗn hợp kiểm ranking",
      suggestions: [
        {
          suggestionClass: "design",
          title: "ZZ tối ưu",
          priority: "optimization",
          severity: "critical",
          confidenceSignals: { sourceQuality: 1, extractionConfidence: 1, freshness: 1 },
          evidence: [{ kind: "fact", statement: "f1" }],
        },
        {
          suggestionClass: "risk",
          title: "AA an toàn",
          priority: "critical_safety",
          severity: "low",
          confidenceSignals: { sourceQuality: 0.6, extractionConfidence: 0.6, freshness: 0.6 },
          evidence: [{ kind: "fact", statement: "f2" }],
        },
      ],
    }),
  );

  const listA = await listSuggestions(pA);
  // Mục an toàn phải đứng trước mục tối ưu hoá dù severity/confidence ngược chiều.
  const idxSafety = listA.findIndex((s) => s.title === "AA an toàn");
  const idxOpt = listA.findIndex((s) => s.title === "ZZ tối ưu");
  assert.ok(idxSafety >= 0 && idxOpt >= 0);
  assert.ok(idxSafety < idxOpt);

  const listB = await listSuggestions(pB);
  assert.equal(listB.length, 0);
});

test("decideSuggestion: ghi quyết định + chặn dự án khác", S, async () => {
  const { ingestIntelligencePackage, decideSuggestion, getSuggestion } =
    await import("@/lib/ky-thuat/engineering-intel");
  const { intelligencePackageInputSchema } = await import("@/lib/ky-thuat/engineering-intel");
  const r = await ingestIntelligencePackage(
    pA,
    null,
    intelligencePackageInputSchema.parse({
      objective: "Quyết định thử",
      suggestions: [
        {
          suggestionClass: "design",
          title: "Đề xuất cần quyết",
          priority: "quality",
          severity: "medium",
          confidenceSignals: { sourceQuality: 0.9, extractionConfidence: 0.9, freshness: 0.9 },
          evidence: [{ kind: "fact", statement: "f" }],
        },
      ],
    }),
  );
  const id = r.suggestions[0].id;

  await decideSuggestion(pA, id, U, "accepted", "Đồng ý");
  const got = await getSuggestion(pA, id);
  assert.equal(got?.suggestion.status, "accepted");
  assert.equal(got?.suggestion.decidedBy, U);
  assert.equal(got?.suggestion.decisionNote, "Đồng ý");

  await assert.rejects(() => decideSuggestion(pB, id, U, "rejected"));
});
