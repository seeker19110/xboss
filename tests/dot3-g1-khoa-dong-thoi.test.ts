import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Client } from "pg";
import ExcelJS from "exceljs";

// Đợt tối ưu 3 — nhóm G1 (KHOÁ/ĐỒNG THỜI, vùng §8). Kiểm qua DB thật + route handler thật:
//   - L1: recomputeTask chỉ khoá dòng task (FOR UPDATE OF t), KHÔNG khoá dòng nhóm — khoá nhóm
//     chỉ lấy trong recomputePackage, sau khi đã giữ đủ khoá task.
//   - L2: trigger watermark sheet_versions hoãn tới COMMIT (constraint trigger DEFERRED) — dòng
//     watermark không bị giữ suốt transaction ghi task; version vẫn bump đúng sau COMMIT; xoá
//     sheet (xoá nhóm rồi xoá sheet trong cùng transaction) vẫn chạy.
//   - L3/L4/L6/L7/L8: các đường ghi nhiều task khoá trước theo id tăng dần — chạy song song với
//     tick không còn deadlock (500), và % / trạng thái task + nhóm y như trước.
//   - L5: push phân công gom lại, gửi sau COMMIT.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
const QUA_KHU = "2020-01-01";
const TUONG_LAI = "2099-12-31";

type Ctx = {
  userId: number;
  pwHash: string;
  projectId: number;
  sheetTypeId: number;
};

let dem = 0;
async function dungDuAn(role = "pm", systemId: number | null = null): Promise<Ctx> {
  const { insertId, queryOne } = await import("@/lib/db");
  const ten = `${RUN}-${++dem}`;
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, `G1 ${ten}`);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp G1')`,
    projectId,
  );
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, 'Sheet G1', ?)`,
    towerId,
    `G1S${ten.replace(/[^a-z0-9]/gi, "")}`,
    systemId,
  );
  const userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-g1', ?, 1)`,
    `G1 ${ten}`,
    `g1-${ten}@test.local`,
    role,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    userId,
  );
  await dangNhapDuAn({ id: userId, passwordHash: u!.password_hash }, projectId);
  return { userId, pwHash: u!.password_hash, projectId, sheetTypeId };
}

async function nhom(
  ctx: Ctx,
  code: string,
  opts: { endDate?: string | null; floor?: string | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, end_date, floor_label) VALUES (?, ?, ?, ?, ?)`,
    ctx.sheetTypeId,
    code,
    `Nhóm ${code}`,
    opts.endDate ?? null,
    opts.floor ?? null,
  );
}

async function task(
  pkgId: number,
  code: string,
  opts: { endDate?: string | null; progress?: number; boq?: string | null } = {},
): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO tasks (package_id, code, name, end_date, progress_percent, boq_code)
     VALUES (?, ?, ?, ?, ?, ?)`,
    pkgId,
    code,
    `Task ${code}`,
    opts.endDate ?? null,
    opts.progress ?? 0,
    opts.boq ?? null,
  );
}

async function oDim(taskId: number, n: number, prefix = "D"): Promise<number[]> {
  const { insertId } = await import("@/lib/db");
  const ids: number[] = [];
  for (let i = 0; i < n; i++)
    ids.push(
      await insertId(
        `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, ?, ?)`,
        taskId,
        `${prefix}${i}`,
        i,
      ),
    );
  return ids;
}

async function trangThaiTask(id: number) {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ p: number; s: string }>(
    `SELECT progress_percent AS p, status AS s FROM tasks WHERE id = ?`,
    id,
  ))!;
}

async function trangThaiNhom(id: number) {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ p: number; s: string }>(
    `SELECT progress AS p, status AS s FROM work_packages WHERE id = ?`,
    id,
  ))!;
}

async function versionSheet(stId: number): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ v: number }>(
    `SELECT version AS v FROM sheet_versions WHERE sheet_type_id = ?`,
    stId,
  );
  return Number(r?.v ?? 0);
}

const req = (url: string, body?: unknown, method = "PATCH") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const P = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

/** Kết nối pg RIÊNG (ngoài pool lib/db) để quan sát khoá đang bị giữ bởi transaction kia. */
async function ketNoiRieng(): Promise<Client> {
  const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await c.connect();
  return c;
}

/** Thử khoá NOWAIT từ kết nối riêng: true = khoá được (không ai giữ), false = 55P03. */
async function khoaDuocNgay(c: Client, sql: string, params: unknown[]): Promise<boolean> {
  await c.query("BEGIN");
  try {
    await c.query(sql, params);
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === "55P03") return false;
    throw e;
  } finally {
    await c.query("ROLLBACK");
  }
}

// ---------------------------------------------------------------------------------------
// L1 — recomputeTask không khoá dòng nhóm
// ---------------------------------------------------------------------------------------

