// lib/pdf-extract.ts — M57 PR2: trích nội dung text-layer PDF lúc upload để lập chỉ
// mục tìm kiếm toàn văn (extracted_text). Phạm vi hẹp có chủ đích: CHỈ PDF có sẵn
// lớp chữ (không OCR ảnh scan — cần service ngoài, ghi backlog M57 khi cần).
//
// An toàn cho request upload: giới hạn 10 trang đầu + timeout 5s, mọi lỗi/PDF không
// có text layer đều trả về `null` ÊM (không throw) — KHÔNG BAO GIỜ được chặn upload,
// vì extract chỉ là tiện ích tìm kiếm phụ trợ, không phải điều kiện hợp lệ của file.
import { PDFParse } from "pdf-parse";

const MAX_PAGES = 10;
const TIMEOUT_MS = 5000;

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

// Trả về text đã trích (trang 1..10) hoặc `null` nếu: không phải PDF hợp lệ, không
// có text layer (scan ảnh thuần), quá thời gian cho phép, hoặc kết quả rỗng/toàn
// khoảng trắng (tránh lập chỉ mục rác).
export async function extractPdfText(buf: Buffer): Promise<string | null> {
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: buf });
    const result = await Promise.race([
      // pageJoiner rỗng: bỏ mốc phân trang mặc định ("-- N of M --") — mốc này luôn
      // được chèn dù trang không có chữ, khiến PDF scan ảnh thuần vẫn ra text "rác"
      // thay vì rỗng.
      parser.getText({ first: MAX_PAGES, pageJoiner: "" }),
      timeout(TIMEOUT_MS),
    ]);
    if (!result) return null; // timeout
    const text = result.text?.trim();
    return text ? text : null;
  } catch {
    return null;
  } finally {
    // destroy() giải phóng worker/tài nguyên pdfjs-dist — không chặn nếu lỗi.
    await parser?.destroy().catch(() => {});
  }
}
