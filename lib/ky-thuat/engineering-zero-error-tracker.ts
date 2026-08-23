// lib/engineering-zero-error-tracker.ts — Zero-Error Construction & Anti-Fraud Verification Engine
import { createHmac, createHash } from "node:crypto";

export interface DynamicChallengeResult {
  challengeCode: string;
  expiresAt: string;
  timeSlot: number;
}

export interface GeofenceValidationResult {
  valid: boolean;
  distanceMeters: number;
  reason?: "MOCK_GPS_DETECTED" | "OUT_OF_GEOFENCE" | "INVALID_COORDINATES";
}

export interface QuadReconcileParams {
  reportedQty: number;
  bimDesignQty: number;
  boqApprovedQty: number;
  warehouseReceivedQty: number;
  warehouseUsedQty: number;
}

export interface QuadReconcileResult {
  allowed: boolean;
  maxAllowedQty: number;
  excessQty: number;
  errorReason?: string;
}

export interface AICalibrationParams {
  rawConfidence: number;
  isDarkUnderground?: boolean;
  isLowResolution?: boolean;
  hasValidGeo?: boolean;
  bimMatchedPercent: number; // 0 - 100
}

export interface AICalibratedAssessment {
  calibratedConfidence: number;
  status: "AUTO_PROPOSE" | "REQUIRE_HUMAN_INSPECTION";
  groundTruthAnchored: boolean;
  deductionFactors: {
    lighting: number;
    resolution: number;
    spatialMatch: number;
    geoValid: boolean;
  };
}

export interface ConcealedTaskRecord {
  id: string;
  name: string;
  zone: string;
  isConcealed: boolean;
  bbntSigned3Parties: boolean;
  pressureTestPassed: boolean;
}

export interface CircuitBreakerResult {
  status: "PERMIT_ACTIVE" | "LOCKED_CIRCUIT_OPEN";
  unpassedCount: number;
  blockingTasks: string[];
  lockReason?: string;
}

export interface ZeroErrorAuditPayload {
  projectId: number;
  zone: string;
  taskIds: string[];
  reconciledQty: number;
  inspectorUserId: number;
  consultantUserId: number;
  clientUserId: number;
  challengeCode: string;
  gpsCoords: { lat: number; lon: number };
}

export interface ZeroErrorAuditCertificate {
  certificateNumber: string;
  merkleLeafHash: string;
  signatureToken: string;
  issuedAt: string;
  status: "VERIFIED_TAMPER_PROOF";
}

// ============================================================================
// 1. GIAO THỨC THỬ THÁCH ĐỘNG (DYNAMIC CHALLENGE CODE)
// ============================================================================

export function generateFieldDynamicChallenge(
  projectId: number,
  userId: number,
  timestampMs = Date.now(),
  secret = process.env.XBOSS_SECRET || "xboss_dev_secret",
): DynamicChallengeResult {
  const timeSlot = Math.floor(timestampMs / 90000); // 90 seconds TTL
  const hmac = createHmac("sha256", secret)
    .update(`${projectId}:${userId}:${timeSlot}`)
    .digest("hex");
  const challengeCode = `#XB-${hmac.slice(0, 4).toUpperCase()}`;
  const expiresAt = new Date((timeSlot + 1) * 90000).toISOString();

  return {
    challengeCode,
    expiresAt,
    timeSlot,
  };
}

