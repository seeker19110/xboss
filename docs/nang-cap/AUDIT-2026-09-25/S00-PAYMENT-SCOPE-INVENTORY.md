# S00 — Payment scope inventory: bills, floors, floor contract

Status: **PARTIAL / NOT DOMAIN-COMPLETE**. Static source review only; no disposable database
catalog or test run was permitted in this assignment. This inventory covers every HTTP method
declared directly under `app/api/payments/route.ts`, `app/api/payments/floors/route.ts`,
`app/api/payments/bills/route.ts`, and `app/api/payments/bills/[id]/route.ts`, plus the directly
identified UI consumers and table lineage relevant to those routes. It does not claim all
writers/readers of `payment_bills` or `floor_contracts` are mapped.

## Baseline and contract

- Repository HEAD reviewed: `735884536c66e443e2af9f873da3e5887dfbdacd` (current `origin/main` at
  work start), branch `codex/s00-payment-scope-inventory`.
- Scope: S00 payment endpoints; no files outside this inventory were changed.
- Required contract: QUALITY-FINAL-1 D01 requires every actor, including app admin, to stay
  inside the verified organization; non-admin membership must be explicit; invalid project input
  must not become an omitted filter; child resources must share the parent scope; multi-project
  reports use finite server-authorized IDs, never a client wildcard (`APPROVAL.md:23-40`).
- A1-FR02/03/06 require strict project selection, membership even when the membership table is
  empty, and matching scope across payment/certificate/sheet/project links
  (`A1-SCOPE.md:23-44`). A4-FR03 distinguishes known-project unassigned rows from invalid or
  contradictory lineage (`A4-REPORTING.md:32-47`). D06 requires one REPEATABLE READ READ ONLY
  snapshot for multi-statement reports (`APPROVAL.md:118-128`; `A4-REPORTING.md:70-73`).
- A3 requires exact money at API boundaries and private/no-store financial APIs
  (`A3-MONEY.md:32-45,74-83`). Q-AC05 requires every populated parent link on a payment bill to
  resolve to the same project; mismatches must be blocked or reconciled
  (`TEST-MATRIX.md:181-183`).
- The approved final gate says S00 is complete for a domain only when no domain row remains
  `NOT_MAPPED`; the static SOURCE-MAP is not a repository-wide inventory
  (`PLAN.md:17-28`, `SOURCE-MAP.md:118-132`).

## Shared actor, auth, permission, and project path

All seven methods below call `getCurrentUser()` and rely on the signed session cookie; none of
these handlers reads a project/org from the request as an authorization source. `getCurrentUser`
verifies the session token against the current user password fragment, session version, and org,
sets request actor context, resolves the project, then awaits permission snapshot loading
(`lib/bao-mat/auth.ts:86-124`). These route files have no API-key, cron, device, or service-token
auth path: **MAPPED: session cookie only for these handlers**. Other writers of the same tables
are outside this method inventory (see NOT_MAPPED below).

`CAN.viewPayments` defaults to admin/PM/BCH; `CAN.editStructure` defaults to admin/PM
(`lib/nen/roles.ts:23-25`; `lib/bao-mat/auth.ts:216-225`). `CAN` resolves an override using
request org, role, permission key, and current project, and falls back to role default only after
the permission snapshot is present (`lib/bao-mat/auth.ts:445-459`). This is project-aware
permission checking, but it does not validate a caller-supplied sheet/bill ID against that same
project unless the route separately does so.

Project selection is server-side from `xboss_project`, checked against projects in `user.orgId`
(`lib/ha-tang/projects.ts:9-20,65-86`). Static current behavior has two important transitional
semantics:

1. If the _entire_ `user_projects` table is empty, non-admins see every project in their own org;
   otherwise a non-admin sees only explicit rows (`projects.ts:36-48`). This is a fail-open
   compatibility bridge, expressly scheduled for a membership dry-run/cutover in its comment
   (`projects.ts:22-26`), but it does not meet approved A1-FR03.
