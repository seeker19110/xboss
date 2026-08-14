# Engineering OS Coding Handoff

## Purpose
This document is the implementation contract for coding agents working after the architecture approval. Do not interpret the roadmap as permission to redesign the stack.

## First coding package: M43

### Work order
1. Inspect existing schema, migrations, auth and project-scoping helpers.
2. Add M43 migrations.
3. Add registry and domain types.
4. Add application services.
5. Add adapters for existing drawing/BOQ/task/material/equipment/inspection/document records.
6. Add v2 API.
7. Add audit/event hooks.
8. Add integration tests.
9. Update generated ERD and documentation.
10. Run the full existing test/typecheck/lint/build suite.

### Required implementation behavior
- Use existing DB driver/query conventions in the repo.
- Reuse existing auth and project-access helpers.
- Use parameterized SQL only.
- Use transactions for multi-table mutations.
- Use UUID generation according to the repository's established database/application convention.
- Do not introduce an ORM merely for M43.
- Do not add a new runtime dependency without documenting why it is necessary.
- Keep route handlers thin.
- Return stable machine-readable error codes.
- Never expose internal DB errors to clients.

### Error codes
`ENGINEERING_OBJECT_NOT_FOUND`
`ENGINEERING_OBJECT_TYPE_INVALID`
`ENGINEERING_RELATION_TYPE_INVALID`
`ENGINEERING_CROSS_PROJECT_RELATION`
`ENGINEERING_REVISION_IMMUTABLE`
`ENGINEERING_SOURCE_NOT_FOUND`
`ENGINEERING_FORBIDDEN`
`ENGINEERING_CONFLICT`

### Adapter contract
Every existing-domain adapter must expose:
```ts
interface EngineeringObjectAdapter {
  sourceType: string;
  toCanonical(sourceId: string, projectId: string): Promise<string>;
  syncCanonical(sourceId: string, projectId: string): Promise<string>;
}
```

The implementation may use a mapping table if needed. Do not store duplicate copies of the full source domain record inside `engineering_objects.metadata`.

### Relation validation
The relation registry determines:
- allowed source type;
- allowed target type;
- whether duplicates are allowed;
- whether reverse relation is implied;
- whether temporal validity is supported.

Reject invalid relations before DB mutation.

### Revision rules
- Draft revision may be edited.
- Published revision is immutable.
- Superseding revision points to exactly one previous revision.
- A revision cannot supersede a revision from another object.
- Publishing must be transactional with audit/event emission.

### API response contract
Canonical object responses should expose:
```json
{
  "id": "uuid",
  "projectId": "uuid",
  "objectType": "DRAWING",
  "businessCode": "A-101",
  "name": "Level 1 HVAC",
  "status": "active",
  "currentRevisionId": "uuid|null",
  "relations": [],
  "sources": [],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Never return arbitrary metadata as a substitute for typed fields.

## Test strategy
Use unit tests for registry/domain validation and integration tests against PostgreSQL for persistence and isolation. Add at least one end-to-end flow:
`existing source row → canonical adapter → engineering object → relation → revision → publish → audit/event`.

## PR requirements
The implementation PR must contain:
- migration files;
- source code;
- tests;
- ERD update;
- docs update;
- explicit test commands and results;
- no unrelated refactors.

## Future milestone handoff
M44 must consume `engineering_sources` and `engineering_object_sources` rather than inventing another provenance model.
M45 must emit events for canonical mutations rather than creating a second audit/event mechanism.
M46 must use canonical object IDs and source references for calculations.
M48 must call typed tools over the application boundary and never directly mutate canonical tables.
