import { test } from "node:test";
import assert from "node:assert/strict";
import { floorOrder, sortFloorsAsc, sortFloorsDesc } from "@/lib/floors";

test("floorOrder: hầm âm theo độ sâu, tầng số theo giá trị, RF cao nhất", () => {
  assert.equal(floorOrder("B1F"), -1);
  assert.equal(floorOrder("B2F"), -2);
  assert.equal(floorOrder("1F"), 1);
  assert.equal(floorOrder("23F"), 23);
  assert.equal(floorOrder("RF"), 9999);
});

test("sortFloorsAsc: đúng thứ tự vật lý B1F → 1F → 2F → … → RF", () => {
  const floors = ["RF", "3F", "B1F", "1F", "2F", "B2F"];
  assert.deepEqual([...floors].sort(sortFloorsAsc), ["B2F", "B1F", "1F", "2F", "3F", "RF"]);
});

test("sortFloorsDesc: ngược lại sortFloorsAsc", () => {
  const floors = ["RF", "3F", "B1F", "1F", "2F", "B2F"];
  assert.deepEqual([...floors].sort(sortFloorsDesc), ["RF", "3F", "2F", "1F", "B1F", "B2F"]);
});
