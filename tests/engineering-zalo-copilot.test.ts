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
  // V5 — bot KHÔNG được nói đã ghi vào hệ thống khi thực tế chỉ ghi log tin nhắn.
  // Khoá cả hai chiều: phải nêu rõ "chưa" cập nhật WBS, và tuyệt đối không được
  // khẳng định đã đồng bộ (đây chính là câu chữ cũ đã gây hiểu nhầm cho kỹ sư hiện trường).
  assert.ok(response.replyText.includes("chưa"));
  assert.ok(response.replyText.includes("XBoss"));
  assert.ok(!/đã đồng bộ|đã cập nhật vào WBS/i.test(response.replyText));
});

// ===== V1 — siết OTP liên kết Zalo (phát hiện Trung B9) =====

test("V1: OTP Zalo — lưu hash, upsert 1 dòng, hết hạn thì từ chối", { skip: !HAS_DB }, async () => {
  const { insertId, query, run, withProjectScope } = await import("@/lib/db");
  const { hashOtp } = await import("@/lib/bao-mat/otp");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Zalo OTP Proj')`);
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Zalo OTP Tester', ?, 'x', 'engineer')`,
    `zalo-otp-${projectId}@x.vn`,
  );
  const zaloUserId = `ZID_OTP_${projectId}`;

  try {
    const otp1 = await generateZaloLinkOtp(projectId, userId, zaloUserId, "Thầu phụ A");
    const otp2 = await generateZaloLinkOtp(projectId, userId, zaloUserId, "Thầu phụ A");

    const rows = await withProjectScope(projectId, async () =>
      query<{ verification_otp: string }>(
        `SELECT verification_otp FROM zalo_user_bindings WHERE project_id = ? AND zalo_user_id = ?`,
        projectId,
        zaloUserId,
      ),
    );
    // Bug cũ: ON CONFLICT (id) trên UUID tự sinh không bao giờ khớp → mỗi lần lấy mã thêm 1 dòng.
    assert.equal(rows.length, 1, "sinh OTP 2 lần chỉ được để lại 1 dòng binding");
    assert.match(rows[0].verification_otp, /^[0-9a-f]{64}$/, "OTP phải lưu dạng SHA-256 hex");
    assert.equal(rows[0].verification_otp, hashOtp(otp2));
    assert.notEqual(rows[0].verification_otp, otp2, "không được lưu OTP bản rõ");

    // Mã cũ đã bị thay → không dùng được nữa.
    assert.equal(await verifyZaloLinkOtp(zaloUserId, otp1), false);

    // OTP hết hạn → từ chối (trước đây SELECT otp_expires_at nhưng KHÔNG BAO GIỜ so).
    await withProjectScope(
      projectId,
      async () => {
        await run(
          `UPDATE zalo_user_bindings SET otp_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
            WHERE project_id = ? AND zalo_user_id = ?`,
          projectId,
          zaloUserId,
        );
      },
      { readOnly: false },
    );
    await run(`DELETE FROM login_rate_limits WHERE key = ?`, `zalo_otp:${zaloUserId}`);
    assert.equal(await verifyZaloLinkOtp(zaloUserId, otp2), false, "OTP hết hạn phải bị từ chối");
  } finally {
    await withProjectScope(
      projectId,
      async () => {
        await run(`DELETE FROM zalo_user_bindings WHERE project_id = ?`, projectId);
      },
      { readOnly: false },
    );
    await run(`DELETE FROM login_rate_limits WHERE key = ?`, `zalo_otp:${zaloUserId}`);
    await run(`DELETE FROM users WHERE id = ?`, userId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  }
});

test(
  "V1: OTP Zalo — rate-limit dò mã & chưa liên kết thì không ghi log",
  { skip: !HAS_DB },
  async () => {
    const { insertId, query, run, withProjectScope } = await import("@/lib/db");
    const { THONG_DIEP_CHUA_LIEN_KET } = await import("@/lib/ky-thuat/engineering-zalo-copilot");
    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Zalo Guard Proj')`);
    const zaloUserId = `ZID_GUARD_${projectId}`;
    await run(`DELETE FROM login_rate_limits WHERE key = ?`, `zalo_otp:${zaloUserId}`);

    try {
      // 1. Zalo ID chưa liên kết → không xử lý, không ghi log tin nhắn/điều phối hành động.
      const res = await processIncomingZaloMessage({
        projectId,
        zaloUserId,
        rawText: "Tầng 7 lắp xong 120 m2 ống gió",
      });
      assert.equal(res.actionDispatched, false);
      assert.equal(res.intent, "UNKNOWN");
      assert.equal(res.replyText, THONG_DIEP_CHUA_LIEN_KET);

      const dem = await withProjectScope(projectId, async () => ({
        logs: (
          await query<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM zalo_site_message_logs WHERE project_id = ?`,
            projectId,
          )
        )[0].n,
        dispatch: (
          await query<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM zalo_field_action_dispatches WHERE project_id = ?`,
            projectId,
          )
        )[0].n,
      }));
      assert.equal(dem.logs, 0, "chưa liên kết thì không được ghi log tin nhắn");
      assert.equal(dem.dispatch, 0, "chưa liên kết thì không được điều phối hành động");

      // 2. Dò mã: quá 5 lần trong cửa sổ → chặn (không còn tra DB nữa).
      for (let i = 0; i < 6; i++) {
        assert.equal(await verifyZaloLinkOtp(zaloUserId, "000000"), false);
      }
      const dem2 = await query<{ count: number }>(
        `SELECT count FROM login_rate_limits WHERE key = ?`,
        `zalo_otp:${zaloUserId}`,
      );
      assert.ok(dem2[0] && dem2[0].count > 5, "phải đếm được số lần thử để chặn dò mã");
    } finally {
      await run(`DELETE FROM login_rate_limits WHERE key = ?`, `zalo_otp:${zaloUserId}`);
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);
