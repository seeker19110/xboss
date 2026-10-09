import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { SoFixture, jreq, P, goi, uniq, type NguoiTest } from "./helpers/chuoi-nghiep-vu";

// A1-AC05 / Q-AC01 (APPROVAL D01) mở rộng — tái kiểm quyền lúc ghi ở đường TÀI CHÍNH và QUẢN TRỊ
// ngoài nghiệm thu/IPC (đã phủ ở s16-stale-snapshot). Khuôn y hệt: một kết nối riêng giữ khoá mà
// route thật sẽ chờ TRƯỚC bước ghi (sau khi đã xác thực + nạp snapshot quyền), trong lúc kẹt admin
// đổi override qua route thật, rồi nhả khoá. Không mock module nào.
//
// Route đại diện (4):
//   1. PATCH /api/payment-certs/:id        (manageContracts) — kẹt ở khoá HĐ FOR UPDATE
//   2. POST  /api/variations/:id/contract-add (manageContracts) — kẹt ở khoá VO FOR UPDATE
//   3. PATCH /api/advances/:id (settle)    (manageFinance)   — kẹt ở LOCK TABLE advances
//   4. PATCH /api/admin/webhooks/:id       (manageIntegrations, quản trị) — kẹt ở LOCK TABLE webhooks
//
// Override đặt THEO DỰ ÁN của ca để không ảnh hưởng file test chạy song song.

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

type KetQua = { status: number; body: Record<string, unknown> | null };

async function chenGiuaKhoa(
  sqlKhoa: string,
  thamSo: unknown[],
  r1: () => Promise<KetQua>,
  giua: () => Promise<void>,
): Promise<KetQua> {
  const { getPool } = await import("@/lib/db");
  const c = await getPool().connect();
  let daNha = false;
  const nha = async () => {
    if (daNha) return;
    daNha = true;
    await c.query("COMMIT").catch(() => {});
    c.release();
  };
  try {
    await c.query("BEGIN");
    const pid = (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await c.query(sqlKhoa, thamSo);
    const dangBay = r1();
    let ket = false;
    for (let i = 0; i < 200 && !ket; i++) {
      const r = await getPool().query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
        [pid],
      );
      ket = r.rows[0].n > 0;
      if (!ket) await new Promise((ok) => setTimeout(ok, 25));
    }
    if (!ket) {
      await nha();
      await dangBay.catch(() => {});
      assert.fail("R1 không kẹt ở khoá như kỳ vọng — điểm chèn không còn đúng");
    }
    await giua();
    await nha();
    return await dangBay;
  } finally {
    await nha();
  }
}

/** Admin cùng org ghi override (role, permKey) qua route thật, trong ngữ cảnh request riêng. */
async function datOverride(
  f: SoFixture,
  admin: NguoiTest,
  projectId: number,
  role: string,
  permKey: string,
  allowed: boolean | null,
): Promise<void> {
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  await f.vao(admin, projectId);
  const r = await goi(
    requestRieng(() =>
      PATCH(jreq(`/api/admin/role-permissions`, { role, permKey, allowed, projectId }, "PATCH")),
    ),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

const rq = <T>(fn: () => Promise<T>) => requestRieng(fn);

async function taoHopDong(pm: NguoiTest, f: SoFixture, projectId: number) {
  const { POST } = await import("@/app/api/contracts/route");
  await f.vao(pm, projectId);
  const hd = await goi(
    rq(() =>
      POST(
        jreq(`/api/contracts`, {
          code: uniq("HD-S16B-"),
          kind: "nhan_thau",
          title: "HĐ S16 mở rộng",
          partyName: "CĐT S16",
          status: "active",
          value: 100000,
          advancePct: 0,
          retentionPct: 0,
        }),
      ),
    ),
  );
  assert.equal(hd.status, 201, JSON.stringify(hd.body));
  return hd.body!.id as number;
}

// ── 1. payment-certs PATCH (manageContracts) ─────────────────────────────────────────────

async function dungDotNhap(f: SoFixture) {
  const { run } = await import("@/lib/db");
  const projectId = await f.duAn("S16B-IPC");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  const contractId = await taoHopDong(pm, f, projectId);
  const { POST: taoBoq } = await import("@/app/api/boq/route");
  const bq = await goi(
    rq(() =>
      taoBoq(
        jreq(`/api/boq`, {
          code: uniq("BOQ-S16B-"),
          name: "Ống S16B",
          unit: "m",
          systemId: null,
          qtyContract: 100,
          unitPrice: 1000,
        }),
      ),
    ),
  );
  assert.equal(bq.status, 201, JSON.stringify(bq.body));
  const boqId = bq.body!.id as number;
  await run(`UPDATE boq_items SET contract_id = ? WHERE id = ?`, contractId, boqId);
  const { POST: lap } = await import("@/app/api/payment-certs/route");
  const dot = await goi(rq(() => lap(jreq(`/api/payment-certs`, { contractId }))));
  assert.equal(dot.status, 201, JSON.stringify(dot.body));
  return { pm, admin, projectId, contractId, boqId, certId: dot.body!.id as number };
}

async function suaDot(
  f: SoFixture,
  c: { pm: NguoiTest; projectId: number; boqId: number; certId: number },
) {
  const { PATCH } = await import("@/app/api/payment-certs/[id]/route");
  await f.vao(c.pm, c.projectId);
  return goi(
    rq(() =>
      PATCH(
        jreq(
          `/api/payment-certs/${c.certId}`,
          { items: [{ boqItemId: c.boqId, qtyPeriod: 10 }] },
          "PATCH",
        ),
        P(c.certId),
      ),
    ),
  );
}

async function klDong(certId: number): Promise<number | null> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ q: string | null }>(
    `SELECT qty_period::text AS q FROM payment_cert_items WHERE cert_id = ? ORDER BY id LIMIT 1`,
    certId,
  );
  return r?.q == null ? null : Number(r.q);
}

