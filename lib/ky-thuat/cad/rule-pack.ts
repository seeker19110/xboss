// lib/ky-thuat/cad/rule-pack.ts — Nguồn quy tắc chuẩn hóa CAD duy nhất (M99 PR1)
/**
 * Gộp 3 mảnh của cùng một họ: rule pack ĐANG PHÁT HÀNH (dữ liệu thuần), các tiện ích đọc/ETag/
 * kiểm khối chính sách, và validator khối `drawTools.revisionPolicy` (M110 §5).
 *
 * Rule pack là "một nguồn quy tắc" cho cả tầng web (TypeScript) lẫn plugin AutoCAD .NET: plugin
 * tải về qua GET /api/engineering/cad/rule-pack rồi áp đúng bộ quy tắc đó, nên hai tầng không
 * trôi khỏi nhau (ADR-0006 nguyên tắc 1).
 *
 * Đổi quy tắc = thêm tệp version mới trong `lib/ky-thuat/cad/rule-packs/`, KHÔNG sửa version đã
 * phát hành (cùng triết lý append-only của migration). Phát hành version mới = đổi ĐÚNG một dòng
 * `import` ở đầu tệp này.
 *
 * `node:crypto` chỉ dùng trong các hàm ETag (phía máy chủ). `dxf-parser.ts` chạy cả ở trình duyệt
 * và chỉ lấy `RULE_PACK_HIEN_HANH`; bundler loại bỏ nhánh ETag nên không kéo `node:crypto` vào
 * bundle client — đã kiểm bằng `npm run build` (không chunk client nào chứa `node:crypto`).
 */

import rulePackV16 from "@/lib/ky-thuat/cad/rule-packs/v16.json";
import { createHash } from "node:crypto";

// ===== rule-pack-hien-hanh.ts =====
// Rule pack ĐANG PHÁT HÀNH (dữ liệu thuần)
/**
 * `dxf-parser.ts` chạy cả ở client (trang chuẩn hóa bản vẽ) và chỉ cần đúng hai khai báo dưới đây
 * để đọc danh sách layer đích cho ánh xạ layer idempotent — giữ chúng ở ngay đầu tệp, không phụ
 * thuộc gì vào phần ETag bên dưới.
 *
 * Phát hành version mới = đổi ĐÚNG một dòng `import rulePackV..` ở đầu tệp (append-only: không sửa
 * tệp version cũ).
 */

export type CadRulePack = typeof rulePackV16;

/** Rule pack đang phát hành cho plugin — mô tả từng version xem `getCurrentRulePack()`. */
export const RULE_PACK_HIEN_HANH = rulePackV16;

// ===== rule-pack.ts =====
// Đọc rule pack, ETag cho plugin tải về, và các validator khối chính sách

/** Version đang phát hành cho plugin. */
export const CURRENT_RULE_PACK_VERSION = RULE_PACK_HIEN_HANH.version;

