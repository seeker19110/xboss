# XBOSS — Engineering OS Master Roadmap

## Status
Approved architecture baseline — 2026-08-14.

## Vision
XBoss evolves from a construction project management system into a **Construction Engineering Operating System** while preserving M0–M42 production capabilities.

Target chain:

`Project OS → Engineering OS → Digital Twin → Predictive OS → Controlled Autonomous Engineering OS`

## Non-negotiable principles
1. PostgreSQL remains the transactional source of truth.
2. Existing M0–M42 APIs remain compatible unless a migration plan and regression tests are supplied.
3. Engineering facts require provenance.
4. Important calculations are deterministic, not LLM-generated arithmetic.
5. AI outputs must distinguish FACT / DERIVED / INFERENCE / RECOMMENDATION / UNKNOWN.
6. Consequential AI actions require policy and human approval until explicitly promoted to an autonomous level.
7. Every important mutation is auditable and attributable.
8. Every engineering revision is immutable.
9. AI provider/model must remain replaceable through a gateway.
10. New capabilities are built as additive layers over the existing system, not a rewrite.

## Roadmap
| Milestone | Goal | Gate |
|---|---|---|
| M43 | Project Kernel | Canonical engineering identity and relations |
| M44 | Provenance | Every important quantity/cost/progress result traceable |
| M45 | Domain Events | Durable event history and causation/correlation |
| M46 | Deterministic Engineering Engine | Units, geometry, quantity, cost and schedule calculations |
| M47 | Knowledge Graph | Cross-domain semantic traversal and impact analysis |
| M48 | AI Agent Fabric | Planner, specialist agents, tool gateway, evals |
| M49 | Document/CAD/BIM Intelligence | PDF/XLSX/DWG/DXF/IFC/RVT semantic extraction |
| M50 | Digital Twin | Planned vs actual state over time |
| M51 | Predictive OS | Delay/cost/risk/quality/procurement forecasts |
| M52 | Workflow + HITL | Policy-controlled AI proposals and approvals |
| M53 | Controlled Autonomy | Safe reversible automation with verification/rollback |

## Ultimate architecture
```text
Human
  ↓
XBoss Command Center
  ↓
Control Plane (workflow / policy / approvals)
  ↓
Project Kernel ←→ Knowledge Graph ←→ Agent Fabric
  ↓
Deterministic Engineering Engines
  ↓
Digital Twin
  ↑
Design / Documents / CAD-BIM / Schedule / Procurement / Field Reality
  ↓
Predict / Simulate / Recommend / Act / Verify
```

## Technology ceiling
The realistic frontier is continuous sensing + canonical engineering semantics + deterministic computation + AI reasoning + simulation + controlled autonomy. Fully autonomous responsibility for legal, financial, safety-critical and final engineering decisions remains outside the default operating model.

## Definition of Done for Engineering OS maturity
- Canonical identity exists for core engineering objects.
- Revisions are immutable and queryable.
- Important values have provenance.
- AI answers are evidence-backed.
- Important calculations are reproducible.
- Cross-project isolation is enforced centrally.
- Events, audit and causation are queryable.
- Drawing revisions can produce impact analysis.
- BOQ ↔ drawing ↔ material ↔ task ↔ inspection ↔ payment can be traversed.
- Golden-project regression protects releases.
- AI prompts/models have evaluation and regression gates.
- Consequential actions are policy controlled.
- Digital Twin can represent planned and actual state.
- Predictions expose probability, evidence and uncertainty.

## Immediate implementation rule
Do not add another large CRUD module before M43–M46 foundations are implemented. New modules must register their entities with the Project Kernel and emit domain events.
