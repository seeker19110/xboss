import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { SoFixture, jreq, P, goi, uniq, type NguoiTest } from "./helpers/chuoi-nghiep-vu";

// A1-AC05 / Q-AC01 (APPROVAL D01) — tái kiểm quyền lúc ghi ở miền BOQ/định mức (mục 4(c) của
// docs/nang-cap/AUDIT-S16-QUYEN-LUC-GHI.md). Khuôn như s16-stale-snapshot: một kết nối riêng giữ
// khoá mà route thật sẽ chờ SAU khi đã xác thực + nạp snapshot quyền và TRƯỚC bước ghi; trong lúc
// kẹt admin siết override qua PATCH /api/admin/role-permissions thật, rồi nhả khoá. R1 phải 403 và
// DB không đổi. Mỗi file route có thêm 1 ca thành công bình thường. Không mock module nào.
//
// Override đặt THEO DỰ ÁN của ca để không ảnh hưởng file test khác.

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

async function datOverride(
  f: SoFixture,
  admin: NguoiTest,
  projectId: number,
  permKey: string,
): Promise<void> {
  const { PATCH } = await import("@/app/api/admin/role-permissions/route");
  await f.vao(admin, projectId);
  const r = await goi(
    requestRieng(() =>
      PATCH(
        jreq(
          `/api/admin/role-permissions`,
          { role: "pm", permKey, allowed: false, projectId },
          "PATCH",
        ),
      ),
    ),
  );
  assert.equal(r.status, 200, JSON.stringify(r.body));
}

const rq = <T>(fn: () => Promise<T>) => requestRieng(fn);

// Khoá bảng: R1 đọc boq_items (kiểm 404/trùng mã) TRƯỚC bước ghi ⇒ kẹt sau khi đã xác thực.
const KHOA_BOQ = `LOCK TABLE boq_items IN ACCESS EXCLUSIVE MODE`;
const KHOA_DONG_BOQ = `SELECT id FROM boq_items WHERE id = $1 FOR UPDATE`;
// Import đọc `systems` (kiểm hệ) trước bước ghi.
const KHOA_HE = `LOCK TABLE systems IN ACCESS EXCLUSIVE MODE`;

type Ca = { f: SoFixture; pm: NguoiTest; admin: NguoiTest; projectId: number };

async function dungCa(ten: string): Promise<Ca> {
  const f = new SoFixture();
  const projectId = await f.duAn(ten);
  const pm = await f.user("pm");
  const admin = await f.user("admin");
  return { f, pm, admin, projectId };
}

async function taoBoq(c: Ca, code = uniq("BOQ-S16Q-")) {
  const { POST } = await import("@/app/api/boq/route");
  await c.f.vao(c.pm, c.projectId);
  return goi(
    rq(() =>
      POST(
        jreq(`/api/boq`, { code, name: "Ống S16Q", unit: "m", qtyContract: 10, unitPrice: 1000 }),
      ),
    ),
  );
}

