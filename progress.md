# XBOSS Progress — Engineering OS

## Product decision
- [x] Product name: **XBoss**
- [x] Positioning: **AI-Native Construction & Engineering Operating System**
- [x] Engineering intelligence source: former `MEP-Agents` capability set
- [x] Fallback brand reserved: **ForgeOS** (do not use as current repository/product name)
- [x] Consolidation strategy approved: **architecture first → shared contracts → gradual code integration → monorepo only when boundaries are proven**
- [x] Technical architecture owner decision: canonical stack recorded in `docs/architecture/TECHNOLOGY_STACK.md`
- [x] 10-year technology longevity policy recorded in `docs/architecture/TECHNOLOGY_LONGEVITY_PLAN.md`

## Approved baseline
- [x] M0–M42 existing XBoss foundation retained
- [x] Strategic direction: Project OS → Engineering OS → Digital Twin → Controlled Autonomy
- [x] Master roadmap approved
- [x] Unified product architecture approved
- [x] Technology stack approved: React/Next.js/TypeScript + NestJS + Python/FastAPI + PostgreSQL/PostGIS/pgvector + Redis/BullMQ + S3 + Three.js + LangGraph adapter + OpenAPI/JSON Schema + pnpm/Turborepo + GitHub Actions
- [x] Production database policy: PostgreSQL; SQLite only for disposable tests/local tooling
- [x] 10-year-ready strategy: durable foundations + replaceable adapters + versioned contracts + continuous upgrade radar

## Technology hardening status
- [x] Identify SQLite as non-production technology
- [x] Confirm current XBoss DB layer already uses PostgreSQL `pg` + numbered SQL migrations
- [x] Confirm existing migration runner uses advisory locking and per-migration transactions
- [x] Define PostgreSQL as canonical production database
- [x] Define S3-compatible object storage for large artifacts
- [x] Define OpenAPI/JSON Schema as cross-runtime contracts
- [x] Define observability as a platform primitive
- [x] Define security/supply-chain requirements
- [x] Define dependency/runtime upgrade cadence
- [x] Code audit: no SQLite dependency found in package/dependency/code search; legacy comments describe the former SQLite API only
- [ ] Verify production deployment DATABASE_URL/PITR/restore configuration in a real environment
- [ ] Verify migrations, indexes, constraints and project isolation against a disposable PostgreSQL instance
- [ ] Implement structured logs, metrics, tracing and correlation IDs
- [ ] Add dependency/security/SBOM checks to CI

## Integration rules
- XBoss Project Kernel is the canonical project/source-of-truth boundary.
- Engineering capabilities must map into the canonical Engineering Object Model; no parallel project identity or duplicate domain truth.
- Deterministic engineering engines own measurements/calculations; AI agents explain, orchestrate, recommend and act only through approved tools/workflows.
- Existing M0–M42 behavior is protected by regression tests and migration adapters.
- Prefer strangler migration: adapter → canonical write → backfill → verification → read cutover → legacy removal.
- Do not perform a big-bang repository/database merge.
- Do not delete legacy code/data until an explicit replacement, migration, regression coverage and rollback path exist.
- Technology changes must update the architecture ADR with rationale, migration impact, rollback strategy and evidence.

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
- [ ] Stage C: establish monorepo boundaries only after shared contracts are stable
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
Status: **IN IMPLEMENTATION — DATABASE KERNEL FOUNDATION LANDED**

### M43 implementation status
- [x] PostgreSQL DB layer verified (`pg` Pool, transaction context, timeouts, slow-query telemetry)
- [x] numbered SQL migration runner verified (advisory lock + per-file transaction)
- [x] project-scoped RLS infrastructure exists and is used as a second security boundary
- [x] canonical `engineering_sources` table
- [x] canonical `engineering_source_revisions` table
- [x] canonical `engineering_objects` table
- [x] canonical `engineering_object_revisions` table
- [x] canonical `engineering_object_relations` table
- [x] canonical `engineering_object_sources` evidence/provenance table
- [x] canonical deterministic `engineering_quantity_results` table
- [x] UUID engineering identities decoupled from legacy SERIAL IDs
- [x] project-scoped RLS policies for new engineering tables
- [ ] object/relation registry
- [ ] canonical TypeScript domain types
- [ ] application services
- [ ] existing-domain adapters
- [ ] `/api/v2/engineering/*` API
- [ ] audit/event integration
- [ ] integration tests
- [ ] project isolation tests
- [ ] generated ERD update
- [ ] documentation update

### M43 foundation gate
Before declaring M43 complete:
- [x] production path uses PostgreSQL at code level
- [x] no production SQLite dependency found in repository audit
- [x] migrations are transactional and serialized with advisory lock
- [x] indexes and foreign-key constraints are defined for the engineering kernel
- [ ] project/org isolation tests pass in CI
- [ ] backup + restore test passes in a real PostgreSQL environment
- [ ] API contracts are validated in CI
- [ ] structured observability is present end-to-end
- [ ] golden engineering fixture exists

## Immediate next implementation slice
1. Add typed Engineering Domain models matching migration `0070_engineering_kernel.sql`.
2. Add repository/application services with idempotent create/update/revision semantics.
3. Add `/api/v2/engineering/*` contract-first endpoints.
4. Add project isolation integration tests against PostgreSQL, including RLS and transaction context.
5. Add provenance/audit events and deterministic quantity result persistence.
6. Connect the first vertical slice: **Drawing → Engineering Objects → Quantity → BOQ → Cost impact**.
7. Only then begin M44 as a separate provenance hardening milestone; do not duplicate the kernel tables.

## Long-term technology roadmap
- [x] Define 2026–2036 technology longevity policy
- [ ] 2026–2027 Foundation hardening
- [ ] 2027–2029 Engineering OS maturity
- [ ] 2029–2031 Intelligence/Digital Twin foundation
- [ ] 2031–2033 Predictive OS
- [ ] 2033–2036 Controlled Autonomy and continuous modernization
- [ ] Annual technology radar review
- [ ] 2–3 year formal architecture refresh

## Technology radar — evaluate, do not prematurely adopt
- [ ] WebGPU-native rendering
- [ ] WASM/WASI portable engineering compute
- [ ] Rust geometry kernels when benchmarks justify
- [ ] GPU CAD/vision acceleration
- [ ] Kafka/Redpanda for proven event-streaming needs
- [ ] Graph projection/Neo4j if Digital Twin traversal requires it
- [ ] Dedicated time-series infrastructure for large sensor deployments
- [ ] Edge compute for site/IoT workloads
- [ ] emerging multimodal engineering foundation models
- [ ] emerging AI-agent interoperability standards

## Deletion policy
The consolidation effort explicitly removes **duplication, obsolete adapters and superseded domain models**, not working functionality merely because it is old. Every deletion must identify its replacement and be covered by tests or migration verification. Generated artifacts and dead phase patches are candidates for early cleanup once confirmed unused; functional engineering algorithms are not deleted until their replacement is verified.

## Implementation gates
- Do not start M44 until M43 acceptance criteria pass and the canonical object model is proven idempotent against existing domains.
- Do not import engineering source code into the main XBoss runtime until its domain/data ownership is mapped.
- Do not switch to monorepo until shared contracts have been exercised in production-like integration tests.
- Do not decommission the former engineering repository until migration and rollback checks pass.
- Do not introduce Tier C infrastructure merely for perceived scale; require benchmark, operational and migration evidence.
- Every significant technology replacement must include migration, regression, observability and rollback planning.
