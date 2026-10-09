// Primitive kiểm khôi phục: connection riêng, snapshot chỉ-đọc, không gọi migration.
// S14 (A6-FR05/FR07): đối chiếu bản khôi phục với recovery manifest v1 — mỗi hạng mục trả
// PASS/FAIL/NOT_RUN kèm expected/actual + lý do. Hạng mục cần hạ tầng thật (WAL archive,
// RPO/RTO, khả dụng key) là NOT_RUN khi chưa có số đo — không bao giờ PASS giả.
import { createHash } from "node:crypto";
import { verifyAuditChain } from "@/lib/bao-mat/merkle-audit-ledger";
import {
  D08_TARGETS,
  type ArtifactFact,
  type ManifestRead,
  type MigrationFact,
  type RecoveryManifestV1,
} from "./recovery-manifest";
import {
  INTEGRITY_RULES,
  READ_TABLES,
  collectAttachmentRefs,
  collectAuditWatermark,
  collectFinanceTotals,
  collectSchemaObjects,
  collectTableFacts,
  countValue,
  applyStableTextFormat,
  type DrClient,
} from "./dr-snapshot";
import type { FileHasher } from "./dr-files";

export type { DrClient } from "./dr-snapshot";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type DrStatus = "PASS" | "FAIL" | "NOT_RUN";
// fixture = đo được trên recovery set tổng hợp/đích cách ly; infrastructure = cần hạ tầng
// thật (WAL archive liên tục, kho key, đồng hồ diễn tập) mới có bằng chứng.
export type DrEvidence = "fixture" | "infrastructure";
export type DrCheck = {
  name: string;
  status: DrStatus;
  evidence: DrEvidence;
  reason: string;
  expected?: Json;
  actual?: Json;
};
export type DrTarget = {
  connectionString: string;
  expectedDatabase: string;
  expectedUser: string;
  expectedMarker: string;
  markerDatabase: string;
  /** Role ứng dụng trên đích cần kiểm RLS (mặc định `xboss_app`, ADR-0005). */
  appRole?: string;
};
export type DrInput = {
  /** Migration của mã nguồn đang dùng để khôi phục (tên + SHA-256 nội dung tệp). */
  migrations: readonly MigrationFact[];
  manifest: ManifestRead | null;
  /** App SHA của mã nguồn đang dùng; null = không xác định được. */
  appSha: string | null;
  attachments: FileHasher | null;
  artifacts: FileHasher | null;
};

// Cùng định dạng marker với scripts/ops/restore-check.sh (COMMENT ON DATABASE).
const MARKER_PATTERN = /^xboss-disposable:[A-Za-z0-9_-]{16,}$/;
const DB_NAME_PATTERN = /^[A-Za-z0-9_-]{1,63}$/;
const MAX_LISTED = 20;
export const DEFAULT_APP_ROLE = "xboss_app";
// Bảng tài chính có cột project_id/org_id trực tiếp: migration 0069/0080 bật + FORCE RLS. Bảng con
// (contract_addenda, boq_items, payment_cert_items) không có RLS riêng — cô lập qua bảng cha.
const FINANCE_RLS_TABLES = [
  "contracts",
  "payment_bills",
  "invoices",
  "advances",
  "claims",
  "cash_transactions",
] as const;
const ROLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** host:port/database (chữ thường) — danh tính rút gọn, không chứa user/mật khẩu. */
export function connectionIdentity(raw: string): string {
  const url = new URL(raw);
  if (!/^postgres(ql)?:$/.test(url.protocol) || !url.hostname || url.pathname.length < 2) {
    throw new Error("Đích kiểm tra phải là PostgreSQL URL có hostname và database.");
  }
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
}

/** Băm danh tính để ghi vào manifest/đối chiếu mà không lộ host/tên DB. */
export function identityHash(raw: string): string {
  return createHash("sha256").update(connectionIdentity(raw)).digest("hex").slice(0, 32);
}