async function demBoq(projectId: number): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM boq_items WHERE project_id = ?`,
    projectId,
  );
  return r?.n ?? 0;
}

async function dongBoq(c: Ca): Promise<number> {
  const r = await taoBoq(c);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body!.id as number;
}

// ── boq POST ─────────────────────────────────────────────────────────────────────────────

test("D01 boq POST: siết editStructure khi R1 kẹt ⇒ 403, không thêm dòng", S, async () => {
  const c = await dungCa("S16Q-POST");
  try {
    const r1 = await chenGiuaKhoa(
      KHOA_BOQ,
      [],
      () => taoBoq(c),
      () => datOverride(c.f, c.admin, c.projectId, "editStructure"),
    );
    assert.equal(r1.status, 403, JSON.stringify(r1.body));
    assert.equal(await demBoq(c.projectId), 0);
  } finally {
    await c.f.don();
  }
});

test("D01 boq POST (đối chứng): không đổi quyền ⇒ 201", S, async () => {
  const c = await dungCa("S16Q-POST-OK");
  try {
    const r1 = await chenGiuaKhoa(
      KHOA_BOQ,
      [],
      () => taoBoq(c),
      async () => {},
    );
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal(await demBoq(c.projectId), 1);
  } finally {
    await c.f.don();
  }
});

// ── boq/:id PATCH + DELETE ───────────────────────────────────────────────────────────────

async function suaBoq(c: Ca, id: number) {
  const { PATCH } = await import("@/app/api/boq/[id]/route");
  await c.f.vao(c.pm, c.projectId);
  return goi(rq(() => PATCH(jreq(`/api/boq/${id}`, { name: "Tên mới S16Q" }, "PATCH"), P(id))));
}

async function xoaBoq(c: Ca, id: number) {
  const { DELETE } = await import("@/app/api/boq/[id]/route");
  await c.f.vao(c.pm, c.projectId);
  return goi(rq(() => DELETE(jreq(`/api/boq/${id}`, undefined, "DELETE"), P(id))));
}

async function tenBoq(id: number): Promise<string | undefined> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ name: string }>(`SELECT name FROM boq_items WHERE id = ?`, id))?.name;
}

test(
  "D01 boq/:id PATCH: siết editStructure khi R1 kẹt khoá dòng ⇒ 403, tên không đổi",
  S,
  async () => {
    const c = await dungCa("S16Q-PATCH");
    try {
      const id = await dongBoq(c);
      const r1 = await chenGiuaKhoa(
        KHOA_DONG_BOQ,
        [id],
        () => suaBoq(c, id),
        () => datOverride(c.f, c.admin, c.projectId, "editStructure"),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.equal(await tenBoq(id), "Ống S16Q");
    } finally {
      await c.f.don();
    }
  },
);

test("D01 boq/:id DELETE: siết editStructure khi R1 kẹt khoá dòng ⇒ 403, dòng còn", S, async () => {
  const c = await dungCa("S16Q-DEL");
  try {
    const id = await dongBoq(c);
    const r1 = await chenGiuaKhoa(
      KHOA_DONG_BOQ,
      [id],
      () => xoaBoq(c, id),
      () => datOverride(c.f, c.admin, c.projectId, "editStructure"),
    );
    assert.equal(r1.status, 403, JSON.stringify(r1.body));
    assert.equal(await tenBoq(id), "Ống S16Q");
  } finally {
    await c.f.don();
  }
});

test("D01 boq/:id (đối chứng): PATCH rồi DELETE không đổi quyền ⇒ 200", S, async () => {
  const c = await dungCa("S16Q-ID-OK");
  try {
    const id = await dongBoq(c);
    const r1 = await chenGiuaKhoa(
      KHOA_DONG_BOQ,
      [id],
      () => suaBoq(c, id),
      async () => {},
    );
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(await tenBoq(id), "Tên mới S16Q");
    const r2 = await xoaBoq(c, id);
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.equal(await tenBoq(id), undefined);
  } finally {
    await c.f.don();
  }
});

// ── boq/:id/map PUT ──────────────────────────────────────────────────────────────────────

async function datMap(c: Ca, id: number, taskId: number) {
  const { PUT } = await import("@/app/api/boq/[id]/map/route");
  await c.f.vao(c.pm, c.projectId);
  return goi(
    rq(() => PUT(jreq(`/api/boq/${id}/map`, { map: [{ taskId, weight: 1 }] }, "PUT"), P(id))),
  );
}

async function demMap(id: number): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM boq_task_map WHERE boq_item_id = ?`,
    id,
  );
  return r?.n ?? 0;
}

test("D01 boq/:id/map PUT: siết editStructure khi R1 kẹt ⇒ 403, không ghi map", S, async () => {
  const c = await dungCa("S16Q-MAP");
  try {
    const id = await dongBoq(c);
    const { taskId } = await c.f.wbs(c.projectId, { soO: 1 });
    const r1 = await chenGiuaKhoa(
      KHOA_BOQ,
      [],
      () => datMap(c, id, taskId),
      () => datOverride(c.f, c.admin, c.projectId, "editStructure"),
    );
    assert.equal(r1.status, 403, JSON.stringify(r1.body));
    assert.equal(await demMap(id), 0);
  } finally {
    await c.f.don();
  }
});

