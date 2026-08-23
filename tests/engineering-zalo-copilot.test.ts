import "@/tests/setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVietnameseConstructionIntent,
  generateZaloLinkOtp,
  verifyZaloLinkOtp,
  processIncomingZaloMessage,
} from "@/lib/ky-thuat/engineering-zalo-copilot";

const HAS_DB = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

test("M86: Zalo NLP Intent Parsing — Phân tích tiếng Việt công trường", () => {
  // 1. Tiến độ
  const progress = parseVietnameseConstructionIntent("Hôm nay tầng 5 kéo xong 300 mét dây điện");
  assert.equal(progress.intent, "PROGRESS_UPDATE");
  assert.equal(progress.entities.system, "ELECTRICAL");
  assert.equal(progress.entities.quantity, 300);

  // 2. Lỗi NCR
  const ncr = parseVietnameseConstructionIntent("Tạo NCR đội ống nước làm ẩu gây xì rỉ");
  assert.equal(ncr.intent, "CREATE_NCR");

  // 3. Tồn kho
  const stock = parseVietnameseConstructionIntent("Kho còn bao nhiêu mã DUCT-01");
  assert.equal(stock.intent, "CHECK_MATERIAL_STOCK");

  // 4. Nghiệm thu
  const bbnt = parseVietnameseConstructionIntent("Lập biên bản nghiệm thu BBNT tầng 8");
  assert.equal(bbnt.intent, "REQUEST_BBNT");
});

test("M86: Zalo OTP & Message Processing DB Lifecycle", { skip: !HAS_DB }, async () => {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Zalo Copilot Proj')`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Zalo Copilot Tester', ?, 'x', 'admin')`,
    `zalo-copilot-test-${projectId}@x.vn`,
  );
  const zaloUserId = "ZALO_TEST_USER_99";

  const otp = await generateZaloLinkOtp(projectId, userId, zaloUserId, "Thầu phụ Test");
  assert.equal(otp.length, 6);

  const verified = await verifyZaloLinkOtp(zaloUserId, otp);
  assert.equal(verified, true);

  const response = await processIncomingZaloMessage({
    projectId,
    zaloUserId,
    rawText: "Tầng 7 lắp xong 120 m2 ống gió",
  });

  assert.equal(response.intent, "PROGRESS_UPDATE");
  assert.equal(response.actionDispatched, true);
  assert.ok(response.replyText.includes("Đã ghi nhận sản lượng"));
});
