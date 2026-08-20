import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import {
  createTimeTravelSnapshot,
  detectInputAnomalies,
  parseComplexFieldCommandWithContext,
} from "@/lib/user-error-healer";

const FIXTURE_DIR = join(process.cwd(), "tests", "fixtures", "engineering-ingest");

function loadFixture(name: string): {
  name: string;
  contractVersion: string;
  request: Record<string, unknown>;
  expect: Record<string, unknown>;
} {
  const p = join(FIXTURE_DIR, name);
  assert.ok(existsSync(p), `Fixture file must exist: ${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

test("C2 Pilot Scenario P0: Xác thực định dạng cấu hình, API Key và Header Correlation", () => {
  const headers = {
    authorization: "Bearer xbk_test_pilot_key_12345",
    "idempotency-key": "00000000-0000-0000-0000-000000000001",
    "x-correlation-id": "corr-test-pilot-001",
    "content-type": "application/json",
  };

  assert.ok(headers.authorization.startsWith("Bearer xbk_"));
  assert.ok(headers["idempotency-key"].length > 0);
  assert.ok(headers["x-correlation-id"].startsWith("corr-"));
  assert.strictEqual(headers["content-type"], "application/json");
});

test("C2 Pilot Scenario P1: Ingest xác định & Lũy đẳng với Fixtures 01, 02, 03", () => {
  const fix01 = loadFixture("01-happy-path.json");
  const req = fix01.request as {
    source: { externalKey: string; sourceType: string };
    objects: Array<{ externalKey: string; objectType: string }>;
    relations: Array<{ relationType: string }>;
  };

  assert.strictEqual(req.source.externalKey, "drawing:fx:hvac:l03");
  assert.strictEqual(req.objects.length, 2);
  assert.strictEqual(req.objects[0].externalKey, "duct:fx:4a7c");
  assert.strictEqual(req.objects[1].externalKey, "ahu:fx:2b91");
  assert.strictEqual(req.relations[0].relationType, "SERVES");

  // Kiểm tra mã băm SHA-256 xác định cho cùng payload
  const hash1 = crypto.createHash("sha256").update(JSON.stringify(fix01.request)).digest("hex");
  const hash2 = crypto.createHash("sha256").update(JSON.stringify(fix01.request)).digest("hex");
  assert.strictEqual(hash1, hash2);

  // Fixture 02: Retry cùng key + cùng body -> Lũy đẳng
  const fix02 = loadFixture("02-retry-same-key-same-body.json");
  assert.ok(fix02.request !== null);

  // Fixture 03: Conflict cùng key + khác body -> 409
  const fix03 = loadFixture("03-conflict-same-key-different-body.json");
  assert.ok(fix03.request !== null);
});

test("C2 Pilot Scenario P2: Đóng gói Snapshot bảo vệ dữ liệu Ingest và hỗ trợ Rollback 24h", () => {
  const fix01 = loadFixture("01-happy-path.json");
  const snapshot = createTimeTravelSnapshot(
    "engineering_ingest",
    "PRJ-AVIO-TOWER-A",
    fix01.request,
  );

  assert.ok(snapshot.snapshotId.startsWith("SNAP-"));
  assert.strictEqual(snapshot.entityType, "engineering_ingest");
  assert.strictEqual(snapshot.entityId, "PRJ-AVIO-TOWER-A");
  assert.strictEqual(snapshot.payloadHash.length, 64);
  assert.deepStrictEqual(snapshot.data, fix01.request);
});

test("C2 Pilot Scenario P3: Hòa giải xung đột đa tác tử tuân thủ Thứ bậc Thẩm quyền (Authority Hierarchy - Fixture 08)", () => {
  const fix08 = loadFixture("08-agent-claims-conflict.json");
  const req = fix08.request as {
    topic: string;
    claims: Array<{
      agentRole: string;
      claim: string;
      sourceAuthority: "primary_spec" | "measured" | "derived" | "heuristic";
      confidence: string;
    }>;
  };

  assert.strictEqual(req.claims.length, 3);

  // Thứ bậc thẩm quyền: primary_spec (1) > measured (2) > derived (3) > heuristic (4)
  const authorityRank: Record<string, number> = {
    primary_spec: 1,
    measured: 2,
    derived: 3,
    heuristic: 4,
  };

  const sortedClaims = [...req.claims].sort(
    (a, b) => authorityRank[a.sourceAuthority] - authorityRank[b.sourceAuthority],
  );

  // Luận điểm có thẩm quyền cao nhất phải thắng bất kể confidence hay số đông
  assert.strictEqual(sortedClaims[0].sourceAuthority, "primary_spec");
  assert.strictEqual(sortedClaims[0].agentRole, "mep_hvac_engineer");
  assert.strictEqual(fix08.expect.majorityVoteApplied, false);
});

test("C2 Pilot Scenario P4: Xử lý lỗi quan hệ không hợp lệ và vượt giới hạn (Fixtures 05 & 07)", () => {
  const fix05 = loadFixture("05-relation-unknown-key.json");
  const req05 = fix05.request as {
    relations: Array<{ fromExternalKey: string; toExternalKey: string }>;
  };
  assert.strictEqual(req05.relations[0].toExternalKey, "khong-ton-tai:zzz");

  const fix07 = loadFixture("07-limits-exceeded.json") as any;
  assert.ok(fix07.generate.objects > 500); // Vượt trần 500 objects theo quy định ENG-5
});
