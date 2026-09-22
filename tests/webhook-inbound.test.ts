import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { xacThucWebhookTelegram, xacThucWebhookZalo } from "@/lib/bao-mat/webhook-inbound";

const BI_MAT_TG = "secret-telegram-cuc-ky-dai-va-ngau-nhien";
const BI_MAT_ZALO = "secret-zalo-oa-cuc-ky-dai-va-ngau-nhien";

// Dựng request giả chỉ cần headers — đúng phần mà lớp xác thực dùng tới.
function reqVoiHeader(h: Record<string, string>): { headers: Headers } {
  return { headers: new Headers(h) };
}

function kyZalo(rawBody: string, biMat = BI_MAT_ZALO): string {
  return createHmac("sha256", biMat).update(rawBody, "utf8").digest("hex");
}

// Đặt/khôi phục biến môi trường quanh 1 đoạn kiểm thử.
async function voiEnv(env: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const cu: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    cu[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(cu)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ===== lib/bao-mat/webhook-inbound.ts (thuần, không cần Postgres) =====

test("V1/Webhook: Telegram — chỉ chấp nhận đúng secret token trong header", async () => {
  await voiEnv({ TELEGRAM_WEBHOOK_SECRET: BI_MAT_TG }, () => {
    const header = "X-Telegram-Bot-Api-Secret-Token";
    assert.equal(xacThucWebhookTelegram(reqVoiHeader({ [header]: BI_MAT_TG })), true);
    assert.equal(xacThucWebhookTelegram(reqVoiHeader({ [header]: BI_MAT_TG + "x" })), false);
    assert.equal(xacThucWebhookTelegram(reqVoiHeader({ [header]: "" })), false);
    assert.equal(xacThucWebhookTelegram(reqVoiHeader({})), false, "thiếu header → từ chối");
  });
});

test("V1/Webhook: Telegram — thiếu TELEGRAM_WEBHOOK_SECRET thì throw fail-fast", async () => {
  await voiEnv({ TELEGRAM_WEBHOOK_SECRET: undefined }, () => {
    assert.throws(
      () => xacThucWebhookTelegram(reqVoiHeader({ "X-Telegram-Bot-Api-Secret-Token": "x" })),
      /TELEGRAM_WEBHOOK_SECRET/,
    );
  });
});

test("V1/Webhook: Zalo — HMAC-SHA256 phải khớp đúng raw body", async () => {
  await voiEnv({ ZALO_OA_SECRET: BI_MAT_ZALO }, () => {
    const raw = JSON.stringify({ sender: { id: "ZID_1" }, message: { text: "tầng 5 xong 20 m2" } });
    const ok = reqVoiHeader({ "X-ZEvent-Signature": kyZalo(raw) });
    assert.equal(xacThucWebhookZalo(ok, raw), true);

    // Sửa 1 ký tự trong body → chữ ký cũ phải hỏng (đây là điểm mấu chốt: ký trên RAW body).
    const rawGia = raw.replace("tầng 5", "tầng 9");
    assert.equal(xacThucWebhookZalo(ok, rawGia), false);

    // JSON.parse rồi stringify lại đổi thứ tự khoá → chữ ký không còn khớp; chứng minh vì sao
    // route bắt buộc phải dùng req.text() chứ không phải req.json().
    const rawDaoKhoa = JSON.stringify({
      message: { text: "tầng 5 xong 20 m2" },
      sender: { id: "ZID_1" },
    });
    assert.notEqual(rawDaoKhoa, raw);
    assert.equal(xacThucWebhookZalo(ok, rawDaoKhoa), false);

    // Chữ ký ký bằng khoá khác → từ chối.
    const saiKhoa = reqVoiHeader({ "X-ZEvent-Signature": kyZalo(raw, "khoa-khac") });
    assert.equal(xacThucWebhookZalo(saiKhoa, raw), false);

    // Chấp nhận tiền tố mac=/sha256= và chữ hoa.
    assert.equal(
      xacThucWebhookZalo(reqVoiHeader({ "X-ZEvent-Signature": `mac=${kyZalo(raw)}` }), raw),
      true,
    );
    assert.equal(
      xacThucWebhookZalo(
        reqVoiHeader({ "X-Zalo-Signature": `sha256=${kyZalo(raw).toUpperCase()}` }),
        raw,
      ),
      true,
    );

    assert.equal(xacThucWebhookZalo(reqVoiHeader({}), raw), false, "thiếu header → từ chối");
  });
});

test("V1/Webhook: Zalo — thiếu ZALO_OA_SECRET thì throw fail-fast", async () => {
  await voiEnv({ ZALO_OA_SECRET: undefined }, () => {
    assert.throws(
      () => xacThucWebhookZalo(reqVoiHeader({ "X-ZEvent-Signature": "abc" }), "{}"),
      /ZALO_OA_SECRET/,
    );
  });
});
