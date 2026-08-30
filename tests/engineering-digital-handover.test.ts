import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bundleDigitalHandoverPassport,
  HandoverSummaryInput,
} from "@/lib/ky-thuat/engineering-digital-handover";

test("M71: bundleDigitalHandoverPassport đóng gói trọn bộ hồ sơ hoàn công số LOD 500 kèm mã băm SHA-256", () => {
  const input: HandoverSummaryInput = {
    projectTitle: "TT AVIO Tháp A",
    handoverDate: "2026-08-19",
    totalSpoolsCount: 150,
    totalBbntCount: 30,
    totalTcTestsPassed: 20,
    totalLinearMetersApproved: 4500.0,
    totalDuctAreaApprovedM2: 3200.0,
    verifiedByPmName: "Nguyễn Văn PM",
  };

  const res = bundleDigitalHandoverPassport("PASS-01", input);

  assert.equal(res.passportCode, "PASS-01");
  assert.equal(res.totalSpoolsCount, 150);
  assert.equal(res.totalBbntCount, 30);
  assert.ok(res.provenanceMasterHash.length >= 32);
  assert.ok(res.digitalCertificateToken.startsWith("SIG-PASSPORT-LOD500-"));
  assert.equal(res.bmsIntegrationReady, true);
  assert.ok(res.handoverExecutiveSummary.includes("TT AVIO Tháp A"));
});
