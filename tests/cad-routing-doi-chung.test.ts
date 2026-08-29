// M114 §10 — đối chứng 2 tầng cho việc CẤP TẦNG/LÀN trong hành lang.
//
// Tầng 3 (TS, `planMultiTierCorridor`) là nguồn chuẩn sinh ra `mongDoi` trong
// `plugin-autocad/doi-chung/routing-doi-chung.json`; test này canh tầng 3 không trôi khỏi tệp đã
// commit, `XBoss.Cad.Tests/RoutingDoiChungTests.cs` canh tầng 2 (C#, `CapPhatLanTang`) trên CÙNG
// tệp đó. Một tầng đổi cách cấp làn mà tầng kia không đổi theo là đỏ ngay — rủi ro số 1 của M99.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCurrentRulePack, CURRENT_RULE_PACK_VERSION } from "@/lib/ky-thuat/cad/rule-pack";
import { docRouting, sinhMongDoiRouting } from "@/scripts/sinh-doi-chung-cad";

const bo = docRouting();

test("bộ đối chứng cấp làn bám đúng rule pack đang phát hành", () => {
  assert.equal(bo.rulePackVersion, CURRENT_RULE_PACK_VERSION);
  assert.ok(bo.cases.length > 0);

  const rp = getCurrentRulePack().drawTools.routingPolicy;
  assert.ok(rp, "rule pack đang phát hành phải có khối routingPolicy");

  // Mọi id hệ trong bộ đối chứng phải là hệ THẬT và phải có tier để cấp tầng.
  const heThat = new Set(getCurrentRulePack().drawTools.systems.map((h) => h.id));
  for (const heId of Object.keys(bo.disciplineTheoHe)) {
    assert.ok(heThat.has(heId), `hệ lạ "${heId}" trong disciplineTheoHe`);
    assert.ok(
      rp.tiers.some((t) => t.systems.includes(heId)),
      `hệ "${heId}" không nằm ở tier nào`,
    );
  }
  for (const heId of bo.heDien) assert.ok(heThat.has(heId), `hệ điện lạ "${heId}"`);

  // Ánh xạ tier phải phủ đúng tập tier của rule pack (không thừa, không thiếu).
  assert.deepEqual(Object.values(bo.tierAnhXaTs).sort(), rp.tiers.map((t) => t.id).sort());
});

test("planMultiTierCorridor (tầng 3) cho đúng kết quả đã ghim trong bộ đối chứng", () => {
  for (const ca of bo.cases) {
    assert.deepEqual(sinhMongDoiRouting(bo, ca), ca.mongDoi, `ca "${ca.ma}" lệch tầng 3`);
  }
});

test("mọi làn đã ghim đều nằm trong bề rộng hành lang", () => {
  for (const ca of bo.cases) {
    for (const lan of ca.mongDoi) {
      assert.ok(
        lan.lanTuMm >= 0 && lan.lanDenMm <= ca.vao.hanhLang.beRongMm,
        `ca "${ca.ma}": làn của hệ ${lan.heId} tràn khỏi hành lang`,
      );
    }
  }
});