2. An absent, malformed, or unauthorized cookie resolves to the first visible project; no visible
   projects resolve to `null` (`projects.ts:51-63,75-78`). The fallback is documented as
   temporary because many callers treat `null` as no filter. It conflicts with A1-FR02 for a
   missing selection among several projects and invalid explicit input.

For the endpoints below, **expected behavior after the approved cutover** is: reject/return no
business data for no membership, no verified project, or invalid explicit selection; never
interpret null as wildcard. The current helper path and several endpoints do not yet satisfy
that contract.

## Route/method inventory

### `GET /api/payments` — per-floor contract value and progress

- Source/evidence: `app/api/payments/route.ts:20-81`.
- Auth/permission: session cookie; unauthenticated 401 at 22-23; `CAN.viewPayments`, otherwise
  403 at 24-25. No row assignment check.
- Project/org: resolves selected project at 30. With a project, joins `towers` and filters
  `tw.project_id` at 31-33, 45-52, and 64-75. `sheet_types` has no direct project column;
  lineage is `work_packages.sheet_type_id → sheet_types.tower_id → towers.project_id`.
- Null/invalid: when resolver returns null, both SQL reads omit the tower join and project filter
  (31-33, 45-49, 64-69). A signed user with no visible project can therefore receive all
  projects' floor contracts/progress. Malformed/stale cookies may instead silently select first
  visible project via resolver. **Confirmed null-as-wide code path.**
- Reads/parent joins: query returns sheet type IDs/codes, responsible person, floor labels,
  task progress/count/delayed count and floor-contract value; the aggregate query repeats the
  scope pattern and calculates total contract/earned value. `floor_contracts` joins by
  `(sheet_type_id, floor_label)` only, which is its declared unique grain. There is no join to
  `projects.org_id` in route SQL; the selected project ID is the only scope predicate.
- DTO/masking/cache: response returns `{ rows, totalContract, totalEarned }` at 77-81. `contractValue`
  and totals are typed as JS `number` at 8-18; DB global NUMERIC parser converts to `parseFloat`
  (`lib/db/index.ts:11-15`). No route-specific monetary masking exists; route uses
  `CAN.viewPayments`. Route has `dynamic = "force-dynamic"` at 6, but no `Cache-Control` header
  in the response. SW sends all `/api/**` GET requests network-only at `public/sw.js:172-183`;
  this does not itself establish HTTP `private, no-store`. **A3 DTO/cache contract remains
  NOT_MAPPED/NOT_SATISFIED by route evidence.**
- Snapshot: two separate SQL statements at 35-53 and 57-75; not wrapped in a report transaction.
  The route reads sequentially, but default PostgreSQL statement snapshots can differ. No single
  repeatable-read snapshot is established. This does not meet D06/A4-FR06.
- Consumer: `/payments` page loads this route in `app/payments/page.tsx:171-191`; commercial IPC
  tab also loads it in `app/commercial/_components/IpcPaymentsTab.tsx:43-51`.
- Existing tests: actual handler unauthenticated/role checks and selected-project success are in
  `tests/route-tai-chinh-3a.test.ts:1303-1337`. No cross-project negative, null-membership,
  invalid-cookie, exact DTO, cache-header, or consistent-snapshot test is mapped.
- Verdict: **MAPPED / HIGH RISK**. Null opens a global query; multi-statement snapshot and money
  DTO/cache requirements remain gaps.

### `PATCH /api/payments` — upsert floor-contract value

- Source/evidence: `app/api/payments/route.ts:84-111`.
- Auth/permission: session cookie; 401 at 87-88; `CAN.editStructure` (default admin/PM), 403 at
  89-90. There is no call to `getCurrentProjectId` in this handler.