test(
  "L1: recomputeTask (hoanTinhNhom) chỉ khoá dòng task — dòng nhóm vẫn khoá được",
  S,
  async () => {
    const { withTransaction } = await import("@/lib/db");
    const { recomputeTask } = await import("@/lib/tien-do/recompute");
    const ctx = await dungDuAn();
    const pkg = await nhom(ctx, "L1");
    const t = await task(pkg, "L1,01");
    await oDim(t, 2);
    const c = await ketNoiRieng();
    try {
      await withTransaction(async () => {
        await recomputeTask(t, "g1", { hoanTinhNhom: true });
        assert.equal(
          await khoaDuocNgay(c, `SELECT id FROM work_packages WHERE id = $1 FOR UPDATE NOWAIT`, [
            pkg,
          ]),
          true,
          "recomputeTask không được khoá dòng work_packages (thiếu `OF t`)",
        );
        assert.equal(
          await khoaDuocNgay(c, `SELECT id FROM tasks WHERE id = $1 FOR UPDATE NOWAIT`, [t]),
          false,
          "dòng task vẫn phải bị khoá tới hết transaction",
        );
      });
    } finally {
      await c.end();
    }
  },
);

// ---------------------------------------------------------------------------------------
// L2 — watermark sheet_versions hoãn tới COMMIT
// ---------------------------------------------------------------------------------------

