// Recovery manifest v1 (A6-FR01, QUALITY-FINAL-1/S14) — kiểu dữ liệu + validator THUẦN.
//
// Manifest mô tả một recovery set tại đúng snapshot đã chụp: migration name+SHA256, số dòng +
// digest theo bảng trọng yếu, tổng tiền exact (chuỗi thập phân, không float), watermark audit,
// tệp đính kèm critical, artifact backup và THAM CHIẾU key mã hoá. Verifier
// (`scripts/lib/dr-readonly.ts`) đối chiếu bản khôi phục với manifest này.
//
// Manifest cũ của `scripts/ops/backup.sh` (`schemaVersion: 1`, chỉ có artifact dump/uploads)
// vẫn đọc được ở dạng "legacy": mọi hạng mục cần dữ liệu v1 thành NOT_RUN, không FAIL cả bộ
// và tuyệt đối không PASS giả.
//
// Validator TỪ CHỐI mọi thứ trông như secret (URI có mật khẩu, PEM, khoá tên "password"/
// "secret"/"token"…, key thô trong tham chiếu key). Lỗi chỉ nêu ĐƯỜNG DẪN trường, không lặp
// lại giá trị — để thông điệp lỗi không tự làm lộ secret.

export const RECOVERY_MANIFEST_FORMAT = "xboss-recovery-manifest/v1";
// sha256(nối các sha256_hex(row::text) đã sắp xếp COLLATE "C") — xem dr-snapshot.ts.
export const DIGEST_ALGORITHM = "xboss-row-sha256-sorted-v1";

// D08 (APPROVAL.md §9) — mục tiêu đã chốt. Hằng số cứng, KHÔNG đọc từ env/CLI/manifest để
// không ai hạ target lấy PASS (A6-FR08, Q-AC08).
export const D08_TARGETS = Object.freeze({
  rpoSeconds: 300,
  rtoSeconds: 3600,
  pitrWindowDays: 35,
});

export type MigrationFact = { name: string; sha256: string };
export type TableFact = { table: string; rowCount: string; digest: string };
export type FinanceTotal = { key: string; rowCount: string; sum: string };
export type SchemaObjectsFact = { count: string; digest: string };
export type AuditWatermark = {
  totalRows: string;
  hashedRows: string;
  maxId: string | null;
  lastRowHash: string | null;
};
export type AttachmentFact = {
  table: string;
  key: string;
  version: string | null;
  size: number;
  sha256: string;
};
export type ArtifactFact = { role: string; path: string; size: number; sha256: string };
export type KeyReference = { provider: string; keyId: string; keyVersion: string | null };
export type WalCoverage = {
  timeline: number;
  startLsn: string;
  endLsn: string;
  windowStart: string;
  windowEnd: string;
  missingSegments: number;
};
export type RecoveryMeasurements = {
  measuredAt: string;
  workload: string;
  sourceResolution: string;
  rpoSeconds: number | null;
  rtoSeconds: number | null;
  recoveryTargetLsn: string | null;
  timeline: number | null;
};

export type RecoveryManifestV1 = {
  formatVersion: typeof RECOVERY_MANIFEST_FORMAT;
  recoverySetId: string;
  source: { identityHash: string; serverVersionNum: string };
  startedAt: string;
  completedAt: string;
  postgres: { serverMajor: number; tools: Record<string, string> };
  appSha: string | null;
  baseBackupId: string | null;
  snapshot: { capturedAt: string; walLsn: string | null; timeline: number | null };
  wal: WalCoverage | null;
  digestAlgorithm: typeof DIGEST_ALGORITHM;
  migrations: MigrationFact[];
  tables: TableFact[];
  financeTotals: FinanceTotal[];
  schemaObjects: SchemaObjectsFact;
  audit: AuditWatermark;
  attachments: AttachmentFact[];
  artifacts: ArtifactFact[];
  encryptionKeyReference: KeyReference | null;
  measurements: RecoveryMeasurements | null;
};

