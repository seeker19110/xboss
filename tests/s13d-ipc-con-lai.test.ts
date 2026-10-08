import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S13d — dọn phần còn lại của IPC/payment-certs (A4 tiền exact, A5 chuỗi IPC).
// Mỗi ca tái hiện một lỗi thật qua route thật (TRAPS §6) hoặc lib khi lỗi nằm ở lib; đã thấy
// ĐỎ trên code trước S13d:
// 1. decide chọn cấp duyệt theo approval_requests.amount cũ (request trình trước bản vá S10a);
// 2. PATCH đợt không khoá hợp đồng → không tuần tự với lập đợt/trình/quyết định cùng HĐ;
// 3. saveCertItems gọi ngoài transaction → lỗi giữa chừng làm đợt mất dòng KL;
// 4. overContractCerts so float → cảnh báo vượt HĐ sai khi luỹ kế = đúng giá trị HĐ;
// 5. GET danh sách đợt không hỗ trợ decimal-string-v1;
// 6. approval_requests.amount tràn NUMERIC(15,2) lúc lập đợt/VO → 500 thay vì 422;
// + lớp lỗi anh em: đề xuất (proposal) sửa số tiền lúc nháp rồi trình → lách bước duyệt.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const HEADER = "X-XBoss-Money-Format";

const jreq = (url: string, body?: unknown, method = "POST", headers?: Record<string, string>) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

type Nguoi = { id: number; passwordHash: string };

async function dungNguoi(role: string): Promise<Nguoi> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES (?, ?, 'hash-test-s13d', ?, 1)`,
    `S13d ${role}`,
    `s13d-${uniq(role)}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-test-s13d" };
}

/** Flow 2 bước cho `entityType`: bước 1 pm (mọi giá trị), bước 2 cdt (≥ 1000) — hoặc steps tuỳ ý. */
async function taoFlow(
  projectId: number,
  entityType: string,
  steps: { seq: number; role: string; min: number | null }[] = [
    { seq: 1, role: "pm", min: null },
    { seq: 2, role: "cdt", min: 1000 },
  ],
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const flowId = await insertId(
    `INSERT INTO approval_flows (project_id, entity_type, name) VALUES (?, ?, ?)`,
    projectId,
    entityType,
    uniq("S13d flow "),
  );
  for (const s of steps)
    await insertId(
      `INSERT INTO approval_steps (flow_id, seq, role, min_amount) VALUES (?, ?, ?, ?)`,
      flowId,
      s.seq,
      s.role,
      s.min,
    );
  return flowId;
}

type HienTruong = {
  projectId: number;
  nguoiLap: Nguoi;
  nguoiDuyet: Nguoi;
  admin: Nguoi;
  contractId: number;
  boqIds: number[];
  flowIds: number[];
  taskIds: number[];
};

/** Dự án + PM lập + PM duyệt + admin + HĐ (giá trị/tỷ lệ 0) + các dòng BOQ theo đơn giá. */
async function dungHienTruong(
  dong: { unitPrice: string; qtyContract?: number }[] = [{ unitPrice: "500" }],
  contractValue = "0",
): Promise<HienTruong> {
  const { insertId } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S13d "));
  const nguoiLap = await dungNguoi("pm");
  const nguoiDuyet = await dungNguoi("pm");
  const admin = await dungNguoi("admin");
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, advance_pct, retention_pct, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ S13d', 'CĐT test', ?::numeric, 0, 0, 'active', ?)`,
    `HD-${uniq("S13d")}`,
    contractValue,
    projectId,
  );
  const boqIds: number[] = [];
  for (const [i, d] of dong.entries())
    boqIds.push(
      await insertId(
        `INSERT INTO boq_items (code, name, unit, qty_contract, unit_price, contract_id)
         VALUES (?, ?, 'm', ?, ?::numeric, ?)`,
        `BOQ-${uniq("S13d")}`,
        `Dòng ${i + 1}`,
        d.qtyContract ?? 1000,
        d.unitPrice,
        contractId,
      ),
    );
  return {
    projectId,
    nguoiLap,
    nguoiDuyet,
    admin,
    contractId,
    boqIds,
    flowIds: [],
    taskIds: [],
  };
}