const KHOA_HD = `SELECT id FROM contracts WHERE id = $1 FOR UPDATE`;

test(
  "A1-AC05/Q-AC01 (D01): payment-certs PATCH — admin siết manageContracts khi R1 còn kẹt khoá HĐ ⇒ R1 403, dòng KL không đổi",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDotNhap(f);
      const truoc = await klDong(c.certId);
      assert.notEqual(truoc, 10, "dữ liệu đầu phải khác giá trị PATCH");
      const r1 = await chenGiuaKhoa(
        KHOA_HD,
        [c.contractId],
        () => suaDot(f, c),
        () => datOverride(f, c.admin, c.projectId, "pm", "manageContracts", false),
      );
      assert.equal(r1.status, 403, `R1 ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.equal(await klDong(c.certId), truoc);
      const moi = await suaDot(f, c);
      assert.equal(moi.status, 403, JSON.stringify(moi.body));
      assert.equal(await klDong(c.certId), truoc);
    } finally {
      await f.don();
    }
  },
);

test(
  "A1-AC05 (đối chứng): payment-certs PATCH — không đổi quyền giữa chừng ⇒ R1 qua cùng điểm chèn vẫn 200 và ghi dòng KL",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDotNhap(f);
      const r1 = await chenGiuaKhoa(
        KHOA_HD,
        [c.contractId],
        () => suaDot(f, c),
        async () => {},
      );
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(await klDong(c.certId), 10);
    } finally {
      await f.don();
    }
  },
);

// ── 2. variations contract-add (manageContracts) ─────────────────────────────────────────

async function dungVoDaDuyet(f: SoFixture) {
  const { run } = await import("@/lib/db");
  const projectId = await f.duAn("S16B-VO");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  const contractId = await taoHopDong(pm, f, projectId);
  const { POST } = await import("@/app/api/variations/route");
  const vo = await goi(
    rq(() =>
      POST(
        jreq(`/api/variations`, {
          title: "VO S16B",
          reason: "other",
          lines: [
            { code: uniq("VOL-S16B-"), name: "Dòng VO", unit: "m", qty: 10, unitPrice: 1000 },
          ],
        }),
      ),
    ),
  );
  assert.equal(vo.status, 201, JSON.stringify(vo.body));
  const voId = vo.body!.id as number;
  await run(`UPDATE boq_items SET qty_approved = qty_contract WHERE vo_id = ?`, voId);
  await run(`UPDATE variation_orders SET status = 'approved' WHERE id = ?`, voId);
  return { pm, admin, projectId, contractId, voId };
}

async function donVo(projectId: number) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM variation_orders WHERE project_id = ?`, projectId);
}

async function dua(
  f: SoFixture,
  c: { pm: NguoiTest; projectId: number; contractId: number; voId: number },
) {
  const { POST } = await import("@/app/api/variations/[id]/contract-add/route");
  await f.vao(c.pm, c.projectId);
  return goi(
    rq(() =>
      POST(
        jreq(`/api/variations/${c.voId}/contract-add`, {
          contractId: c.contractId,
          addendaCode: uniq("PL-S16B-"),
        }),
        P(c.voId),
      ),
    ),
  );
}

