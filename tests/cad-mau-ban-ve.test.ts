// M99 PR7 — bộ bản vẽ mẫu cam kết trong repo (§15). Test này giữ cho bộ mẫu không mục:
// tệp còn hợp lệ, còn đủ dị tật mà kiểm tích hợp AC1–AC3/AC9/AC10/AC13 bám vào, và bản mét
// đúng là bản mm chia 1000 (điều kiện để AC13 so được hai kết quả bóc tách với nhau).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateDxf, parseDxf, convertTcvn3ToUnicode } from "@/lib/ky-thuat/cad/dxf-parser";

const THU_MUC = join(process.cwd(), "plugin-autocad", "mau-ban-ve");
const doc = (ten: string) => readFileSync(join(THU_MUC, ten), "utf8");

const MM = "mau-01-mep-mm.dxf";
const MET = "mau-02-mep-met.dxf";

test("bản vẽ mẫu: cả 2 tệp hợp lệ và parse ra đúng 4 layer / 7 thực thể", () => {
  for (const ten of [MM, MET]) {
    const noiDung = doc(ten);
    const hopLe = validateDxf(noiDung);
    assert.ok(hopLe.valid, `${ten} không hợp lệ: ${hopLe.errors.join(" · ")}`);

    const p = parseDxf(noiDung, ten);
    assert.equal(p.layers.length, 4);
    assert.equal(p.entities.length, 7);
  }
});

test("bản vẽ mẫu mm: đủ dị tật cho AC1/AC2/AC3/AC9/AC10", () => {
  const p = parseDxf(doc(MM), MM);
  assert.equal(p.header?.insUnits, 4);

  // AC1: layer sai chuẩn phải ánh xạ về tên chuẩn, layer lạ giữ nguyên (fallback).
  const anhXa = Object.fromEntries(p.layers.map((l) => [l.name, l.standardName]));
  assert.equal(anhXa["01_M_ONG_GIO_CAP_CHINH"], "M-DUCT-SUPP");
  assert.equal(anhXa["03_P_ONG_NUOC_LANH_CHW"], "M-CHW-PIPE");
  assert.equal(anhXa["08_G_GHI_CHU_DIM_TEXT"], "G-ANNO-TEXT");
  assert.equal(anhXa["ZZZ_KHONG_KHOP_GI"], "ZZZ_KHONG_KHOP_GI");

  // AC2: có TEXT mã TCVN3 giải ra chữ có dấu.
  const chuTcvn3 = p.entities.find((e) => e.textValue?.includes("Phßng"));
  assert.ok(chuTcvn3, "Thiếu TEXT mã TCVN3 trong bản mẫu");
  assert.equal(convertTcvn3ToUnicode(chuTcvn3.textValue!), "Tầng 5 - Phòng máy lạnh");

  // AC3: có ít nhất 1 thực thể Z≠0 để kiểm ép phẳng.
  const coZ = p.entities.some(
    (e) => (e.coordinates?.start?.[2] ?? 0) !== 0 || (e.coordinates?.end?.[2] ?? 0) !== 0,
  );
  assert.ok(coZ, "Thiếu thực thể Z≠0 — AC3 không kiểm được gì");

  // AC10: đúng 3 đoạn ống trên layer nước lạnh.
  const ong = p.entities.filter((e) => e.type === "LINE" && e.layer === "03_P_ONG_NUOC_LANH_CHW");
  assert.equal(ong.length, 3);

  // AC9: 1 polyline kín (đo diện tích) + 1 polyline hở.
  const poly = p.entities.filter((e) => e.type === "LWPOLYLINE");
  assert.equal(poly.length, 2);
  assert.equal(poly.filter((e) => e.coordinates?.closed).length, 1);
  assert.equal(poly.filter((e) => !e.coordinates?.closed).length, 1);
});

test("bản vẽ mẫu mét: đúng là bản mm chia 1000 (điều kiện của AC13)", () => {
  const mm = parseDxf(doc(MM), MM);
  const met = parseDxf(doc(MET), MET);
  assert.equal(met.header?.insUnits, 6);
  assert.deepEqual(
    met.entities.map((e) => e.type),
    mm.entities.map((e) => e.type),
  );

  const ongMm = mm.entities.filter((e) => e.type === "LINE");
  const ongMet = met.entities.filter((e) => e.type === "LINE");
  assert.equal(ongMm.length, ongMet.length);
  for (let i = 0; i < ongMm.length; i++) {
    for (const truc of [0, 1, 2] as const) {
      const a = (ongMm[i].coordinates?.end?.[truc] ?? 0) / 1000;
      const b = ongMet[i].coordinates?.end?.[truc] ?? 0;
      assert.ok(Math.abs(a - b) < 1e-9, `Đoạn ${i} trục ${truc}: bản mét ≠ bản mm chia 1000`);
    }
  }
});
