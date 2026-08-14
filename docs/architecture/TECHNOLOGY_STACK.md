# XBoss Technology Stack — Architecture Decision Record

**Status:** APPROVED
**Role:** Technical Architecture baseline
**Product:** XBoss
**Scope:** Frontend, backend, engineering compute, AI, data, integration, delivery
**Last decision:** 2026-08-14

## 1. Executive decision

XBoss will use a **polyglot, modular architecture with strict boundaries** rather than forcing one language/framework across the entire platform.

The canonical stack is:

| Layer | Standard |
|---|---|
| Product web | TypeScript + React + Next.js |
| Client server-state | TanStack Query |
| Client local state | Zustand / React state |
| Forms | React Hook Form + schema validation |
| UI system | XBoss Design System + enterprise data grid |
| 3D | Three.js behind an XBoss 3D abstraction |
| Product backend | Node.js + TypeScript + NestJS |
| Engineering services | Python + FastAPI + Pydantic |
| Engineering compute | Python scientific stack; Rust/C++ only for proven hotspots |
| AI orchestration | XBoss Agent Fabric, initially LangGraph adapter |
| AI model access | Central AI Gateway / Model Router |
| Transactional DB | PostgreSQL |
| Spatial DB | PostGIS |
| Vector search | pgvector initially |
| Cache/jobs | Redis + BullMQ initially |
| Object storage | S3-compatible storage |
| Search | PostgreSQL FTS initially; OpenSearch when justified |
| API contracts | OpenAPI + JSON Schema |
| TypeScript workspace | pnpm + Turborepo |
| CI/CD | GitHub Actions |

## 2. Non-negotiable architecture principles

### 2.1 XBoss owns product truth

XBoss is the source of truth for:

- identity and authorization;
- organization and project lifecycle;
- BOQ and commercial truth;
- schedule;
- procurement;
- contracts and variations;
- workflow;
- audit;
- engineering object identity and provenance.

MEP-Agents or any specialist worker must not introduce a second canonical project model, identity system, BOQ ledger or audit system.

### 2.2 Deterministic engineering owns numerical truth

LLMs may interpret, plan, explain and orchestrate. They must not be treated as authoritative numerical engineering calculators.

Engineering calculations must be performed by deterministic, versioned tools/services and return:

- value;
- unit;
- method;
- calculation version;
- input object identifiers;
- source revision identifiers;
- evidence/provenance;
- quality/confidence flags.

### 2.3 AI accesses the system through tools/contracts

Agents must not directly mutate PostgreSQL or bypass domain services.

The path is:

`Agent → typed tool → application/domain service → validation/policy → persistence → event/audit`

### 2.4 Frontend must not own domain truth

Next.js is the product web layer, not the engineering/domain backend. Business rules belong behind backend/application contracts.

### 2.5 Python is a first-class engineering runtime

MEP-Agents capabilities should not be rewritten merely to obtain a single-language stack. Python is the preferred runtime for specialist engineering, CAD/BIM, scientific, vision and AI-worker workloads.

### 2.6 Do not optimize prematurely

Kafka, OpenSearch, Neo4j, Rust/C++, Kubernetes and additional microservices are not default requirements. Introduce them only when measured workload, reliability or isolation requirements justify them.

## 3. Frontend architecture

### 3.1 Product web

Use React + Next.js + TypeScript.

Next.js responsibilities:

- routing;
- rendering/SSR where useful;
- application shell;
- authentication integration;
- frontend composition;
- lightweight BFF concerns where appropriate.

Next.js must not become a general-purpose engineering backend.

### 3.2 State

Separate server state from UI state.

- Server/cache state: TanStack Query.
- Ephemeral UI state: React state or Zustand.
- Forms: React Hook Form.

Avoid a single global Redux-style state container for all project data.

### 3.3 Design system

Create a shared XBoss UI package. Common primitives include:

- DataGrid;
- Tree;
- PropertyPanel;
- Inspector;
- Timeline;
- DocumentViewer;
- DrawingViewer;
- 3DViewer;
- CommandPalette;
- AI Assistant;
- Activity/Audit Feed;
- workflow controls.

Domain screens should compose these primitives instead of reinventing UI controls.

### 3.4 3D/CAD

Three.js is a rendering dependency, not the XBoss domain model.

Use an XBoss 3D abstraction for:

- scene;
- selection;
- camera;
- object identity;
- geometry references;
- spatial indexing;
- interaction;
- metadata binding.

The BIM/engineering object model must remain independent of Three.js.

## 4. Backend architecture

### 4.1 Product backend

Use Node.js + TypeScript + NestJS for the core application backend.

Responsibilities include:

- Project Kernel;
- users/organizations;
- project APIs;
- BOQ/commercial APIs;
- schedule;
- procurement;
- contracts;
- workflow;
- notifications;
- audit;
- engineering object application APIs;
- Agent Fabric API;
- orchestration of workers.

Use a **modular monolith first**, not immediate microservices.

### 4.2 Engineering backend

Use Python + FastAPI + Pydantic for specialist services/workers.

Initial capability domains:

- HVAC;
- electrical;
- plumbing;
- firefighting;
- CAD geometry;
- BIM/IFC;
- quantity extraction;
- clash detection;
- document/vision processing;
- engineering standards and deterministic tools.

Python services communicate using explicit XBoss contracts and do not own product identity or project persistence.

## 5. AI architecture