/**
 * Rule pack đang phát hành:
 * v2 = v1 + takeoff + inspectionPolicy (M99 PR-A);
 * v3 = v2 + fontMap.targetFont (font Unicode đích cho kiểu chữ đã giải mã TCVN3/VNI — không có
 * nó thì plugin sửa nội dung chữ xong AutoCAD vẫn hiển thị sai, xem PROGRESS.md 2026-08-25);
 * v4 = v3 + drawTools + sheetSetup (tham số bộ lệnh vẽ XBOSS_VE_* — M100 §11, mở rộng thuần nên
 * plugin M99 đọc v4 chạy y hệt v3);
 * v5 = v4 + 7 phép kiểm mới của XBOSS_KIEMTRA (M101 §6.1, số 10–16) + khối styleMap dùng chung với
 * bước chuẩn hóa 8 (M101 §6.2). Mọi phép kiểm mới mặc định `enabled: false` nên plugin cũ lẫn mới
 * nạp v5 đều cho kết quả kiểm y hệt v4 (M101 §7 FR1);
 * v6 = v5 + các khóa TÙY CHỌN của bóc tách nâng cao XBOSS_BOCKL (M101 §6.3: groupBySize,
 * sizeFromNearbyText, wastagePct, perCountAdd, derivedFrom+formula). Không item nào trong v6 khai
 * khóa mới nên bóc bằng v6 cho kết quả y hệt v5 — công ty bật hệ số theo dự án bằng version kế tiếp;
 * v7 = v6 + 2 item đếm `support-hanger`/`sleeve-opening` (giá đỡ, lỗ chờ — M100 AC12/§6.8: trước v7
 * XBOSS_BOCKL không đếm được hai hạng mục này) + `drawTools.heavyFittingIds` khai phụ kiện nặng cần
 * giá đỡ tại chỗ (M100 §6.7 — trước v7 XBOSS_VE_GIADO phải hỏi kỹ sư mỗi lần chạy).
 * v7 = v6 + 3 khối chính sách cho 4 bước chuẩn hóa mới của XBOSS_CHUANHOA (M101 §6.2 bước 8–11):
 * xrefPolicy, hatchMap, layoutPolicy. Bước 8 (style map) dùng lại khối styleMap đã có từ v5 nên
 * KHÔNG khai trùng. Cả 3 khối mới `enabled: false` → chuẩn hóa bằng v7 cho kết quả y hệt v6;
 * v8 = v7 + 2 phép kiểm mới của XBOSS_KIEMTRA (M102 §6.4/§6.5: `tagDuplicate` số 17, `boqCodeMissing`
 * số 18 — cả hai còn TỰ TẮT khi thiếu dữ liệu, không chỉ theo cờ `enabled`) + 2 khối chính sách cho
 * bước chuẩn hóa 12/13 (`polylineClosePolicy` đóng polyline gần kín, `blockMap` quy block lạc chuẩn
 * về thư viện block 0139). Mọi khóa mới mặc định tắt → v8 cho kết quả y hệt v7. Kèm sửa
 * `layerMap.knownIssues`: nợ "không idempotent" đã đóng ở M101 PR2 nhưng mô tả cũ còn ghi là nợ;
 * v9 = v8 + khối `drawTools.systems[].lines[].jointRules` cho ĐỦ 9 tuyến hiện có (3 ống gió + 4 ống
 * nước/PCCC + 2 máng cáp): tham số chia đốt chế tạo/lắp đặt theo kiểu kết nối (bảng chọn kiểu nối theo
 * cỡ, chiều dài đốt tối đa, khe mối nối, chế độ chia, đốt tối thiểu, định mức phụ kiện mối nối) — dùng
 * chung cho lệnh `XBOSS_VE_CHIADOT` của plugin và engine web `lib/ky-thuat/engineering-joint-segmentation.ts`
 * (M105 §7/§12). Mở rộng thuần: mọi khóa cũ giữ nguyên từng byte nên kiểm/chuẩn hóa/bóc/vẽ bằng v9 cho
 * kết quả y hệt v8; rule pack cũ (v4–v8) không có `jointRules` thì lệnh chia đốt TỪ CHỐI chạy chứ không
 * đoán mặc định ngầm;
 * v12 = v9 + khối `drawTools.floorPolicy` cho lệnh nhân bản tầng điển hình `XBOSS_VE_NHANTANG`
 * (M111 §4): danh sách nhãn tầng, kiểu dời + bước dời, mẫu tên vùng bóc của bản chép, danh sách vai
 * trò được chép. Mở rộng thuần (mọi khóa cũ giữ nguyên từng byte) và `enabled: false` mặc định nên
 * v12 cho kết quả y hệt v9; lệnh nhân tầng từ chối chạy tới khi công ty bật khóa này (M111 AC12);
 * v13 = v12 + khối `drawTools.crossingPolicy` — chính sách ngắt nét giao chéo của lệnh
 * `XBOSS_VE_NGATNET` (M109 §5): hạng ưu tiên trình bày giữa các hệ (id theo `systems[].id`), bề
 * rộng vùng che, bán kính cầu vượt, hậu tố layer đối tượng ngắt nét, ngưỡng góc giao. Mở rộng
 * thuần và `enabled: false` mặc định nên mọi lệnh cũ chạy với v13 cho kết quả y hệt v9.
 * (v10/v11 bỏ trống: v10 là bản nháp crossingPolicy của nhánh M109 trước khi M111 phát hành v12,
 * không bản nào ra khỏi nhánh; v13 gộp đủ cả hai khối mới.)
 * v14 = v13 + khối `drawTools.revisionPolicy` cho bộ lệnh revision cloud
 * `XBOSS_VE_REV`/`_CHOT`/`_HIENTHI` (M110 §5): chiều dài cung cloud, layer, block tam giác
 * (`kind=annotation`), định dạng số revision, mẫu tên attribute bảng revision trong khung tên, số
 * dòng tối đa, nới bao hình. Mở rộng thuần và `enabled: false` mặc định nên v14 cho kết quả y hệt
 * v9; 3 lệnh revision từ chối chạy tới khi công ty bật khóa này (M110 AC8).
 * v15 = v14 + khối `drawTools.routingPolicy` cho bộ lệnh đi tuyến tự động theo đồ thị hành lang
 * `XBOSS_VE_HANHLANG`/`XBOSS_VE_TUYENTUDONG` (M114 §6): layer hành lang, bán kính rẽ nhánh, 3 hệ
 * số hàm chi phí (α co, β độ đông, γ gom trục), phân tầng theo hệ, khe hở làn và thứ tự chạy hệ.
 * Mở rộng thuần và `enabled: false` mặc định nên v15 cho kết quả y hệt v14; 2 lệnh đi tuyến dừng
 * kèm hướng dẫn bật tới khi công ty bật khóa này (M114 AC14).
 * v16 = v15 + khối `drawTools.completionPolicy` cho bộ lệnh hoàn thiện bản vẽ từ tuyến tim
 * `XBOSS_TUYEN_DOTHI`/`XBOSS_HOANTHIEN` (M115 §7 FR5): dung sai gộp nút, bán kính chạm thiết bị,
 * dung sai cao độ, góc tối thiểu coi là đổi hướng, bảng luật chọn phụ kiện tại nút theo
 * hệ+cỡ+góc (`fittingRules`) và trạng thái tích sẵn của 8 giai đoạn hoàn thiện (`stageDefaults`).
 * Mở rộng thuần, `enabled: false` và cả 8 giai đoạn `false` nên v16 cho kết quả y hệt v15 (AC5).
 */
