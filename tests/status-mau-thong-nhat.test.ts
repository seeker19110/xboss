import { test } from "node:test";
import assert from "node:assert/strict";
import { STATUS_BAR, STATUS_CLS, STATUS_TEXT } from "@/app/components/StatusBadge";
import { STATUS_LABEL, type StatusSlug } from "@/lib/tien-do/status";

// AUD-XFEAT-001 (audit 06/11/2026): bảng màu trạng thái task từng được viết lại ở 3 nơi và lệch
// nhau (trễ cam ở chip/Gantt nhưng đỏ ở /my-tasks; đang thi công blue vs sky). Nay một nguồn
// trong StatusBadge.tsx — test khoá: mọi trạng thái có đủ 3 bảng và CÙNG một sắc độ Tailwind.

const sacDo = (cls: string) => {
  const m = cls.match(/\b(?:bg|text)-([a-z]+)-\d{2,3}\b/);
  assert.ok(m, `không đọc được sắc độ từ "${cls}"`);
  return m[1];
};

test("mọi trạng thái có đủ chip, thanh Gantt, chữ — cùng một sắc độ", () => {
  for (const slug of Object.keys(STATUS_LABEL) as StatusSlug[]) {
    const chip = sacDo(STATUS_CLS[slug]);
    assert.equal(sacDo(STATUS_BAR[slug]), chip, `${slug}: thanh Gantt lệch chip`);
    assert.equal(sacDo(STATUS_TEXT[slug]), chip, `${slug}: chữ lệch chip`);
  }
});

test("trễ = cam (quy ước CLAUDE.md), không dùng đỏ", () => {
  assert.equal(sacDo(STATUS_CLS.tre), "orange");
});
