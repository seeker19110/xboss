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
 * v12 = v9 + khối `drawTools.floorPolicy` cho lệnh nhân bản tầng điển hình `XBOSS_VE_NHANTANG`
 * (M111 §4): danh sách nhãn tầng, kiểu dời + bước dời, mẫu tên vùng bóc của bản chép, danh sách vai
 * trò được chép. Mở rộng thuần (mọi khóa cũ giữ nguyên từng byte) và `enabled: false` mặc định nên
 * v12 cho kết quả y hệt v9; lệnh nhân tầng từ chối chạy tới khi công ty bật khóa này (M111 AC12).
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