export function readDrTarget(env: Record<string, string | undefined>): DrTarget {
  const connectionString = env.DR_VERIFY_DATABASE_URL;
  const expectedDatabase = env.DR_VERIFY_EXPECTED_DATABASE?.trim();
  const expectedUser = env.DR_VERIFY_EXPECTED_USER?.trim();
  const expectedMarker = env.DR_VERIFY_EXPECTED_MARKER?.trim();
  if (!connectionString || !expectedDatabase || !expectedUser || !expectedMarker) {
    throw new Error(
      "Cần DR_VERIFY_DATABASE_URL, DR_VERIFY_EXPECTED_DATABASE, DR_VERIFY_EXPECTED_USER và DR_VERIFY_EXPECTED_MARKER.",
    );
  }
  if (!MARKER_PATTERN.test(expectedMarker)) {
    throw new Error("DR_VERIFY_EXPECTED_MARKER phải có dạng xboss-disposable:<token ≥16 ký tự>.");
  }
  const markerDatabase = env.DR_VERIFY_MARKER_DATABASE?.trim() || expectedDatabase;
  if (!DB_NAME_PATTERN.test(markerDatabase)) {
    throw new Error("DR_VERIFY_MARKER_DATABASE không hợp lệ.");
  }
  try {
    const target = connectionIdentity(connectionString);
    for (const source of [env.DATABASE_URL, env.MIGRATE_DATABASE_URL]) {
      if (source && connectionIdentity(source) === target) {
        throw new Error("Đích kiểm tra trùng nguồn ứng dụng.");
      }
    }
  } catch {
    // Không đưa URI, username/password hoặc thông điệp lỗi parser ra log.
    throw new Error("Đích DR không hợp lệ hoặc trùng database ứng dụng; cần bản sao cách ly.");
  }
  const appRole = env.DR_VERIFY_APP_ROLE?.trim() || DEFAULT_APP_ROLE;
  if (!ROLE_NAME_PATTERN.test(appRole)) {
    throw new Error("DR_VERIFY_APP_ROLE không hợp lệ.");
  }
  return {
    connectionString,
    expectedDatabase,
    expectedUser,
    expectedMarker,
    markerDatabase,
    appRole,
  };
}

/**
 * Chặn TRƯỚC khi kết nối: đích có danh tính trùng nguồn ghi trong manifest (A6-FR06).
 * So băm host:port/database — không phát hiện được alias DNS; operator vẫn phải kiểm topology.
 */
export function checkSourceDistinct(target: DrTarget, manifest: ManifestRead | null): DrCheck {
  const base = { name: "source-distinct", evidence: "fixture" as const };
  if (manifest?.kind !== "v1") {
    return {
      ...base,
      status: "NOT_RUN",
      reason: "Không có manifest v1 ghi danh tính nguồn để đối chiếu.",
    };
  }
  const same = manifest.manifest.source.identityHash === identityHash(target.connectionString);
  return same
    ? { ...base, status: "FAIL", reason: "Đích trùng danh tính nguồn của recovery set; dừng." }
    : { ...base, status: "PASS", reason: "Đích khác danh tính nguồn ghi trong manifest." };
}

function isAccessError(error: unknown): boolean {
  // 42501: permission denied hoặc "query would be affected by row-level security policy".
  return (error as { code?: string } | null)?.code === "42501";
}

function limited<T extends Json>(items: T[]): Json {
  return items.length > MAX_LISTED
    ? [...items.slice(0, MAX_LISTED), `…+${items.length - MAX_LISTED}`]
    : items;
}

export function summarizeDrChecks(results: readonly DrCheck[]) {
  const counts = { PASS: 0, FAIL: 0, NOT_RUN: 0 };
  for (const result of results) counts[result.status]++;
  const fixture = results.filter((result) => result.evidence === "fixture");
  return {
    // Chỉ true khi MỌI hạng mục bắt buộc (kể cả hạ tầng) PASS.
    completeDrVerified: results.length > 0 && counts.PASS === results.length,
    // Phần đo được trên fixture/đích cách ly — KHÔNG phải bằng chứng PITR/RPO/RTO thật.
    fixtureChecksPassed: fixture.length > 0 && fixture.every((result) => result.status === "PASS"),
    counts,
  };
}