async function donDep(f: HienTruong) {
  const { run } = await import("@/lib/db");
  for (const flowId of f.flowIds) {
    await run(`DELETE FROM approval_requests WHERE flow_id = ?`, flowId);
    await run(`DELETE FROM approval_flows WHERE id = ?`, flowId);
  }
  await run(`DELETE FROM payment_bills WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM payment_cert_decision_snapshots WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM payment_certs WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM boq_task_map WHERE task_id = ANY(?)`, f.taskIds);
  await run(`DELETE FROM boq_items WHERE contract_id = ?`, f.contractId);
  await run(`DELETE FROM contracts WHERE id = ?`, f.contractId);
  await run(`DELETE FROM proposals WHERE project_id = ?`, f.projectId);
  await run(
    `DELETE FROM boq_items WHERE vo_id IN (SELECT id FROM variation_orders WHERE project_id = ?)`,
    f.projectId,
  );
  await run(`DELETE FROM variation_orders WHERE project_id = ?`, f.projectId);
  await run(`DELETE FROM tasks WHERE id = ANY(?)`, f.taskIds);
  await run(
    `DELETE FROM work_packages WHERE sheet_type_id IN (
       SELECT st.id FROM sheet_types st JOIN towers t ON t.id = st.tower_id WHERE t.project_id = ?)`,
    f.projectId,
  );
  await run(
    `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
    f.projectId,
  );
  await run(`DELETE FROM towers WHERE project_id = ?`, f.projectId);
  const ids = [f.nguoiLap.id, f.nguoiDuyet.id, f.admin.id];
  await run(`DELETE FROM notifications WHERE user_id = ANY(?)`, ids);
  await run(`DELETE FROM user_projects WHERE user_id = ANY(?)`, ids);
  await run(`DELETE FROM users WHERE id = ANY(?)`, ids);
  await run(`DELETE FROM projects WHERE id = ?`, f.projectId);
  dangXuat();
}

/** Lập đợt (POST) → PATCH KL dòng 1 → trình (submit), tất cả bằng người lập; trả id đợt. */
async function lapVaTrinh(f: HienTruong, qtyPeriod: number): Promise<number> {
  const { POST } = await import("@/app/api/payment-certs/route");
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  const { POST: submit } = await import("@/app/api/payment-certs/[id]/submit/route");
  await dangNhapDuAn(f.nguoiLap, f.projectId);
  const tao = await POST(jreq("/api/payment-certs", { contractId: f.contractId }));
  assert.equal(tao.status, 201);
  const { id } = (await tao.json()) as { id: number };
  const sua = await PATCH(
    jreq(`/api/payment-certs/${id}`, { items: [{ boqItemId: f.boqIds[0], qtyPeriod }] }, "PATCH"),
    thamSo(id),
  );
  assert.equal(sua.status, 200);
  assert.equal((await submit(jreq(`/api/payment-certs/${id}/submit`), thamSo(id))).status, 200);
  return id;
}

// ---------- 1. Ngưỡng duyệt theo amount cũ (request trình trước bản vá S10a) ----------

test(
  "S13d-1: request IPC mang amount cũ (trình trước S10a) → decide chốt lại amount theo giá trị đợt, KHÔNG bỏ bước cdt",
  S,
  async () => {
    const f = await dungHienTruong();
    try {
      f.flowIds.push(await taoFlow(f.projectId, "payment_cert"));
      const { run, queryOne } = await import("@/lib/db");
      const { POST: decide } = await import("@/app/api/payment-certs/[id]/decide/route");
      const id = await lapVaTrinh(f, 10); // 10 × 500 = 5000 ≥ 1000 → phải qua cdt
      // Trạng thái dữ liệu legacy: đợt trình trước S10a giữ amount lúc lập nháp (0).
      await run(
        `UPDATE approval_requests SET amount = 0 WHERE entity_type = 'payment_cert' AND entity_id = ?`,
        id,
      );

      await dangNhapDuAn(f.nguoiDuyet, f.projectId);
      const res = await decide(
        jreq(`/api/payment-certs/${id}/decide`, { decision: "approved" }),
        thamSo(id),
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as { pending?: boolean; nextRole?: string };
      assert.equal(body.pending, true, "amount cũ 0 không được bỏ qua bước cdt ≥ 1000");
      assert.equal(body.nextRole, "cdt");
      const r = await queryOne<{ amount: string; status: string }>(
        `SELECT amount::text AS amount, status FROM approval_requests
          WHERE entity_type = 'payment_cert' AND entity_id = ?`,
        id,
      );
      assert.deepEqual(r, { amount: "5000.00", status: "pending" });
      const dot = await queryOne<{ status: string }>(
        `SELECT status FROM payment_certs WHERE id = ?`,
        id,
      );
      assert.equal(dot!.status, "submitted");
    } finally {
      await donDep(f);
    }
  },
);

test(
  "S13d-1: amount cũ ĐÃ làm bỏ qua một bước có seq nhỏ hơn bước hiện tại → 409 approval_amount_changed, không duyệt; từ chối vẫn được",
  S,
  async () => {
    const f = await dungHienTruong();
    try {
      f.flowIds.push(
        await taoFlow(f.projectId, "payment_cert", [
          { seq: 1, role: "pm", min: null },
          { seq: 2, role: "cdt", min: 1000 },
          { seq: 3, role: "admin", min: null },
        ]),
      );
      const { run, queryOne } = await import("@/lib/db");
      const { POST: decide } = await import("@/app/api/payment-certs/[id]/decide/route");
      const id = await lapVaTrinh(f, 10);
      // Legacy: amount 0 → bước 1 (pm) duyệt rồi nhảy thẳng bước 3, bỏ qua cdt.
      const req = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'payment_cert' AND entity_id = ?`,
        id,
      );
      await run(`UPDATE approval_requests SET amount = 0, current_seq = 3 WHERE id = ?`, req!.id);
      await run(
        `INSERT INTO approval_actions (request_id, step_seq, actor_id, decision) VALUES (?, 1, ?, 'approve')`,
        req!.id,
        f.nguoiDuyet.id,
      );

      await dangNhapDuAn(f.admin, f.projectId);
      const res = await decide(
        jreq(`/api/payment-certs/${id}/decide`, { decision: "approved" }),
        thamSo(id),
      );
      assert.equal(res.status, 409);
      assert.equal(((await res.json()) as { code?: string }).code, "approval_amount_changed");
      const dot = await queryOne<{ status: string }>(
        `SELECT status FROM payment_certs WHERE id = ?`,
        id,
      );
      assert.equal(dot!.status, "submitted", "409 không được duyệt đợt");
      assert.equal(
        (await queryOne(`SELECT id FROM payment_bills WHERE payment_cert_id = ?`, id)) ?? null,
        null,
      );

      const tuChoi = await decide(
        jreq(`/api/payment-certs/${id}/decide`, {
          decision: "rejected",
          rejectReason: "Lập lại để duyệt đúng cấp",
        }),
        thamSo(id),
      );
      assert.equal(tuChoi.status, 200);
    } finally {
      await donDep(f);
    }
  },
);

