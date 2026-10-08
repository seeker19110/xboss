// Benchmark p95 các báo cáo chính (A4-AC08, ngưỡng D09 trong APPROVAL.md §10):
//   "báo cáo chuẩn không quá 2 giây trên fixture 10.000 task, 20 phiên đồng thời, sau warmup;
//    không chậm hơn baseline quá 10% trên cùng cấu hình; không có số đo thì NOT_RUN".
//
// Chạy:  BENCH_DATABASE_URL=postgres://u:p@localhost:5432/bench_xxx npm run bench:reports
//        (DB disposable, đã `npm run db:migrate` bằng chính URL đó; tên DB phải bắt đầu `bench_`)
//        [--k 30] [--warmup 5] [--concurrency 20] [--projects 5] [--tasks-per-project 2000]
//        [--write-baseline file.json] [--baseline file.json]
//
// AN TOÀN: script GHI dữ liệu fixture lớn, nên fail-fast nếu
//  - thiếu BENCH_DATABASE_URL (KHÔNG bao giờ đọc DATABASE_URL để chạy);
//  - URL trùng DATABASE_URL/MIGRATE_DATABASE_URL/TEST_DATABASE_URL, host không phải local
//    (trừ khi BENCH_ALLOW_REMOTE_HOST=1) hoặc tên DB không bắt đầu `bench_`;
//  - DB chưa có bảng marker `xboss_bench_marker` mà lại đã có dữ liệu (projects/users) — chỉ DB
//    TRỐNG (vừa migrate) hoặc DB do chính script này đánh dấu mới được dùng.
// Idempotent: DB đã seed đúng cùng cấu hình thì bỏ qua bước seed; khác cấu hình → báo lỗi, hãy
// tạo DB mới (không tự xoá dữ liệu).
//
// BENCH_APP_DATABASE_URL (tuỳ chọn): đo bằng role xboss_app có RLS như production.
//
// Cần cờ mock của node:test để gọi route handler thật (đã gói trong `npm run bench:reports`).
// Thoát 0 = mọi báo cáo PASS (baseline NOT_RUN không làm đỏ), 1 = có FAIL/lỗi, 2 = tham số sai.
import "./env";
import os from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";

const NGUONG_P95_MS = 2000; // D09: báo cáo chuẩn
const NGUONG_BASELINE = 1.1; // D09: không chậm hơn baseline quá 10%

type Args = {
  k: number;
  warmup: number;
  concurrency: number;
  projects: number;
  tasksPerProject: number;
  baseline: string | null;
  writeBaseline: string | null;
};

function parseArgs(argv: string[]): Args {
  const a: Args = {
    k: 30,
    warmup: 5,
    concurrency: 20,
    projects: 5,
    tasksPerProject: 2000,
    baseline: null,
    writeBaseline: null,
  };
  const so = (ten: string, v: string | undefined): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) thoat(2, `Tham số ${ten} phải là số nguyên dương.`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 2) {
    const [ten, v] = [argv[i], argv[i + 1]];
    if (ten === "--k") a.k = so(ten, v);
    else if (ten === "--warmup") a.warmup = so(ten, v);
    else if (ten === "--concurrency") a.concurrency = so(ten, v);
    else if (ten === "--projects") a.projects = so(ten, v);
    else if (ten === "--tasks-per-project") a.tasksPerProject = so(ten, v);
    else if (ten === "--baseline") a.baseline = v ?? null;
    else if (ten === "--write-baseline") a.writeBaseline = v ?? null;
    else thoat(2, `Tham số lạ: ${ten}`);
  }
  return a;
}

function thoat(code: number, msg: string): never {
  console.error(`${code === 0 ? "" : "LỖI: "}${msg}`);
  process.exit(code);
}

