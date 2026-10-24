import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorkFrontIndex } from "@/lib/hien-truong/work-front-index";

test("index mặt bằng: mảng rỗng không sinh ô", () => {
  const index = buildWorkFrontIndex([]);
  assert.equal(index.size, 0);
  assert.equal(index.get("1F"), undefined);
});

test("index mặt bằng: không nhập nhằng các cặp tầng/công tác có cùng chuỗi nối", () => {
  const first = { floorLabel: "T1", stageId: 23, id: 1 };
  const second = { floorLabel: "T12", stageId: 3, id: 2 };
  const index = buildWorkFrontIndex([first, second]);
  assert.strictEqual(index.get("T1")?.get(23), first);
  assert.strictEqual(index.get("T12")?.get(3), second);
  assert.equal(index.get("T1")?.get(3), undefined);
});

test("index mặt bằng: nhãn tầng tự do, Unicode và tên thuộc tính object giữ nguyên", () => {
  const rows = ["Khu A:1|23", "Tầng kỹ thuật / mái", "__proto__", "constructor"].map(
    (floorLabel, id) => ({ floorLabel, stageId: 7, id }),
  );
  const index = buildWorkFrontIndex(rows);
  for (const row of rows) assert.strictEqual(index.get(row.floorLabel)?.get(7), row);
});

test("index mặt bằng: phân biệt hoa/thường và không tự trim nhãn tầng", () => {
  const rows = ["B1F", "b1f", " B1F "].map((floorLabel, id) => ({
    floorLabel,
    stageId: 1,
    id,
  }));
  const index = buildWorkFrontIndex(rows);
  assert.equal(index.size, 3);
  for (const row of rows) assert.strictEqual(index.get(row.floorLabel)?.get(1), row);
});

test("index mặt bằng: ô thiếu trả undefined, không mượn row của tầng hoặc công tác khác", () => {
  const row = { floorLabel: "1F", stageId: 2, id: 1 };
  const index = buildWorkFrontIndex([row]);
  assert.equal(index.get("1F")?.get(3), undefined);
  assert.equal(index.get("2F")?.get(2), undefined);
});

test("index mặt bằng: cặp trùng giữ row đầu tiên đúng như find", () => {
  const first = { floorLabel: "1F", stageId: 2, id: 1, note: "Bản đầu" };
  const duplicate = { floorLabel: "1F", stageId: 2, id: 2, note: "Bản sau" };
  const otherStage = { floorLabel: "1F", stageId: 3, id: 3, note: "Công tác khác" };
  const rows = Object.freeze([first, otherStage, duplicate]);
  const index = buildWorkFrontIndex(rows);
  assert.strictEqual(index.get("1F")?.get(2), first);
  assert.strictEqual(index.get("1F")?.get(3), otherStage);
  assert.equal(index.get("1F")?.size, 2);
  assert.deepEqual(rows, [first, otherStage, duplicate]);
});

test("index mặt bằng: giữ object gốc và các trường DTO mở rộng mà không sửa input", () => {
  const dates = Object.freeze({ receivedAt: null, plannedHandedOverAt: "2026-10-27" });
  const row = Object.freeze({ floorLabel: "RF", stageId: 9, dates, note: "Tiến độ mái" });
  const rows = Object.freeze([row]);
  const indexed = buildWorkFrontIndex(rows).get("RF")?.get(9);
  assert.strictEqual(indexed, row);
  assert.strictEqual(indexed?.dates, dates);
  assert.equal(indexed?.note, "Tiến độ mái");
});