export type ManifestRead =
  | { kind: "v1"; manifest: RecoveryManifestV1 }
  | { kind: "legacy"; recoverySetId: string; artifacts: ArtifactFact[] };

export class ManifestError extends Error {
  constructor(readonly issues: string[]) {
    super(`Manifest không hợp lệ: ${issues.slice(0, 10).join("; ")}`);
    this.name = "ManifestError";
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
const DIGITS = /^\d+$/;
const DECIMAL = /^-?\d+(\.\d+)?$/;
const LSN = /^[0-9A-F]{1,8}\/[0-9A-F]{1,8}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const SET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/;
const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;

const SECRET_KEY_NAME =
  /(password|passwd|secret|token|private_?key|credential|api_?key|key_?material|raw_?key|^kek$|^dek$)/i;
const URI_WITH_PASSWORD = /[a-z][a-z0-9+.-]*:\/\/[^\s/@:]*:[^\s/@]*@/i;
const PASSWORD_PARAM = /(^|[?&;\s])(ssl)?password=/i;
const PEM = /-----BEGIN [A-Z ]+-----/;
const RAW_HEX_KEY = /^[0-9a-f]{32,}$/i;
const RAW_BASE64_KEY = /^[A-Za-z0-9+/]{40,}={0,2}$/;

/** Quét đệ quy mọi khoá + chuỗi; trả đường dẫn trường nghi chứa secret (không trả giá trị). */
export function findSecretLikeFields(value: unknown, path = "$"): string[] {
  if (typeof value === "string") {
    return URI_WITH_PASSWORD.test(value) || PASSWORD_PARAM.test(value) || PEM.test(value)
      ? [path]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findSecretLikeFields(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => {
      const childPath = `${path}.${key}`;
      return SECRET_KEY_NAME.test(key) ? [childPath] : findSecretLikeFields(item, childPath);
    });
  }
  return [];
}

// --- Bộ kiểm cấu trúc nhỏ: gom lỗi theo đường dẫn, không nêu giá trị ---
class Reader {
  issues: string[] = [];

  obj(path: string, value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      this.issues.push(`${path}: phải là object`);
      return {};
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      if (!keys.includes(key)) this.issues.push(`${path}.${key}: trường lạ`);
    }
    for (const key of keys) {
      if (!Object.hasOwn(record, key)) this.issues.push(`${path}.${key}: thiếu`);
    }
    return record;
  }

  str(path: string, value: unknown, pattern?: RegExp, maxLength = 512): string {
    if (
      typeof value !== "string" ||
      value.length > maxLength ||
      (pattern && !pattern.test(value))
    ) {
      this.issues.push(`${path}: chuỗi không hợp lệ`);
      return "";
    }
    return value;
  }

  nullableStr(path: string, value: unknown, pattern?: RegExp): string | null {
    return value === null ? null : this.str(path, value, pattern);
  }

  int(path: string, value: unknown, min = 0): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
      this.issues.push(`${path}: số nguyên không hợp lệ`);
      return 0;
    }
    return value;
  }

  nullableInt(path: string, value: unknown, min = 0): number | null {
    return value === null ? null : this.int(path, value, min);
  }

  nullableSeconds(path: string, value: unknown): number | null {
    if (value === null) return null;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      this.issues.push(`${path}: số giây không hợp lệ`);
      return null;
    }
    return value;
  }

  iso(path: string, value: unknown): string {
    const text = this.str(path, value, ISO, 40);
    if (text && Number.isNaN(Date.parse(text))) this.issues.push(`${path}: thời điểm sai`);
    return text;
  }

  list<T>(path: string, value: unknown, map: (item: unknown, itemPath: string) => T): T[] {
    if (!Array.isArray(value)) {
      this.issues.push(`${path}: phải là mảng`);
      return [];
    }
    return value.map((item, index) => map(item, `${path}[${index}]`));
  }

  unique(path: string, values: string[]): void {
    if (new Set(values).size !== values.length) this.issues.push(`${path}: trùng khoá`);
  }
}

