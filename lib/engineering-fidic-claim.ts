// lib/engineering-fidic-claim.ts — Facade for Unified FIDIC Claims & TIA Engine (M79)
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
} from "./contracts-fidic";
