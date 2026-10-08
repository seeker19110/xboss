import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { after, test } from "node:test";
import assert from "node:assert/strict";
import type { SheetClient } from "@/lib/vat-tu/google-sheets";
import { SoFixture, uniq } from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 S13a — hồi quy A5-AC01: đồng bộ vật tư ↔ Google Sheet chạy lại sau lỗi ghi
// từ xa không được nhân dữ liệu, và snapshot 3-way merge không được đi trước sự thật.
//
// Provider GIẢ (A5 §6 "fake provider fault injection", không gọi Google thật): `runMaterialSync`
// nhận SheetClient inject — đúng điểm vào route POST /api/materials/sync dùng, chỉ thay lớp
// mạng. Hai kiểu lỗi:
//   - "từ chối": writeRows lỗi, Sheet KHÔNG đổi (mạng rớt trước khi Google nhận).
//   - "mất ACK": Sheet ĐÃ ghi nhưng client nhận lỗi (timeout sau khi Google commit).
//
// Ca từng ĐỎ (đánh `todo` ở S13a: dòng không Mã BOQ bị nhân bản khi chạy lại) đã được S13b vá —
// nay là cổng chặn thường.

const S = { skip: !HAS_TEST_DB };

// Từ A1 (QUALITY-FINAL-1) mỗi lần đồng bộ chỉ cho đúng một dự án — các ca dùng chung một dự án
// riêng của file (org 1), vật tư tạo từ Sheet mang project_id của dự án này.
const fChung = new SoFixture();
let duAnChung: number | null = null;
async function phamVi() {
  duAnChung ??= await fChung.duAn("vt-sync");
  return { orgId: 1, projectId: duAnChung };
}
after(async () => {
  if (duAnChung != null) await fChung.don();
});

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

type KieuLoi = "tu-choi" | "mat-ack";

/** Sheet giả trong bộ nhớ: lần ghi ĐẦU lỗi theo `kieuLoi`, các lần sau thành công. */
function sheetGia(dongMoi: string[] | string[][], kieuLoi: KieuLoi) {
  const dong = (Array.isArray(dongMoi[0]) ? dongMoi : [dongMoi]) as string[][];
  let rows: string[][] = [HEADER, ...dong];
  let lanGhi = 0;
  const client: SheetClient = {
    tab: "VatTu",
    async readRows() {
      return rows.map((r) => [...r]);
    },
    async writeRows(_o, out) {
      lanGhi += 1;
      if (lanGhi === 1 && kieuLoi === "tu-choi") throw new Error("Google Sheets 503 (giả lập)");
      rows = out.map((r) => r.map((c) => String(c)));
      if (lanGhi === 1) throw new Error("ETIMEDOUT sau khi ghi (giả lập mất ACK)");
    },
  };
  return client;
}

/** Dòng Sheet mới (chưa có ID — người dùng gõ tay trên Sheet). */
const dongTay = (ten: string, boqCode = "") => [
  "",
  boqCode,
  ten,
  "m",
  "120",
  "100",
  "",
  "",
  "",
  "dat_hang",
  "Nhập trên Sheet",
  "",
];

async function vatTuTheoTen(ten: string): Promise<{ id: number; snap: boolean }[]> {
  const { query } = await import("@/lib/db");
  return query<{ id: number; snap: boolean }>(
    `SELECT m.id, EXISTS (SELECT 1 FROM material_sync s WHERE s.material_id = m.id) AS snap
       FROM materials m WHERE m.name = ? ORDER BY m.id`,
    ten,
  );
}

