import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  aadBocKhoa,
  aadPayload,
  base64urlDecode,
  base64urlEncode,
  bocDek,
  danXuatKek,
  docKeyringKek,
  giaiMaPayload,
  maHoaPayload,
  moDek,
  nhapDekBoNho,
  OfflineCryptoError,
  OfflineKekConfigError,
  taoDek,
  WRAPPED_KEY_BYTES,
  type PayloadAadFields,
  type WrapAadFields,
} from "@/lib/nen/offline-crypto";
import {
  bamManifest,
  chuanHoaManifest,
  chuoiManifest,
  docManifestDaLuu,
  MAX_MANIFEST_TASKS,
} from "@/lib/nen/offline-manifest";

// QUALITY-FINAL-1 S05 — phần THUẦN của vault offline (DATA-MIGRATIONS §2/§5, Q-AC02):
// keyring KEK (thiếu → tắt, sai → fail-fast, cấm trùng XBOSS_SECRET), bọc/mở DEK với AAD,
// envelope payload AES-GCM cho S07, manifest chuẩn + hash.

const S1 = "s".repeat(40);
const S2 = "t".repeat(40);
const XS = "x".repeat(40);

const AAD_BOC: WrapAadFields = {
  keyId: randomUUID(),
  manifestHash: "a".repeat(64),
  userId: 7,
  orgId: 1,
  projectId: 3,
  deviceId: randomUUID(),
  keyVersion: 1,
  kekVersion: "v1",
};

const loiAuth = (e: unknown) => e instanceof OfflineCryptoError && e.code === "auth";

test("keyring: thiếu → null (tính năng tắt); mục đầu là bản đang dùng", () => {
  assert.equal(docKeyringKek(undefined, XS), null);
  assert.equal(docKeyringKek("   ", XS), null);
  const k = docKeyringKek(`v2:${S2}, v1:${S1}`, XS);
  assert.ok(k);
  assert.equal(k.active, "v2");
  assert.deepEqual([...k.secrets.keys()], ["v2", "v1"]);
});

test("keyring: sai định dạng/ngắn/lặp/trùng XBOSS_SECRET → fail-fast, thông điệp không mang secret", () => {
  for (const raw of [
    "khong-co-hai-cham",
    `:${S1}`,
    `v 1:${S1}`,
    "v1:ngan",
    `v1:${S1},v1:${S2}`,
    `v1:${S1},v2:${S1}`,
    `v1:${XS}`,
  ]) {
    assert.throws(
      () => docKeyringKek(raw, XS),
      (e: unknown) =>
        e instanceof OfflineKekConfigError &&
        !e.message.includes(S1) &&
        !e.message.includes(XS) &&
        !e.message.includes(S2),
      raw,
    );
  }
});

test("keyring: KEK giá trị TEST của e2e bị từ chối trừ khi có cờ tường minh (XBOSS_E2E=1)", () => {
  // Đúng giá trị mặc định trong e2e/constants.ts (công khai trong repo — không phải bí mật).
  const kekE2E = "e2e1:e2e-offline-kek-khong-bi-mat-du-32-ky-tu";
  for (const raw of [kekE2E, `v2:${S1},${kekE2E}`, `v2:${S1},v1:xx-e2e-offline-kek-${S2}`])
    assert.throws(
      () => docKeyringKek(raw, XS),
      (e: unknown) => e instanceof OfflineKekConfigError && !e.message.includes("e2e-offline"),
      raw,
    );
  assert.throws(() => docKeyringKek(kekE2E, XS, { choPhepKekE2E: false }), OfflineKekConfigError);
  const k = docKeyringKek(kekE2E, XS, { choPhepKekE2E: true });
  assert.equal(k?.active, "e2e1");
});

