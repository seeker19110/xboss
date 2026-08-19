/**
 * Core Engine cho Module M83: IoT Smart Site Energy & Environmental Telemetry Hub
 * Thu thập và phân tích dữ liệu cảm biến môi trường công trường & giám sát năng lượng điện
 */

export type IotDeviceType =
  "AIR_QUALITY" | "GAS_LEAK" | "NOISE" | "TEMPERATURE_HUMIDITY" | "ENERGY_METER";

export type TelemetryStatus = "NORMAL" | "WARNING" | "CRITICAL";

export interface IotDevice {
  id: string;
  projectId: number;
  deviceCode: string;
  deviceName: string;
  deviceType: IotDeviceType;
  locationArea: string;
  towerId?: number;
  isActive: boolean;
  thresholdMin?: number;
  thresholdMax?: number;
  unit: string;
}

export interface TelemetryReading {
  deviceId: string;
  metricValue: number;
  status: TelemetryStatus;
  measuredAt: string;
  rawPayload?: Record<string, any>;
}

export interface HseThresholdRule {
  deviceType: IotDeviceType;
  warningMax: number;
  criticalMax: number;
  standardReference: string;
  unit: string;
}

export const HSE_STANDARDS: Record<string, HseThresholdRule> = {
  AIR_QUALITY_PM25: {
    deviceType: "AIR_QUALITY",
    warningMax: 50.0, // ug/m3 (QCVN 05:2023/BTNMT 24h)
    criticalMax: 100.0,
    standardReference: "QCVN 05:2023/BTNMT (Chất lượng không khí)",
    unit: "ug/m3",
  },
  NOISE_DAY: {
    deviceType: "NOISE",
    warningMax: 70.0, // dBA (QCVN 26:2010/BTNMT ban ngày)
    criticalMax: 85.0,
    standardReference: "QCVN 26:2010/BTNMT (Quy chuẩn tiếng ồn)",
    unit: "dBA",
  },
  GAS_CO: {
    deviceType: "GAS_LEAK",
    warningMax: 25.0, // ppm (Ngưỡng an toàn không gian kín TCVN)
    criticalMax: 50.0,
    standardReference: "QCVN 03:2019/BYT (Giới hạn tiếp xúc hóa chất)",
    unit: "ppm",
  },
  TEMP_MAX: {
    deviceType: "TEMPERATURE_HUMIDITY",
    warningMax: 38.0, // degC
    criticalMax: 42.0,
    standardReference: "QCVN 26:2016/BYT (Vi khí hậu nơi làm việc)",
    unit: "degC",
  },
};

/**
 * Đánh giá trạng thái cảnh báo của một phép đo cảm biến theo quy chuẩn an toàn HSE
 */
export function evaluateTelemetryStatus(
  deviceType: IotDeviceType,
  value: number,
  customThresholdMax?: number,
): {
  status: TelemetryStatus;
  alertTitle?: string;
  alertMessage?: string;
  standardReference?: string;
} {
  // Nếu có threshold riêng của thiết bị
  if (customThresholdMax !== undefined && customThresholdMax !== null) {
    if (value >= customThresholdMax * 1.25) {
      return {
        status: "CRITICAL",
        alertTitle: `Vượt ngưỡng nghiêm trọng (${value})`,
        alertMessage: `Giá trị đo đạt ${value}, vượt ngưỡng thiết lập tối đa (${customThresholdMax}).`,
      };
    } else if (value >= customThresholdMax) {
      return {
        status: "WARNING",
        alertTitle: `Vượt ngưỡng cảnh báo (${value})`,
        alertMessage: `Giá trị đo đạt ${value}, chạm ngưỡng cảnh báo (${customThresholdMax}).`,
      };
    }
    return { status: "NORMAL" };
  }

  // Đối soát theo bộ chuẩn QCVN mặc định
  if (deviceType === "AIR_QUALITY") {
    const std = HSE_STANDARDS.AIR_QUALITY_PM25;
    if (value >= std.criticalMax) {
      return {
        status: "CRITICAL",
        alertTitle: "Ô nhiễm bụi mịn PM2.5 mức nguy hại",
        alertMessage: `Nồng độ bụi PM2.5 đạt ${value} ${std.unit}, vượt ngưỡng khẩn cấp. Yêu cầu trang bị mặt nạ lọc bụi chuyên dụng và kích hoạt phun sương dập bụi.`,
        standardReference: std.standardReference,
      };
    } else if (value >= std.warningMax) {
      return {
        status: "WARNING",
        alertTitle: "Cảnh báo nồng độ bụi PM2.5 tăng cao",
        alertMessage: `Nồng độ bụi PM2.5 đạt ${value} ${std.unit}, tiệm cận ngưỡng quy chuẩn.`,
        standardReference: std.standardReference,
      };
    }
  } else if (deviceType === "GAS_LEAK") {
    const std = HSE_STANDARDS.GAS_CO;
    if (value >= std.criticalMax) {
      return {
        status: "CRITICAL",
        alertTitle: "Báo động rò rỉ khí độc CO tầng hầm",
        alertMessage: `Nồng độ khí CO đạt ${value} ${std.unit}. CẦN SƠ TÁN CÔNG NHÂN KHỎI TẦNG HẦM VÀ BẬT HỆ THỐNG QUẠT THÔNG GIÓ HÚT KHÓI KHẨN CẤP!`,
        standardReference: std.standardReference,
      };
    } else if (value >= std.warningMax) {
      return {
        status: "WARNING",
        alertTitle: "Cảnh báo nồng độ khí CO tăng",
        alertMessage: `Nồng độ khí CO đạt ${value} ${std.unit}. Kiểm tra thông gió cục bộ.`,
        standardReference: std.standardReference,
      };
    }
  } else if (deviceType === "NOISE") {
    const std = HSE_STANDARDS.NOISE_DAY;
    if (value >= std.criticalMax) {
      return {
        status: "CRITICAL",
        alertTitle: "Độ ồn công trường vượt ngưỡng cho phép",
        alertMessage: `Mức ồn đạt ${value} ${std.unit}. Yêu cầu cấp nút tai chống ồn và hạn chế thi công thiết bị phát tiếng ồn lớn.`,
        standardReference: std.standardReference,
      };
    } else if (value >= std.warningMax) {
      return {
        status: "WARNING",
        alertTitle: "Cảnh báo tiếng ồn tiệm cận ngưỡng",
        alertMessage: `Mức ồn đạt ${value} ${std.unit}.`,
        standardReference: std.standardReference,
      };
    }
  }

  return { status: "NORMAL" };
}

/**
 * Tính toán tổng hợp năng lượng điện tiêu thụ công trường (kW tức thời và kWh tích lũy)
 */
export function computeEnergySummary(readings: { metricValue: number; measuredAt: string }[]): {
  currentPowerKw: number;
  totalEnergyKwh: number;
  peakPowerKw: number;
} {
  if (!readings || readings.length === 0) {
    return { currentPowerKw: 0, totalEnergyKwh: 0, peakPowerKw: 0 };
  }

  let peak = 0;
  let total = 0;
  for (const r of readings) {
    if (r.metricValue > peak) peak = r.metricValue;
    total += r.metricValue;
  }

  const latest = readings[readings.length - 1]?.metricValue || 0;
  return {
    currentPowerKw: Number(latest.toFixed(1)),
    totalEnergyKwh: Number(total.toFixed(1)),
    peakPowerKw: Number(peak.toFixed(1)),
  };
}
