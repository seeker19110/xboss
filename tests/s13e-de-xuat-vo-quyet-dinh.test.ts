import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { SoFixture, jreq, P, goi, uniq, type NguoiTest } from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 S13e — phần còn mở của S13d (spec cha docs/nang-cap/AUDIT-2026-09-25/ A4/A5):
// đề xuất (proposal) và phát sinh (VO) dùng chung engine phê duyệt với IPC nhưng chưa có các
// bảo đảm S13c/S13d đã làm cho IPC. Mỗi ca đi qua ROUTE THẬT với đúng người bấm (TRAPS §6), đã
// thấy ĐỎ trên code trước S13e:
// 1. decide đề xuất: lỗi có `status` của engine (403 SoD/vai trò, 404/409) văng thành 500;
// 2. decide đề xuất không cùng transaction với engine: từ chối thiếu lý do vẫn chốt bước reject
//    của engine → request mất, PM duyệt tiếp qua đường cũ (lách flow);
// 3. decide đề xuất chọn cấp duyệt theo approval_requests.amount cũ (như IPC S13d);
// 4. duyệt đề xuất trùng đồng thời → 2 phiếu thanh toán (không khoá dòng đề xuất);
// 5. lập VO đưa SUM float vào engine → so ngưỡng sai so với amount lưu trong DB;
// 6. decide VO chọn cấp duyệt theo amount cũ; 7. contract-add VO tràn value_delta → 500;
// 8. PATCH đề xuất chen giữa lúc trình → sửa được số tiền của đề xuất ĐÃ trình.

const S = { skip: !HAS_TEST_DB };

type Ca = {
  f: SoFixture;
  projectId: number;
  nguoiLap: NguoiTest;
  pm: NguoiTest;
  pm2: NguoiTest;
  contractId: number;
};

async function dungCa(): Promise<Ca> {
  const { insertId } = await import("@/lib/db");
  const f = new SoFixture();
  const projectId = await f.duAn("S13e");
  const nguoiLap = await f.user("pm");
  const pm = await f.user("pm");
  const pm2 = await f.user("pm");
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ S13e', 'Thầu phụ S13e', 0, 0, 0, 'active', ?)`,
    `HD-${uniq("S13e")}`,
    projectId,
  );
  return { f, projectId, nguoiLap, pm, pm2, contractId };
}

