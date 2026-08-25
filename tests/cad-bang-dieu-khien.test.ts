// M99 PR6 — bảng điều khiển plugin AutoCAD: tóm tắt rule pack + bóc kết quả kiểm định.
// M101 PR5 (§6.4) — bóc tóm tắt KL đã bóc gửi kèm XBOSS_UPLOAD, gộp theo (hệ/vùng, đơn vị).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tomTatRulePack,
  docKiemDinhTuBaoCao,
  docKlBocTuBaoCao,
} from "@/lib/ky-thuat/cad/bang-dieu-khien";
import { CURRENT_RULE_PACK_VERSION } from "@/lib/ky-thuat/cad/rule-pack";

test("tomTatRulePack trả đúng version đang phát hành kèm số nhóm layer và hạng mục bóc tách", () => {
  const t = tomTatRulePack();
  assert.equal(t.version, CURRENT_RULE_PACK_VERSION);
  assert.ok(t.soNhomLayer > 0);
  assert.ok(t.soHangMucBocTach > 0);
});

test("docKiemDinhTuBaoCao đọc được kết quả kiểm định server, khuyết thì trả null", () => {
  assert.equal(docKiemDinhTuBaoCao(null), null);
  assert.equal(docKiemDinhTuBaoCao({ layers: 3 }), null);

  const dat = docKiemDinhTuBaoCao({
    serverValidation: { ok: true, errors: [], warnings: ["Thiếu layer ghi chú"] },
  });
  assert.deepEqual(dat, {
    ok: true,
    soLoi: 0,
    soCanhBao: 1,
    canhBao: ["Thiếu layer ghi chú"],
  });

  const hong = docKiemDinhTuBaoCao({
    serverValidation: { ok: false, errors: ["DXF sidecar lỗi cấu trúc", "Rule pack cũ"] },
  });
  assert.equal(hong?.ok, false);
  assert.equal(hong?.soLoi, 2);
  assert.equal(hong?.soCanhBao, 0);
});

test("docKlBocTuBaoCao gộp theo hệ/vùng kèm đơn vị, khuyết khối takeoff → null (upload cũ)", () => {
  assert.equal(docKlBocTuBaoCao(null), null);
  assert.equal(docKlBocTuBaoCao({ cheDo: "chuan-hoa" }), null); // không có khối takeoff — upload cũ
  assert.equal(docKlBocTuBaoCao({ takeoff: { lines: [] } }), null); // rỗng cũng coi là chưa có gì

  const kq = docKlBocTuBaoCao({
    takeoff: {
      lines: [
        { group: "HVAC", vung: "Tầng 5", donVi: "m", khoiLuong: 10 },
        { group: "HVAC", vung: "Tầng 6", donVi: "m", khoiLuong: 4 },
        { group: "PIPING", vung: "Tầng 5", donVi: "m", khoiLuong: 6 },
        { group: "ELECTRICAL", vung: "", donVi: "Cái", khoiLuong: 3 }, // không vùng — chỉ vào theoHe
      ],
    },
  });
  assert.equal(kq?.tongDong, 4);
  assert.deepEqual(kq?.theoHe, [
    { nhan: "HVAC (m)", khoiLuong: 14 },
    { nhan: "PIPING (m)", khoiLuong: 6 },
    { nhan: "ELECTRICAL (Cái)", khoiLuong: 3 },
  ]);
  assert.deepEqual(kq?.theoVung, [
    { nhan: "Tầng 5 (m)", khoiLuong: 16 },
    { nhan: "Tầng 6 (m)", khoiLuong: 4 },
  ]);
});