export function getCurrentRulePack(): CadRulePack {
  return RULE_PACK_HIEN_HANH;
}

/** Vai trò đối tượng do bộ lệnh vẽ sinh ra — bản TS của enum `VaiTroVe` (Core `Draw/VeXData.cs`). */
export const VAI_TRO_VE = [
  "Tim",
  "Bien",
  "Nhan",
  "TuyenCat",
  "MatCat",
  "PhuKien",
  "ThietBi",
  "DinhNghiaBlock",
  "GiaDo",
  "LoCho",
  "BangThongKe",
  "VachChia",
  "NhanDot",
] as const;

/** Kiểu dời bản chép trong model space — bản TS của enum `KieuDatTang` (Core `Draw/FloorReplicator.cs`). */
export const KIEU_DAT_TANG = ["offsetY", "offsetX", "luoi"] as const;

/** Khối `drawTools.floorPolicy` nhìn từ validator (M111 §4). */
export type FloorPolicy = {
  enabled: boolean;
  floors: readonly string[];
  layoutMode: string;
  stepMm: number;
  gridColumns: number;
  zoneNamePattern: string;
  copyRoles: readonly string[];
};

/**
 * Validator tầng TS của `drawTools.floorPolicy` (M111 §4) — đôi của `FloorReplicator.Validate`
 * bên plugin .NET. Trả danh sách lỗi tiếng Việt; rỗng = hợp lệ.
 *
 * Khối đang TẮT vẫn kiểm: rule pack phát hành phải khai sẵn tham số dùng được ngay khi bật, đúng
 * quy ước của các khối chính sách v5–v9 (bật lên là chạy, không phải sửa rule pack thêm lần nữa).
 */
export function kiemFloorPolicy(fp: FloorPolicy): string[] {
  const loi: string[] = [];

  if (!(KIEU_DAT_TANG as readonly string[]).includes(fp.layoutMode)) {
    loi.push(
      `floorPolicy.layoutMode không hợp lệ: "${fp.layoutMode}" (chỉ nhận ${KIEU_DAT_TANG.map((k) => `"${k}"`).join(", ")}).`,
    );
  }
  if (fp.layoutMode === "luoi" && fp.gridColumns <= 0) {
    loi.push('floorPolicy.gridColumns phải dương khi layoutMode = "luoi".');
  }

  if (fp.floors.length === 0) {
    loi.push("floorPolicy.floors rỗng — không có tầng đích nào để chép.");
  }
  const trung = [...new Set(fp.floors.filter((t, i) => fp.floors.indexOf(t) !== i))];
  if (trung.length > 0) {
    loi.push(`floorPolicy.floors khai trùng nhãn tầng: ${trung.join(", ")}.`);
  }
  if (!(fp.stepMm > 0)) {
    loi.push(`floorPolicy.stepMm = ${fp.stepMm} phải dương — hai tầng sẽ chồng lên nhau.`);
  }
  if (!fp.zoneNamePattern.includes("{floor}")) {
    loi.push(
      `floorPolicy.zoneNamePattern "${fp.zoneNamePattern}" thiếu {floor} — mọi tầng ra cùng một tên vùng, sheet Tong-hop-vung gộp nhầm.`,
    );
  }
  if (fp.copyRoles.length === 0) {
    loi.push("floorPolicy.copyRoles rỗng — không vai trò nào được chép.");
  }
  for (const vaiTro of fp.copyRoles) {
    if (!(VAI_TRO_VE as readonly string[]).includes(vaiTro)) {
      loi.push(
        `floorPolicy.copyRoles["${vaiTro}"] không phải vai trò có thật trong VaiTroVe (hợp lệ: ${VAI_TRO_VE.join(", ")}).`,
      );
    }
  }
  return loi;
}

/** ETag mạnh theo hash nội dung — plugin cache cục bộ và hỏi lại bằng `If-None-Match`. */
export function getRulePackEtag(pack: CadRulePack = getCurrentRulePack()): string {
  const hash = createHash("sha256").update(JSON.stringify(pack)).digest("hex").slice(0, 32);
  return `"${pack.version}-${hash}"`;
}

