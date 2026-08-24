import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// Audit 2026-08-23 — hồi quy cho 2 lỗ hổng thật đã sửa:
// (1) /api/telegram/webhook và /api/zalo/webhook trước đây KHÔNG xác thực gì — ai cũng
//     POST được, tự chọn projectId/chat_id → bơm dữ liệu giả vào dự án bất kỳ.
// (2) Escape SVG: model_code/spoolCode do người dùng nhập được nhúng thẳng vào chuỗi SVG
//     rồi render bằng dangerouslySetInnerHTML → attribute sự kiện chèn vào SẼ chạy (XSS).
// Chỉ test hàm thuần (không cần DB): handler route gọi next/headers nên không gọi trực
// tiếp ngoài request scope thật của Next — đúng quy ước tests/qr-resolve.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Xác thực webhook =====

test("checkTelegramWebhook: thiếu secret cấu hình → 503 (tắt), không mở toang", async () => {
  const { checkTelegramWebhook } = await import("@/lib/bao-mat/webhook-auth");
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  const r = checkTelegramWebhook("bat-ky");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 503);
});

test("checkTelegramWebhook: sai/thiếu header → 401, đúng header → ok", async () => {
  const { checkTelegramWebhook } = await import("@/lib/bao-mat/webhook-auth");
  process.env.TELEGRAM_WEBHOOK_SECRET = "secret-webhook-du-dai-32-ky-tu-xyz";

  assert.equal(checkTelegramWebhook(null).ok, false);
  const sai = checkTelegramWebhook("sai-secret");
  assert.equal(sai.ok, false);
  assert.equal(sai.ok === false && sai.status, 401);

  assert.equal(checkTelegramWebhook("secret-webhook-du-dai-32-ky-tu-xyz").ok, true);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

test("checkZaloWebhook: cùng quy tắc, secret riêng — không dùng chung với Telegram", async () => {
  const { checkZaloWebhook } = await import("@/lib/bao-mat/webhook-auth");
  process.env.TELEGRAM_WEBHOOK_SECRET = "secret-cua-telegram-khong-dung-chung";
  delete process.env.ZALO_WEBHOOK_SECRET;

  // Secret Telegram KHÔNG mở được webhook Zalo.
  const r = checkZaloWebhook("secret-cua-telegram-khong-dung-chung");
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.status, 503);

  process.env.ZALO_WEBHOOK_SECRET = "secret-rieng-cua-zalo";
  assert.equal(checkZaloWebhook("secret-rieng-cua-zalo").ok, true);
  delete process.env.ZALO_WEBHOOK_SECRET;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

// ===== Escape SVG (chống XSS lưu trữ) =====

test("escapeXml: escape đủ 5 ký tự nguy hiểm, chặn thoát khỏi <text> trong SVG", async () => {
  const { escapeXml } = await import("@/lib/nen/escape");
  assert.equal(
    escapeXml(`<script>alert('x')</script> & "quote"`),
    "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quote&quot;",
  );
  // null/undefined/số không được làm vỡ hàm (dùng cho cả field số như nominalDiameterMm).
  assert.equal(escapeXml(null), "");
  assert.equal(escapeXml(undefined), "");
  assert.equal(escapeXml(150), "150");
});

test("generateAsBuiltStamp: mã mô hình độc hại bị escape, không sinh attribute sự kiện", async () => {
  const { generateAsBuiltStamp } = await import("@/lib/ky-thuat/engineering-god-tier");
  const doc = `"><img src=x onerror=alert(1)>`;
  const { svgStampContent } = generateAsBuiltStamp(doc, "Nhà thầu A", "TVGS B", "CHT C");

  // Điểm mấu chốt: payload không được sinh THẺ mới hay thoát khỏi attribute — chuỗi
  // "onerror=" còn lại dưới dạng chữ trơ là vô hại vì < > " đều đã bị escape.
  assert.ok(!svgStampContent.includes("<img"), "không được nhúng thẻ img thô");
  assert.ok(svgStampContent.includes("&lt;img"), "phải ở dạng đã escape");
  assert.ok(!svgStampContent.includes('"><img'), "không được thoát khỏi attribute");

  // Số thẻ <text> không đổi so với đầu vào lành tính → payload không sinh phần tử mới.
  const lanh = generateAsBuiltStamp("MODEL-01", "Nhà thầu A", "TVGS B", "CHT C");
  const demText = (v: string) => (v.match(/<text/g) || []).length;
  assert.equal(demText(svgStampContent), demText(lanh.svgStampContent));
});
