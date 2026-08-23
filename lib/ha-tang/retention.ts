import { query, run } from "@/lib/db";

// C3 §6 — Retention và deletion. Đặc tả: docs/nang-cap/C3-data-audit-rls-hardening.md mục 6.
//
// VẤN ĐỀ ĐO ĐƯỢC: `engineering_ingest_requests` đã có sẵn cột `expires_at`
// (mặc định NOW() + 30 ngày, migrations/0088) **và cả index trên cột đó** — nhưng KHÔNG có
// chỗ nào xoá dòng hết hạn. Cột hạn dùng để làm gì thì chưa ai viết. Bảng tăng vĩnh viễn.
// `webhook_deliveries` cũng vậy: mỗi lần gửi webhook là một dòng, không bao giờ dọn.
// (`login_rate_limits` thì đã tự dọn trong lib/ratelimit.ts — không đưa vào đây.)
//
// NGUYÊN TẮC THIẾT KẾ (chọn cho vòng đời dài, không cho lần chạy tới):
//
//  1. **Khai báo, không rải `DELETE` khắp nơi.** Mỗi thứ được xoá là một dòng trong
//     `RETENTION_TARGETS` dưới đây, kèm lý do bằng tiếng Việt. Muốn biết "hệ thống xoá
//     những gì, giữ bao lâu, vì sao" thì đọc đúng một chỗ này.
//
//  2. **Mặc định là chạy thử (dry-run).** Xoá thật phải nói rõ `apply`. Xoá nhầm dữ liệu
//     công trình thì không có nút hoàn tác.
//
//  3. **Chỉ bật sẵn thứ THUẦN KỸ THUẬT.** Những gì đụng tới dữ liệu nghiệp vụ (source
//     revision, object bị từ chối…) khai báo với `enabled: false` — chờ chủ sở hữu chốt
//     thời hạn, đúng như C3 §6 và DoD yêu cầu. Khai báo sẵn để người sau thấy câu hỏi còn
//     treo, thay vì tưởng là chưa ai nghĩ tới.
//
//  4. **KHÔNG BAO GIỜ xoá `audit_log`.** Xem `AUDIT_LOG_KHONG_XOA` bên dưới — đây là quyết
//     định kỹ thuật, không phải thiếu sót.
//
//  5. **Xoá theo lô, có trần.** Một lần chạy không được khoá bảng quá lâu; còn dư thì lần
//     chạy sau dọn tiếp. Dừng giữa chừng vẫn an toàn vì mỗi lô là một câu lệnh độc lập.

/**
 * VÌ SAO `audit_log` KHÔNG NẰM TRONG DANH SÁCH XOÁ, kể cả khi được yêu cầu:
 *
 * `audit_log.row_hash` là chuỗi băm móc xích — mỗi dòng băm gộp `row_hash` của dòng ngay
 * trước nó (xem `lib/audit-chain.ts`). Xoá một dòng ở giữa là **đứt xích vĩnh viễn**:
 * `verifyAuditChain()` sẽ báo sai từ điểm đó trở đi và không cách nào phân biệt được
 * "bị dọn theo chính sách" với "bị sửa trộm" — tức là phá đúng thứ mà audit trail sinh ra
 * để chứng minh.
 *
 * Muốn giảm dung lượng audit thì phải **lưu trữ ra ngoài rồi neo lại xích** (xuất ra file
 * ký số, ghi một dòng mốc mang băm của đoạn đã cắt), không phải `DELETE`. Đó là việc riêng,
 * cần chủ sở hữu và bộ phận pháp chế duyệt — cố tình để ngoài phạm vi PR này.
 */
export const AUDIT_LOG_KHONG_XOA =
  "audit_log dùng chuỗi băm móc xích — xoá dòng là đứt xích, verifyAuditChain không còn phân biệt được dọn theo chính sách với sửa trộm. Muốn thu gọn phải lưu trữ ngoài + neo lại xích, không dùng DELETE.";

export type RetentionTarget = {
  /** Định danh ổn định, dùng trong báo cáo/metrics — đổi tên là mất mạch số liệu cũ. */
  key: string;
  table: string;
  /**
   * - `deadline`: `column` LÀ mốc hết hạn, xoá khi `column < NOW()`.
   * - `age`: xoá khi `column < NOW() - days`.
   */
  mode: "deadline" | "age";
  column: string;
  /**
   * Chỉ dùng cho `mode: "age"`. `null` = **thời hạn chưa được chốt** (đang chờ chủ sở hữu);
   * khi đó không dựng SQL và không đếm — xem `whereOf`/`runRetention`. Cố tình dùng `null`
   * thay vì một con số tạm: đặt bừa 365 rồi quên là cách dữ liệu nghiệp vụ biến mất oan.
   */
  days?: number | null;
  /** Điều kiện SQL BỔ SUNG phải đúng thì mới được xoá (giữ lại dòng còn cần dùng). */
  keepWhile?: string;
  enabled: boolean;
  /** Vì sao xoá được — hoặc vì sao chưa bật. Viết cho người đọc 5 năm nữa. */
  reason: string;
};

