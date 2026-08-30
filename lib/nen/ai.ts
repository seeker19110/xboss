// lib/nen/ai.ts — M108 PR2: CỬA DUY NHẤT của XBoss ra mô hình ngôn ngữ.
//
// Tầng 0 (`lib/nen/`) nên tệp này **thuần cấu hình + gọi mạng**: nó không biết block, không biết
// CAD, không chạm DB. Mọi tri thức nghiệp vụ nằm ở tầng trên gọi xuống.
//
// Vì sao gom về một cửa (M108 §18 R3): đây là chỗ ĐẦU TIÊN đưa SDK LLM vào codebase XBoss. Gom lại
// thì công tắc tắt, đường lui khi lỗi, hạn mức và cách ép định dạng chỉ có một chỗ để kiểm — và
// nếu sau này đổi nhà cung cấp hoặc dời phần AI sang repo `mep-agents` (boundary ENG-0/ENG-1) thì
// chỉ phải sửa một tệp.
//
// NGUYÊN TẮC:
//   • **Tuỳ chọn, không bắt buộc.** Thiếu `ANTHROPIC_API_KEY` → `aiKhaDung()` trả false và mọi hàm
//     gọi trả `null`. KHÔNG throw như `XBOSS_SECRET` — thiếu AI thì tính năng chạy bằng tầng tất
//     định, thiếu khoá ký phiên thì hệ thống mất an toàn. Hai loại cấu hình khác hẳn nhau.
//   • **Không bao giờ ném lỗi ra ngoài.** Lỗi mạng/hạn mức/từ chối đều trả `null` kèm log — người
//     gọi rơi về tầng thấp hơn (M108 NFR3).
//   • **Luôn ép định dạng đầu ra** bằng structured output (`output_config.format`), không parse
//     chuỗi tự do. Giá trị ngoài schema là lỗi của lượt gọi, không phải thứ để đoán tiếp.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod";
import { log } from "@/lib/nen/log";

/**
 * Model dùng cho mọi lượt gọi. KHÔNG hạ cấp để tiết kiệm — chọn model rẻ hơn là quyết định của
 * chủ dự án, không phải của code (M108 §4).
 */
export const AI_MODEL = "claude-opus-5";

/** Trần token đầu ra một lượt — phân loại là việc trả về JSON ngắn, không cần rộng. */
const MAX_TOKENS = 8_000;

/** Số lần thử lại khi bị giới hạn tần suất; ngoài ra không thử lại (lỗi 4xx thử lại cũng vô ích). */
const SO_LAN_THU_LAI = 2;

/**
 * AI có đang bật không.
 *
 * `XBOSS_AI_BLOCK_CLASSIFY=0` là công tắc dừng khẩn (M108 FR10 / §2 Stop): tắt được tức thì bằng
 * biến môi trường, không cần deploy lại. Mặc định bật khi có khoá.
 */
export function aiKhaDung(): boolean {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  return process.env.XBOSS_AI_BLOCK_CLASSIFY !== "0";
}

/** Lý do AI đang tắt, viết cho người dùng cuối đọc trên UI (tiếng Việt). */
export function lyDoAiTat(): string | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    return "Chưa cấu hình ANTHROPIC_API_KEY trên máy chủ — gợi ý bằng AI đang tắt, hệ thống chạy bằng luật tất định.";
  }
  if (process.env.XBOSS_AI_BLOCK_CLASSIFY === "0") {
    return "Gợi ý bằng AI đang bị tắt bằng XBOSS_AI_BLOCK_CLASSIFY=0.";
  }
  return null;
}

let client: Anthropic | null = null;
function layClient(): Anthropic {
  // Khởi tạo lười: `new Anthropic()` đọc biến môi trường lúc gọi, nên build không cần khoá.
  client ??= new Anthropic();
  return client;
}

/** Chỉ dùng trong test — buộc dựng lại client sau khi đổi biến môi trường. */
export function _resetAiClient(): void {
  client = null;
}

/**
 * Một khối nội dung gửi lên. Tách `on dinh` / `bien thien` để đặt mốc prompt caching đúng chỗ:
 * phần ổn định (luật phân loại, danh mục hạng mục) đứng TRƯỚC và được cache; phần biến thiên
 * (danh sách block của lô này) đứng SAU mốc cuối, nếu không cache sẽ không bao giờ trúng.
 */
export type YeuCauAi<T> = {
  /** Phần ổn định giữa các lượt gọi — được đánh dấu cache. Đổi một byte là mất cache toàn bộ. */
  chiDanOnDinh: string;
  /** Phần thay đổi từng lượt — đặt sau mốc cache. */
  noiDungBienThien: string;
  /** Schema ép đầu ra. Giá trị ngoài schema ⇒ lượt gọi coi như thất bại. */
  schema: z.ZodType<T>;
  /** Nhãn ngắn để log/đo, không gửi lên mô hình. */
  nhan: string;
};

/**
 * Gọi mô hình và trả về đối tượng ĐÃ ĐƯỢC ÉP theo schema, hoặc `null` nếu không xong (AI tắt,
 * lỗi mạng, hạn mức, bị từ chối, hoặc đầu ra không khớp schema).
 *
 * Không bao giờ throw — người gọi chỉ cần kiểm `null` rồi rơi về tầng thấp hơn.
 */
export async function hoiCoCauTruc<T>(yc: YeuCauAi<T>): Promise<T | null> {
  if (!aiKhaDung()) return null;

  for (let lan = 0; lan <= SO_LAN_THU_LAI; lan++) {
    try {
      const res = await layClient().messages.parse({
        model: AI_MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: yc.chiDanOnDinh,
            // Mốc cache: chỉ dẫn ổn định giữa mọi lượt gọi cùng loại ⇒ lượt sau đọc lại rất rẻ.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: yc.noiDungBienThien }],
        output_config: { format: zodOutputFormat(yc.schema) },
      });

      // Bị từ chối vì lý do an toàn — không phải lỗi hệ thống, cũng không có gì để dùng.
      if (res.stop_reason === "refusal") {
        log.error("ai_refusal", { nhan: yc.nhan, category: res.stop_details?.category ?? null });
        return null;
      }
      if (res.parsed_output == null) {
        log.error("ai_khong_khop_schema", { nhan: yc.nhan, stopReason: res.stop_reason });
        return null;
      }

      log.info("ai_goi", {
        nhan: yc.nhan,
        model: res.model,
        tokenVao: res.usage.input_tokens,
        tokenRa: res.usage.output_tokens,
        // Bằng 0 lặp lại nhiều lượt = có thứ đang phá prefix cache, phải đi tìm (M108 §14).
        tokenCacheDoc: res.usage.cache_read_input_tokens ?? 0,
        tokenCacheGhi: res.usage.cache_creation_input_tokens ?? 0,
      });
      return res.parsed_output;
    } catch (e) {
      // Bắt theo LỚP LỖI typed của SDK, không so khớp chuỗi thông báo (NFR3).
      if (e instanceof Anthropic.RateLimitError && lan < SO_LAN_THU_LAI) {
        await nghi(2 ** lan * 1000);
        continue;
      }
      log.error("ai_loi", {
        nhan: yc.nhan,
        lop: e instanceof Error ? e.constructor.name : typeof e,
        thongBao: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }
  return null;
}

function nghi(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
