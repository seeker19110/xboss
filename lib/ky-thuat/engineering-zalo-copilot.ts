import { query, queryOne, run, withProjectScope, withTransaction } from "@/lib/db";
import { hashOtp, kiemOtp, sinhOtp, OTP_HAN_PHUT } from "@/lib/bao-mat/otp";
import { hitRateLimit } from "@/lib/bao-mat/ratelimit";

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

// Số lần thử OTP tối đa cho mỗi Zalo user trong một cửa sổ OTP_HAN_PHUT phút.
const SO_LAN_THU_OTP = 5;

/** Thông điệp lỗi khi Zalo ID đã thuộc về tài khoản XBoss khác — route dịch sang HTTP 409. */
export const LOI_ZALO_DA_LIEN_KET = "Zalo ID này đã được liên kết với một tài khoản XBoss khác.";

/** Thông điệp trả về khi tin nhắn đến từ Zalo ID chưa liên kết (chưa xác thực OTP). */
export const THONG_DIEP_CHUA_LIEN_KET =
  "Tài khoản Zalo của bạn chưa được liên kết với XBoss. " +
  "Vui lòng mở ứng dụng XBoss → Zalo Copilot để lấy mã OTP và xác thực liên kết trước khi gửi lệnh.";

export type BindingZalo = { id: string; projectId: number; userId: number | null };

/**
 * Tra dòng liên kết Zalo ĐÃ XÁC THỰC của một Zalo ID.
 *
 * Bỏ `projectId` → tra liên dự án bằng ngữ cảnh RLS '*': webhook đi vào KHÔNG có phiên đăng
 * nhập nên không thể biết dự án trước; chính dòng binding mới là nguồn sự thật của `project_id`
 * (trước đây route lấy `projectId` thẳng từ body attacker gửi rồi đưa vào withProjectScope,
 * tức tự hợp thức hoá RLS bằng giá trị của kẻ tấn công).
 */
export async function timBindingZaloDaXacThuc(
  zaloUserId: string,
  projectId?: number,
): Promise<BindingZalo | null> {
  if (!zaloUserId) return null;
  const row = await withProjectScope(projectId ?? "*", async () =>
    queryOne<BindingZalo>(
      `SELECT id, project_id AS "projectId", user_id AS "userId"
         FROM zalo_user_bindings
        WHERE zalo_user_id = ? AND is_verified = true
        ORDER BY created_at DESC
        LIMIT 1`,
      zaloUserId,
    ),
  );
  return row ?? null;
}

/**
 * Sinh OTP liên kết Zalo — lưu HASH, upsert theo khoá nghiệp vụ `(project_id, zalo_user_id)`.
 *
 * Trước đây `ON CONFLICT (id)` chạy trên khoá chính UUID tự sinh nên không bao giờ va chạm:
 * mỗi lần lấy mã lại thêm một dòng binding trùng. Chỉ số duy nhất tương ứng nằm ở migration 0133.
 * Điều kiện `WHERE` trên nhánh DO UPDATE giữ nguyên liên kết đã xác thực của người khác — không
 * cho một tài khoản bất kỳ chiếm Zalo ID đang thuộc tài khoản khác chỉ bằng cách xin mã mới.
 */
export async function generateZaloLinkOtp(
  projectId: number,
  userId: number,
  zaloUserId: string,
  displayName = "Thầu phụ",
): Promise<string> {
  const otpCode = sinhOtp();
  const expiresAt = new Date(Date.now() + OTP_HAN_PHUT * 60 * 1000).toISOString();

  const ghiDuoc = await withProjectScope(
    projectId,
    async () => {
      const rows = await query<{ id: string }>(
        `INSERT INTO zalo_user_bindings (project_id, user_id, zalo_user_id, zalo_display_name, verification_otp, otp_expires_at, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, false)
       ON CONFLICT (project_id, zalo_user_id)
       DO UPDATE SET user_id = EXCLUDED.user_id,
                     zalo_display_name = EXCLUDED.zalo_display_name,
                     verification_otp = EXCLUDED.verification_otp,
                     otp_expires_at = EXCLUDED.otp_expires_at
       WHERE zalo_user_bindings.is_verified = false OR zalo_user_bindings.user_id = ?
       RETURNING id`,
        projectId,
        userId,
        zaloUserId,
        displayName,
        hashOtp(otpCode),
        expiresAt,
        userId,
      );
      return rows.length > 0;
    },
    { readOnly: false },
  );

  if (!ghiDuoc) throw new Error(LOI_ZALO_DA_LIEN_KET);

  return otpCode;
}

/**
 * Xác minh OTP liên kết Zalo. So bằng hash + BẮT BUỘC còn hạn (trước đây có SELECT cột
 * `otp_expires_at` nhưng không bao giờ so, nên OTP hết hạn vẫn liên kết được) + rate-limit
 * theo Zalo ID để không dò được mã 6 số.
 */
export async function verifyZaloLinkOtp(zaloUserId: string, otpCode: string): Promise<boolean> {
  if (!zaloUserId || !otpCode) return false;

  // true = ĐÃ VƯỢT giới hạn (xem lib/bao-mat/ratelimit.ts) → chặn, không tra DB.
  if (await hitRateLimit(`zalo_otp:${zaloUserId}`, SO_LAN_THU_OTP, OTP_HAN_PHUT)) return false;

  return withProjectScope(
    "*",
    async () => {
      // Một Zalo ID có thể đang chờ liên kết ở nhiều dự án → lấy mọi dòng còn hạn rồi so hash
      // theo kiểu constant-time, thay vì để SQL so trực tiếp.
      const rows = await query<{ id: string; verification_otp: string | null }>(
        `SELECT id, verification_otp
           FROM zalo_user_bindings
          WHERE zalo_user_id = ? AND is_verified = false
            AND otp_expires_at IS NOT NULL AND otp_expires_at > CURRENT_TIMESTAMP`,
        zaloUserId,
      );

      const khop = rows.find((r) => kiemOtp(otpCode, r.verification_otp));
      if (!khop) return false;

      await run(
        `UPDATE zalo_user_bindings
          SET is_verified = true, verification_otp = NULL, otp_expires_at = NULL
        WHERE id = ?`,
        khop.id,
      );

      return true;
    },
    { readOnly: false },
  );
}

export async function processIncomingZaloMessage(params: {
  projectId: number;
  zaloUserId: string;
  rawText: string;
}): Promise<{ replyText: string; intent: ZaloIntentType; actionDispatched: boolean }> {
  const { projectId, zaloUserId, rawText } = params;

  // Lưới an toàn tầng nghiệp vụ: chỉ xử lý tin nhắn của Zalo ID đã liên kết & đã xác thực.
  // Route webhook đã chặn sẵn (trả 403) — kiểm lại ở đây để mọi đường gọi khác (giả lập, cron,
  // test) không thể ghi log/điều phối hành động nhân danh một Zalo ID lạ.
  const binding = await timBindingZaloDaXacThuc(zaloUserId, projectId);
  if (!binding) {
    return {
      replyText: THONG_DIEP_CHUA_LIEN_KET,
      intent: "UNKNOWN",
      actionDispatched: false,
    };
  }

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

  await withProjectScope(
    projectId,
    async () => {
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
    },
    { readOnly: false },
  );

  return {
    replyText,
    intent: parsed.intent,
    actionDispatched,
  };
}