async function donCa(c: Ca) {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM payment_bills WHERE project_id = ? OR contract_id = ?`,
    c.projectId,
    c.contractId,
  );
  await run(`DELETE FROM proposals WHERE project_id = ?`, c.projectId);
  await run(`DELETE FROM contract_addenda WHERE contract_id = ?`, c.contractId);
  await run(
    `DELETE FROM boq_items WHERE vo_id IN (SELECT id FROM variation_orders WHERE project_id = ?)`,
    c.projectId,
  );
  await run(`DELETE FROM variation_orders WHERE project_id = ?`, c.projectId);
  await c.f.don();
}

/** Flow cho `entityType` của dự án: mặc định bước 1 pm (mọi giá trị), bước 2 cdt (≥ 1000). */
async function taoFlow(
  projectId: number,
  entityType: string,
  steps: { seq: number; role: string; min: number | null }[] = [
    { seq: 1, role: "pm", min: null },
    { seq: 2, role: "cdt", min: 1000 },
  ],
): Promise<void> {
  const { insertId } = await import("@/lib/db");
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, ?, ?)`,
    projectId,
    entityType,
    uniq("S13e flow "),
  );
  for (const s of steps)
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, ?, ?, ?)`,
      flowId,
      s.seq,
      s.role,
      s.min,
    );
}

/** Người lập tạo + trình đề xuất qua route thật; trả id. */
async function lapVaTrinhDeXuat(
  c: Ca,
  body: Record<string, unknown> = { kind: "other", title: "Đề xuất S13e", amount: "5000" },
): Promise<number> {
  const { POST } = await import("@/app/api/proposals/route");
  const { POST: submit } = await import("@/app/api/proposals/[id]/submit/route");
  await c.f.vao(c.nguoiLap, c.projectId);
  const tao = await goi(requestRieng(() => POST(jreq("/api/proposals", body))));
  assert.equal(tao.status, 201, JSON.stringify(tao.body));
  const id = tao.body!.id as number;
  const trinh = await goi(requestRieng(() => submit(jreq(`/api/proposals/${id}/submit`), P(id))));
  assert.equal(trinh.status, 200);
  return id;
}

async function quyetDeXuat(id: number, body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/proposals/[id]/decide/route");
  return goi(requestRieng(() => POST(jreq(`/api/proposals/${id}/decide`, body), P(id))));
}

async function trangThaiRequest(entityType: string, id: number) {
  const { queryOne } = await import("@/lib/db");
  return queryOne<{ status: string; amount: string | null; currentSeq: number }>(
    `SELECT status, amount::text AS amount, current_seq AS "currentSeq"
       FROM approval_requests WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1`,
    entityType,
    id,
  );
}

/**
 * Giữ `FOR UPDATE` dòng đề xuất trong một transaction trên kết nối RIÊNG (ngoài pool của app —
 * runner song song ghim pool còn 3 kết nối, giữ khoá + theo dõi bằng pool sẽ cạn kết nối), chạy
 * `fn` (các lời gọi route), chờ tới khi đủ `soCho` backend CỦA DB NÀY đứng đợi khoá ở câu khớp
 * `mauCau` rồi mới (tuỳ chọn) chạy `sqlTruocKhiNha` và COMMIT — mọi lời gọi đã đi qua phần đọc
 * trước khi ai kịp ghi, tái hiện chắc chắn cửa sổ đua thay vì phó mặc lịch chạy của event loop.
 */
async function trongKhiGiuKhoaDeXuat<T>(
  id: number,
  opts: { soCho: number; mauCau: string; sqlTruocKhiNha?: string },
  fn: () => Promise<T>,
): Promise<T> {
  const { Client } = await import("pg");
  const giu = new Client({ connectionString: process.env.DATABASE_URL });
  const theoDoi = new Client({ connectionString: process.env.DATABASE_URL });
  await giu.connect();
  await theoDoi.connect();
  try {
    await giu.query("BEGIN");
    await giu.query("SELECT id FROM proposals WHERE id = $1 FOR UPDATE", [id]);
    const ketQua = fn();
    ketQua.catch(() => undefined); // lỗi (nếu có) vẫn trả qua `await ketQua` bên dưới
    const hetHan = Date.now() + 20_000;
    while (Date.now() < hetHan) {
      const r = await theoDoi.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE $1`,
        [opts.mauCau],
      );
      if (r.rows[0].n >= opts.soCho) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    if (opts.sqlTruocKhiNha) await giu.query(opts.sqlTruocKhiNha, [id]);
    await giu.query("COMMIT");
    return await ketQua;
  } finally {
    await giu.end();
    await theoDoi.end();
  }
}

// ---------- 1. Lỗi có status của engine → đúng mã, không 500 ----------

test(
  "S13e-1: decide đề xuất — engine từ chối quyền (SoD/vai trò) trả 403 { error }, không văng 500",
  S,
  async () => {
    const c = await dungCa();
    try {
      await taoFlow(c.projectId, "proposal");
      const id = await lapVaTrinhDeXuat(c);

      // Người lập tự duyệt (SoD) → 403.
      const tuDuyet = await quyetDeXuat(id, { decision: "approved" });
      assert.equal(tuDuyet.status, 403);
      assert.match(String(tuDuyet.body?.error), /tự duyệt/);

      // Bước 1 xong (pm) → bước 2 là cdt: PM khác bấm tiếp → 403 vai trò, không 500.
      await c.f.vao(c.pm, c.projectId);
      const b1 = await quyetDeXuat(id, { decision: "approved" });
      assert.equal(b1.status, 200);
      assert.equal(b1.body?.nextRole, "cdt");
      await c.f.vao(c.pm2, c.projectId);
      const sai = await quyetDeXuat(id, { decision: "approved" });
      assert.equal(sai.status, 403);
      assert.match(String(sai.body?.error), /cdt/);
      assert.equal((await trangThaiRequest("proposal", id))!.status, "pending");
    } finally {
      await donCa(c);
    }
  },
);

// ---------- 2. Engine + domain cùng một transaction ----------