- Project/org: no project/org predicate or parent-scope validation. Body supplies each
  `sheetTypeId` and `floorLabel`; route interpolates those parameterized values into
  `INSERT ... ON CONFLICT` at 99-108. DB conflict key is `(sheet_type_id,floor_label)` from
  migration `0001_baseline.sql:460-468` and ERD `docs/ERD.md:2368-2386`. `floor_contracts` has no
  direct `project_id`; its project must be resolved via `sheet_types → towers → projects`.
- Null/invalid: not applicable as resolver is never called; however missing/invalid current
  project context is not rejected because no context check exists. A PM/admin authorized in
  project A can submit a valid `sheetTypeId` from project B and this handler performs the upsert;
  that is a **confirmed cross-project write path by code** (permission checks only role/selected
  request context; SQL has no scope condition). Invalid numeric `sheetTypeId` relies on database
  behavior/FK error rather than a route validation or scoped 404.
- DTO/validation/atomicity: body defaults to empty updates; no updates returns 200 at 92-95.
  Invalid/negative contract values are skipped at 97-98, but finite nonnegative values are
  written as JS numbers. Loops separate writes and are not transactional; a later failure can
  leave earlier rows committed. Response reports `updated: updates.length`, including skipped
  inputs (110). No audit, lineage comparison, or exact money parser is visible in this route.
- Consumer: `/payments` page constructs update IDs from loaded rows and PATCHes at
  `app/payments/page.tsx:286-315`.
- Existing tests: 401/403 and a selected-project happy upsert at
  `tests/route-tai-chinh-3a.test.ts:1339-1376`. No two-project foreign-sheet write rejection,
  no-project rejection, invalid ID, mixed valid/invalid batch atomicity, audit, or money-boundary
  test mapped.
- Verdict: **MAPPED / BLOCKING P1**. This is a direct cross-project mutation route; add project
  resolution and parent validation in any S02a remediation, then predicate the write on verified
  scope (with a transaction for the batch).

### `GET /api/payments/floors?person=...` — floor rows and payment history

- Source/evidence: `app/api/payments/floors/route.ts:23-97`.
- Auth/permission: session cookie; 401 at 26-27; `CAN.viewPayments`, else 403 at 28-29.
  Missing/blank `person` returns an empty list before project resolution at 31-32.
- Project/org: resolves at 38. Floor rows join `towers` and filter selected `tw.project_id` only
  when non-null (39-41, 50-64). History filters direct payment project to selected project **or
  `project_id IS NULL`** when non-null (42-43, 67-78). Both queries run inside
  `withProjectScope("*", ...)` (45-49); DB helper sets RLS context to wildcard and defaults a new
  transaction to READ ONLY (`lib/db/index.ts:210-239`).
- Null/invalid: null omits both floor and history filters (39-43, 56-60, 72-75) while explicit
  wildcard RLS context remains. Therefore null returns all people's matching floor rows and
  payment history for all projects. With selected project, every `payment_bills.project_id IS
NULL` history row is also included without establishing that its lineage belongs to selected
  project. Under A4-FR03/Q-AC05 that NULL alone cannot prove it is valid unassigned data.
  Resolver invalid-cookie fallback is as described above.
- Parent lineage: `sheet_types` has no project column; floor query uses sheet→tower project.
  History query uses only `payment_bills.project_id`, person/type, and non-null sheet/floor; it
  does not compare the bill's optional `contract_id`/`payment_cert_id` to its project or validate
  that `sheet_type_id` belongs to that project. `payment_bills` carries all four direct/parent
  columns per approved spec (`APPROVAL.md:126-128`; A4-FR03), added in migrations
  `0069_rls.sql:31-33`, `0012_contracts.sql:54-59`, `0014_payment_certs.sql:30`.
- Snapshot/DTO/masking/cache: two queries execute via `Promise.all` at 48-80 under default
  READ COMMITTED; not a consistent snapshot per D06. Returns `floorRows` with contract values
  and `history` with amount/pct/date, then computed `pctPaid` at 82-97. Response fields are not
  role-masked beyond viewPayments. No Cache-Control header in route; SW network-only API branch
  applies, but API HTTP no-store is not established by this file.