/** Kiểm URL + marker TRƯỚC khi nạp lib/db; trả URL đã chấp nhận. */
async function kiemAnToan(): Promise<string> {
  const url = process.env.BENCH_DATABASE_URL;
  if (!url) thoat(2, "Thiếu BENCH_DATABASE_URL (script không bao giờ dùng DATABASE_URL).");
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return thoat(2, "BENCH_DATABASE_URL không phải URL hợp lệ.");
  }
  for (const ten of ["DATABASE_URL", "MIGRATE_DATABASE_URL", "TEST_DATABASE_URL"]) {
    if (process.env[ten] && process.env[ten] === url) {
      thoat(2, `BENCH_DATABASE_URL trùng ${ten} — từ chối chạy trên DB dùng chung.`);
    }
  }
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!/^bench_[a-z0-9_]+$/.test(dbName)) {
    thoat(
      2,
      `Tên DB "${dbName}" phải khớp ^bench_[a-z0-9_]+$ (DB disposable riêng cho benchmark).`,
    );
  }
  const host = u.hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(host);
  if (!local && process.env.BENCH_ALLOW_REMOTE_HOST !== "1") {
    thoat(
      2,
      `Host "${host}" không phải local; đặt BENCH_ALLOW_REMOTE_HOST=1 nếu chắc chắn DB disposable.`,
    );
  }
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const mk = await c.query(`SELECT to_regclass('public.xboss_bench_marker') AS t`);
    if (mk.rows[0].t == null) {
      const sm = await c.query(`SELECT to_regclass('public.schema_migrations') AS t`);
      if (sm.rows[0].t == null)
        thoat(2, "DB chưa migrate — chạy `npm run db:migrate` với URL này trước.");
      const du = await c.query(
        `SELECT (SELECT COUNT(*) FROM projects) AS p, (SELECT COUNT(*) FROM users) AS u`,
      );
      if (Number(du.rows[0].p) > 0 || Number(du.rows[0].u) > 0) {
        thoat(
          2,
          "DB có dữ liệu nhưng không có marker xboss_bench_marker — không phải DB do benchmark tạo.",
        );
      }
      await c.query(
        `CREATE TABLE xboss_bench_marker (id int PRIMARY KEY, created_at timestamptz DEFAULT now(), profile text)`,
      );
      await c.query(`INSERT INTO xboss_bench_marker (id) VALUES (1)`);
    }
  } finally {
    await c.end();
  }
  return url;
}