/**
 * ETag cho bản rule pack đã gán mã BOQ THEO DỰ ÁN (M101 PR4).
 *
 * Tách khỏi `getRulePackEtag` thay vì băm luôn đối tượng đã gán: giữ nguyên từng byte ETag của
 * đường toàn cục (plugin đang cache theo nó — đổi là cả công ty tải lại vô cớ), đồng thời nhét
 * `projectId` vào để hai dự án tình cờ có map giống nhau vẫn không dùng lẫn bản cache của nhau.
 * `map` phải được sắp thứ tự ổn định (`layMapBoqTheoDuAn` sắp theo `takeoff_item_id`).
 */
export function getRulePackEtagChoDuAn(
  pack: { version: string },
  projectId: number,
  map: readonly { takeoffItemId: string; boqCode: string }[],
): string {
  const hash = createHash("sha256")
    .update(JSON.stringify([pack.version, projectId, map]))
    .digest("hex")
    .slice(0, 32);
  return `"${pack.version}-p${projectId}-${hash}"`;
}

/** So `If-None-Match` (có thể là danh sách, có thể có tiền tố W/) với ETag hiện tại. */
export function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const strip = (v: string) => v.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((v) => strip(v) === strip(etag) || v.trim() === "*");
}

/** Khối `drawTools.crossingPolicy` (M109 §5) — chính sách ngắt nét giao chéo. */
export type CrossingPolicy = {
  enabled: boolean;
  /** Hạng trình bày: id hệ đứng trước đi TRÊN. Id theo `drawTools.systems[].id`. */
  priority: readonly string[];
  gapMode?: string;
  clearanceMm: number;
  jogRadiusMm: number;
  layerSuffix: string;
  minAngleDeg: number;
};

/**
 * Kiểm khối `crossingPolicy` — tầng TS của validator 2 tầng (M109 §5; tầng C# là
 * `DrawToolsConfig.Validate`). Trả danh sách lỗi tiếng Việt, rỗng = hợp lệ.
 *
 * Rule pack cũ (v4–v9) không có khóa này → không lỗi: lệnh ngắt nét chỉ đơn giản không chạy được,
 * đúng luật "khóa mới mặc định không đổi hành vi".
 */
export function kiemCrossingPolicy(drawTools: {
  systems: readonly { id: string }[];
  crossingPolicy?: CrossingPolicy;
}): string[] {
  const cp = drawTools.crossingPolicy;
  if (!cp) return [];

  const loi: string[] = [];
  const heHopLe = new Set(drawTools.systems.map((s) => s.id));
  for (const id of cp.priority) {
    if (!heHopLe.has(id)) {
      loi.push(
        `drawTools.crossingPolicy.priority chứa id hệ lạ "${id}" — ` +
          `phải là drawTools.systems[].id (hợp lệ: ${[...heHopLe].join(", ")}).`,
      );
    }
  }

  for (const [ten, giaTri] of [
    ["clearanceMm", cp.clearanceMm],
    ["jogRadiusMm", cp.jogRadiusMm],
  ] as const) {
    if (!Number.isFinite(giaTri) || giaTri <= 0) {
      loi.push(`drawTools.crossingPolicy.${ten} = ${giaTri} phải là số dương.`);
    }
  }

  if (!Number.isFinite(cp.minAngleDeg) || cp.minAngleDeg <= 0 || cp.minAngleDeg > 90) {
    loi.push(
      `drawTools.crossingPolicy.minAngleDeg = ${cp.minAngleDeg} phải nằm trong khoảng (0; 90] — ` +
        "đây là ngưỡng lọc góc giao (0..90°), giá trị âm/NaN làm mọi góc đều bị coi là đủ lớn.",
    );
  }

  if (cp.gapMode && !["wipeout", "jog"].includes(cp.gapMode)) {
    loi.push(
      `drawTools.crossingPolicy.gapMode lạ "${cp.gapMode}" (chỉ nhận "wipeout" hoặc "jog").`,
    );
  }

  if (cp.enabled && !cp.layerSuffix.trim()) {
    loi.push(
      "drawTools.crossingPolicy.layerSuffix trống trong khi enabled = true — " +
        "đối tượng ngắt nét sẽ rơi vào chính layer tim và lệnh xóa không lọc lại được.",
    );
  }
  return loi;
}

/** Khối `drawTools.routingPolicy` (M114 §6) — chính sách đi tuyến tự động theo đồ thị hành lang. */
export type RoutingPolicy = {
  enabled: boolean;
  corridorLayer: string;
  /** Bán kính tối đa từ thiết bị tới hành lang gần nhất để rẽ nhánh (mm). */
  snapRadiusMm: number;
  cost: { elbowMm: number; congestionMm: number; reuseFactor: number };
  /** Phân tầng theo hệ — id hệ theo `drawTools.systems[].id`, một hệ chỉ ở đúng một tier. */
  tiers: readonly {
    id: string;
    name: string;
    systems: readonly string[];
    offsetFromBeamMm?: number;
    offsetFromCeilingMm?: number;
  }[];
  laneGapMm: { default: number; elecToHot: number };
  /** Thứ tự chạy mặc định giữa các hệ — id theo `drawTools.systems[].id`. */
  systemOrder: readonly string[];
};

