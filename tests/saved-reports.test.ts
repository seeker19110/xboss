import "./setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, listSourcesFor, getSource } from "@/lib/reports";

test("validateConfig: nguồn ngoài whitelist bị từ chối", () => {
  assert.throws(() => validateConfig("__khong_ton_tai__", {}), /không hợp lệ/);
});

test("validateConfig: config không phải object bị từ chối", () => {
  assert.throws(() => validateConfig("late_tasks", "abc"), /đối tượng/);
  assert.throws(() => validateConfig("late_tasks", [1, 2]), /đối tượng/);
});

test("validateConfig: trường lạ ngoài filters/sort bị từ chối", () => {
  assert.throws(() => validateConfig("late_tasks", { groupBy: "x" }), /không hợp lệ/);
});

test("validateConfig: filter key lạ bị từ chối, filter rỗng bị bỏ", () => {
  assert.throws(() => validateConfig("late_tasks", { filters: { badkey: "x" } }), /Bộ lọc/);
  // Filter rỗng → chuẩn hoá bỏ hẳn, không còn khoá filters.
  assert.deepEqual(validateConfig("late_tasks", { filters: { system: "" } }), {});
  assert.deepEqual(validateConfig("late_tasks", { filters: { system: "ACMV" } }), {
    filters: { system: "ACMV" },
  });
});

test("validateConfig: filter select chỉ nhận giá trị trong options", () => {
  assert.throws(
    () => validateConfig("materials", { filters: { status: "sai_gia_tri" } }),
    /không hợp lệ/,
  );
  assert.deepEqual(validateConfig("materials", { filters: { status: "ve_kho" } }), {
    filters: { status: "ve_kho" },
  });
});

test("validateConfig: sort phải là cột hợp lệ + chiều asc/desc", () => {
  assert.throws(
    () => validateConfig("late_tasks", { sort: { column: "khong_co" } }),
    /Cột sắp xếp/,
  );
  assert.throws(
    () => validateConfig("late_tasks", { sort: { column: "code", dir: "xyz" } }),
    /asc\/desc/,
  );
  assert.deepEqual(validateConfig("late_tasks", { sort: { column: "endDate", dir: "desc" } }), {
    sort: { column: "endDate", dir: "desc" },
  });
});

test("listSourcesFor: nguồn tiền chỉ hiện với vai trò xem tài chính", () => {
  const pmKeys = listSourcesFor("pm").map((s) => s.key);
  const engKeys = listSourcesFor("engineer").map((s) => s.key);
  assert.ok(pmKeys.includes("cost_by_month"), "PM thấy chi phí theo tháng");
  assert.ok(!engKeys.includes("cost_by_month"), "kỹ sư không thấy chi phí theo tháng");
  assert.ok(engKeys.includes("late_tasks"), "kỹ sư vẫn thấy công việc trễ");
});

test("getSource: nguồn tồn tại có cột, nguồn lạ trả null", () => {
  assert.equal(getSource("__lạ__"), null);
  const src = getSource("progress_by_system");
  assert.ok(src && src.columns.length > 0);
});
