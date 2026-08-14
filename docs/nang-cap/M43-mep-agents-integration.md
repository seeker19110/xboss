# M43 — MEP-Agents Integration into XBoss Engineering OS

**Project:** XBoss  
**Milestone:** M43  
**Status:** READY FOR AI IMPLEMENTATION  
**Position:** First major milestone after Foundation Hardening  
**Objective:** Tích hợp MEP-Agents thành subsystem chính thức của XBoss Engineering OS.

> **Roadmap authority:** M43 không phải một feature cô lập. M43 là bước đầu tiên sau Foundation Hardening để chuyển XBoss từ hệ thống quản lý thi công thành Engineering OS. Mọi implementation của M43 phải bảo toàn các foundation guarantees và mở đường cho M44, M45, M46.

## 0. Engineering OS master roadmap

```text
FOUNDATION HARDENING
        │
        ├── PostgreSQL
        ├── Storage
        ├── Contracts
        ├── Observability
        ├── Security
        ├── Backup / Restore
        └── Dependency Governance
                │
                ▼
              M43
        MEP / Agent Integration
                │
                ▼
              M44
        Engineering Intelligence
                │
                ▼
              M45
        Engineering Workflow OS
                │
                ▼
              M46
        Multi-Agent Engineering OS
                │
                ▼
        ┌───────────────────┐
        │   Engineering OS  │
        └─────────┬─────────┘
                  │
                  ▼
          AI / Digital Twin
                  │
                  ▼
           Predictive OS
                  │
                  ▼
        Controlled Autonomy
```

### Foundation Hardening

Foundation Hardening là prerequisite/gate trước M43. Các capability nền tảng phải được kiểm tra và không được M43 làm suy yếu:

- PostgreSQL: schema integrity, migrations, transaction boundaries, connection/error handling.
- Storage: artifact persistence, addressing, versioning, integrity/hash và lifecycle.
- Contracts: stable domain/API/event contracts, validation và versioning.
- Observability: structured logs, metrics, tracing/error visibility.
- Security: authentication/authorization, project/tenant scope, secrets, least privilege.
- Backup/Restore: có khả năng backup, restore và verify dữ liệu quan trọng.
- Dependency Governance: lockfile, audit, version policy, license/security review và tránh dependency không cần thiết.

Nếu một foundation guarantee chưa tồn tại, AI phải ghi nhận gap và xử lý theo milestone Foundation Hardening tương ứng trước khi cho phép M43 đánh dấu COMPLETE. Không được dùng M43 để che giấu hoặc bypass foundation gaps.

## 1. Mục tiêu

M43 biến MEP-Agents từ hệ thống độc lập thành thành phần có contract rõ ràng để XBoss có thể phát hiện agent, khởi tạo, cấp context, giao nhiệm vụ, điều phối, nhận kết quả, validate, lưu trạng thái và audit.

MEP-Agents không được chỉ copy vào repo. Tích hợp phải qua integration boundary/adapter và giữ backward compatibility.

M43 phải tạo ra **domain-agent integration pattern** có thể tái sử dụng cho Architecture, Structure, Civil, BIM, CAD, Quantity, Cost, QA/QC, Compliance và các engineering agents tương lai.

## 2. Nguyên tắc bắt buộc

- Không rewrite XBoss chỉ để tích hợp MEP-Agents.
- Ưu tiên adapter/interface, không duplicate domain logic.
- Không hard-code LLM provider/model.
- Agent không phụ thuộc UI.
- Schema, validation, state transition, task/artifact/event identity phải deterministic khi có thể.
- Không đoán API/class/function của MEP-Agents; phải inspect source thực tế trước khi dùng.
- Không bypass Foundation Hardening.
- Không tạo coupling khiến M44/M45/M46 phải rewrite M43.
- Tách rõ intelligence, decision, authorization và execution; M43 chưa cấp autonomous authority cho agent.

## 3. Kiến trúc mục tiêu

```text
UI -> API/Application -> Engineering OS Core -> Agent Orchestration
                                                   |
                             +---------------------+------------------+
                             |                     |                  |
                        MEP Adapter           Future Agents      Generic Agents
                             |
                         MEP-Agents
```

