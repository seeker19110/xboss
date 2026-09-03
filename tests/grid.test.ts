import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serializeTSV,
  parseTSV,
  normalizeRect,
  spreadPaste,
  resolveUndoBatch,
} from "@/lib/tien-do/grid";

test("serializeTSV: ma trận thường → cột TAB, dòng LF", () => {
  assert.equal(
    serializeTSV([
      ["a", "b"],
      ["c", "d"],
    ]),
    "a\tb\nc\td",
  );
});

test("serializeTSV: số/null/boolean → chuỗi, null thành rỗng", () => {
  assert.equal(
    serializeTSV([
      [1, null],
      [true, undefined],
    ]),
    "1\t\ntrue\t",
  );
});

test("serializeTSV: ô có TAB/xuống dòng/nháy kép → bọc và escape", () => {
  assert.equal(serializeTSV([["a\tb"]]), '"a\tb"');
  assert.equal(serializeTSV([['x"y']]), '"x""y"');
  assert.equal(serializeTSV([["dòng1\ndòng2"]]), '"dòng1\ndòng2"');
});

test("parseTSV: TSV thường → ma trận", () => {
  assert.deepEqual(parseTSV("a\tb\nc\td"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("parseTSV: ô bọc nháy kép có TAB/xuống dòng bên trong giữ nguyên", () => {
  assert.deepEqual(parseTSV('"a\tb"\tc'), [["a\tb", "c"]]);
  assert.deepEqual(parseTSV('"dòng1\ndòng2"\tx'), [["dòng1\ndòng2", "x"]]);
  assert.deepEqual(parseTSV('"x""y"'), [['x"y']]);
});

test("parseTSV: chuẩn hoá CRLF về tách dòng", () => {
  assert.deepEqual(parseTSV("a\tb\r\nc\td"), [
    ["a", "b"],
    ["c", "d"],
  ]);
});

test("parseTSV ∘ serializeTSV: vòng tròn giữ nguyên dữ liệu có ký tự đặc biệt", () => {
  const m = [
    ["a\tb", 'x"y'],
    ["dòng1\ndòng2", "z"],
  ];
  assert.deepEqual(parseTSV(serializeTSV(m)), m);
});

test("normalizeRect: kéo theo hướng nào cũng ra hình chữ nhật chuẩn", () => {
  assert.deepEqual(normalizeRect({ r: 3, c: 5 }, { r: 1, c: 2 }), { r0: 1, c0: 2, r1: 3, c1: 5 });
});

test("spreadPaste: trải ma trận từ ô neo, sinh toạ độ tuyệt đối", () => {
  const edits = spreadPaste(
    [
      ["a", "b"],
      ["c", "d"],
    ],
    2,
    3,
  );
  assert.deepEqual(edits, [
    { r: 2, c: 3, raw: "a" },
    { r: 2, c: 4, raw: "b" },
    { r: 3, c: 3, raw: "c" },
    { r: 3, c: 4, raw: "d" },
  ]);
});

// --- Ngăn xếp Undo/Redo: định vị ô theo khoá dòng/cột ---

test("resolveUndoBatch: tra khoá dòng/cột → chỉ số hiện tại", () => {
  assert.deepEqual(
    resolveUndoBatch(
      [
        { rowKey: 7, colKey: "name", raw: "cũ" },
        { rowKey: 9, colKey: "qty", raw: "3" },
      ],
      [5, 7, 9],
      ["boqCode", "name", "qty"],
    ),
    [
      { r: 1, c: 1, raw: "cũ" },
      { r: 2, c: 2, raw: "3" },
    ],
  );
});

test("resolveUndoBatch: cột đổi thứ tự vẫn trỏ đúng ô (không ghi nhầm cột)", () => {
  // Lúc ghi stack cột là [boqCode, name, qty]; giờ đã thành [qty, name, boqCode].
  assert.deepEqual(
    resolveUndoBatch([{ rowKey: 7, colKey: "qty", raw: "3" }], [5, 7], ["qty", "name", "boqCode"]),
    [{ r: 1, c: 0, raw: "3" }],
  );
});

test("resolveUndoBatch: bỏ qua ô có cột đã bị xoá", () => {
  assert.deepEqual(
    resolveUndoBatch(
      [
        { rowKey: 7, colKey: "note", raw: "x" },
        { rowKey: 7, colKey: "name", raw: "y" },
      ],
      [7],
      ["name"],
    ),
    [{ r: 0, c: 0, raw: "y" }],
  );
});

test("resolveUndoBatch: bỏ qua ô có dòng đã bị xoá", () => {
  assert.deepEqual(resolveUndoBatch([{ rowKey: 99, colKey: "name", raw: "x" }], [7], ["name"]), []);
});

test("resolveUndoBatch: khoá dòng dạng chuỗi và số coi là một", () => {
  assert.deepEqual(resolveUndoBatch([{ rowKey: "7", colKey: "name", raw: "x" }], [7], ["name"]), [
    { r: 0, c: 0, raw: "x" },
  ]);
});
