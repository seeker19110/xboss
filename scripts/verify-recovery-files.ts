// S14 nhỏ: kiểm file recovery tại staging chỉ đọc; KHÔNG thực hiện restore hoặc mở DB.
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type RecoveryFile = {
  kind: "base_backup" | "wal" | "attachment" | "migration";
  path: string;
  sizeBytes: number;
  sha256: string;
};

export type RecoveryFileManifest = {
  specVersion: "QUALITY-FINAL-1";
  recoverySetId: string;
  appSHA: string;
  files: RecoveryFile[];
  keyReferences: string[];
};

export type RecoveryCheck = {
  name: string;
  status: "PASS" | "FAIL" | "NOT_RUN";
  reason: string;
};

function objectWithKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key)) &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function validRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\\:]/.test(value) &&
    !Array.from(value).some((character) => character.charCodeAt(0) < 32) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
  );
}

/** Shape hẹp cho phần file; không nhận raw key/credential hoặc metadata tự do. */
export function parseRecoveryFileManifest(value: unknown): RecoveryFileManifest {
  const keys = ["specVersion", "recoverySetId", "appSHA", "files", "keyReferences"];
  if (!objectWithKeys(value, keys)) throw new Error("manifest_shape_invalid");
  if (
    value.specVersion !== "QUALITY-FINAL-1" ||
    typeof value.recoverySetId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(value.recoverySetId) ||
    typeof value.appSHA !== "string" ||
    !/^[a-f0-9]{40}$/.test(value.appSHA) ||
    !Array.isArray(value.files) ||
    value.files.length === 0 ||
    value.files.length > 100_000 ||
    !Array.isArray(value.keyReferences) ||
    value.keyReferences.length > 1000
  ) {
    throw new Error("manifest_fields_invalid");
  }
  const seen = new Set<string>();
  const kinds = new Set(["base_backup", "wal", "attachment", "migration"]);
  for (const file of value.files) {
    if (
      !objectWithKeys(file, ["kind", "path", "sizeBytes", "sha256"]) ||
      typeof file.kind !== "string" ||
      !kinds.has(file.kind) ||
      !validRelativePath(file.path) ||
      typeof file.sizeBytes !== "number" ||
      !Number.isSafeInteger(file.sizeBytes) ||
      file.sizeBytes < 0 ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error("manifest_file_invalid");
    }
    if (seen.has(file.path)) throw new Error("manifest_duplicate_path");
    seen.add(file.path);
  }
  for (const reference of value.keyReferences) {
    if (typeof reference !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(reference)) {
      throw new Error("manifest_key_reference_invalid");
    }
  }
  if (new Set(value.keyReferences).size !== value.keyReferences.length) {
    throw new Error("manifest_duplicate_key_reference");
  }
  return value as unknown as RecoveryFileManifest;
}

const NOT_IMPLEMENTED = [
  "target_identity",
  "database_consistency",
  "audit_chain_and_coverage",
  "exact_finance_totals",
  "encryption_key_access",
  "wal_replay_and_timeline",
  "rpo_5_minutes",
  "rto_60_minutes",
  "pitr_window_35_days",
];

async function verifyOne(root: string, file: RecoveryFile): Promise<string | null> {
  let path = root;
  for (const part of file.path.split("/")) {
    path = join(path, part);
    if ((await lstat(path)).isSymbolicLink()) return "symlink_rejected";
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile()) return "not_regular_file";
    if (before.size !== file.sizeBytes) return "size_mismatch";
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    const after = await handle.stat();
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      return "file_changed_during_read";
    }
    return hash.digest("hex") === file.sha256 ? null : "sha256_mismatch";
  } finally {
    await handle.close();
  }
}

/** Input là staging immutable; mọi file khai trong manifest đều bắt buộc, không chỉ file đầu. */
export async function verifyRecoveryFiles(
  input: unknown,
  stagingRoot: string,
): Promise<RecoveryCheck[]> {
  const checks: RecoveryCheck[] = [];
  try {
    const manifest = parseRecoveryFileManifest(input);
    const root = await realpath(stagingRoot);
    if (!(await lstat(root)).isDirectory()) throw new Error("staging_not_directory");
    checks.push({ name: "manifest_schema", status: "PASS", reason: "file_manifest_valid" });
    for (const [index, file] of manifest.files.entries()) {
      let reason: string | null;
      try {
        reason = await verifyOne(root, file);
      } catch {
        // Không in path, URI, nội dung file hoặc exception chứa thông tin hạ tầng.
        reason = "file_unreadable";
      }
      checks.push({
        name: `file_${index}`,
        status: reason ? "FAIL" : "PASS",
        reason: reason ?? "sha256_and_size_match",
      });
    }
  } catch {
    checks.push({ name: "manifest_schema", status: "FAIL", reason: "invalid_manifest_or_staging" });
  }
  for (const name of NOT_IMPLEMENTED) {
    checks.push({ name, status: "NOT_RUN", reason: "requires_isolated_restore_evidence" });
  }
  return checks;
}

/** Incomplete không được trở thành PASS do mọi file đã có checksum đúng. */
export function recoveryExitCode(checks: readonly RecoveryCheck[]): 0 | 1 | 2 {
  if (checks.some((check) => check.status === "FAIL")) return 1;
  if (checks.length === 0 || checks.some((check) => check.status !== "PASS")) return 2;
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const main = async () => {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== "--manifest" || args[2] !== "--root") {
      throw new Error("recovery_usage");
    }
    const stat = await lstat(args[1]);
    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error("manifest_size_invalid");
    const manifest: unknown = JSON.parse(await readFile(args[1], "utf8"));
    const checks = await verifyRecoveryFiles(manifest, args[3]);
    const exitCode = recoveryExitCode(checks);
    console.log(JSON.stringify({ specVersion: "QUALITY-FINAL-1", checks, exitCode }, null, 2));
    process.exitCode = exitCode;
  };
  main().catch(() => {
    console.error(
      "Không đọc được manifest; dùng --manifest FILE --root STAGING, không truyền secret.",
    );
    process.exitCode = 1;
  });
}