- Consumer: person history drawer calls this endpoint in `app/payments/page.tsx:729-733`.
- Existing tests: 401/403, blank person, and happy history response in
  `tests/route-tai-chinh-3a.test.ts:1705-1764`. `tests/payments-scope.test.ts:102-190` runs SQL
  copied from this route for selected project; no handler-level missing membership, null context,
  parent mismatch, invalid-cookie, or same-snapshot test.
- Verdict: **MAPPED / HIGH RISK**. Null broadens the route; project-scoped history accepts all
  NULL project rows without lineage proof; multi-statement snapshot gap.

### `GET /api/payments/bills` — payment bill list

- Source/evidence: `app/api/payments/bills/route.ts:32-79`.
- Auth/permission: session cookie; 401 at 33-34; `CAN.viewPayments`, else 403 at 35-36.
- Project/org: resolver at 41. If project exists, filter is `pb.project_id = ? OR pb.project_id IS
NULL` at 42-44. Query runs in `withProjectScope("*", ...)` at 46-50. The response query joins
  creator user and optional sheet and work-package name, but never constrains those parent joins
  to the bill's project (`65-72`).
- Null/invalid: `projectId=null` omits WHERE altogether (42-44), but still uses wildcard RLS
  context. Any authorized viewPayments user whose resolver yields null gets all payment bills.
  When project is selected, all project-null legacy rows are included, regardless of verified
  lineage. The code comment describes null as “DB has no project”, but resolver null also occurs
  for an unassigned non-admin once any global membership row exists (`projects.ts:38-48`). This
  assumption is therefore not valid for the current project resolver.
- DTO/masking/cache: returns bill id, responsible, type, period, `amount`, description/date,
  progress snapshot, note/unit/quantity/labor, sheet/floor/work-package labels, creator IDs/names
  and timestamp (`10-29,52-78`). No amount mask beyond `viewPayments`. NUMERIC is parsed to JS
  float globally (`lib/db/index.ts:13-15`); API type says `amount:number`. No route
  `Cache-Control: private, no-store` header; SW API fetch is network-only (`public/sw.js:176-183`).
- Consumer: `/payments` loads it in `app/payments/page.tsx:171-191`; POST and local state update
  at 228-264; print view loads and filters it client-side at `app/payments/print/page.tsx:69-91`;
  commercial IPC tab also fetches `/api/payments` (not bills) at
  `app/commercial/_components/IpcPaymentsTab.tsx:43-51`.
- Existing tests: handler 401/403 and selected-project happy case in
  `tests/route-tai-chinh-3a.test.ts:1382-1425`; SQL-copied scope test in
  `tests/payments-scope.test.ts:16-100`. The latter explicitly asserts unfiltered/null scope sees
  both project A and project B at lines 88-91; it preserves legacy broad behavior rather than
  testing the approved fail-closed contract. No test asserts NULL row lineage before inclusion.
- Verdict: **MAPPED / HIGH RISK**. Null returns every bill; selected-project filter admits all
  null-project rows; parent lineage and exact DTO/cache remain unproven.

### `POST /api/payments/bills` — create bill

- Source/evidence: `app/api/payments/bills/route.ts:81-180`.
- Auth/permission: session cookie; 401 at 85-86; `CAN.editStructure` default admin/PM, else 403
  at 87-88.
- Project/org: parses body fields including client-provided `sheetTypeId` and `floorLabel`
  (`102-103`), queries percent total and `floor_contracts` by sheet/floor only (`121-145`), then
  resolves current project at 153 and inserts that value into `payment_bills.project_id` at
  155-178. There is no check that the supplied sheet belongs to the selected project, nor that
  any implied contract/cert/sheet parents all share one org/project.
