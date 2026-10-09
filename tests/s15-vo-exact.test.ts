import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, dangXuat } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 / S15 — Q-AC04 (A3-FR06): numeric nằm TRONG json_build_object/json_agg của
// GET /api/variations và GET /api/variations/:id đi DTO exact. Trước S15 tổng VO (SUM numeric) và
// lines[].unitPrice/qtyProposed/qtyApproved ra JSON number float, không opt-in decimal-string-v1,
// không 422 khi vượt biên. Route handler thật; dữ liệu VO seed bằng SQL để chạm đúng biên cột.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (ten: string) => `${ten}${RUN}${++seq}`;
const V1 = { "X-XBoss-Money-Format": "decimal-string-v1" };

const don: { projects: number[]; users: number[] } = { projects: [], users: [] };

async function dungDuAn(): Promise<number> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(`INSERT INTO projects (name) VALUES (?)`, uniq("S15 VO "));
  don.projects.push(id);
  return id;
}

async function dangNhapVaiTro(role: string, projectId: number): Promise<void> {
  const { insertId, queryOne } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('S15 user', ?, 'hash-test-s15', ?, 1)`,
    `s15-vo-${uniq(role)}@test.local`,
    role,
  );
  don.users.push(id);
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  await dangNhapDuAn({ id, passwordHash: u!.password_hash }, projectId);
}

type DongSeed = { qty: string; price: string; qtyApproved?: string };

/** VO + dòng KL (boq_items.vo_id) — số đưa vào dạng chuỗi `::numeric`, không qua float. */
async function taoVo(projectId: number, status: string, lines: DongSeed[]): Promise<number> {
  const { insertId, run } = await import("@/lib/db");
  const voId = await insertId(
    `INSERT INTO variation_orders (code, title, reason, status, project_id)
     VALUES (?, 'VO S15', 'other', ?, ?)`,
    uniq("VO-S15-"),
    status,
    projectId,
  );
  for (const l of lines)
    await run(
      `INSERT INTO boq_items (code, name, unit, qty_contract, qty_approved, unit_price, vo_id)
       VALUES (?, 'Dòng S15', 'm', ?::numeric, ?::numeric, ?::numeric, ?)`,
      uniq("VOL-S15-"),
      l.qty,
      l.qtyApproved ?? null,
      l.price,
      voId,
    );
  return voId;
}

/**
 * VO "lớn": 10,000 × 9.007.199.254.740,99 = 90.071.992.547.409,90 cộng 0,001 × 10,00 = 0,01 (→ …,91)
 * cộng 1,000 × 0,01 (→ …,92 = 2^53 xu, ngoài biên số an toàn). Đã duyệt toàn bộ.
 */
const DONG_LON: DongSeed[] = [
  { qty: "10.000", price: "9007199254740.99", qtyApproved: "10.000" },
  { qty: "0.001", price: "10.00", qtyApproved: "0.001" },
  { qty: "1.000", price: "0.01", qtyApproved: "1.000" },
];
const TONG_LON = "90071992547409.92";

const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const req = (url: string, headers?: Record<string, string>) =>
  new NextRequest(`http://localhost${url}`, { headers });

after(async () => {
  if (!HAS_TEST_DB) return;
  const { run } = await import("@/lib/db");
  for (const p of don.projects) {
    await run(
      `DELETE FROM boq_items WHERE vo_id IN (SELECT id FROM variation_orders WHERE project_id = ?)`,
      p,
    );
    await run(`DELETE FROM variation_orders WHERE project_id = ?`, p);
    await run(`DELETE FROM user_projects WHERE project_id = ?`, p);
    await run(`DELETE FROM projects WHERE id = ?`, p);
  }
  for (const u of don.users) await run(`DELETE FROM users WHERE id = ?`, u);
  dangXuat();
});

test(
  "Q-AC04/A3-AC01: GET /api/variations v1 — tổng 2^53 xu và đơn giá trong json_agg là chuỗi exact",
  S,
  async () => {
    const { GET } = await import("@/app/api/variations/route");
    const projectId = await dungDuAn();
    const voId = await taoVo(projectId, "approved", DONG_LON);
    await dangNhapVaiTro("pm", projectId);

    const res = await GET(req("/api/variations", V1));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.match(res.headers.get("vary") ?? "", /X-XBoss-Money-Format/i);
    const body = await res.json();
    assert.equal(body.moneyFormat, "decimal-string-v1");
    const vo = body.items.find((x: { id: number }) => x.id === voId);
    assert.ok(vo, "VO phải có trong danh sách");
    assert.equal(vo.proposedValue, TONG_LON);
    assert.equal(vo.approvedValue, TONG_LON);
    assert.deepEqual(
      vo.lines.map((l: { unitPrice: unknown }) => l.unitPrice),
      ["9007199254740.99", "10.00", "0.01"],
    );
    // Khối lượng giữ scale riêng (3 số lẻ), kể cả đuôi 0 — không ép về 2 số lẻ của tiền.
    assert.deepEqual(
      vo.lines.map((l: { qtyProposed: unknown }) => l.qtyProposed),
      ["10.000", "0.001", "1.000"],
    );
    assert.deepEqual(
      vo.lines.map((l: { qtyApproved: unknown }) => l.qtyApproved),
      ["10.000", "0.001", "1.000"],
    );
    // ID/mã không bị đổi kiểu bởi adapter tiền.
    assert.equal(typeof vo.id, "number");
    assert.equal(typeof vo.lines[0].id, "number");
  },
);

test(
  "Q-AC04/A3-AC06: v1 — KL 3 số lẻ giữ nguyên, tổng cộng tích rồi mới làm tròn (0,005×2 → 0,01)",
  S,
  async () => {
    const { GET } = await import("@/app/api/variations/route");
    const projectId = await dungDuAn();
    // Hai dòng 0,005 × 1,00: làm tròn TỪNG dòng sẽ ra 0,02; đúng quy tắc (ROUND sau SUM) là 0,01.
    const voId = await taoVo(projectId, "draft", [
      { qty: "0.005", price: "1.00" },
      { qty: "0.005", price: "1.00" },
      { qty: "1234567.891", price: "0.00" },
    ]);
    await dangNhapVaiTro("pm", projectId);

    const body = await (await GET(req("/api/variations", V1))).json();
    const vo = body.items.find((x: { id: number }) => x.id === voId);
    assert.equal(vo.proposedValue, "0.01");
    assert.equal(vo.approvedValue, "0.00", "VO nháp: chưa có giá trị duyệt, zero canonical");
    assert.equal(vo.lines[2].qtyProposed, "1234567.891");
    assert.equal(vo.lines[2].qtyApproved, null, "chưa duyệt → null, không thành 0");
    assert.equal(vo.lines[2].unitPrice, "0.00");

    // Legacy trong biên: vẫn JSON number như client cũ, không có moneyFormat.
    const legacy = await (await GET(req("/api/variations"))).json();
    assert.equal(legacy.moneyFormat, undefined);
    const voL = legacy.items.find((x: { id: number }) => x.id === voId);
    assert.equal(voL.proposedValue, 0.01);
    assert.equal(voL.approvedValue, 0);
    assert.equal(voL.lines[2].qtyProposed, 1234567.891);
    assert.equal(voL.lines[0].unitPrice, 1);
  },
);

test(
  "Q-AC04/A3-AC05: legacy ngoài biên round-trip → 422 money_precision_unsupported (danh sách + chi tiết)",
  S,
  async () => {
    const list = await import("@/app/api/variations/route");
    const detail = await import("@/app/api/variations/[id]/route");
    const projectId = await dungDuAn();
    const voId = await taoVo(projectId, "approved", DONG_LON);
    await dangNhapVaiTro("admin", projectId);

    for (const res of [
      await list.GET(req("/api/variations")),
      await detail.GET(req(`/api/variations/${voId}`), thamSo(voId)),
    ]) {
      assert.equal(res.status, 422);
      assert.equal(res.headers.get("cache-control"), "private, no-store");
      const body = await res.json();
      assert.equal(body.code, "money_precision_unsupported");
      // Không xấp xỉ âm thầm: thân lỗi không chứa số tiền nào.
      assert.doesNotMatch(JSON.stringify(body), /9007199254/);
    }
  },
);

test(
  "Q-AC04/A3-FR06: GET /api/variations/:id v1 — chi tiết cùng adapter, giữ documents/approvalStatus",
  S,
  async () => {
    const { GET } = await import("@/app/api/variations/[id]/route");
    const projectId = await dungDuAn();
    const voId = await taoVo(projectId, "approved", DONG_LON);
    await dangNhapVaiTro("pm", projectId);

    const res = await GET(req(`/api/variations/${voId}`, V1), thamSo(voId));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    const body = await res.json();
    assert.equal(body.moneyFormat, "decimal-string-v1");
    assert.equal(body.variation.id, voId);
    assert.equal(body.variation.proposedValue, TONG_LON);
    assert.equal(body.variation.approvedValue, TONG_LON);
    assert.equal(body.variation.lines[0].unitPrice, "9007199254740.99");
    assert.equal(body.variation.lines[1].qtyProposed, "0.001");
    assert.deepEqual(body.documents, []);
    assert.ok("approvalStatus" in body);
  },
);

test(
  "Q-AC04/A3-AC05: vai trò bị che (engineer) không thấy tiền, không nhận 422 lộ độ lớn",
  S,
  async () => {
    const list = await import("@/app/api/variations/route");
    const detail = await import("@/app/api/variations/[id]/route");
    const projectId = await dungDuAn();
    const voId = await taoVo(projectId, "approved", DONG_LON);
    await dangNhapVaiTro("engineer", projectId);

    for (const headers of [undefined, V1]) {
      const resList = await list.GET(req("/api/variations", headers));
      const resDetail = await detail.GET(req(`/api/variations/${voId}`, headers), thamSo(voId));
      // Legacy: tổng 2^53 xu của VO sẽ 422 với người xem được tiền — người bị che phải nhận 200.
      assert.equal(resList.status, 200);
      assert.equal(resDetail.status, 200);
      const vo = (await resList.json()).items.find((x: { id: number }) => x.id === voId);
      const voCt = (await resDetail.json()).variation;
      for (const v of [vo, voCt]) {
        assert.equal(v.proposedValue, null);
        assert.equal(v.approvedValue, null);
        for (const l of v.lines) assert.equal(l.unitPrice, null);
        // Khối lượng không nhạy cảm — vẫn hiển thị (đúng scale theo định dạng).
        assert.equal(v.lines[0].qtyProposed, headers ? "10.000" : 10);
        assert.doesNotMatch(JSON.stringify(v), /9007199254|90071992547409/);
      }
    }
  },
);

// ── Client (app/variations/_components/tienVo.ts) — hiển thị/tạm tính bằng bigint, không float ──

test("Q-AC04: tienVo — KL nhập, thành tiền dòng, tổng tạm tính và định dạng exact", async () => {
  const { klMilliTuNhap, klMilli, klGon, thanhTienDong, tongGiaTriMinor, fmtVND, fmtVNDText } =
    await import("@/app/variations/_components/tienVo");

  assert.equal(klMilli("1234567.891"), 1234567891n);
  assert.equal(klMilliTuNhap("1.5"), 1500n);
  // Ô số của trình duyệt dùng dấu chấm thập phân: "1.500" là 1,5 (không phải nhóm nghìn).
  assert.equal(klMilliTuNhap("1.500"), 1500n);
  // Lưu vào NUMERIC(15,3) làm tròn 3 số lẻ, ties xa 0.
  assert.equal(klMilliTuNhap("1.2345"), 1235n);
  assert.equal(klMilliTuNhap(".5"), 500n);
  for (const sai of ["", undefined, "abc", "-1", "1,5"]) assert.equal(klMilliTuNhap(sai), 0n);

  assert.equal(klGon("10.000"), "10");
  assert.equal(klGon("1.500"), "1.5");
  assert.equal(klGon("1234567.891"), "1234567.891");

  // 1,005 × 100,00 = 100,5 → 101 đ (float cho 100,49999… → 100 đ).
  assert.equal(thanhTienDong(1005n, "100.00"), 101n);
  assert.equal(thanhTienDong(1005n, null), null, "đơn giá bị che → thành tiền bị che");

  const lines = [
    { qty: 5n, unitPrice: "1.00" },
    { qty: 5n, unitPrice: "1.00" },
  ];
  assert.equal(
    tongGiaTriMinor(lines, (l) => l.qty),
    1n,
    "0,005×2 → 0,01 (ROUND sau SUM)",
  );
  assert.equal(
    tongGiaTriMinor([...lines, { qty: 1n, unitPrice: null }], (l) => l.qty),
    null,
    "một đơn giá bị che → tổng bị che, không ngầm thành 0",
  );
  assert.equal(
    tongGiaTriMinor(
      [
        { qty: 10000n, unitPrice: "9007199254740.99" },
        { qty: 1n, unitPrice: "10.00" },
        { qty: 1000n, unitPrice: "0.01" },
      ],
      (l) => l.qty,
    ),
    9007199254740992n,
  );

  assert.equal(fmtVND(TONG_LON), `${90071992547410n.toLocaleString("vi-VN")} đ`);
  assert.equal(fmtVND("0.00"), "—");
  assert.equal(fmtVND(0n), "—");
  assert.equal(fmtVNDText(null), "•••");
});