test("D01 boq/:id/map PUT (đối chứng): không đổi quyền ⇒ 200, 1 dòng map", S, async () => {
  const c = await dungCa("S16Q-MAP-OK");
  try {
    const id = await dongBoq(c);
    const { taskId } = await c.f.wbs(c.projectId, { soO: 1 });
    const r1 = await chenGiuaKhoa(
      KHOA_BOQ,
      [],
      () => datMap(c, id, taskId),
      async () => {},
    );
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal(await demMap(id), 1);
  } finally {
    await c.f.don();
  }
});

// ── boq/:id/norms POST + boq-norms/:id PATCH/DELETE ──────────────────────────────────────

async function themDinhMuc(c: Ca, id: number) {
  const { POST } = await import("@/app/api/boq/[id]/norms/route");
  await c.f.vao(c.pm, c.projectId);
  return goi(
    rq(() =>
      POST(
        jreq(`/api/boq/${id}/norms`, {
          resourceType: "labor",
          resourceName: "Thợ S16Q",
          qtyPerUnit: 2,
          unitLabel: "công",
        }),
        P(id),
      ),
    ),
  );
}

async function dinhMuc(boqId: number) {
  const { query } = await import("@/lib/db");
  return query<{ id: number; qty: number }>(
    `SELECT id, qty_per_unit::float AS qty FROM boq_norms WHERE boq_item_id = ? ORDER BY id`,
    boqId,
  );
}

async function suaDinhMuc(c: Ca, normId: number) {
  const { PATCH } = await import("@/app/api/boq-norms/[id]/route");
  await c.f.vao(c.pm, c.projectId);
  return goi(
    rq(() => PATCH(jreq(`/api/boq-norms/${normId}`, { qtyPerUnit: 5 }, "PATCH"), P(normId))),
  );
}

async function xoaDinhMuc(c: Ca, normId: number) {
  const { DELETE } = await import("@/app/api/boq-norms/[id]/route");
  await c.f.vao(c.pm, c.projectId);
  return goi(rq(() => DELETE(jreq(`/api/boq-norms/${normId}`, undefined, "DELETE"), P(normId))));
}

async function dungDinhMuc(c: Ca): Promise<{ boqId: number; normId: number }> {
  const boqId = await dongBoq(c);
  const r = await themDinhMuc(c, boqId);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { boqId, normId: r.body!.id as number };
}

test(
  "D01 boq/:id/norms POST: siết manageNorms khi R1 kẹt ⇒ 403, không thêm định mức",
  S,
  async () => {
    const c = await dungCa("S16Q-NORM");
    try {
      const id = await dongBoq(c);
      const r1 = await chenGiuaKhoa(
        KHOA_BOQ,
        [],
        () => themDinhMuc(c, id),
        () => datOverride(c.f, c.admin, c.projectId, "manageNorms"),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await dinhMuc(id), []);
    } finally {
      await c.f.don();
    }
  },
);

test("D01 boq/:id/norms POST (đối chứng): không đổi quyền ⇒ 201", S, async () => {
  const c = await dungCa("S16Q-NORM-OK");
  try {
    const id = await dongBoq(c);
    const r1 = await chenGiuaKhoa(
      KHOA_BOQ,
      [],
      () => themDinhMuc(c, id),
      async () => {},
    );
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal((await dinhMuc(id)).length, 1);
  } finally {
    await c.f.don();
  }
});

test(
  "D01 boq-norms/:id PATCH: siết manageNorms khi R1 kẹt ⇒ 403, định mức không đổi",
  S,
  async () => {
    const c = await dungCa("S16Q-NPATCH");
    try {
      const { boqId, normId } = await dungDinhMuc(c);
      const r1 = await chenGiuaKhoa(
        KHOA_BOQ,
        [],
        () => suaDinhMuc(c, normId),
        () => datOverride(c.f, c.admin, c.projectId, "manageNorms"),
      );
      assert.equal(r1.status, 403, JSON.stringify(r1.body));
      assert.deepEqual(await dinhMuc(boqId), [{ id: normId, qty: 2 }]);
    } finally {
      await c.f.don();
    }
  },
);

