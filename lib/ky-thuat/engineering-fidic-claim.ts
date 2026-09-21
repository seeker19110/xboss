// lib/ky-thuat/engineering-fidic-claim.ts — Facade cho FIDIC TIA Claim Engine (M94).
// Toàn bộ logic nằm ở lib/tai-chinh/contracts-fidic.ts; file này chỉ mở cửa cho tầng ky-thuat.
// (Nhóm FIDIC Claims Dossier cũ (M79) đã bị xoá cùng route/UI /engineering/fidic-claims —
// trước đây tách làm hai facade engineering-fidic-claim + engineering-fidic-tia-claim cùng trỏ
// về một module, đã gộp lại làm một rồi chỉ còn phần TIA.)
export {
  type FidicTiaInput,
  type FidicTiaResult,
  analyzeFidicTiaClaim,
  saveFidicTiaClaim,
  listFidicTiaClaims,
} from "@/lib/tai-chinh/contracts-fidic";
