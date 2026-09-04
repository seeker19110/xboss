import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeXml } from "@/lib/nen/escape";

// escapeXml là hàng rào duy nhất giữa chuỗi người dùng nhập và markup được render bằng
// dangerouslySetInnerHTML (tem QR, các bản vẽ SVG sinh trong lib/ky-thuat/*). Một ký tự
// lọt lưới ở đây là một lỗ XSS thật, nên khoá cả 5 ký tự lẫn các ca biên của đối số.

test("escapeXml: thoát đủ 5 ký tự đặc biệt của XML/HTML", () => {
  assert.equal(escapeXml("&"), "&amp;");
  assert.equal(escapeXml("<"), "&lt;");
  assert.equal(escapeXml(">"), "&gt;");
  assert.equal(escapeXml('"'), "&quot;");
  assert.equal(escapeXml("'"), "&#39;");
});

test("escapeXml: vô hiệu hoá payload XSS thật, thoát MỌI lần xuất hiện", () => {
  assert.equal(
    escapeXml(`<img src=x onerror="alert('1')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;",
  );
  // Nhiều lần xuất hiện cùng một ký tự đều phải được thoát (regex có cờ /g).
  assert.equal(escapeXml("a<b<c"), "a&lt;b&lt;c");
  // Thoát "&" trước rồi mới tới ký tự khác — không được thoát lặp thành &amp;amp;
  assert.equal(escapeXml("&lt;"), "&amp;lt;");
});

test("escapeXml: nhận mọi kiểu đầu vào, null/undefined thành chuỗi rỗng", () => {
  assert.equal(escapeXml(null), "");
  assert.equal(escapeXml(undefined), "");
  // 0 và false là giá trị thật, KHÔNG được rơi vào nhánh rỗng (`?? ` chứ không phải `||`).
  assert.equal(escapeXml(0), "0");
  assert.equal(escapeXml(false), "false");
  assert.equal(escapeXml(123), "123");
  assert.equal(escapeXml(""), "");
  // Chuỗi sạch đi qua nguyên vẹn.
  assert.equal(escapeXml("Tầng 5 — ống gió"), "Tầng 5 — ống gió");
});