// Tên tệp/khoá đối tượng an toàn: không tách thư mục, không '..', không ký tự điều khiển.
export function isSafeObjectKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= 255 &&
    !key.includes("/") &&
    !key.includes("\\") &&
    !key.includes("..") &&
    !/[\u0000-\u001f]/.test(key)
  );
}

function readArtifact(r: Reader, item: unknown, path: string): ArtifactFact {
  const o = r.obj(path, item, ["role", "path", "size", "sha256"]);
  const artifactPath = r.str(`${path}.path`, o.path, undefined, 255);
  if (artifactPath && !isSafeObjectKey(artifactPath)) r.issues.push(`${path}.path: không an toàn`);
  return {
    role: r.str(`${path}.role`, o.role, IDENT),
    path: artifactPath,
    size: r.int(`${path}.size`, o.size),
    sha256: r.str(`${path}.sha256`, o.sha256, HEX64),
  };
}

function readKeyReference(r: Reader, value: unknown): KeyReference | null {
  if (value === null) return null;
  const o = r.obj("$.encryptionKeyReference", value, ["provider", "keyId", "keyVersion"]);
  const keyId = r.str("$.encryptionKeyReference.keyId", o.keyId, /^[A-Za-z0-9._:/+-]{1,256}$/);
  if (keyId && (RAW_HEX_KEY.test(keyId) || RAW_BASE64_KEY.test(keyId))) {
    r.issues.push("$.encryptionKeyReference.keyId: trông như key thô, chỉ được ghi tham chiếu");
  }
  return {
    provider: r.str("$.encryptionKeyReference.provider", o.provider, /^[A-Za-z0-9._-]{1,64}$/),
    keyId,
    keyVersion: r.nullableStr(
      "$.encryptionKeyReference.keyVersion",
      o.keyVersion,
      /^[A-Za-z0-9._:-]{1,64}$/,
    ),
  };
}

function readWal(r: Reader, value: unknown): WalCoverage | null {
  if (value === null) return null;
  const o = r.obj("$.wal", value, [
    "timeline",
    "startLsn",
    "endLsn",
    "windowStart",
    "windowEnd",
    "missingSegments",
  ]);
  return {
    timeline: r.int("$.wal.timeline", o.timeline, 1),
    startLsn: r.str("$.wal.startLsn", o.startLsn, LSN),
    endLsn: r.str("$.wal.endLsn", o.endLsn, LSN),
    windowStart: r.iso("$.wal.windowStart", o.windowStart),
    windowEnd: r.iso("$.wal.windowEnd", o.windowEnd),
    missingSegments: r.int("$.wal.missingSegments", o.missingSegments),
  };
}

function readMeasurements(r: Reader, value: unknown): RecoveryMeasurements | null {
  if (value === null) return null;
  const o = r.obj("$.measurements", value, [
    "measuredAt",
    "workload",
    "sourceResolution",
    "rpoSeconds",
    "rtoSeconds",
    "recoveryTargetLsn",
    "timeline",
  ]);
  return {
    measuredAt: r.iso("$.measurements.measuredAt", o.measuredAt),
    workload: r.str("$.measurements.workload", o.workload, /\S/, 500),
    sourceResolution: r.str("$.measurements.sourceResolution", o.sourceResolution, /\S/, 200),
    rpoSeconds: r.nullableSeconds("$.measurements.rpoSeconds", o.rpoSeconds),
    rtoSeconds: r.nullableSeconds("$.measurements.rtoSeconds", o.rtoSeconds),
    recoveryTargetLsn: r.nullableStr("$.measurements.recoveryTargetLsn", o.recoveryTargetLsn, LSN),
    timeline: r.nullableInt("$.measurements.timeline", o.timeline, 1),
  };
}

const V1_KEYS = [
  "formatVersion",
  "recoverySetId",
  "source",
  "startedAt",
  "completedAt",
  "postgres",
  "appSha",
  "baseBackupId",
  "snapshot",
  "wal",
  "digestAlgorithm",
  "migrations",
  "tables",
  "financeTotals",
  "schemaObjects",
  "audit",
  "attachments",
  "artifacts",
  "encryptionKeyReference",
  "measurements",
] as const;

