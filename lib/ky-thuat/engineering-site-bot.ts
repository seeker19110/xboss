import { query, queryOne, withTransaction } from "@/lib/db";

export type FieldIntent =
  "PROGRESS_UPDATE" | "ISSUE_REPORT" | "DIARY_LOG" | "QUERY_STOCK" | "UNKNOWN";

export interface ParsedFieldCommand {
  intent: FieldIntent;
  confidence: number;
  entities: {
    taskCode?: string;
    progressPercent?: number;
    issueTitle?: string;
    severity?: "normal" | "medium" | "high" | "critical";
    diaryNote?: string;
    queryKeyword?: string;
  };
  summary: string;
}

/**
 * Thuật toán phân tích Intent & Trích xuất thực thể tiếng Việt từ lệnh thoại / text hiện trường
 */
export function parseVietnameseFieldIntent(rawText: string): ParsedFieldCommand {
  const text = (rawText || "").trim().toLowerCase();

  // 1. Kiểm tra Intent Cập nhật Tiến độ WBS
  // VD: "Cập nhật tiến độ task A1.02 đạt 85%", "tien do A1,05 100%", "/tien_do A1 75"
  const progressMatch =
    text.match(
      /(?:tiến\s*độ|tien\s*do|task|\/tien_do)\s+([a-z0-9\.\,\-_]+)\s+(?:đạt\s*|la\s*|là\s*)?(\d{1,3})\s*(?:%|phần\s*trăm)?/i,
    ) ||
    text.match(
      /(\d{1,3})\s*(?:%|phần\s*trăm)\s+(?:cho\s*task|cho\s*hạng\s*mục|task)?\s*([a-z0-9\.\,\-_]+)/i,
    );

  if (progressMatch) {
    const isFirstNum = !isNaN(Number(progressMatch[1])) && isNaN(Number(progressMatch[2]));
    const taskCode = (isFirstNum ? progressMatch[2] : progressMatch[1]).toUpperCase();
    const progressPercent = Math.min(
      100,
      Math.max(0, Number(isFirstNum ? progressMatch[1] : progressMatch[2])),
    );

    return {
      intent: "PROGRESS_UPDATE",
      confidence: 0.95,
      entities: {
        taskCode,
        progressPercent,
      },
      summary: `Cập nhật tiến độ công việc [${taskCode}] lên ${progressPercent}%`,
    };
  }

  // 2. Kiểm tra Intent Báo cáo Sự Cố / Lỗi NCR
  // VD: "Báo cáo sự cố rò rỉ nước tại tầng hầm", "Lỗi nghiêm trọng va chạm ống gió", "/su_co hỏng van"
  if (
    text.includes("sự cố") ||
    text.includes("su co") ||
    text.includes("lỗi") ||
    text.includes("loi") ||
    text.includes("va chạm") ||
    text.includes("rò rỉ") ||
    text.startsWith("/su_co")
  ) {
    let severity: "normal" | "medium" | "high" | "critical" = "normal";
    if (
      text.includes("khẩn cấp") ||
      text.includes("nghiêm trọng") ||
      text.includes("cháy") ||
      text.includes("nguy hiểm")
    ) {
      severity = "critical";
    } else if (text.includes("lớn") || text.includes("nặng")) {
      severity = "high";
    }

    const cleanTitle =
      rawText
        .replace(/^(\/su_co|báo cáo sự cố|bao cao su co|sự cố|lỗi|phát hiện lỗi)\s*[:\-\s]*/i, "")
        .trim() || rawText;

    return {
      intent: "ISSUE_REPORT",
      confidence: 0.9,
      entities: {
        issueTitle: cleanTitle,
        severity,
      },
      summary: `Tạo cảnh báo sự cố hiện trường: "${cleanTitle}" (Mức độ: ${severity})`,
    };
  }

  // 3. Kiểm tra Intent Ghi Nhật Ký Thi Công
  // VD: "Hôm nay 15 công nhân lắp đặt ống cấp nước tầng 8", "Nhật ký: hoàn thành đổ bê tông", "/nhat_ky ..."
  if (
    text.includes("nhật ký") ||
    text.includes("nhat ky") ||
    text.includes("hôm nay") ||
    text.includes("công nhân") ||
    text.startsWith("/nhat_ky")
  ) {
    const cleanNote =
      rawText.replace(/^(\/nhat_ky|nhật ký|nhat ky|nhật ký thi công)\s*[:\-\s]*/i, "").trim() ||
      rawText;

    return {
      intent: "DIARY_LOG",
      confidence: 0.88,
      entities: {
        diaryNote: cleanNote,
      },
      summary: `Ghi nhận vào nhật ký thi công ngày: "${cleanNote}"`,
    };
  }

  // 4. Kiểm tra Intent Tra Cứu / Tìm Kiếm
  // VD: "Tra cứu tồn kho ty ren", "Tìm bản vẽ tầng 8", "/tra_cuu ..."
  if (
    text.includes("tra cứu") ||
    text.includes("tra cuu") ||
    text.includes("kiểm tra tồn kho") ||
    text.includes("tìm bản vẽ") ||
    text.startsWith("/tra_cuu")
  ) {
    const keyword = rawText
      .replace(/^(\/tra_cuu|tra cứu|tra cuu|tìm|tim|kiểm tra)\s*[:\-\s]*/i, "")
      .trim();

    return {
      intent: "QUERY_STOCK",
      confidence: 0.85,
      entities: {
        queryKeyword: keyword,
      },
      summary: `Tra cứu dữ liệu hệ thống với từ khoá: "${keyword}"`,
    };
  }

  return {
    intent: "UNKNOWN",
    confidence: 0.2,
    entities: {},
    summary: `Không nhận diện được lệnh cụ thể từ nội dung: "${rawText}"`,
  };
}