test("bọc/mở DEK: khứ hồi đúng; wrapped không chứa DEK; mỗi lần bọc IV khác nhau", async () => {
  const kek = await danXuatKek(S1, "v1");
  const dek = taoDek();
  const aad = aadBocKhoa(AAD_BOC);
  const w1 = await bocDek(dek, kek, aad);
  const w2 = await bocDek(dek, kek, aad);
  assert.equal(w1.length, WRAPPED_KEY_BYTES);
  assert.notDeepEqual(w1, w2, "IV phải ngẫu nhiên mỗi lần");
  assert.ok(!Buffer.from(w1).includes(Buffer.from(dek)), "wrapped_key không được chứa DEK thô");
  assert.deepEqual(await moDek(w1, kek, aad), dek);
});

test("Q-AC02: sửa AAD (manifest/owner/thiết bị/version) hoặc ciphertext hoặc KEK → mở thất bại", async () => {
  const kek = await danXuatKek(S1, "v1");
  const dek = taoDek();
  const w = await bocDek(dek, kek, aadBocKhoa(AAD_BOC));
  const bienThe: Partial<WrapAadFields>[] = [
    { manifestHash: "b".repeat(64) },
    { userId: 8 },
    { orgId: 2 },
    { projectId: 4 },
    { deviceId: randomUUID() },
    { keyVersion: 2 },
    { kekVersion: "v2" },
    { keyId: randomUUID() },
  ];
  for (const b of bienThe)
    await assert.rejects(
      moDek(w, kek, aadBocKhoa({ ...AAD_BOC, ...b })),
      loiAuth,
      JSON.stringify(b),
    );
  const hong = new Uint8Array(w);
  hong[20] ^= 1;
  await assert.rejects(moDek(hong, kek, aadBocKhoa(AAD_BOC)), loiAuth);
  await assert.rejects(moDek(w, await danXuatKek(S2, "v1"), aadBocKhoa(AAD_BOC)), loiAuth);
  await assert.rejects(moDek(w, await danXuatKek(S1, "v2"), aadBocKhoa(AAD_BOC)), loiAuth);
  await assert.rejects(
    moDek(w.subarray(1), kek, aadBocKhoa(AAD_BOC)),
    (e: unknown) => e instanceof OfflineCryptoError && e.code === "format",
  );
});

test("AAD từ chối giá trị có thể chèn dấu phân cách hoặc sai kiểu", () => {
  assert.throws(() => aadBocKhoa({ ...AAD_BOC, kekVersion: "v1|x" }), OfflineCryptoError);
  assert.throws(() => aadBocKhoa({ ...AAD_BOC, userId: 0 }), OfflineCryptoError);
  assert.throws(() => aadBocKhoa({ ...AAD_BOC, deviceId: "abc" }), OfflineCryptoError);
});

test("payload (S07): khứ hồi; sửa AAD owner/kind/sequence/operation hoặc ciphertext → thất bại", async () => {
  const key = await nhapDekBoNho(taoDek());
  const f: PayloadAadFields = {
    keyId: AAD_BOC.keyId,
    manifestHash: AAD_BOC.manifestHash,
    ownerUserId: 7,
    orgId: 1,
    projectId: 3,
    deviceId: AAD_BOC.deviceId,
    keyVersion: 1,
    operationId: randomUUID(),
    kind: "tick",
    sequence: 1,
  };
  const pt = new TextEncoder().encode(JSON.stringify({ dimensionId: 5, installed: true }));
  const env = await maHoaPayload(key, pt, aadPayload(f));
  assert.deepEqual(await giaiMaPayload(key, env, aadPayload(f)), pt);
  const env2 = await maHoaPayload(key, pt, aadPayload(f));
  assert.notEqual(env.iv, env2.iv);
  for (const b of [
    { ownerUserId: 8 },
    { kind: "photo" as const },
    { sequence: 2 },
    { operationId: randomUUID() },
    { projectId: 9 },
  ])
    await assert.rejects(giaiMaPayload(key, env, aadPayload({ ...f, ...b })), loiAuth);
  const ct = base64urlDecode(env.ciphertext, 1 << 20);
  ct[0] ^= 1;
  await assert.rejects(
    giaiMaPayload(key, { iv: env.iv, ciphertext: base64urlEncode(ct) }, aadPayload(f)),
    loiAuth,
  );
  await assert.rejects(
    giaiMaPayload(key, { iv: "!!", ciphertext: env.ciphertext }, aadPayload(f)),
    OfflineCryptoError,
  );
  // Khoá nhập vào là KHÔNG xuất được (memory-only).
  assert.equal(key.extractable, false);
});

