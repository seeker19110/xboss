import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { SoFixture, jreq, P, goi, uniq, type NguoiTest } from "./helpers/chuoi-nghiep-vu";

// A1-AC05 / Q-AC01 (APPROVAL D01) — snapshot quyền STALE: snapshot nạp lúc xác thực không được
// dùng để cho GHI ở đường nghiệm thu/tài chính nếu quyền đổi trong lúc request còn await.
//
// Điểm chèn: một kết nối riêng giữ khoá dòng (task / hợp đồng) mà route sẽ `FOR UPDATE` — route
// thật xác thực xong (snapshot quyền đã nạp) rồi kẹt ở câu khoá đó. Trong lúc kẹt, admin cùng
// org đổi override qua route PATCH /api/admin/role-permissions thật (commit), rồi nhả khoá để
// request cũ chạy tiếp tới bước ghi. Không mock module nào: mọi bước là code sản phẩm.
//
// Override đặt THEO DỰ ÁN của ca (không cấp tổ chức) để không ảnh hưởng file test chạy song song.

const S = { skip: !HAS_TEST_DB };

test.after(() => dangXuat());

type KetQua = { status: number; body: Record<string, unknown> | null };

/**
 * Giữ khoá `sqlKhoa` trên một kết nối riêng, khởi chạy `r1` (request đang bay) và đợi tới khi nó
 * bị chặn bởi đúng kết nối đó, chạy `giua` (đổi quyền), rồi nhả khoá và trả kết quả R1.
 */
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
    // Đợi R1 thực sự kẹt sau kết nối giữ khoá (đã xác thực + nạp snapshot xong).
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
      assert.fail("R1 không kẹt ở khoá dòng như kỳ vọng — điểm chèn không còn đúng");
    }
    await giua();
    await nha();
    return await dangBay;
  } finally {
    await nha();
  }
}

