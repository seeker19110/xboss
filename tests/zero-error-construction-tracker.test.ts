import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateFieldDynamicChallenge,
  verifyFieldProofChallenge,
  calculateHaversineDistanceMeters,
  validateGeofenceLocation,
  reconcileQuadQuantity,
  calibrateAIConfidence,
  evaluateConcealedWorkCircuitBreaker,
  computeMerkleRoot,
  generateZeroErrorAuditCertificate,
} from "@/lib/engineering-zero-error-tracker";

test("Dynamic Challenge: Sinh mã và kiểm tra tính hợp lệ trong thời gian sống", () => {
  const t0 = 1755678000000;
  const result = generateFieldDynamicChallenge(1, 42, t0, "test_secret");
  assert.ok(result.challengeCode.startsWith("#XB-"));
  assert.equal(typeof result.expiresAt, "string");

  // Hợp lệ trong khoảng thời gian hiện tại
  assert.equal(
    verifyFieldProofChallenge(result.challengeCode, 1, 42, t0 + 10000, "test_secret"),
    true,
  );

  // Quá hạn sau 3 phút (180s)
  assert.equal(
    verifyFieldProofChallenge(result.challengeCode, 1, 42, t0 + 200000, "test_secret"),
    false,
  );

  // Sai người dùng hoặc dự án
  assert.equal(verifyFieldProofChallenge(result.challengeCode, 2, 42, t0, "test_secret"), false);
  assert.equal(verifyFieldProofChallenge(result.challengeCode, 1, 99, t0, "test_secret"), false);

  // Mã sai định dạng
  assert.equal(verifyFieldProofChallenge("INVALID", 1, 42, t0, "test_secret"), false);
});

test("Geofencing & Anti-Fake GPS: Đo đạc khoảng cách và bắt cờ giả lập", () => {
  const projectCoords = { lat: 10.7769, lon: 106.7009 };

  // Khoảng cách trong phạm vi 10m
  const valid = validateGeofenceLocation(
    10.77695,
    106.70095,
    projectCoords.lat,
    projectCoords.lon,
    false,
    50,
  );
  assert.equal(valid.valid, true);
  assert.ok(valid.distanceMeters < 50);

  // Phát hiện cờ Mock GPS
  const mockGps = validateGeofenceLocation(
    10.7769,
    106.7009,
    projectCoords.lat,
    projectCoords.lon,
    true,
  );
  assert.equal(mockGps.valid, false);
  assert.equal(mockGps.reason, "MOCK_GPS_DETECTED");

  // Ngoài phạm vi Geofence (cách 500m)
  const outOfFence = validateGeofenceLocation(
    10.781,
    106.705,
    projectCoords.lat,
    projectCoords.lon,
    false,
    50,
  );
  assert.equal(outOfFence.valid, false);
  assert.equal(outOfFence.reason, "OUT_OF_GEOFENCE");
});

test("Quad-Reconciliation: Đối soát cân bằng 4 chiều BIM - BOQ - Kho - Báo cáo", () => {
  // Hợp lệ: Báo cáo 100m, BIM có 150m, BOQ duyệt 120m, Kho còn 110m
  const validCase = reconcileQuadQuantity({
    reportedQty: 100,
    bimDesignQty: 150,
    boqApprovedQty: 120,
    warehouseReceivedQty: 200,
    warehouseUsedQty: 90, // Kho còn 110m
  });
  assert.equal(validCase.allowed, true);
  assert.equal(validCase.maxAllowedQty, 110);
  assert.equal(validCase.excessQty, 0);

  // Gian lận vượt BIM
  const excessBim = reconcileQuadQuantity({
    reportedQty: 160,
    bimDesignQty: 150,
    boqApprovedQty: 180,
    warehouseReceivedQty: 200,
    warehouseUsedQty: 0,
  });
  assert.equal(excessBim.allowed, false);
  assert.ok(excessBim.errorReason?.includes("Vượt khối lượng thiết kế BIM"));

  // Gian lận vượt BOQ
  const excessBoq = reconcileQuadQuantity({
    reportedQty: 140,
    bimDesignQty: 150,
    boqApprovedQty: 120,
    warehouseReceivedQty: 200,
    warehouseUsedQty: 0,
  });
  assert.equal(excessBoq.allowed, false);
  assert.ok(excessBoq.errorReason?.includes("Vượt hạn mức BOQ"));

  // Gian lận vượt vật tư kho (Kho chỉ còn 50m nhưng báo cáo 80m)
  const excessStock = reconcileQuadQuantity({
    reportedQty: 80,
    bimDesignQty: 150,
    boqApprovedQty: 150,
    warehouseReceivedQty: 100,
    warehouseUsedQty: 50,
  });
  assert.equal(excessStock.allowed, false);
  assert.ok(excessStock.errorReason?.includes("Vượt vật tư khả dụng trong kho"));
});

