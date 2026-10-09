import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  docDuLieuThanhToan,
  fmtFull,
  fmtVND,
  phanTram,
  thanhTienTheoPct,
  tienNhapSangMinor,
  tongPhieu,
  tongTien,
  type Bill,
} from "@/app/payments/_components/tienThanhToan";
import { soTienNhapThuan, tienTextToWire } from "@/lib/nen/money-dto";
import { isMoneyPrecisionError } from "@/lib/nen/money";

// QUALITY-FINAL-1 / S10c — tiền exact cho Thanh toán tiến độ (/api/payments, /api/payments/bills,
// /api/payments/floors, trang /payments + bản in) — A3-FR03/FR04/FR06, A3-AC01/AC03/AC05.
// Giá trị ≥ 10^13 đồng có xu lẻ: v1 chuỗi canonical không lệch xu; legacy ngoài biên → 422;
// tổng = Σ dòng (gộp lại không trôi xu); thành tiền theo % kỳ tính trong SQL (không nhân float).

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };
const MAX_DONG = "9999999999999.99"; // trần NUMERIC(15,2)
const NGUOI = "Phụ trách S10c";

const don: { projects: number[]; users: number[] } = { projects: [], users: [] };

async function dangNhapVaiTro(role: string, projectId: number) {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S10c user', ?, 'hash-test-s10c', ?, 1)`,
    `s10c-tt-${uniq(role)}@test.local`,
    role,
  );
  don.users.push(id);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  await dangNhapDuAn({ id, passwordHash: u!.password_hash }, projectId);
}

/**
 * Dự án 1 tháp, 1 hệ (phụ trách NGUOI), các tầng: mỗi tầng 1 nhóm + 1 task có progress cho trước
 * + giá trị HĐ tầng. Trả { projectId, sheetTypeId }.
 */
async function dungDuAn(tang: { label: string; value: string; progress: number }[]) {
  const { insertId, run } = await import("@/lib/db");
  const projectId = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S10c TT "));
  don.projects.push(projectId);
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S10c')`,
    projectId,
  );
  const code = uniq("TT");
  const sheetTypeId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug, responsible) VALUES (?, ?, 'Hệ S10c', ?, ?)`,
    towerId,
    code,
    code.toLowerCase(),
    NGUOI,
  );
  for (const t of tang) {
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, ?, 'Nhóm', ?)`,
      sheetTypeId,
      uniq("WP"),
      t.label,
    );
    await run(
      `INSERT INTO tasks (package_id, code, name, progress_percent) VALUES (?, ?, 'Việc', ?)`,
      wpId,
      uniq("T"),
      t.progress,
    );
    await run(
      `INSERT INTO floor_contracts (sheet_type_id, floor_label, contract_value) VALUES (?, ?, ?::numeric)`,
      sheetTypeId,
      t.label,
      t.value,
    );
  }
  return { projectId, sheetTypeId };
}

// 10 tầng × trần (tiến độ 50%) + 1 tầng 0,03 (100%): Σ HĐ = 99.999.999.999.999,93 đ (> 2^53 xu).
// earned từng tầng = ROUND(9.999.999.999.999,99 × 0,5; 2) = 5.000.000.000.000,00 (ties xa 0) →
// Σ earned = 50.000.000.000.000,03.
const TANG_LON = [
  ...Array.from({ length: 10 }, (_, i) => ({ label: `T${i + 1}`, value: MAX_DONG, progress: 0.5 })),
  { label: "RF", value: "0.03", progress: 1 },
];