export async function runDrChecks(
  client: DrClient,
  target: Pick<
    DrTarget,
    "expectedDatabase" | "expectedUser" | "expectedMarker" | "markerDatabase"
  > &
    Partial<Pick<DrTarget, "appRole">>,
  input: DrInput,
): Promise<DrCheck[]> {
  const results: DrCheck[] = [];
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    // Truy vấn đầu tiên chỉ đọc catalog: chưa chạm bảng nghiệp vụ nào trước khi đích đạt.
    const identity = await client.query(
      `SELECT current_database() AS db, current_user AS usr,
              current_setting('transaction_read_only') AS readonly,
              COALESCE((SELECT shobj_description(oid, 'pg_database') = $1
                        FROM pg_database WHERE datname = $2), false) AS marker_ok`,
      [target.expectedMarker, target.markerDatabase],
    );
    const actual = identity.rows[0];
    if (
      actual?.db !== target.expectedDatabase ||
      actual?.usr !== target.expectedUser ||
      actual?.readonly !== "on" ||
      actual?.marker_ok !== true
    ) {
      return [
        {
          name: "target",
          status: "FAIL",
          evidence: "fixture",
          reason:
            "Sai đích, không ở chế độ chỉ-đọc hoặc thiếu marker disposable; dừng trước mọi truy vấn nghiệp vụ.",
        },
      ];
    }
    results.push({
      name: "target",
      status: "PASS",
      evidence: "fixture",
      reason: "Đích, marker disposable và transaction chỉ-đọc đều khớp.",
    });
    // Không cho RLS lọc về tập rỗng rồi diễn giải nhầm là toàn bộ dữ liệu hợp lệ.
    // Đây không phải bypass: PostgreSQL báo lỗi nếu policy sẽ lọc dữ liệu của role này.
    await client.query("SET LOCAL row_security = off");

    const check = async (
      name: string,
      evidence: DrEvidence,
      fn: () => Promise<Omit<DrCheck, "name" | "evidence">>,
    ) => {
      const savepoint = `dr_check_${results.length}`; // Nội bộ, không nhận tên từ request/env.
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        results.push({ name, evidence, ...(await fn()) });
      } catch (error) {
        results.push(
          isAccessError(error)
            ? {
                name,
                evidence,
                status: "NOT_RUN",
                reason:
                  "Role kiểm không đọc được toàn phần (RLS/quyền) — cần role audit BYPASSRLS + pg_read_all_data; không coi số 0 là hợp lệ.",
              }
            : { name, evidence, status: "FAIL", reason: "Không kiểm chứng được; không tự sửa." },
        );
      } finally {
        // Luôn quay về savepoint: bỏ SET LOCAL của check, lỗi một mục không che mục sau.
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      }
    };

    const manifest = input.manifest;
    const v1 = manifest?.kind === "v1" ? manifest.manifest : null;
    const needV1 = (what: string): Omit<DrCheck, "name" | "evidence"> => ({
      status: "NOT_RUN",
      reason: !manifest
        ? `Chưa truyền --manifest; không có ${what} để đối chiếu.`
        : `Manifest cũ (schemaVersion 1) không có ${what}; cần manifest v1.`,
    });

    await check("manifest", "fixture", async () =>
      v1
        ? { status: "PASS", reason: "Manifest v1 hợp lệ.", actual: v1.recoverySetId }
        : needV1("dữ liệu recovery set"),
    );
    await check("app-sha", "fixture", async () => appShaResult(v1, input.appSha, needV1));
    await check("audit-role-access", "fixture", () => checkReadAccess(client));
    await check("app-role-rls", "fixture", () =>
      checkAppRoleRls(client, target.appRole ?? DEFAULT_APP_ROLE),
    );
    await check("migration-names", "fixture", () => checkMigrationNames(client, input.migrations));
    await check("migration-checksums", "fixture", async () =>
      v1 ? checkMigrationChecksums(client, v1, input.migrations) : needV1("migration checksum"),
    );
    await check("table-digests", "fixture", async () =>
      v1 ? checkTableDigests(client, v1) : needV1("số dòng/digest"),
    );
    await check("finance-totals", "fixture", async () =>
      v1 ? checkFinanceTotals(client, v1) : needV1("tổng tiền exact"),
    );
    await check("schema-objects", "fixture", async () => {
      if (!v1) return needV1("digest ràng buộc/policy/trigger");
      await applyStableTextFormat(client);
      const actualObjects = await collectSchemaObjects(client);
      const same =
        actualObjects.digest === v1.schemaObjects.digest &&
        actualObjects.count === v1.schemaObjects.count;
      return {
        status: same ? "PASS" : "FAIL",
        reason: same
          ? "Ràng buộc, policy RLS, trigger, hàm và extension khớp snapshot."
          : "Ràng buộc/policy/trigger/hàm khác snapshot nguồn.",
        expected: v1.schemaObjects,
        actual: actualObjects,
      };
    });
    for (const rule of INTEGRITY_RULES) {
      await check(`integrity:${rule.name}`, "fixture", async () => {
        const { rows } = await client.query(rule.sql);
        const count = countValue(rows[0]?.violations);
        return {
          status: count === 0n ? "PASS" : "FAIL",
          reason: `${count} dòng mồ côi hoặc lệch org/project.`,
          expected: "0",
          actual: count.toString(),
        };
      });
    }
    await check("audit-chain", "fixture", async () => {
      const readRows = async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
        let parameter = 0;
        const { rows } = await client.query(
          sql.replace(/\?/g, () => `$${++parameter}`),
          params,
        );
        return rows as T[];
      };
      const chain = await verifyAuditChain(readRows);
      if (!chain.ok) {
        return {
          status: "FAIL",
          reason: "Chuỗi audit có hash không hợp lệ.",
          actual: {
            errors: chain.errors.length,
            firstIds: chain.errors.slice(0, 5).map((e) => e.id),
          },
        };
      }
      if (!chain.total || chain.checked !== chain.total) {
        return {
          status: "NOT_RUN",
          reason: `Chưa đủ bằng chứng coverage: ${chain.checked}/${chain.total} dòng có hash.`,
        };
      }
      return { status: "PASS", reason: `Đối chiếu ${chain.checked} dòng audit có hash.` };
    });
    await check("audit-watermark", "fixture", async () => {
      if (!v1) return needV1("watermark audit");
      const actualWatermark = await collectAuditWatermark(client);
      const same = JSON.stringify(actualWatermark) === JSON.stringify(v1.audit);
      return {
        status: same ? "PASS" : "FAIL",
        reason: same
          ? "Số dòng, id cuối và hash cuối của audit_log khớp snapshot."
          : "audit_log khác snapshot (mất đuôi, thêm dòng hoặc hash cuối khác).",
        expected: v1.audit,
        actual: actualWatermark,
      };
    });
    await check("attachments-manifest", "fixture", async () =>
      v1 ? checkAttachmentManifest(client, v1) : needV1("danh mục tệp critical"),
    );
    await check("attachments-files", "fixture", async () => {
      if (!v1) return needV1("danh mục tệp critical");
      if (!input.attachments) {
        return {
          status: "NOT_RUN",
          reason: "Chưa truyền --attachments-dir trỏ thư mục tệp đã khôi phục; chưa băm tệp.",
        };
      }
      return compareFiles(
        v1.attachments.map((item) => ({ key: item.key, size: item.size, sha256: item.sha256 })),
        input.attachments,
        "tệp critical",
      );
    });
    await check("backup-artifacts", "fixture", async () => {
      const artifacts: ArtifactFact[] =
        manifest?.kind === "legacy" ? manifest.artifacts : (v1?.artifacts ?? []);
      if (!manifest) return needV1("artifact backup");
      if (!artifacts.length) {
        return { status: "NOT_RUN", reason: "Manifest không ghi artifact backup nào để băm lại." };
      }
      if (!input.artifacts) {
        return { status: "NOT_RUN", reason: "Chưa truyền --artifacts-dir; chưa băm lại artifact." };
      }
      return compareFiles(
        artifacts.map((item) => ({ key: item.path, size: item.size, sha256: item.sha256 })),
        input.artifacts,
        "artifact backup",
      );
    });
    await check("encryption-key-reference", "fixture", async () => {
      if (!v1) return needV1("tham chiếu key mã hoá");
      return v1.encryptionKeyReference
        ? {
            status: "PASS",
            reason: "Manifest có tham chiếu key (chỉ tham chiếu, không chứa key).",
            actual: {
              provider: v1.encryptionKeyReference.provider,
              keyVersion: v1.encryptionKeyReference.keyVersion,
            },
          }
        : {
            status: "FAIL",
            reason:
              "Thiếu encryptionKeyReference — recovery set không phục hồi được dữ liệu mã hoá.",
          };
    });
    await check("encryption-key-availability", "infrastructure", async () => ({
      status: "NOT_RUN",
      reason: "Cần thử mở key qua kho key thật trên đích cách ly; verifier không truy cập kho key.",
    }));
    await check("wal-coverage", "infrastructure", async () => walCoverageResult(v1, needV1));
    await check("rpo", "infrastructure", async () =>
      measurementResult(v1, "rpoSeconds", D08_TARGETS.rpoSeconds, "RPO", needV1),
    );
    await check("rto", "infrastructure", async () =>
      measurementResult(v1, "rtoSeconds", D08_TARGETS.rtoSeconds, "RTO", needV1),
    );
    return results;
  } finally {
    await client.query("ROLLBACK");
  }
}

