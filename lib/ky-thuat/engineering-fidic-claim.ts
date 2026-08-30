// lib/ky-thuat/engineering-fidic-claim.ts — Facade cho bộ FIDIC Claims & TIA hợp nhất (M79 + M94).
// Toàn bộ logic nằm ở lib/tai-chinh/contracts-fidic.ts; file này chỉ mở cửa cho tầng ky-thuat.
// (Trước đây tách làm hai facade engineering-fidic-claim + engineering-fidic-tia-claim cùng trỏ
// về một module — đã gộp lại làm một.)
export {
  type FidicContractBook,
  type DelayEventType,
  type FidicClauseMappingResult,
  mapDelayEventToFidicClause,
  type NoticeComplianceResult,
  checkNoticeCompliance,
  type DelayFragnetEvent,
  type TimeImpactAnalysisResult,
  calculateTimeImpactAnalysis,
  generateFidicClaimDossier,
  createFidicClaim,
  listFidicClaims,
  // — Time Impact Analysis (M94), trước ở engineering-fidic-tia-claim.ts —
  type FidicTiaInput,
  type FidicTiaResult,
  analyzeFidicTiaClaim,
  saveFidicTiaClaim,
  listFidicTiaClaims,
} from "@/lib/tai-chinh/contracts-fidic";
