# M43 — Project Kernel Detailed Specification

## 1. Objective
Create a canonical semantic backbone over the existing XBoss transactional schema. M43 must not replace existing domain tables. It introduces stable engineering identity, relationships, source references and revisions so later AI, BIM, quantity, provenance and digital-twin features have one common model.

## 2. Scope
Initial canonical object types:
- PROJECT
- BUILDING
- FLOOR
- ZONE
- SPACE
- SYSTEM
- EQUIPMENT
- DRAWING
- DRAWING_REVISION
- DOCUMENT
- BOQ_ITEM
- MATERIAL
- TASK
- WORK_PACKAGE
- INSPECTION
- NCR
- RFI
- CONTRACT
- VARIATION
- PAYMENT_CERTIFICATE

Initial relation types:
`CONTAINS`, `PART_OF`, `LOCATED_IN`, `BELONGS_TO_SYSTEM`, `REFERENCES`, `DERIVED_FROM`, `SUPERSEDES`, `MAPS_TO_BOQ`, `MAPS_TO_TASK`, `USES_MATERIAL`, `AFFECTS`, `DEPENDS_ON`, `INSPECTED_BY`, `EVIDENCED_BY`.

## 3. Database contract
Create migrations for:

### engineering_objects
- id UUID PK
- project_id UUID NOT NULL
- object_type VARCHAR NOT NULL
- business_code VARCHAR NULL
- external_id VARCHAR NULL
- name VARCHAR NULL
- status VARCHAR NOT NULL DEFAULT 'active'
- current_revision_id UUID NULL
- source_system VARCHAR NULL
- metadata JSONB NOT NULL DEFAULT '{}'
- created_at TIMESTAMPTZ NOT NULL
- updated_at TIMESTAMPTZ NOT NULL
- created_by UUID NULL

Constraints/indexes:
- project_id index
- `(project_id, object_type, business_code)` partial unique where business_code is not null
- object_type CHECK against registered values
- foreign key project → existing projects table using the repository's actual PK type

### engineering_object_relations
- id UUID PK
- project_id UUID NOT NULL
- from_object_id UUID NOT NULL
- to_object_id UUID NOT NULL
- relation_type VARCHAR NOT NULL
- valid_from TIMESTAMPTZ NULL
- valid_to TIMESTAMPTZ NULL
- metadata JSONB NOT NULL DEFAULT '{}'
- created_at TIMESTAMPTZ NOT NULL
- created_by UUID NULL

Constraints:
- no self relation unless explicitly allowed by relation registry
- both objects must belong to same project
- index `(project_id, from_object_id)`
- index `(project_id, to_object_id)`
- index `(project_id, relation_type)`

### engineering_sources
- id UUID PK
- project_id UUID NOT NULL
- source_type VARCHAR NOT NULL
- storage_key TEXT NULL
- original_filename TEXT NULL
- sha256 CHAR(64) NULL
- mime_type VARCHAR NULL
- source_revision VARCHAR NULL
- metadata JSONB NOT NULL DEFAULT '{}'
- created_at TIMESTAMPTZ NOT NULL
- created_by UUID NULL

### engineering_object_sources
- object_id UUID NOT NULL
- source_id UUID NOT NULL
- locator JSONB NOT NULL DEFAULT '{}'
- confidence NUMERIC(6,5) NULL
- created_at TIMESTAMPTZ NOT NULL
- PRIMARY KEY(object_id, source_id)

Locator examples: `{page: 12}`, `{sheet: "A-101", entityHandle: "AB12"}`, `{row: 41, column: "F"}`.

### engineering_revisions
- id UUID PK
- object_id UUID NOT NULL
- revision_code VARCHAR NOT NULL
- status VARCHAR NOT NULL
- supersedes_revision_id UUID NULL
- effective_at TIMESTAMPTZ NULL
- published_at TIMESTAMPTZ NULL
- content_hash CHAR(64) NULL
- metadata JSONB NOT NULL DEFAULT '{}'
- created_at TIMESTAMPTZ NOT NULL
- created_by UUID NULL

Rule: published revisions are immutable. A correction creates a new revision; it never overwrites the published record.

## 4. Registry
Implement a typed registry in code:
- object type → display name → source domain → allowed relations
- relation type → directionality → cardinality → validation policy

Unknown types must fail closed at the API boundary.

## 5. API contract
Add v2 read/write endpoints without breaking existing endpoints:

`GET /api/v2/engineering/objects/:id`
`GET /api/v2/engineering/objects/:id/relations`
`GET /api/v2/engineering/objects/:id/sources`
`GET /api/v2/engineering/objects/:id/revisions`
`GET /api/v2/engineering/objects/:id/timeline`
`POST /api/v2/engineering/objects`
`POST /api/v2/engineering/objects/:id/relations`
`POST /api/v2/engineering/objects/:id/revisions`

All project-scoped reads/writes must derive project scope from the authenticated principal and/or validated object, never from an untrusted client-only project id.

## 6. Service layer
Required functions:
- `createEngineeringObject()`
- `getEngineeringObject()`
- `listEngineeringObjectRelations()`
- `createEngineeringObjectRelation()`
- `attachEngineeringSource()`
- `createEngineeringRevision()`
- `publishEngineeringRevision()`
- `assertSameProject()`
- `assertRevisionMutable()`

Routes must call application services; SQL must not be embedded in route handlers.

## 7. Existing-domain mapping
M43 must introduce adapters, not duplicate source-of-truth data. Initial mapping:
- drawing → DRAWING
- boq item → BOQ_ITEM
- task → TASK
- material → MATERIAL
- equipment → EQUIPMENT
- inspection → INSPECTION
- document → DOCUMENT

Each adapter must be idempotent: importing the same source row twice cannot create a second canonical object.

## 8. Security
- Existing auth/RBAC remains mandatory.
- Every query is project-scoped.
- Cross-project relation creation is rejected.
- Users without read access to the source object cannot discover it through graph traversal.
- Audit every create/update/publish action.

## 9. Tests
Mandatory:
1. object creation
2. duplicate mapping idempotency
3. project isolation
4. relation validation
5. self-relation rejection
6. unknown relation rejection
7. revision creation
8. published revision immutability
9. source locator persistence
10. unauthorized access
11. transaction rollback
12. concurrent relation creation
13. migration up/down validation where repository migration policy supports down migrations
14. regression suite for existing M0–M42 endpoints

## 10. Acceptance criteria
M43 is complete only when:
- all initial object types and relations are registered;
- migrations pass on a clean database;
- canonical adapters map the seven initial existing domains idempotently;
- v2 API is covered by integration tests;
- no existing test regresses;
- project isolation tests prove no cross-project leakage;
- published revisions cannot be mutated;
- audit entries exist for canonical mutations;
- generated ERD/documentation reflects the new tables.

## 11. Explicit non-goals
M43 does NOT implement:
- vector search
- LLM calls
- CAD parsing
- BIM parsing
- autonomous actions
- digital twin UI
- replacement of existing BOQ/task/drawing tables

Those depend on M43 and belong to later milestones.
