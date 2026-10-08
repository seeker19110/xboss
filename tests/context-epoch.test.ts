import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// QUALITY-FINAL-1 S05 (A2-FR03) — đồng bộ đổi ngữ cảnh giữa các tab: thông điệp chỉ mang epoch/
// lý do (không PII), tab phát không tự khoá mình, mỗi epoch xử lý một lần, kênh dự phòng storage,
// đóng mọi SSE/poll đã đăng ký, phát hiện đổi actor qua binding mờ.
//
// BroadcastChannel là API thật của Node (cùng ngữ nghĩa trình duyệt: instance khác cùng tên nhận
// được). localStorage/window được thay bằng bản giả tối thiểu để kiểm đường dự phòng `storage`.

const kho = new Map<string, string>();
const ngheStorage = new Set<(ev: { key: string; newValue: string | null }) => void>();
const goc = {
  localStorage: globalThis.localStorage,
  window: (globalThis as { window?: unknown }).window,
};

before(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => kho.get(k) ?? null,
      setItem: (k: string, v: string) => void kho.set(k, String(v)),
      removeItem: (k: string) => void kho.delete(k),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (t: string, fn: never) => t === "storage" && ngheStorage.add(fn),
      removeEventListener: (t: string, fn: never) => t === "storage" && ngheStorage.delete(fn),
    },
  });
});
after(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: goc.localStorage,
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: goc.window });
});

const cho = () => new Promise((r) => setTimeout(r, 30));

test("docThongDiepNguCanh: chỉ nhận đúng {t,e,r}, không trường lạ/PII", async () => {
  const { docThongDiepNguCanh } = await import("@/app/lib/contextEpoch");
  assert.deepEqual(docThongDiepNguCanh({ t: "ctx", e: "abcdef12-3", r: "switch" }), {
    t: "ctx",
    e: "abcdef12-3",
    r: "switch",
  });
  for (const x of [
    null,
    "ctx",
    [],
    { t: "ctx", e: "abcdef12", r: "khac" },
    { t: "ctx", e: "ngan", r: "switch" },
    { t: "ctx", e: "abcdef12", r: "switch", userId: 7 },
    { t: "x", e: "abcdef12", r: "switch" },
  ])
    assert.equal(docThongDiepNguCanh(x), null, JSON.stringify(x));
});

test("tab khác phát → nhận đúng 1 lần/epoch; thông điệp hỏng bị bỏ; tab phát không tự nhận", async () => {
  const { ngheDoiNguCanh, phatDoiNguCanh } = await import("@/app/lib/contextEpoch");
  const nhan: string[] = [];
  const huy = ngheDoiNguCanh((m) => nhan.push(`${m.r}:${m.e}`));
  const tabKhac = new BroadcastChannel("xboss-context");
  try {
    tabKhac.postMessage({ t: "ctx", e: "epoch-0001", r: "switch" });
    tabKhac.postMessage({ t: "ctx", e: "epoch-0001", r: "switch" });
    tabKhac.postMessage({ t: "ctx", e: "epoch-0002", r: "logout", user: "a@b" });
    await cho();
    assert.deepEqual(nhan, ["switch:epoch-0001"]);
    // Chính tab này phát → không tự khoá mình (kể cả khi nghe được qua kênh/storage).
    phatDoiNguCanh("actor");
    await cho();
    for (const fn of ngheStorage)
      fn({ key: "xboss_ctx_epoch", newValue: kho.get("xboss_ctx_epoch") ?? null });
    assert.deepEqual(nhan, ["switch:epoch-0001"]);
    const daLuu = JSON.parse(kho.get("xboss_ctx_epoch") as string);
    assert.deepEqual(Object.keys(daLuu).sort(), ["e", "r", "t"], "storage chỉ mang epoch/lý do");
    // Dự phòng storage (không BroadcastChannel): epoch mới từ tab khác vẫn tới.
    for (const fn of ngheStorage)
      fn({
        key: "xboss_ctx_epoch",
        newValue: JSON.stringify({ t: "ctx", e: "epoch-0003", r: "logout" }),
      });
    assert.deepEqual(nhan, ["switch:epoch-0001", "logout:epoch-0003"]);
  } finally {
    huy();
    tabKhac.close();
  }
  assert.equal(ngheStorage.size, 0, "huỷ đăng ký gỡ listener storage");
});

test("dongMoiKetNoiSong đóng mọi SSE/poll đã đăng ký (lỗi 1 cái không chặn cái khác); gỡ đăng ký thì không đóng", async () => {
  const { dangKyKetNoiSong, dongMoiKetNoiSong } = await import("@/app/lib/contextEpoch");
  const dong: string[] = [];
  dangKyKetNoiSong(() => dong.push("sse"));
  dangKyKetNoiSong(() => {
    throw new Error("hỏng");
  });
  dangKyKetNoiSong(() => dong.push("poll"));
  const go = dangKyKetNoiSong(() => dong.push("da-go"));
  go();
  dongMoiKetNoiSong();
  assert.deepEqual(dong.sort(), ["poll", "sse"]);
  dongMoiKetNoiSong();
  assert.equal(dong.length, 2, "đã đóng thì không đóng lại");
});

test("ghiNhanRangBuoc: lần đầu không báo; cùng binding không báo; binding khác (đổi actor/SSO) báo; sai dạng bỏ qua", async () => {
  const { ghiNhanRangBuoc } = await import("@/app/lib/contextEpoch");
  kho.delete("xboss_ctx_binding");
  const a = "a".repeat(32);
  const b = "b".repeat(32);
  assert.equal(ghiNhanRangBuoc(a), false);
  assert.equal(ghiNhanRangBuoc(a), false);
  assert.equal(ghiNhanRangBuoc(b), true);
  assert.equal(ghiNhanRangBuoc("khong-hop-le"), false);
  assert.equal(ghiNhanRangBuoc(undefined), false);
  assert.equal(kho.get("xboss_ctx_binding"), b);
});