// ---------- 2. PATCH khoá hợp đồng → đợt ----------

test(
  "S13d-2: PATCH đợt nháp chờ khoá HỢP ĐỒNG (cùng thứ tự HĐ → đợt với lập đợt/trình/quyết định)",
  S,
  async () => {
    const f = await dungHienTruong();
    try {
      const { withTransaction, queryOne } = await import("@/lib/db");
      const { POST } = await import("@/app/api/payment-certs/route");
      const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
      await dangNhapDuAn(f.nguoiLap, f.projectId);
      const tao = await POST(jreq("/api/payment-certs", { contractId: f.contractId }));
      const { id } = (await tao.json()) as { id: number };

      let tha!: () => void;
      const choTha = new Promise<void>((r) => (tha = r));
      let daKhoa!: () => void;
      const khoaXong = new Promise<void>((r) => (daKhoa = r));
      const giuKhoa = withTransaction(async () => {
        await queryOne(`SELECT id FROM contracts WHERE id = ? FOR UPDATE`, f.contractId);
        daKhoa();
        await choTha;
      });
      await khoaXong;

      let xong = false;
      const patch = PATCH(
        jreq(
          `/api/payment-certs/${id}`,
          { items: [{ boqItemId: f.boqIds[0], qtyPeriod: 3 }] },
          "PATCH",
        ),
        thamSo(id),
      ).then((r) => {
        xong = true;
        return r;
      });
      await new Promise((r) => setTimeout(r, 500));
      const xongKhiHdBiKhoa = xong;
      tha();
      await giuKhoa;
      const res = await patch;
      assert.equal(xongKhiHdBiKhoa, false, "PATCH phải chờ khoá hợp đồng, không ghi chen ngang");
      assert.equal(res.status, 200);
    } finally {
      await donDep(f);
    }
  },
);