function phanVi(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

type Dung = { p50: number; p95: number; max: number; n: number; loi: number };
function thongKe(ms: number[], loi: number): Dung {
  const s = [...ms].sort((x, y) => x - y);
  return { p50: phanVi(s, 50), p95: phanVi(s, 95), max: s[s.length - 1] ?? NaN, n: s.length, loi };
}

type KetQuaBaoCao = { ten: string; tuanTu: Dung; dongThoi: Dung };
type Baseline = {
  config: Record<string, unknown>;
  p95: Record<string, { tuanTu: number; dongThoi: number }>;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = await kiemAnToan();
  // Từ đây mọi lib/db dùng đúng DB bench; gỡ các URL khác để không ghi nhầm.
  process.env.DATABASE_URL = url;
  process.env.MIGRATE_DATABASE_URL = url;
  delete process.env.TEST_DATABASE_URL;
  process.env.XBOSS_SECRET ??= "bench-reports-secret-khong-dung-o-production";

  const { mock } = await import("node:test");
  if (typeof (mock as { module?: unknown }).module !== "function") {
    thoat(2, "Thiếu cờ --experimental-test-module-mocks — chạy qua `npm run bench:reports`.");
  }
  const phien = await import("../tests/helpers/phien");
  const lib = await import("@/lib/db");
  const { taoDuAnMau } = await import("./lib/bao-cao-fixture");
  const { NextRequest } = await import("next/server");

  // ---- Seed (idempotent theo profile) ----
  const profile = {
    projects: args.projects,
    tasksPerProject: args.tasksPerProject,
    sheets: 5,
    dimsPerTask: 3,
    floorsPerSheet: 20,
    boqItems: 2000,
    poCount: 500,
  };
  const packagesPerSheet = 20;
  const tasksPerPackage = Math.max(
    1,
    Math.round(args.tasksPerProject / (profile.sheets * packagesPerSheet)),
  );
  const profileJson = JSON.stringify({ ...profile, packagesPerSheet, tasksPerPackage });
  const mk = await lib.queryOne<{ profile: string | null }>(
    `SELECT profile FROM xboss_bench_marker WHERE id = 1`,
  );
  if (mk?.profile == null) {
    console.log(`Seed ${args.projects} dự án × ~${args.tasksPerProject} task…`);
    const t0 = Date.now();
    for (let i = 1; i <= args.projects; i++) {
      await taoDuAnMau(lib, `P${i}`, {
        sheets: profile.sheets,
        packagesPerSheet,
        tasksPerPackage,
        dimsPerTask: profile.dimsPerTask,
        floorsPerSheet: profile.floorsPerSheet,
        boqItems: profile.boqItems,
        poCount: profile.poCount,
      });
    }
    await lib.run(`UPDATE xboss_bench_marker SET profile = ? WHERE id = 1`, profileJson);
    await lib.run(`ANALYZE`);
    console.log(`Seed xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  } else if (mk.profile !== profileJson) {
    thoat(2, `DB đã seed với cấu hình khác (${mk.profile}). Tạo DB bench_* mới để đổi kích thước.`);
  } else {
    console.log("DB đã seed đúng cấu hình — bỏ qua seed.");
  }

  const duAn = await lib.query<{ id: number }>(
    `SELECT id FROM projects WHERE name LIKE 'BENCH P%' ORDER BY id`,
  );
  const [tong] = await lib.query<{
    tasks: number;
    dims: number;
    boq: number;
    pay: number;
    po: number;
  }>(
    `SELECT (SELECT COUNT(*) FROM tasks) AS tasks, (SELECT COUNT(*) FROM progress_dimensions) AS dims,
            (SELECT COUNT(*) FROM boq_items) AS boq, (SELECT COUNT(*) FROM payment_bills) AS pay,
            (SELECT COUNT(*) FROM po_items) AS po`,
  );
  const [pg] = await lib.query<{ v: string }>(`SELECT version() AS v`);

  // ---- Người dùng + phiên ----
  let user = await lib.queryOne<{ id: number; password_hash: string }>(
    `SELECT id, password_hash FROM users WHERE email = 'bench-pm@bench.local'`,
  );
  if (!user) {
    const id = await lib.insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('Bench PM', 'bench-pm@bench.local', 'hash-bench', 'pm', 1)`,
    );
    user = { id, password_hash: "hash-bench" };
  }
  for (const p of duAn) {
    await lib.run(
      `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      user.id,
      p.id,
    );
  }
  await phien.dangNhapDuAn({ id: user.id, passwordHash: user.password_hash }, duAn[0].id);

  // Tuỳ chọn BENCH_APP_DATABASE_URL: đo bằng role ứng dụng `xboss_app` (NOBYPASSRLS, ADR-0005) như
  // production — chi phí RLS có trong số đo. Phải cùng host/DB với BENCH_DATABASE_URL. Seed ở trên
  // đã xong bằng role owner nên đổi pool sang role app từ đây.
  const appUrl = process.env.BENCH_APP_DATABASE_URL;
  if (appUrl) {
    const a = new URL(appUrl);
    const b = new URL(url);
    if (a.host !== b.host || a.pathname !== b.pathname) {
      thoat(2, "BENCH_APP_DATABASE_URL phải cùng host/DB với BENCH_DATABASE_URL.");
    }
    await lib.getPool().end();
    (globalThis as unknown as { __xbossPool?: unknown }).__xbossPool = undefined;
    process.env.DATABASE_URL = appUrl;
    const { __resetServerEnvCache } = await import("@/lib/nen/env");
    __resetServerEnvCache();
  }

  // ---- Báo cáo đo (route handler thật, có auth + phạm vi như production) ----
  const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };
  const goi =
    (modul: string, path: string, headers: Record<string, string> = {}) =>
    async () => {
      const { GET } = (await import(modul)) as {
        GET: (r: InstanceType<typeof NextRequest>) => Promise<Response>;
      };
      const res = await phien.requestRieng(() =>
        GET(new NextRequest(`http://localhost${path}`, { method: "GET", headers })),
      );
      await res.arrayBuffer(); // đọc hết thân như client thật
      if (res.status !== 200) throw new Error(`HTTP ${res.status} ${path}`);
    };
  const baoCao: { ten: string; chay: () => Promise<void> }[] = [
    {
      ten: "costs?groupBy=system",
      chay: goi("@/app/api/costs/route", "/api/costs?groupBy=system", V1),
    },
    {
      ten: "costs?groupBy=floor",
      chay: goi("@/app/api/costs/route", "/api/costs?groupBy=floor", V1),
    },
    { ten: "portfolio/kpi", chay: goi("@/app/api/portfolio/kpi/route", "/api/portfolio/kpi") },
    { ten: "dashboard", chay: goi("@/app/api/dashboard/route", "/api/dashboard") },
  ];

  const do1 = async (chay: () => Promise<void>): Promise<{ ms: number; loi: boolean }> => {
    const t = performance.now();
    try {
      await chay();
      return { ms: performance.now() - t, loi: false };
    } catch (e) {
      console.error(`  lỗi: ${(e as Error).message}`);
      return { ms: performance.now() - t, loi: true };
    }
  };

  const ketQua: KetQuaBaoCao[] = [];
  for (const b of baoCao) {
    for (let i = 0; i < args.warmup; i++) await do1(b.chay);
    // Tuần tự: k lần, một phiên.
    const tt: number[] = [];
    let loiTT = 0;
    for (let i = 0; i < args.k; i++) {
      const r = await do1(b.chay);
      tt.push(r.ms);
      if (r.loi) loiTT++;
    }
    // Đồng thời: `concurrency` phiên, mỗi phiên k/… lần liên tiếp (tổng ≥ k mẫu).
    const moiPhien = Math.max(5, Math.ceil(args.k / args.concurrency)); // ≥ 5 lượt/phiên → ≥ 100 mẫu
    const dt: number[] = [];
    let loiDT = 0;
    await Promise.all(
      Array.from({ length: args.concurrency }, async () => {
        for (let i = 0; i < moiPhien; i++) {
          const r = await do1(b.chay);
          dt.push(r.ms);
          if (r.loi) loiDT++;
        }
      }),
    );
    ketQua.push({ ten: b.ten, tuanTu: thongKe(tt, loiTT), dongThoi: thongKe(dt, loiDT) });
  }

  // ---- Báo cáo ----
  const config = {
    roleApp: Boolean(appUrl),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? "?",
    postgres: pg.v.split(" on ")[0],
    projects: duAn.length,
    tasks: Number(tong.tasks),
    dims: Number(tong.dims),
    boqItems: Number(tong.boq),
    payments: Number(tong.pay),
    poItems: Number(tong.po),
    concurrency: args.concurrency,
    warmup: args.warmup,
    k: args.k,
    poolMax: Number(process.env.XBOSS_PG_POOL_MAX ?? 10),
  };
  console.log("\nCấu hình:", JSON.stringify(config));
  let baseline: Baseline | null = null;
  if (args.baseline) baseline = JSON.parse(readFileSync(args.baseline, "utf8")) as Baseline;
  const cungCauHinh =
    baseline != null &&
    ["roleApp", "cpus", "tasks", "concurrency", "boqItems", "payments"].every(
      (k) => baseline!.config[k] === (config as Record<string, unknown>)[k],
    );

  const f = (x: number) => x.toFixed(1).padStart(8);
  let fail = false;
  console.log(
    `\n${"báo cáo".padEnd(24)} ${"chế độ".padEnd(10)}      p50      p95      max   n  lỗi  D09(≤${NGUONG_P95_MS}ms)  baseline(≤+10%)`,
  );
  for (const r of ketQua) {
    for (const [che, d, bl] of [
      ["tuần tự", r.tuanTu, baseline?.p95[r.ten]?.tuanTu],
      ["20 phiên", r.dongThoi, baseline?.p95[r.ten]?.dongThoi],
    ] as const) {
      const d09 = d.loi === 0 && d.p95 <= NGUONG_P95_MS ? "PASS" : "FAIL";
      let blKet = "NOT_RUN";
      if (baseline && cungCauHinh && bl != null)
        blKet = d.p95 <= bl * NGUONG_BASELINE ? "PASS" : "FAIL";
      if (d09 === "FAIL" || blKet === "FAIL") fail = true;
      console.log(
        `${r.ten.padEnd(24)} ${che.padEnd(10)}${f(d.p50)} ${f(d.p95)} ${f(d.max)} ${String(d.n).padStart(3)} ${String(d.loi).padStart(4)}  ${d09.padEnd(16)} ${blKet}`,
      );
    }
  }
  if (baseline && !cungCauHinh)
    console.log("Baseline khác cấu hình (cpus/tasks/concurrency/…) → NOT_RUN.");
  if (!baseline)
    console.log("Baseline: NOT_RUN (chưa có --baseline; dùng --write-baseline để chốt).");

  if (args.writeBaseline) {
    const out: Baseline = { config, p95: {} };
    for (const r of ketQua) out.p95[r.ten] = { tuanTu: r.tuanTu.p95, dongThoi: r.dongThoi.p95 };
    writeFileSync(args.writeBaseline, JSON.stringify(out, null, 2));
    console.log(`Đã ghi baseline → ${args.writeBaseline}`);
  }
  console.log(fail ? "\nKẾT QUẢ: FAIL" : "\nKẾT QUẢ: PASS (theo D09 trên fixture bench này)");
  await lib.getPool().end();
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error("Benchmark lỗi:", err);
  process.exit(1);
});
