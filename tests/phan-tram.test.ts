import { test } from "node:test";
import assert from "node:assert/strict";
import { phanTramTienDo } from "@/lib/nen/phan-tram";

test("phanTramTienDo: làm tròn xuống — 99,6% chưa phải 100%", () => {
  assert.equal(phanTramTienDo(0.996, true), 99);
  assert.equal(phanTramTienDo(1, true), 100);
  assert.equal(phanTramTienDo(0.29, true), 29); // 0.29*100 = 28.999… trên float
  assert.equal(phanTramTienDo(0, true), 0);
});

test("phanTramTienDo: không có việc hợp lệ → null (không phải 0%)", () => {
  assert.equal(phanTramTienDo(0, false), null);
  assert.equal(phanTramTienDo(null, true), null);
  assert.equal(phanTramTienDo(undefined, false), null);
});