Engineering OS Core quản lý Task, Project Context, State, Artifact, Event, Policy và Permission. MEP Adapter chuyển đổi giữa contract của XBoss và contract thực tế của MEP-Agents.

Foundation services phải nằm bên dưới các lớp này:

```text
PostgreSQL / Storage / Contracts / Observability / Security
                  / Backup-Restore / Dependencies
```

MEP-Agent không được tự bypass các foundation services.

## 4. Integration Contract

Định nghĩa semantic contracts tương đương:

```text
AgentRequest
- request_id
- task_id
- project_id
- agent_id
- task_type
- input
- context
- artifacts
- constraints
- model_policy
- tool_policy
- timeout
- metadata

AgentResponse
- request_id
- task_id
- status
- result
- artifacts
- events
- warnings
- errors
- metrics
- provenance
```

Không để response không có schema kiểm soát xuyên lên application/UI.

Contract phải versioned và đủ generic để M44/M45/M46 tái sử dụng mà không đổi semantic core.

## 5. Task lifecycle

Task tối thiểu có task_id, project_id, parent_task_id, task_type, status, timestamps, input/output, artifacts, errors và provenance.

State machine:

```text
PENDING -> QUEUED -> RUNNING -> COMPLETED
                         |\-> FAILED
                         |\-> CANCELLED
                         \-> WAITING -> RUNNING
```

Không cho transition bất hợp lệ.

## 6. Agent Registry và capability discovery

Cần abstraction tương đương `AgentRegistry` hỗ trợ register/unregister/get/list/resolve/health_check. Agent metadata gồm id, name, version, domain, capabilities, input/output schema, tools, model requirements, permissions và status.

Resolve theo capability, không hard-code agent name. Capability thực tế phải được xác định từ MEP-Agents source/docs, không tự bịa.

Registry phải đủ generic để sau này quản lý nhiều domain agents.

## 7. MEP Adapter

Luồng bắt buộc:

```text
XBoss Task -> normalize -> MEP contract -> MEP-Agent execution
           -> normalize result -> XBoss AgentResponse
```

Adapter không chứa domain logic lớn; domain logic thuộc MEP-Agents hoặc domain subsystem tương ứng.

Adapter phải là boundary có thể thay thế implementation MEP mà không làm thay đổi Engineering OS Core.

## 8. Context Bridge

Tạo/sử dụng `ContextResolver` để chỉ truyền context cần thiết: project metadata, discipline, units, standards, locale, constraints, decisions, relevant artifacts, previous task results và permissions.

Không gửi toàn bộ project context mặc định. Mục tiêu là giảm token/latency, tăng reproducibility và privacy.

Context model phải có khả năng mở rộng cho cross-discipline context ở M44/M45/M46.

## 9. Artifact Bridge

Artifact phải có identity tương đương:

```text
artifact_id, project_id, type, filename, version, hash,
storage_reference, mime_type, metadata, provenance
```

XBoss quản lý artifact lifecycle; MEP-Agent không tự quản lý storage của XBoss.

Artifact contract phải đủ generic để dùng cho CAD/BIM/document/model/simulation artifacts sau này.

## 10. Events và provenance

Execution quan trọng phải phát event, tối thiểu semantic events: AgentTaskCreated, AgentTaskStarted, AgentTaskWaiting, AgentTaskCompleted, AgentTaskFailed, AgentToolCalled, AgentArtifactCreated, AgentValidationFailed và AgentRetryStarted.

Event có event_id, event_type, timestamp, task_id, project_id, agent_id, payload và provenance.

Events phải phù hợp với observability foundation và có thể phục vụ audit/predictive analytics trong các milestone sau.

## 11. Error handling và retry

Map lỗi MEP-Agent về domain errors của XBoss. Các nhóm gồm VALIDATION_ERROR, CONFIGURATION_ERROR, DEPENDENCY_ERROR, MODEL_ERROR, TOOL_ERROR, TIMEOUT_ERROR, RESOURCE_ERROR, PERMISSION_ERROR, INPUT_ERROR và INTERNAL_ERROR.

Mỗi lỗi có code, message, retryable, details, cause và task_id.

Retry do orchestration layer quản lý, có giới hạn, exponential backoff/jitter và chỉ retry lỗi retryable. Không retry vô hạn hoặc retry lỗi input/schema deterministic.