test(
  "S13e-2: từ chối đề xuất thiếu lý do khi có flow → lỗi rollback cả bước engine, PM không lách sang đường duyệt cũ",
  S,
  async () => {
    const c = await dungCa();
    try {
      await taoFlow(c.projectId, "proposal");
      const id = await lapVaTrinhDeXuat(c);
      await c.f.vao(c.pm, c.projectId);

      const thieu = await quyetDeXuat(id, { decision: "rejected" });
      assert.equal(thieu.status, 409);
      assert.deepEqual(
        { ...(await trangThaiRequest("proposal", id)) },
        { status: "pending", amount: "5000.00", currentSeq: 1 },
        "bước reject của engine phải rollback cùng lỗi nghiệp vụ",
      );

      // Request còn chờ → PM duyệt đi qua engine (sang bước cdt), KHÔNG chốt luôn qua đường cũ.
      const duyet = await quyetDeXuat(id, { decision: "approved" });
      assert.equal(duyet.status, 200);
      assert.equal(duyet.body?.pending, true);
      const { queryOne } = await import("@/lib/db");
      assert.equal(
        (await queryOne<{ status: string }>(`SELECT status FROM proposals WHERE id = ?`, id))!
          .status,
        "submitted",
      );
    } finally {
      await donCa(c);
    }
  },
);

// ---------- 3. Chốt lại amount trước khi quyết định ----------

test(
  "S13e-3: request đề xuất mang amount cũ → decide chốt lại theo số tiền hiện tại, KHÔNG bỏ bước cdt",
  S,
  async () => {
    const c = await dungCa();
    try {
      await taoFlow(c.projectId, "proposal");
      const id = await lapVaTrinhDeXuat(c);
      const { run, queryOne } = await import("@/lib/db");
      // Dữ liệu legacy: đề xuất trình trước S13d giữ amount lúc lập (vd 1 đ).
      await run(
        `UPDATE approval_requests SET amount = 1 WHERE entity_type = 'proposal' AND entity_id = ?`,
        id,
      );
      await c.f.vao(c.pm, c.projectId);
      const res = await quyetDeXuat(id, { decision: "approved" });
      assert.equal(res.status, 200);
      assert.equal(res.body?.pending, true, "amount cũ 1 đ không được bỏ qua bước cdt ≥ 1000");
      assert.equal(res.body?.nextRole, "cdt");
      assert.equal((await trangThaiRequest("proposal", id))!.amount, "5000.00");
      assert.equal(
        (await queryOne<{ status: string }>(`SELECT status FROM proposals WHERE id = ?`, id))!
          .status,
        "submitted",
      );
    } finally {
      await donCa(c);
    }
  },
);

// ---------- 4. Duyệt trùng đồng thời ----------

test(
  "S13e-4: hai PM duyệt cùng đề xuất tạm ứng đồng thời (không flow) → 1 thành công + 409, đúng 1 phiếu, tiền exact",
  S,
  async () => {
    const c = await dungCa();
    try {
      const id = await lapVaTrinhDeXuat(c, {
        kind: "advance",
        title: "Tạm ứng S13e",
        amount: "9999999999999.99",
        contractId: c.contractId,
      });
      const { POST } = await import("@/app/api/proposals/[id]/decide/route");
      await c.f.vao(c.pm, c.projectId);
      const goiDuyet = () =>
        goi(
          requestRieng(() =>
            POST(
              jreq(`/api/proposals/${id}/decide`, { decision: "approved", createBill: true }),
              P(id),
            ),
          ),
        );
      // Giữ khoá dòng đề xuất cho tới khi CẢ HAI lời gọi cùng đứng đợi khoá — tái hiện chắc chắn
      // cửa sổ "cùng đọc 'đã trình' rồi cùng ghi" thay vì phó mặc lịch chạy của event loop.
      const kq = await trongKhiGiuKhoaDeXuat(id, { soCho: 2, mauCau: "%proposals%" }, () =>
        Promise.all([goiDuyet(), goiDuyet()]),
      );
      assert.deepEqual(
        kq.map((k) => k.status).sort(),
        [200, 409],
        JSON.stringify(kq.map((k) => k.body)),
      );
      const { query } = await import("@/lib/db");
      const bills = await query<{ amount: string; type: string }>(
        `SELECT amount::text AS amount, type FROM payment_bills WHERE contract_id = ?`,
        c.contractId,
      );
      assert.deepEqual(bills, [{ amount: "9999999999999.99", type: "advance" }]);
    } finally {
      await donCa(c);
    }
  },
);