/**
 * Kiểm khối `routingPolicy` — tầng TS của validator 2 tầng (M114 §6; tầng C# là
 * `DrawToolsConfig.ValidateRoutingPolicy`). Trả danh sách lỗi tiếng Việt, rỗng = hợp lệ.
 *
 * Rule pack cũ (≤ v14) không có khóa này → không lỗi: 2 lệnh đi tuyến chỉ đơn giản không chạy
 * được, đúng luật "khóa mới mặc định không đổi hành vi".
 */
export function kiemRoutingPolicy(drawTools: {
  systems: readonly { id: string }[];
  routingPolicy?: RoutingPolicy;
}): string[] {
  const rp = drawTools.routingPolicy;
  if (!rp) return [];

  const loi: string[] = [];
  const heHopLe = new Set(drawTools.systems.map((s) => s.id));

  if (!Number.isFinite(rp.snapRadiusMm) || rp.snapRadiusMm <= 0) {
    loi.push(
      `drawTools.routingPolicy.snapRadiusMm = ${rp.snapRadiusMm} phải là số dương — ` +
        "bán kính ≤ 0 làm mọi thiết bị đều rơi vào danh sách không giải được.",
    );
  }

  const { elbowMm, congestionMm, reuseFactor } = rp.cost;
  if (!Number.isFinite(reuseFactor) || reuseFactor <= 0 || reuseFactor > 1) {
    loi.push(
      `drawTools.routingPolicy.cost.reuseFactor = ${reuseFactor} phải nằm trong khoảng (0; 1] — ` +
        "> 1 là phạt (chống gom trục), ≤ 0 làm cạnh dùng lại thành miễn phí/âm giá.",
    );
  }
  for (const [ten, giaTri] of [
    ["elbowMm", elbowMm],
    ["congestionMm", congestionMm],
  ] as const) {
    if (!Number.isFinite(giaTri) || giaTri < 0) {
      loi.push(`drawTools.routingPolicy.cost.${ten} = ${giaTri} không được âm.`);
    }
  }

  // Id hệ trong tiers/systemOrder phải có thật — khai lệch thì hệ đó lặng lẽ không được cấp tầng
  // (hoặc không bao giờ tới lượt chạy), không ai biết.
  const tierCuaHe = new Map<string, string>();
  for (const tier of rp.tiers) {
    for (const heId of tier.systems) {
      if (!heHopLe.has(heId)) {
        loi.push(
          `drawTools.routingPolicy.tiers["${tier.id}"] chứa id hệ lạ "${heId}" — ` +
            `phải là drawTools.systems[].id (hợp lệ: ${[...heHopLe].join(", ")}).`,
        );
        continue;
      }
      const daCo = tierCuaHe.get(heId);
      if (daCo) {
        loi.push(
          `drawTools.routingPolicy: hệ "${heId}" nằm ở 2 tier ("${daCo}" và "${tier.id}") — ` +
            "cấp tầng sẽ phụ thuộc thứ tự duyệt, hai tầng C#/TS trôi khỏi nhau.",
        );
      } else {
        tierCuaHe.set(heId, tier.id);
      }
    }
  }
  for (const heId of rp.systemOrder) {
    if (!heHopLe.has(heId)) {
      loi.push(
        `drawTools.routingPolicy.systemOrder chứa id hệ lạ "${heId}" — ` +
          `phải là drawTools.systems[].id (hợp lệ: ${[...heHopLe].join(", ")}).`,
      );
    }
  }

  for (const [ten, giaTri] of [
    ["default", rp.laneGapMm.default],
    ["elecToHot", rp.laneGapMm.elecToHot],
  ] as const) {
    if (!Number.isFinite(giaTri) || giaTri <= 0) {
      loi.push(`drawTools.routingPolicy.laneGapMm.${ten} = ${giaTri} phải là số dương.`);
    }
  }

  if (rp.enabled && !rp.corridorLayer.trim()) {
    loi.push(
      "drawTools.routingPolicy.corridorLayer trống trong khi enabled = true — " +
        "hành lang sẽ lẫn vào layer tuyến và lệnh đi tuyến không lọc lại được.",
    );
  }
  return loi;
}

/**
 * 8 giai đoạn của lệnh `XBOSS_HOANTHIEN` (M115 §6 bước 5) — THỨ TỰ ở đây là thứ tự chạy khóa cứng,
 * không phải danh sách tự do. Bản TS của `CompletionPolicySection.TenGiaiDoan` bên plugin .NET.
 */