## 12. Model và tool boundary

MEP-Agent không hard-code model/provider. Sử dụng abstraction tương đương `ModelRouter` nếu kiến trúc hiện tại hỗ trợ. Tool có input/output schema, permission, timeout, side-effect metadata và version. Tool infrastructure của XBoss không bị bypass.

M43 không trao quyền autonomous execution ngoài policy hiện có. Authorization phải tách khỏi reasoning của model.

## 13. Security

Agent không được tự do truy cập filesystem/database/external API. Tool calls phải chịu permission policy. Artifact access phải kiểm tra project scope. Secret/API key không đưa vào prompt và không ghi vào log.

Security boundary của Foundation Hardening là bất biến từ góc nhìn MEP-Agent.

## 14. Observability

Theo dõi tối thiểu task duration, agent duration, model latency, tool latency, token usage, retry count, error count, artifact count. Nếu có tracing, propagate trace_id/span_id qua XBoss -> orchestrator -> adapter -> MEP-Agent -> tool/model.

Không tạo một hệ observability song song nếu XBoss đã có foundation tương ứng.

## 15. Versioning

Integration contract và MEP integration phải có version. Breaking change phải tăng version. Provenance phải ghi version MEP-Agent.

Không để M43 tạo API contract chỉ dùng được cho MEP; contract phải là nền cho domain agents tiếp theo.

## 16. Bắt buộc inspect trước khi code

AI coding agent phải inspect toàn bộ XBoss và MEP-Agents trước khi implementation: architecture, entrypoints, agent layer, storage, API, tests, config, CI/CD, README/source/docs/dependencies/workflows/tools/models. Sau đó lập mapping component-to-component và xác định reusable/adapter-required/incompatible/duplicate/missing infrastructure.

Ngoài ra phải kiểm tra Foundation Hardening status và xác định mọi dependency của M43 lên PostgreSQL, Storage, Contracts, Observability, Security, Backup/Restore và Dependency Governance.

Không được đoán API chưa kiểm chứng.

## 17. Implementation phases

### M43.1 — Architecture Discovery

Deliverables: architecture map, dependency map, component mapping, foundation-gap analysis, integration strategy, risk list.

Commit: `m43: complete architecture discovery`

### M43.2 — Contract Layer

Implement AgentRequest, AgentResponse, Task, AgentMetadata, ArtifactReference, AgentError, Event và validation/tests.

Commit: `m43: add agent integration contracts`

### M43.3 — Agent Registry

Implement registry, resolver, capability discovery, health check và tests.

Commit: `m43: add agent registry`

### M43.4 — MEP Adapter

Implement XBoss Task -> MEP-Agent -> XBoss Response với integration tests.

Commit: `m43: integrate mep agents adapter`

### M43.5 — Context + Artifact Bridge

Implement ContextResolver, ArtifactResolver, ProvenanceMapper và tests.

Commit: `m43: add mep context and artifact bridge`

### M43.6 — Orchestration

Tích hợp lifecycle, resolution, execution, retry, timeout, cancellation và recovery.

Commit: `m43: integrate mep agent orchestration`

### M43.7 — Tool + Model Boundary

Enforce Tool Runtime, Model Router và Permission Policy theo kiến trúc thực tế.

Commit: `m43: enforce tool and model boundaries`

### M43.8 — Observability

Logging, metrics, tracing, events và provenance.

Commit: `m43: add mep integration observability`

### M43.9 — Security

Test permission denial, artifact isolation, secret leakage, unauthorized tool và project-scope violations.

Commit: `m43: harden mep integration security`

### M43.10 — End-to-End

Test User -> API -> Engineering OS -> Task -> Registry -> Adapter -> MEP-Agent -> Tool/Model -> Result -> Validation -> Artifact -> Event -> User.

Commit: `m43: complete mep integration end-to-end`

## 18. Test strategy

Phải có unit tests cho contract/validation/mapping/registry/state; integration tests cho XBoss <-> Adapter, Adapter <-> MEP-Agent, Agent <-> Tool Runtime, Agent <-> Model Router, Artifact/Context; E2E tests cho complete workflow; failure tests cho invalid input, missing artifact, unavailable agent, model/tool failure, timeout, permission denial, malformed response, partial result, duplicate task và retry exhaustion.