test(
  "S13e-4: duyệt trùng đồng thời khi có flow 1 bước → 1 thành công + 409, đúng 1 hành động duyệt",
  S,
  async () => {
    const c = await dungCa();
    try {
      await taoFlow(c.projectId, "proposal", [{ seq: 1, role: "pm", min: null }]);
      const id = await lapVaTrinhDeXuat(c);
      await c.f.vao(c.pm, c.projectId);
      const kq = await trongKhiGiuKhoaDeXuat(id, { soCho: 2, mauCau: "%proposals%" }, () =>
        Promise.all([
          quyetDeXuat(id, { decision: "approved" }),
          quyetDeXuat(id, { decision: "approved" }),
        ]),
      );
      assert.deepEqual(
        kq.map((k) => k.status).sort(),
        [200, 409],
        JSON.stringify(kq.map((k) => k.body)),
      );
      const { queryOne } = await import("@/lib/db");
      const dem = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM approval_actions a JOIN approval_requests r ON r.id = a.request_id
        WHERE r.entity_type = 'proposal' AND r.entity_id = ?`,
        id,
      );
      assert.equal(dem!.n, 1);
    } finally {
      await donCa(c);
    }
  },
);

// ---------- 5–7. Phát sinh (VO) ----------

async function lapVo(c: Ca, qty: number, unitPrice: string) {
  const { POST } = await import("@/app/api/variations/route");
  await c.f.vao(c.nguoiLap, c.projectId);
  const res = await goi(
    requestRieng(() =>
      POST(
        jreq("/api/variations", {
          title: "VO S13e",
          reason: "other",
          lines: [{ code: uniq("VO-S13e-"), name: "Dòng", unit: "m", qty, unitPrice }],
        }),
      ),
    ),
  );
  return res;
}

test(
  "S13e-5: lập VO — amount vào engine tính exact trong SQL (ROUND 2), không so ngưỡng trên float",
  S,
  async () => {
    const c = await dungCa();
    try {
      // 0.001 × 9 999 999 999 999.99 = 9 999 999 999.99999 → amount lưu 10 000 000 000.00. Float cũ
      // so 9 999 999 999.99999 < ngưỡng 10^10 → bỏ bước cdt, request tự "approved" dù amount lưu
      // đúng bằng ngưỡng.
      await taoFlow(c.projectId, "variation", [{ seq: 1, role: "cdt", min: 10_000_000_000 }]);
      const res = await lapVo(c, 0.001, "9999999999999.99");
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.deepEqual(
        { ...(await trangThaiRequest("variation", res.body!.id as number)) },
        { status: "pending", amount: "10000000000.00", currentSeq: 1 },
      );
    } finally {
      await donCa(c);
    }
  },
);

test(
  "S13e-6: request VO mang amount cũ → decide chốt lại theo giá trị VO hiện tại, KHÔNG bỏ bước cdt",
  S,
  async () => {
    const c = await dungCa();
    try {
      await taoFlow(c.projectId, "variation");
      const tao = await lapVo(c, 10, "500"); // 5000 ≥ 1000 → phải qua cdt
      assert.equal(tao.status, 201);
      const id = tao.body!.id as number;
      const { run, queryOne } = await import("@/lib/db");
      const { POST: submit } = await import("@/app/api/variations/[id]/submit/route");
      const { POST: decide } = await import("@/app/api/variations/[id]/decide/route");
      await c.f.vao(c.pm, c.projectId);
      assert.equal(
        (await goi(requestRieng(() => submit(jreq(`/api/variations/${id}/submit`), P(id))))).status,
        200,
      );
      await run(
        `UPDATE approval_requests SET amount = 0 WHERE entity_type = 'variation' AND entity_id = ?`,
        id,
      );
      const res = await goi(
        requestRieng(() =>
          decide(jreq(`/api/variations/${id}/decide`, { decision: "approved" }), P(id)),
        ),
      );
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body?.pending, true, "amount cũ 0 không được bỏ qua bước cdt ≥ 1000");
      assert.equal(res.body?.nextRole, "cdt");
      assert.equal((await trangThaiRequest("variation", id))!.amount, "5000.00");
      assert.equal(
        (await queryOne<{ status: string }>(
          `SELECT status FROM variation_orders WHERE id = ?`,
          id,
        ))!.status,
        "submitted",
      );
    } finally {
      await donCa(c);
    }
  },
);

test(
  "S13e-7: đưa VO đã duyệt vào phụ lục — giá trị exact; tràn value_delta NUMERIC(15,2) → 422, không 500",
  S,
  async () => {
    const c = await dungCa();
    try {
      const { POST: submit } = await import("@/app/api/variations/[id]/submit/route");
      const { POST: decide } = await import("@/app/api/variations/[id]/decide/route");
      const { POST: themPhuLuc } = await import("@/app/api/variations/[id]/contract-add/route");
      const { queryOne } = await import("@/lib/db");
      const duyetVo = async (qty: number, unitPrice: string) => {
        const tao = await lapVo(c, qty, unitPrice);
        assert.equal(tao.status, 201, JSON.stringify(tao.body));
        const id = tao.body!.id as number;
        await c.f.vao(c.pm, c.projectId);
        assert.equal(
          (await goi(requestRieng(() => submit(jreq(`/api/variations/${id}/submit`), P(id)))))
            .status,
          200,
        );
        const d = await goi(
          requestRieng(() =>
            decide(jreq(`/api/variations/${id}/decide`, { decision: "approved" }), P(id)),
          ),
        );
        assert.equal(d.status, 200, JSON.stringify(d.body));
        return id;
      };
      const phuLuc = (id: number) =>
        goi(
          requestRieng(() =>
            themPhuLuc(
              jreq(`/api/variations/${id}/contract-add`, {
                contractId: c.contractId,
                addendaCode: uniq("PL-S13e-"),
              }),
              P(id),
            ),
          ),
        );

      const tran = await duyetVo(2, "9999999999999.99");
      const r1 = await phuLuc(tran);
      assert.equal(r1.status, 422, JSON.stringify(r1.body));
      assert.equal(
        (await queryOne<{ status: string }>(
          `SELECT status FROM variation_orders WHERE id = ?`,
          tran,
        ))!.status,
        "approved",
      );

      const thuong = await duyetVo(0.001, "1234567.89"); // 1234.56789 → 1234.57
      const r2 = await phuLuc(thuong);
      assert.equal(r2.status, 201, JSON.stringify(r2.body));
      const pl = await queryOne<{ v: string }>(
        `SELECT value_delta::text AS v FROM contract_addenda WHERE id = ?`,
        r2.body!.addendaId as number,
      );
      assert.equal(pl!.v, "1234.57");
    } finally {
      await donCa(c);
    }
  },
);

// ---------- 8. PATCH đề xuất chen giữa lúc trình ----------

test(
  "S13e-8: PATCH đề xuất đọc 'nháp' rồi bị trình chen giữa → 409, không sửa được số tiền đề xuất đã trình",
  S,
  async () => {
    const c = await dungCa();
    try {
      const { POST } = await import("@/app/api/proposals/route");
      const { PATCH } = await import("@/app/api/proposals/[id]/route");
      const { queryOne } = await import("@/lib/db");
      await c.f.vao(c.nguoiLap, c.projectId);
      const tao = await goi(
        requestRieng(() =>
          POST(jreq("/api/proposals", { kind: "other", title: "DX", amount: "1" })),
        ),
      );
      const id = tao.body!.id as number;

      // Giữ khoá dòng đề xuất (như submit đang chạy) → PATCH đọc 'nháp' rồi chờ ở UPDATE; trình
      // xong (status = 'submitted') mới nhả khoá.
      const res = await trongKhiGiuKhoaDeXuat(
        id,
        {
          soCho: 1,
          mauCau: "UPDATE proposals SET kind%",
          sqlTruocKhiNha: "UPDATE proposals SET status = 'submitted' WHERE id = $1",
        },
        () =>
          goi(
            requestRieng(() =>
              PATCH(
                jreq(
                  `/api/proposals/${id}`,
                  { kind: "other", title: "DX", amount: "999999" },
                  "PATCH",
                ),
                P(id),
              ),
            ),
          ),
      );
      assert.equal(res.status, 409, JSON.stringify(res.body));
      const dx = await queryOne<{ amount: string; status: string }>(
        `SELECT amount::text AS amount, status FROM proposals WHERE id = ?`,
        id,
      );
      assert.deepEqual({ ...dx }, { amount: "1.00", status: "submitted" });
    } finally {
      await donCa(c);
    }
  },
);
