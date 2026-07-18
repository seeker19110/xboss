import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M57 PR2 — trích text-layer PDF lúc upload (lib/pdf-extract.ts) + lập chỉ mục tìm
// kiếm trên cột extracted_text (task_documents/contract_documents/project_documents,
// migrations/0071_extracted_text.sql).
//
// Test route upload thật (POST /api/*/documents) cần context cookies()/next-headers
// của 1 request thật — không có sẵn khi chạy ngoài Next.js runtime (cùng lý do
// tests/document-hash.test.ts mirror thao tác DB của route thay vì gọi route handler
// trực tiếp). Test dưới đây kiểm (a) extractPdfText thuần ở tầng lib (không cần DB),
// (b) hành vi ghi cột extracted_text + tìm được qua registry search ở tầng DB (mirror
// đúng câu INSERT + logic ext===".pdf" của route POST /api/project-documents).

// PDF hợp lệ tối giản (raw PDF syntax) — vẽ 1 dòng text qua toán tử Tj trong content
// stream. Dùng để test có/không có text layer bằng cách bật/tắt nội dung vẽ.
function buildMinimalPdf(text: string | null): Buffer {
  const contentOps = text
    ? `BT /F1 18 Tf 20 100 Td (${text.replace(/[()\\]/g, "")}) Tj ET`
    : ""; // rỗng = không có text layer (mô phỏng PDF scan ảnh thuần)
  const content = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 900 200]/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${contentOps.length}>>stream
${contentOps}
endstream
endobj
xref
0 6
trailer<</Size 6/Root 1 0 R>>
startxref
0
%%EOF`;
  return Buffer.from(content, "latin1");
}

test("extractPdfText: PDF có text layer → trả về text chứa nội dung đã vẽ", async () => {
  const { extractPdfText } = await import("@/lib/pdf-extract");
  const buf = buildMinimalPdf("Hello XBoss nghiem thu");
  const text = await extractPdfText(buf);
  assert.ok(text, "phải trích được text");
  assert.match(text!, /Hello XBoss/);
});

test("extractPdfText: PDF không có text layer (content stream rỗng) → trả về null, không throw", async () => {
  const { extractPdfText } = await import("@/lib/pdf-extract");
  const buf = buildMinimalPdf(null);
  const text = await extractPdfText(buf);
  assert.equal(text, null);
});

test("extractPdfText: buffer không phải PDF hợp lệ → trả về null êm, không throw", async () => {
  const { extractPdfText } = await import("@/lib/pdf-extract");
  const buf = Buffer.from("đây không phải file PDF, chỉ là text thường");
  const text = await extractPdfText(buf);
  assert.equal(text, null);
});

test("extractPdfText: không treo quá thời gian cho phép (kể cả input lớn/nhiều trang)", async () => {
  const { extractPdfText } = await import("@/lib/pdf-extract");
  // PDF nhiều "trang" mô phỏng bằng buffer rác lớn (không parse được nhưng đủ lớn để
  // kiểm hàm không phình thời gian xử lý) — timeout cứng 5s trong extractPdfText đảm
  // bảo hàm luôn trả lời trong khoảng hợp lý dù input bất thường.
  const junk = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(2_000_000, 0x41)]);
  const started = Date.now();
  const text = await extractPdfText(junk);
  const elapsed = Date.now() - started;
  assert.equal(text, null);
  // 5s timeout + biên độ dư cho máy chậm — chứng minh không treo vô hạn request upload.
  assert.ok(elapsed < 8000, `extractPdfText phải trả lời nhanh, mất ${elapsed}ms`);
});

test(
  "project_documents.extracted_text: PDF có text layer ghi đúng cột và tìm được qua searchSources",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { extractPdfText } = await import("@/lib/pdf-extract");
    const { searchSources } = await import("@/lib/search");

    const projectId = await insertId(
      `INSERT INTO projects (name) VALUES (?)`,
      `PDF-FTS-${Date.now()}`,
    );

    const buf = buildMinimalPdf("noi dung bien ban nghiem thu dac biet pdfextract");
    const extractedText = await extractPdfText(buf); // đúng như route ext===".pdf"
    assert.ok(extractedText);

    const docId = await insertId(
      `INSERT INTO project_documents (title, file_name, original_name, mime_type, size_bytes, project_id, extracted_text)
       VALUES (?, ?, ?, 'application/pdf', ?, ?, ?)`,
      "Tài liệu test PR2",
      `pr2-${Date.now()}.pdf`,
      `pr2-${Date.now()}.pdf`,
      buf.length,
      projectId,
      extractedText,
    );

    const row = await queryOne<{ extracted_text: string | null }>(
      `SELECT extracted_text FROM project_documents WHERE id = ?`,
      docId,
    );
    assert.ok(row?.extracted_text);

    // Tìm theo từ khoá NẰM TRONG NỘI DUNG (không nằm trong title) — chỉ khớp được nếu
    // extracted_text có trong index/ftsExpr, không phải chỉ title.
    const hits = await searchSources("admin", projectId, "pdfextract", "pdfextract%");
    assert.ok(
      hits.some((h) => h.kind === "document" && h.id === docId),
      "phải tìm được tài liệu qua nội dung PDF trích được",
    );

    await run(`DELETE FROM project_documents WHERE id = ?`, docId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);

test(
  "project_documents.extracted_text: PDF không có text layer → cột NULL, không lỗi khi ghi",
  { skip: !HAS_TEST_DB },
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { extractPdfText } = await import("@/lib/pdf-extract");

    const projectId = await insertId(
      `INSERT INTO projects (name) VALUES (?)`,
      `PDF-FTS-NULL-${Date.now()}`,
    );

    const buf = buildMinimalPdf(null); // scan ảnh thuần, không có text layer
    const extractedText = await extractPdfText(buf);
    assert.equal(extractedText, null);

    const docId = await insertId(
      `INSERT INTO project_documents (title, file_name, original_name, mime_type, size_bytes, project_id, extracted_text)
       VALUES (?, ?, ?, 'application/pdf', ?, ?, ?)`,
      "Tài liệu scan không chữ",
      `pr2-scan-${Date.now()}.pdf`,
      `pr2-scan-${Date.now()}.pdf`,
      buf.length,
      projectId,
      extractedText,
    );

    const row = await queryOne<{ extracted_text: string | null }>(
      `SELECT extracted_text FROM project_documents WHERE id = ?`,
      docId,
    );
    assert.equal(row?.extracted_text, null);

    await run(`DELETE FROM project_documents WHERE id = ?`, docId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
  },
);
