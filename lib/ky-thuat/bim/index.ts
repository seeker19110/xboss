// lib/bim/index.ts — Unified BIM (Building Information Modeling) Engine Facade (Apex Consolidation)
/**
 * @file Unified entry point for all 3D/4D/5D BIM Viewers, AI Auto-Routing,
 * Spatial Clash Detection, openBIM BCF 3.0, LiDAR Scan-to-BIM and God-Tier Spatial engines.
 */

// 1. 3D BIM/IFC Web Viewer & 4D Construction Simulation Studio
export {
  type Point3D,
  type BoundingBox3D,
  type MeshGeometry3D,
  type BimElementProperties,
  type BimElement,
  type BimModel,
  type Element4DVisualStatus,
  type Element4DState,
  type SimulationTimeStepResult,
  SYSTEM_DEFAULT_COLORS,
  STATUS_4D_COLORS,
  generateParametricMepfMesh,
  type WbsTaskSnapshot,
  compute4DSimulationState,
  type SectionPlane,
  compute3DSectionCut,
  calculateModelBoundingBox,
  filterElementsPropertySet,
  type BimSimulationRecord,
  save4dSimulation,
  load4dSimulation,
  list4dSimulations,
  listBimModels,
  listBimElements,
} from "@/lib/ky-thuat/engineering-bim-viewer";

// 2. AI Automated 3D Multi-Trade Auto-Routing & Beam Sleeve Clash Solver
export {
  type BoundingObstacle,
  type BeamSleeveInput,
  type SleeveValidationResult,
  type AutoRouteResult,
  TRADE_HIERARCHY,
  validateBeamSleeve,
  findOptimalRoute3D,
  recommendClashResolution,
  createSleeveSchedule,
  listSleeveSchedules,
} from "@/lib/ky-thuat/engineering-auto-routing";

// 3. Spatial Grid Clash Solver, openBIM BCF Issues & Route Pathfinding
export {
  type Camera3DViewpoint,
  type BcfIssueRecord,
  type CreateBcfIssueInput,
  createBcfIssue,
  listBcfIssues,
  resolveBcfIssue,
  detectClashesWithSpatialGrid,
  type RoutingPoint3D,
  type RoutingConstraint,
  type AutoRoutingResult as BimAutoRoutingResult,
  findRoutePath3D,
  type BimRoutingRunRecord,
  saveRoutingRun,
  listRoutingRuns,
} from "@/lib/ky-thuat/engineering-bim-routing";

// 4. BIM 5D QTO, AABB Intersections & Spatial Clash Solvers
export {
  type BimDiscipline,
  type BimFileFormat,
  type ClashType,
  type ClashSeverity,
  type ClashStatus,
  type BimElementRecord,
  type SpatialClashRecord,
  type ClashRerouteOption,
  type ClashRerouteSolution,
  type QtoSummaryItem,
  checkAabbIntersection,
  get4DStatusColor,
  generateClashRerouteSolution,
  computeElementQto,
  detectSpatialClashesForElements,
} from "@/lib/ky-thuat/engineering-bim-cad";

// 5. LiDAR Scan-to-BIM, RANSAC 3D Cylinder Fitting & As-Built Stamping
export {
  type ScannedPoint3D,
  type BimSpoolModel,
  type DeviationItem,
  type ScanToBimResult,
  type RansacCylinderResult,
  type AsBuiltRedlineStampResult,
  findNearestScannedPoint,
  fitCylinderRansac,
  analyzeScanVsBimDeviations,
  generateAsBuiltRedlineAndStamp,
  closedLoopSyncSpoolToWbs,
  saveScanToBimRun,
  listScanToBimRuns,
} from "@/lib/ky-thuat/engineering-scan-to-bim";

// 6. Apex God-Tier BIM/CAD Super-Intelligence & Merkle Ledger
export {
  sha256Pure,
  type GodTierModelRecord,
  type GodTierClashRecord,
  type GodTierRerouteSolution,
  type InstancedMeshGroup,
  type GodTierElementData,
  generateInstancedMeshGroups,
  checkAabbOverlap,
  detectGodTierClashes,
  type GodTier4DState,
  calculateGodTier4DSimulation,
  calculateMerkleRootHex,
  generateAsBuiltStamp,
  type PointCloudPoint,
  type PointCloudDeviationResult,
  analyzePointCloudDeviation,
  type BcfTopic,
  createBcfTopicFromClash,
  type CncGCodeResult,
  generateCncGCodeForDuct,
  type PipeSpoolCutItem,
  generatePipeSpoolCutList,
} from "@/lib/ky-thuat/engineering-god-tier";