export const RETENTION_TARGETS: RetentionTarget[] = [
  {
    key: "engineering_ingest_requests",
    table: "engineering_ingest_requests",
    mode: "deadline",
    column: "expires_at",
    enabled: true,
    reason:
      "Sổ lũy đẳng của ENG-5: chỉ cần sống đủ lâu để bắt retry của client (mặc định 30 ngày, đã ghi sẵn trong expires_at từ 0088). Hết hạn thì retry cùng Idempotency-Key được coi như request mới — đúng hợp đồng, vì client chỉ được retry trong cửa sổ ngắn. Không phải dữ liệu nghiệp vụ: object/relation đã nạp vẫn nằm nguyên ở bảng khác.",
  },
  {
    key: "webhook_deliveries",
    table: "webhook_deliveries",
    mode: "age",
    column: "created_at",
    days: 30,
    // Dòng chưa gửi xong vẫn đang chờ retry — xoá là mất hẳn sự kiện, không phải dọn rác.
    keepWhile: "status <> 'pending'",
    enabled: true,
    reason:
      "Nhật ký giao webhook, thuần kỹ thuật. Giữ 30 ngày đủ để truy vết một sự cố tích hợp. CHỈ xoá dòng đã kết thúc (ok/failed) — dòng 'pending' còn nằm trong hàng đợi retry nên giữ lại bất kể tuổi.",
  },
  {
    key: "engineering_source_revisions",
    table: "engineering_source_revisions",
    mode: "age",
    column: "created_at",
    days: null, // chưa chốt — xem chú thích ở RetentionTarget.days
    enabled: false,
    reason:
      "CHỜ CHỦ SỞ HỮU CHỐT (C3 §6). Đây là dữ liệu nghiệp vụ: revision bản vẽ là gốc truy vết của object và của quyết định nghiệm thu. Không tự đặt thời hạn — phải có ý kiến chủ đầu tư/pháp chế, và phải loại trừ revision đang bị workflow đã duyệt tham chiếu (legal hold).",
  },
  {
    key: "engineering_objects_rejected",
    table: "engineering_objects",
    mode: "age",
    column: "created_at",
    days: null, // chưa chốt — xem chú thích ở RetentionTarget.days
    keepWhile: "status = 'rejected'",
    enabled: false,
    reason:
      "CHỜ CHỦ SỞ HỮU CHỐT (C3 §6). Object bị từ chối vẫn là bằng chứng 'đã từng đề xuất và bị loại' — có giá trị khi tranh chấp. Chỉ xoá khi chủ sở hữu chốt thời hạn.",
  },
];

export type PurgePlanRow = {
  key: string;
  table: string;
  enabled: boolean;
  /** Số dòng ĐỦ ĐIỀU KIỆN xoá tại thời điểm chạy. */
  matched: number;
  /** Số dòng đã xoá thật (0 khi dry-run). */
  deleted: number;
  reason: string;
};

/** Target đã chốt được thời hạn chưa? Chưa chốt thì không dựng SQL, không đếm, không xoá. */
export function hasPeriod(t: RetentionTarget): boolean {
  return t.mode === "deadline" || typeof t.days === "number";
}

/**
 * Mệnh đề WHERE của một target — dùng chung cho cả đếm lẫn xoá, để hai đường không lệch nhau.
 * Ném lỗi khi `mode: "age"` mà thiếu `days`: thà chết rõ ràng còn hơn dựng ra
 * `INTERVAL 'NaN days'` rồi để Postgres báo một lỗi chẳng ai lần ra nguồn.
 */
export function whereOf(t: RetentionTarget): string {
  if (!hasPeriod(t))
    throw new Error(
      `Target "${t.key}" dùng mode "age" nhưng chưa chốt số ngày giữ lại — không được dựng câu lệnh xoá khi thời hạn còn bỏ trống.`,
    );
  const expired =
    t.mode === "deadline"
      ? `${t.column} < NOW()`
      : `${t.column} < NOW() - INTERVAL '${Number(t.days)} days'`;
  return t.keepWhile ? `${expired} AND (${t.keepWhile})` : expired;
}

const BATCH = 5000;

/**
 * Chạy dọn theo chính sách.
 * @param apply `false` (mặc định) = chỉ đếm, KHÔNG xoá gì.
 */
export async function runRetention(apply = false): Promise<PurgePlanRow[]> {
  const out: PurgePlanRow[] = [];

  for (const t of RETENTION_TARGETS) {
    // Chưa chốt thời hạn → báo cáo là "đang chờ", không đụng vào bảng. Vẫn liệt kê ra để
    // người đọc báo cáo thấy câu hỏi còn treo, thay vì tưởng đã xử lý xong.
    if (!hasPeriod(t)) {
      out.push({
        key: t.key,
        table: t.table,
        enabled: t.enabled,
        matched: 0,
        deleted: 0,
        reason: t.reason,
      });
      continue;
    }
    const where = whereOf(t);
    const counted = await query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ${t.table} WHERE ${where}`,
    );
    const matched = counted[0]?.n ?? 0;

    let deleted = 0;
    if (apply && t.enabled && matched > 0) {
      // Xoá theo lô để không giữ khoá bảng quá lâu. Dừng giữa chừng vẫn nhất quán:
      // mỗi lô là một câu lệnh riêng, phần chưa dọn để lần chạy sau.
      for (;;) {
        const r = await run(
          `DELETE FROM ${t.table}
            WHERE ctid IN (SELECT ctid FROM ${t.table} WHERE ${where} LIMIT ${BATCH})`,
        );
        deleted += r.changes;
        if (r.changes < BATCH) break;
      }
    }

    out.push({
      key: t.key,
      table: t.table,
      enabled: t.enabled,
      matched,
      deleted,
      reason: t.reason,
    });
  }

  return out;
}
