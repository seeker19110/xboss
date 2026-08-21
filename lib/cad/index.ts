// lib/cad/index.ts — Unified CAD/BIM & DfMA Engine Facade (Apex Consolidation)
/**
 * @file Unified entry point for all CAD/BIM, MEPF Engineering, DfMA Spooling,
 * Multi-Tier Corridor, Hydraulic Networks, Fabrication Nesting and Carbon LCA engines.
 */

// 1. Cognitive CAD Skills: Vector Diffing, AutoLISP Generation, Font Repair, Layer Normalization
export * from "@/lib/engineering-cad-skills";

// 2. Closed-Loop CAD-QTO Tracking, Milestone Weights & BBNT Generation
export * from "@/lib/engineering-cad-qto";

// 3. Fabrication Nesting 1D/2D, Hydraulics & Velocity Limits
export * from "@/lib/engineering-cad-nesting";

// 4. Generative Multi-Tier Corridor Planner & Trapeze Structural Engine
export * from "@/lib/engineering-cad-corridor";

// 5. DfMA Spool LOD 400, Axonometric Isometric Projector & Bubble Tags
export * from "@/lib/engineering-cad-dfma-isometric";

// 6. Hydraulic & Airflow Network Flow Graph & Auto-sizing Engine
export * from "@/lib/engineering-cad-hydraulic-network";

// 7. 6D Embodied Carbon Footprint LCA & 7D Asset Living Digital Twin
export * from "@/lib/engineering-cad-carbon-lifecycle";