type CheckOutcome = Omit<DrCheck, "name" | "evidence">;

function appShaResult(
  v1: RecoveryManifestV1 | null,
  appSha: string | null,
  needV1: (what: string) => CheckOutcome,
): CheckOutcome {
  if (!v1) return needV1("app SHA");
  if (!v1.appSha) return { status: "NOT_RUN", reason: "Manifest không ghi appSha." };
  if (!appSha) return { status: "NOT_RUN", reason: "Không xác định được app SHA đang khôi phục." };
  const [shorter, longer] = [v1.appSha, appSha].sort((a, b) => a.length - b.length);
  const same = shorter.length >= 7 && longer.startsWith(shorter);
  return {
    status: same ? "PASS" : "FAIL",
    reason: same
      ? "App SHA khớp snapshot."
      : "App SHA khác snapshot; phục hồi bằng đúng app SHA trước khi thử nâng cấp.",
    expected: v1.appSha,
    actual: appSha,
  };
}

async function checkReadAccess(client: DrClient): Promise<CheckOutcome> {
  const role = await client.query(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  const bypass = role.rows[0]?.rolsuper === true || role.rows[0]?.rolbypassrls === true;
  const { rows } = await client.query(
    `SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
            pg_get_userbyid(c.relowner) = current_user AS is_owner,
            has_table_privilege(c.oid, 'SELECT') AS can_select
     FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])`,
    [READ_TABLES],
  );
  const seen = new Map(rows.map((row) => [row.name, row]));
  const missing = READ_TABLES.filter((table) => !seen.has(table));
  if (missing.length) {
    return {
      status: "FAIL",
      reason: "Thiếu bảng trọng yếu trong schema khôi phục.",
      actual: limited(missing),
    };
  }
  const blocked = READ_TABLES.filter((table) => {
    const row = seen.get(table)!;
    const rlsApplies =
      row.rls === true && !bypass && (row.is_owner !== true || row.force_rls === true);
    return row.can_select !== true || rlsApplies;
  });
  if (blocked.length) {
    return {
      status: "NOT_RUN",
      reason:
        "Role kiểm bị RLS/quyền chặn trên bảng trọng yếu — số đếm sẽ không phải toàn bộ dữ liệu. Dùng role audit BYPASSRLS + pg_read_all_data.",
      actual: limited(blocked),
    };
  }
  return {
    status: "PASS",
    reason: `Role kiểm đọc toàn phần ${READ_TABLES.length} bảng trọng yếu.`,
  };
}

/**
 * A6-AC04: role ứng dụng trên đích phải còn bị RLS ràng buộc — NOBYPASSRLS, không superuser,
 * không sở hữu bảng có RLS (owner bỏ qua policy nếu không FORCE) và bảng tài chính bật + FORCE RLS.
 * Chỉ đọc catalog; không in tên role/URI nào ngoài tên role app (không phải secret).
 */
async function checkAppRoleRls(client: DrClient, appRole: string): Promise<CheckOutcome> {
  const role = await client.query(
    `SELECT r.rolsuper, r.rolbypassrls,
            ARRAY(SELECT c.relname::text FROM pg_catalog.pg_class c
                  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
                    AND c.relrowsecurity AND c.relowner = r.oid
                  ORDER BY c.relname) AS owned_rls
     FROM pg_catalog.pg_roles r WHERE r.rolname = $1`,
    [appRole],
  );
  const row = role.rows[0];
  if (!row) {
    return {
      status: "FAIL",
      reason: `Đích thiếu role ứng dụng "${appRole}" — restore chưa đủ (role là đối tượng cấp cluster, cần tạo/gán lại trước khi chạy app).`,
      expected: appRole,
    };
  }
  const problems: Json[] = [];
  if (row.rolsuper === true) problems.push("superuser");
  if (row.rolbypassrls === true) problems.push("bypassrls");
  const owned = Array.isArray(row.owned_rls) ? (row.owned_rls as string[]) : [];
  if (owned.length) problems.push({ ownsRlsTables: limited(owned) });
  const financeTables: string[] = [...FINANCE_RLS_TABLES];
  const finance = await client.query(
    `SELECT c.relname::text AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls
     FROM pg_catalog.pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relname = ANY($1::text[])`,
    [financeTables],
  );
  const byName = new Map(finance.rows.map((item) => [String(item.name), item]));
  const weak = financeTables.filter((name) => {
    const item = byName.get(name);
    return !item || item.rls !== true || item.force_rls !== true;
  });
  if (weak.length) problems.push({ financeWithoutForcedRls: limited(weak) });
  return {
    status: problems.length ? "FAIL" : "PASS",
    reason: problems.length
      ? `Role ứng dụng "${appRole}" không bị RLS ràng buộc đúng thiết kế (ADR-0005).`
      : `Role "${appRole}" NOBYPASSRLS, không superuser, không sở hữu bảng RLS; ${financeTables.length} bảng tài chính bật + FORCE RLS.`,
    actual: problems.length ? problems : undefined,
  };
}

async function checkMigrationNames(
  client: DrClient,
  migrations: readonly MigrationFact[],
): Promise<CheckOutcome> {
  const migrationNames = migrations.map((item) => item.name);
  if (!migrationNames.length || new Set(migrationNames).size !== migrationNames.length) {
    return { status: "FAIL", reason: "Danh sách migration rỗng hoặc trùng tên." };
  }
  const { rows } = await client.query("SELECT name FROM schema_migrations ORDER BY name ASC");
  const applied = new Set(rows.map((row) => row.name));
  const expected = new Set(migrationNames);
  const missing = migrationNames.filter((name) => !applied.has(name));
  const extra = [...applied].filter((name) => typeof name !== "string" || !expected.has(name));
  const ok = !missing.length && !extra.length && applied.size === rows.length;
  return {
    status: ok ? "PASS" : "FAIL",
    reason: `Mã nguồn so với DB: thiếu ${missing.length}, thừa ${extra.length}.`,
    expected: migrationNames.length,
    actual: rows.length,
  };
}

async function checkMigrationChecksums(
  client: DrClient,
  v1: RecoveryManifestV1,
  repo: readonly MigrationFact[],
): Promise<CheckOutcome> {
  const { rows } = await client.query("SELECT name FROM schema_migrations ORDER BY name ASC");
  const applied = new Set(rows.map((row) => String(row.name)));
  const repoSha = new Map(repo.map((item) => [item.name, item.sha256]));
  const manifestNames = new Set(v1.migrations.map((item) => item.name));
  const missingInDb = v1.migrations.filter((item) => !applied.has(item.name)).map((m) => m.name);
  const extraInDb = [...applied].filter((name) => !manifestNames.has(name));
  const checksumMismatch = v1.migrations
    .filter((item) => repoSha.get(item.name) !== item.sha256)
    .map((item) => item.name);
  const ok = !missingInDb.length && !extraInDb.length && !checksumMismatch.length;
  return {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? `${v1.migrations.length} migration khớp tên + SHA-256 với snapshot.`
      : "Migration lệch snapshot (thiếu/thừa trong DB hoặc SHA-256 tệp khác manifest).",
    expected: v1.migrations.length,
    actual: limited([
      ...missingInDb.map((name) => `thiếu:${name}`),
      ...extraInDb.map((name) => `thừa:${name}`),
      ...checksumMismatch.map((name) => `lệch-sha256:${name}`),
    ]),
  };
}

async function checkTableDigests(client: DrClient, v1: RecoveryManifestV1): Promise<CheckOutcome> {
  await applyStableTextFormat(client);
  const actualFacts = await collectTableFacts(client);
  const expected = new Map(v1.tables.map((item) => [item.table, item]));
  const actualNames = new Set(actualFacts.map((item) => item.table));
  const problems: Json[] = [];
  for (const fact of actualFacts) {
    const want = expected.get(fact.table);
    if (!want) problems.push({ table: fact.table, issue: "manifest thiếu bảng" });
    else if (want.rowCount !== fact.rowCount || want.digest !== fact.digest) {
      problems.push({
        table: fact.table,
        expectedRows: want.rowCount,
        actualRows: fact.rowCount,
        digestMatch: want.digest === fact.digest,
      });
    }
  }
  for (const table of expected.keys()) {
    if (!actualNames.has(table)) problems.push({ table, issue: "verifier không biết bảng này" });
  }
  return {
    status: problems.length ? "FAIL" : "PASS",
    reason: problems.length
      ? `${problems.length} bảng lệch số dòng/digest so với snapshot.`
      : `${actualFacts.length} bảng khớp số dòng + digest.`,
    actual: problems.length ? limited(problems) : undefined,
  };
}

async function checkFinanceTotals(client: DrClient, v1: RecoveryManifestV1): Promise<CheckOutcome> {
  const actualTotals = await collectFinanceTotals(client);
  const expected = new Map(v1.financeTotals.map((item) => [item.key, item]));
  const problems: Json[] = [];
  for (const total of actualTotals) {
    const want = expected.get(total.key);
    // So CHUỖI exact từ SQL; không parse sang float.
    if (!want || want.sum !== total.sum || want.rowCount !== total.rowCount) {
      problems.push({
        key: total.key,
        expected: want ? want.sum : null,
        actual: total.sum,
      });
    }
  }
  if (expected.size !== actualTotals.length) {
    problems.push({ issue: "số khoá tổng tiền khác giữa manifest và verifier" });
  }
  return {
    status: problems.length ? "FAIL" : "PASS",
    reason: problems.length
      ? `${problems.length} tổng tiền lệch snapshot (so chuỗi exact).`
      : `${actualTotals.length} tổng tiền khớp exact.`,
    actual: problems.length ? limited(problems) : undefined,
  };
}

async function checkAttachmentManifest(
  client: DrClient,
  v1: RecoveryManifestV1,
): Promise<CheckOutcome> {
  const refs = await collectAttachmentRefs(client);
  const byKey = new Map(v1.attachments.map((item) => [`${item.table}/${item.key}`, item]));
  const missing: Json[] = [];
  const mismatched: Json[] = [];
  for (const ref of refs) {
    const entry = byKey.get(`${ref.table}/${ref.key}`);
    if (!entry) missing.push(`${ref.table}#${ref.id}`);
    else if (
      (ref.sha256 !== null && ref.sha256 !== entry.sha256) ||
      (ref.size !== null && ref.size !== entry.size)
    ) {
      mismatched.push(`${ref.table}#${ref.id}`);
    }
  }
  const ok = !missing.length && !mismatched.length;
  return {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? `${refs.length} tệp critical DB tham chiếu đều có trong manifest với size/hash khớp.`
      : `Thiếu ${missing.length}, lệch size/hash ${mismatched.length} tệp critical so với manifest.`,
    expected: refs.length,
    actual: ok ? refs.length : { missing: limited(missing), mismatched: limited(mismatched) },
  };
}

async function compareFiles(
  entries: { key: string; size: number; sha256: string }[],
  hasher: FileHasher,
  what: string,
): Promise<CheckOutcome> {
  const missing: Json[] = [];
  const mismatched: Json[] = [];
  for (const entry of entries) {
    const digest = await hasher(entry.key);
    if (!digest) missing.push(entry.key);
    else if (digest.size !== entry.size || digest.sha256 !== entry.sha256) {
      mismatched.push(entry.key);
    }
  }
  const ok = !missing.length && !mismatched.length;
  return {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? `${entries.length} ${what} tồn tại với size + SHA-256 khớp manifest.`
      : `Thiếu ${missing.length}, hỏng/lệch ${mismatched.length} ${what}.`,
    expected: entries.length,
    actual: ok ? entries.length : { missing: limited(missing), mismatched: limited(mismatched) },
  };
}

function lsnValue(lsn: string): bigint {
  const [high, low] = lsn.split("/");
  return (BigInt(`0x${high}`) << 32n) + BigInt(`0x${low}`);
}

function walCoverageResult(
  v1: RecoveryManifestV1 | null,
  needV1: (what: string) => CheckOutcome,
): CheckOutcome {
  if (!v1) return needV1("WAL/PITR coverage");
  if (!v1.wal || !v1.baseBackupId) {
    return {
      status: "NOT_RUN",
      reason: "Cần hạ tầng archive thật: manifest chưa có base backup + WAL coverage đo được.",
    };
  }
  const windowDays =
    (Date.parse(v1.wal.windowEnd) - Date.parse(v1.wal.windowStart)) / (24 * 3600 * 1000);
  const ok =
    v1.wal.missingSegments === 0 &&
    windowDays >= D08_TARGETS.pitrWindowDays &&
    lsnValue(v1.wal.endLsn) >= lsnValue(v1.wal.startLsn);
  return {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? "Manifest ghi chuỗi WAL liên tục phủ đủ cửa sổ D08 (số liệu do manifest khai, cần bằng chứng hạ tầng kèm theo)."
      : "WAL thiếu đoạn, ngược LSN hoặc cửa sổ ngắn hơn mục tiêu D08.",
    expected: { pitrWindowDays: D08_TARGETS.pitrWindowDays, missingSegments: 0 },
    actual: {
      windowDays: Math.floor(windowDays * 100) / 100,
      missingSegments: v1.wal.missingSegments,
    },
  };
}

function measurementResult(
  v1: RecoveryManifestV1 | null,
  field: "rpoSeconds" | "rtoSeconds",
  targetSeconds: number,
  label: string,
  needV1: (what: string) => CheckOutcome,
): CheckOutcome {
  if (!v1) return needV1(`số đo ${label}`);
  const value = v1.measurements?.[field];
  if (value === null || value === undefined) {
    return {
      status: "NOT_RUN",
      reason: `Cần hạ tầng archive/diễn tập thật: chưa có số đo ${label} (mục tiêu D08 ≤ ${targetSeconds}s).`,
    };
  }
  const ok = value <= targetSeconds;
  return {
    status: ok ? "PASS" : "FAIL",
    reason: ok
      ? `${label} đo được đạt mục tiêu D08 (workload/độ phân giải theo manifest).`
      : `${label} vượt mục tiêu D08; không hạ target để lấy PASS.`,
    expected: targetSeconds,
    actual: value,
  };
}
