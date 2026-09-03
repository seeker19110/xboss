import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { dungLoTick, oTrongVung, MAX_O_MOI_LO } from "@/app/tracking/[sheet]/tick";
import type { Cell } from "@/app/tracking/[sheet]/types";

// M121 — logic thuần của tick theo lô. Route handler và React không chạy được ở đây, nên
// mọi quyết định "gửi ô nào, chặn khi nào" đã hạ xuống hàm thuần để khoá bằng test.

const o = (id: number, installed = false): Cell => ({ id, installed });

test("dungLoTick: AC2 — bỏ ô không có thật (lưới thưa), chỉ gửi ô có bản ghi", () => {
  // Task thêm sau có thể chưa đủ cột → chỗ đó render dấu "·", không có progress_dimensions nào.
  const r = dungLoTick([o(1), undefined, o(2), undefined, o(3)]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.ids, [1, 2, 3]);
});

test("dungLoTick: KHÔNG lọc ô đã đúng trạng thái đích — giữ nguyên cụm để hoàn tác không hụt", () => {
  // Lô ở server idempotent; lọc bớt ô "đã tick rồi" sẽ làm undo khôi phục thiếu ô.
  const r = dungLoTick([o(1, true), o(2, false), o(3, true)]);
  assert.deepEqual(r.ok && r.ids, [1, 2, 3]);
});

test("dungLoTick: AC3 — quá MAX_O_MOI_LO thì chặn ở client, không gửi request", () => {
  const qua = Array.from({ length: MAX_O_MOI_LO + 1 }, (_, i) => o(i + 1));
  const r = dungLoTick(qua);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.loi : "", /tối đa 1000 ô/);
  assert.match(!r.ok ? r.loi : "", /đang chọn 1001/);

  // Đúng bằng trần thì vẫn cho qua (biên).
  const vua = dungLoTick(Array.from({ length: MAX_O_MOI_LO }, (_, i) => o(i + 1)));
  assert.equal(vua.ok, true);
  assert.equal(vua.ok && vua.ids.length, MAX_O_MOI_LO);
});

test("dungLoTick: vùng toàn ô không có thật → ids rỗng, hợp lệ (lớp gọi tự no-op)", () => {
  const r = dungLoTick([undefined, undefined]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.ids, []);
});

// ===== oTrongVung: gom ô của một vùng chữ nhật (hàng = task, cột = nhãn) =====

const dungTask = (id: number, nhan: string[], batDauId: number) => ({
  id,
  cells: Object.fromEntries(nhan.map((n, i) => [n, o(batDauId + i)])) as Record<string, Cell>,
});

test("oTrongVung: lấy đúng ô trong hình chữ nhật, thứ tự hàng rồi cột", () => {
  const cot = ["A", "B", "C"];
  const tasks = [dungTask(1, cot, 10), dungTask(2, cot, 20), dungTask(3, cot, 30)];
  // Vùng 2 hàng × 2 cột giữa lưới.
  const ids = oTrongVung(tasks, cot, { r0: 0, c0: 1, r1: 1, c1: 2 }).map((c) => c.id);
  assert.deepEqual(ids, [11, 12, 21, 22]);
});

test("oTrongVung: bỏ qua hàng/cột ngoài biên và ô khuyết, không throw", () => {
  const cot = ["A", "B"];
  const tasks = [dungTask(1, ["A"], 10), dungTask(2, cot, 20)]; // task 1 thiếu cột B
  const ids = oTrongVung(tasks, cot, { r0: 0, c0: 0, r1: 5, c1: 5 }).map((c) => c.id);
  assert.deepEqual(ids, [10, 20, 21], "chỉ ô có thật, không NaN, không lỗi biên");
});
