// lib/ky-thuat/cad/rule-pack-hien-hanh.ts — Rule pack ĐANG PHÁT HÀNH (dữ liệu thuần)
/**
 * Tách khỏi `rule-pack.ts` vì tệp đó dùng `node:crypto` (tính ETag) nên không nạp được trong
 * bundle trình duyệt, trong khi `dxf-parser.ts` — chạy cả ở client (trang chuẩn hóa bản vẽ) —
 * cần đọc danh sách layer đích của rule pack để ánh xạ layer cho idempotent.
 *
 * Phát hành version mới = đổi ĐÚNG một dòng `import` ở đây (append-only: không sửa tệp version cũ).
 */
import rulePackV8 from "@/lib/ky-thuat/cad/rule-packs/v8.json";

export type CadRulePack = typeof rulePackV8;

/** Rule pack đang phát hành cho plugin — mô tả từng version xem `getCurrentRulePack()`. */
export const RULE_PACK_HIEN_HANH = rulePackV8;
