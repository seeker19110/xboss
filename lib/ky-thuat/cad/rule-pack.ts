// lib/cad/rule-pack.ts — Nguồn quy tắc chuẩn hóa CAD duy nhất (M99 PR1)
/**
 * Rule pack là "một nguồn quy tắc" cho cả tầng web (TypeScript) lẫn plugin AutoCAD .NET:
 * plugin tải về qua GET /api/engineering/cad/rule-pack rồi áp đúng bộ quy tắc đó, nên
 * hai tầng không trôi khỏi nhau (ADR-0006 nguyên tắc 1).
 *
 * Đổi quy tắc = thêm tệp version mới trong `lib/cad/rule-packs/`, KHÔNG sửa version đã
 * phát hành (cùng triết lý append-only của migration).
 */
import { createHash } from "node:crypto";
import { RULE_PACK_HIEN_HANH, type CadRulePack } from "@/lib/ky-thuat/cad/rule-pack-hien-hanh";

export type { CadRulePack };

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
 * v10 = v9 + khối `drawTools.crossingPolicy` — chính sách ngắt nét giao chéo của lệnh
 * `XBOSS_VE_NGATNET` (M109 §5): hạng ưu tiên trình bày giữa các hệ (id theo `systems[].id`), bề
 * rộng vùng che, bán kính cầu vượt, hậu tố layer đối tượng ngắt nét, ngưỡng góc giao. Mở rộng
 * thuần và `enabled: false` mặc định nên mọi lệnh cũ chạy với v10 cho kết quả y hệt v9.
 */
export function getCurrentRulePack(): CadRulePack {
  return RULE_PACK_HIEN_HANH;
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

  if (cp.enabled && !cp.layerSuffix.trim()) {
    loi.push(
      "drawTools.crossingPolicy.layerSuffix trống trong khi enabled = true — " +
        "đối tượng ngắt nét sẽ rơi vào chính layer tim và lệnh xóa không lọc lại được.",
    );
  }
  return loi;
}