### 5.1 AI Gateway

All model providers are accessed through a central AI Gateway / Model Router.

This provides:

- model selection;
- fallback;
- token/cost telemetry;
- rate limits;
- policy;
- prompt/version tracking;
- model capability metadata;
- evaluation hooks.

The product must not scatter vendor SDK calls throughout domain code.

### 5.2 Agent Fabric

XBoss exposes an Agent Fabric abstraction. LangGraph is the initial orchestration adapter because it is already used successfully in MEP-Agents.

Agent implementations may evolve without changing the Project Kernel or Engineering Object Model.

### 5.3 Agent permissions

Agents receive scoped tools and project context. They cannot:

- write raw database records;
- bypass authorization;
- overwrite source documents silently;
- turn uncertain extraction into confirmed fact;
- perform irreversible actions without required policy/HITL approval.

## 6. Data architecture

### 6.1 PostgreSQL

PostgreSQL is the canonical transactional store.

Use it for structured product/domain truth and engineering object metadata.

### 6.2 PostGIS

PostGIS is enabled for spatial/project/GIS capabilities and future Digital Twin requirements.

### 6.3 pgvector

Use pgvector initially for project/document semantic retrieval. Do not introduce a separate vector database until scale or workload proves the need.

### 6.4 Object storage

Large artifacts belong in S3-compatible object storage:

- DWG/DXF;
- IFC;
- PDF;
- images;
- video;
- exports;
- generated files.

PostgreSQL stores metadata, object keys, checksums, revisions and provenance.

## 7. Async processing

Long-running work must be asynchronous.

Initial platform:

`Redis + BullMQ`

Examples:

`upload → job → CAD/BIM worker → extraction → Engineering Objects → event`

Do not block HTTP requests on multi-minute engineering/CAD processing.

Move to Kafka/Redpanda only when event volume, replay, fan-out or operational requirements justify it.

## 8. Search

Start with PostgreSQL full-text search and structured indexes.

Adopt OpenSearch when one or more of these become true:

- search volume materially exceeds PostgreSQL requirements;
- complex faceting/ranking is required;
- cross-document search becomes a major workload;
- independent search scaling is required.

## 9. High-performance compute

Python is the default engineering compute runtime.

Use Rust/C++ only for measured hotspots such as:

- geometry kernels;
- mesh processing;
- collision detection;
- point clouds;
- high-volume spatial indexing;
- CPU/GPU intensive image processing.

Native compute must be exposed behind stable service/library contracts so the rest of XBoss is not coupled to implementation language.

## 10. API and contract architecture

Contracts are more important than language boundaries.

Canonical contracts use OpenAPI and JSON Schema.

Minimum engineering contracts:

- EngineeringObject;
- EngineeringObjectRelation;
- EngineeringSource;
- EngineeringRevision;
- QuantityResult;
- Evidence;
- Provenance;
- EngineeringIssue/Clash;
- AgentRun;
- ToolInvocation.

The contract pipeline is:

`Canonical schema → backend validation → generated TypeScript types/client → Python Pydantic models/adapters → integration tests`

No frontend or worker should infer undocumented fields from another service's implementation.

## 11. Repository architecture

Target TypeScript workspace:

```text
apps/
  web/
  admin/
packages/
  ui/
  api-client/
  domain/
  project-kernel/
  engineering-contracts/
  config/
services/
  api/
workers/
  engineering/
  cad/
  bim/
  document/
```

Python workers may initially remain independently deployable. They can move into the XBoss monorepo only after contracts, CI and ownership boundaries are stable.

## 12. Migration strategy for MEP-Agents

Use the strangler pattern:

`audit → contract → adapter → canonical write → backfill → regression verification → read cutover → legacy removal`

Do not copy the MEP-Agents project database/auth/session architecture into XBoss.

Keep and adapt deterministic engineering capabilities. Rewrite only boundaries that conflict with XBoss ownership.

## 13. Testing and quality gates

Every major capability requires:

- unit tests;
- integration tests;
- API contract tests;
- migration tests;
- authorization/project-isolation tests;
- deterministic calculation golden tests where applicable;
- AI evaluation tests for agent behavior;
- golden-project regression fixtures.

Engineering calculation changes require numerical regression checks before release.

## 14. Architecture evolution policy

The following are **not prohibited**, but require evidence before introduction:

- microservices;
- Kafka/Redpanda;
- OpenSearch;
- Neo4j;
- Rust/C++ core;
- Kubernetes;
- separate vector database;
- separate workflow engine.

The architectural default is to add complexity only when it buys measurable reliability, scale, performance, isolation or developer productivity.

## 15. Long-term target

The stack must support this evolution without a platform rewrite:

`Project OS → Engineering OS → Knowledge Graph → Document/CAD/BIM Intelligence → Digital Twin → Predictive OS → Human-in-the-loop Automation → Controlled Autonomy`

The technology stack is therefore a means to preserve stable domain contracts while allowing implementation technology to evolve.

## 16. Decision summary

**Approved baseline:**

`React/Next.js/TypeScript + NestJS + Python/FastAPI + PostgreSQL/PostGIS/pgvector + Redis/BullMQ + S3 + Three.js + LangGraph adapter + OpenAPI/JSON Schema + pnpm/Turborepo + GitHub Actions`

This document is the canonical technology-stack decision. Future stack changes must update this ADR and explain the reason, migration impact, rollback strategy and evidence supporting the change.