async function trangThaiVo(voId: number, contractId: number) {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ status: string; n: number }>(
    `SELECT v.status,
            (SELECT COUNT(*)::int FROM contract_addenda a WHERE a.contract_id = ?) AS n
       FROM variation_orders v WHERE v.id = ?`,
    contractId,
    voId,
  );
  return { status: r?.status, phuLuc: r?.n };
}

const KHOA_VO = `SELECT id FROM variation_orders WHERE id = $1 FOR UPDATE`;

test(
  "A1-AC05/Q-AC01 (D01): variations contract-add — admin siết manageContracts khi R1 còn kẹt khoá VO ⇒ R1 403, không phụ lục, VO giữ 'approved'",
  S,
  async () => {
    const f = new SoFixture();
    let projectId = 0;
    try {
      const c = await dungVoDaDuyet(f);
      projectId = c.projectId;
      const r1 = await chenGiuaKhoa(
        KHOA_VO,
        [c.voId],
        () => dua(f, c),
        () => datOverride(f, c.admin, c.projectId, "pm", "manageContracts", false),
      );
      assert.equal(r1.status, 403, `R1 ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.deepEqual(await trangThaiVo(c.voId, c.contractId), {
        status: "approved",
        phuLuc: 0,
      });
      const moi = await dua(f, c);
      assert.equal(moi.status, 403, JSON.stringify(moi.body));
      assert.deepEqual(await trangThaiVo(c.voId, c.contractId), {
        status: "approved",
        phuLuc: 0,
      });
    } finally {
      if (projectId) await donVo(projectId);
      await f.don();
    }
  },
);

test(
  "A1-AC05 (đối chứng): variations contract-add — không đổi quyền giữa chừng ⇒ R1 qua cùng điểm chèn vẫn 201, đúng 1 phụ lục",
  S,
  async () => {
    const f = new SoFixture();
    let projectId = 0;
    try {
      const c = await dungVoDaDuyet(f);
      projectId = c.projectId;
      const r1 = await chenGiuaKhoa(
        KHOA_VO,
        [c.voId],
        () => dua(f, c),
        async () => {},
      );
      assert.equal(r1.status, 201, JSON.stringify(r1.body));
      assert.deepEqual(await trangThaiVo(c.voId, c.contractId), {
        status: "contract_added",
        phuLuc: 1,
      });
    } finally {
      if (projectId) await donVo(projectId);
      await f.don();
    }
  },
);

// ── 3. advances PATCH settle (manageFinance) ─────────────────────────────────────────────

async function dungTamUng(f: SoFixture) {
  const projectId = await f.duAn("S16B-ADV");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  const { POST } = await import("@/app/api/advances/route");
  await f.vao(pm, projectId);
  const r = await goi(
    rq(() =>
      POST(
        jreq(`/api/advances`, {
          code: uniq("TU-S16B-"),
          advanceDate: "2026-10-01",
          amount: 1000,
          recipient: "Đội S16B",
        }),
      ),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { pm, admin, projectId, advanceId: r.body!.id as number };
}

async function hoanUng(f: SoFixture, c: { pm: NguoiTest; projectId: number; advanceId: number }) {
  const { PATCH } = await import("@/app/api/advances/[id]/route");
  await f.vao(c.pm, c.projectId);
  return goi(
    rq(() =>
      PATCH(
        jreq(`/api/advances/${c.advanceId}`, { action: "settle", settleAmount: 100 }, "PATCH"),
        P(c.advanceId),
      ),
    ),
  );
}

async function daHoan(advanceId: number): Promise<string | undefined> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ s: string }>(
    `SELECT settled_amount::text AS s FROM advances WHERE id = ?`,
    advanceId,
  );
  return r?.s == null ? undefined : String(Number(r.s));
}

async function donTamUng(projectId: number) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM advances WHERE project_id = ?`, projectId);
}

// R1 đọc `advances` (loadExisting) TRƯỚC bước ghi ⇒ bị chặn bởi khoá bảng của kết nối riêng.
const KHOA_BANG_ADVANCES = `LOCK TABLE advances IN ACCESS EXCLUSIVE MODE`;

test(
  "A1-AC05/Q-AC01 (D01): advances PATCH hoàn ứng — admin siết manageFinance khi R1 còn kẹt ⇒ R1 403, settled_amount không đổi",
  S,
  async () => {
    const f = new SoFixture();
    let projectId = 0;
    try {
      const c = await dungTamUng(f);
      projectId = c.projectId;
      const r1 = await chenGiuaKhoa(
        KHOA_BANG_ADVANCES,
        [],
        () => hoanUng(f, c),
        () => datOverride(f, c.admin, c.projectId, "pm", "manageFinance", false),
      );
      assert.equal(r1.status, 403, `R1 ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.equal(await daHoan(c.advanceId), "0");
      const moi = await hoanUng(f, c);
      assert.equal(moi.status, 403, JSON.stringify(moi.body));
      assert.equal(await daHoan(c.advanceId), "0");
    } finally {
      if (projectId) await donTamUng(projectId);
      await f.don();
    }
  },
);

test(
  "A1-AC05 (đối chứng): advances PATCH hoàn ứng — không đổi quyền giữa chừng ⇒ R1 qua cùng điểm chèn vẫn 200, hoàn đúng 100",
  S,
  async () => {
    const f = new SoFixture();
    let projectId = 0;
    try {
      const c = await dungTamUng(f);
      projectId = c.projectId;
      const r1 = await chenGiuaKhoa(
        KHOA_BANG_ADVANCES,
        [],
        () => hoanUng(f, c),
        async () => {},
      );
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(await daHoan(c.advanceId), "100");
    } finally {
      if (projectId) await donTamUng(projectId);
      await f.don();
    }
  },
);

// ── 4. admin webhooks PATCH (manageIntegrations — đường quản trị) ────────────────────────

async function dungWebhook(f: SoFixture) {
  const projectId = await f.duAn("S16B-WH");
  const admin = await f.user("admin");
  const { POST } = await import("@/app/api/admin/webhooks/route");
  await f.vao(admin, projectId);
  const r = await goi(
    rq(() =>
      POST(
        jreq(`/api/admin/webhooks`, {
          url: "https://example.com/s16-hook",
          events: ["task.approved"],
          projectId,
        }),
      ),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { admin, projectId, webhookId: r.body!.id as number };
}

async function tatWebhook(
  f: SoFixture,
  c: { admin: NguoiTest; projectId: number; webhookId: number },
) {
  const { PATCH } = await import("@/app/api/admin/webhooks/[id]/route");
  await f.vao(c.admin, c.projectId);
  return goi(
    rq(() =>
      PATCH(jreq(`/api/admin/webhooks/${c.webhookId}`, { active: false }, "PATCH"), P(c.webhookId)),
    ),
  );
}

async function webhookActive(id: number): Promise<boolean | undefined> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ active: boolean }>(`SELECT active FROM webhooks WHERE id = ?`, id))
    ?.active;
}

async function donWebhook(id: number) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM webhooks WHERE id = ?`, id);
}

const KHOA_BANG_WEBHOOKS = `LOCK TABLE webhooks IN ACCESS EXCLUSIVE MODE`;

test(
  "A1-AC05/Q-AC01 (D01): admin webhooks PATCH — siết manageIntegrations của admin khi R1 còn kẹt ⇒ R1 403, webhook vẫn active",
  S,
  async () => {
    const f = new SoFixture();
    let webhookId = 0;
    try {
      const c = await dungWebhook(f);
      webhookId = c.webhookId;
      const r1 = await chenGiuaKhoa(
        KHOA_BANG_WEBHOOKS,
        [],
        () => tatWebhook(f, c),
        () => datOverride(f, c.admin, c.projectId, "admin", "manageIntegrations", false),
      );
      assert.equal(r1.status, 403, `R1 ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.equal(await webhookActive(c.webhookId), true);
      const moi = await tatWebhook(f, c);
      assert.equal(moi.status, 403, JSON.stringify(moi.body));
      assert.equal(await webhookActive(c.webhookId), true);
    } finally {
      if (webhookId) await donWebhook(webhookId);
      await f.don();
    }
  },
);

test(
  "A1-AC05 (đối chứng): admin webhooks PATCH — không đổi quyền giữa chừng ⇒ R1 qua cùng điểm chèn vẫn 200, webhook tắt",
  S,
  async () => {
    const f = new SoFixture();
    let webhookId = 0;
    try {
      const c = await dungWebhook(f);
      webhookId = c.webhookId;
      const r1 = await chenGiuaKhoa(
        KHOA_BANG_WEBHOOKS,
        [],
        () => tatWebhook(f, c),
        async () => {},
      );
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.equal(await webhookActive(c.webhookId), false);
    } finally {
      if (webhookId) await donWebhook(webhookId);
      await f.don();
    }
  },
);