function readV1(raw: unknown): RecoveryManifestV1 {
  const r = new Reader();
  const o = r.obj("$", raw, V1_KEYS);
  const source = r.obj("$.source", o.source, ["identityHash", "serverVersionNum"]);
  const postgres = r.obj("$.postgres", o.postgres, ["serverMajor", "tools"]);
  const tools = r.obj("$.postgres.tools", postgres.tools, Object.keys(postgres.tools ?? {}));
  for (const name of Object.keys(tools)) {
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) r.issues.push("$.postgres.tools: tên công cụ sai");
  }
  const snapshot = r.obj("$.snapshot", o.snapshot, ["capturedAt", "walLsn", "timeline"]);
  const schemaObjects = r.obj("$.schemaObjects", o.schemaObjects, ["count", "digest"]);
  const audit = r.obj("$.audit", o.audit, ["totalRows", "hashedRows", "maxId", "lastRowHash"]);

  const manifest: RecoveryManifestV1 = {
    formatVersion: RECOVERY_MANIFEST_FORMAT,
    recoverySetId: r.str("$.recoverySetId", o.recoverySetId, SET_ID),
    source: {
      identityHash: r.str("$.source.identityHash", source.identityHash, /^[0-9a-f]{16,64}$/),
      serverVersionNum: r.str("$.source.serverVersionNum", source.serverVersionNum, /^\d{5,6}$/),
    },
    startedAt: r.iso("$.startedAt", o.startedAt),
    completedAt: r.iso("$.completedAt", o.completedAt),
    postgres: {
      serverMajor: r.int("$.postgres.serverMajor", postgres.serverMajor, 10),
      tools: Object.fromEntries(
        Object.entries(tools).map(([name, version]) => [
          name,
          r.str("$.postgres.tools[]", version, /\S/, 200),
        ]),
      ),
    },
    appSha: r.nullableStr("$.appSha", o.appSha, /^[0-9a-f]{7,64}$/),
    baseBackupId: r.nullableStr("$.baseBackupId", o.baseBackupId, /^[A-Za-z0-9._:-]{1,128}$/),
    snapshot: {
      capturedAt: r.iso("$.snapshot.capturedAt", snapshot.capturedAt),
      walLsn: r.nullableStr("$.snapshot.walLsn", snapshot.walLsn, LSN),
      timeline: r.nullableInt("$.snapshot.timeline", snapshot.timeline, 1),
    },
    wal: readWal(r, o.wal),
    digestAlgorithm: DIGEST_ALGORITHM,
    migrations: r.list("$.migrations", o.migrations, (item, path) => {
      const m = r.obj(path, item, ["name", "sha256"]);
      return {
        name: r.str(`${path}.name`, m.name, /^[A-Za-z0-9._-]{1,200}\.sql$/),
        sha256: r.str(`${path}.sha256`, m.sha256, HEX64),
      };
    }),
    tables: r.list("$.tables", o.tables, (item, path) => {
      const t = r.obj(path, item, ["table", "rowCount", "digest"]);
      return {
        table: r.str(`${path}.table`, t.table, IDENT),
        rowCount: r.str(`${path}.rowCount`, t.rowCount, DIGITS, 30),
        digest: r.str(`${path}.digest`, t.digest, HEX64),
      };
    }),
    financeTotals: r.list("$.financeTotals", o.financeTotals, (item, path) => {
      const f = r.obj(path, item, ["key", "rowCount", "sum"]);
      // typeof number bị từ chối ở str(): tiền phải là chuỗi thập phân exact, không float.
      return {
        key: r.str(`${path}.key`, f.key, /^[a-z_]+\.[a-z_]+$/, 100),
        rowCount: r.str(`${path}.rowCount`, f.rowCount, DIGITS, 30),
        sum: r.str(`${path}.sum`, f.sum, DECIMAL, 60),
      };
    }),
    schemaObjects: {
      count: r.str("$.schemaObjects.count", schemaObjects.count, DIGITS, 30),
      digest: r.str("$.schemaObjects.digest", schemaObjects.digest, HEX64),
    },
    audit: {
      totalRows: r.str("$.audit.totalRows", audit.totalRows, DIGITS, 30),
      hashedRows: r.str("$.audit.hashedRows", audit.hashedRows, DIGITS, 30),
      maxId: r.nullableStr("$.audit.maxId", audit.maxId, DIGITS),
      lastRowHash: r.nullableStr("$.audit.lastRowHash", audit.lastRowHash, HEX64),
    },
    attachments: r.list("$.attachments", o.attachments, (item, path) => {
      const a = r.obj(path, item, ["table", "key", "version", "size", "sha256"]);
      const key = r.str(`${path}.key`, a.key, undefined, 255);
      if (key && !isSafeObjectKey(key)) r.issues.push(`${path}.key: không an toàn`);
      return {
        table: r.str(`${path}.table`, a.table, IDENT),
        key,
        version: r.nullableStr(`${path}.version`, a.version, /^[A-Za-z0-9._:+=-]{1,256}$/),
        size: r.int(`${path}.size`, a.size),
        sha256: r.str(`${path}.sha256`, a.sha256, HEX64),
      };
    }),
    artifacts: r.list("$.artifacts", o.artifacts, (item, path) => readArtifact(r, item, path)),
    encryptionKeyReference: readKeyReference(r, o.encryptionKeyReference),
    measurements: readMeasurements(r, o.measurements),
  };
  if (o.formatVersion !== RECOVERY_MANIFEST_FORMAT) r.issues.push("$.formatVersion: sai");
  if (o.digestAlgorithm !== DIGEST_ALGORITHM) r.issues.push("$.digestAlgorithm: không hỗ trợ");
  if (Date.parse(manifest.completedAt) < Date.parse(manifest.startedAt)) {
    r.issues.push("$.completedAt: trước startedAt");
  }
  r.unique(
    "$.migrations",
    manifest.migrations.map((m) => m.name),
  );
  r.unique(
    "$.tables",
    manifest.tables.map((t) => t.table),
  );
  r.unique(
    "$.financeTotals",
    manifest.financeTotals.map((f) => f.key),
  );
  r.unique(
    "$.attachments",
    manifest.attachments.map((a) => `${a.table}/${a.key}`),
  );
  if (r.issues.length) throw new ManifestError(r.issues);
  return manifest;
}

