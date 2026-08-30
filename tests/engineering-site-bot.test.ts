import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVietnameseFieldIntent,
  generateTelegramLinkOtp,
  verifyTelegramLinkOtp,
  processIncomingTelegramMessage,
} from "@/lib/ky-thuat/engineering-site-bot";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M76: NLP Intent Parser — Nhận diện lệnh Cập nhật Tiến độ WBS", () => {
  const parsed1 = parseVietnameseFieldIntent("Cập nhật tiến độ task A1.02 đạt 85%");
  assert.equal(parsed1.intent, "PROGRESS_UPDATE");
  assert.equal(parsed1.entities.taskCode, "A1.02");
  assert.equal(parsed1.entities.progressPercent, 85);

  const parsed2 = parseVietnameseFieldIntent("/tien_do ODNN1-05 100%");
  assert.equal(parsed2.intent, "PROGRESS_UPDATE");
  assert.equal(parsed2.entities.taskCode, "ODNN1-05");
  assert.equal(parsed2.entities.progressPercent, 100);
});

test("M76: NLP Intent Parser — Nhận diện Báo cáo Sự Cố & Mức độ khẩn cấp", () => {
  const parsed = parseVietnameseFieldIntent(
    "Báo cáo sự cố rò rỉ nước tại phòng bơm tầng hầm mức độ khẩn cấp",
  );
  assert.equal(parsed.intent, "ISSUE_REPORT");
  assert.equal(parsed.entities.severity, "critical");
  assert.ok(parsed.entities.issueTitle?.includes("rò rỉ nước"));
});

test("M76: NLP Intent Parser — Nhận diện Ghi Nhật Ký Thi Công & Tra Cứu", () => {
  const diary = parseVietnameseFieldIntent("Hôm nay 15 công nhân lắp đặt ống cấp nước tầng 8");
  assert.equal(diary.intent, "DIARY_LOG");
  assert.ok(diary.entities.diaryNote);

  const query = parseVietnameseFieldIntent("Tra cứu tồn kho ty ren M12");
  assert.equal(query.intent, "QUERY_STOCK");
  assert.ok(query.entities.queryKeyword?.includes("ty ren M12"));
});

test("M76: Vòng đời OTP & Telegram Message Gateway trong DB", { skip: !HAS_DB }, async () => {
  const { insertId, run } = await import("@/lib/db");
  const chatId = 99998888;
  // telegram_user_bindings.telegram_chat_id là UNIQUE và chatId ở đây cố định — dọn bản
  // còn sót từ lần chạy trước (kể cả lần chạy dừng giữa chừng) để test chạy lại được.
  await run(`DELETE FROM telegram_user_bindings WHERE telegram_chat_id = ?`, chatId);

  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Site Bot Proj')`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Site Bot Tester', ?, 'x', 'admin')`,
    `site-bot-test-${projectId}@x.vn`,
  );

  try {
    // 1. Sinh OTP
    const otp = await generateTelegramLinkOtp(userId);
    assert.ok(otp.length === 6, "OTP phải gồm 6 chữ số");

    // 2. Xác minh OTP từ Telegram
    const verified = await verifyTelegramLinkOtp({ chatId, otpCode: otp });
    assert.equal(verified.success, true);
    assert.equal(verified.userId, userId);

    // 3. Xử lý tin nhắn thực tế từ kỹ sư
    const msgRes = await processIncomingTelegramMessage({
      chatId,
      rawText: "Cập nhật tiến độ task A2.01 đạt 90%",
      projectId,
    });

    assert.equal(msgRes.actionTaken, true);
    assert.equal(msgRes.parsedIntent, "PROGRESS_UPDATE");
    assert.ok(msgRes.replyText.includes("90%"));
  } finally {
    await run(`DELETE FROM telegram_user_bindings WHERE telegram_chat_id = ?`, chatId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM users WHERE id = ?`, userId);
  }
});

// ===== V1 — siết OTP liên kết Telegram (lỗ hổng Cao A2) =====

