// Logic THUẦN của hàng đợi offline v2 (QUALITY-FINAL-1 S07): gói thân op, dedup chỉ trên op chưa
// từng gửi, FIFO theo tài nguyên, phân loại kết quả server thành trạng thái bền (A2-FR06/FR10),
// header cố định (Idempotency-Key/X-XBoss-Context/If-Match). Map AC: A2-AC03, A2-AC06, A2-AC10.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  backoffMs,
  BACKOFF_MAX_MS,
  chonOpGuiDuoc,
  chonOpThay,
  computeStats,
  docRetryAfter,
  dongGoiThanOp,
  dungYeuCau,
  moGoiThanOp,
  opEndpoint,
  phanLoaiKetQua,
  taiNguyenCuaOp,
  type ChuSoHuu,
  type OpBody,
  type QueueRecord,
  type QueueState,
} from "@/app/components/offlineQueue/logic";

const CHU: ChuSoHuu = {
  ownerUserId: 7,
  orgId: 1,
  projectId: 3,
  deviceId: "11111111-1111-4111-8111-111111111111",
};
let seq = 0;
function rec(p: Partial<QueueRecord> = {}): QueueRecord {
  seq++;
  return {
    schemaVersion: 2,
    operationId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    vaultKeyId: "22222222-2222-4222-8222-222222222222",
    ownerUserId: CHU.ownerUserId,
    orgId: CHU.orgId,
    projectId: CHU.projectId,
    deviceId: CHU.deviceId,
    sequence: seq,
    queuedAt: 0,
    tries: 0,
    nextAttemptAt: 0,
    state: "pending",
    iv: "",
    ciphertext: "",
    owner: `${CHU.ownerUserId}|${CHU.orgId}|${CHU.deviceId}`,
    kind: "tick",
    bytes: 0,
    ...p,
  };
}
const tick = (dimId: number, installed = true): OpBody => ({
  kind: "tick",
  payload: { dimId, installed },
});
const lo = (dimIds: number[], installed = true): OpBody => ({
  kind: "tick_batch",
  payload: { dimIds, installed },
});
const nhatKy = (date: string, baseVersion: string | null = null): OpBody => ({
  kind: "diary_note",
  baseVersion,
  payload: {
    date,
    weatherAm: "nắng",
    weatherPm: null,
    workDone: "đổ bê tông",
    obstacles: null,
    safetyNote: null,
    manpower: [{ crew: "Tổ A", headcount: 5, note: null }],
    photoIds: [9],
  },
});

test("gói thân op: 4 loại đi-về nguyên vẹn, ảnh giữ đúng byte; thân hỏng/sai loại bị từ chối", async () => {
  for (const b of [
    tick(5, false),
    lo([1, 2, 3]),
    nhatKy("2026-10-08", '"4-2"'),
    nhatKy("2026-10-09"),
  ]) {
    const ve = moGoiThanOp(b.kind, await dongGoiThanOp(b));
    assert.deepEqual(ve, b);
  }
  const anh = new Uint8Array([1, 2, 3, 250, 0, 7]);
  const photo: OpBody = {
    kind: "photo",
    payload: {
      taskId: 4,
      caption: "chú thích",
      mime: "image/jpeg",
      size: 6,
      blob: new Blob([anh]),
    },
  };
  const goi = await dongGoiThanOp(photo);
  const ve = moGoiThanOp("photo", goi);
  assert.equal(ve.kind, "photo");
  if (ve.kind === "photo") {
    assert.deepEqual(new Uint8Array(await ve.payload.blob.arrayBuffer()), anh);
    assert.equal(ve.payload.caption, "chú thích");
  }
  assert.throws(() => moGoiThanOp("tick", goi), /hỏng/, "loại trong AAD khác loại trong thân");
  assert.throws(() => moGoiThanOp("photo", goi.slice(0, goi.length - 1)), /hỏng/);
  assert.throws(() => moGoiThanOp("tick", new Uint8Array([0, 0, 0, 99, 1])), /hỏng/);
});

test("dedup: chỉ thay op CHƯA từng gửi; op đã gửi/không rõ ACK/conflict giữ nguyên (A2-FR06)", () => {
  const chuaGui = { rec: rec(), body: tick(5) };
  const daThu = { rec: rec({ tries: 1 }), body: tick(5) };
  const dangGui = { rec: rec({ state: "sending", tries: 1 }), body: tick(5) };
  const xungDot = { rec: rec({ state: "conflict", tries: 1 }), body: tick(5) };
  const khacO = { rec: rec(), body: tick(6) };
  assert.deepEqual(chonOpThay(tick(5, false), [chuaGui, daThu, dangGui, xungDot, khacO]), [
    chuaGui.rec.operationId,
  ]);
});