- Null/invalid: selected project missing resolves to null and insertion continues with NULL
  `project_id`; no fail-closed guard. A foreign sheet ID paired with current project can create a
  bill whose direct `project_id` conflicts with sheet lineage (assuming the IDs exist; the route
  has no predicate to reject it). This violates the A1-FR06/A4-FR03/Q-AC05 contract. Resolver
  invalid-cookie fallback can silently target first visible project.
- Business/atomicity: for bill type, percentage sum query at 121-128 has no `project_id` or
  transaction/row lock; floor contract query likewise has no project predicate; concurrent
  requests can both pass the 100% check (130-136). Amount uses JS `Number` multiplication
  `contractValue * pctThisPeriod` (118-146); payment amount is `NUMERIC(15,2)` per
  `0001_baseline.sql:470-485` / A3-FR02, so no exact rounding/scale validation is visible here.
  This is noted as a concrete code gap, not a DB-tested reproduction.
- DTO/masking/cache: response `{ok,id,amount}` at 180; unmasked amount returned to writer. No
  route cache header relevant to POST response.
- Consumer: add-bill UI sends form body at `app/payments/page.tsx:228-264`.
- Existing tests: 401, missing responsible, sequential over-100%, computed amount and selected
  project storage in `tests/route-tai-chinh-3a.test.ts:1428-1522`. No no-project/no-membership
  rejection, foreign-sheet rejection, mismatched parents, exact money boundary, or concurrent
  100% check test.
- Verdict: **MAPPED / HIGH RISK**. No fail-closed project requirement, client parent can mismatch
  project, and percentage limit is not serialized.

### `PATCH /api/payments/bills/:id` — edit bill metadata

- Source/evidence: `app/api/payments/bills/[id]/route.ts:20-63`.
- Auth/permission: session cookie; 401 at 23-24; `CAN.editStructure`, else 403 at 25-26.
- Project/org: resolve selected project at 31; helper checks direct bill project equals selected
  project **or project is NULL** at 10-17. After that separate read, UPDATE is only `WHERE id = ?`
  at 60-61 (no repeated scope predicate). No optional parents are revalidated.
- Null/invalid: helper returns `true` unconditionally when resolver returns null (11); any
  bill ID can proceed to edit when no project is resolved. With selected project, any row whose
  `project_id` is NULL is treated as belonging to that project; ownership is not established.
  These are confirmed null-as-wide/unknown-lineage code paths. Stale/malformed cookie fallback
  may select first visible project. `parseInt(idStr,10)` followed by finite check at 28-29 accepts
  numeric prefixes such as `123x` as ID 123; strict canonical ID validation is absent.
- Mutation fields: unit, quantity, labor, note only (`40-57`); `amount` is not patchable here.
  This handler is financial-record mutation nonetheless. Response returns `{ok:true}`.
- Consumer: `/payments` editor sends PATCH and applies optimistic client update without checking
  response at `app/payments/page.tsx:274-284`.
- Existing tests: 401, 403, bad ID, bad body, project B 404 while project A selected, no-op 400,
  and happy edit at `tests/route-tai-chinh-3a.test.ts:1529-1627`. No null resolver, NULL project
  row, parent mismatch, strict-ID, or race between ownership read and write test.
- Verdict: **MAPPED / HIGH RISK**. Empty scope authorizes any bill id; unknown-project bill rows
  are effectively selectable from any project; update predicate is not scope-bound.

### `DELETE /api/payments/bills/:id` — hard delete bill

- Source/evidence: `app/api/payments/bills/[id]/route.ts:65-82`.
- Auth/permission: session cookie; 401 at 68-69; `CAN.editStructure`, else 403 at 70-71.
- Project/org: same nullable helper as PATCH at 76-78; then hard DELETE only by `id` at 80.
- Null/invalid: helper returns true for any ID when project is null, so no-project context can
  delete a bill in any project. Selected project also accepts every row with `project_id IS NULL`
  as in-scope, without a lineage check. `parseInt` prefix behavior applies at 73-74. No
  scope-bound predicate is repeated on the destructive statement.