export const GIAI_DOAN_HOAN_THIEN = [
  "netDoi",
  "phuKienTaiNut",
  "chiaDot",
  "giaDo",
  "loCho",
  "ngatNet",
  "tag",
  "thongKe",
] as const;

/** Loại nút có bảng luật chọn phụ kiện (M115 §6 bước 3) — bản TS của enum `LoaiNutPhuKien`. */
export const LOAI_NUT_PHU_KIEN = ["co", "cut", "te", "giam"] as const;

/** Một dòng bảng chọn phụ kiện tại nút — `drawTools.completionPolicy.fittingRules[]`. */
export type FittingRule = {
  /** Id hệ theo `drawTools.systems[].id`. */
  systemId: string;
  /** `co` | `cut` | `te` | `giam`. */
  nodeKind: string;
  /** Ngưỡng cỡ: cạnh lớn max(W,H) hoặc số DN; `null` = bắt hết mọi cỡ. */
  maxSizeMm: number | null;
  minAngleDeg: number;
  maxAngleDeg: number;
  /** Id block trong `drawTools.systems[].fittings` của ĐÚNG hệ đó. */
  blockId: string;
  /** `kind` của block trong manifest thư viện — chỉ nhận `fitting`. */
  blockKind: string;
  name: string;
};

/** Khối `drawTools.completionPolicy` (M115 §7 FR5) — chính sách hoàn thiện bản vẽ từ tuyến tim. */
export type CompletionPolicy = {
  enabled: boolean;
  nodeToleranceMm: number;
  equipmentSnapMm: number;
  elevationToleranceMm: number;
  minTurnAngleDeg: number;
  fittingRules: readonly FittingRule[];
  stageDefaults: Readonly<Record<string, boolean>>;
};

/**
 * Kiểm khối `completionPolicy` — tầng TS của validator 2 tầng (M115 §7 FR5; tầng C# là
 * `CompletionPolicyConfig.Validate` trong `plugin-autocad/XBoss.Cad.Core/Draw/CompletionPolicy.cs`).
 * Trả danh sách lỗi tiếng Việt, rỗng = hợp lệ.
 *
 * Rule pack cũ (≤ v15) không có khóa này → không lỗi: 2 lệnh mới chỉ đơn giản không chạy được,
 * đúng luật "khóa mới mặc định không đổi hành vi".
 *
 * Khối đang TẮT vẫn kiểm đầy đủ: rule pack phát hành phải khai sẵn tham số dùng được ngay khi bật
 * (cùng quy ước các khối chính sách v5–v15).
 */
