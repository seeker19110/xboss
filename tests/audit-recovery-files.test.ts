import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseRecoveryFileManifest,
  recoveryExitCode,
  verifyRecoveryFiles,
  type RecoveryFileManifest,
} from "../scripts/verify-recovery-files";

function manifest(): RecoveryFileManifest {
  return {
    specVersion: "QUALITY-FINAL-1",
    recoverySetId: "fixture-20260925",
    appSHA: "1".repeat(40),
    files: [
      {
        kind: "base_backup",
        path: "base.bin",
        sizeBytes: 4,
        sha256: createHash("sha256").update("data").digest("hex"),
      },
      {
        kind: "attachment",
        path: "object.bin",
        sizeBytes: 4,
        sha256: createHash("sha256").update("data").digest("hex"),
      },
    ],
    keyReferences: ["vault/key/version-1"],
  };
}

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "xboss-recovery-"));
  try {
    await writeFile(join(root, "base.bin"), "data");
    await writeFile(join(root, "object.bin"), "data");
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("S14: checksum đúng chỉ xác nhận file, không giả PITR/RPO/RTO đã PASS", async () => {
  await fixture(async (root) => {
    const results = await verifyRecoveryFiles(manifest(), root);
    assert.equal(
      results.filter((r) => r.name.startsWith("file_") && r.status === "PASS").length,
      2,
    );
    assert.equal(results.find((r) => r.name === "rpo_5_minutes")?.status, "NOT_RUN");
    assert.equal(results.find((r) => r.name === "encryption_key_access")?.status, "NOT_RUN");
    assert.equal(recoveryExitCode(results), 2);
  });
});

test("S14: hỏng checksum hoặc size ở bất kỳ file nào đều FAIL", async () => {
  await fixture(async (root) => {
    await writeFile(join(root, "object.bin"), "evil");
    let results = await verifyRecoveryFiles(manifest(), root);
    assert.equal(results.find((r) => r.name === "file_1")?.reason, "sha256_mismatch");
    assert.equal(recoveryExitCode(results), 1);
    await writeFile(join(root, "object.bin"), "longer");
    results = await verifyRecoveryFiles(manifest(), root);
    assert.equal(results.find((r) => r.name === "file_1")?.reason, "size_mismatch");
  });
});

test("S14: thiếu file không bị coi là mảng rỗng hợp lệ", async () => {
  await fixture(async (root) => {
    await rm(join(root, "object.bin"));
    const results = await verifyRecoveryFiles(manifest(), root);
    assert.equal(results.find((r) => r.name === "file_1")?.status, "FAIL");
    assert.equal(recoveryExitCode(results), 1);
  });
});

for (const path of [
  "../secret",
  "/etc/passwd",
  "a/../../b",
  "a\\b",
  "C:/secret",
  "a//b",
  "./a",
  "a\0b",
]) {
  test(`S14: từ chối đường dẫn ngoài contract ${JSON.stringify(path)}`, () => {
    const value = manifest();
    value.files[0].path = path;
    assert.throws(() => parseRecoveryFileManifest(value), /manifest_file_invalid/);
  });
}

test("S14: chặn symlink trong staging, không đọc mục tiêu bên ngoài", async () => {
  await fixture(async (root) => {
    await rm(join(root, "object.bin"));
    await symlink(join(root, "base.bin"), join(root, "object.bin"));
    const results = await verifyRecoveryFiles(manifest(), root);
    assert.equal(results.find((r) => r.name === "file_1")?.reason, "symlink_rejected");
  });
});

test("S14: không nhận manifest rỗng, trùng path, raw key hoặc số byte không an toàn", () => {
  assert.throws(() => parseRecoveryFileManifest(null));
  assert.throws(() => parseRecoveryFileManifest({ ...manifest(), files: [] }));
  assert.throws(() => parseRecoveryFileManifest({ ...manifest(), rawKey: "not-a-key" }));
  const value = manifest();
  value.files.push(value.files[0]);
  assert.throws(() => parseRecoveryFileManifest(value), /manifest_duplicate_path/);
  value.files = [manifest().files[0]];
  value.files[0].sizeBytes = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => parseRecoveryFileManifest(value), /manifest_file_invalid/);
});

test("S14: output lỗi không lộ dữ liệu input/đường dẫn/secret", async () => {
  const results = await verifyRecoveryFiles(
    { privateKey: "sensitive-fixture-value" },
    "/secret-fixture-path",
  );
  assert.equal(recoveryExitCode(results), 1);
  assert.ok(!JSON.stringify(results).includes("sensitive-fixture-value"));
  assert.ok(!JSON.stringify(results).includes("secret-fixture-path"));
  assert.equal(recoveryExitCode([]), 2);
  assert.equal(recoveryExitCode([{ name: "test", status: "PASS", reason: "fixture" }]), 0);
});
