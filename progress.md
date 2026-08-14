# XBOSS Progress — Engineering OS

## Product decision
- [x] Product name: **XBoss**
- [x] Positioning: **AI-Native Construction & Engineering Operating System**
- [x] Engineering intelligence source: former `MEP-Agents` capability set
- [x] Fallback brand reserved: **ForgeOS** (do not use as current repository/product name)
- [x] Consolidation strategy approved: **architecture first → shared contracts → gradual code integration → monorepo only when boundaries are proven**

## Approved baseline
- [x] M0–M42 existing XBoss foundation retained
- [x] Strategic direction: Project OS → Engineering OS → Digital Twin → Controlled Autonomy
- [x] Master roadmap approved
- [x] Unified product architecture approved

## Integration rules
- XBoss Project Kernel is the canonical project/source-of-truth boundary.
- Engineering capabilities must map into the canonical Engineering Object Model; no parallel project identity or duplicate domain truth.
- Deterministic engineering engines own measurements/calculations; AI agents explain, orchestrate, recommend and act only through approved tools/workflows.
- Existing M0–M42 behavior is protected by regression tests and migration adapters.
- Prefer strangler migration: adapter → canonical write → backfill → verification → read cutover → legacy removal.
- Do not perform a big-bang repository/database merge.
- Do not delete legacy code/data until an explicit replacement, migration, regression coverage and rollback path exist.

## Repository consolidation plan
- [x] Stage A defined: keep repositories separate while defining canonical contracts
- [x] Stage A: audit former MEP-Agents components into KEEP / ADAPT / REWRITE / DEPRECATE / EXTERNALIZE
- [x] Stage A: define canonical MEP/CAD/BIM/QTO → Engineering Object mapping contract
- [ ] Stage A: implement M43 Project Kernel
- [ ] Stage A: implement M44 Provenance
- [ ] Stage A: implement M45 Domain Events
- [ ] Stage A: implement M46 Deterministic Engineering Engine
- [ ] Stage B: extract shared packages/contracts
- [ ] Stage B: integrate CAD/BIM/geometry/quantity/document intelligence through XBoss APIs and domain services
- [ ] Stage B: migrate AI agents to the XBoss Agent Fabric
- [ ] Stage B: remove duplicate project/auth/audit/domain persistence from engineering services
- [ ] Stage C: establish monorepo boundaries only after integration contracts are stable
- [ ] Stage C: move validated engineering packages/services into the XBoss monorepo
- [ ] Stage C: archive/decommission the former MEP-Agents repository only after final migration verification

## MEP-Agents audit result
**Stage A audit + canonical mapping are complete.** The source repository is Python/LangGraph/Streamlit and contains reusable deterministic MEPF engineering, CAD, BIM, QS/BOQ-diff, revision and multi-agent capabilities. The detailed audit is in `docs/integration/MEP_AGENTS_AUDIT.md`; the mapping contract is in `docs/integration/CANONICAL_ENGINEERING_MAPPING.md`.

Key architectural decision: **do not copy the MEP-Agents project model, authentication or persistence into XBoss.** Keep specialist Python engineering workers where useful, but integrate them through typed XBoss contracts and canonical Engineering Objects. XBoss remains the owner of identity, project, BOQ, cost, procurement, contract, audit and lifecycle truth.

### Initial capability classification
- **KEEP:** deterministic HVAC/electrical/plumbing/firefighting calculations, BIM/clash, CAD geometry/loading/revision, selected BOQ/QS algorithms, engineering reference data after provenance review, AutoCAD interoperability.
- **ADAPT:** LangGraph agent orchestration, engineering API, QS/BOQ mapping, CAD/BIM services, standards/RAG, usage/cost tracking.
- **REWRITE:** standalone project/session persistence, standalone auth/authorization, direct AI mutation of business truth, duplicate canonical domain models, Streamlit production UI.
- **DEPRECATE:** phase patch modules and superseded compatibility entry points after behavior is covered by regression tests.
- **EXTERNALIZE:** heavy CAD/BIM/GPU workloads and vendor-specific model clients where independent scaling or isolation is beneficial.

## New milestones
- [ ] M43 Project Kernel
- [ ] M44 Provenance
- [ ] M45 Domain Events
- [ ] M46 Deterministic Engineering Engine
- [ ] M47 Knowledge Graph
- [ ] M48 AI Agent Fabric
- [ ] M49 Document/CAD/BIM Intelligence
- [ ] M50 Digital Twin
- [ ] M51 Predictive OS
- [ ] M52 Workflow + Human-in-the-loop
- [ ] M53 Controlled Autonomy

## Current milestone: M43
Status: **SPECIFIED — READY FOR IMPLEMENTATION**

### M43 deliverables
- [ ] engineering_objects migration
- [ ] engineering_object_relations migration
- [ ] engineering_sources migration
- [ ] engineering_object_sources migration
- [ ] engineering_revisions migration
- [ ] object/relation registry
- [ ] canonical domain types
- [ ] application services
- [ ] existing-domain adapters
- [ ] `/api/v2/engineering/*` API
- [ ] audit/event integration
- [ ] integration tests
- [ ] project isolation tests
- [ ] generated ERD update
- [ ] documentation update

## Immediate integration work after M43
1. Implement the canonical engineering object layer.
2. Build an adapter/service boundary rather than importing a second project model/database.
3. Connect one vertical slice end-to-end: **Drawing → Engineering Objects → Quantity → BOQ → Cost impact**.
4. Add golden-project regression fixtures before deleting or replacing legacy engineering logic.
5. Only after the vertical slice is stable, move validated capabilities into shared packages/services.

## Deletion policy
The consolidation effort explicitly removes **duplication, obsolete adapters and superseded domain models**, not working functionality merely because it is old. Every deletion must identify its replacement and be covered by tests or migration verification. Generated artifacts and dead phase patches are candidates for early cleanup once confirmed unused; functional engineering algorithms are not deleted until their replacement is verified.

## Implementation gates
- Do not start M44 until M43 acceptance criteria pass and the canonical object model is proven idempotent against existing domains.
- Do not import engineering source code into the main XBoss runtime until its domain/data ownership is mapped.
- Do not switch to monorepo until shared contracts have been exercised in production-like integration tests.
- Do not decommission the former engineering repository until migration and rollback checks pass.