test(
  "L2: UPDATE tasks không giữ khoá dòng sheet_versions giữa transaction; bump sau COMMIT",
  S,
  async () => {
    const { withTransaction, run } = await import("@/lib/db");
    const ctx = await dungDuAn();
    const pkg = await nhom(ctx, "L2");
    const t = await task(pkg, "L2,01");
    const truoc = await versionSheet(ctx.sheetTypeId);
    const c = await ketNoiRieng();
    try {
      await withTransaction(async () => {
        await run(`UPDATE tasks SET note = 'g1' WHERE id = ?`, t);
        assert.equal(
          await khoaDuocNgay(
            c,
            `SELECT version FROM sheet_versions WHERE sheet_type_id = $1 FOR UPDATE NOWAIT`,
            [ctx.sheetTypeId],
          ),
          true,
          "trigger watermark phải hoãn tới COMMIT (DEFERRABLE INITIALLY DEFERRED)",
        );
      });
    } finally {
      await c.end();
    }
    assert.ok((await versionSheet(ctx.sheetTypeId)) > truoc, "version vẫn bump sau COMMIT");
    // Move nhóm sang sheet khác vẫn bump cả 2 sheet (điều kiện UPDATE OF sheet_type_id giữ nguyên).
    const { insertId } = await import("@/lib/db");
    const st2 = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name)
       SELECT tower_id, ?, 'Sheet G1 b' FROM sheet_types WHERE id = ?`,
      `G1B${RUN.replace(/[^a-z0-9]/gi, "")}`,
      ctx.sheetTypeId,
    );
    const v1 = await versionSheet(ctx.sheetTypeId);
    const v2 = await versionSheet(st2);
    await run(`UPDATE work_packages SET sheet_type_id = ? WHERE id = ?`, st2, pkg);
    assert.ok((await versionSheet(ctx.sheetTypeId)) > v1, "sheet cũ bump khi nhóm rời đi");
    assert.ok((await versionSheet(st2)) > v2, "sheet mới bump khi nhóm tới");
    // Đổi tên nhóm (không đổi sheet_type_id) KHÔNG bump — giữ đúng điều kiện cũ.
    const v3 = await versionSheet(st2);
    await run(`UPDATE work_packages SET name = 'Đổi tên' WHERE id = ?`, pkg);
    assert.equal(await versionSheet(st2), v3);
  },
);

test(
  "L2: DELETE /api/sheets/:id (xoá nhóm + sheet cùng transaction) vẫn chạy với trigger hoãn",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const ctx = await dungDuAn("admin");
    const pkg = await nhom(ctx, "XS");
    const t = await task(pkg, "XS,01");
    await oDim(t, 1);
    const { DELETE } = await import("@/app/api/sheets/[id]/route");
    const res = await DELETE(
      req(`/api/sheets/${ctx.sheetTypeId}`, undefined, "DELETE"),
      P(ctx.sheetTypeId),
    );
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    assert.equal(
      await queryOne(`SELECT id FROM sheet_types WHERE id = ?`, ctx.sheetTypeId),
      undefined,
    );
    assert.equal(
      await queryOne(`SELECT 1 AS x FROM sheet_versions WHERE sheet_type_id = ?`, ctx.sheetTypeId),
      undefined,
    );
  },
);

// ---------------------------------------------------------------------------------------
// Race — lô tick xen kẽ nhóm, tick đơn, sửa hàng loạt, đổi ngày nhóm
// ---------------------------------------------------------------------------------------

test(
  "L1 race: 2 lô tick KHÔNG chung task, xen kẽ 2 nhóm (A: thấp→cao, B: cao→thấp) + tick đơn — mọi request 200",
  S,
  async () => {
    const ctx = await dungDuAn();
    const pThap = await nhom(ctx, "RT");
    const pCao = await nhom(ctx, "RC");
    // Thứ tự id task: a1 (nhóm thấp) < a2 (nhóm cao) < b1 (nhóm cao) < b2 (nhóm thấp).
    const a1 = await task(pThap, "RT,01");
    const a2 = await task(pCao, "RC,01");
    const b1 = await task(pCao, "RC,02");
    const b2 = await task(pThap, "RT,02");
    const da1 = await oDim(a1, 2);
    const da2 = await oDim(a2, 2);
    const db1 = await oDim(b1, 2);
    const db2 = await oDim(b2, 2);
    const { PATCH: LO } = await import("@/app/api/dimensions/batch/route");
    const { PATCH: DON } = await import("@/app/api/dimensions/[id]/route");
    for (let vong = 0; vong < 12; vong++) {
      const installed = vong % 2 === 0;
      const kq = await Promise.all([
        requestRieng(() => LO(req("/api/dimensions/batch", { ids: [...da1, ...da2], installed }))),
        requestRieng(() => LO(req("/api/dimensions/batch", { ids: [...db1, ...db2], installed }))),
        requestRieng(() => DON(req(`/api/dimensions/${db2[0]}`, { installed }), P(db2[0]))),
        requestRieng(() => DON(req(`/api/dimensions/${da2[0]}`, { installed }), P(da2[0]))),
      ]);
      assert.deepEqual(
        kq.map((r) => r.status),
        [200, 200, 200, 200],
        `vòng ${vong}`,
      );
      for (const t of [a1, a2, b1, b2])
        assert.equal((await trangThaiTask(t)).p, installed ? 1 : 0, `vòng ${vong} task ${t}`);
      for (const p of [pThap, pCao])
        assert.equal((await trangThaiNhom(p)).p, installed ? 1 : 0, `vòng ${vong} nhóm ${p}`);
    }
  },
);

test(
  "L2/L4 race: PATCH /api/tasks/batch đổi ngày nhiều task (thứ tự id ngược) song song tick đơn trên các task đó — không 500",
  S,
  async () => {
    const ctx = await dungDuAn();
    const p1 = await nhom(ctx, "BA");
    const p2 = await nhom(ctx, "BB");
    const ts = [
      await task(p1, "BA,01"),
      await task(p2, "BB,01"),
      await task(p1, "BA,02"),
      await task(p2, "BB,02"),
    ];
    const dims = [] as number[][];
    for (const t of ts) dims.push(await oDim(t, 2));
    const { PATCH: BATCH } = await import("@/app/api/tasks/batch/route");
    const { PATCH: DON } = await import("@/app/api/dimensions/[id]/route");
    const { PATCH: LO } = await import("@/app/api/dimensions/batch/route");
    for (let vong = 0; vong < 10; vong++) {
      const ngay = vong % 2 === 0 ? QUA_KHU : TUONG_LAI;
      const installed = vong % 2 === 0;
      const kq = await Promise.all([
        requestRieng(() =>
          BATCH(
            req("/api/tasks/batch", {
              updates: [...ts].reverse().map((id) => ({ id, patch: { endDate: ngay } })),
            }),
          ),
        ),
        requestRieng(() => DON(req(`/api/dimensions/${dims[3][0]}`, { installed }), P(dims[3][0]))),
        requestRieng(() => DON(req(`/api/dimensions/${dims[0][1]}`, { installed }), P(dims[0][1]))),
        requestRieng(() =>
          LO(req("/api/dimensions/batch", { ids: [dims[2][0], dims[1][1]], installed })),
        ),
      ]);
      assert.deepEqual(
        kq.map((r) => r.status),
        [200, 200, 200, 200],
        `vòng ${vong}`,
      );
    }
  },
);

test(
  "L3 race: PATCH /api/workpackages/:id đổi ngày song song tick đơn/lô trên task kế thừa ngày — không 500",
  S,
  async () => {
    const ctx = await dungDuAn();
    const pkg = await nhom(ctx, "WR", { endDate: TUONG_LAI });
    const ts = [await task(pkg, "WR,01"), await task(pkg, "WR,02"), await task(pkg, "WR,03")];
    const dims = [] as number[][];
    for (const t of ts) dims.push(await oDim(t, 2));
    const { PATCH: WP } = await import("@/app/api/workpackages/[id]/route");
    const { PATCH: DON } = await import("@/app/api/dimensions/[id]/route");
    const { PATCH: LO } = await import("@/app/api/dimensions/batch/route");
    for (let vong = 0; vong < 10; vong++) {
      const installed = vong % 2 === 0;
      const kq = await Promise.all([
        requestRieng(() => DON(req(`/api/dimensions/${dims[2][0]}`, { installed }), P(dims[2][0]))),
        requestRieng(() =>
          WP(req(`/api/workpackages/${pkg}`, { endDate: vong % 2 ? QUA_KHU : TUONG_LAI }), P(pkg)),
        ),
        requestRieng(() =>
          LO(req("/api/dimensions/batch", { ids: [dims[1][0], dims[0][1]], installed })),
        ),
      ]);
      assert.deepEqual(
        kq.map((r) => r.status),
        [200, 200, 200],
        `vòng ${vong}`,
      );
    }
  },
);

test(
  "L7 race: DELETE cột allGroups song song tick đơn + lô tick trên các task của sheet — không 500",
  S,
  async () => {
    const ctx = await dungDuAn();
    const p1 = await nhom(ctx, "CR1");
    const p2 = await nhom(ctx, "CR2");
    const ts = [await task(p2, "CR2,01"), await task(p1, "CR1,01"), await task(p2, "CR2,02")];
    const { insertId } = await import("@/lib/db");
    const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
    const { PATCH: DON } = await import("@/app/api/dimensions/[id]/route");
    const { PATCH: LO } = await import("@/app/api/dimensions/batch/route");
    const giu: number[][] = [];
    for (const t of ts) giu.push(await oDim(t, 2, "G"));
    for (let vong = 0; vong < 8; vong++) {
      // Cột tạm X<vong> cho mọi task — bị xoá allGroups trong lúc có người tick cột giữ lại.
      for (const t of ts)
        await insertId(
          `INSERT INTO progress_dimensions (task_id, dimension_label, sort_order) VALUES (?, ?, 9)`,
          t,
          `X${vong}`,
        );
      const installed = vong % 2 === 0;
      const kq = await Promise.all([
        requestRieng(() => DON(req(`/api/dimensions/${giu[2][0]}`, { installed }), P(giu[2][0]))),
        requestRieng(() =>
          DELETE(
            new NextRequest(
              `http://localhost/api/workpackages/${p1}/dimensions/column?label=X${vong}&allGroups=true`,
              { method: "DELETE" },
            ),
            P(p1),
          ),
        ),
        requestRieng(() =>
          LO(req("/api/dimensions/batch", { ids: [giu[0][1], giu[1][0]], installed })),
        ),
      ]);
      assert.deepEqual(
        kq.map((r) => r.status),
        [200, 200, 200],
        `vòng ${vong}`,
      );
    }
  },
);