export function kiemCompletionPolicy(drawTools: {
  systems: readonly { id: string; fittings?: readonly string[] }[];
  completionPolicy?: CompletionPolicy;
}): string[] {
  const cp = drawTools.completionPolicy;
  if (!cp) return [];

  const loi: string[] = [];
  const G = "drawTools.completionPolicy";
  const phuKienCuaHe = new Map(drawTools.systems.map((s) => [s.id, new Set(s.fittings ?? [])]));

  for (const [ten, giaTri] of [
    ["nodeToleranceMm", cp.nodeToleranceMm],
    ["equipmentSnapMm", cp.equipmentSnapMm],
  ] as const) {
    if (!Number.isFinite(giaTri) || giaTri <= 0) {
      loi.push(`${G}.${ten} = ${giaTri} phải là số dương.`);
    }
  }
  // Tâm block thiết bị luôn lùi vào trong thân máy nên bán kính chạm phải rộng hơn dung sai gộp nút;
  // ngược lại thì mọi đầu tuyến vào thiết bị đều bị báo là tuyến hở.
  if (
    Number.isFinite(cp.equipmentSnapMm) &&
    Number.isFinite(cp.nodeToleranceMm) &&
    cp.equipmentSnapMm < cp.nodeToleranceMm
  ) {
    loi.push(
      `${G}.equipmentSnapMm = ${cp.equipmentSnapMm} nhỏ hơn nodeToleranceMm = ${cp.nodeToleranceMm} — ` +
        "đầu tuyến đã gộp vào nút rồi mà vẫn ngoài bán kính chạm thiết bị, mọi kết nối thiết bị sẽ bị báo là tuyến hở.",
    );
  }
  if (!Number.isFinite(cp.elevationToleranceMm) || cp.elevationToleranceMm < 0) {
    loi.push(`${G}.elevationToleranceMm = ${cp.elevationToleranceMm} không được âm.`);
  }
  if (!Number.isFinite(cp.minTurnAngleDeg) || cp.minTurnAngleDeg <= 0 || cp.minTurnAngleDeg > 90) {
    loi.push(
      `${G}.minTurnAngleDeg = ${cp.minTurnAngleDeg} phải nằm trong khoảng (0; 90] — ` +
        "đây là ngưỡng coi tuyến là thẳng, giá trị âm/NaN làm mọi đỉnh đều thành một cái co.",
    );
  }

  // ===== fittingRules =====
  // Khóa gom dải để bắt chồng lấn: cùng hệ + cùng loại nút + cùng ngưỡng cỡ thì 2 khoảng góc
  // không được đè nhau (first-match làm luật đứng sau chết mà không ai biết).
  const daiTheoKhoa = new Map<string, { min: number; max: number; ten: string }[]>();
  for (const [i, r] of cp.fittingRules.entries()) {
    const nhan = `${G}.fittingRules[${i}] ("${r.name || r.blockId}")`;

    if (!phuKienCuaHe.has(r.systemId)) {
      loi.push(
        `${nhan}: systemId lạ "${r.systemId}" — phải là drawTools.systems[].id ` +
          `(hợp lệ: ${[...phuKienCuaHe.keys()].join(", ")}).`,
      );
    } else if (!phuKienCuaHe.get(r.systemId)!.has(r.blockId)) {
      loi.push(
        `${nhan}: blockId "${r.blockId}" không có trong fittings của hệ "${r.systemId}" — ` +
          "id phụ kiện đã trôi khỏi drawTools.systems[].fittings.",
      );
    }
    if (!(LOAI_NUT_PHU_KIEN as readonly string[]).includes(r.nodeKind)) {
      loi.push(
        `${nhan}: nodeKind lạ "${r.nodeKind}" (chỉ nhận ${LOAI_NUT_PHU_KIEN.map((k) => `"${k}"`).join(", ")}).`,
      );
    }
    if (r.blockKind !== "fitting") {
      loi.push(
        `${nhan}: blockKind "${r.blockKind}" — phụ kiện tại nút chỉ nhận kind "fitting" ` +
          "(equipment/titleblock/annotation không bao giờ là phụ kiện tại nút).",
      );
    }
    if (!r.name.trim()) {
      loi.push(`${nhan}: name trống — bảng thống kê/danh sách duyệt ở bước 4 sẽ không đọc được.`);
    }
    if (r.maxSizeMm !== null && (!Number.isFinite(r.maxSizeMm) || r.maxSizeMm <= 0)) {
      loi.push(`${nhan}: maxSizeMm = ${r.maxSizeMm} phải dương hoặc null (bắt hết mọi cỡ).`);
    }

    const gocHopLe =
      Number.isFinite(r.minAngleDeg) &&
      Number.isFinite(r.maxAngleDeg) &&
      r.minAngleDeg >= 0 &&
      r.minAngleDeg < r.maxAngleDeg &&
      r.maxAngleDeg <= 180;
    if (!gocHopLe) {
      loi.push(
        `${nhan}: khoảng góc [${r.minAngleDeg}; ${r.maxAngleDeg}) không hợp lệ — ` +
          "phải có 0 ≤ minAngleDeg < maxAngleDeg ≤ 180.",
      );
      continue;
    }
    if ((r.nodeKind === "co" || r.nodeKind === "cut") && r.maxAngleDeg <= cp.minTurnAngleDeg) {
      loi.push(
        `${nhan}: maxAngleDeg = ${r.maxAngleDeg} không lớn hơn minTurnAngleDeg = ${cp.minTurnAngleDeg} — ` +
          "mọi góc trong dải này đã bị coi là tuyến thẳng nên luật không bao giờ được xét.",
      );
    }

    const khoa = `${r.systemId}|${r.nodeKind}|${r.maxSizeMm ?? "*"}`;
    const dai = daiTheoKhoa.get(khoa) ?? [];
    const de = dai.find((d) => d.min < r.maxAngleDeg && r.minAngleDeg < d.max);
    if (de) {
      loi.push(
        `${nhan}: khoảng góc [${r.minAngleDeg}; ${r.maxAngleDeg}) chồng lấn "${de.ten}" ` +
          `([${de.min}; ${de.max}), cùng hệ "${r.systemId}", cùng loại nút "${r.nodeKind}", cùng ngưỡng cỡ) — ` +
          "first-match làm luật đứng sau không bao giờ được chọn.",
      );
    } else {
      dai.push({ min: r.minAngleDeg, max: r.maxAngleDeg, ten: r.name || r.blockId });
      daiTheoKhoa.set(khoa, dai);
    }
  }

  // ===== stageDefaults — phải khai ĐỦ 8 khóa, không thiếu không thừa =====
  const khoaDaKhai = Object.keys(cp.stageDefaults);
  const thieu = GIAI_DOAN_HOAN_THIEN.filter((g) => !khoaDaKhai.includes(g));
  const thua = khoaDaKhai.filter((k) => !(GIAI_DOAN_HOAN_THIEN as readonly string[]).includes(k));
  if (thieu.length > 0) {
    loi.push(
      `${G}.stageDefaults thiếu giai đoạn: ${thieu.join(", ")} — ` +
        "giai đoạn không khai sẽ lặng lẽ mặc định tắt và không ai biết.",
    );
  }
  if (thua.length > 0) {
    loi.push(
      `${G}.stageDefaults khai giai đoạn lạ: ${thua.join(", ")} ` +
        `(chỉ nhận ${GIAI_DOAN_HOAN_THIEN.join(", ")}).`,
    );
  }
  for (const [khoa, giaTri] of Object.entries(cp.stageDefaults)) {
    if (typeof giaTri !== "boolean") {
      loi.push(`${G}.stageDefaults.${khoa} = ${giaTri} phải là true/false.`);
    }
  }
  if (cp.enabled && !Object.values(cp.stageDefaults).some((v) => v === true)) {
    loi.push(
      `${G}.enabled = true nhưng cả 8 giai đoạn đều tắt — ` +
        "XBOSS_HOANTHIEN sẽ chạy xong mà không làm gì.",
    );
  }
  return loi;
}