async function don(ten: string): Promise<void> {
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM material_sync WHERE material_id IN (SELECT id FROM materials WHERE name = ?)`,
    ten,
  );
  await run(`DELETE FROM materials WHERE name = ?`, ten);
}

async function dongBo(client: SheetClient): Promise<"ok" | "loi"> {
  const { runMaterialSync } = await import("@/lib/vat-tu/material-sync");
  try {
    await runMaterialSync(await phamVi(), client);
    return "ok";
  } catch {
    return "loi";
  }
}

test(
  "A5-AC01: ghi Sheet bị từ chối → snapshot KHÔNG được chốt; chạy lại (dòng có Mã BOQ) không nhân vật tư",
  S,
  async () => {
    const ten = uniq("VT-S13A-BOQ-");
    try {
      const client = sheetGia(dongTay(ten, uniq("VTS13A")), "tu-choi");
      assert.equal(await dongBo(client), "loi");
      const sauLoi = await vatTuTheoTen(ten);
      assert.equal(sauLoi.length, 1);
      assert.equal(sauLoi[0].snap, false, "snapshot không được đi trước lần ghi Sheet thành công");

      assert.equal(await dongBo(client), "ok");
      const sauLai = await vatTuTheoTen(ten);
      assert.equal(sauLai.length, 1, "chạy lại không tạo vật tư thứ hai");
      assert.equal(sauLai[0].snap, true, "ghi thành công mới chốt snapshot");
    } finally {
      await don(ten);
    }
  },
);

test(
  "A5-AC01: mất ACK (Sheet đã ghi, client báo lỗi) → chạy lại không nhân vật tư, snapshot chốt ở lần thành công",
  S,
  async () => {
    const ten = uniq("VT-S13A-ACK-");
    try {
      const client = sheetGia(dongTay(ten), "mat-ack");
      assert.equal(await dongBo(client), "loi");
      assert.equal((await vatTuTheoTen(ten))[0]?.snap, false);
      assert.equal(await dongBo(client), "ok");
      const sau = await vatTuTheoTen(ten);
      assert.equal(sau.length, 1);
      assert.equal(sau[0].snap, true);
    } finally {
      await don(ten);
    }
  },
);

test(
  "A5-AC01: ghi Sheet bị từ chối → chạy lại với dòng KHÔNG có Mã BOQ không được nhân vật tư",
  S,
  async () => {
    const ten = uniq("VT-S13A-NOCODE-");
    try {
      const client = sheetGia(dongTay(ten), "tu-choi");
      assert.equal(await dongBo(client), "loi");
      assert.equal(await dongBo(client), "ok");
      const sau = await vatTuTheoTen(ten);
      assert.equal(sau.length, 1, `nhân bản vật tư sau khi chạy lại: ${sau.length} bản ghi`);
    } finally {
      await don(ten);
    }
  },
);

test(
  "A5-AC01: hai dòng không Mã BOQ trùng nội dung → lỗi rồi chạy lại vẫn đúng 2 vật tư (mỗi bản nhận đúng 1 dòng)",
  S,
  async () => {
    const ten = uniq("VT-S13B-DOI-");
    try {
      const client = sheetGia([dongTay(ten), dongTay(ten)], "tu-choi");
      assert.equal(await dongBo(client), "loi");
      assert.equal((await vatTuTheoTen(ten)).length, 2);
      assert.equal(await dongBo(client), "ok");
      const sau = await vatTuTheoTen(ten);
      assert.equal(sau.length, 2, `hai dòng thật trên Sheet phải còn đúng 2 vật tư: ${sau.length}`);
      assert.ok(sau.every((v) => v.snap));
      assert.equal(await dongBo(client), "ok", "chạy lần 3 (Sheet đã có ID) vẫn ổn định");
      assert.equal((await vatTuTheoTen(ten)).length, 2);
    } finally {
      await don(ten);
    }
  },
);

test(
  "A5-AC01: dòng mang Mã BOQ đã bị task chiếm → tạo vật tư không mã; lỗi rồi chạy lại không nhân bản",
  S,
  async () => {
    const f = new SoFixture();
    const ten = uniq("VT-S13B-CHIEM-");
    try {
      const { run } = await import("@/lib/db");
      const duAn = await f.duAn("vt-chiem");
      const cay = await f.wbs(duAn, { soO: 1 });
      const ma = uniq("BOQS13B");
      await run(`UPDATE tasks SET boq_code = ? WHERE id = ?`, ma, cay.taskId);

      const client = sheetGia(dongTay(ten, ma), "tu-choi");
      assert.equal(await dongBo(client), "loi");
      assert.equal(await dongBo(client), "ok");
      const { query } = await import("@/lib/db");
      const sau = await query<{ boqCode: string | null }>(
        `SELECT boq_code AS "boqCode" FROM materials WHERE name = ?`,
        ten,
      );
      assert.equal(sau.length, 1, `mã bị chiếm + chạy lại nhân bản vật tư: ${sau.length}`);
      assert.equal(sau[0].boqCode, null, "vật tư không được lấy mã đã thuộc task");
    } finally {
      await don(ten);
      await f.don();
    }
  },
);
