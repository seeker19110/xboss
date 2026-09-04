import { queryOne } from "@/lib/db";

// Sinh mã tuần tự (PR/PO/WR...) dạng `<prefix><NNN>` theo mã lớn nhất hiện có.
// Việc "đọc MAX rồi +1" có thể đụng nhau khi tạo đồng thời — luôn dùng kèm
// withUniqueRetry và một ràng buộc UNIQUE trên cột mã để chống trùng thật sự.

// Lỗi vi phạm UNIQUE của Postgres.
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

// Mã kế tiếp cho `prefix` (vd "PR-202606-") trên bảng/cột cho trước.
// table/column là hằng nội bộ (không phải input người dùng) nên nội suy an toàn.
// pad: độ rộng đệm số 0 (mặc định 3 — PR/PO/WR hiện có; NCR/YCNT dùng 4).
//
// Hàm này cấp mã cho ÍT NHẤT 9 loại chứng từ (PR/PO/WR, VO, IPC, hợp đồng, gói thầu, claim,
// rủi ro, thay đổi thiết kế, YCNT), nên một lỗi ở đây làm hỏng nhiều module cùng lúc. Bản cũ
// `ORDER BY <column> DESC` rồi `parseInt(...)` có hai lỗi thật:
//
//  1. So CHUỖI, không so SỐ. "VO-9" đứng sau "VO-0010" theo thứ tự chuỗi, nên mã kế tiếp tính
//     từ 9 và đâm thẳng vào dãy 0010+ đang có.
//  2. Không lọc đuôi phi số. Chỉ cần MỘT bản ghi lệch định dạng (mã nhập tay kiểu "VO-TEST-3",
//     "PO-KHAN-CAP", dữ liệu import cũ) là `parseInt` trả NaN → mã sinh ra thành "VO-NaN" →
//     lần sau lại NaN → đụng UNIQUE → `withUniqueRetry` thử đủ 5 lần đều NaN rồi bỏ cuộc.
//     Nghĩa là việc cấp mã cho TOÀN BỘ loại chứng từ đó hỏng vĩnh viễn, không tự khỏi.
//     Đây không phải giả thiết: bộ test đầy đủ đã dựng lại đúng tình huống này với VO.
//
// Nay chỉ xét bản ghi có đuôi TOÀN CHỮ SỐ và lấy MAX theo số. Bản ghi lệch định dạng bị bỏ
// qua thay vì làm hỏng cả bộ đếm. (`left(...)` thay cho LIKE để không phải escape %/_ trong
// prefix.)
export async function nextSeqCode(
  table: string,
  column: string,
  prefix: string,
  pad = 3,
): Promise<string> {
  const len = prefix.length;
  // `::int` là bắt buộc: tham số không định kiểu làm Postgres chọn nhánh
  // substring(text FROM text) — tức khớp REGEX chứ không cắt từ vị trí.
  const row = await queryOne<{ maxSeq: number | null }>(
    `SELECT MAX(CAST(substring(${column} FROM ?::int) AS bigint)) AS "maxSeq"
       FROM ${table}
      WHERE left(${column}, ?::int) = ?
        AND substring(${column} FROM ?::int) ~ '^[0-9]+$'`,
    len + 1,
    len,
    prefix,
    len + 1,
  );
  const seq = Number(row?.maxSeq ?? 0) + 1;
  return `${prefix}${String(seq).padStart(pad, "0")}`;
}

// Chạy lại fn khi đụng UNIQUE (mã trùng do tạo đồng thời) — sinh mã mới ở mỗi lần.
export async function withUniqueRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < tries && isUniqueViolation(e)) continue;
      throw e;
    }
  }
}
