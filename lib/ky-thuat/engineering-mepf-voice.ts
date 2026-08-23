// lib/engineering-mepf-voice.ts — AI Voice-to-WBS Field Inspection Logger (M68)
import { query, queryOne } from "@/lib/db";
import { SpoolStatus } from "@/lib/ky-thuat/engineering-cad-qto";

export interface ParsedVoiceEntity {
  rawText: string;
  extractedLocation: string;
  extractedSpoolCode: string | null;
  detectedStatus: SpoolStatus | null;
  hasDefect: boolean;
  defectDescription: string | null;
  defectSeverity: "low" | "medium" | "critical" | null;
  confidenceScore: number;
}

// ============================================================================
// 1. THUẬT TOÁN TRÍCH XUẤT THỰC THỂ TIẾNG VIỆT TỪ GIỌNG NÓI HIỆN TRƯỜNG
// ============================================================================

export function parseVoiceInspectionText(text: string): ParsedVoiceEntity {
  if (!text || text.trim().length === 0) {
    return {
      rawText: "",
      extractedLocation: "Chưa xác định",
      extractedSpoolCode: null,
      detectedStatus: null,
      hasDefect: false,
      defectDescription: null,
      defectSeverity: null,
      confidenceScore: 0,
    };
  }

  const lower = text.toLowerCase();

  // 1. Trích xuất vị trí (Tầng, Zone, Căn hộ)
  let extractedLocation = "Hiện trường Chung";
  const floorMatch = lower.match(/tầng\s*(\d+|hầm\s*\d*)/i);
  const zoneMatch = lower.match(/zone\s*([a-z0-9]+)|khu\s*([a-z0-9]+)/i);
  const aptMatch = lower.match(/căn\s*hộ\s*([a-z0-9.]+)|căn\s*([a-z0-9.]+)/i);

  const locParts: string[] = [];
  if (floorMatch) locParts.push(`Tầng ${floorMatch[1].trim().toUpperCase()}`);
  if (zoneMatch) locParts.push(`Zone ${(zoneMatch[1] || zoneMatch[2]).trim().toUpperCase()}`);
  if (aptMatch) locParts.push(`Căn ${aptMatch[1] || aptMatch[2]}`);
  if (locParts.length > 0) extractedLocation = locParts.join(" - ");

  // 2. Trích xuất mã Spool
  let extractedSpoolCode: string | null = null;
  const spoolMatch = text.match(/SP-[A-Z0-9_-]+/i) || text.match(/spool\s*([A-Z0-9_-]+)/i);
  if (spoolMatch) {
    extractedSpoolCode = (spoolMatch[1] || spoolMatch[0]).toUpperCase();
  }

  // 3. Nhận diện trạng thái tiến độ 5 mốc
  let detectedStatus: SpoolStatus | null = null;
  if (
    lower.includes("nghiệm thu đạt") ||
    lower.includes("duyệt bbnt") ||
    lower.includes("chủ đầu tư ký")
  ) {
    detectedStatus = "bbnt_approved";
  } else if (
    lower.includes("kcs đạt") ||
    lower.includes("qc passed") ||
    lower.includes("đạt chuẩn")
  ) {
    detectedStatus = "qc_passed";
  } else if (
    lower.includes("đã lắp") ||
    lower.includes("gác xong") ||
    lower.includes("lắp đặt xong")
  ) {
    detectedStatus = "installed";
  } else if (lower.includes("về kho") || lower.includes("nhập kho") || lower.includes("đã giao")) {
    detectedStatus = "delivered";
  } else if (lower.includes("đang gia công") || lower.includes("xưởng cắt")) {
    detectedStatus = "fabricated";
  }

  // 4. Phát hiện mô tả lỗi (Defect / Punch-list)
  let hasDefect = false;
  let defectDescription: string | null = null;
  let defectSeverity: ParsedVoiceEntity["defectSeverity"] = null;

  const defectKeywords = [
    "thiếu",
    "rò rỉ",
    "lệch",
    "xì",
    "chưa dán",
    "sai cốt",
    "võng",
    "hở bích",
    "chưa sơn",
  ];
  for (const kw of defectKeywords) {
    if (lower.includes(kw)) {
      hasDefect = true;
      defectDescription = `Phát hiện lỗi hiện trường: ${text}`;
      if (lower.includes("rò rỉ") || lower.includes("sai cốt") || lower.includes("võng")) {
        defectSeverity = "critical";
      } else {
        defectSeverity = "medium";
      }
      break;
    }
  }

  return {
    rawText: text,
    extractedLocation,
    extractedSpoolCode,
    detectedStatus: detectedStatus || "installed",
    hasDefect,
    defectDescription,
    defectSeverity,
    confidenceScore: 0.95,
  };
}

// ============================================================================
// 2. THUẬT TOÁN TÍNH TOÁN CHỈ SỐ NĂNG SUẤT THỰC TẾ (REALTIME PRODUCTIVITY)
// ============================================================================

export function calculateProductivityIndex(
  actualCompletedQty: number,
  headcount: number,
  workingHours: number,
  normQtyPerHour = 2.5, // Định mức chuẩn 2.5 m ống/người-giờ
): {
  actualRatePerHour: number;
  expectedTotalQty: number;
  productivityPercent: number;
  rating: "excellent" | "normal" | "low_productivity";
} {
  const totalManHours = headcount * workingHours;
  if (totalManHours <= 0) {
    return { actualRatePerHour: 0, expectedTotalQty: 0, productivityPercent: 0, rating: "normal" };
  }

  const actualRatePerHour = Math.round((actualCompletedQty / totalManHours) * 100) / 100;
  const expectedTotalQty = Math.round(totalManHours * normQtyPerHour * 10) / 10;
  const pct = Math.round((actualCompletedQty / expectedTotalQty) * 1000) / 10;

  let rating: "excellent" | "normal" | "low_productivity" = "normal";
  if (pct >= 115) rating = "excellent";
  else if (pct < 85) rating = "low_productivity";

  return {
    actualRatePerHour,
    expectedTotalQty,
    productivityPercent: pct,
    rating,
  };
}

// ============================================================================
// 3. PERSISTENCE & DATABASE
// ============================================================================

export async function saveVoiceLog(
  projectId: number,
  userId: number | null,
  parsed: ParsedVoiceEntity,
): Promise<{ id: string }> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_mepf_voice_logs (
      project_id, transcribed_text, extracted_location,
      extracted_spool_code, updated_stage, defect_created,
      defect_description, created_by
    ) VALUES (
      $1, $2, $3,
      $4, $5, $6,
      $7, $8
    ) RETURNING id`,
    [
      projectId,
      parsed.rawText,
      parsed.extractedLocation,
      parsed.extractedSpoolCode,
      parsed.detectedStatus,
      parsed.hasDefect,
      parsed.defectDescription,
      userId,
    ],
  );

  if (!row) throw new Error("Failed to save voice log");
  return row;
}

export async function listVoiceLogs(projectId: number): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT * FROM engineering_mepf_voice_logs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [projectId],
  );
}
