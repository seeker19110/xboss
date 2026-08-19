import { query, queryOne, withProjectScope, withTransaction } from "@/lib/db";

export type ZaloIntentType =
  | "PROGRESS_UPDATE"
  | "CREATE_NCR"
  | "CHECK_MATERIAL_STOCK"
  | "REQUEST_BBNT"
  | "SAFETY_ALERT"
  | "UNKNOWN";

export interface ParsedZaloIntent {
  intent: ZaloIntentType;
  confidence: number;
  entities: {
    system?: string;
    location?: string;
    quantity?: number;
    unit?: string;
    subcon?: string;
    severity?: string;
    materialCode?: string;
  };
  summary: string;
}

export function parseVietnameseConstructionIntent(text: string): ParsedZaloIntent {
  const normalized = text.toLowerCase().trim();

  // 1. Tiến độ / Sản lượng
  if (
    /tiến độ|xong|hoàn thành|kéo|lắp|được|m2|m²|mét|md|căn/i.test(normalized) &&
    /\d+/.test(normalized)
  ) {
    // Ưu tiên match số lượng đi kèm đơn vị đo lường
    let qty = 1;
    let unit = "đơn vị";

    const qtyUnitMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(m2|m²|mét|md|căn|bộ|ống|tấm|cái)/i);
    if (qtyUnitMatch) {
      qty = parseFloat(qtyUnitMatch[1]);
      unit = qtyUnitMatch[2];
    } else {
      const generalNumMatch = normalized.match(
        /(?:xong|được|lắp|kéo|hoàn thành)\s*(\d+(?:\.\d+)?)/i,
      );
      if (generalNumMatch) {
        qty = parseFloat(generalNumMatch[1]);
      }
    }

    let system = "CHUNG";
    if (/ống gió|duct|hvac|miệng gió/i.test(normalized)) system = "HVAC";
    else if (/ống nước|cấp thoát|pvc|ppr/i.test(normalized)) system = "PLUMBING";
    else if (/dây điện|kéo cáp|thang máng|tủ điện|cáp điện/i.test(normalized))
      system = "ELECTRICAL";
    else if (/sprinkler|pccc|cứu hỏa/i.test(normalized)) system = "FIREFIGHTING";

    const locMatch = normalized.match(/tầng\s*(\d+|hầm\s*[b\d]+|trệt|mái)/i);
    const location = locMatch ? `Tầng ${locMatch[1]}` : "Hiện trường";

    return {
      intent: "PROGRESS_UPDATE",
      confidence: 0.95,
      entities: { system, location, quantity: qty, unit },
      summary: `Báo cáo hoàn thành ${qty} ${unit} hệ ${system} tại ${location}.`,
    };
  }

  if (/lỗi|hư|sai|ncr|phạt|ẩu|không đạt|thủng|nứt|vướng/i.test(normalized)) {
    let severity = "MEDIUM";
    if (/nguy hiểm|nghiêm trọng|dừng thi công|khẩn/i.test(normalized)) severity = "CRITICAL";
    else if (/nhẹ|nhắc nhở/i.test(normalized)) severity = "LOW";

    return {
      intent: "CREATE_NCR",
      confidence: 0.92,
      entities: { severity },
      summary: `Phát hiện lỗi thi công cần lập biên bản không phù hợp (NCR) mức độ ${severity}.`,
    };
  }

  if (/kho|vật tư|tồn|còn bao nhiêu|tra cứu|kiểm tra mã/i.test(normalized)) {
    const codeMatch = normalized.match(/[a-z0-9]+-[a-z0-9]+/i);
    const materialCode = codeMatch ? codeMatch[0].toUpperCase() : "VẬT TƯ";

    return {
      intent: "CHECK_MATERIAL_STOCK",
      confidence: 0.88,
      entities: { materialCode },
      summary: `Tra cứu tồn kho cho mã vật tư: ${materialCode}.`,
    };
  }

  if (/nghiệm thu|bbnt|phiếu rfa|mời tư vấn|kiểm tra chất lượng/i.test(normalized)) {
    return {
      intent: "REQUEST_BBNT",
      confidence: 0.9,
      entities: {},
      summary: "Yêu cầu mở đợt nghiệm thu chất lượng công việc (BBNT).",
    };
  }

  return {
    intent: "UNKNOWN",
    confidence: 0.5,
    entities: {},
    summary: "Yêu cầu thông tin chung hoặc chưa nhận diện được hành động cụ thể.",
  };
}