// ---------------------------------------------------------------------------------------
// Hồi quy % / trạng thái — kết quả phải y như trước khi đổi thứ tự khoá
// ---------------------------------------------------------------------------------------

test(
  "PATCH /api/workpackages/:id đổi ngày: task kế thừa lên 'tre', task có ngày riêng giữ nguyên, nhóm tính lại + version bump",
  S,
  async () => {
    const { PATCH: WP } = await import("@/app/api/workpackages/[id]/route");
    const ctx = await dungDuAn();
    const pkg = await nhom(ctx, "WD", { endDate: TUONG_LAI });
    const ke = await task(pkg, "WD,01"); // kế thừa ngày nhóm, 1/2 ô
    const rieng = await task(pkg, "WD,02", { endDate: TUONG_LAI }); // ngày riêng, 2/2 ô
    const xong = await task(pkg, "WD,03", { progress: 0.25 }); // kế thừa, không ô, 0.25
    const d1 = await oDim(ke, 2);
    const d2 = await oDim(rieng, 2);
    const { PATCH: LO } = await import("@/app/api/dimensions/batch/route");
    assert.equal(
      (await LO(req("/api/dimensions/batch", { ids: [d1[0], ...d2], installed: true }))).status,
      200,
    );
    assert.equal((await trangThaiTask(ke)).s, "dang_thi_cong");

    const v0 = await versionSheet(ctx.sheetTypeId);
    const res = await WP(req(`/api/workpackages/${pkg}`, { endDate: QUA_KHU }), P(pkg));
    assert.equal(res.status, 200);
    assert.deepEqual(await trangThaiTask(ke), { p: 0.5, s: "tre" });
    assert.deepEqual(await trangThaiTask(xong), { p: 0.25, s: "tre" });
    assert.deepEqual(await trangThaiTask(rieng), { p: 1, s: "hoan_thanh" });
    // Nhóm: AVG(0.5, 1, 0.25) = 0.58 (NUMERIC), quá hạn → tre.
    assert.deepEqual(await trangThaiNhom(pkg), { p: 0.58, s: "tre" });
    assert.ok((await versionSheet(ctx.sheetTypeId)) > v0, "client phải thấy version đổi");

    // Dời ngày về tương lai → hết trễ.
    assert.equal(
      (await WP(req(`/api/workpackages/${pkg}`, { endDate: TUONG_LAI }), P(pkg))).status,
      200,
    );
    assert.deepEqual(await trangThaiTask(ke), { p: 0.5, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiTask(xong), { p: 0.25, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiNhom(pkg), { p: 0.58, s: "dang_thi_cong" });

    // Chỉ đổi tên (không đổi ngày) — vẫn bump version để client khác thấy.
    const v1 = await versionSheet(ctx.sheetTypeId);
    assert.equal(
      (await WP(req(`/api/workpackages/${pkg}`, { name: "Tên mới" }), P(pkg))).status,
      200,
    );
    assert.ok((await versionSheet(ctx.sheetTypeId)) > v1);
  },
);

test(
  "PATCH /api/workpackages/:id đổi ngày nhóm KHÔNG có task kế thừa: nhóm vẫn tính lại trạng thái",
  S,
  async () => {
    const { PATCH: WP } = await import("@/app/api/workpackages/[id]/route");
    const { run } = await import("@/lib/db");
    const ctx = await dungDuAn();
    const pkg = await nhom(ctx, "WE", { endDate: TUONG_LAI });
    const t = await task(pkg, "WE,01", { endDate: TUONG_LAI, progress: 0.4 });
    await run(
      `UPDATE work_packages SET progress = 0.4, status = 'dang_thi_cong' WHERE id = ?`,
      pkg,
    );
    assert.equal(
      (await WP(req(`/api/workpackages/${pkg}`, { endDate: QUA_KHU }), P(pkg))).status,
      200,
    );
    assert.deepEqual(await trangThaiNhom(pkg), { p: 0.4, s: "tre" });
    // Task có ngày riêng không bị đụng (không kế thừa ngày nhóm).
    assert.deepEqual(await trangThaiTask(t), { p: 0.4, s: "chuan_bi" });
  },
);

test(
  "PATCH /api/tasks/batch đổi ngày 2 nhóm: trạng thái task/nhóm đúng; lỗi id không tồn tại / dự án khác giữ thông điệp cũ",
  S,
  async () => {
    const { PATCH: BATCH } = await import("@/app/api/tasks/batch/route");
    const { queryOne } = await import("@/lib/db");
    const ctx = await dungDuAn();
    const p1 = await nhom(ctx, "TB1");
    const p2 = await nhom(ctx, "TB2");
    const a = await task(p1, "TB1,01", { progress: 0.5 });
    const b = await task(p2, "TB2,01", { progress: 0.2 });
    const c = await task(p2, "TB2,02", { progress: 1 });
    const res = await BATCH(
      req("/api/tasks/batch", {
        updates: [
          { id: c, patch: { endDate: QUA_KHU } },
          { id: b, patch: { endDate: QUA_KHU, name: "Đổi tên B" } },
          { id: a, patch: { endDate: QUA_KHU } },
        ],
      }),
    );
    assert.equal(res.status, 200);
    assert.equal((await res.json()).updated, 3);
    assert.equal((await trangThaiTask(a)).s, "tre");
    assert.equal((await trangThaiTask(b)).s, "tre");
    assert.equal((await trangThaiTask(c)).s, "hoan_thanh");
    assert.deepEqual(await trangThaiNhom(p1), { p: 0.5, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiNhom(p2), { p: 0.6, s: "dang_thi_cong" });
    const tenB = await queryOne<{ name: string }>(`SELECT name FROM tasks WHERE id = ?`, b);
    assert.equal(tenB!.name, "Đổi tên B");

    // Cùng id 2 lần trong lô: lần sau thấy trạng thái lần trước đã ghi (như vòng tuần tự cũ).
    const d = await task(p1, "TB1,02", { progress: 0.3 });
    const r2 = await BATCH(
      req("/api/tasks/batch", {
        updates: [
          { id: d, patch: { status: "tre" } },
          { id: d, patch: { status: "dang_thi_cong" } },
        ],
      }),
    );
    assert.equal(r2.status, 200);
    assert.equal((await trangThaiTask(d)).s, "dang_thi_cong");
    const h = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM task_history WHERE task_id = ?`,
      d,
    );
    assert.equal(h!.n, 2, "mỗi lần đổi trạng thái thủ công ghi 1 dòng history");

    // id không tồn tại → 422 cùng thông điệp, không ghi gì (lô atomic).
    const r3 = await BATCH(
      req("/api/tasks/batch", {
        updates: [
          { id: a, patch: { name: "Không được ghi" } },
          { id: 2147480000, patch: { name: "x" } },
        ],
      }),
    );
    assert.equal(r3.status, 422);
    assert.equal((await r3.json()).error, "Không tìm thấy task #2147480000");
    const tenA = await queryOne<{ name: string }>(`SELECT name FROM tasks WHERE id = ?`, a);
    assert.equal(tenA!.name, "Task TB1,01");

    // Task thuộc dự án khác → cùng lỗi generic.
    const khac = await dungDuAn();
    const pk = await nhom(khac, "TBK");
    const tk = await task(pk, "TBK,01");
    await dangNhapDuAn({ id: ctx.userId, passwordHash: ctx.pwHash }, ctx.projectId);
    const r4 = await BATCH(
      req("/api/tasks/batch", { updates: [{ id: tk, patch: { name: "x" } }] }),
    );
    assert.equal(r4.status, 422);
    assert.equal((await r4.json()).error, `Không tìm thấy task #${tk}`);

    // id không phải số → thông điệp cũ.
    const r5 = await BATCH(req("/api/tasks/batch", { updates: [{ id: "abc", patch: {} }] }));
    assert.equal(r5.status, 422);
    assert.equal((await r5.json()).error, "ID không hợp lệ");
  },
);

test(
  "DELETE /api/workpackages/:id/dimensions/column?allGroups: % task + nhóm tính lại đúng",
  S,
  async () => {
    const { DELETE } = await import("@/app/api/workpackages/[id]/dimensions/column/route");
    const { run } = await import("@/lib/db");
    const ctx = await dungDuAn();
    const p1 = await nhom(ctx, "CD1");
    const p2 = await nhom(ctx, "CD2");
    const a = await task(p1, "CD1,01");
    const b = await task(p2, "CD2,01");
    const c = await task(p1, "CD1,02");
    const da = await oDim(a, 3); // D0 D1 D2
    const db = await oDim(b, 2); // D0 D1
    await oDim(c, 1); // D0
    // Tick D0,D1 của a; D0 của b.
    await run(
      `UPDATE progress_dimensions SET installed = 1 WHERE id IN (?, ?, ?)`,
      da[0],
      da[1],
      db[0],
    );
    // Xoá cột D1 ở mọi nhóm: a còn D0(✓) D2 → 0.5; b còn D0(✓) → 1; c giữ D0 → 0.
    const res = await DELETE(
      new NextRequest(
        `http://localhost/api/workpackages/${p2}/dimensions/column?label=D1&allGroups=true`,
        {
          method: "DELETE",
        },
      ),
      P(p2),
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { deleted: 2, groups: 2 });
    assert.deepEqual(await trangThaiTask(a), { p: 0.5, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiTask(b), { p: 1, s: "hoan_thanh" });
    assert.deepEqual(await trangThaiTask(c), { p: 0, s: "chuan_bi" });
    assert.deepEqual(await trangThaiNhom(p1), { p: 0.25, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiNhom(p2), { p: 1, s: "hoan_thanh" });
  },
);

test(
  "POST /api/approvals duyệt tầng 2 nhóm: task nghiem_thu, % nhóm tính lại xong TRƯỚC khi trả lời",
  S,
  async () => {
    const { POST } = await import("@/app/api/approvals/route");
    const { run } = await import("@/lib/db");
    const ctx = await dungDuAn();
    const floor = `T${RUN}`;
    const p1 = await nhom(ctx, "AP1", { floor });
    const p2 = await nhom(ctx, "AP2", { floor });
    const ts = [
      await task(p2, "AP2,01", { progress: 1 }),
      await task(p1, "AP1,01", { progress: 1 }),
    ];
    // Nhóm còn lệch % (chưa tính lại) — duyệt tầng phải tính lại trong cùng transaction.
    await run(
      `UPDATE work_packages SET progress = 0.5, status = 'dang_thi_cong' WHERE id IN (?, ?)`,
      p1,
      p2,
    );
    const res = await POST(
      req("/api/approvals", { sheetTypeId: ctx.sheetTypeId, floorLabel: floor }, "POST"),
    );
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    assert.equal((await res.json()).taskCount, 2);
    for (const t of ts) assert.equal((await trangThaiTask(t)).s, "nghiem_thu");
    assert.deepEqual(await trangThaiNhom(p1), { p: 1, s: "hoan_thanh" });
    assert.deepEqual(await trangThaiNhom(p2), { p: 1, s: "hoan_thanh" });
  },
);

// ---------------------------------------------------------------------------------------
// system-upload (L6)
// ---------------------------------------------------------------------------------------

async function heThong(): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ id: number }>(`SELECT id FROM systems ORDER BY id LIMIT 1`))!.id;
}

test(
  "parsePlanUpload: nhiều task 2 nhóm + dòng trùng BOQ (dòng sau thắng) — ngày, trạng thái, nhóm, cảnh báo y như trước",
  S,
  async () => {
    const { parsePlanUpload } = await import("@/lib/tien-do/system-upload");
    const { queryOne } = await import("@/lib/db");
    const systemId = await heThong();
    const ctx = await dungDuAn("pm", systemId);
    const p1 = await nhom(ctx, "PU1");
    const p2 = await nhom(ctx, "PU2");
    const boq = (s: string) => `G1PU-${RUN}-${s}`;
    const a = await task(p2, "PU2,01", { boq: boq("a"), progress: 0.5 });
    const b = await task(p1, "PU1,01", { boq: boq("b"), progress: 1 });
    const c = await task(p1, "PU1,02", { boq: boq("c"), progress: 0.2 });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Kế hoạch");
    ws.addRow(["BOQCODE", "Sheet", "Nhóm", "Mã", "Tên", "Ngày bắt đầu KH", "Ngày kết thúc KH"]);
    ws.addRow([boq("c"), "", "", "", "", "2019-12-01", QUA_KHU]);
    ws.addRow([boq("a"), "", "", "", "", "2019-12-01", TUONG_LAI]);
    ws.addRow(["", "", "", "", "", "", ""]);
    ws.addRow([boq("b"), "", "", "", "", "2019-12-01", QUA_KHU]);
    ws.addRow([boq("a"), "", "", "", "", "2019-12-01", QUA_KHU]); // trùng — dòng sau thắng
    ws.addRow(["KHONG-CO", "", "", "", "", "2019-12-01", QUA_KHU]);
    ws.addRow([boq("c"), "", "", "", "", "2020-02-01", QUA_KHU]); // BĐ sau KT → bỏ qua
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    const kq = await parsePlanUpload(systemId, ctx.projectId, buf, "g1");
    assert.equal(kq.matched, 4);
    assert.equal(kq.unmatched, 3);
    assert.equal(kq.warnings.length, 3);
    assert.match(kq.warnings[0], /^Dòng 4: thiếu BOQCODE/);
    assert.match(kq.warnings[1], /^Dòng 7: BOQCODE "KHONG-CO"/);
    assert.match(kq.warnings[2], /^Dòng 8: Ngày bắt đầu sau ngày kết thúc/);
    const ngay = await queryOne<{ e: string }>(`SELECT end_date AS e FROM tasks WHERE id = ?`, a);
    assert.equal(ngay!.e, QUA_KHU);
    assert.deepEqual(await trangThaiTask(a), { p: 0.5, s: "tre" });
    assert.deepEqual(await trangThaiTask(b), { p: 1, s: "hoan_thanh" });
    assert.deepEqual(await trangThaiTask(c), { p: 0.2, s: "tre" });
    assert.deepEqual(await trangThaiNhom(p1), { p: 0.6, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiNhom(p2), { p: 0.5, s: "dang_thi_cong" });
  },
);

test(
  "parseTrackingUpload: 2 nhóm + dòng trùng task (dòng sau thắng) — ô, %, history, nhóm, cảnh báo y như trước",
  S,
  async () => {
    const { parseTrackingUpload } = await import("@/lib/tien-do/system-upload");
    const { query, queryOne } = await import("@/lib/db");
    const systemId = await heThong();
    const ctx = await dungDuAn("pm", systemId);
    const st = await queryOne<{ code: string }>(
      `SELECT code FROM sheet_types WHERE id = ?`,
      ctx.sheetTypeId,
    );
    const { safeTabName } = await import("@/lib/tien-do/excel-tracking");
    const p1 = await nhom(ctx, "TU1");
    const p2 = await nhom(ctx, "TU2");
    const boq = (s: string) => `G1TU-${RUN}-${s}`;
    const a = await task(p2, "TU2,01", { boq: boq("a") });
    const b = await task(p1, "TU1,01", { boq: boq("b") });
    await oDim(a, 2); // D0 D1
    await oDim(b, 2);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(safeTabName(st!.code));
    ws.addRow(["BOQCODE", "Mã", "Tên", "Tầng", "Người", "BĐ", "KT", "%", "TT", "D0", "D1", "DX"]);
    ws.addRow([boq("a"), "TU2,01", "", "", "", "", "", "", "", "x", "x"]);
    ws.addRow([boq("b"), "TU1,01", "", "", "", "", "", "", "", "x", "o"]);
    ws.addRow([boq("a"), "TU2,01", "", "", "", "", "", "", "", "o", "x", "x"]); // trùng: D0 bỏ tick
    ws.addRow([`KHONG-${RUN}`, "Z,01", "", "", "", "", "", "", "", "x"]);
    const buf = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
    const kq = await parseTrackingUpload(systemId, ctx.projectId, buf, "g1", ctx.userId);
    assert.equal(kq.rowCount, 4);
    assert.equal(kq.matched, 3);
    assert.equal(kq.unmatched, 1);
    assert.deepEqual(
      kq.warnings.map((w) => w.replace(/BOQCODE "[^"]+"/, "BOQCODE")),
      [
        `Dòng 4 tab "${safeTabName(st!.code)}": nhãn "DX" không khớp với dimension nào của task, bỏ qua`,
        `Dòng 5 tab "${safeTabName(st!.code)}": BOQCODE không thuộc sheet này hoặc không tồn tại`,
      ],
    );
    const oa = await query<{ l: string; i: number; by: number | null }>(
      `SELECT dimension_label AS l, installed AS i, installed_by AS by FROM progress_dimensions WHERE task_id = ? ORDER BY sort_order`,
      a,
    );
    assert.deepEqual(oa, [
      { l: "D0", i: 0, by: null },
      { l: "D1", i: 1, by: ctx.userId },
    ]);
    assert.deepEqual(await trangThaiTask(a), { p: 0.5, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiTask(b), { p: 0.5, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiNhom(p1), { p: 0.5, s: "dang_thi_cong" });
    assert.deepEqual(await trangThaiNhom(p2), { p: 0.5, s: "dang_thi_cong" });
    const h = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM task_history WHERE task_id = ? AND changed_by = 'g1'`,
      a,
    );
    // Dòng trùng xử lý tuần tự theo dòng như trước: 0 → 1 (dòng 2) rồi 1 → 0.5 (dòng 4).
    assert.equal(h!.n, 2, "lịch sử % theo từng dòng file giữ y như trước");
  },
);

// ---------------------------------------------------------------------------------------
// L5 — push phân công gom lại, gửi sau COMMIT
// ---------------------------------------------------------------------------------------

test(
  "L5: assign* nhận hàng đợi push → chỉ INSERT notifications, push gom vào hàng đợi (gửi sau COMMIT)",
  S,
  async () => {
    const { withTransaction, queryOne } = await import("@/lib/db");
    const { assignTask, assignPackage } = await import("@/lib/tien-do/assignments");
    const ctx = await dungDuAn();
    const pkg = await nhom(ctx, "AS");
    const t = await task(pkg, "AS,01");
    const hangDoi: { userIds: number[]; payload: { title: string; body: string } }[] = [];
    await withTransaction(async () => {
      await assignTask(t, ctx.userId, ctx.userId, hangDoi);
      await assignPackage(pkg, ctx.userId, ctx.userId, hangDoi);
    });
    assert.equal(hangDoi.length, 2);
    assert.deepEqual(hangDoi[0].userIds, [ctx.userId]);
    assert.equal(hangDoi[0].payload.title, "Phân công mới");
    assert.match(hangDoi[0].payload.body, /Bạn được giao task "Task AS,01"/);
    const n = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ? AND type = 'assigned'`,
      ctx.userId,
    );
    assert.equal(n!.n, 2);

    // Route vẫn 200 + ghi thông báo.
    const { POST } = await import("@/app/api/admin/assignments/route");
    const t2 = await task(pkg, "AS,02");
    const res = await POST(
      req("/api/admin/assignments", { level: "task", id: t2, userId: ctx.userId }, "POST"),
    );
    assert.equal(res.status, 200);
    const r = await queryOne<{ a: number }>(`SELECT assigned_to AS a FROM tasks WHERE id = ?`, t2);
    assert.equal(r!.a, ctx.userId);
  },
);

// ---------------------------------------------------------------------------------------
// Audit-logic đợt 3 (MEDIUM): gán người cho nhóm/hệ phải khoá task TRƯỚC nhóm — cùng chiều tick.
// Một tick đang giữ task T (và sắp xin khoá nhóm) thì assignPackage phải đứng chờ ở T, KHÔNG
// được giữ sẵn khoá dòng nhóm (nếu giữ → hai bên chờ nhau → deadlock, một bên 500).
// ---------------------------------------------------------------------------------------

test(
  "assignPackage: chờ khoá task trước, không giữ dòng nhóm khi task đang bị tick khoá",
  S,
  async () => {
    const { withTransaction, queryOne } = await import("@/lib/db");
    const { assignPackage } = await import("@/lib/tien-do/assignments");
    const ctx = await dungDuAn();
    const pkg = await nhom(ctx, "AS1");
    const t = await task(pkg, "AS1,01");
    const giu = await ketNoiRieng();
    const quanSat = await ketNoiRieng();
    try {
      await giu.query("BEGIN");
      await giu.query("SELECT id FROM tasks WHERE id = $1 FOR UPDATE", [t]);
      const gan = withTransaction(() => assignPackage(pkg, ctx.userId, ctx.userId));
      await new Promise((r) => setTimeout(r, 300));
      const nhomTrong = await khoaDuocNgay(
        quanSat,
        "SELECT id FROM work_packages WHERE id = $1 FOR NO KEY UPDATE NOWAIT",
        [pkg],
      );
      await giu.query("COMMIT");
      await gan;
      assert.equal(nhomTrong, true, "assignPackage không được khoá nhóm trước khi có khoá task");
      const r = await queryOne<{ a: number | null }>(
        `SELECT assigned_to AS a FROM tasks WHERE id = ?`,
        t,
      );
      assert.equal(r?.a, ctx.userId);
    } finally {
      await giu.end();
      await quanSat.end();
    }
  },
);