test("dedup lô: nuốt tick lẻ trong lô + lô trùng hoàn toàn; GIỮ lô trùng một phần (A2-AC03)", () => {
  const le = { rec: rec(), body: tick(2) };
  const loDu = { rec: rec({ kind: "tick_batch" }), body: lo([3, 2, 1]) };
  const loMotPhan = { rec: rec({ kind: "tick_batch" }), body: lo([3, 4]) };
  const loMotO = { rec: rec({ kind: "tick_batch" }), body: lo([9]) };
  assert.deepEqual(
    chonOpThay(lo([1, 2, 3]), [le, loDu, loMotPhan, loMotO]).sort(),
    [le.rec.operationId, loDu.rec.operationId].sort(),
  );
  // Tick lẻ sau lô 1 ô: thao tác sau thắng.
  assert.deepEqual(chonOpThay(tick(9), [loMotO, loMotPhan]), [loMotO.rec.operationId]);
});

test("dedup nhật ký theo ngày; ảnh không bao giờ bị dedup", () => {
  const a = { rec: rec({ kind: "diary_note" }), body: nhatKy("2026-10-08") };
  const b = { rec: rec({ kind: "diary_note" }), body: nhatKy("2026-10-09") };
  assert.deepEqual(chonOpThay(nhatKy("2026-10-08"), [a, b]), [a.rec.operationId]);
  const anh: OpBody = {
    kind: "photo",
    payload: { taskId: 1, caption: "", mime: "image/jpeg", size: 1, blob: new Blob(["x"]) },
  };
  assert.deepEqual(chonOpThay(anh, [a, b]), []);
});

test("FIFO theo tài nguyên: conflict/chờ retry/đang gửi chặn op sau CÙNG tài nguyên, không chặn tài nguyên khác", () => {
  const now = 1000;
  const items = (states: [QueueState, number[], number?][]) =>
    states.map(([state, dims, next]) => ({
      rec: rec({ state, nextAttemptAt: next ?? 0 }),
      taiNguyen: dims.map((d) => `dim:${d}`),
    }));
  // conflict trên ô 1 chặn op sau ô 1 lẫn lô chứa ô 1, nhưng ô 2 được gửi.
  const a = items([
    ["conflict", [1]],
    ["pending", [1]],
    ["pending", [1, 5]],
    ["pending", [2]],
  ]);
  assert.equal(chonOpGuiDuoc(a, now), a[3].rec);
  // Lô bị chặn kéo theo ô 5 cũng bị chặn cho op sau (giữ thứ tự sau lô).
  const b = items([
    ["paused_auth", [1]],
    ["pending", [1, 5]],
    ["pending", [5]],
  ]);
  assert.equal(chonOpGuiDuoc(b, now), null);
  // Op chờ backoff chặn op sau cùng tài nguyên.
  const c = items([
    ["pending", [1], now + 5000],
    ["pending", [1]],
  ]);
  assert.equal(chonOpGuiDuoc(c, now), null);
  // rejected là kết thúc phía server → không chặn; op khoá (không có tài nguyên) bỏ qua.
  const d = items([
    ["rejected", [1]],
    ["pending", [1]],
  ]);
  assert.equal(chonOpGuiDuoc(d, now), d[1].rec);
  const khoa = { rec: rec(), taiNguyen: null };
  const sau = { rec: rec(), taiNguyen: ["dim:1"] };
  assert.equal(chonOpGuiDuoc([khoa, sau], now), sau.rec);
  // Thứ tự theo sequence, không theo vị trí mảng.
  const x = items([
    ["pending", [1]],
    ["pending", [1]],
  ]);
  assert.equal(chonOpGuiDuoc([x[1], x[0]], now), x[0].rec);
});

test("tài nguyên: ảnh độc lập theo operationId; nhật ký theo ngày", () => {
  const anh: OpBody = {
    kind: "photo",
    payload: { taskId: 1, caption: "", mime: "image/jpeg", size: 1, blob: new Blob(["x"]) },
  };
  assert.deepEqual(taiNguyenCuaOp("op-a", anh), ["photo:op-a"]);
  assert.deepEqual(taiNguyenCuaOp("x", nhatKy("2026-01-02")), ["diary:2026-01-02"]);
  assert.deepEqual(taiNguyenCuaOp("x", lo([4, 2])), ["dim:4", "dim:2"]);
});

