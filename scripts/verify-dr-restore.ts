// Kiểm bản khôi phục trên đích cách ly theo recovery manifest v1 (A6-FR05/FR07, S14).
// Không tự restore, không áp migration, không DDL; mọi truy vấn trong 1 transaction
// REPEATABLE READ READ ONLY rồi ROLLBACK, trên connection riêng (không qua lib/db).
//
// Secret chỉ qua biến môi trường (không qua tham số CLI):
//   DR_VERIFY_DATABASE_URL       — role audit trên đích (BYPASSRLS + pg_read_all_data; nên không
//                                  superuser — superuser vẫn được coi là bypass RLS khi đo quyền đọc)
//   DR_VERIFY_EXPECTED_DATABASE  — tên DB đích kỳ vọng
//   DR_VERIFY_EXPECTED_USER      — role kỳ vọng
//   DR_VERIFY_EXPECTED_MARKER    — COMMENT ON DATABASE 'xboss-disposable:<token>' của đích
//   DR_VERIFY_MARKER_DATABASE    — (tuỳ chọn) DB mang marker, mặc định chính DB đích
//   DR_VERIFY_APP_ROLE           — (tuỳ chọn) role ứng dụng trên đích, mặc định xboss_app; hạng mục
//                                  app-role-rls FAIL nếu thiếu role / BYPASSRLS / superuser / sở hữu
//                                  bảng RLS / bảng tài chính không bật + FORCE RLS
// Cờ:
//   --manifest <tệp>        recovery manifest v1 (hoặc manifest cũ của backup.sh)
//   --attachments-dir <dir> thư mục tệp đính kèm đã khôi phục (băm từng tệp critical)
//   --artifacts-dir <dir>   thư mục chứa artifact backup để băm lại
//   --evidence-out <tệp>    ghi thêm JSON kết quả ra tệp mới (không ghi đè)
//   --app-sha <sha>         app SHA đang khôi phục (mặc định: git rev-parse HEAD)
// Mã thoát ≠ 0 khi BẤT KỲ hạng mục bắt buộc nào FAIL hoặc NOT_RUN.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import {
  checkSourceDistinct,
  readDrTarget,
  runDrChecks,
  summarizeDrChecks,
  type DrCheck,
} from "./lib/dr-readonly";
import { directoryHasher, readRepoMigrations } from "./lib/dr-files";
import {
  ManifestError,
  RECOVERY_MANIFEST_FORMAT,
  parseRecoveryManifest,
  type ManifestRead,
} from "./lib/recovery-manifest";

const FLAGS = [
  "--manifest",
  "--attachments-dir",
  "--artifacts-dir",
  "--evidence-out",
  "--app-sha",
] as const;
type Flag = (typeof FLAGS)[number];

function parseArgs(argv: string[]): Partial<Record<Flag, string>> {
  const args: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i] as Flag;
    const value = argv[i + 1];
    if (!FLAGS.includes(flag) || !value || value.startsWith("--") || args[flag]) {
      throw new Error(`Cờ không hợp lệ. Chỉ nhận: ${FLAGS.join(", ")} (mỗi cờ 1 lần, có giá trị).`);
    }
    args[flag] = value;
  }
  return args;
}

function currentAppSha(explicit: string | undefined): string | null {
  if (explicit) return /^[0-9a-f]{7,64}$/.test(explicit) ? explicit : null;
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const sha = git.status === 0 ? git.stdout.trim() : "";
  return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}

function emit(report: Record<string, unknown>, evidenceOut: string | undefined): void {
  const json = JSON.stringify(report, null, 2);
  console.log(json);
  // "wx": không ghi đè bằng chứng của lần chạy trước (A6-AC06 giữ evidence lần thất bại).
  if (evidenceOut) writeFileSync(evidenceOut, `${json}\n`, { flag: "wx", mode: 0o600 });
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const args = parseArgs(process.argv.slice(2));
  const target = readDrTarget(process.env);

  let manifest: ManifestRead | null = null;
  if (args["--manifest"]) {
    try {
      manifest = parseRecoveryManifest(JSON.parse(readFileSync(args["--manifest"], "utf8")));
    } catch (error) {
      // Chỉ in đường dẫn trường lỗi, không in nội dung manifest (có thể chứa secret bị nhét nhầm).
      const issues = error instanceof ManifestError ? error.issues : ["không đọc được JSON"];
      console.error(`Manifest bị từ chối: ${issues.slice(0, 10).join("; ")}`);
      process.exitCode = 1;
      return;
    }
  }
  const appSha = currentAppSha(args["--app-sha"]);
  const v1 = manifest?.kind === "v1" ? manifest.manifest : null;
  const header = {
    kind: "dr-verify",
    specVersion: "QUALITY-FINAL-1/A6",
    formatVersion: v1 ? RECOVERY_MANIFEST_FORMAT : manifest ? "legacy-schemaVersion-1" : null,
    recoverySetId:
      v1?.recoverySetId ?? (manifest?.kind === "legacy" ? manifest.recoverySetId : null),
    appSha,
    environment: "isolated-restore-target",
    startedAt,
    note: "Kết quả trên đích cách ly/fixture — chưa phải bằng chứng PITR thật, RPO/RTO production hay nghiệm thu phát hành.",
  };

  // Chặn trước khi mở kết nối: đích trùng nguồn của recovery set.
  const sourceCheck = checkSourceDistinct(target, manifest);
  if (sourceCheck.status === "FAIL") {
    const results: DrCheck[] = [sourceCheck];
    emit(
      { ...header, completedAt: new Date().toISOString(), ...summarizeDrChecks(results), results },
      args["--evidence-out"],
    );
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 10_000,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=1800000 -c timezone=Asia/Ho_Chi_Minh",
  });
  try {
    await client.connect();
    const results: DrCheck[] = [
      sourceCheck,
      ...(await runDrChecks(client, target, {
        migrations: readRepoMigrations(),
        manifest,
        appSha,
        attachments: args["--attachments-dir"] ? directoryHasher(args["--attachments-dir"]) : null,
        artifacts: args["--artifacts-dir"] ? directoryHasher(args["--artifacts-dir"]) : null,
      })),
    ];
    const summary = summarizeDrChecks(results);
    emit(
      { ...header, completedAt: new Date().toISOString(), ...summary, results },
      args["--evidence-out"],
    );
    process.exitCode = summary.completeDrVerified ? 0 : 1;
  } finally {
    await client.end();
  }
}

main().catch(() => {
  console.error(
    "Kiểm DR thất bại. Kiểm tra đích cách ly, cấu hình, quyền đọc và schema; không tự migrate.",
  );
  process.exitCode = 1;
});
