// S14 / A6-FR01 — validator thuần của recovery manifest v1 (không chạm DB).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  D08_TARGETS,
  DIGEST_ALGORITHM,
  ManifestError,
  RECOVERY_MANIFEST_FORMAT,
  parseRecoveryManifest,
  type RecoveryManifestV1,
} from "../scripts/lib/recovery-manifest";

const H = (c: string) => c.repeat(64);

function valid(): RecoveryManifestV1 {
  return {
    formatVersion: RECOVERY_MANIFEST_FORMAT,
    recoverySetId: "20261007T010203Z-fixture",
    source: { identityHash: "0123456789abcdef0123456789abcdef", serverVersionNum: "160015" },
    startedAt: "2026-10-07T01:02:03.000Z",
    completedAt: "2026-10-07T01:03:03.000Z",
    postgres: {
      serverMajor: 16,
      tools: { node: "v22.0.0", pg_dump: "pg_dump (PostgreSQL) 16.15" },
    },
    appSha: "abcdef0",
    baseBackupId: null,
    snapshot: { capturedAt: "2026-10-07T01:02:04.000Z", walLsn: "0/1BF2FE28", timeline: 1 },
    wal: null,
    digestAlgorithm: DIGEST_ALGORITHM,
    migrations: [{ name: "0001_baseline.sql", sha256: H("a") }],
    tables: [{ table: "contracts", rowCount: "3", digest: H("b") }],
    financeTotals: [{ key: "contracts.value", rowCount: "3", sum: "1234567.89" }],
    schemaObjects: { count: "10", digest: H("c") },
    audit: { totalRows: "5", hashedRows: "5", maxId: "5", lastRowHash: H("d") },
    attachments: [
      { table: "task_documents", key: "bbnt-1.pdf", version: null, size: 10, sha256: H("e") },
    ],
    artifacts: [{ role: "database_dump", path: "x.dump", size: 100, sha256: H("f") }],
    encryptionKeyReference: {
      provider: "vault",
      keyId: "transit/keys/xboss-backup",
      keyVersion: "3",
    },
    measurements: null,
  };
}

function rejects(mutate: (m: Record<string, unknown>) => void, pattern: RegExp, secret?: string) {
  const manifest = valid() as unknown as Record<string, unknown>;
  mutate(manifest);
  try {
    parseRecoveryManifest(JSON.parse(JSON.stringify(manifest)));
    assert.fail("phải bị từ chối");
  } catch (error) {
    assert.ok(error instanceof ManifestError, String(error));
    assert.match(error.message, pattern);
    if (secret) assert.ok(!error.message.includes(secret), "thông điệp lỗi lặp lại secret");
  }
}

test("manifest v1 hợp lệ được chấp nhận nguyên vẹn", () => {
  const read = parseRecoveryManifest(JSON.parse(JSON.stringify(valid())));
  assert.equal(read.kind, "v1");
  assert.deepEqual(read.kind === "v1" && read.manifest, valid());
});

test("tiền phải là chuỗi thập phân exact — số float/ký hiệu mũ bị từ chối", () => {
  rejects(
    (m) => ((m.financeTotals as { sum: unknown }[])[0].sum = 1234567.89),
    /financeTotals\[0\]\.sum/,
  );
  rejects(
    (m) => ((m.financeTotals as { sum: unknown }[])[0].sum = "1.2e6"),
    /financeTotals\[0\]\.sum/,
  );
});

test("từ chối mọi thứ trông như secret, không lặp lại giá trị trong lỗi", () => {
  rejects(
    (m) => ((m.postgres as { tools: Record<string, string> }).tools.x = "postgres://u:leakpw@h/db"),
    /postgres\.tools\.x/,
    "leakpw",
  );
  rejects(
    (m) =>
      ((m.postgres as { tools: Record<string, string> }).tools.y = "host=h sslpassword=leakpw"),
    /tools\.y/,
    "leakpw",
  );
  rejects((m) => (m.password = "leakpw"), /\$\.password/, "leakpw");
  rejects(
    (m) =>
      ((m.encryptionKeyReference as Record<string, unknown>).privateKey =
        "-----BEGIN PRIVATE KEY-----"),
    /privateKey/,
  );
  rejects(
    (m) => ((m.encryptionKeyReference as { keyId: string }).keyId = H("9")),
    /key thô/,
    H("9"),
  );
  rejects(
    (m) =>
      ((m.encryptionKeyReference as { keyId: string }).keyId =
        "c2VjcmV0LWtleS1tYXRlcmlhbC10aGF0LWlzLWxvbmctZW5vdWdo"),
    /key thô/,
  );
});

test("cấu trúc chặt: thiếu/thừa trường, định dạng lạ, khoá tệp traversal đều bị từ chối", () => {
  rejects((m) => delete m.encryptionKeyReference, /encryptionKeyReference: thiếu/);
  rejects((m) => (m.extra = 1), /\$\.extra: trường lạ/);
  rejects((m) => (m.formatVersion = "xboss-recovery-manifest/v9"), /formatVersion/);
  rejects((m) => (m.digestAlgorithm = "md5"), /digestAlgorithm/);
  rejects(
    (m) => ((m.attachments as { key: string }[])[0].key = "../etc/passwd"),
    /attachments\[0\]\.key/,
  );
  rejects((m) => ((m.tables as { rowCount: unknown }[])[0].rowCount = 3), /rowCount/);
  rejects((m) => (m.completedAt = "2026-10-07T01:00:00.000Z"), /completedAt/);
  rejects(
    (m) => (m.migrations = [...(m.migrations as object[]), ...(m.migrations as object[])]),
    /trùng/,
  );
});

test("manifest cũ của backup.sh đọc được ở dạng legacy; PARTIAL bị từ chối", () => {
  const legacy = {
    schemaVersion: 1,
    recoverySetId: "20260101T000000Z-123e4567-e89b-12d3-a456-426614174000",
    status: "COMPLETE",
    startedAt: "2026-01-01T00:00:00Z",
    completedAt: "2026-01-01T00:01:00+00:00",
    artifacts: [
      { role: "database_dump", path: "a.dump", status: "PRESENT", size: 1, sha256: H("a") },
    ],
  };
  const read = parseRecoveryManifest(legacy);
  assert.equal(read.kind, "legacy");
  assert.throws(() => parseRecoveryManifest({ ...legacy, status: "PARTIAL" }), ManifestError);
});

test("mục tiêu D08 là hằng số đóng băng: RPO 5 phút, RTO 60 phút, cửa sổ 35 ngày", () => {
  assert.deepEqual({ ...D08_TARGETS }, { rpoSeconds: 300, rtoSeconds: 3600, pitrWindowDays: 35 });
  assert.ok(Object.isFrozen(D08_TARGETS));
});
