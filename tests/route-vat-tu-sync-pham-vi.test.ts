import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat, datCookie } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { SheetClient } from "@/lib/vat-tu/google-sheets";
import { SoFixture, uniq } from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 A1 — phạm vi dự án cho đồng bộ vật tư ↔ Google Sheet, qua ROUTE THẬT:
//   - POST /api/materials/sync (phiên Admin/PM): chỉ vật tư của dự án đang chọn; không có dự án
//     hợp lệ → 404 trước khi đụng Sheet; dòng Sheet mang ID vật tư dự án khác → bỏ qua, không
//     sửa DB, giữ nguyên dòng; vật tư dự án khác không bao giờ bị ghi lên Sheet.
//   - GET /api/cron/sync-sheets: CRON_SECRET chỉ chạy cho dự án GOOGLE_SHEET_PROJECT_ID; thiếu/sai
//     cấu hình → 503, không chạy. Phiên Admin/PM → dự án đang chọn.
// Chỉ thay lớp mạng Google (getSheetClient) bằng Sheet giả trong bộ nhớ; phần còn lại (phiên ký
// thật, resolver dự án, 3-way merge, SQL) chạy thật.

const S = { skip: !HAS_TEST_DB };

const HEADER = [
  "ID",
  "Mã BOQ",
  "Tên vật tư",
  "ĐVT",
  "KL BOQ",
  "Định mức",
  "Đã dùng",
  "Tồn kho",
  "Ngưỡng tối thiểu",
  "Trạng thái",
  "Ghi chú",
  "Hệ",
];

/** Trạng thái Sheet giả — mỗi ca đặt lại qua `datSheet`. */
let sheet: string[][] = [HEADER];
let soLanDoc = 0;
let daGhi: string[][] | null = null;
function datSheet(dong: string[][]): void {
  sheet = [HEADER, ...dong];
  soLanDoc = 0;
  daGhi = null;
}
const sheetGia: SheetClient = {
  tab: "VatTu",
  async readRows() {
    soLanDoc += 1;
    return sheet.map((r) => [...r]);
  },
  async writeRows(_o, out) {
    daGhi = out.map((r) => r.map((c) => String(c)));
    sheet = daGhi.map((r) => [...r]);
  },
};

// Giữ nguyên mọi export thật (đọc cấu hình GOOGLE_SHEET_PROJECT_ID), chỉ thay client mạng.
// Đặt mock trước khi bất kỳ ca nào import route/material-sync.
before(async () => {
  const thatSheets = await import("@/lib/vat-tu/google-sheets");
  mock.module("@/lib/vat-tu/google-sheets", {
    namedExports: { ...thatSheets, getSheetClient: async () => sheetGia },
  });
});

/** Đặt tạm biến môi trường cho 1 ca, trả hàm khôi phục. */
function datEnv(vars: Record<string, string | undefined>): () => void {
  const cu = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(cu)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}

type VatTu = { id: number; name: string; note: string | null; unit: string | null };

async function taoVatTu(projectId: number, name: string, note: string, unit = "m") {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO materials (name, unit, note, project_id, qty_boq, qty_planned, qty_stock, status, sort_order)
     VALUES (?, ?, ?, ?, 10, 10, 77, 'dat_hang', 1)`,
    name,
    unit,
    note,
    projectId,
  );
}

/** Snapshot "đã đồng bộ" khớp DB — giả lập Sheet từng được đồng bộ toàn hệ trước A1. */
async function chotSnapshot(id: number): Promise<void> {
  const { queryOne, run } = await import("@/lib/db");
  const m = await queryOne<{ name: string; unit: string | null; note: string | null }>(
    `SELECT name, unit, note FROM materials WHERE id = ?`,
    id,
  );
  const fields = {
    boqCode: "",
    name: m!.name,
    unit: m!.unit ?? "",
    qtyBoq: "10",
    qtyPlanned: "10",
    status: "dat_hang",
    note: m!.note ?? "",
  };
  await run(
    `INSERT INTO material_sync (material_id, synced_fields) VALUES (?, ?)
     ON CONFLICT (material_id) DO UPDATE SET synced_fields = EXCLUDED.synced_fields`,
    id,
    JSON.stringify(fields),
  );
}

const dongSheet = (id: number | "", name: string, unit: string, note: string) => [
  String(id),
  "",
  name,
  unit,
  "10",
  "10",
  "",
  "",
  "",
  "dat_hang",
  note,
  "",
];

async function docVatTu(id: number): Promise<VatTu | undefined> {
  const { queryOne } = await import("@/lib/db");
  return queryOne<VatTu>(`SELECT id, name, note, unit FROM materials WHERE id = ?`, id);
}

async function donVatTu(projectIds: number[]): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM material_sync WHERE material_id IN (SELECT id FROM materials WHERE project_id = ANY(?::int[]))`,
    projectIds,
  );
  await run(`DELETE FROM materials WHERE project_id = ANY(?::int[])`, projectIds);
}

