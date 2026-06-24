// Helper cho lưới kiểu bảng tính (SpreadsheetGrid): chuyển dữ liệu vùng ô
// sang/từ định dạng TSV của clipboard — đúng cách Excel/Google Sheets dùng.
//
// Quy ước TSV: cột ngăn bằng TAB, dòng ngăn bằng LF. Ô chứa TAB/xuống dòng/
// dấu nháy kép được bọc trong "..." và nháy kép bên trong nhân đôi (RFC-4180,
// đúng cách Excel xuất). Phần lớn ô tracking/vật tư không có ký tự đặc biệt nên
// hiếm khi cần bọc, nhưng vẫn xử lý để dán ghi chú nhiều dòng không vỡ lưới.

type Cell = string | number | boolean | null | undefined;

function needsQuote(s: string): boolean {
  return s.includes("\t") || s.includes("\n") || s.includes("\r") || s.includes('"');
}

function quoteCell(s: string): string {
  return needsQuote(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Ma trận giá trị ô → chuỗi TSV ghi vào clipboard.
export function serializeTSV(matrix: Cell[][]): string {
  return matrix
    .map((row) =>
      row.map((c) => quoteCell(c === null || c === undefined ? "" : String(c))).join("\t"))
    .join("\n");
}

// Chuỗi TSV từ clipboard → ma trận chuỗi. Hỗ trợ ô bọc nháy kép có TAB/xuống
// dòng bên trong. CRLF/CR được chuẩn hoá về LF khi tách dòng.
export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"' && field === "") { inQuotes = true; i++; continue; }
    if (ch === "\t") { pushField(); i++; continue; }
    if (ch === "\n") { pushRow(); i++; continue; }
    if (ch === "\r") { if (text[i + 1] === "\n") i++; pushRow(); i++; continue; }
    field += ch; i++;
  }
  // Phần còn lại sau ký tự cuối: chỉ thêm nếu có nội dung hoặc đã có ô trong dòng
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

// Toạ độ vùng chọn hình chữ nhật trên lưới (theo chỉ số dòng/cột hiển thị).
export type Rect = { r0: number; c0: number; r1: number; c1: number };

// Chuẩn hoá 2 ô đầu/cuối (kéo theo hướng nào cũng được) → hình chữ nhật r0≤r1, c0≤c1.
export function normalizeRect(a: { r: number; c: number }, b: { r: number; c: number }): Rect {
  return {
    r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r),
    c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c),
  };
}

// Lát ma trận dán vào vùng bắt đầu từ (anchorR, anchorC): với mỗi ô đích trả về
// giá trị chuỗi nguồn. Excel lặp lại nguồn nếu vùng đích lớn hơn (chỉ khi nguồn
// là 1 ô hoặc 1 hàng/cột) — ở đây giữ đơn giản: dán đúng kích thước nguồn, không
// lặp. Trả danh sách { r, c, raw } để bên gọi map sang patch theo cột.
export function spreadPaste(
  matrix: string[][],
  anchorR: number,
  anchorC: number,
): { r: number; c: number; raw: string }[] {
  const out: { r: number; c: number; raw: string }[] = [];
  for (let dr = 0; dr < matrix.length; dr++) {
    for (let dc = 0; dc < matrix[dr].length; dc++) {
      out.push({ r: anchorR + dr, c: anchorC + dc, raw: matrix[dr][dc] });
    }
  }
  return out;
}