// Manifest cũ của backup.sh: chỉ xác nhận phần nó có (id + artifact), không suy diễn thêm.
function readLegacy(raw: Record<string, unknown>): ManifestRead {
  const r = new Reader();
  const recoverySetId = r.str("$.recoverySetId", raw.recoverySetId, SET_ID);
  const artifacts = r.list("$.artifacts", raw.artifacts, (item, path) => {
    const o = r.obj(path, item, ["role", "path", "status", "size", "sha256"]);
    if (o.status !== "PRESENT") r.issues.push(`${path}.status: không PRESENT`);
    return readArtifact(r, { role: o.role, path: o.path, size: o.size, sha256: o.sha256 }, path);
  });
  if (raw.status !== "COMPLETE") r.issues.push("$.status: recovery set không COMPLETE");
  if (r.issues.length) throw new ManifestError(r.issues);
  return { kind: "legacy", recoverySetId, artifacts };
}

/** Đọc + kiểm manifest. Ném ManifestError (chỉ đường dẫn trường) khi sai/nghi chứa secret. */
export function parseRecoveryManifest(raw: unknown): ManifestRead {
  const secretFields = findSecretLikeFields(raw);
  if (secretFields.length) {
    throw new ManifestError(
      secretFields.map((path) => `${path}: nghi chứa secret/URI có mật khẩu — từ chối`),
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ManifestError(["$: phải là object JSON"]);
  }
  const record = raw as Record<string, unknown>;
  if (record.formatVersion === undefined && record.schemaVersion === 1) return readLegacy(record);
  return { kind: "v1", manifest: readV1(raw) };
}