- DTO/audit: `{ok:true}` after hard delete. No soft-delete or explicit audit record is visible in
  this handler; actual foreign-key/delete side effects have not been DB-catalog checked.
- Consumer: UI confirms then calls DELETE at `app/payments/page.tsx:267-272`.
- Existing tests: 401/403, malformed ID, cross-project row 404 for a selected project, and happy
  delete at `tests/route-tai-chinh-3a.test.ts:1629-1698`. No null/no-membership or NULL-lineage
  delete-denial test.
- Verdict: **MAPPED / BLOCKING P1**. Fail-closed violation on hard delete; scope check and DELETE
  need to be atomic and project-predicated after parent lineage is validated.

## Data lineage and other discovered writers/readers

Static schema evidence (not a live catalog):

- `payment_bills` base columns and exact database amount/quantity types appear in
  `migrations/0001_baseline.sql:470-497` and `docs/ERD.md:960-994`.
- `project_id` and RLS policy were added by `migrations/0069_rls.sql:29-44`; migration backfills
  all NULL rows to `MIN(projects.id)` at 31-33. Current code still deliberately handles NULLs,
  so current data state cannot be inferred from the migration alone.
- `contract_id` added in `migrations/0012_contracts.sql:54-59`; `payment_cert_id` added in
  `migrations/0014_payment_certs.sql:30`; `sheet_type_id` predates this, in baseline
  `0001_baseline.sql:492`.
- `floor_contracts` has `sheet_type_id`, `floor_label`, `contract_value`, optional `contract_id`,
  and unique `(sheet_type_id,floor_label)`; no direct project/org column in baseline
  `0001_baseline.sql:460-468`; ERD static entry at `docs/ERD.md:2368-2386`. Its project lineage is
  through sheet/tower/project; optional contract parent should agree.
- RLS migration lists `payment_bills` among direct-project policy tables and supports `*` as
  cross-project context (`migrations/0069_rls.sql:35-70`). The two collection routes explicitly
  set `*`; their SQL predicates therefore determine application scope. The current session
  role's RLS bypass status and live policy/catalog state were not tested.

Further source search identified additional possible writers/readers not in the four directly
owned route files. Their full auth/scope/parent/test chains are **NOT_MAPPED** and must be added
before the payment domain can pass S00:

- `app/api/payment-certs/[id]/decide/route.ts:100-125` resolves contract through cert and inserts
  a bill with `contract?.projectId ?? null`; must map cert/contract/org scope and atomicity.
- `app/api/proposals/[id]/decide/route.ts:10-17,39-85` delegates optional bill creation to
  `decideProposal`; helper `lib/tai-chinh/proposals.ts:215-281` inserts `payment_bills`; inventory
  full selector, cross-parent consistency and route tests.
- `app/api/contracts/[id]/route.ts:58-62,73-...` reads payment bills and floor contracts for
  contract detail; map authorization, parent/org scope and masking.
- Other domain consumers exist in `lib/tai-chinh/cost.ts`, `lib/tien-do/evm.ts`,
  `lib/tien-do/reports.ts`, and `lib/tai-chinh/contracts.ts`. Full route/service call graphs,
  API/export/cache DTOs, query consistency, and consumer tests were not traced in this slice.
- Search of direct route SQL did not find other `INSERT/UPDATE/DELETE payment_bills` calls beyond
  the routes above plus payment-certificate/proposal decision paths. This is a textual search,
  not AST proof; indirect helpers, dynamic SQL, background/cron/device/API-key writers remain
  **NOT_MAPPED**.

## Test and evidence map