const req = (url: string, headers?: Record<string, string>, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of don.projects) {
    await run(`DELETE FROM payment_bills WHERE project_id = ?`, p);
    await run(
      `DELETE FROM floor_contracts WHERE sheet_type_id IN (
         SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM tasks WHERE package_id IN (
         SELECT wp.id FROM work_packages wp JOIN sheet_types st ON st.id = wp.sheet_type_id
           JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM work_packages WHERE sheet_type_id IN (
         SELECT st.id FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id = ?)`,
      p,
    );
    await run(
      `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM towers WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

// ===== GET /api/payments =====

test(
  "GET /api/payments v1: Σ HĐ/nghiệm thu > 2^53 xu exact; tổng = Σ earned từng dòng",
  S,
  async () => {
    const { GET } = await import("@/app/api/payments/route");
    const { projectId } = await dungDuAn(TANG_LON);
    await dangNhapVaiTro("pm", projectId);

    const res = await GET(req("/api/payments", V1));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.match(res.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
    const body = await res.json();
    assert.equal(body.moneyFormat, "decimal-string-v1");
    assert.equal(body.totalContract, "99999999999999.93");
    assert.equal(body.totalEarned, "50000000000000.03");
    const t1 = body.rows.find((r: { floorLabel: string }) => r.floorLabel === "T1");
    assert.equal(t1.contractValue, MAX_DONG);
    assert.equal(t1.earned, "5000000000000.00");
    assert.equal(typeof t1.progress, "number"); // tỷ lệ/đếm giữ kiểu cũ (A3-AC05)

    // Client đọc v1 → bigint; Σ dòng (bất kỳ cách lọc/gộp nào) khớp đúng tổng server.
    const d = docDuLieuThanhToan(body)!;
    assert.equal(
      tongTien(d.rows, (r) => r.earned),
      d.totalEarned,
    );
    assert.equal(
      tongTien(d.rows, (r) => r.contractValue),
      9999999999999993n,
    );
  },
);

test("GET /api/payments legacy: tổng ngoài biên round-trip → 422 (không xấp xỉ)", S, async () => {
  const { GET } = await import("@/app/api/payments/route");
  const { projectId } = await dungDuAn(TANG_LON);
  await dangNhapVaiTro("admin", projectId);

  const res = await GET(req("/api/payments"));
  assert.equal(res.status, 422);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal((await res.json()).code, "money_precision_unsupported");
});

test("GET /api/payments legacy trong biên: vẫn number như cũ", S, async () => {
  const { GET } = await import("@/app/api/payments/route");
  const { projectId } = await dungDuAn([{ label: "T1", value: "1000000.50", progress: 0.25 }]);
  await dangNhapVaiTro("admin", projectId);

  const res = await GET(req("/api/payments"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.moneyFormat, undefined);
  assert.equal(body.totalContract, 1000000.5);
  assert.equal(body.totalEarned, 250000.13); // 250.000,125 → ties xa 0
  assert.equal(body.rows[0].contractValue, 1000000.5);
});

// ===== /api/payments/bills + /floors =====

test(
  "POST /api/payments/bills theo tầng: amount = HĐ × % tính trong SQL (float cũ lệch 1 xu)",
  S,
  async () => {
    const { POST, GET } = await import("@/app/api/payments/bills/route");
    const { GET: GET_FLOORS } = await import("@/app/api/payments/floors/route");
    const { projectId, sheetTypeId } = await dungDuAn([
      { label: "T1", value: "1234567890123.45", progress: 1 },
    ]);
    await dangNhapVaiTro("pm", projectId);

    // 1.234.567.890.123,45 × 0,7 = 864.197.523.086,415 → ,42 (ties xa 0). Float JS cũ:
    // 864197523086.4149 → NUMERIC làm tròn ,41.
    const res = await POST(
      req("/api/payments/bills", V1, {
        responsible: NGUOI,
        type: "bill",
        amount: 0,
        paidDate: "2026-10-01",
        sheetTypeId,
        floorLabel: "T1",
        pctThisPeriod: 0.7,
      }),
    );
    assert.equal(res.status, 200);
    const saved = await res.json();
    assert.equal(saved.amount, "864197523086.42");
    // Xem trước phía client cùng công thức với server.
    assert.equal(thanhTienTheoPct(123456789012345n, 0.7), 86419752308642n);

    // Phát sinh nhập tay lớn (xu lẻ) — cùng dự án.
    const { run } = await import("@/lib/db");
    await run(
      `INSERT INTO payment_bills (responsible, type, amount, paid_date, labor, project_id)
       VALUES (?, 'item', ?::numeric, '2026-10-02', ?::numeric, ?)`,
      NGUOI,
      MAX_DONG,
      "1234567.89",
      projectId,
    );

    const list = await GET(req("/api/payments/bills", V1));
    assert.equal(list.status, 200);
    assert.match(list.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
    const lb = await list.json();
    assert.equal(lb.moneyFormat, "decimal-string-v1");
    const amounts = lb.bills.map((b: { amount: string }) => b.amount).sort();
    assert.deepEqual(amounts, ["864197523086.42", MAX_DONG].sort());
    const item = lb.bills.find((b: { type: string }) => b.type === "item");
    assert.equal(item.labor, "1234567.89");
    assert.equal(typeof item.progressSnapshot, "number");

    // Legacy: mỗi dòng NUMERIC(15,2) luôn round-trip → number như cũ.
    const legacy = await (await GET(req("/api/payments/bills"))).json();
    assert.equal(legacy.moneyFormat, undefined);
    assert.ok(legacy.bills.some((b: { amount: number }) => b.amount === 9999999999999.99));

    const fl = await GET_FLOORS(
      req(`/api/payments/floors?person=${encodeURIComponent(NGUOI)}`, V1),
    );
    assert.equal(fl.status, 200);
    const fb = await fl.json();
    assert.equal(fb.moneyFormat, "decimal-string-v1");
    assert.equal(fb.floors[0].contractValue, "1234567890123.45");
    assert.equal(fb.floors[0].history[0].amount, "864197523086.42");
    assert.equal(typeof fb.floors[0].pctPaid, "number");
  },
);

// ===== Thuần (client) =====

test("tienThanhToan: nhập/hiển thị/tỷ lệ bằng bigint, không trôi xu", () => {
  // Ô nhập (S10 đầu vào): cùng quy tắc vi-VN với số gửi server (`chuanHoaTienNhap`) — không đoán
  // tiền tố kiểu parseFloat, không lén làm tròn số lẻ thứ 3; sai dạng → 0n (nơi gửi tự chặn).
  assert.equal(tienNhapSangMinor("1234567.555"), 0n);
  assert.equal(tienNhapSangMinor("abc"), 0n);
  assert.equal(tienNhapSangMinor("1.2.3"), 0n); // parseFloat cũ đọc thành 1,2 đ
  assert.equal(tienNhapSangMinor("1.234.567"), 123456700n);
  // Giá trị điền sẵn ô nhập đọc lại đúng (bản "1.234.567" vi-VN cũ bị đọc thành 1,234 đ).
  for (const v of [123456789n, 123456700n, 999999999999999n, 5n])
    assert.equal(tienNhapSangMinor(soTienNhapThuan(v)), v);
  assert.equal(soTienNhapThuan(123456700n), "1234567");
  assert.equal(soTienNhapThuan(123456750n), "1234567.5");

  assert.equal(phanTram(1n, 3n), 33.3);
  assert.equal(phanTram(5000000000000003n, 9999999999999993n), 50);
  assert.equal(phanTram(1n, 0n), 0);
  assert.equal(thanhTienTheoPct(999999999999999n, 0.5), 500000000000000n); // ,995 → ties xa 0
  assert.equal(thanhTienTheoPct(100n, 0), 0n);
  assert.equal(thanhTienTheoPct(100n, 2), 100n); // server kẹp pct ≤ 1

  assert.equal(fmtVND(0n), "—");
  assert.equal(fmtVND(9999999999999993n), "100.000 tỷ");
  assert.equal(fmtVND(123450n), "1.235 đ");
  assert.equal(fmtFull(123456789n), "1.234.567,89 đ");

  assert.equal(docDuLieuThanhToan({ rows: [], totalContract: 0, totalEarned: 0 }), null);
  assert.equal(
    docDuLieuThanhToan({
      moneyFormat: "decimal-string-v1",
      rows: [{ contractValue: 1.5, earned: "0.00" }],
      totalContract: "1.50",
      totalEarned: "0.00",
    }),
    null,
  );
});

test("tienTextToWire: chuỗi ::text → wire; dạng mũ float8 bị từ chối, null giữ null", () => {
  assert.equal(tienTextToWire("99999999999999.93", "decimal-string-v1"), "99999999999999.93");
  assert.equal(tienTextToWire("0", "decimal-string-v1"), "0.00");
  assert.equal(tienTextToWire(null, "legacy-number"), null);
  assert.throws(
    () => tienTextToWire("99999999999999.93", "legacy-number"),
    (e) => isMoneyPrecisionError(e),
  );
  assert.throws(() => tienTextToWire("1.999999999999998e+16", "decimal-string-v1"), TypeError);
});

test("M128 tongPhieu: KPI /payments gồm phiếu điều chỉnh IPC ± (bỏ void), không gồm tạm ứng/phát sinh", () => {
  const p = (type: Bill["type"], amount: bigint, payStatus?: Bill["payStatus"]) =>
    ({ type, amount, payStatus }) as Bill;
  const kq = tongPhieu([
    p("bill", 900000n, "paid"), // 9.000,00 đ đã chi
    p("adjustment", 200000n, "void"), // điều chỉnh đã huỷ — không tính
    p("adjustment", -900000n, "committed"), // phiếu âm của reversal — chưa chi
    p("adjustment", 50000n, "paid"), // điều chỉnh đã chi
    p("bill", 10000n), // phiếu cũ thiếu payStatus = đã chi
    p("advance", 777700n, "paid"),
    p("item", 888800n, "paid"),
  ]);
  assert.deepEqual(kq, { daChi: 960000n, chuaChi: -900000n });
});
