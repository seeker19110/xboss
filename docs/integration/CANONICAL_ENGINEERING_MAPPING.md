# Canonical Engineering Mapping — MEP-Agents → XBoss

This document defines the first integration contract. It intentionally maps concepts rather than copying implementation details.

| MEP-Agents capability/concept | XBoss canonical target | Ownership | Migration action |
|---|---|---|---|
| CAD drawing | `EngineeringObject` + source/revision refs | XBoss Kernel | ADAPT |
| CAD entity/geometry | Engineering object geometry payload/ref | Engineering service | ADAPT |
| BIM element | `EngineeringObject` with discipline/type metadata | Engineering service | ADAPT |
| MEP component | `EngineeringObject` (`equipment`/`component`/`system`) | Engineering domain | ADAPT |
| Drawing revision | `engineering_revisions` + provenance | XBoss Kernel | ADAPT |
| CAD diff | revision comparison evidence | Engineering service | KEEP/ADAPT |
| Clash | engineering issue/evidence | Engineering service + XBoss issue workflow | ADAPT |
| Quantity takeoff | deterministic quantity result + evidence | Engineering service | ADAPT |
| BOQ diff | XBoss BOQ revision/variation semantics | XBoss Commercial | ADAPT |
| BOQ cost | XBoss cost/BOQ | XBoss Commercial | DO NOT duplicate |
| Project/session | XBoss Project | XBoss Core | REWRITE |
| JWT auth | XBoss identity/authorization | XBoss Core | REWRITE |
| Agent state | XBoss Agent Run / workflow context | XBoss AI | ADAPT |
| Supervisor | XBoss Agent Fabric planner/router | XBoss AI | ADAPT |
| Reviewer | XBoss policy/HITL reviewer | XBoss Workflow | ADAPT |
| Standards/RAG | XBoss Knowledge + Provenance | XBoss Knowledge | ADAPT |
| Usage/cost | XBoss AI observability | XBoss Platform | ADAPT |
| Streamlit app | XBoss Engineering UI | XBoss App | DEPRECATE after replacement |

## Canonical engineering object minimum

Every imported engineering result must be representable as:

```text
EngineeringObject
  id
  project_id
  object_type
  discipline
  name / external_identifier
  source_refs[]
  revision_id
  geometry_ref (optional)
  properties
  provenance
  created_at
  updated_at
```

Relationships must be explicit and typed, for example:

```text
CONTAINS
LOCATED_IN
CONNECTED_TO
SERVES
BELONGS_TO_SYSTEM
DERIVED_FROM
REPRESENTS
CLASHES_WITH
MEASURED_FROM
MAPS_TO_BOQ
```

## Quantity contract

A quantity result must never be just a number. It must include:

```text
quantity
unit
method
source_object_ids[]
source_revision_ids[]
evidence_refs[]
calculation_version
confidence/quality flags
```

The XBoss commercial layer may then map this deterministic result to a BOQ item and cost item.

## AI contract

An agent may:

- discover project/engineering context through approved tools;
- call deterministic engineering calculations;
- request CAD/BIM operations;
- propose mappings or changes;
- create drafts/workflows subject to policy.

An agent may not:

- invent engineering measurements;
- directly mutate PostgreSQL tables;
- create a second project identity;
- silently overwrite source drawings;
- bypass provenance/audit;
- convert an uncertain extraction into a confirmed engineering fact.

## First acceptance test

Given a known CAD drawing and project:

1. ingest the drawing;
2. create a source + revision;
3. extract at least one canonical engineering object;
4. calculate a deterministic quantity;
5. attach evidence and provenance;
6. map the quantity to an existing XBoss BOQ item;
7. calculate cost impact;
8. expose the full chain to an audit/review screen.

No repository merge is required to pass this test; this is an architectural integration gate.