// ===== rule-pack-revision.ts =====

// lib/ky-thuat/cad/rule-pack.ts — Validator khóa `drawTools.revisionPolicy` (M110 §5)
/**
 * Tầng TS của "validator 2 tầng": cùng bộ luật với `RevisionPolicyConfig.Validate()` bên plugin
 * (`plugin-autocad/XBoss.Cad.Core/Draw/DrawToolsConfig.cs`). Rule pack sai ở đây thì phải chặn từ
 * lúc phát hành, đừng để kỹ sư phát hiện khi đứng trước AutoCAD (ADR-0006 nguyên tắc 1).
 *
 * Hàm thuần, không chạm DB/HTTP — dùng được cả ở test lẫn ở đường phát hành rule pack.
 */

/** Khối `drawTools.revisionPolicy` của rule pack (v12 trở đi). */
export type RevisionPolicy = {
  enabled: boolean;
  cloudArcMm: number;
  layer: string;
  triangleBlockId: string;
  numberFormat: string;
  titleblockAttrPattern: { so: string; ngay: string; noiDung: string; nguoi: string };
  maxRows: number;
  boundingPaddingMm: number;
};

/** Chỗ giữ số revision trong mọi mẫu chuỗi của khối này. */
export const O_TRONG_SO_REVISION = "{n}";

/**
 * Kiểm khối `revisionPolicy`; trả danh sách lỗi tiếng Việt (rỗng = hợp lệ).
 * `undefined` = rule pack cũ (≤ v9) không khai khối này — hợp lệ, 3 lệnh revision tự từ chối chạy.
 */
export function kiemTraRevisionPolicy(policy: RevisionPolicy | undefined): string[] {
  if (!policy) return [];
  const loi: string[] = [];

  if (!(policy.cloudArcMm > 0)) {
    loi.push(`drawTools.revisionPolicy.cloudArcMm = ${policy.cloudArcMm} phải dương.`);
  }
  if (!policy.numberFormat.includes(O_TRONG_SO_REVISION)) {
    loi.push(
      `drawTools.revisionPolicy.numberFormat "${policy.numberFormat}" thiếu ${O_TRONG_SO_REVISION} — ` +
        "mọi revision sẽ mang cùng một số.",
    );
  }
  if (policy.enabled && policy.triangleBlockId.trim() === "") {
    loi.push(
      "drawTools.revisionPolicy.triangleBlockId trống trong khi khối đang bật — " +
        "không biết chèn block tam giác nào.",
    );
  }
  if (!Number.isInteger(policy.maxRows) || policy.maxRows < 1) {
    loi.push(`drawTools.revisionPolicy.maxRows = ${policy.maxRows} phải là số nguyên ≥ 1.`);
  }
  if (policy.layer.trim() === "") {
    loi.push("drawTools.revisionPolicy.layer trống — không biết đặt cloud lên layer nào.");
  }
  if (policy.boundingPaddingMm < 0) {
    loi.push(
      `drawTools.revisionPolicy.boundingPaddingMm = ${policy.boundingPaddingMm} không được âm.`,
    );
  }
  const mau = policy.titleblockAttrPattern;
  for (const [khoa, giaTri] of Object.entries(mau) as [keyof typeof mau, string][]) {
    if (giaTri.trim() === "") {
      loi.push(`drawTools.revisionPolicy.titleblockAttrPattern.${khoa} trống.`);
      continue;
    }
    if (!giaTri.includes(O_TRONG_SO_REVISION)) {
      loi.push(
        `drawTools.revisionPolicy.titleblockAttrPattern.${khoa} "${giaTri}" thiếu ` +
          `${O_TRONG_SO_REVISION} — mọi dòng revision sẽ ghi đè lên cùng một attribute.`,
      );
    }
  }
  return loi;
}

/** Số revision theo `numberFormat` (vd `R{n}` + 2 → `R2`). */
export function soRevisionTheoMau(numberFormat: string, n: number): string {
  return numberFormat.split(O_TRONG_SO_REVISION).join(String(n));
}