test("AI Grounding & Confidence Calibration: Triệt tiêu ảo giác khi thiếu bằng chứng thực tế", () => {
  // Ảnh chuẩn, đủ sáng, toạ độ đúng, khớp BIM 95%
  const highQuality = calibrateAIConfidence(0.95, {
    isDarkUnderground: false,
    isLowResolution: false,
    hasValidGeo: true,
    bimMatchedPercent: 95,
  });
  assert.equal(highQuality.status, "AUTO_PROPOSE");
  assert.equal(highQuality.groundTruthAnchored, true);

  // Ảnh mờ dưới hầm tối, khớp BIM 70% -> Tụt điểm, chuyển sang đòi TVGS kiểm tra mắt
  const degraded = calibrateAIConfidence(0.9, {
    isDarkUnderground: true,
    isLowResolution: true,
    hasValidGeo: true,
    bimMatchedPercent: 70,
  });
  assert.equal(degraded.status, "REQUIRE_HUMAN_INSPECTION");
  assert.equal(degraded.groundTruthAnchored, false);
  assert.ok(degraded.calibratedConfidence < 0.85);

  // Sai tọa độ GPS -> Điểm tin cậy về 0
  const fakeGeo = calibrateAIConfidence(0.99, {
    hasValidGeo: false,
    bimMatchedPercent: 100,
  });
  assert.equal(fakeGeo.calibratedConfidence, 0);
  assert.equal(fakeGeo.status, "REQUIRE_HUMAN_INSPECTION");
});

test("Concealed Work Circuit Breaker: Khóa lệnh đổ bê tông nếu còn hạng mục ngầm chưa nghiệm thu", () => {
  const incompleteTasks = [
    {
      id: "T1",
      name: "Sleeve D110 dầm 1",
      zone: "Zone 1",
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
    {
      id: "T2",
      name: "Ống luồn dây sàn",
      zone: "Zone 1",
      isConcealed: true,
      bbntSigned3Parties: false,
      pressureTestPassed: true,
    },
    {
      id: "T3",
      name: "Ống cấp nước âm sàn",
      zone: "Zone 1",
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: false,
    },
  ];

  const locked = evaluateConcealedWorkCircuitBreaker(incompleteTasks);
  assert.equal(locked.status, "LOCKED_CIRCUIT_OPEN");
  assert.equal(locked.unpassedCount, 2);
  assert.ok(locked.blockingTasks.length === 2);

  const completedTasks = [
    {
      id: "T1",
      name: "Sleeve D110 dầm 1",
      zone: "Zone 1",
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
    {
      id: "T2",
      name: "Ống luồn dây sàn",
      zone: "Zone 1",
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
    {
      id: "T3",
      name: "Ống cấp nước âm sàn",
      zone: "Zone 1",
      isConcealed: true,
      bbntSigned3Parties: true,
      pressureTestPassed: true,
    },
  ];

  const active = evaluateConcealedWorkCircuitBreaker(completedTasks);
  assert.equal(active.status, "PERMIT_ACTIVE");
  assert.equal(active.unpassedCount, 0);
});

test("Merkle Tree & Audit Certificate: Tạo chứng chỉ kiểm toán và phát hiện can thiệp sửa dữ liệu", () => {
  const cert = generateZeroErrorAuditCertificate({
    projectId: 1,
    zone: "Zone 1 F12",
    taskIds: ["TASK-1", "TASK-2"],
    reconciledQty: 120,
    inspectorUserId: 10,
    consultantUserId: 20,
    clientUserId: 30,
    challengeCode: "#XB-8A4F",
    gpsCoords: { lat: 10.7769, lon: 106.7009 },
  });

  assert.ok(cert.certificateNumber.startsWith("CERT-ZE-"));
  assert.ok(cert.signatureToken.startsWith("SIG-ZE-"));
  assert.equal(cert.status, "VERIFIED_TAMPER_PROOF");

  const leaves = [cert.merkleLeafHash, "LEAF_EVENT_2", "LEAF_EVENT_3"];
  const root1 = computeMerkleRoot(leaves);
  assert.ok(root1.length === 64);

  // Can thiệp sửa leaf
  const tamperedLeaves = ["LEAF_TAMPERED", "LEAF_EVENT_2", "LEAF_EVENT_3"];
  const root2 = computeMerkleRoot(tamperedLeaves);
  assert.notEqual(root1, root2);
});
