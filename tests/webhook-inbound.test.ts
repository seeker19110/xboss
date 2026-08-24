import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { hashOtp, kiemOtp, sinhOtp, OTP_DO_DAI, OTP_HAN_PHUT } from "@/lib/bao-mat/otp";
import { xacThucWebhookTelegram, xacThucWebhookZalo } from "@/lib/bao-mat/webhook-inbound";
import { POST as postTelegramWebhook } from "@/app/api/telegram/webhook/route";
import { POST as postZaloWebhook } from "@/app/api/zalo/webhook/route";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL);

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

// ===== lib/bao-mat/otp.ts (thuần, không cần Postgres) =====

test("V1/OTP: sinhOtp luôn ra đúng 6 chữ số và trải đều biên", () => {
  const thay = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const otp = sinhOtp();
    assert.match(otp, /^\d{6}$/, `OTP sai định dạng: ${otp}`);
    assert.equal(otp.length, OTP_DO_DAI);
    const n = Number(otp);
    assert.ok(n >= 100000 && n <= 999999, `OTP ngoài khoảng: ${otp}`);
    thay.add(otp);
  }
  // 500 lần sinh mà trùng gần hết là dấu hiệu nguồn ngẫu nhiên hỏng.
  assert.ok(thay.size > 400, `Mã sinh ra lặp bất thường: ${thay.size}/500 giá trị khác nhau`);
  assert.equal(OTP_HAN_PHUT, 15);
});

test("V1/OTP: hashOtp cho SHA-256 hex ổn định, kiemOtp so đúng/sai", () => {
  const otp = "123456";
  const h = hashOtp(otp);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, hashOtp(otp), "cùng đầu vào phải cho cùng hash");
  assert.notEqual(h, hashOtp("123457"));
  assert.notEqual(h, otp, "tuyệt đối không lưu bản rõ");

  assert.equal(kiemOtp(otp, h), true);
  assert.equal(kiemOtp(" 123456 ", h), true, "cắt khoảng trắng như lúc băm");
  assert.equal(kiemOtp("654321", h), false);
  assert.equal(kiemOtp(otp, null), false, "không còn OTP chờ → luôn sai");
  assert.equal(kiemOtp(otp, ""), false);
  assert.equal(kiemOtp("", h), false);
  assert.equal(kiemOtp(otp, "hash-ngan"), false, "độ dài lệch không được throw");
});

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

// ===== Route: chặn 401 TRƯỚC khi chạm DB =====
// Không cần Postgres: tests/setup.ts đã xoá DATABASE_URL, nên nếu route lỡ chạm DB thì lời gọi
// sẽ throw thay vì trả 401 — chính điều đó chứng minh "không ghi bất kỳ dòng DB nào".

test("V1/Route: POST /api/telegram/webhook không kèm secret → 401, không chạm DB", async () => {
  const body = JSON.stringify({ message: { chat: { id: 123 }, text: "/link 111111" } });
  await voiEnv({ TELEGRAM_WEBHOOK_SECRET: BI_MAT_TG }, async () => {
    for (const headers of [
      {} as Record<string, string>,
      { "X-Telegram-Bot-Api-Secret-Token": "sai-secret" },
    ]) {
      const res = await postTelegramWebhook(
        new Request("http://x/api/telegram/webhook", {
          method: "POST",
          body,
          headers,
        }) as never,
      );
      assert.equal(res.status, 401);
      const json = (await res.json()) as { error?: string };
      assert.match(String(json.error), /Chữ ký webhook không hợp lệ/);
    }
  });
});

test("V1/Route: POST /api/zalo/webhook sai chữ ký → 401; body.projectId bị bỏ qua", async () => {
  // projectId 999 do "kẻ tấn công" đưa vào — trước bản vá nó đi thẳng vào withProjectScope.
  const body = JSON.stringify({
    projectId: 999,
    sender: { id: "ZID_TAN_CONG" },
    message: { text: "tầng 5 xong 20 m2" },
  });
  await voiEnv({ ZALO_OA_SECRET: BI_MAT_ZALO }, async () => {
    for (const headers of [
      {} as Record<string, string>,
      { "X-ZEvent-Signature": kyZalo(body, "khoa-gia") },
    ]) {
      const res = await postZaloWebhook(
        new Request("http://x/api/zalo/webhook", { method: "POST", body, headers }) as never,
      );
      assert.equal(res.status, 401);
    }
  });

  // Bất biến tĩnh: route Zalo không được đọc projectId từ body dưới bất kỳ hình thức nào.
  const { readFileSync } = await import("node:fs");
  const nguon = readFileSync(
    new URL("../app/api/zalo/webhook/route.ts", import.meta.url),
    "utf8",
  );
  assert.ok(
    !/body\.projectId/.test(nguon),
    "route Zalo không được lấy projectId từ body — phải suy từ binding đã xác thực",
  );
});

test(
  "V1/Route: Zalo có chữ ký hợp lệ nhưng chưa liên kết → 403, không ghi log",
  { skip: !HAS_DB },
  async () => {
    const { query, withProjectScope } = await import("@/lib/db");
    const zaloUserId = `ZID_CHUA_LIEN_KET_${Date.now()}`;
    const body = JSON.stringify({
      projectId: 999,
      sender: { id: zaloUserId },
      message: { text: "tầng 5 xong 20 m2" },
    });
    await voiEnv({ ZALO_OA_SECRET: BI_MAT_ZALO }, async () => {
      const res = await postZaloWebhook(
        new Request("http://x/api/zalo/webhook", {
          method: "POST",
          body,
          headers: { "X-ZEvent-Signature": kyZalo(body) },
        }) as never,
      );
      assert.equal(res.status, 403);
    });

    // Đọc trong ngữ cảnh RLS '*' để đếm được mọi dự án (nếu route lỡ ghi vào dự án 999).
    const logs = await withProjectScope("*", async () =>
      query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM zalo_site_message_logs WHERE zalo_user_id = ?`,
        zaloUserId,
      ),
    );
    assert.equal(logs[0].n, 0, "chưa liên kết thì tuyệt đối không được ghi log tin nhắn");
  },
);