/** Admin cùng org ghi override qua route thật (cookie admin), trong ngữ cảnh request riêng. */
async function datOverride(
  f: SoFixture,
  admin: NguoiTest,
  projectId: number,
  allowed: boolean | null,
): Promise<void> {
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  await f.vao(admin, projectId);
  const r = await goi(
    requestRieng(() =>
      PATCH(
        jreq(
          `/api/admin/role-permissions`,
          { role: "pm", permKey: "approve", allowed, projectId },
          "PATCH",
        ),
      ),
    ),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

// ── Nghiệm thu: POST /api/tasks/:id/approve ─────────────────────────────────────────────

async function dungTaskXong(f: SoFixture) {
  const { run } = await import("@/lib/db");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  const projectId = await f.duAn("S16STALE");
  const cay = await f.wbs(projectId, { soO: 1 });
  await run(
    `UPDATE tasks SET progress_percent = 1, status = 'hoan_thanh' WHERE id = ?`,
    cay.taskId,
  );
  return { pm, admin, projectId, taskId: cay.taskId };
}

async function nghiemThu(f: SoFixture, pm: NguoiTest, projectId: number, taskId: number) {
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  await f.vao(pm, projectId);
  return goi(requestRieng(() => POST(jreq(`/api/tasks/${taskId}/approve`, {}), P(taskId))));
}

async function trangThaiTask(taskId: number) {
  const { queryOne } = await import("@/lib/db");
  const t = await queryOne<{ status: string; n: number }>(
    `SELECT t.status, (SELECT COUNT(*)::int FROM task_history h WHERE h.task_id = t.id) AS n
       FROM tasks t WHERE t.id = ?`,
    taskId,
  );
  return { status: t?.status, lichSu: t?.n };
}

const KHOA_TASK = `SELECT id FROM tasks WHERE id = $1 FOR UPDATE`;

test(
  "A1-AC05/Q-AC01 (D01): nghiệm thu — admin siết approve trong lúc R1 còn await ⇒ R1 403, task không đổi; request mới cũng 403",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungTaskXong(f);
      const r1 = await chenGiuaKhoa(
        KHOA_TASK,
        [c.taskId],
        () => nghiemThu(f, c.pm, c.projectId, c.taskId),
        () => datOverride(f, c.admin, c.projectId, false),
      );
      assert.equal(r1.status, 403, `R1 ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.deepEqual(await trangThaiTask(c.taskId), { status: "hoan_thanh", lichSu: 0 });
      const moi = await nghiemThu(f, c.pm, c.projectId, c.taskId);
      assert.equal(moi.status, 403, JSON.stringify(moi.body));
      assert.deepEqual(await trangThaiTask(c.taskId), { status: "hoan_thanh", lichSu: 0 });
    } finally {
      await f.don();
    }
  },
);

test(
  "A1-AC05 (đối chứng): nghiệm thu — không đổi quyền giữa chừng ⇒ R1 qua cùng điểm chèn vẫn 200",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungTaskXong(f);
      const r1 = await chenGiuaKhoa(
        KHOA_TASK,
        [c.taskId],
        () => nghiemThu(f, c.pm, c.projectId, c.taskId),
        async () => {},
      );
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.deepEqual(await trangThaiTask(c.taskId), { status: "nghiem_thu", lichSu: 1 });
    } finally {
      await f.don();
    }
  },
);

test(
  "A1-AC05 (fail-closed 2 chiều): nghiệm thu — R1 bắt đầu với deny, admin gỡ deny giữa chừng ⇒ R1 vẫn 403; request mới mới được 200",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungTaskXong(f);
      await datOverride(f, c.admin, c.projectId, false);
      const r1 = await chenGiuaKhoa(
        KHOA_TASK,
        [c.taskId],
        () => nghiemThu(f, c.pm, c.projectId, c.taskId),
        () => datOverride(f, c.admin, c.projectId, null),
      );
      assert.equal(r1.status, 403, `R1 bị nâng quyền giữa chừng: ${JSON.stringify(r1.body)}`);
      assert.deepEqual(await trangThaiTask(c.taskId), { status: "hoan_thanh", lichSu: 0 });
      const moi = await nghiemThu(f, c.pm, c.projectId, c.taskId);
      assert.equal(moi.status, 200, JSON.stringify(moi.body));
      assert.deepEqual(await trangThaiTask(c.taskId), { status: "nghiem_thu", lichSu: 1 });
    } finally {
      await f.don();
    }
  },
);

// ── Tài chính: POST /api/payment-certs/:id/decide (duyệt đợt thanh toán, sinh phiếu) ─────

/** Dự án + PM (lập/trình đợt qua route thật) + admin; trả đợt đã trình chờ quyết định. */
async function dungDotDaTrinh(f: SoFixture) {
  const { run } = await import("@/lib/db");
  const projectId = await f.duAn("S16IPC");
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  await f.vao(pm, projectId);
  const rq = <T>(fn: () => Promise<T>) => requestRieng(fn);

  const { POST: taoHd } = await import("@/app/api/contracts/route");
  const hd = await goi(
    rq(() =>
      taoHd(
        jreq(`/api/contracts`, {
          code: uniq("HD-S16-"),
          kind: "nhan_thau",
          title: "HĐ S16 stale",
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
  const contractId = hd.body!.id as number;

  const { POST: taoBoq } = await import("@/app/api/boq/route");
  const bq = await goi(
    rq(() =>
      taoBoq(
        jreq(`/api/boq`, {
          code: uniq("BOQ-S16-"),
          name: "Ống S16",
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
  const certId = dot.body!.id as number;

  const { PATCH: sua } = await import("@/app/api/payment-certs/[id]/route");
  const s = await goi(
    rq(() =>
      sua(
        jreq(
          `/api/payment-certs/${certId}`,
          { items: [{ boqItemId: boqId, qtyPeriod: 10 }] },
          "PATCH",
        ),
        P(certId),
      ),
    ),
  );
  assert.equal(s.status, 200, JSON.stringify(s.body));

  const { POST: trinh } = await import("@/app/api/payment-certs/[id]/submit/route");
  const t = await goi(rq(() => trinh(jreq(`/api/payment-certs/${certId}/submit`), P(certId))));
  assert.equal(t.status, 200, JSON.stringify(t.body));
  return { pm, admin, projectId, contractId, certId };
}

async function duyetDot(f: SoFixture, pm: NguoiTest, projectId: number, certId: number) {
  const { POST } = await import("@/app/api/payment-certs/[id]/decide/route");
  await f.vao(pm, projectId);
  return goi(
    requestRieng(() =>
      POST(jreq(`/api/payment-certs/${certId}/decide`, { decision: "approved" }), P(certId)),
    ),
  );
}

async function trangThaiDot(certId: number) {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ status: string; phieu: number; snap: number }>(
    `SELECT c.status,
            (SELECT COUNT(*)::int FROM payment_bills b WHERE b.payment_cert_id = c.id) AS phieu,
            (SELECT COUNT(*)::int FROM payment_cert_decision_snapshots s WHERE s.cert_id = c.id) AS snap
       FROM payment_certs c WHERE c.id = ?`,
    certId,
  );
  return { status: r?.status, phieu: r?.phieu, snapshot: r?.snap };
}

const KHOA_HD = `SELECT id FROM contracts WHERE id = $1 FOR UPDATE`;

test(
  "A1-AC05/Q-AC01 (D01): tài chính — admin siết approve trong lúc duyệt đợt còn await ⇒ R1 403, không phiếu/snapshot; request mới cũng 403",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDotDaTrinh(f);
      const r1 = await chenGiuaKhoa(
        KHOA_HD,
        [c.contractId],
        () => duyetDot(f, c.pm, c.projectId, c.certId),
        () => datOverride(f, c.admin, c.projectId, false),
      );
      assert.equal(r1.status, 403, `R1 duyệt bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.deepEqual(await trangThaiDot(c.certId), {
        status: "submitted",
        phieu: 0,
        snapshot: 0,
      });
      const moi = await duyetDot(f, c.pm, c.projectId, c.certId);
      assert.equal(moi.status, 403, JSON.stringify(moi.body));
      assert.deepEqual(await trangThaiDot(c.certId), {
        status: "submitted",
        phieu: 0,
        snapshot: 0,
      });
    } finally {
      await f.don();
    }
  },
);

test(
  "A1-AC05 (đối chứng): tài chính — không đổi quyền giữa chừng ⇒ duyệt đợt qua cùng điểm chèn vẫn 200, đúng 1 phiếu",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDotDaTrinh(f);
      const r1 = await chenGiuaKhoa(
        KHOA_HD,
        [c.contractId],
        () => duyetDot(f, c.pm, c.projectId, c.certId),
        async () => {},
      );
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      assert.deepEqual(await trangThaiDot(c.certId), {
        status: "approved",
        phieu: 1,
        snapshot: 1,
      });
    } finally {
      await f.don();
    }
  },
);

