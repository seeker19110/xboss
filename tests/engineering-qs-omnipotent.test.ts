import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reverseBreakdownUnitRate,
  explodeMultiLevelBOM,
  generateFidicClaimDefense,
} from "@/lib/ky-thuat/engineering-qs-omnipotent";

test("M69: reverseBreakdownUnitRate giải mã ngược đơn giá thầu thành 5 thành phần gốc", () => {
  const res = reverseBreakdownUnitRate("BOQ-01", "Ống Thép DN100", "m", 500000, "pipe_steel");

  assert.equal(res.contractRateVnd, 500000);
  assert.ok(res.breakdown.materialMainVnd > 0);
  assert.ok(res.breakdown.materialAuxVnd > 0);
  assert.ok(res.breakdown.laborDirectVnd > 0);
  assert.ok(res.breakEvenCostVnd < res.contractRateVnd);
  assert.ok(res.targetSubconRateVnd > res.breakEvenCostVnd);
  assert.ok(res.targetSubconRateVnd < res.contractRateVnd);
});

test("M69: explodeMultiLevelBOM bung chi tiết BOM 4 tầng vật tư và tính đúng tổng chi phí", () => {
  const bom = explodeMultiLevelBOM("BOQ-01", "Ống Thép DN100 SCH40", "m", 10.0);

  assert.equal(bom.rootItemCode, "BOQ-01");
  assert.ok(bom.totalCalculatedCostVnd > 0);
  assert.ok(bom.level1Count >= 1); // Cây ống
  assert.ok(bom.level2Count >= 2); // Bích, Bu lông M16, Gioăng
  assert.ok(bom.level3Count >= 2); // Ty ren M12, Tắc kê nở, Clevis hanger
  assert.ok(bom.level4Count >= 1); // Sơn lót, que hàn
  assert.equal(bom.items.length, 9);
});

test("M69: generateFidicClaimDefense sinh tài liệu đòi phát sinh FIDIC có mã băm SHA-256", () => {
  const claim = generateFidicClaimDefense(
    "TT AVIO Tháp A",
    "CLM-001",
    "Bổ sung 25.5m ống DN100 do thay đổi kiến trúc",
    25.5,
    500000,
    5,
  );

  assert.equal(claim.claimNumber, "CLM-001");
  assert.ok(claim.impactAnalysis.directCostIncreaseVnd > 0);
  assert.ok(claim.impactAnalysis.overheadCostIncreaseVnd > 0);
  assert.equal(claim.impactAnalysis.extensionOfTimeDays, 5);
  assert.ok(claim.provenanceHash.length >= 16);
  assert.ok(claim.legalNoticeContent.includes("CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM"));
});