Ngoài ra phải verify regression của Foundation Hardening: database/storage integrity, contract compatibility, security boundaries, observability visibility và backup/restore assumptions không bị phá vỡ.

## 19. Acceptance criteria

M43 chỉ DONE khi:

- Foundation Hardening gates liên quan M43 PASS hoặc mọi gap được chuyển thành blocker rõ ràng ở milestone Foundation Hardening.
- MEP-Agents tích hợp bằng adapter/integration boundary.
- Agent contract, task lifecycle, registry và capability discovery hoạt động.
- Context/artifact bridge hoạt động.
- Orchestration, retry, timeout và cancellation hoạt động.
- Tool/model/permission boundaries hoạt động.
- Error mapping, events và provenance hoạt động.
- Observability và security tests đạt.
- Unit, integration, E2E và CI pass.
- Không có regression đối với foundation services.
- Integration pattern có thể tái sử dụng cho domain agents tương lai.
- Documentation và `progress.md` cập nhật.
- Có commit cuối M43.

## 20. Autonomous execution protocol

AI coding agent phải chạy loop:

```text
INSPECT -> PLAN -> IMPLEMENT -> TEST -> FIX -> VERIFY -> COMMIT -> NEXT PHASE
```

Sau mỗi phase: chạy test, sửa lỗi, regression check, cập nhật docs/progress, commit và tiếp tục phase kế tiếp. Chỉ dừng khi gặp destructive operation, security-sensitive decision không thể xác định từ source/spec, breaking change bắt buộc, thiếu credential/permission, hoặc requirement mâu thuẫn không thể giải quyết.

AI không được tự ý cấp quyền autonomy mới chỉ vì M43 cần agent execution. Quyền execution phải đến từ policy/authorization layer của Engineering OS.

## 21. Anti-patterns

Cấm copy toàn bộ MEP-Agents rồi sửa tùy tiện; duplicate infrastructure; UI gọi trực tiếp agent; agent truy cập DB tùy ý; hard-code provider/model/agent name; bỏ validation; nuốt exception; retry vô hạn; đánh dấu DONE khi test chưa pass; sửa test chỉ để CI xanh; tạo abstraction không có nhu cầu; bypass foundation services; để model tự quyết định authorization.

## 22. Final verification

Trước khi đóng M43 phải báo cáo PASS/FAIL cho Foundation Gates, Architecture, Contracts, Registry, Adapter, Context, Artifacts, Orchestration, Tools, Models, Security, Observability, Unit Tests, Integration Tests, E2E Tests, CI, Documentation và Progress. Chỉ khi toàn bộ mục bắt buộc PASS mới đặt `M43 = COMPLETE`.

## 23. M43 → M44 → M45 → M46 boundary

M43 phải dừng ở integration foundation và domain-agent execution boundary. Không kéo các mục tiêu tương lai vào M43 chỉ để “hoàn thiện”:

- **M44 — Engineering Intelligence:** knowledge/context intelligence, document understanding, engineering reasoning, validation và domain knowledge.
- **M45 — Engineering Workflow OS:** workflow orchestration, approvals, artifact lifecycle và human-in-the-loop engineering operations.
- **M46 — Multi-Agent Engineering OS:** multi-agent planning/delegation, cross-discipline coordination, verification và conflict resolution.

M43 phải cung cấp interfaces để ba milestone này phát triển mà không cần rewrite M43.

## 24. Future-proof requirement

Thiết kế phải cho phép bổ sung Architecture, Structure, Civil, Quantity Takeoff, Cost, BIM, CAD, GIS, Document Intelligence, Simulation và Compliance agents mà không thay đổi Agent Contract cốt lõi. MEP là domain-agent implementation đầu tiên của Engineering OS.

Sau M46, kiến trúc mục tiêu tiếp tục mở rộng theo:

```text
Engineering OS
      ↓
AI / Digital Twin
      ↓
Predictive OS
      ↓
Controlled Autonomy
```

Các tầng sau phải giữ nguyên nguyên tắc: intelligence không đồng nghĩa authorization; prediction không đồng nghĩa execution; autonomy luôn nằm dưới policy, safety, approval và audit.
