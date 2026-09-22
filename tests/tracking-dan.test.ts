import { test } from "node:test";
import assert from "node:assert/strict";
import { doiOSangTick, dungLoTuDan } from "@/app/tracking/[sheet]/dan";
import { MAX_O_MOI_LO } from "@/app/tracking/[sheet]/tick";
import type { Grid } from "@/app/tracking/[sheet]/types";

// Test thuần logic, không chạm DB — không cần import tests/setup.ts.

test("doiOSangTick: nhận diện các dạng ô đã tick", () => {
  assert.equal(doiOSangTick("x"), true);
  assert.equal(doiOSangTick("X"), true);
  assert.equal(doiOSangTick("1"), true);
  assert.equal(doiOSangTick("true"), true);
});

test("doiOSangTick: nhận diện các dạng ô chưa tick", () => {
  assert.equal(doiOSangTick(""), false);
  assert.equal(doiOSangTick("0"), false);
  assert.equal(doiOSangTick("○"), false);
  assert.equal(doiOSangTick("o"), false);
  assert.equal(doiOSangTick("false"), false);
});

test("doiOSangTick: giá trị lạ trả null (bỏ qua)", () => {
  assert.equal(doiOSangTick("?"), null);
  assert.equal(doiOSangTick("abc"), null);
});

// Lưới giả 3 hàng × 3 cột, mỗi ô có id = r*10 + c để dễ đối chiếu.
function luoiGia(): Grid {
  const cols = ["A", "B", "C"];
  const tasks = [0, 1, 2].map((r) => ({
    id: r,
    code: `T${r}`,
    name: `Task ${r}`,
    status: "dang_thi_cong",
    progressPercent: 0,
    boqCode: null,
    drawingUrl: null,
    photoCount: 0,
    commentCount: 0,
    delayReason: null,
    startDate: null,
    endDate: null,
    custom: {},
    cells: Object.fromEntries(cols.map((c, ci) => [c, { id: r * 10 + ci, installed: false }])),
  }));
  return { columns: cols, tasks };
}

test("dungLoTuDan: dán ma trận 2x3 vào vùng 1 ô → 6 ô đổi", () => {
  const grid = luoiGia();
  const matrix = [
    ["x", "x", "x"],
    ["", "", "x"],
  ];
  const kq = dungLoTuDan(matrix, { r0: 0, c0: 0, r1: 0, c1: 0 }, grid);
  assert.ok(!("loi" in kq));
  if ("loi" in kq) return;
  assert.equal(kq.tick.length + kq.boTick.length, 6);
  assert.equal(kq.boQua, 0);
  // Hàng 0: A,B,C đều tick (id 0,1,2); hàng 1: A,B bỏ tick (10,11), C tick (12).
  assert.deepEqual(
    kq.tick.sort((a, b) => a - b),
    [0, 1, 2, 12],
  );
  assert.deepEqual(
    kq.boTick.sort((a, b) => a - b),
    [10, 11],
  );
});

test("dungLoTuDan: ô giá trị lạ bị bỏ qua, tính vào boQua", () => {
  const grid = luoiGia();
  const matrix = [["x", "?", ""]];
  const kq = dungLoTuDan(matrix, { r0: 0, c0: 0, r1: 0, c1: 0 }, grid);
  assert.ok(!("loi" in kq));
  if ("loi" in kq) return;
  assert.deepEqual(kq.tick, [0]);
  assert.deepEqual(kq.boTick, [2]);
  assert.equal(kq.boQua, 1);
});

test("dungLoTuDan: ma trận vượt biên cột/hàng bị cắt âm thầm", () => {
  const grid = luoiGia(); // 3 hàng x 3 cột
  const matrix = [
    ["x", "x", "x", "x"], // cột thứ 4 vượt biên
    ["x", "x", "x", "x"],
    ["x", "x", "x", "x"],
    ["x", "x", "x", "x"], // hàng thứ 4 vượt biên
  ];
  const kq = dungLoTuDan(matrix, { r0: 0, c0: 0, r1: 0, c1: 0 }, grid);
  assert.ok(!("loi" in kq));
  if ("loi" in kq) return;
  // Chỉ 3x3 = 9 ô nằm trong lưới được áp dụng, phần dư bị cắt.
  assert.equal(kq.tick.length, 9);
  assert.equal(kq.boQua, 0);
});

test("dungLoTuDan: vượt MAX_O_MOI_LO → lỗi rõ", () => {
  const cols = ["A"];
  const tasks = Array.from({ length: MAX_O_MOI_LO + 1 }, (_, r) => ({
    id: r,
    code: `T${r}`,
    name: `Task ${r}`,
    status: "dang_thi_cong",
    progressPercent: 0,
    boqCode: null,
    drawingUrl: null,
    photoCount: 0,
    commentCount: 0,
    delayReason: null,
    startDate: null,
    endDate: null,
    custom: {},
    cells: { A: { id: r, installed: false } },
  }));
  const grid: Grid = { columns: cols, tasks };
  const matrix = Array.from({ length: MAX_O_MOI_LO + 1 }, () => ["x"]);
  const kq = dungLoTuDan(matrix, { r0: 0, c0: 0, r1: 0, c1: 0 }, grid);
  assert.ok("loi" in kq);
  if (!("loi" in kq)) return;
  assert.match(kq.loi, new RegExp(`${MAX_O_MOI_LO}`));
});

test("dungLoTuDan: vượt trần dừng NGAY ở ô thứ MAX+1, không duyệt hết ma trận", () => {
  // Lưới/ma trận dư MAX_O_MOI_LO + 5 ô — nếu hàm duyệt hết rồi mới báo lỗi, thông báo sẽ nêu
  // MAX_O_MOI_LO + 5. Fail-fast đúng nghĩa phải dừng và báo NGAY tại MAX_O_MOI_LO + 1.
  const soHang = MAX_O_MOI_LO + 5;
  const cols = ["A"];
  const tasks = Array.from({ length: soHang }, (_, r) => ({
    id: r,
    code: `T${r}`,
    name: `Task ${r}`,
    status: "dang_thi_cong",
    progressPercent: 0,
    boqCode: null,
    drawingUrl: null,
    photoCount: 0,
    commentCount: 0,
    delayReason: null,
    startDate: null,
    endDate: null,
    custom: {},
    cells: { A: { id: r, installed: false } },
  }));
  const grid: Grid = { columns: cols, tasks };
  const matrix = Array.from({ length: soHang }, () => ["x"]);
  const kq = dungLoTuDan(matrix, { r0: 0, c0: 0, r1: 0, c1: 0 }, grid);
  assert.ok("loi" in kq);
  if (!("loi" in kq)) return;
  assert.match(kq.loi, new RegExp(`đang có ${MAX_O_MOI_LO + 1}\\b`));
});
