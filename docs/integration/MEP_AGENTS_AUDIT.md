# MEP-Agents → XBoss Integration Audit

**Status:** Stage A audit complete enough to start controlled integration
**Source:** `seeker19110/MEP-Agents` (`main`)
**Target:** `seeker19110/xboss`
**Policy:** integrate capability, not repository structure.

## 1. What was found

MEP-Agents is a Python/LangGraph/Streamlit engineering-agent system. Its README describes a multi-agent MEPF consulting office with Supervisor, Mechanical, Electrical, Plumbing, Firefighting, QS, CAD, BIM and Reviewer roles. It explicitly keeps engineering calculations deterministic in Python tools rather than asking the LLM to invent numerical results. fileciteturn26file0

The repository contains substantial reusable engineering capability, including:

- `src/hvac_tools.py` — psychrometrics, duct sizing, cooling-load and chilled-water calculations.
- `src/bim_tools.py` — BIM/clash and quantity-related tooling.
- `src/cad_geometry.py` — CAD geometry processing.
- `src/cad_loader.py` — CAD loading/parsing.
- `src/cad_block_replace.py` — block replacement.
- `src/cad_revision.py` — CAD revision support.
- `src/boq_diff.py` — BOQ/revision comparison.
- `src/agents.py` — multi-agent orchestration, role-specific models/tools and reviewer flow.
- `src/api.py` — standalone engineering API surface.
- `src/auth_jwt.py` — standalone authentication that must not become a second XBoss identity system.
- `data/standards/*` and `data/equipment_catalog.json` — engineering knowledge/reference data.
- `autocad/*` — AutoCAD integration scripts.

The current MEP-Agents runtime is Python while XBoss is a Next.js/TypeScript application. Therefore the first integration boundary should be an explicit service/tool contract, not a source-code copy. XBoss already has a TypeScript test/build/migration workflow. 

## 2. Classification

### KEEP — move/integrate as engineering capabilities

- HVAC/psychrometric deterministic calculations
- Electrical deterministic calculations
- Plumbing deterministic calculations
- Firefighting deterministic calculations
- BIM/clash algorithms
- CAD geometry and loading algorithms
- CAD revision/diff/restore logic
- BOQ diff/quantity algorithms where they do not duplicate XBoss commercial truth
- Engineering standards/catalog data after provenance/licensing review
- AutoCAD interoperability where technically and legally supportable

### ADAPT — wrap behind XBoss contracts

- `agents.py`: preserve orchestration concepts, but migrate to XBoss Agent Fabric and XBoss project context.
- `api.py`: replace standalone project/auth assumptions with XBoss engineering API contracts.
- QS/BOQ tools: return canonical Engineering Objects/quantities; XBoss remains owner of BOQ, cost and commercial truth.
- CAD/BIM tools: return evidence-backed object/geometry references rather than persisting their own project database.
- RAG/standards lookup: connect to XBoss provenance and knowledge layer.
- Usage/cost tracking: map to XBoss AI observability rather than a second billing ledger.

### REWRITE — architectural boundaries

- Standalone project/session persistence.
- Standalone authentication/authorization as a product identity system.
- Any direct mutation of business/project data from an AI agent.
- Any second canonical project/BOQ/contract/schedule model.
- Streamlit UI as a production product surface; retain only as a development/reference harness until XBoss Engineering UI exists.

### DEPRECATE after migration

- Phase patch modules (`agents_phase_*_patch.py`, `api_phase_c_mount.py`, etc.) once their surviving behavior is covered by tests and merged into canonical implementations.
- Duplicate legacy entry points and compatibility shims after all callers migrate.
- Generated artifacts committed to source control, including `.coverage`.

### EXTERNALIZE

- Heavy CAD/BIM processing that should run in isolated workers.
- GPU/vision workloads when they materially benefit from independent scaling.
- Vendor-specific LLM clients behind an XBoss AI gateway.

## 3. Architectural decisions

1. **XBoss owns identity:** user, organization, project, permissions, audit and lifecycle.
2. **XBoss owns commercial truth:** BOQ, cost, procurement, contract, variation and payment.
3. **Engineering services own calculations:** CAD/BIM geometry, engineering calculations, clash detection and deterministic quantity extraction.
4. **AI agents do not directly write engineering truth:** they call typed tools/services and produce evidence/provenance.
5. **No second database is introduced solely for MEP-Agents.**
6. **Python remains acceptable for specialist engineering workers.** The boundary is an API/event/tool contract, not a forced language rewrite.
7. **Repository merge is deferred** until the service boundary and canonical object model have passed golden-project tests.

## 4. First vertical slice

`Drawing → Engineering Object → Quantity → XBoss BOQ → Cost Impact`

The first slice should use one CAD capability from MEP-Agents, persist its result through M43 Project Kernel, attach source/revision/evidence references, and map the resulting quantity into existing XBoss BOQ semantics. No standalone MEP-Agents database is permitted.

## 5. Deletion rule

Delete only items proven to be generated, duplicated, obsolete or replaced. Historical design documents remain until their information has been migrated or intentionally superseded. Every functional deletion must name its replacement and have regression coverage.
