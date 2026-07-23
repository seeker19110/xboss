// Test lớp lưu trữ (lib/storage.ts) ở BACKEND LOCAL — môi trường test không có S3 env nên
// storage tự rơi về local disk data/uploads/. Không chạm DB nên không cần tests/setup.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { storagePut, storageGet, storageDelete, __resetStorageBackendCache } from "@/lib/storage";

// Đảm bảo chạy trên backend LOCAL: xoá mọi S3 env + reset cache backend.
for (const k of [
  "S3_ENDPOINT",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_BUCKET",
  "S3_REGION",
  "S3_FORCE_PATH_STYLE",
]) {
  delete process.env[k];
}
__resetStorageBackendCache();

const ORG = 1;
const uniqueName = () => `__test-storage-${Date.now()}-${randomBytes(4).toString("hex")}.bin`;

test("storagePut/storageGet round-trip: đọc lại đúng nội dung đã ghi", async () => {
  const name = uniqueName();
  const data = randomBytes(1024);
  try {
    await storagePut(ORG, name, data);
    const back = await storageGet(ORG, name);
    assert.ok(back, "phải đọc lại được buffer");
    assert.ok(back!.equals(data), "nội dung đọc lại phải khớp");
  } finally {
    await storageDelete(ORG, name);
  }
});

test("storageDelete: xoá xong storageGet trả null", async () => {
  const name = uniqueName();
  await storagePut(ORG, name, randomBytes(64));
  await storageDelete(ORG, name);
  assert.equal(await storageGet(ORG, name), null);
});

test("storageDelete: file không tồn tại không ném lỗi (idempotent)", async () => {
  await assert.doesNotReject(storageDelete(ORG, uniqueName()));
});

test("storageGet: file không tồn tại trả null", async () => {
  assert.equal(await storageGet(ORG, uniqueName()), null);
});

test("path traversal: tên file chứa '/', '..' hoặc '\\' bị chặn ở cả 3 hàm", async () => {
  const bad = ["../evil.bin", "a/b.bin", "..", "sub\\evil.bin", "x\0y.bin", ""];
  for (const name of bad) {
    await assert.rejects(
      storagePut(ORG, name, Buffer.from("x")),
      /không hợp lệ|thoát khỏi/,
      `storagePut phải chặn: ${JSON.stringify(name)}`,
    );
    await assert.rejects(
      storageGet(ORG, name),
      /không hợp lệ|thoát khỏi/,
      `storageGet phải chặn: ${JSON.stringify(name)}`,
    );
    await assert.rejects(
      storageDelete(ORG, name),
      /không hợp lệ|thoát khỏi/,
      `storageDelete phải chặn: ${JSON.stringify(name)}`,
    );
  }
});