test("phân loại kết quả → trạng thái bền (A2-FR10, A2-AC06)", () => {
  const r = { operationId: "op-1", tries: 1 };
  const now = 1_000_000;
  const loai = (o: Parameters<typeof phanLoaiKetQua>[1]) => phanLoaiKetQua(r, o, now, 0.5).loai;
  assert.equal(loai({ status: 200, receiptOperationId: "op-1" }), "xong");
  assert.equal(loai({ status: 200 }), "conflict", "2xx thiếu receipt KHÔNG được xoá op");
  assert.equal(loai({ status: 200, receiptOperationId: "op-2" }), "conflict");
  assert.equal(loai({ status: 401 }), "paused_auth");
  assert.equal(loai({ status: 409, code: "context_expired" }), "context");
  for (const s of [409, 412, 428]) assert.equal(loai({ status: s }), "conflict", `HTTP ${s}`);
  assert.equal(loai({ status: 409, code: "idempotency_conflict" }), "conflict");
  for (const s of [400, 403, 404, 413, 422])
    assert.equal(loai({ status: s }), "rejected", `HTTP ${s}`);
  for (const s of [408, 500, 502, 504]) assert.equal(loai({ status: s }), "retry", `HTTP ${s}`);
  assert.equal(loai({ networkError: true }), "retry");
  const q = phanLoaiKetQua(r, { status: 429, retryAfter: "120" }, now, 0.5);
  assert.deepEqual(q, { loai: "retry", nextAttemptAt: now + 120_000 });
  const ngay = new Date(now + 3_600_000).toUTCString();
  const q2 = phanLoaiKetQua(r, { status: 429, retryAfter: ngay }, now, 0.5);
  assert.equal(q2.loai === "retry" && q2.nextAttemptAt, Date.parse(ngay));
});

test("backoff luỹ thừa có jitter, trần 5 phút; Retry-After sai định dạng → null", () => {
  assert.equal(backoffMs(0, 0.3), 0);
  for (let t = 1; t < 40; t++) {
    const lo0 = backoffMs(t, 0);
    const hi = backoffMs(t, 0.999999);
    assert.ok(lo0 <= hi && hi <= BACKOFF_MAX_MS, `tries=${t}`);
    assert.ok(lo0 >= Math.min(BACKOFF_MAX_MS, 2000 * 2 ** (t - 1)) / 2 - 1);
  }
  assert.ok(backoffMs(3, 0.5) > backoffMs(2, 0.5));
  assert.equal(backoffMs(30, 0.999999) <= BACKOFF_MAX_MS, true);
  assert.equal(docRetryAfter("abc", 0), null);
  assert.equal(docRetryAfter(null, 0), null);
  assert.equal(docRetryAfter(" 5 ", 10), 5010);
});

test("request: Idempotency-Key = operationId, X-XBoss-Context, precondition nhật ký từ baseVersion lúc enqueue", async () => {
  const r = rec({ kind: "diary_note" });
  const coBan = dungYeuCau(r, nhatKy("2026-10-08", '"12-4"'), "ctx-1");
  assert.equal(coBan.url, "/api/diaries/2026-10-08");
  assert.equal(coBan.method, "PUT");
  assert.equal(coBan.headers["Idempotency-Key"], r.operationId);
  assert.equal(coBan.headers["X-XBoss-Context"], "ctx-1");
  assert.equal(coBan.headers["If-Match"], '"12-4"');
  assert.equal(coBan.headers["If-None-Match"], undefined);
  const body = JSON.parse(String(coBan.body));
  assert.equal(body.date, undefined, "ngày nằm trên URL, body PUT full-replace");
  assert.equal(body.workDone, "đổ bê tông");
  const moi = dungYeuCau(r, nhatKy("2026-10-08", null), "ctx-1");
  assert.equal(moi.headers["If-None-Match"], "*");
  assert.equal(moi.headers["If-Match"], undefined);

  const t = dungYeuCau(rec(), lo([3, 4], false), "ctx-2");
  assert.deepEqual(JSON.parse(String(t.body)), { ids: [3, 4], installed: false });
  assert.equal(t.url, "/api/dimensions/batch");
  const anh = dungYeuCau(
    rec({ kind: "photo" }),
    {
      kind: "photo",
      payload: { taskId: 8, caption: "c", mime: "image/jpeg", size: 1, blob: new Blob(["x"]) },
    },
    "ctx-3",
  );
  assert.ok(anh.body instanceof FormData);
  const file = (anh.body as FormData).get("file") as File;
  assert.equal(file.name, "offline-8.jpg", "tên file cố định → hash receipt không đổi khi thử lại");
  assert.equal(anh.headers["Content-Type"], undefined, "multipart để fetch tự đặt boundary");
  assert.deepEqual(opEndpoint(tick(5)), { url: "/api/dimensions/5", method: "PATCH" });
});

test("thống kê: chỉ op của chính chủ; khác dự án/khoá chưa mở là locked; conflict/rejected/paused tính vào cần chú ý", () => {
  const ops = [
    rec(),
    rec({ tries: 2 }),
    rec({ state: "conflict" }),
    rec({ state: "rejected" }),
    rec({ state: "paused_auth" }),
    rec({ projectId: 99 }),
    rec({ vaultKeyId: "33333333-3333-4333-8333-333333333333" }),
    rec({ ownerUserId: 8, owner: `8|1|${CHU.deviceId}` }),
  ];
  const st = computeStats(ops, CHU, (k) => k === "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(st, {
    total: 7,
    pending: 1,
    failed: 4,
    conflict: 1,
    rejected: 1,
    pausedAuth: 1,
    locked: 2,
  });
});