test(
  "V1: OTP Telegram lưu dạng hash & sinh 2 lần chỉ để lại 1 dòng chờ",
  { skip: !HAS_DB },
  async () => {
    const { insertId, query, run } = await import("@/lib/db");
    const { hashOtp } = await import("@/lib/bao-mat/otp");
    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('OTP Hash Tester', ?, 'x', 'engineer') RETURNING id`,
      `otp-hash-${Date.now()}@x.vn`,
    );

    try {
      const otp1 = await generateTelegramLinkOtp(userId);
      const otp2 = await generateTelegramLinkOtp(userId);

      const rows = await query<{ otp_code: string }>(
        `SELECT otp_code FROM telegram_user_bindings WHERE user_id = ? AND is_verified = false`,
        userId,
      );
      // Bug cũ: ON CONFLICT (telegram_chat_id) với chat_id NULL không bao giờ khớp → 2 dòng.
      assert.equal(rows.length, 1, "sinh OTP nhiều lần chỉ được để lại 1 dòng chờ liên kết");

      assert.notEqual(rows[0].otp_code, otp2, "không được lưu OTP bản rõ");
      assert.match(rows[0].otp_code, /^[0-9a-f]{64}$/, "OTP phải lưu dạng SHA-256 hex");
      assert.equal(rows[0].otp_code, hashOtp(otp2), "phải là hash của mã mới nhất");
      assert.notEqual(hashOtp(otp1), rows[0].otp_code, "mã cũ phải bị thay thế");
    } finally {
      await run(`DELETE FROM telegram_user_bindings WHERE user_id = ?`, userId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
    }
  },
);

test(
  "V1: OTP Telegram — hết hạn, gắn chat khác, và rate-limit dò mã",
  { skip: !HAS_DB },
  async () => {
    const { insertId, run } = await import("@/lib/db");
    const chatId = 977700001;
    const chatKhac = 977700002;
    await run(
      `DELETE FROM telegram_user_bindings WHERE telegram_chat_id IN (?, ?)`,
      chatId,
      chatKhac,
    );
    await run(
      `DELETE FROM login_rate_limits WHERE key IN (?, ?)`,
      `tg_otp:${chatId}`,
      `tg_otp:${chatKhac}`,
    );

    const userId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('OTP Guard Tester', ?, 'x', 'engineer') RETURNING id`,
      `otp-guard-${Date.now()}@x.vn`,
    );

    try {
      // 1. OTP hết hạn → từ chối (điều kiện otp_expires_at > CURRENT_TIMESTAMP).
      const otpHetHan = await generateTelegramLinkOtp(userId);
      await run(
        `UPDATE telegram_user_bindings SET otp_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute' WHERE user_id = ?`,
        userId,
      );
      const rHetHan = await verifyTelegramLinkOtp({ chatId, otpCode: otpHetHan });
      assert.equal(rHetHan.success, false, "OTP hết hạn không được liên kết");

      // 2. Dòng chờ đã gắn chat khác → chat lạ dù đoán ĐÚNG mã cũng không chiếm được binding.
      const otp = await generateTelegramLinkOtp(userId);
      await run(
        `UPDATE telegram_user_bindings SET telegram_chat_id = ? WHERE user_id = ?`,
        chatKhac,
        userId,
      );
      const rSaiChat = await verifyTelegramLinkOtp({ chatId, otpCode: otp });
      assert.equal(
        rSaiChat.success,
        false,
        "chat khác không được nhận binding đang chờ của chat này",
      );

      // 3. Đúng chat + đúng mã → liên kết được.
      const rDung = await verifyTelegramLinkOtp({ chatId: chatKhac, otpCode: otp });
      assert.equal(rDung.success, true);
      assert.equal(rDung.userId, userId);

      // 4. Rate-limit: quá 5 lần thử trong cửa sổ cho cùng chatId → bị chặn.
      await run(`DELETE FROM login_rate_limits WHERE key = ?`, `tg_otp:${chatId}`);
      let biChan = false;
      for (let i = 0; i < 6; i++) {
        const r = await verifyTelegramLinkOtp({ chatId, otpCode: "000000" });
        assert.equal(r.success, false);
        if (/quá nhiều lần/.test(r.message)) biChan = true;
      }
      assert.ok(biChan, "dò quá 5 lần trong 15 phút phải bị chặn");
    } finally {
      await run(`DELETE FROM telegram_user_bindings WHERE user_id = ?`, userId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
      await run(
        `DELETE FROM login_rate_limits WHERE key IN (?, ?)`,
        `tg_otp:${chatId}`,
        `tg_otp:${chatKhac}`,
      );
    }
  },
);
