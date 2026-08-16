import { test } from "node:test";
import assert from "node:assert/strict";
import { SHEET_SLUGS, slugFromCode, toSlug, SLUG_RE } from "@/lib/sheets";

test("SHEET_SLUGS: đúng 5 phần tử, khớp đầy đủ từng bộ {slug, code, name}", () => {
  assert.equal(SHEET_SLUGS.length, 5);
  assert.deepEqual(SHEET_SLUGS, [
    { slug: "ogtd", code: "OGTĐ", name: "Ống gió trục đứng" },
    { slug: "oghl", code: "OGHL", name: "Ống gió hành lang" },
    { slug: "ogch", code: "OGCH", name: "Ống gió căn hộ" },
    { slug: "odnn1", code: "ODNN Zone 1", name: "Ống đồng nước ngưng Zone 1" },
    { slug: "odnn2", code: "ODNN Zone 2", name: "Ống đồng nước ngưng Zone 2" },
  ]);
});

test("slugFromCode: trả về đúng slug cho 5 mã đã biết", () => {
  assert.equal(slugFromCode("OGTĐ"), "ogtd");
  assert.equal(slugFromCode("OGHL"), "oghl");
  assert.equal(slugFromCode("OGCH"), "ogch");
  assert.equal(slugFromCode("ODNN Zone 1"), "odnn1");
  assert.equal(slugFromCode("ODNN Zone 2"), "odnn2");
});

test("slugFromCode: mã không tồn tại và chuỗi rỗng → null", () => {
  assert.equal(slugFromCode("KHONG-TON-TAI"), null);
  assert.equal(slugFromCode(""), null);
});

test("toSlug: bỏ dấu tiếng Việt thông thường", () => {
  assert.equal(toSlug("Ống gió trục đứng"), "ong-gio-truc-dung");
  assert.equal(toSlug("Hệ thống điều hoà không khí"), "he-thong-dieu-hoa-khong-khi");
});

test("toSlug: ca riêng cho đ/Đ (nhánh xử lý đặc biệt, không bị dấu-trừ chung nuốt mất)", () => {
  assert.equal(toSlug("đứng"), "dung");
  assert.equal(toSlug("Đứng"), "dung");
  assert.equal(toSlug("ống Đồng"), "ong-dong");
  // Kiểm chứng ký tự "d" thế chỗ đúng vị trí "đ", không bị rớt mất.
  assert.equal(toSlug("đ"), "d");
  assert.equal(toSlug("Đ"), "d");
});

test("toSlug: chuỗi ký tự không phải chữ-số bị gộp thành đúng 1 dấu -", () => {
  assert.equal(toSlug("a   b,,,c...d"), "a-b-c-d");
  assert.equal(toSlug("ODNN Zone 1"), "odnn-zone-1");
});

test("toSlug: dấu - ở đầu/cuối bị cắt bỏ", () => {
  assert.equal(toSlug("  abc  "), "abc");
  assert.equal(toSlug("---abc---"), "abc");
  assert.equal(toSlug("!!!Ống gió!!!"), "ong-gio");
});

test("toSlug: toàn bộ output là chữ thường", () => {
  assert.equal(toSlug("ABC-XYZ"), "abc-xyz");
});

test("toSlug: input dài hơn 50 ký tự sau xử lý bị cắt còn tối đa 50 ký tự", () => {
  // 60 chữ "a" liên tiếp → không có ký tự cần thay thế, output = 60 chữ "a" trước khi cắt.
  const input = "a".repeat(60);
  const out = toSlug(input);
  assert.equal(out.length, 50);
  assert.equal(out, "a".repeat(50));
});

test("toSlug: input đã sạch sẵn giữ nguyên", () => {
  assert.equal(toSlug("abc-123"), "abc-123");
});

test("SLUG_RE: khớp true với slug hợp lệ", () => {
  assert.equal(SLUG_RE.test("a"), true);
  assert.equal(SLUG_RE.test("abc-123"), true);
  const valid50 = "a" + "b".repeat(49);
  assert.equal(valid50.length, 50);
  assert.equal(SLUG_RE.test(valid50), true);
});

test("SLUG_RE: khớp false với chuỗi rỗng, bắt đầu bằng -, có chữ hoa, quá 50 ký tự", () => {
  assert.equal(SLUG_RE.test(""), false);
  assert.equal(SLUG_RE.test("-abc"), false);
  assert.equal(SLUG_RE.test("Abc"), false);
  const invalid51 = "a" + "b".repeat(50);
  assert.equal(invalid51.length, 51);
  assert.equal(SLUG_RE.test(invalid51), false);
});

test("Bất biến chéo: mọi slug trong SHEET_SLUGS đều thoả SLUG_RE", () => {
  for (const s of SHEET_SLUGS) {
    assert.equal(SLUG_RE.test(s.slug), true, `slug "${s.slug}" phải hợp lệ theo SLUG_RE`);
  }
});