test("D01 boq-norms/:id DELETE: siết manageNorms khi R1 kẹt ⇒ 403, định mức còn", S, async () => {
  const c = await dungCa("S16Q-NDEL");
  try {
    const { boqId, normId } = await dungDinhMuc(c);
    const r1 = await chenGiuaKhoa(
      KHOA_BOQ,
      [],
      () => xoaDinhMuc(c, normId),
      () => datOverride(c.f, c.admin, c.projectId, "manageNorms"),
    );
    assert.equal(r1.status, 403, JSON.stringify(r1.body));
    assert.deepEqual(await dinhMuc(boqId), [{ id: normId, qty: 2 }]);
  } finally {
    await c.f.don();
  }
});

test("D01 boq-norms/:id (đối chứng): PATCH rồi DELETE không đổi quyền ⇒ 200", S, async () => {
  const c = await dungCa("S16Q-N-OK");
  try {
    const { boqId, normId } = await dungDinhMuc(c);
    const r1 = await chenGiuaKhoa(
      KHOA_BOQ,
      [],
      () => suaDinhMuc(c, normId),
      async () => {},
    );
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.deepEqual(await dinhMuc(boqId), [{ id: normId, qty: 5 }]);
    const r2 = await xoaDinhMuc(c, normId);
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    assert.deepEqual(await dinhMuc(boqId), []);
  } finally {
    await c.f.don();
  }
});

// ── boq/import POST (?commit=1) ──────────────────────────────────────────────────────────

function fileBoq(): File {
  const ws = XLSX.utils.aoa_to_sheet([
    ["BẢNG KHỐI LƯỢNG THANH TOÁN"],
    [],
    ["STT", "DIỄN GIẢI", "ĐVT", "Khối lượng", null, null, "VẬT TƯ", "NHÂN CÔNG", "ĐƠN GIÁ TỔNG"],
    [null, null, null, "Tháp A", "Tháp B", "Tổng"],
    ["I", "HẠNG MỤC THEO HỢP ĐỒNG/PLHĐ"],
    [1, "Quạt"],
    [null, `Quạt S16Q ${uniq("Q")}`, "Bộ", 2, 0, 2, 500000, 500000, 1000000],
  ]);
  const buf = XLSX.write(
    { SheetNames: ["BOQ"], Sheets: { BOQ: ws } },
    { type: "array", bookType: "xlsx" },
  ) as ArrayBuffer;
  return new File([buf], "boq.xlsx");
}

async function nhapBoq(c: Ca, systemId: number) {
  const { POST } = await import("@/app/api/boq/import/route");
  const { NextRequest } = await import("next/server");
  await c.f.vao(c.pm, c.projectId);
  return goi(
    rq(() => {
      const fd = new FormData();
      fd.set("file", fileBoq());
      fd.set("systemId", String(systemId));
      return POST(
        new NextRequest("http://localhost/api/boq/import?commit=1", { method: "POST", body: fd }),
      );
    }),
  );
}

test("D01 boq/import POST: siết import khi R1 kẹt ⇒ 403, không thêm dòng BOQ", S, async () => {
  const c = await dungCa("S16Q-IMP");
  try {
    const systemId = await c.f.heThong();
    const r1 = await chenGiuaKhoa(
      KHOA_HE,
      [],
      () => nhapBoq(c, systemId),
      () => datOverride(c.f, c.admin, c.projectId, "import"),
    );
    assert.equal(r1.status, 403, JSON.stringify(r1.body));
    assert.equal(await demBoq(c.projectId), 0);
  } finally {
    await c.f.don();
  }
});

test("D01 boq/import POST (đối chứng): không đổi quyền ⇒ 200, có dòng BOQ", S, async () => {
  const c = await dungCa("S16Q-IMP-OK");
  try {
    const systemId = await c.f.heThong();
    const r1 = await chenGiuaKhoa(
      KHOA_HE,
      [],
      () => nhapBoq(c, systemId),
      async () => {},
    );
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.ok((await demBoq(c.projectId)) >= 1);
  } finally {
    await c.f.don();
  }
});
