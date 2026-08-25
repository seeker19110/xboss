// M99 PR6 — bảng điều khiển plugin AutoCAD: tóm tắt rule pack + bóc kết quả kiểm định.
import { test } from "node:test";
import assert from "node:assert/strict";
import { tomTatRulePack, docKiemDinhTuBaoCao } from "@/lib/ky-thuat/cad/bang-dieu-khien";
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