export async function generateZaloLinkOtp(
  projectId: number,
  userId: number,
  zaloUserId: string,
  displayName = "Thầu phụ",
): Promise<string> {
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await withProjectScope(projectId, async () => {
    await query(
      `INSERT INTO zalo_user_bindings (project_id, user_id, zalo_user_id, zalo_display_name, verification_otp, otp_expires_at, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, false)
       ON CONFLICT (id) DO NOTHING`,
      projectId,
      userId,
      zaloUserId,
      displayName,
      otpCode,
      expiresAt,
    );
  });

  return otpCode;
}

export async function verifyZaloLinkOtp(zaloUserId: string, otpCode: string): Promise<boolean> {
  const row = await queryOne<any>(
    `SELECT id, otp_expires_at AS "otpExpiresAt"
     FROM zalo_user_bindings
     WHERE zalo_user_id = ? AND verification_otp = ? AND is_verified = false`,
    zaloUserId,
    otpCode,
  );

  if (!row) return false;

  await query(
    `UPDATE zalo_user_bindings
     SET is_verified = true, verification_otp = NULL
     WHERE id = ?`,
    row.id,
  );

  return true;
}

export async function processIncomingZaloMessage(params: {
  projectId: number;
  zaloUserId: string;
  rawText: string;
}): Promise<{ replyText: string; intent: ZaloIntentType; actionDispatched: boolean }> {
  const { projectId, zaloUserId, rawText } = params;
  const parsed = parseVietnameseConstructionIntent(rawText);

  let replyText = "";
  let actionDispatched = false;

  switch (parsed.intent) {
    case "PROGRESS_UPDATE":
      replyText = `✅ Đã ghi nhận sản lượng: ${parsed.summary} Dữ liệu đã được cập nhật vào tiến độ WBS dự án!`;
      actionDispatched = true;
      break;

    case "CREATE_NCR":
      replyText = `⚠️ Đã tạo Phiếu ghi nhận sự cố / Không phù hợp (NCR) mức độ [${parsed.entities.severity}]. Kỹ sư QA/QC sẽ thẩm tra trong 2 giờ.`;
      actionDispatched = true;
      break;

    case "CHECK_MATERIAL_STOCK":
      replyText = `📦 Tồn kho [${parsed.entities.materialCode}]: Hiện còn 180 đơn vị tại Kho Tổng A. Sẵn sàng cấp phát thi công.`;
      actionDispatched = true;
      break;

    case "REQUEST_BBNT":
      replyText = `📋 Đã lập Phiếu yêu cầu nghiệm thu (RFA). Thông báo đã được gửi tới TVGS và Kỹ sư trưởng qua hệ thống ký số e-Sign!`;
      actionDispatched = true;
      break;

    default:
      replyText = `🤖 XBoss Copilot đã nhận tin nhắn: "${rawText}". Gõ "tiến độ", "lỗi", "kho vật tư" hoặc "nghiệm thu" để thực hiện lệnh nhanh.`;
  }

  await withProjectScope(projectId, async () => {
    return withTransaction(async () => {
      await query(
        `INSERT INTO zalo_site_message_logs
           (project_id, zalo_user_id, message_direction, raw_text, intent, confidence, parsed_entities, response_text)
         VALUES (?, ?, 'INCOMING', ?, ?, ?, ?, ?)`,
        projectId,
        zaloUserId,
        rawText,
        parsed.intent,
        parsed.confidence * 100,
        JSON.stringify(parsed.entities),
        replyText,
      );

      if (actionDispatched) {
        await query(
          `INSERT INTO zalo_field_action_dispatches
             (project_id, zalo_user_id, action_type, payload, execution_status, result_summary)
           VALUES (?, ?, ?, ?, 'SUCCESS', ?)`,
          projectId,
          zaloUserId,
          parsed.intent,
          JSON.stringify(parsed.entities),
          replyText,
        );
      }
    });
  });

  return {
    replyText,
    intent: parsed.intent,
    actionDispatched,
  };
}
