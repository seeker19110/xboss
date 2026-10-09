import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { SoFixture, jreq, goi } from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 S15 — A5-AC03 phần barrier đồng thời cho thao tác THEO LÔ:
//   - PATCH /api/dimensions/batch (tick lô) chạy song song cùng task;
//   - POST /api/approvals (nghiệm thu cả tầng) chạy song song / song song với bỏ-tick lô.
// Gọi route handler thật, mỗi lời gọi trong ngữ cảnh request riêng (requestRieng) như Next.

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

async function tickLo(ids: number[], installed = true) {
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  return goi(requestRieng(() => PATCH(jreq(`/api/dimensions/batch`, { ids, installed }, "PATCH"))));
}

async function duyetTang(sheetTypeId: number, floorLabel: string) {
  const { POST } = await import("@/app/api/approvals/route");
  return goi(requestRieng(() => POST(jreq(`/api/approvals`, { sheetTypeId, floorLabel }))));
}

async function docTask(id: number) {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ status: string; progress: number }>(
    `SELECT status, progress_percent AS progress FROM tasks WHERE id = ?`,
    id,
  ))!;
}

async function lichSu(taskId: number) {
  const { query } = await import("@/lib/db");
  return query<{ oldP: number; newP: number; status: string | null }>(
    `SELECT old_progress AS "oldP", new_progress AS "newP", status
       FROM task_history WHERE task_id = ? ORDER BY id`,
    taskId,
  );
}

test(
  "A5-AC03: hai lô tick chồng nhau (3-6 ô chung) gửi đồng thời → không lost update, lịch sử là chuỗi liền mạch, không dòng trùng",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const pid = await f.duAn("s15lo");
      const cay = await f.wbs(pid, { soO: 6 });
      const ks = await f.user("engineer");
      await f.vao(ks, pid);

      const kq = await Promise.all([
        tickLo(cay.dims.slice(0, 4)), // ô 1-4
        tickLo(cay.dims.slice(2, 6)), // ô 3-6 (chồng ô 3-4)
      ]);
      assert.deepEqual(
        kq.map((r) => r.status),
        [200, 200],
        JSON.stringify(kq.map((r) => r.body)),
      );
      const t = await docTask(cay.taskId);
      assert.equal(t.progress, 1, "hợp hai lô = 6/6, không lô nào bị ghi đè");
      assert.equal(t.status, "hoan_thanh");

      const h = await lichSu(cay.taskId);
      assert.equal(h.length, 2, "mỗi lô đổi % đúng 1 lần → 2 dòng, không nhân đôi");
      for (const r of h) assert.notEqual(r.oldP, r.newP, "không ghi dòng lịch sử không đổi %");
      assert.equal(h[0].oldP, 0);
      assert.equal(h[1].oldP, h[0].newP, "chuỗi lịch sử liền mạch (không đọc ô cũ)");
      assert.equal(h[1].newP, 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC03: cùng một lô tick gửi trùng đồng thời (replay) → idempotent, đúng 1 dòng lịch sử",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const pid = await f.duAn("s15lo");
      const cay = await f.wbs(pid, { soO: 4 });
      const ks = await f.user("engineer");
      await f.vao(ks, pid);
      const ids = cay.dims.slice(0, 2);

      const kq = await Promise.all([tickLo(ids), tickLo(ids), tickLo(ids)]);
      assert.deepEqual(
        kq.map((r) => r.status),
        [200, 200, 200],
      );
      assert.equal((await docTask(cay.taskId)).progress, 0.5);
      assert.equal((await lichSu(cay.taskId)).length, 1, "replay không nhân dòng lịch sử");

      // Gửi lại tuần tự sau đó cũng không đổi gì.
      assert.equal((await tickLo(ids)).status, 200);
      assert.equal((await lichSu(cay.taskId)).length, 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC03: hai PM duyệt CẢ TẦNG đồng thời → đúng 1 lần (200 + 409), 1 floor_approval, 1 dòng nghiệm thu/task",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const pid = await f.duAn("s15tang");
      const cay = await f.wbs(pid, { soO: 2, floorLabel: "T1" });
      const ks = await f.user("engineer");
      await f.vao(ks, pid);
      assert.equal((await tickLo(cay.dims)).status, 200);
      const pm = await f.user("pm");
      await f.vao(pm, pid);

      const kq = await Promise.all([
        duyetTang(cay.sheetTypeId, "T1"),
        duyetTang(cay.sheetTypeId, "T1"),
      ]);
      assert.deepEqual(
        kq.map((r) => r.status).sort(),
        [200, 409],
        JSON.stringify(kq.map((r) => r.body)),
      );
      const t = await docTask(cay.taskId);
      assert.equal(t.status, "nghiem_thu");
      assert.equal(t.progress, 1);
      const nt = (await lichSu(cay.taskId)).filter((r) => r.status === "nghiem_thu");
      assert.equal(nt.length, 1, "không nhân dòng lịch sử nghiệm thu");

      const { queryOne } = await import("@/lib/db");
      const n = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM floor_approvals WHERE sheet_type_id = ? AND floor_label = 'T1'`,
        cay.sheetTypeId,
      );
      assert.equal(n!.n, 1, "đúng 1 bản ghi floor_approvals");

      // Replay tuần tự sau đó: vẫn 409, không thêm gì.
      assert.equal((await duyetTang(cay.sheetTypeId, "T1")).status, 409);
      assert.equal((await lichSu(cay.taskId)).filter((r) => r.status === "nghiem_thu").length, 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC03: duyệt tầng song song với bỏ-tick lô → không bao giờ có nghiem_thu khi % < 100 (không bypass 100%)",
  S,
  async () => {
    for (let lan = 0; lan < 3; lan++) {
      const f = new SoFixture();
      try {
        const pid = await f.duAn("s15race");
        const cay = await f.wbs(pid, { soO: 3, floorLabel: "T1" });
        const ks = await f.user("engineer");
        await f.vao(ks, pid);
        assert.equal((await tickLo(cay.dims)).status, 200);
        const pm = await f.user("pm");
        await f.vao(pm, pid);

        // Cùng cookie/phiên cho cả hai lời gọi: PM có quyền cả duyệt lẫn sửa tiến độ.
        const [duyet, bo] = await Promise.all([
          duyetTang(cay.sheetTypeId, "T1"),
          tickLo([cay.dims[0]], false),
        ]);
        const t = await docTask(cay.taskId);
        if (t.status === "nghiem_thu") {
          assert.equal(
            t.progress,
            1,
            `nghiem_thu ⇒ 100% (duyệt ${duyet.status}, bỏ tick ${bo.status})`,
          );
        } else {
          assert.ok(t.progress < 1, "chưa nghiệm thu thì bỏ tick đã thắng");
          assert.equal(duyet.status === 200, false);
        }
        // Mọi kết cục chấp nhận được đều không có 5xx (không deadlock / lỗi chưa kiểm soát).
        assert.ok(
          duyet.status < 500 && bo.status < 500,
          `duyệt ${duyet.status}, bỏ tick ${bo.status}`,
        );
      } finally {
        await f.don();
      }
    }
  },
);