// ---------- 3. saveCertItems atomic ----------

test(
  "S13d-3: saveCertItems lỗi giữa chừng (dòng thứ 2 hỏng) → rollback, đợt giữ nguyên dòng KL cũ",
  S,
  async () => {
    const f = await dungHienTruong([{ unitPrice: "500" }, { unitPrice: "700" }]);
    try {
      const { insertId, query } = await import("@/lib/db");
      const { saveCertItems } = await import("@/lib/tai-chinh/paymentcerts");
      const certId = await insertId(
        `INSERT INTO payment_certs (code, contract_id, period_no) VALUES (?, ?, 1)`,
        uniq("IPC-S13d-"),
        f.contractId,
      );
      await saveCertItems(certId, f.contractId, [
        { boqItemId: f.boqIds[0], qtyPeriod: 4 },
        { boqItemId: f.boqIds[1], qtyPeriod: 6 },
      ]);
      const truoc = await query(
        `SELECT boq_item_id, qty_period::text FROM payment_cert_items WHERE cert_id = ? ORDER BY boq_item_id`,
        certId,
      );
      await assert.rejects(
        saveCertItems(certId, f.contractId, [
          { boqItemId: f.boqIds[0], qtyPeriod: 9 },
          { boqItemId: 2_000_000_000, qtyPeriod: 1 }, // FK hỏng → INSERT thứ 2 lỗi
        ]),
      );
      const sau = await query(
        `SELECT boq_item_id, qty_period::text FROM payment_cert_items WHERE cert_id = ? ORDER BY boq_item_id`,
        certId,
      );
      assert.deepEqual(sau, truoc, "DELETE + INSERT phải atomic — không mất/không lẫn dòng KL");
    } finally {
      await donDep(f);
    }
  },
);

// ---------- 4. overContractCerts exact ----------

test(
  "S13d-4: overContractCerts so NUMERIC exact — luỹ kế ĐÚNG BẰNG giá trị HĐ (~10^14, float lệch 1 xu) không cảnh báo; hơn 1 xu thì cảnh báo",
  S,
  async () => {
    // HĐ 9999999999999.92 + 9 phụ lục × 9999999999999.99 = 99999999999999.83.
    // 10 dòng BOQ, mỗi dòng luỹ kế 1 → Σ = 99999999999999.83 (đúng bằng). Float cũ:
    // Number(9999999999999983n)/100 = 99999999999999.84 > 99999999999999.83 → báo vượt SAI.
    const dong = [
      ...Array.from({ length: 9 }, () => ({ unitPrice: "9999999999999.99" })),
      { unitPrice: "9999999999999.92" },
    ];
    const f = await dungHienTruong(dong, "9999999999999.92");
    try {
      const { insertId, run } = await import("@/lib/db");
      const { overContractCerts, contractCumulativeValue } =
        await import("@/lib/tai-chinh/paymentcerts");
      for (let i = 0; i < 9; i++)
        await run(
          `INSERT INTO contract_addenda (contract_id, code, value_delta) VALUES (?, ?, 9999999999999.99)`,
          f.contractId,
          `PL-${i}`,
        );
      const certId = await insertId(
        `INSERT INTO payment_certs (code, contract_id, period_no, status) VALUES (?, ?, 1, 'approved')`,
        uniq("IPC-S13d-"),
        f.contractId,
      );
      for (const boqId of f.boqIds)
        await run(
          `INSERT INTO payment_cert_items (cert_id, boq_item_id, qty_period, qty_cumulative, unit_price)
           SELECT ?, id, 1, 1, unit_price FROM boq_items WHERE id = ?`,
          certId,
          boqId,
        );

      let over = await overContractCerts(f.projectId);
      assert.deepEqual(over, [], "luỹ kế đúng bằng giá trị HĐ không phải vượt");
      assert.equal(await contractCumulativeValue(f.contractId), 9999999999999983n);

      // Tăng 1 xu ở dòng cuối → vượt thật đúng 0,01 đ.
      await run(
        `UPDATE payment_cert_items SET unit_price = 9999999999999.93 WHERE cert_id = ? AND boq_item_id = ?`,
        certId,
        f.boqIds[9],
      );
      over = await overContractCerts(f.projectId);
      assert.equal(over.length, 1);
      assert.equal(over[0].cumulativeValue, 9999999999999984n);
      assert.equal(over[0].contractValue, 9999999999999983n);
      assert.equal(over[0].percent, 100n);
    } finally {
      const { run } = await import("@/lib/db");
      await run(`DELETE FROM contract_addenda WHERE contract_id = ?`, f.contractId);
      await donDep(f);
    }
  },
);