/** Hai dự án cùng org 1: A (PM được gán) và B (dữ liệu "bí mật" không được rò). */
async function dungHaiDuAn(f: SoFixture) {
  const duAnA = await f.duAn("sync-A");
  const duAnB = await f.duAn("sync-B");
  const bimat = uniq("BIMAT-B-");
  const vtA = await taoVatTu(duAnA, uniq("VT A "), "ghi chú A");
  const vtB = await taoVatTu(duAnB, uniq("VT B "), bimat);
  const vtB2 = await taoVatTu(duAnB, `${bimat}-ten`, "chỉ có ở DB dự án B");
  await chotSnapshot(vtA);
  await chotSnapshot(vtB);
  const pm = await f.user("pm");
  await f.vao(pm, duAnA);
  return { duAnA, duAnB, bimat, vtA, vtB, vtB2, pm };
}

async function postSync() {
  const { POST } = await import("@/app/api/materials/sync/route");
  const res = await POST();
  return { status: res.status, body: await res.json() };
}

async function getCron(headers: Record<string, string> = {}) {
  const { GET } = await import("@/app/api/cron/sync-sheets/route");
  const res = await GET(new NextRequest("http://localhost/api/cron/sync-sheets", { headers }));
  return { status: res.status, body: await res.json() };
}

const SECRET = "secret-cron-a1-dai-hon-32-ky-tu-xx";

test(
  "A1: PM dự án A đồng bộ → vật tư dự án B không lên Sheet, dòng mang ID B không sửa DB và được giữ nguyên",
  S,
  async () => {
    const f = new SoFixture();
    const restore = datEnv({ GOOGLE_SHEET_PROJECT_ID: undefined });
    let ids: number[] = [];
    try {
      const d = await dungHaiDuAn(f);
      ids = [d.duAnA, d.duAnB];
      const vtBTruoc = await docVatTu(d.vtB);
      const tenA = (await docVatTu(d.vtA))!.name;
      const tenMoi = uniq("VT moi tu Sheet ");
      const dongB = dongSheet(d.vtB, "Tên B sửa trên Sheet", "m", "");
      datSheet([
        dongSheet(d.vtA, tenA, "kg", "ghi chú A"),
        dongB,
        dongSheet("", tenMoi, "cái", ""),
      ]);

      const { status, body } = await postSync();
      assert.equal(status, 200, JSON.stringify(body));

      // Không sửa DB dự án B (bản cũ: 3-way merge thấy Sheet đổi → kéo tên mới đè vào DB).
      assert.deepEqual(await docVatTu(d.vtB), vtBTruoc, "vật tư dự án B bị sửa bởi PM dự án A");

      // Không rò dữ liệu dự án B lên Sheet (bản cũ ghi mọi vật tư toàn hệ).
      assert.ok(daGhi, "phải ghi Sheet");
      const phang = daGhi!.flat().join("|");
      assert.ok(!phang.includes(d.bimat), "dữ liệu chỉ có ở DB dự án B bị ghi lên Sheet");
      assert.ok(
        !daGhi!.some((r) => r[0] === String(d.vtB2)),
        "vật tư dự án B (không có trên Sheet) bị đẩy lên Sheet",
      );
      // Dòng mang ID vật tư B giữ nguyên nội dung Sheet (không xoá, không ghi đè bằng DB).
      assert.deepEqual(
        daGhi!.find((r) => r[0] === String(d.vtB)),
        dongB,
        "dòng Sheet mang ID dự án B phải được giữ nguyên",
      );
      assert.ok(
        body.summary.skipped.some((s: { reason: string }) =>
          s.reason.includes(`ID ${d.vtB} không thuộc dự án đang đồng bộ`),
        ),
        JSON.stringify(body.summary.skipped),
      );

      // Trong phạm vi vẫn đồng bộ bình thường: Sheet đổi ĐVT vật tư A → kéo vào DB.
      assert.equal((await docVatTu(d.vtA))!.unit, "kg");
      // Vật tư tạo từ dòng Sheet mới thuộc đúng dự án A (bản cũ: project_id NULL).
      const { query } = await import("@/lib/db");
      const moi = await query<{ projectId: number | null }>(
        `SELECT project_id AS "projectId" FROM materials WHERE name = ?`,
        tenMoi,
      );
      assert.deepEqual(moi, [{ projectId: d.duAnA }]);
      assert.equal(body.summary.total, 2, "total chỉ đếm vật tư dự án A");
    } finally {
      restore();
      dangXuat();
      const { run } = await import("@/lib/db");
      await run(`DELETE FROM materials WHERE project_id IS NULL AND name LIKE 'VT moi tu Sheet %'`);
      if (ids.length) await donVatTu(ids);
      await f.don();
    }
  },
);

