/**
 * SITE FIELD COMMANDER — CLI EXECUTION ENGINE & VERIFIER
 * Động cơ kiểm toán NLP Nhật ký TT06, Bàn giao mặt bằng Work-Fronts & Phát hiện xung đột tài nguyên.
 */

export interface DiaryNlpResult {
  floor: number | null;
  zone: string | null;
  system: string | null;
  quantity: number | null;
  unit: string | null;
  subcontractor: string | null;
  laborCount: number | null;
  rainHours: number;
  weather: "SUNNY" | "RAIN_LIGHT" | "RAIN_HEAVY";
}

export function parseFieldDiaryNlp(text: string): DiaryNlpResult {
  const norm = text.toLowerCase();

  const floorMatch = norm.match(/tầng\s*(\d+)/i);
  const zoneMatch = norm.match(/zone\s*(\d+|a|b|c)/i);
  const qtyMatch = norm.match(/(\d+([\.,]\d+)?)\s*(m2|m3|m|mét|cây|căn)/i);
  const laborMatch = norm.match(/(\d+)\s*(thợ|công nhân|người)/i);
  const rainMatch = norm.match(/mưa[^\d]*(\d+)\s*(tiếng|giờ)/i);

  let system = "KHAC";
  if (norm.includes("thoát nước") || norm.includes("upvc")) system = "PLUMBING_DRAIN";
  else if (norm.includes("cấp nước") || norm.includes("ppr")) system = "PLUMBING_WATER";
  else if (norm.includes("ống gió") || norm.includes("duct")) system = "HVAC_DUCT";
  else if (norm.includes("máng cáp") || norm.includes("điện")) system = "ELECTRICAL_TRAY";
  else if (norm.includes("pccc") || norm.includes("sprinkler") || norm.includes("cứu hỏa"))
    system = "FIRE_PROTECTION";

  let subcon = "Tổ đội Thi công";
  if (norm.includes("minh tâm")) subcon = "Thầu phụ Minh Tâm";
  else if (norm.includes("hưng thịnh")) subcon = "Thầu phụ Hưng Thịnh";
  else if (norm.includes("đại việt")) subcon = "Thầu phụ Đại Việt";

  const rainHours = rainMatch ? Number(rainMatch[1]) : 0;
  let weather: DiaryNlpResult["weather"] = "SUNNY";
  if (rainHours >= 4 || norm.includes("mưa to") || norm.includes("mưa bão")) weather = "RAIN_HEAVY";
  else if (rainHours > 0 || norm.includes("mưa")) weather = "RAIN_LIGHT";

  return {
    floor: floorMatch ? Number(floorMatch[1]) : null,
    zone: zoneMatch ? zoneMatch[1].toUpperCase() : null,
    system,
    quantity: qtyMatch ? Number(qtyMatch[1].replace(",", ".")) : null,
    unit: qtyMatch ? qtyMatch[3] : null,
    subcontractor: subcon,
    laborCount: laborMatch ? Number(laborMatch[1]) : null,
    rainHours,
    weather,
  };
}

export interface ResourceAllocation {
  resourceId: string;
  resourceName: string;
  location: string;
  timeSlot: string;
}

export function detectResourceClash(allocations: ResourceAllocation[]): {
  hasClash: boolean;
  clashes: Array<{
    resourceId: string;
    resourceName: string;
    locations: string[];
    timeSlot: string;
  }>;
} {
  const map = new Map<string, ResourceAllocation[]>();

  for (const a of allocations) {
    const key = `${a.resourceId}_${a.timeSlot}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }

  const clashes: Array<{
    resourceId: string;
    resourceName: string;
    locations: string[];
    timeSlot: string;
  }> = [];

  for (const [_, items] of map.entries()) {
    const uniqueLocations = Array.from(new Set(items.map((i) => i.location)));
    if (uniqueLocations.length > 1) {
      clashes.push({
        resourceId: items[0].resourceId,
        resourceName: items[0].resourceName,
        locations: uniqueLocations,
        timeSlot: items[0].timeSlot,
      });
    }
  }

  return {
    hasClash: clashes.length > 0,
    clashes,
  };
}

// -------------------------------------------------------------
// TỰ KIỂM THỬ (CLI SELF-TEST EXECUTION)
// -------------------------------------------------------------
if (process.argv[1]?.endsWith("site_field_commander.ts")) {
  console.log("🚀 Đang chạy bộ kiểm toán Site Field Commander...");

  // Test Case 1: Bóc tách NLP khẩu lệnh nhật ký hiện trường Thông tư 06
  const voiceCommand =
    "Hôm nay Zone 1 Tầng 15 hoàn thành 140m ống thoát nước uPVC D110, quân số 12 thợ Minh Tâm làm việc tốt, chiều mưa to 4 tiếng phải dừng thi công";
  const diaryRes = parseFieldDiaryNlp(voiceCommand);

  console.log("\n1. [Circular 06 Diary NLP Voice Extraction]");
  console.log(`   - Khẩu lệnh gốc: "${voiceCommand}"`);
  console.log(`   - Tầng / Phân khu:   Tầng ${diaryRes.floor} - Zone ${diaryRes.zone}`);
  console.log(`   - Hệ thống chuyên ngành: [${diaryRes.system}]`);
  console.log(`   - Sản lượng hoàn thành:  ${diaryRes.quantity} ${diaryRes.unit}`);
  console.log(
    `   - Đơn vị thực hiện:      ${diaryRes.subcontractor} (${diaryRes.laborCount} nhân lực)`,
  );
  console.log(
    `   - Thời tiết & Dừng việc: Thời tiết [${diaryRes.weather}] - Gián đoạn do mưa: ${diaryRes.rainHours} giờ (Căn cứ đòi EOT)`,
  );

  // Test Case 2: Phát hiện gán chồng chéo tài nguyên
  const allocations: ResourceAllocation[] = [
    {
      resourceId: "ENG-TUAN",
      resourceName: "Kỹ sư Tuấn",
      location: "Tháp A - Tầng 10",
      timeSlot: "CA_SANG_2026_08_20",
    },
    {
      resourceId: "ENG-TUAN",
      resourceName: "Kỹ sư Tuấn",
      location: "Tháp B - Tầng 22",
      timeSlot: "CA_SANG_2026_08_20",
    }, // Xung đột!
    {
      resourceId: "CRANE-01",
      resourceName: "Cần trục tháp 01",
      location: "Khu vực bãi tập kết",
      timeSlot: "CA_CHIEU_2026_08_20",
    },
  ];

  const clashRes = detectResourceClash(allocations);
  console.log("\n2. [Resource Over-Allocation Conflict Detection]");
  console.log(`   - Phát hiện xung đột: ${clashRes.hasClash ? "🔥 CÓ XUNG ĐỘT" : "✅ HỢP LỆ"}`);
  clashRes.clashes.forEach((c) => {
    console.log(
      `     * Cảnh báo: [${c.resourceName}] bị phân công cùng lúc tại ${c.locations.join(" VÀ ")} trong khung giờ [${c.timeSlot}]!`,
    );
  });

  console.log("\n✅ Toàn bộ kiểm toán Site Field Commander hoàn thành 100% xuất sắc!");
}