// ---------- 5. GET danh sách đợt: decimal-string-v1 opt-in ----------

test(
  "S13d-5: GET /api/payment-certs?contractId= — header decimal-string-v1 → dòng KL chuỗi canonical + moneyFormat; không header giữ number",
  S,
  async () => {
    const f = await dungHienTruong([{ unitPrice: "9007199254740.99" }]);
    try {
      const { POST, GET } = await import("@/app/api/payment-certs/route");
      const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
      await dangNhapDuAn(f.nguoiLap, f.projectId);
      const tao = await POST(jreq("/api/payment-certs", { contractId: f.contractId }));
      const { id } = (await tao.json()) as { id: number };
      await PATCH(
        jreq(
          `/api/payment-certs/${id}`,
          { items: [{ boqItemId: f.boqIds[0], qtyPeriod: 1.5 }] },
          "PATCH",
        ),
        thamSo(id),
      );
      const url = `/api/payment-certs?contractId=${f.contractId}`;

      const v1 = await GET(jreq(url, undefined, "GET", { [HEADER]: "decimal-string-v1" }));
      assert.equal(v1.status, 200);
      assert.match(v1.headers.get("Vary") ?? "", /X-XBoss-Money-Format/i);
      const b1 = (await v1.json()) as {
        moneyFormat?: string;
        certs: { id: number; items: Record<string, unknown>[] }[];
      };
      assert.equal(b1.moneyFormat, "decimal-string-v1");
      const d1 = b1.certs.find((c) => c.id === id)!.items[0];
      assert.equal(d1.unitPrice, "9007199254740.99");
      assert.equal(d1.qtyPeriod, "1.500");
      assert.equal(d1.qtyCumulative, "1.500");
      assert.equal(d1.boqQtyContract, "1000.000");
      assert.equal(typeof d1.boqItemId, "number", "ID giữ kiểu number");

      const cu = await GET(jreq(url, undefined, "GET"));
      assert.equal(cu.status, 200);
      const b0 = (await cu.json()) as {
        moneyFormat?: string;
        certs: { id: number; items: Record<string, unknown>[] }[];
      };
      assert.equal(b0.moneyFormat, undefined);
      const d0 = b0.certs.find((c) => c.id === id)!.items[0];
      assert.equal(d0.unitPrice, 9007199254740.99);
      assert.equal(d0.qtyPeriod, 1.5);
    } finally {
      await donDep(f);
    }
  },
);

// ---------- 6. approval_requests.amount tràn cột → 422 ----------

/** Dựng tiến độ 100% cho dòng BOQ đầu → KL gợi ý của đợt mới = qty_contract. */
async function tienDoXong(f: HienTruong) {
  const { insertId, run } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S13d')`,
    f.projectId,
  );
  const stId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet S13d')`,
    towerId,
    uniq("S13D"),
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'S1', 'Nhóm S13d')`,
    stId,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, 'S1,01', 'Task S13d', 1)`,
    pkgId,
  );
  f.taskIds.push(taskId);
  await run(
    `INSERT INTO boq_task_map (boq_item_id, task_id, weight) VALUES (?, ?, 1)`,
    f.boqIds[0],
    taskId,
  );
}