test(
  "A1: không có dự án đang chọn hợp lệ (cookie dự án không được gán / dự án org khác) → 404, không đụng Sheet",
  S,
  async () => {
    const f = new SoFixture();
    const { insertId, run } = await import("@/lib/db");
    const orgKhac = await insertId(`INSERT INTO organizations (name) VALUES (?)`, uniq("OrgA1"));
    const duAnOrgKhac = await insertId(
      `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
      uniq("DA org khác "),
      orgKhac,
    );
    let ids: number[] = [];
    try {
      const d = await dungHaiDuAn(f);
      ids = [d.duAnA, d.duAnB];
      datSheet([dongSheet(d.vtB, "Tên B sửa", "m", "")]);

      // PM chỉ được gán dự án A nhưng cookie trỏ dự án B → không fallback về A.
      dangNhap(d.pm, d.duAnB);
      const r1 = await postSync();
      assert.equal(r1.status, 404, JSON.stringify(r1.body));

      // Admin org 1 với cookie dự án của org khác.
      const admin = await f.user("admin");
      dangNhap(admin);
      datCookie("xboss_project", String(duAnOrgKhac));
      const r2 = await postSync();
      assert.equal(r2.status, 404, JSON.stringify(r2.body));
      const r3 = await getCron();
      assert.equal(r3.status, 404, JSON.stringify(r3.body));

      assert.equal(soLanDoc, 0, "không được đọc Sheet khi chưa xác minh dự án");
      assert.equal(daGhi, null, "không được ghi Sheet khi chưa xác minh dự án");
    } finally {
      dangXuat();
      if (ids.length) await donVatTu(ids);
      await f.don();
      await run(`DELETE FROM projects WHERE id = ?`, duAnOrgKhac);
      await run(`DELETE FROM organizations WHERE id = ?`, orgKhac);
    }
  },
);

test(
  "A1: Sheet gắn dự án B (GOOGLE_SHEET_PROJECT_ID) → PM dự án A bị 409; cấu hình sai → 503; không đụng Sheet",
  S,
  async () => {
    const f = new SoFixture();
    let ids: number[] = [];
    let restore = () => {};
    try {
      const d = await dungHaiDuAn(f);
      ids = [d.duAnA, d.duAnB];
      datSheet([]);
      restore = datEnv({ GOOGLE_SHEET_PROJECT_ID: String(d.duAnB) });
      const r1 = await postSync();
      assert.equal(r1.status, 409, JSON.stringify(r1.body));
      restore();
      restore = datEnv({ GOOGLE_SHEET_PROJECT_ID: "1e3" });
      const r2 = await postSync();
      assert.equal(r2.status, 503, JSON.stringify(r2.body));
      assert.equal(soLanDoc, 0);
      assert.equal(daGhi, null);
    } finally {
      restore();
      dangXuat();
      if (ids.length) await donVatTu(ids);
      await f.don();
    }
  },
);

test(
  "A1: cron CRON_SECRET thiếu GOOGLE_SHEET_PROJECT_ID → 503 không chạy; có cấu hình → chỉ dự án đó",
  S,
  async () => {
    const f = new SoFixture();
    let ids: number[] = [];
    let restore = datEnv({ CRON_SECRET: SECRET, GOOGLE_SHEET_PROJECT_ID: undefined });
    try {
      const d = await dungHaiDuAn(f);
      ids = [d.duAnA, d.duAnB];
      dangXuat();
      datSheet([]);
      const r1 = await getCron({ authorization: `Bearer ${SECRET}` });
      assert.equal(r1.status, 503, JSON.stringify(r1.body));
      assert.match(r1.body.error, /GOOGLE_SHEET_PROJECT_ID/);
      assert.equal(soLanDoc, 0, "cron chưa xác định phạm vi không được đọc Sheet");

      restore();
      restore = datEnv({ CRON_SECRET: SECRET, GOOGLE_SHEET_PROJECT_ID: "2147483000" });
      const r2 = await getCron({ authorization: `Bearer ${SECRET}` });
      assert.equal(r2.status, 503, "dự án cấu hình không tồn tại → không chạy");

      restore();
      restore = datEnv({ CRON_SECRET: SECRET, GOOGLE_SHEET_PROJECT_ID: String(d.duAnA) });
      const r3 = await getCron({ authorization: `Bearer ${SECRET}` });
      assert.equal(r3.status, 200, JSON.stringify(r3.body));
      assert.equal(r3.body.projectId, d.duAnA);
      const idsTrenSheet = daGhi!.slice(1).map((r) => r[0]);
      assert.deepEqual(idsTrenSheet, [String(d.vtA)], "cron chỉ ghi vật tư dự án cấu hình");

      // Phiên PM gọi tay route cron → dự án đang chọn (A), không phải toàn hệ.
      restore();
      restore = datEnv({ CRON_SECRET: undefined, GOOGLE_SHEET_PROJECT_ID: undefined });
      dangNhap(d.pm, d.duAnA);
      datSheet([]);
      const r4 = await getCron();
      assert.equal(r4.status, 200, JSON.stringify(r4.body));
      assert.deepEqual(
        daGhi!.slice(1).map((r) => r[0]),
        [String(d.vtA)],
      );
    } finally {
      restore();
      dangXuat();
      if (ids.length) await donVatTu(ids);
      await f.don();
    }
  },
);