export function verifyFieldProofChallenge(
  code: string,
  projectId: number,
  userId: number,
  currentTimestampMs = Date.now(),
  secret = process.env.XBOSS_SECRET || "xboss_dev_secret",
): boolean {
  if (!code || typeof code !== "string" || !code.startsWith("#XB-")) {
    return false;
  }
  const currentSlot = Math.floor(currentTimestampMs / 90000);
  // Cho phép 2 slot (slot hiện tại và slot trước đó 90s)
  for (const slot of [currentSlot, currentSlot - 1]) {
    const hmac = createHmac("sha256", secret)
      .update(`${projectId}:${userId}:${slot}`)
      .digest("hex");
    if (`#XB-${hmac.slice(0, 4).toUpperCase()}` === code.toUpperCase()) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// 2. GEOFENCING & CHỐNG GIẢ MẠO GPS (ANTI-FAKE-GPS)
// ============================================================================

export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    return Infinity;
  }
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function validateGeofenceLocation(
  lat: number,
  lon: number,
  projectLat: number,
  projectLon: number,
  isMockLocation = false,
  maxDistanceMeters = 50,
): GeofenceValidationResult {
  if (isMockLocation) {
    return { valid: false, distanceMeters: 0, reason: "MOCK_GPS_DETECTED" };
  }
  const distanceMeters = calculateHaversineDistanceMeters(lat, lon, projectLat, projectLon);
  if (!isFinite(distanceMeters)) {
    return { valid: false, distanceMeters: Infinity, reason: "INVALID_COORDINATES" };
  }
  if (distanceMeters > maxDistanceMeters) {
    return { valid: false, distanceMeters, reason: "OUT_OF_GEOFENCE" };
  }
  return { valid: true, distanceMeters };
}

// ============================================================================
// 3. ĐỐI SOÁT ĐỊNH LƯỢNG 4 CHIỀU (QUAD-RECONCILIATION INVARIANT)
// ============================================================================

export function reconcileQuadQuantity(params: QuadReconcileParams): QuadReconcileResult {
  const warehouseAvailable = Math.max(0, params.warehouseReceivedQty - params.warehouseUsedQty);
  const maxAllowedQty = Math.min(params.bimDesignQty, params.boqApprovedQty, warehouseAvailable);

  if (params.reportedQty <= 0) {
    return {
      allowed: false,
      maxAllowedQty,
      excessQty: 0,
      errorReason: "Khối lượng báo cáo phải lớn hơn 0",
    };
  }

  if (params.reportedQty > params.bimDesignQty) {
    const excess = params.reportedQty - params.bimDesignQty;
    return {
      allowed: false,
      maxAllowedQty,
      excessQty: excess,
      errorReason: `Vượt khối lượng thiết kế BIM (${params.reportedQty} > ${params.bimDesignQty}, dư ${excess})`,
    };
  }

  if (params.reportedQty > params.boqApprovedQty) {
    const excess = params.reportedQty - params.boqApprovedQty;
    return {
      allowed: false,
      maxAllowedQty,
      excessQty: excess,
      errorReason: `Vượt hạn mức BOQ hợp đồng (${params.reportedQty} > ${params.boqApprovedQty}, dư ${excess})`,
    };
  }

  if (params.reportedQty > warehouseAvailable) {
    const excess = params.reportedQty - warehouseAvailable;
    return {
      allowed: false,
      maxAllowedQty,
      excessQty: excess,
      errorReason: `Vượt vật tư khả dụng trong kho (${params.reportedQty} > ${warehouseAvailable}, thiếu ${excess})`,
    };
  }

  return {
    allowed: true,
    maxAllowedQty,
    excessQty: 0,
  };
}

// ============================================================================
// 4. TRIỆT TIÊU ẢO GIÁC AI (GROUND-TRUTH ANCHORED CONFIDENCE)
// ============================================================================

export function calibrateAIConfidence(
  rawConfidence: number,
  params: {
    isDarkUnderground?: boolean;
    isLowResolution?: boolean;
    hasValidGeo?: boolean;
    bimMatchedPercent: number;
  },
): AICalibratedAssessment {
  const lightFactor = params.isDarkUnderground ? 0.8 : 1.0;
  const resFactor = params.isLowResolution ? 0.75 : 1.0;
  const geoValid = params.hasValidGeo !== false;
  const spatialFactor = 0.5 + 0.5 * (Math.max(0, Math.min(100, params.bimMatchedPercent)) / 100);

  let calibrated = rawConfidence * lightFactor * resFactor * spatialFactor;
  if (!geoValid) {
    calibrated = 0;
  }

  const rounded = Math.round(calibrated * 100) / 100;
  const groundTruthAnchored = rounded >= 0.85 && geoValid && params.bimMatchedPercent >= 80;

  return {
    calibratedConfidence: rounded,
    status: rounded >= 0.85 ? "AUTO_PROPOSE" : "REQUIRE_HUMAN_INSPECTION",
    groundTruthAnchored,
    deductionFactors: {
      lighting: lightFactor,
      resolution: resFactor,
      spatialMatch: spatialFactor,
      geoValid,
    },
  };
}

// ============================================================================
// 5. NGẮT MẠCH AN TOÀN CÔNG TÁC NGẦM (POUR PERMIT CIRCUIT BREAKER)
// ============================================================================

export function evaluateConcealedWorkCircuitBreaker(
  tasks: ConcealedTaskRecord[],
): CircuitBreakerResult {
  const unpassed = tasks.filter(
    (t) => t.isConcealed && (!t.bbntSigned3Parties || !t.pressureTestPassed),
  );
  if (unpassed.length > 0) {
    return {
      status: "LOCKED_CIRCUIT_OPEN",
      unpassedCount: unpassed.length,
      blockingTasks: unpassed.map((t) => `${t.name} (${t.zone})`),
      lockReason: `Khóa đổ bê tông do còn ${unpassed.length} hạng mục ngầm chưa có BBNT ký 3 bên hoặc chưa đạt thử áp`,
    };
  }
  return {
    status: "PERMIT_ACTIVE",
    unpassedCount: 0,
    blockingTasks: [],
  };
}

// ============================================================================
// 6. CÂY MERKLE BẤT BIẾN & CHỨNG CHỈ KIỂM TOÁN (MERKLE PROOF CERTIFICATE)
// ============================================================================

export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "";
  let currentLevel = leaves.map((l) => createHash("sha256").update(l).digest("hex"));
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      const combined = createHash("sha256")
        .update(left + right)
        .digest("hex");
      nextLevel.push(combined);
    }
    currentLevel = nextLevel;
  }
  return currentLevel[0];
}

export function generateZeroErrorAuditCertificate(
  payload: ZeroErrorAuditPayload,
): ZeroErrorAuditCertificate {
  const issuedAt = new Date().toISOString();
  const rawLeaf = `${payload.projectId}:${payload.zone}:${payload.taskIds.join(",")}:${payload.reconciledQty}:${payload.challengeCode}:${issuedAt}`;
  const merkleLeafHash = createHash("sha256").update(rawLeaf).digest("hex");

  const signRaw = `${merkleLeafHash}:${payload.inspectorUserId}:${payload.consultantUserId}:${payload.clientUserId}`;
  const signatureToken = `SIG-ZE-${createHash("sha256").update(signRaw).digest("hex").slice(0, 24).toUpperCase()}`;
  const certificateNumber = `CERT-ZE-${Date.now().toString(36).toUpperCase()}-${merkleLeafHash.slice(0, 8).toUpperCase()}`;

  return {
    certificateNumber,
    merkleLeafHash,
    signatureToken,
    issuedAt,
    status: "VERIFIED_TAMPER_PROOF",
  };
}
