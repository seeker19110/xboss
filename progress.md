# XBOSS Progress — Engineering OS

## Current execution rule
**Continuous implementation loop is approved:** complete one implementation slice → review/fix → commit/push → immediately continue. A milestone is only marked complete after its acceptance gates pass; intermediate commits are allowed and expected.

## Product decision
- [x] Product name: **XBoss**
- [x] Positioning: **AI-Native Construction & Engineering Operating System**
- [x] Engineering intelligence source: former `MEP-Agents` capability set
- [x] Fallback brand reserved: **ForgeOS**
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
- [x] Confirm current XBoss DB layer uses PostgreSQL `pg` + numbered SQL migrations
- [x] Confirm migration runner uses advisory locking and per-migration transactions
- [x] Define PostgreSQL as canonical production database
- [x] Define S3-compatible object storage for large artifacts
- [x] Define OpenAPI/JSON Schema as cross-runtime contracts
- [x] Define observability as a platform primitive
- [x] Define security/supply-chain requirements
- [x] Define dependency/runtime upgrade cadence
- [x] Code audit: no SQLite dependency found in package/dependency/code search; legacy comments describe the former SQLite API only
- [ ] Verify production deployment DATABASE_URL/PITR/restore configuration in a real environment
- [ ] Verify migrations/indexes/constraints/isolation against disposable PostgreSQL
- [ ] Implement structured logs, metrics, tracing and correlation IDs end-to-end
- [ ] Add dependency/security/SBOM checks to CI

## Repository consolidation plan
- [x] Stage A defined: separate repositories while defining canonical contracts
- [x] Stage A: audit former MEP-Agents components
- [x] Stage A: define canonical MEP/CAD/BIM/QTO → Engineering Object mapping
- [ ] Stage A: implement M43 Project Kernel
- [ ] Stage A: implement M44 Provenance
- [ ] Stage A: implement M45 Domain Events
- [ ] Stage A: implement M46 Deterministic Engineering Engine
- [ ] Stage B: extract shared packages/contracts
- [ ] Stage B: integrate CAD/BIM/geometry/quantity/document intelligence through XBoss APIs
- [ ] Stage B: migrate AI agents to XBoss Agent Fabric
- [ ] Stage B: remove duplicate project/auth/audit/domain persistence
- [ ] Stage C: establish monorepo boundaries after contracts are proven
- [ ] Stage C: move validated engineering packages/services into XBoss monorepo
- [ ] Stage C: archive/decommission MEP-Agents after final migration verification

## MEP-Agents audit result
**Stage A audit + canonical mapping are complete.** Reusable deterministic MEPF engineering, CAD, BIM, QS/BOQ-diff, revision and multi-agent capabilities are being integrated through XBoss contracts rather than copying the MEP-Agents project/auth/persistence model.

## Current milestone: M43 Project Kernel
Status: **IN IMPLEMENTATION — API SLICE LANDED; TEST/CONTRACT GATES PENDING**

### M43 implementation status
- [x] PostgreSQL DB layer verified (`pg` Pool, transaction context, timeouts, slow-query telemetry)
- [x] numbered SQL migration runner verified (advisory lock + per-file transaction)
- [x] canonical engineering source/object/revision/relation/evidence/quantity tables
- [x] UUID engineering identities decoupled from legacy IDs
- [x] project-scoped RLS policies for new engineering tables
- [x] Zod validation schemas for canonical engineering inputs
- [x] Engineering repository/application service slice
- [x] project-scoped read/write transaction boundary for engineering services
- [x] `/api/v2/engineering/objects`
- [x] `/api/v2/engineering/objects/[id]`
- [x] `/api/v2/engineering/objects/revisions`
- [x] `/api/v2/engineering/sources`
- [x] `/api/v2/engineering/sources/revisions`
- [x] `/api/v2/engineering/relations`
- [x] `/api/v2/engineering/health`
- [ ] object/relation registry
- [ ] canonical domain types separated from persistence DTOs
- [ ] idempotent create/update command semantics
- [ ] existing-domain adapters
- [ ] audit/event integration
- [ ] integration tests against PostgreSQL
- [ ] project/org isolation tests including RLS
- [ ] API contract tests in CI
- [ ] generated ERD update
- [ ] golden engineering fixture
- [ ] documentation update

### M43 acceptance gate
M43 remains **open** until all are true:
- [x] production path uses PostgreSQL at code level
- [x] no production SQLite dependency found in repository audit
- [x] migrations are transactional and serialized with advisory lock
- [x] engineering tables have FK/index/constraint coverage
- [x] engineering service writes establish `app.project_id` inside a transaction
- [ ] project/org isolation tests pass in CI
- [ ] backup + restore test passes in a real PostgreSQL environment
- [ ] API contracts are validated in CI
- [ ] structured observability is present end-to-end
- [ ] golden engineering fixture exists

## Next continuous implementation queue
1. Add PostgreSQL integration tests for RLS and cross-project rejection.
2. Add API contract tests and negative validation cases.
3. Add idempotency keys for source/object/relation commands.
4. Add audit/provenance events for every canonical write.
5. Add quantity-result command/service with deterministic engine metadata.
6. Add BOQ adapter and first vertical slice: **Drawing → Engineering Objects → Quantity → BOQ → Cost impact**.
7. Close M43 only after all acceptance gates pass.
8. Start M44 Provenance as a separate hardening stage without duplicating M43 tables.

## Long-term roadmap
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
Remove duplication/obsolete adapters only after replacement, regression coverage and rollback verification. Never delete working engineering algorithms merely because they are old.

## Implementation gates
- Do not start M44 until M43 acceptance criteria pass and canonical object behavior is proven against existing domains.
- Do not import engineering source code into the main XBoss runtime until ownership is mapped.
- Do not switch to monorepo until shared contracts pass production-like integration tests.
- Do not decommission MEP-Agents until migration and rollback checks pass.
- Do not introduce Tier C infrastructure without benchmark, operational and migration evidence.
- Every significant technology replacement requires migration, regression, observability and rollback planning.
