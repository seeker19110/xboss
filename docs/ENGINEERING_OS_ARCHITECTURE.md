# Engineering OS Architecture Rules

## Canonical layers
```text
Presentation
  ↓
API / Command / Query
  ↓
Application Services
  ↓
Domain Services
  ↓
Project Kernel
  ↓
Existing Transactional Domains
  ↓
PostgreSQL
```

Cross-cutting infrastructure:
`Audit | Events | Policy | Observability | Jobs | AI Gateway | Object Storage`

## Source of truth
PostgreSQL remains authoritative for transactional state. Object storage holds large binary artifacts. Search/vector indexes are derived indexes and may always be rebuilt from source data.

## AI boundary
LLMs may plan, classify, interpret, summarize and select tools. They may not be the authoritative calculator for quantities, money, dates, permissions or database integrity.

## Evidence model
Every AI or derived engineering result should eventually support:
```text
result
source_refs[]
calculation_rule
rule_version
model/provider (if AI)
confidence
created_at
```

## Result semantics
`FACT` = directly evidenced source value.
`DERIVED` = deterministic computation from facts.
`INFERENCE` = probabilistic conclusion.
`RECOMMENDATION` = proposed action.
`UNKNOWN` = insufficient evidence.

## Event model
Important domain changes emit durable events with:
`event_id, event_type, aggregate_id, project_id, actor_id, timestamp, payload, causation_id, correlation_id, schema_version`.

Events are append-only. Consumers must be idempotent.

## AI agent model
```text
User intent
 ↓
Planner
 ↓
Specialist agent(s)
 ↓
Tool gateway
 ↓
Evidence collector
 ↓
Reviewer
 ↓
Response / proposed action
```

Agents never bypass authorization or call repositories directly. Tools expose narrow typed contracts.

## Action levels
L0 read-only
L1 recommendation
L2 draft/preparation
L3 reversible execution
L4 consequential execution with explicit approval
L5 autonomous execution

Default production ceiling for new AI features: L2. Promote only after evaluation, policy and rollback evidence.

## Temporal integrity
Engineering revisions and important events must make it possible to answer “what was known/approved as of time T?” This is required for claims, EOT, audit and dispute evidence.

## Performance
Keep synchronous requests bounded. OCR, CAD/BIM parsing, large imports, embeddings, reports and AI analysis belong in background jobs with progress state.

## Compatibility
Prefer additive migrations, adapters and feature flags. Never silently change the semantics of an existing production field merely to support a new AI feature.

## Failure mode
For uncertain engineering inference, fail to `REVIEW_REQUIRED` or `UNKNOWN`, not to fabricated certainty.
