import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// nextSeqCode cấp mã cho ÍT NHẤT 9 loại chứng từ (PR/PO/WR, VO, IPC, hợp đồng, gói thầu,
// claim, rủi ro, thay đổi thiết kế, YCNT). Một lỗi ở đây làm hỏng nhiều module cùng lúc, nên
// hai bất biến dưới đây được khoá riêng.

const S = { skip: !HAS_TEST_DB };

test(
  "nextSeqCode: bản ghi lệch định dạng KHÔNG làm hỏng bộ đếm của cả loại chứng từ",
  S,
  async () => {
    // Đây là lỗi thật, đã dựng lại được bằng bộ test đầy đủ: chỉ cần MỘT mã nhập tay kiểu
    // "VO-TEST-3" nằm trong bảng là `parseInt` của bản cũ trả NaN, mã sinh ra thành "VO-NaN",
    // lần sau lại NaN nên đụng UNIQUE, `withUniqueRetry` thử đủ 5 lần đều NaN rồi bỏ cuộc —
    // việc cấp mã VO hỏng VĨNH VIỄN, không tự khỏi. Cùng cơ chế đó áp cho PO/IPC/claim/…
    const { run, query } = await import("@/lib/db");
    const { nextSeqCode } = await import("@/lib/ha-tang/seqcode");

    await run(`DELETE FROM variation_orders WHERE code LIKE 'VOSEQ-%'`);
    for (const code of ["VOSEQ-0001", "VOSEQ-TEST-3", "VOSEQ-KHAN-CAP"]) {
      await run(
        `INSERT INTO variation_orders (code, title, reason, status) VALUES (?, 'x', 'other', 'draft')`,
        code,
      );
    }
    try {
      const ma = await nextSeqCode("variation_orders", "code", "VOSEQ-", 4);
      assert.equal(ma, "VOSEQ-0002", "mã lệch định dạng phải bị bỏ qua, không làm vỡ bộ đếm");
      assert.equal(ma.includes("NaN"), false);
    } finally {
      await run(`DELETE FROM variation_orders WHERE code LIKE 'VOSEQ-%'`);
      void query;
    }
  },
);

test("nextSeqCode: so SỐ chứ không so CHUỖI khi tìm mã lớn nhất", S, async () => {
  // "VOSEQ2-9" đứng SAU "VOSEQ2-0010" theo thứ tự chuỗi. Bản cũ `ORDER BY code DESC` vì thế
  // tính mã kế tiếp từ 9 và đâm thẳng vào dãy 0010+ đang có → đụng UNIQUE hàng loạt.
  const { run } = await import("@/lib/db");
  const { nextSeqCode } = await import("@/lib/ha-tang/seqcode");

  await run(`DELETE FROM variation_orders WHERE code LIKE 'VOSEQ2-%'`);
  for (const code of ["VOSEQ2-0010", "VOSEQ2-9"]) {
    await run(
      `INSERT INTO variation_orders (code, title, reason, status) VALUES (?, 'x', 'other', 'draft')`,
      code,
    );
  }
  try {
    assert.equal(await nextSeqCode("variation_orders", "code", "VOSEQ2-", 4), "VOSEQ2-0011");
  } finally {
    await run(`DELETE FROM variation_orders WHERE code LIKE 'VOSEQ2-%'`);
  }
});

test("nextSeqCode: bảng chưa có mã nào cho prefix đó → bắt đầu từ 1", S, async () => {
  const { run } = await import("@/lib/db");
  const { nextSeqCode } = await import("@/lib/ha-tang/seqcode");
  await run(`DELETE FROM variation_orders WHERE code LIKE 'VOSEQ3-%'`);
  assert.equal(await nextSeqCode("variation_orders", "code", "VOSEQ3-", 4), "VOSEQ3-0001");
});

test("nextSeqCode: prefix chứa ký tự đặc biệt của LIKE không làm lọc sai", S, async () => {
  // Bản cũ dùng LIKE `${prefix}%` — prefix chứa `_` sẽ khớp cả ký tự bất kỳ, kéo nhầm mã của
  // loại chứng từ khác vào bộ đếm. Nay dùng left(...) nên không còn phụ thuộc cú pháp LIKE.
  const { run } = await import("@/lib/db");
  const { nextSeqCode } = await import("@/lib/ha-tang/seqcode");
  await run(`DELETE FROM variation_orders WHERE code LIKE 'VO%SEQ4%'`);
  await run(
    `INSERT INTO variation_orders (code, title, reason, status) VALUES ('VOXSEQ4-0099', 'x', 'other', 'draft')`,
  );
  try {
    // "VO_SEQ4-" với LIKE sẽ khớp "VOXSEQ4-0099" (dấu _ là ký tự bất kỳ) và cho ra 0100.
    assert.equal(await nextSeqCode("variation_orders", "code", "VO_SEQ4-", 4), "VO_SEQ4-0001");
  } finally {
    await run(`DELETE FROM variation_orders WHERE code LIKE 'VO%SEQ4%'`);
  }
});