test("manifest: chuẩn hoá sắp xếp/khử trùng, hash ổn định; từ chối đầu vào sai", async () => {
  const a = chuanHoaManifest({ tasks: [5, "3", 5], taskActions: ["tick", "photo"] }, 9);
  const b = chuanHoaManifest({ taskActions: ["photo", "tick", "tick"], tasks: [3, 5] }, 9);
  assert.ok(a.ok && b.ok);
  assert.deepEqual(a.manifest, {
    v: 1,
    projectId: 9,
    tasks: [3, 5],
    taskActions: ["photo", "tick"],
    diary: null,
  });
  assert.equal(await bamManifest(a.manifest), await bamManifest(b.manifest));
  assert.match(await bamManifest(a.manifest), /^[0-9a-f]{64}$/);

  const sai: unknown[] = [
    null,
    [],
    {},
    { tasks: [1] },
    { taskActions: ["tick"] },
    { tasks: [1.5], taskActions: ["tick"] },
    { tasks: ["01"], taskActions: ["tick"] },
    { tasks: [1], taskActions: ["delete"] },
    { tasks: [1], taskActions: ["tick"], projectId: 2 },
    { diary: { from: "2026-02-30", to: "2026-03-01" } },
    { diary: { from: "2026-03-10", to: "2026-03-01" } },
    { diary: { from: "2026-01-01", to: "2026-02-01" } },
    {
      tasks: Array.from({ length: MAX_MANIFEST_TASKS + 1 }, (_, i) => i + 1),
      taskActions: ["tick"],
    },
  ];
  for (const s of sai) assert.equal(chuanHoaManifest(s, 9).ok, false, JSON.stringify(s));
  const d = chuanHoaManifest({ diary: { from: "2026-03-01", to: "2026-03-31" } }, 9);
  assert.ok(d.ok);
});

test("manifest đã lưu: nhận dạng chuẩn (kể cả jsonb đảo khoá), từ chối bản bị sửa/khác dự án", () => {
  const kq = chuanHoaManifest(
    { tasks: [2, 1], taskActions: ["tick"], diary: { from: "2026-03-01", to: "2026-03-02" } },
    4,
  );
  assert.ok(kq.ok);
  const goc = JSON.parse(chuoiManifest(kq.manifest));
  // jsonb lưu khoá theo thứ tự riêng — vẫn phải đọc được.
  const daoKhoa = {
    diary: { to: "2026-03-02", from: "2026-03-01" },
    tasks: [1, 2],
    v: 1,
    taskActions: ["tick"],
    projectId: 4,
  };
  assert.deepEqual(docManifestDaLuu(goc, 4), kq.manifest);
  assert.deepEqual(docManifestDaLuu(daoKhoa, 4), kq.manifest);
  assert.equal(docManifestDaLuu(goc, 5), null, "khác dự án");
  assert.equal(docManifestDaLuu({ ...goc, tasks: [2, 1] }, 4), null, "không chuẩn (chưa sắp xếp)");
  // Bản mở rộng nhưng vẫn chuẩn ([1,2,3]) đọc được — bị chặn bởi so manifest_hash + AAD ở dịch vụ.
  assert.equal(docManifestDaLuu({ ...goc, extra: 1 }, 4), null, "khoá lạ");
  assert.equal(docManifestDaLuu({ ...goc, v: 2 }, 4), null);
});