test(
  "S13d-6: lập đợt có flow, giá trị đợt vượt NUMERIC(15,2) của approval_requests.amount → 422 amount_overflow (không 500), không để lại đợt",
  S,
  async () => {
    // 2 × 9999999999999.99 = 19999999999999.98 — round-trip number được nhưng tràn cột (≥ 10^13).
    const f = await dungHienTruong([{ unitPrice: "9999999999999.99", qtyContract: 2 }]);
    try {
      f.flowIds.push(await taoFlow(f.projectId, "payment_cert"));
      await tienDoXong(f);
      const { queryOne } = await import("@/lib/db");
      const { POST } = await import("@/app/api/payment-certs/route");
      await dangNhapDuAn(f.nguoiLap, f.projectId);
      const res = await POST(jreq("/api/payment-certs", { contractId: f.contractId }));
      assert.equal(res.status, 422);
      assert.equal(((await res.json()) as { code?: string }).code, "amount_overflow");
      assert.equal(
        (await queryOne(`SELECT id FROM payment_certs WHERE contract_id = ?`, f.contractId)) ??
          null,
        null,
        "422 phải rollback cả đợt nháp",
      );
    } finally {
      await donDep(f);
    }
  },
);

test(
  "S13d-6 (anh em): lập VO có flow, tổng KL × đơn giá tràn approval_requests.amount → 422 amount_overflow, không để lại VO",
  S,
  async () => {
    const f = await dungHienTruong();
    try {
      f.flowIds.push(await taoFlow(f.projectId, "variation"));
      const { queryOne } = await import("@/lib/db");
      const { POST } = await import("@/app/api/variations/route");
      await dangNhapDuAn(f.nguoiLap, f.projectId);
      const res = await POST(
        jreq("/api/variations", {
          title: "VO S13d tràn",
          reason: "other",
          lines: [
            {
              code: uniq("VO-S13d-"),
              name: "Dòng",
              unit: "m",
              qty: 2,
              unitPrice: "9999999999999.99",
            },
          ],
        }),
      );
      assert.equal(res.status, 422);
      assert.equal(((await res.json()) as { code?: string }).code, "amount_overflow");
      assert.equal(
        (await queryOne(`SELECT id FROM variation_orders WHERE project_id = ?`, f.projectId)) ??
          null,
        null,
      );
    } finally {
      await donDep(f);
    }
  },
);

// ---------- Anh em lớp lỗi 1: đề xuất sửa số tiền lúc nháp rồi trình ----------

test(
  "S13d (anh em): đề xuất lập 1 đ → sửa thành 5000 đ lúc nháp → trình → bước pm KHÔNG chốt luôn (sang cdt ≥ 1000)",
  S,
  async () => {
    const f = await dungHienTruong();
    try {
      f.flowIds.push(await taoFlow(f.projectId, "proposal"));
      const { queryOne } = await import("@/lib/db");
      const { POST } = await import("@/app/api/proposals/route");
      const { PATCH } = await import("@/app/api/proposals/[id]/route");
      const { POST: submit } = await import("@/app/api/proposals/[id]/submit/route");
      const { POST: decide } = await import("@/app/api/proposals/[id]/decide/route");

      await dangNhapDuAn(f.nguoiLap, f.projectId);
      const tao = await POST(
        jreq("/api/proposals", { kind: "other", title: "Đề xuất S13d", amount: "1" }),
      );
      assert.equal(tao.status, 201);
      const { id } = (await tao.json()) as { id: number };
      const sua = await PATCH(
        jreq(
          `/api/proposals/${id}`,
          { kind: "other", title: "Đề xuất S13d", amount: "5000" },
          "PATCH",
        ),
        thamSo(id),
      );
      assert.equal(sua.status, 200);
      assert.equal((await submit(jreq(`/api/proposals/${id}/submit`), thamSo(id))).status, 200);

      const r = await queryOne<{ amount: string }>(
        `SELECT amount::text AS amount FROM approval_requests WHERE entity_type = 'proposal' AND entity_id = ?`,
        id,
      );
      assert.equal(r!.amount, "5000.00", "trình phải chốt lại amount theo số tiền hiện tại");

      await dangNhapDuAn(f.nguoiDuyet, f.projectId);
      const res = await decide(
        jreq(`/api/proposals/${id}/decide`, { decision: "approved" }),
        thamSo(id),
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as { pending?: boolean; nextRole?: string };
      assert.equal(body.pending, true);
      assert.equal(body.nextRole, "cdt");
      const dx = await queryOne<{ status: string }>(
        `SELECT status FROM proposals WHERE id = ?`,
        id,
      );
      assert.equal(dx!.status, "submitted");
    } finally {
      await donDep(f);
    }
  },
);
