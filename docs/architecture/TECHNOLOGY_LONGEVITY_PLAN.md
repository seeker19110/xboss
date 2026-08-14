# XBoss Technology Longevity & Upgrade Plan

**Status:** APPROVED
**Horizon:** 2026–2036+
**Purpose:** prevent XBoss from becoming obsolete because of short-lived technology choices while avoiding premature complexity.

## 1. Core principle

"10-year-ready" does **not** mean choosing today's newest framework and freezing it for ten years. It means:

1. stable domain contracts;
2. replaceable infrastructure adapters;
3. production-grade data/storage foundations;
4. explicit upgrade policy;
5. automated migration and regression tests;
6. observability and security as platform primitives;
7. technology choices based on lifecycle, ecosystem, portability and measurable workload;
8. no irreversible coupling to a single vendor or model provider.

The architecture must allow a frontend framework, AI model, queue, search engine or compute implementation to be replaced without rewriting the Project Kernel or Engineering Object Model.

## 2. Immediate technology hardening

### P0 — canonical database

**Decision: PostgreSQL is mandatory for production.**

SQLite is allowed only for isolated unit tests, local disposable tooling or embedded fixtures where its limitations are intentional. It must not be the production source of truth for XBoss.

PostgreSQL requirements:

- migrations under version control;
- transactional integrity;
- row/project isolation;
- explicit indexes;
- foreign keys and constraints;
- optimistic/pessimistic locking where needed;
- audit/history strategy;
- backup/restore procedures;
- point-in-time recovery in production;
- connection pooling;
- schema compatibility tests.

### P0 — object storage

All large engineering/document artifacts use S3-compatible object storage. Database records contain metadata, checksum, version and provenance, not giant binary payloads by default.

### P0 — API contracts

OpenAPI/JSON Schema becomes the contract boundary between Next.js/NestJS, Python workers and future external services.

### P0 — observability

Introduce structured logs, metrics, distributed traces, correlation IDs and audit events as platform capabilities before the system becomes distributed.

## 3. Technology maturity tiers

### Tier A — canonical / durable

These technologies may be treated as long-lived foundations:

- PostgreSQL;
- PostGIS;
- S3-compatible object storage;
- HTTP/OpenAPI;
- JSON Schema;
- TypeScript;
- Python;
- Linux/container standards;
- standard SQL;
- standard authentication/authorization protocols.

### Tier B — replaceable platform components

These are approved defaults but must remain behind interfaces:

- Next.js;
- NestJS;
- Redis;
- BullMQ;
- Three.js;
- LangGraph;
- pgvector;
- OpenSearch if introduced.

### Tier C — workload-driven components

Only introduce after evidence:

- Kafka/Redpanda;
- Kubernetes;
- Neo4j;
- dedicated vector DB;
- Rust/C++ compute kernels;
- specialized workflow engines;
- dedicated feature stores;
- distributed data-processing frameworks.

## 4. Long-lived architectural boundaries

### 4.1 Project Kernel

The Project Kernel is the most protected boundary in XBoss.

It owns identity, project lifecycle, permissions, canonical object identity, revisions, provenance and domain event semantics.

Infrastructure implementations may change behind it.

### 4.2 Engineering Engine boundary

Engineering calculations are invoked through stable typed contracts.

A calculation can move from:

`Python → optimized Python → Rust/C++ → remote worker → GPU service`

without changing callers, provided the contract and deterministic regression results remain compatible.

### 4.3 AI boundary

AI providers are replaceable.

The application talks to:

`AI Gateway → Model Router → provider`

not directly to a vendor SDK from domain code.

Model prompts, tool schemas, evaluation sets and model metadata are versioned.

## 5. Frontend longevity

### 5.1 Do not couple business logic to Next.js

Domain logic lives in shared typed domain packages and backend services.

### 5.2 Do not couple BIM/CAD data to Three.js

The 3D engine consumes an XBoss scene/object abstraction. A future renderer can replace Three.js/WebGL without changing Engineering Objects.

### 5.3 Browser evolution

WebGPU should be supported behind the rendering abstraction when browser/platform maturity makes it beneficial. WebGL remains the compatibility path until the supported-browser policy permits removal.

## 6. Backend longevity

### 6.1 Modular monolith first

The product backend starts as a strongly modular NestJS application.

A module may become a service only when one of these is demonstrated:

- independent scaling requirement;
- fault isolation requirement;
- deployment cadence conflict;
- team ownership boundary;
- security/isolation requirement;
- workload technology mismatch.

### 6.2 Service extraction contract

Before extracting a module:

1. API contract exists;
2. data ownership is explicit;
3. events are defined;
4. integration tests exist;
5. rollback exists;
6. observability exists;
7. load characteristics are measured.

## 7. Data evolution

### 7.1 PostgreSQL first, graph semantics second

XBoss will model relationships explicitly in PostgreSQL before introducing a graph database.

Neo4j or another graph engine may be introduced later if graph traversal becomes a measurable bottleneck. It must be a projection/read model, not an ungoverned second source of truth.

### 7.2 Vector search

Use pgvector while project/document scale is manageable. A dedicated vector engine is permitted only after benchmarks demonstrate the need.

### 7.3 Event architecture

Start with transactional domain events and Redis/BullMQ jobs. Introduce Kafka/Redpanda when durable high-volume event streaming, replay or independent fan-out requires it.

The event schema must remain technology-independent.

## 8. Engineering data durability

Every engineering result must retain:

- source document/drawing;
- source checksum;
- revision;
- object identifiers;
- calculation method;
- calculation version;
- input parameters;
- output;
- units;
- evidence;
- producing engine version;
- timestamp;
- actor/agent/workflow.

This makes old calculations auditable even if the calculation engine is upgraded years later.

