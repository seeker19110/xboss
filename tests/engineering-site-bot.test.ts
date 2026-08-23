import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVietnameseFieldIntent,
  generateTelegramLinkOtp,
  verifyTelegramLinkOtp,
  processIncomingTelegramMessage,
} from "@/lib/engineering-site-bot";

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
