import { test } from "node:test";
import assert from "node:assert/strict";
import {
  locNhomTheoTask,
  taskKhopLoc,
  nhomTuMoTheoLoc,
  TASK_FILTER_OPTIONS,
} from "@/app/tracking/[sheet]/locTask";

// Test thuần logic, không chạm DB — không cần import tests/setup.ts.

test("taskKhopLoc: rỗng khớp mọi trạng thái", () => {
  assert.equal(taskKhopLoc("tre", ""), true);
  assert.equal(taskKhopLoc("hoan_thanh", ""), true);
});

test("taskKhopLoc: chỉ khớp đúng trạng thái được chọn", () => {
  assert.equal(taskKhopLoc("tre", "tre"), true);
  assert.equal(taskKhopLoc("dang_thi_cong", "tre"), false);
});

test("locNhomTheoTask: không lọc → giữ nguyên danh sách nhóm", () => {
  const packages = [
    { id: 1, tasks: [{ status: "chuan_bi" }] },
    { id: 2, tasks: [] },
  ];
  assert.deepEqual(locNhomTheoTask(packages, ""), packages);
});

test("locNhomTheoTask: chỉ giữ nhóm có ít nhất 1 task khớp trạng thái", () => {
  const packages = [
    { id: 1, tasks: [{ status: "tre" }, { status: "hoan_thanh" }] },
    { id: 2, tasks: [{ status: "dang_thi_cong" }] },
    { id: 3, tasks: [] },
  ];
  const kq = locNhomTheoTask(packages, "tre");
  assert.deepEqual(
    kq.map((p) => p.id),
    [1],
  );
});

test("locNhomTheoTask: nhóm rỗng (không có task) luôn bị loại khi đang lọc", () => {
  const packages = [{ id: 1, tasks: [] }];
  assert.deepEqual(locNhomTheoTask(packages, "tre"), []);
});

test("nhomTuMoTheoLoc: không lọc → không mở nhóm nào, không bỏ qua nhóm nào", () => {
  const packages = [{ id: 1, tasks: [{ status: "tre" }] }];
  assert.deepEqual(nhomTuMoTheoLoc(packages, "", {}), { moThem: [], boQua: 0 });
});

test("nhomTuMoTheoLoc: số nhóm khớp ít hơn trần → mở hết, không bỏ qua", () => {
  const packages = [
    { id: 1, tasks: [{ status: "tre" }] },
    { id: 2, tasks: [{ status: "tre" }] },
    { id: 3, tasks: [{ status: "hoan_thanh" }] },
  ];
  const kq = nhomTuMoTheoLoc(packages, "tre", {}, 5);
  assert.deepEqual(kq, { moThem: [1, 2], boQua: 0 });
});

test("nhomTuMoTheoLoc: số nhóm khớp nhiều hơn trần → chỉ mở đủ trần, đúng thứ tự, phần dư bị bỏ qua", () => {
  const packages = [
    { id: 1, tasks: [{ status: "tre" }] },
    { id: 2, tasks: [{ status: "tre" }] },
    { id: 3, tasks: [{ status: "tre" }] },
  ];
  const kq = nhomTuMoTheoLoc(packages, "tre", {}, 2);
  assert.deepEqual(kq, { moThem: [1, 2], boQua: 1 });
});

test("nhomTuMoTheoLoc: nhóm khớp đã mở sẵn được tính vào trần", () => {
  const packages = [
    { id: 1, tasks: [{ status: "tre" }] },
    { id: 2, tasks: [{ status: "tre" }] },
    { id: 3, tasks: [{ status: "tre" }] },
  ];
  const kq = nhomTuMoTheoLoc(packages, "tre", { 1: true }, 2);
  assert.deepEqual(kq, { moThem: [2], boQua: 1 });
});

test("nhomTuMoTheoLoc: nhóm không có task khớp không bao giờ được mở", () => {
  const packages = [
    { id: 1, tasks: [{ status: "hoan_thanh" }] },
    { id: 2, tasks: [] },
  ];
  const kq = nhomTuMoTheoLoc(packages, "tre", {}, 5);
  assert.deepEqual(kq, { moThem: [], boQua: 0 });
});

test("nhomTuMoTheoLoc: trần = 0 → không mở nhóm nào, bỏ qua toàn bộ nhóm khớp đang gập", () => {
  const packages = [
    { id: 1, tasks: [{ status: "tre" }] },
    { id: 2, tasks: [{ status: "tre" }] },
  ];
  const kq = nhomTuMoTheoLoc(packages, "tre", {}, 0);
  assert.deepEqual(kq, { moThem: [], boQua: 2 });
});

test("TASK_FILTER_OPTIONS: đủ 6 lựa chọn đúng thứ tự spec", () => {
  assert.deepEqual(
    TASK_FILTER_OPTIONS.map((o) => o.value),
    ["", "tre", "chuan_bi", "dang_thi_cong", "hoan_thanh", "nghiem_thu"],
  );
});
