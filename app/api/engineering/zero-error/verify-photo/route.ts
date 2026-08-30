// app/api/engineering/zero-error/verify-photo/route.ts — Xác thực ảnh hiện trường chống gian lận & ảo giác
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import {
  verifyFieldProofChallenge,
  validateGeofenceLocation,
  calibrateAIConfidence,
} from "@/lib/ky-thuat/engineering-zero-error-tracker";

export const dynamic = "force-dynamic";

// Mặc định toạ độ dự án TT AVIO Tháp A (hoặc lấy từ cấu hình dự án)
const PROJECT_DEFAULT_COORDS = { lat: 10.7769, lon: 106.7009 };

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền thực hiện kiểm tra này" }, { status: 403 });
  }

  const projectId = await getCurrentProjectId(user);
  if (!projectId) return NextResponse.json({ error: "Chưa chọn dự án" }, { status: 400 });

  try {
    const body = await req.json();
    const challengeCode = String(body.challengeCode || "").trim();
    const lat = parseFloat(body.lat);
    const lon = parseFloat(body.lon);
    const isMockLocation = Boolean(body.isMockLocation);
    const rawConfidence = parseFloat(body.rawConfidence ?? "0.95");
    const isDarkUnderground = Boolean(body.isDarkUnderground);
    const isLowResolution = Boolean(body.isLowResolution);
    const bimMatchedPercent = parseFloat(body.bimMatchedPercent ?? "95");

    // 1. Kiểm tra Dynamic Challenge
    const challengeValid = verifyFieldProofChallenge(challengeCode, projectId, user.id);

    // 2. Kiểm tra Geofencing & Chống Fake GPS
    const geoValidation = validateGeofenceLocation(
      lat,
      lon,
      PROJECT_DEFAULT_COORDS.lat,
      PROJECT_DEFAULT_COORDS.lon,
      isMockLocation,
      50, // Bán kính 50m
    );

    // 3. Hiệu chuẩn độ tin cậy AI & Ground-Truth
    const aiAssessment = calibrateAIConfidence(rawConfidence, {
      isDarkUnderground,
      isLowResolution,
      hasValidGeo: geoValidation.valid,
      bimMatchedPercent,
    });

    const isFullyApproved =
      challengeValid && geoValidation.valid && aiAssessment.status === "AUTO_PROPOSE";

    return NextResponse.json({
      success: isFullyApproved,
      summary: isFullyApproved
        ? "Ảnh chụp hiện trường hợp lệ 100%, thỏa mãn đầy đủ tọa độ, mã thử thách và độ tin cậy căn cứ vật lý."
        : "Ảnh chụp bị từ chối hoặc yêu cầu kiểm tra thực địa trực tiếp do không thỏa mãn các điều kiện phòng vệ.",
      checks: {
        dynamicChallenge: {
          code: challengeCode,
          valid: challengeValid,
          reason: challengeValid
            ? "Mã hợp lệ trong thời gian sống"
            : "Mã không hợp lệ hoặc đã quá hạn 90 giây",
        },
        geofence: geoValidation,
        aiCalibration: aiAssessment,
      },
      recommendedAction: isFullyApproved ? "APPROVE_STAGE" : "REQUIRE_PHYSICAL_INSPECTION",
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