test(
  "A1-AC05 (fail-closed 2 chiều): tài chính — R1 bắt đầu với deny, admin gỡ deny giữa chừng ⇒ R1 vẫn 403; request mới mới được 200",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dungDotDaTrinh(f);
      await datOverride(f, c.admin, c.projectId, false);
      const r1 = await chenGiuaKhoa(
        KHOA_HD,
        [c.contractId],
        () => duyetDot(f, c.pm, c.projectId, c.certId),
        () => datOverride(f, c.admin, c.projectId, null),
      );
      assert.equal(r1.status, 403, `R1 bị nâng quyền giữa chừng: ${JSON.stringify(r1.body)}`);
      assert.deepEqual(await trangThaiDot(c.certId), {
        status: "submitted",
        phieu: 0,
        snapshot: 0,
      });
      const moi = await duyetDot(f, c.pm, c.projectId, c.certId);
      assert.equal(moi.status, 200, JSON.stringify(moi.body));
      assert.deepEqual(await trangThaiDot(c.certId), {
        status: "approved",
        phieu: 1,
        snapshot: 1,
      });
    } finally {
      await f.don();
    }
  },
);

// ── Lớp lib: khe "đã tái kiểm → deny commit → ghi commit" được đóng bằng khoá advisory ─────

test(
  "A1-AC05 (D01): ghi override phải chờ transaction ghi đã tái kiểm quyền COMMIT; ngoài transaction thì tái kiểm throw",
  S,
  async () => {
    const { getPool, queryOne, withTransaction } = await import("@/lib/db");
    const { runWithRequestContext } = await import("@/lib/nen/request-context");
    const { CAN } = await import("@/lib/bao-mat/auth");
    const { invalidatePermissionCache, kiemQuyenTaiLucGhi, setPermissionOverride } =
      await import("@/lib/bao-mat/permissions");
    const f = new SoFixture();
    try {
      const pm = await f.user("pm");
      const admin = await f.user("admin");
      const projectId = await f.duAn("S16LOCK");
      const ctxPm = { userId: pm.id, role: "pm", orgId: 1, projectId };
      const ctxAdmin = { userId: admin.id, role: "admin", orgId: 1 };

      await runWithRequestContext(ctxPm, async () => {
        await invalidatePermissionCache(1);
        await assert.rejects(
          () => kiemQuyenTaiLucGhi(() => CAN.approve("pm")),
          /phải chạy trong transaction/,
        );
      });

      // Request admin khởi chạy NGOÀI transaction của pm (AsyncLocalStorage của lib/db lan theo
      // chỗ tạo promise) và chỉ bắt đầu ghi khi pm đã tái kiểm xong.
      let adminXong = false;
      let moCong!: () => void;
      const cong = new Promise<void>((ok) => (moCong = ok));
      const adminGhi = runWithRequestContext(ctxAdmin, async () => {
        await cong;
        await setPermissionOverride("pm", "approve", false, admin.id, 1, projectId);
        adminXong = true;
      });
      await runWithRequestContext(ctxPm, async () => {
        await invalidatePermissionCache(1);
        await withTransaction(async () => {
          assert.equal(await kiemQuyenTaiLucGhi(() => CAN.approve("pm")), true);
          const pid = (await queryOne<{ pid: number }>(`SELECT pg_backend_pid() AS pid`))!.pid;
          moCong();
          let cho = false;
          for (let i = 0; i < 200 && !cho; i++) {
            const r = await getPool().query<{ n: number }>(
              `SELECT COUNT(*)::int AS n FROM pg_stat_activity
                WHERE wait_event = 'advisory' AND $1 = ANY(pg_blocking_pids(pid))`,
              [pid],
            );
            cho = r.rows[0].n > 0;
            if (!cho) await new Promise((ok) => setTimeout(ok, 25));
          }
          assert.ok(cho, "ghi override không chờ khoá của transaction ghi đã tái kiểm");
          assert.equal(adminXong, false);
        });
      });
      await adminGhi;
      assert.equal(adminXong, true);
      // Sau khi override commit, transaction ghi mới tái kiểm thấy deny.
      await runWithRequestContext(ctxPm, async () => {
        await invalidatePermissionCache(1);
        assert.equal(CAN.approve("pm"), false);
        assert.equal(
          await withTransaction(() => kiemQuyenTaiLucGhi(() => CAN.approve("pm"))),
          false,
        );
      });
    } finally {
      await f.don();
    }
  },
);
