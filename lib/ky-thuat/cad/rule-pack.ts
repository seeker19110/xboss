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
 * v7 = v6 + 3 khối chính sách cho 4 bước chuẩn hóa mới của XBOSS_CHUANHOA (M101 §6.2 bước 8–11):
 * xrefPolicy, hatchMap, layoutPolicy. Bước 8 (style map) dùng lại khối styleMap đã có từ v5 nên
 * KHÔNG khai trùng. Cả 3 khối mới `enabled: false` → chuẩn hóa bằng v7 cho kết quả y hệt v6.
 */
export function getCurrentRulePack(): CadRulePack {
  return RULE_PACK_HIEN_HANH;
}

/** ETag mạnh theo hash nội dung — plugin cache cục bộ và hỏi lại bằng `If-None-Match`. */
export function getRulePackEtag(pack: CadRulePack = getCurrentRulePack()): string {
  const hash = createHash("sha256").update(JSON.stringify(pack)).digest("hex").slice(0, 32);
  return `"${pack.version}-${hash}"`;
}

/** So `If-None-Match` (có thể là danh sách, có thể có tiền tố W/) với ETag hiện tại. */
export function matchesEtag(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const strip = (v: string) => v.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((v) => strip(v) === strip(etag) || v.trim() === "*");
}
