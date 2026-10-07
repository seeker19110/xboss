// Dựng recovery manifest v1 từ snapshot NGUỒN (A6-FR01). Caller đã mở transaction
// REPEATABLE READ READ ONLY (+ `row_security = off`) và — nếu kèm dump — đã export snapshot
// cho pg_dump, nên manifest và dump mô tả CÙNG một thời điểm (A6-FR03: không so DB ở T0
// với tệp ở T1). Dùng chung bộ thu thập dr-snapshot.ts với verifier.
import {
  RECOVERY_MANIFEST_FORMAT,
  DIGEST_ALGORITHM,
  parseRecoveryManifest,
  type ArtifactFact,
  type AttachmentFact,
  type KeyReference,
  type MigrationFact,
  type RecoveryManifestV1,
} from "./recovery-manifest";
import {
  collectAttachmentRefs,
  collectAuditWatermark,
  collectFinanceTotals,
  collectSchemaObjects,
  collectTableFacts,
  text,
  applyStableTextFormat,
  type DrClient,
} from "./dr-snapshot";
import type { FileHasher } from "./dr-files";

/** Lỗi nghiệp vụ khi dựng manifest — thông điệp không chứa giá trị nhạy cảm, in được. */
export class ManifestBuildError extends Error {}

export type BuildManifestOptions = {
  recoverySetId: string;
  startedAt: string;
  sourceIdentityHash: string;
  appSha: string | null;
  baseBackupId: string | null;
  repoMigrations: readonly MigrationFact[];
  attachments: FileHasher | null;
  artifacts: readonly ArtifactFact[];
  encryptionKeyReference: KeyReference | null;
  tools: Record<string, string>;
};

async function optional<T>(
  client: DrClient,
  sql: string,
  pick: (row: Record<string, unknown>) => T,
) {
  // Hàm WAL/control có thể bị chặn quyền hoặc lỗi trên standby — ghi null, không đoán.
  await client.query("SAVEPOINT manifest_optional");
  try {
    const { rows } = await client.query(sql);
    return rows[0] ? pick(rows[0]) : null;
  } catch {
    return null;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT manifest_optional");
    await client.query("RELEASE SAVEPOINT manifest_optional");
  }
}

async function attachmentFacts(
  client: DrClient,
  hasher: FileHasher | null,
): Promise<AttachmentFact[]> {
  const refs = await collectAttachmentRefs(client);
  if (refs.length && !hasher) {
    throw new ManifestBuildError("DB có tệp critical nhưng chưa truyền --attachments-dir để băm.");
  }
  const facts = new Map<string, AttachmentFact>();
  let missing = 0;
  let mismatched = 0;
  for (const ref of refs) {
    const id = `${ref.table}/${ref.key}`;
    if (facts.has(id)) continue;
    const digest = await hasher!(ref.key);
    if (!digest) {
      missing++;
      continue;
    }
    if (
      (ref.sha256 && ref.sha256 !== digest.sha256) ||
      (ref.size !== null && ref.size !== digest.size)
    ) {
      mismatched++;
      continue;
    }
    facts.set(id, { table: ref.table, key: ref.key, version: null, ...digest });
  }
  // A6-FR03: thiếu/lệch tệp ở điểm snapshot → recovery set FAIL, không phát hành nửa vời.
  if (missing || mismatched) {
    throw new ManifestBuildError(
      `Không phát hành manifest: thiếu ${missing}, lệch size/hash ${mismatched} tệp critical.`,
    );
  }
  return [...facts.values()];
}

export async function buildRecoveryManifest(
  client: DrClient,
  options: BuildManifestOptions,
): Promise<RecoveryManifestV1> {
  const version = await client.query("SHOW server_version_num");
  const serverVersionNum = text(version.rows[0]?.server_version_num, "server_version_num");
  const capturedAt = new Date().toISOString();
  const walLsn = await optional(client, "SELECT pg_current_wal_lsn()::text AS lsn", (row) =>
    typeof row.lsn === "string" ? row.lsn : null,
  );
  const timeline = await optional(
    client,
    "SELECT timeline_id FROM pg_control_checkpoint()",
    (row) => (typeof row.timeline_id === "number" ? row.timeline_id : null),
  );

  const applied = await client.query("SELECT name FROM schema_migrations ORDER BY name ASC");
  const repoSha = new Map(options.repoMigrations.map((item) => [item.name, item.sha256]));
  const migrations = applied.rows.map((row) => {
    const name = text(row.name, "migration");
    const sha256 = repoSha.get(name);
    if (!sha256)
      throw new ManifestBuildError("Migration đã áp không có tệp trong mã nguồn đang chạy.");
    return { name, sha256 };
  });

  await client.query("SAVEPOINT manifest_stable_format");
  let tables;
  let schemaObjects;
  try {
    await applyStableTextFormat(client);
    tables = await collectTableFacts(client);
    schemaObjects = await collectSchemaObjects(client);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT manifest_stable_format");
    await client.query("RELEASE SAVEPOINT manifest_stable_format");
  }

  const manifest: RecoveryManifestV1 = {
    formatVersion: RECOVERY_MANIFEST_FORMAT,
    recoverySetId: options.recoverySetId,
    source: { identityHash: options.sourceIdentityHash, serverVersionNum },
    startedAt: options.startedAt,
    completedAt: new Date().toISOString(),
    postgres: { serverMajor: Math.floor(Number(serverVersionNum) / 10000), tools: options.tools },
    appSha: options.appSha,
    baseBackupId: options.baseBackupId,
    snapshot: { capturedAt, walLsn, timeline },
    // WAL coverage + số đo RPO/RTO cần hạ tầng archive/diễn tập thật — không tự điền.
    wal: null,
    digestAlgorithm: DIGEST_ALGORITHM,
    migrations,
    tables,
    financeTotals: await collectFinanceTotals(client),
    schemaObjects,
    audit: await collectAuditWatermark(client),
    attachments: await attachmentFacts(client, options.attachments),
    artifacts: [...options.artifacts],
    encryptionKeyReference: options.encryptionKeyReference,
    measurements: null,
  };
  // Tự kiểm bằng chính validator mà verifier dùng (kể cả chặn secret) trước khi phát hành.
  parseRecoveryManifest(JSON.parse(JSON.stringify(manifest)));
  return manifest;
}