## 9. AI longevity

AI changes faster than every other part of the stack. Therefore:

- never persist provider-specific assumptions as domain truth;
- version prompts and tool schemas;
- record model/provider/version for important runs;
- maintain golden evaluation sets;
- maintain deterministic fallbacks for critical engineering calculations;
- support multiple model providers;
- allow model routing by capability, cost, latency and risk;
- separate experimental agents from production-approved agents.

## 10. Security longevity

Security is a platform requirement, not a final milestone.

Required baseline:

- OIDC/OAuth-compatible identity integration;
- RBAC/ABAC-ready authorization;
- project/organization isolation;
- secrets outside source code;
- encrypted transport;
- encryption at rest where supported;
- immutable/auditable security events;
- dependency and container scanning;
- SBOM generation;
- signed release artifacts where practical;
- least-privilege service credentials.

## 11. Supply-chain durability

Every production dependency must have:

- known owner/project;
- license compatibility;
- maintenance activity assessment;
- security monitoring;
- replacement path;
- version pinning/lockfile;
- automated update testing.

Do not adopt a library solely because it is fashionable.

## 12. Deployment portability

Application components should run in OCI-compatible containers.

Target environments:

- local development;
- single-node deployment;
- managed cloud;
- private cloud/on-premise where construction clients require it.

Avoid coupling the core domain to one cloud provider's proprietary database or queue semantics.

## 13. Upgrade policy

### Quarterly

- dependency/security audit;
- runtime support check;
- vulnerability remediation;
- performance regression review.

### Every 6 months

- framework/runtime upgrade window;
- database compatibility review;
- AI model/provider review;
- architecture debt review.

### Annually

- technology radar review;
- 3-year replacement risk assessment;
- disaster recovery exercise;
- dependency concentration review;
- benchmark critical engineering workloads;
- review whether a Tier C technology has earned adoption.

### Every 2–3 years

Perform a formal architecture refresh. Do not automatically rewrite. Replace only components whose lifecycle, security, performance or ecosystem risk justifies migration.

## 14. Technology replacement triggers

A technology should be reconsidered when:

- upstream maintenance is materially declining;
- security support becomes unacceptable;
- licensing becomes incompatible;
- critical browser/runtime support ends;
- performance limits are proven;
- operational cost becomes materially worse;
- portability is lost;
- a stable replacement provides a large measured benefit.

## 15. 2026–2030 roadmap

### Phase L0 — Foundation hardening

- [ ] verify every production path uses PostgreSQL;
- [ ] remove production SQLite assumptions;
- [ ] establish object storage contract;
- [ ] establish OpenAPI/JSON Schema CI validation;
- [ ] establish structured logging/metrics/tracing;
- [ ] establish dependency/security scanning;
- [ ] establish database backup/PITR/restore testing;
- [ ] establish golden engineering datasets.

### Phase L1 — Engineering OS

- [ ] M43 Project Kernel;
- [ ] M44 Provenance;
- [ ] M45 Domain Events;
- [ ] M46 Deterministic Engineering Engine;
- [ ] migrate highest-value MEP-Agents capabilities;
- [ ] contract-first CAD/BIM/QTO services.

### Phase L2 — Intelligence

- [ ] M47 Knowledge Graph semantics;
- [ ] M48 Agent Fabric;
- [ ] M49 Document/CAD/BIM Intelligence;
- [ ] model gateway and evaluation platform;
- [ ] human approval/policy controls.

### Phase L3 — Digital Twin

- [ ] M50 Digital Twin;
- [ ] spatial/temporal object history;
- [ ] GIS/BIM integration;
- [ ] event-driven state projections;
- [ ] simulation interfaces.

### Phase L4 — Predictive/Autonomous

- [ ] M51 Predictive OS;
- [ ] M52 Workflow + Human-in-the-loop;
- [ ] M53 Controlled Autonomy;
- [ ] continuous AI evaluation;
- [ ] safety/policy enforcement;
- [ ] reversible autonomous actions.

## 16. 2030–2036 technology radar

This is a radar, not a commitment to adopt future technologies prematurely.

Evaluate as maturity becomes real:

- WebGPU-native high-performance rendering;
- WASM/WASI for portable engineering compute;
- Rust geometry kernels;
- GPU acceleration for vision/geometry;
- event streaming at very large scale;
- graph projections for Digital Twin;
- specialized time-series storage for sensor-heavy deployments;
- edge compute for site/IoT workloads;
- stronger confidential-compute/security primitives;
- emerging AI agent interoperability standards;
- multimodal engineering foundation models.

The invariant is the XBoss contract layer, not the future implementation technology.

## 17. Explicit SQLite policy

SQLite is **not** the production database for XBoss.

Allowed uses:

- unit-test fixtures;
- disposable local experiments;
- small isolated tooling where a server database would add unnecessary complexity.

Production XBoss uses PostgreSQL because it provides the concurrency, transactional, security, extension, backup, replication and operational characteristics required for a multi-user engineering platform.

## 18. Definition of "10-year-ready"

XBoss is considered 10-year-ready when:

- no core domain concept depends on a replaceable vendor implementation;
- production data has transactional and disaster-recovery guarantees;
- every major external integration has a versioned contract;
- engineering results are reproducible/auditable;
- AI decisions have provenance and evaluation records;
- critical workloads have golden regression suites;
- dependencies can be upgraded incrementally;
- modules can be extracted without rewriting domain logic;
- infrastructure can be moved between compatible environments;
- there is an explicit technology radar and review cadence.

## 19. Final architectural rule

**Choose durable foundations, isolate volatile technologies, measure before scaling, and migrate incrementally.**

The goal is not to predict the exact technology of 2036. The goal is to make XBoss capable of adopting it without rebuilding XBoss.