| Concern                             | Existing evidence                                                                                               | Missing required negative evidence                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual route auth and payment roles | `tests/route-tai-chinh-3a.test.ts:1303-1317,1382-1395,1428-1433,1529-1543,1629-1651,1705-1717`                  | Cross-org admin, BCH view-only, project override deny and cold-start permission failure at these exact endpoints                                                  |
| Selected project happy path         | `route-tai-chinh-3a.test.ts:1319-1337,1359-1376,1398-1425,1487-1522,1606-1627,1732-1764`                        | No membership, multiple memberships with absent/invalid cookie, stale cookie, and foreign project parent                                                          |
| SQL isolation copied from handlers  | `tests/payments-scope.test.ts:16-100,102-190`                                                                   | These are copied SQL, not route-handler tests; null test deliberately asserts cross-project result at 88-91; no negative behavior on malformed/no project context |
| Real route harness/session          | `tests/helpers/phien.ts:10-18,54-70,89-109`; suite gates on `HAS_TEST_DB` (`route-tai-chinh-3a.test.ts:1-5,29`) | Fixtures explicitly assign project; no empty-membership contract test for these handlers                                                                          |
| Report source, exactness, snapshot  | Spec only: `A3-MONEY.md:32-45,74-83`, `A4-REPORTING.md:32-47,54-73`, `TEST-MATRIX.md:112-127,181-183`           | Exact NUMERIC API boundary, report snapshot, same-grain/no-dup, NULL lineage, mismatch reconciliation, and concurrent payment limit tests                         |
| Cache contract                      | `public/sw.js:172-183` fetches API network-only                                                                 | No route response `Cache-Control: private, no-store` and no payment-specific assertion found in mapped tests                                                      |

No tests were run. DB availability, live schema constraints/indexes/RLS policies/role, membership
fixture catalog, HTTP cache headers in deployed infrastructure, query counts, and p95 are
**NOT_RUN**. Static `docs/ERD.md` is a source artifact and does not substitute for the required
disposable-PostgreSQL catalog.

## Confirmed gaps and minimal next slice

1. **P1 — project-unscoped floor-contract write:** `PATCH /api/payments` has no project resolution
   or sheet→tower→project validation (`route.ts:86-108`). Add a narrow S02a change with foreign
   project rejection and atomic scope-bound upserts; test handler-level project A vs project B.
2. **P1 — null-as-wide sensitive reads:** GET `/api/payments`, `/api/payments/bills`, and
   `/api/payments/floors` omit scope when project is null (`payments/route.ts:31-33`,
   `bills/route.ts:42-44`, `floors/route.ts:39-43`). Fail closed before queries; finite authorized
   project IDs only. Add route tests for no membership and malformed/unauthorized cookie.
3. **P1 — null-as-wide hard delete and edit:** bill ID helper accepts every ID for null project
   (`bills/[id]/route.ts:10-17`) and statements constrain only ID (`61,80`). Use one scoped
   transactional mutation with validated project and parent lineage; test NULL-parent and
   foreign-project rejection, including a race-safe predicate.
4. **A4/Q-AC05 — parent lineage:** verify every populated bill `contract_id`, `payment_cert_id`,
   `sheet_type_id` agrees with `project_id`; distinguish known unassigned rows from invalid
   lineage; do not include global NULL rows simply because a project was selected.
5. **A4-FR06 — coherent reads:** collection endpoints with multiple statements need one scoped
   `REPEATABLE READ READ ONLY` snapshot, set at transaction start. `/api/payments/floors` currently
   uses `Promise.all`; `/api/payments` reads two snapshots sequentially.
6. **A3 — money/cache DTO:** replace reliance on global NUMERIC→float in these money responses
   with the approved exact wire format where applicable; set and test `Cache-Control: private,
no-store` on every sensitive financial response. Current SW network-only rule is a separate
   defense, not a substitute.
7. **Follow-on S00 before claiming payment domain mapped:** inventory certificate/proposal writers,
   contract detail/cost/EVM/report readers, any device/API-key/cron/background callers, and
   nested parent joins; inspect live disposable DB catalog under the permitted app role; add
   route negative tests and reconcile all `NOT_MAPPED` rows. Do not globally flip resolver
   semantics until all remaining nullable callers are dispositioned under the plan.

