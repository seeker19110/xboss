import { test } from "node:test";
import assert from "node:assert/strict";
import { FONT_REGULAR, FONT_BOLD, registerVietnameseFonts } from "@/lib/pdf-fonts";

test("Tên font cố định đúng như khai báo", () => {
  assert.equal(FONT_REGULAR, "DejaVu");
  assert.equal(FONT_BOLD, "DejaVu-Bold");
});

test("registerVietnameseFonts: gọi lần đầu không throw (file font tồn tại đúng đường dẫn)", () => {
  assert.doesNotThrow(() => registerVietnameseFonts());
});

test("registerVietnameseFonts: gọi lần thứ hai không throw (nhánh registered=true, return sớm)", () => {
  assert.doesNotThrow(() => registerVietnameseFonts());
});