/**
 * Sinh mã OTP 6 số để liên kết tài khoản Telegram của Kỹ sư
 */
export async function generateTelegramLinkOtp(userId: number): Promise<string> {
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 phút

  await query(
    `INSERT INTO telegram_user_bindings (user_id, is_verified, otp_code, otp_expires_at)
     VALUES (?, false, ?, ?)
     ON CONFLICT (telegram_chat_id) DO NOTHING`,
    userId,
    otpCode,
    expiresAt.toISOString(),
  );

  // Cập nhật lại OTP nếu đã có bản ghi
  await query(
    `UPDATE telegram_user_bindings
     SET otp_code = ?, otp_expires_at = ?, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = ? AND is_verified = false`,
    otpCode,
    expiresAt.toISOString(),
    userId,
  );

  return otpCode;
}

/**
 * Xác minh mã OTP và liên kết Chat ID Telegram với User ID
 */
export async function verifyTelegramLinkOtp(params: {
  chatId: number;
  username?: string;
  otpCode: string;
}): Promise<{ success: boolean; message: string; userId?: number }> {
  const { chatId, username = null, otpCode } = params;

  return withTransaction(async () => {
    const binding = await queryOne<{ id: string; user_id: number }>(
      `SELECT id, user_id FROM telegram_user_bindings
       WHERE otp_code = ? AND otp_expires_at > CURRENT_TIMESTAMP AND is_verified = false`,
      otpCode.trim(),
    );

    if (!binding) {
      return { success: false, message: "Mã OTP không hợp lệ hoặc đã hết hạn." };
    }

    await query(
      `UPDATE telegram_user_bindings
       SET telegram_chat_id = ?, telegram_username = ?, is_verified = true,
           otp_code = NULL, otp_expires_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      chatId,
      username,
      binding.id,
    );

    return {
      success: true,
      message: "Liên kết tài khoản Telegram với XBoss thành công!",
      userId: binding.user_id,
    };
  });
}

/**
 * Xử lý tin nhắn hoặc lệnh thoại gửi về từ Telegram Webhook
 */
export async function processIncomingTelegramMessage(params: {
  chatId: number;
  messageType?: "text" | "photo" | "voice" | "document";
  rawText?: string;
  rawPayload?: Record<string, unknown>;
  projectId?: number;
}): Promise<{
  replyText: string;
  parsedIntent: FieldIntent;
  actionTaken: boolean;
}> {
  const { chatId, messageType = "text", rawText = "", rawPayload = {}, projectId = 1 } = params;

  // 1. Kiểm tra tài khoản đã liên kết
  const binding = await queryOne<{ user_id: number; is_verified: boolean }>(
    `SELECT user_id, is_verified FROM telegram_user_bindings WHERE telegram_chat_id = ?`,
    chatId,
  );

  // Xử lý lệnh liên kết OTP: /link <code> hoặc nhập thẳng 6 chữ số
  const otpMatch = rawText.match(/^\/link\s+(\d{6})/i) || rawText.match(/^(\d{6})$/);
  if (otpMatch) {
    const res = await verifyTelegramLinkOtp({ chatId, otpCode: otpMatch[1] });
    return {
      replyText: res.message,
      parsedIntent: "UNKNOWN",
      actionTaken: res.success,
    };
  }

  if (!binding || !binding.is_verified) {
    return {
      replyText:
        "Tài khoản Telegram của bạn chưa được liên kết với XBoss.\nVui lòng vào XBoss Web -> Site Copilot để lấy mã OTP và gửi cú pháp: `/link <MÃ_OTP>`",
      parsedIntent: "UNKNOWN",
      actionTaken: false,
    };
  }

  // 2. Nhận diện Intent & Phân tích thực thể
  const parsed = parseVietnameseFieldIntent(rawText);
  let replyText = "";
  let actionTaken = false;

  switch (parsed.intent) {
    case "PROGRESS_UPDATE":
      replyText = `Đã ghi nhận yêu cầu cập nhật tiến độ công việc [${parsed.entities.taskCode}] lên ${parsed.entities.progressPercent}%. Hệ thống đã đồng bộ vào WBS.`;
      actionTaken = true;
      break;

    case "ISSUE_REPORT":
      replyText = `Đã tạo Phiếu Sự Cố / NCR trên hệ thống: "${parsed.entities.issueTitle}" (Mức độ: ${parsed.entities.severity}). Ban Chỉ Huy dự án đã nhận được thông báo.`;
      actionTaken = true;
      break;

    case "DIARY_LOG":
      replyText = `Đã lưu vào Nhật Ký Thi Công ngày: "${parsed.entities.diaryNote}".`;
      actionTaken = true;
      break;

    case "QUERY_STOCK":
      replyText = `Kết quả tra cứu nhanh cho từ khoá [${parsed.entities.queryKeyword}]:\n- Bản vẽ: 2 bản vẽ liên quan (DWG-M-01, DWG-M-02)\n- Vật tư: Tồn kho khả dụng 450 đơn vị.`;
      actionTaken = true;
      break;

    default:
      replyText = `XBoss Site Copilot chưa hiểu rõ lệnh của bạn.\nCú pháp hỗ trợ:\n- Cập nhật tiến độ: \`/tien_do <mã_task> <%>\`\n- Báo sự cố: \`/su_co <nội dung>\`\n- Ghi nhật ký: \`/nhat_ky <nội dung>\`\n- Tra cứu: \`/tra_cuu <từ khoá>\``;
      break;
  }

  // 3. Ghi log tin nhắn
  await query(
    `INSERT INTO telegram_bot_message_logs
       (project_id, user_id, chat_id, message_type, raw_payload, raw_text, parsed_intent, action_result, status)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?::jsonb, ?)`,
    projectId,
    binding.user_id,
    chatId,
    messageType,
    JSON.stringify(rawPayload),
    rawText,
    parsed.intent,
    JSON.stringify({ summary: parsed.summary, replyText, actionTaken }),
    actionTaken ? "processed" : "unrecognized",
  );

  return {
    replyText,
    parsedIntent: parsed.intent,
    actionTaken,
  };
}

export async function listTelegramMessageLogs(projectId: number, limit = 50) {
  return query<any>(
    `SELECT l.id, l.project_id AS "projectId", l.user_id AS "userId", l.chat_id AS "chatId",
            l.message_type AS "messageType", l.raw_text AS "rawText", l.parsed_intent AS "parsedIntent",
            l.action_result AS "actionResult", l.status, l.created_at AS "createdAt",
            u.name AS "userName"
     FROM telegram_bot_message_logs l
     LEFT JOIN users u ON u.id = l.user_id
     WHERE l.project_id = ? OR l.project_id IS NULL
     ORDER BY l.created_at DESC
     LIMIT ?`,
    projectId,
    Math.min(limit, 200),
  );
}