## Cập nhật S02a cụm 3 (2026-10-08)

- **Mục 2 — ĐÓNG** cho `GET /api/payments` và `GET /api/payments/floors` (`GET /api/payments/bills`
  đã đóng trước đó): dự án qua `getCurrentProjectIdStrict` (cookie sai/không dự án khả kiến → 404,
  không query nghiệp vụ), lọc `tw.project_id = ?` / `payment_bills.project_id = ?` vô điều kiện,
  dòng legacy `project_id IS NULL` không còn hiện ở dự án nào; `Cache-Control: private, no-store`.
- **Mục 3 (P1-1) — ĐÓNG**: bỏ `billBelongsToProject`; PATCH/DELETE `/api/payments/bills/:id` là
  một câu UPDATE/DELETE có điều kiện `project_id = ?` + liên kết cha (hợp đồng/IPC/sheet) cùng dự
  án/org, `RETURNING` rỗng → 404. Dòng legacy NULL không sửa/xoá được qua dự án nào.
- Còn mở: mục 4 (đối soát/phân loại dòng lineage sai), 5 (snapshot REPEATABLE READ), 6 (DTO tiền
  chính xác), 7. Test: `tests/s02a-cum3-payments-scope.test.ts`.

## Cập nhật S13c (2026-10-08) — snapshot quyết định IPC: so sánh cơ chế có sẵn

A5 §4 / DATA-MIGRATIONS §7 đòi chứng minh cơ chế hiện có KHÔNG đáp ứng trước khi thêm bảng
snapshot. Đối chiếu với `POST /api/payment-certs/:id/decide`:

| Yêu cầu contract                                          | `audit_log` (trigger 0049)   | `approval_actions` (M46)     |
| --------------------------------------------------------- | ---------------------------- | ---------------------------- |
| KL/đơn giá/tỷ lệ/tổng exact + rule tại lúc quyết định     | Không (chỉ old/new dòng đợt) | Không                        |
| Cảnh báo canonical + warningVersion + xác nhận + lý do    | Không                        | Chỉ `note` tự do             |
| Khoá idempotency `(cert_id, operation_id)` + request hash | Không                        | Không (unique theo bước)     |
| Bước `pending` không đổi enum `payment_certs`             | Không                        | Có (bước), thiếu snapshot số |

→ Thêm `payment_cert_decision_snapshots` (migration `0160`, DDL theo DATA-MIGRATIONS §7) làm nguồn
duy nhất của hồ sơ quyết định; `audit_log` vẫn giữ vết kỹ thuật thay đổi dòng, `approval_actions`
vẫn là sổ bước của engine — không trùng nghĩa, không hai nguồn sự thật cho cùng dữ liệu.

## Cập nhật S13d (2026-10-08) — writer `approval_requests.amount` + DTO danh sách IPC

- Writer `approval_requests.amount`: `openApproval` (lập đợt IPC / VO / đề xuất — nay 422
  `amount_overflow` khi tràn NUMERIC(15,2)), `resyncApprovalAmount` (trình đợt IPC; **mới**: trình
  đề xuất), `kiemAmountTruocKhiDuyet` (**mới**: quyết định đợt IPC, chốt lại amount lệch giá trị
  đợt hoặc 409 `approval_amount_changed`). Không còn đường trình/duyệt IPC/đề xuất nào so ngưỡng
  bằng amount lúc lập nháp.
- `PATCH /api/payment-certs/:id` khoá hợp đồng → đợt (`khoaHopDongVaDot`), cùng thứ tự với lập
  đợt/trình/quyết định.
- Mục 6 (DTO tiền) cho `GET /api/payment-certs?contractId=`: opt-in decimal-string-v1 cho dòng KL
  (cùng adapter với chi tiết), `private, no-store` + `Vary`.
