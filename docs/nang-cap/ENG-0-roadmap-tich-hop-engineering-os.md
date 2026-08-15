# ENG-0 — Lộ trình tích hợp "Engineering OS" (MEP-Agents/MEPF-Agents ↔ XBoss)

> Tài liệu lộ trình (không phải đặc tả 1 PR) — chốt theo yêu cầu người dùng 2026-08-14: "Nghiên
> cứu toàn bộ rồi viết đặc tả chi tiết rồi mới code" + sơ đồ lộ trình người dùng cung cấp trực
> tiếp (mục 2). Nghiên cứu nền: mã nguồn/tài liệu `seeker19110/mep-agents`
> (`progress.md` — đặc biệt mục 47 "Guiding principles", mục 48 "Long-term North Star" —
> `docs/DAC_TA_PROJECT_KERNEL.md`, `docs/DAC_TA_HE_THONG.md`, `docs/MEP_AGENTS_SUPER_PRO_SPEC.md`,
> `TECH_DEBT.md`, `docs/AUDIT_BOC_KHOI_LUONG.md`, `docs/RA_SOAT_LO_HONG.md`) + toàn bộ tài liệu
> nền của XBoss (`CLAUDE.md`, `PROJECT.md`, `spec.md`, `docs/audit.md`, `SECURITY.md`, `docs/adr/*`,
> `docs/api-v1.md`). Repo đích tích hợp thật sẽ là **`seeker19110/MEPF-Agents`** (người dùng xác
> nhận 2026-08-14: **"sẽ tích hợp sau này"** — repo đó hiện có nội dung giống hệt `mep-agents`
> tại thời điểm viết tài liệu này, coi là cùng 1 nguồn nghiên cứu, không tích hợp code XBoss với
> nó ở giai đoạn ENG-1).

## 1. Vì sao có tài liệu này — 2 sự cố cần biết trước khi đọc tiếp

1. **Đụng số "M43".** Một phiên/commit khác đã push thẳng `main` (`8c84e49 "feat: add M43
engineering kernel domain services"`, không qua PR/review, thiếu migration) dùng nhãn "M43"
   cho việc tích hợp Engineering Kernel. XBoss đã có `docs/nang-cap/M43-audit-trail.md` (module
   audit trail + `SET LOCAL` ngữ cảnh actor, đã xong từ lâu, chính là nền tảng GUC `app.project_id`
   mà RLS/M62 tái dùng — xem `docs/adr/0005-rls.md`). **Quyết định (người dùng chốt qua
   `AskUserQuestion`): không dùng lại dãy `M<xx>` của `docs/nang-cap/` cho lộ trình tích hợp
   này — dùng track riêng `ENG-<n>`.** "M43"/"M44"/"M45"/"M46" trong sơ đồ mục 2 là **nhãn khái
   niệm của người dùng** (không phải file `docs/nang-cap/M<xx>`) — quy đổi 1-1 sang `ENG-1..ENG-4`
   trong toàn bộ tài liệu XBoss.
2. **Đụng schema.** Trước khi phát hiện sự cố #1, phiên này đã tự thiết kế 1 schema Engineering
   Object khác (SERIAL PK, tên bảng khác) — đã **bỏ**, chốt dùng nguyên schema đã có trên `main`
   (`lib/engineering-kernel.ts`, UUID PK) làm chuẩn duy nhất, chỉ bổ sung phần thiếu (migration,
   cổng duyệt, API, quyền, UI) — xem `docs/nang-cap/ENG-1-mep-agent-integration.md`.

Bài học: **không lặp lại** — mọi việc thuộc track này đi qua nhánh + PR bình thường, không push
thẳng `main`.

## 2. Sơ đồ lộ trình (người dùng cung cấp, giữ nguyên cấu trúc)

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
              ENG-1  (khái niệm "M43" — MEP / Agent Integration)
                │
                ▼
              ENG-2  (khái niệm "M44" — Engineering Intelligence)
                │
                ▼
              ENG-3  (khái niệm "M45" — Engineering Workflow OS)
                │
                ▼
              ENG-4  (khái niệm "M46" — Multi-Agent Engineering OS)
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

Đối chiếu với chính lộ trình dài hạn MEP-Agents đã viết (`progress.md` mục 48, "Long-term North
Star") — cùng tinh thần, khác cách chia giai đoạn: họ đi thẳng `AEC ENGINEERING OS → Digital
Twin → Engineering Knowledge → AI Engineering OS`; sơ đồ trên chia nhỏ hơn ở nấc trung gian
(ENG-1..ENG-4) để mỗi bước có Foundation Gate riêng (mục 5) thay vì nhảy thẳng.

## 3. 12 nguyên tắc khoá kiến trúc — kế thừa từ MEP-Agents, áp dụng cho track ENG

MEP-Agents đã tự đúc kết 12 "Guiding principles" (`progress.md` mục 47) sau nhiều đợt sự cố thật
(monkey-patch lúc import gây bug production, reviewer "fail-open" giả duyệt, auth logic bị patch
đè). Track `ENG-*` của XBoss **kế thừa nguyên văn**, dịch sang bối cảnh XBoss:

| #   | Nguyên tắc (gốc MEP-Agents)                           | Áp dụng cụ thể ở XBoss                                                                                                                                                |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LLM không phải nguồn sự thật                          | Object từ MEP-Agents vào XBoss **không** tự động là sự thật — luôn `pending_review` (ENG-1 mục 3)                                                                     |
| 2   | Tính toán kỹ thuật phải xác định                      | XBoss không tự tính lại quantity/BOQ bằng suy luận AI — chỉ lưu số MEP-Agents gửi kèm evidence, map sang `boq_items` là thao tác con người xác nhận (ENG-2, chưa làm) |
| 3   | Mọi kết quả quan trọng có evidence                    | `engineering_objects.properties`/`source_revision_id` giữ vết nguồn — không cho ghi object không rõ nguồn gốc                                                         |
| 4   | Mọi thay đổi có revision lineage                      | `engineering_object_revisions` (đã có sẵn trên `main`) — mọi lần tạo/sửa/duyệt đều append, không ghi đè im lặng                                                       |
| 5   | Hành động rủi ro cao phải có policy/approval          | Cổng duyệt Admin/PM trước khi bất kỳ object nào ảnh hưởng `boq_items`/cost (ENG-1 quyết định #3)                                                                      |
| 6   | Mọi hành vi AI phải đo lường được                     | `api_key_id` gắn trên mọi bản ghi ingest — biết chính xác key/nguồn nào tạo ra dữ liệu gì                                                                             |
| 7   | Model có thể thay thế                                 | Không khoá cứng logic XBoss vào 1 phiên bản/loại agent cụ thể của MEP-Agents — hợp đồng là schema/API, không phải model                                               |
| 8   | Project state là canonical                            | `projects.id` của XBoss vẫn là nguồn sự thật duy nhất về dự án — MEP-Agents map vào, không tạo project song song                                                      |
| 9   | Domain engine phải chạy được không cần LLM            | Không áp dụng trực tiếp phía XBoss (domain engine là phía MEP-Agents) — ghi nhận để không vô tình xây phụ thuộc LLM vào đường ingest                                  |
| 10  | Đừng xây hạ tầng trước khi có tải thực tế             | Đúng lý do ENG-1 dừng ở "kho nhận", không tự xây ENG-2 (Intelligence)/ENG-3 (Workflow OS) khi chưa có dữ liệu thật                                                    |
| 11  | MEP là domain đầu tiên, không phải giới hạn kiến trúc | **Yêu cầu cứng cho ENG-1**: schema/API phải là **domain-agent integration pattern chung** (không hardcode riêng MEP) — xem mục 6                                      |
| 12  | Xây xong Engineering OS mới thử full autonomy         | Không có route/cấu hình nào trong ENG-1..ENG-4 cho phép agent tự mở rộng quyền của chính nó (mục 4)                                                                   |

Cũng đối chiếu `docs/MEP_AGENTS_SUPER_PRO_SPEC.md` §2.3 "Human-in-the-loop": bảng
confidence/risk → action của họ kết thúc ở dòng **"Safety-critical → Human approval bắt buộc"**
— đúng khớp cổng duyệt ENG-1 đã thiết kế trước khi biết passage này tồn tại (xác nhận chéo, không
phải trùng hợp — cùng một lớp rủi ro).

## 4. Boundary chống AI tự cấp quyền autonomy (bắt buộc cho MỌI phase ENG-1..ENG-4)

Luật cứng, áp dụng cho bất kỳ route/lib nào thuộc track `ENG-*` sau này, không chỉ ENG-1:

1. **Không route `ENG-*` nào được ghi vào `api_keys`, `role_permissions`, `CAN_DEFAULT`, hoặc bất
   kỳ bảng/map quyết định quyền nào.** Cấp/thu hồi scope API key, thêm quyền `CAN.*` luôn là thao
   tác tay của Admin qua UI hiện có — không có "self-service scope request" từ phía agent.
2. **`review_status`/cổng duyệt không có đường tắt tự động chuyển `pending_review` →
   `approved` dựa trên input từ chính API ingest.** Chỉ `POST /api/engineering/objects/:id/review`
   (session auth, `CAN.reviewEngineeringObjects` = Admin/PM) được đổi trạng thái này — API key
   (agent) không có scope nào gọi được route đó.
3. **Không có cấu hình "auto-approve theo ngưỡng confidence" trong ENG-1** — khác cơ chế
   `PROJECT_KERNEL_AUTO_ACTIVATE_CONFIDENCE` bên MEP-Agents (mục 13 `DAC_TA_PROJECT_KERNEL.md`).
   Nếu ENG-2+ sau này cần auto-approve, đó là quyết định nghiệp vụ mới, phải hỏi lại người dùng
   qua `AskUserQuestion` — không tự bật.
4. **Agent (MEP-Agents hay bất kỳ hệ ngoài nào gọi qua API key) không bao giờ có đường ghi trực
   tiếp vào `boq_items`/`payment_bills`/`cost`** ở bất kỳ phase nào trong track này — mọi tác động
   tài chính đi qua luồng con người xác nhận đã có sẵn của XBoss (nghiệm thu 2 bước, duyệt VO...).
5. **1 API key = 1 dự án, không có key toàn cục cho track `ENG-*`** (khác `/api/v1` đọc-only vốn
   cho phép key toàn cục) — giới hạn blast radius nếu 1 key bị lộ.
6. Mọi lần đổi rule ở mục này phải ghi vào `PROGRESS.md`, không âm thầm nới lỏng qua 1 PR nhỏ
   không nhắc tới.

## 5. Foundation Hardening — hiện trạng 7 trụ (đối chiếu code thật, không suy đoán)

Khác MEP-Agents (Phase OS-0 "Foundation Hardening" của họ **chưa bắt đầu** —
`docs/DAC_TA_PROJECT_KERNEL.md` mục 11), 7 trụ phía XBoss đã trưởng thành qua ~10 đợt audit
(`PROGRESS.md`). Track `ENG-*` **kế thừa nguyên trạng** hạ tầng này, không xây lại:

| Trụ                   | Hiện trạng XBoss                                                                                                | Bằng chứng                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| PostgreSQL            | Raw SQL tự quản, hệ migrate nhẹ append-only                                                                     | ADR-0001, ADR-0003                        |
| Storage               | Abstraction local/S3, path traversal chặn tập trung                                                             | M54 PR4 `lib/storage.ts`                  |
| Contracts             | API mở `/api/v1` đọc-only đã có contract/scope/versioning rõ ràng — mẫu để ENG-1 theo                           | `docs/api-v1.md`                          |
| Observability         | Sentry server+client, slow-query log, `/api/health`                                                             | `docs/audit.md` §10, `instrumentation.ts` |
| Security              | API là ranh giới duy nhất, rate-limit Postgres-backed, CSRF same-origin toàn cục, RLS lớp 2 trên bảng tài chính | `SECURITY.md`, ADR-0005, PR #327          |
| Backup/Restore        | `pg_dump` cron + `restore-check.sh` verify thật hàng tuần                                                       | `docs/audit.md` §7, `docs/ops/`           |
| Dependency Governance | Dependabot weekly + `npm audit --audit-level=high` gate CI + Actions pin SHA                                    | `SECURITY.md`, `.github/workflows/`       |

**Ghi nhận lệch tài liệu phát hiện khi rà (ngoài phạm vi sửa của track này, chỉ ghi nợ):**
`PROJECT.md` §3 và `SECURITY.md` vẫn ghi "XBoss không dùng RLS Postgres" — sai kể từ ADR-0005
(2026-07-18, RLS đã bật trên 11 bảng tài chính). Đúng lớp doc-drift đã lặp lại nhiều lần trong dự
án — nên sửa ở PR riêng, không trộn vào track `ENG-*`.

### Foundation Gate (điều kiện bắt buộc trước khi 1 PR thuộc `ENG-*` được coi là hoàn thành)

- [ ] Không thêm cơ chế Postgres/migration mới ngoài hệ migrate append-only sẵn có.
- [ ] Không thêm cơ chế lưu file mới ngoài `lib/storage.ts` nếu PR có upload (ENG-1 không upload
      file — xem "Ngoài phạm vi" trong đặc tả ENG-1).
- [ ] API mới (nếu có) phải có tài liệu contract cùng chuẩn `docs/api-v1.md` (scope/versioning/mã
      lỗi) — không tạo kiểu response ngoài quy ước.
- [ ] Không thêm route nào bỏ qua Sentry/log convention hiện có.
- [ ] Không thêm cơ chế xác thực/rate-limit mới — tái dùng `requireApiKey`/`hitRateLimit`.
- [ ] Nếu PR đụng dữ liệu (migration `UPDATE`/backfill) → qua staging trước, đúng DoD `CLAUDE.md`.
- [ ] `npm audit --omit=dev` 0 vulnerabilities sau khi thêm dependency mới (ENG-1 không thêm gói
      mới — `zod` đã có sẵn trong `package.json`).

## 6. ENG-1 (khái niệm "M43") — MEP/Agent Integration, ranh giới phạm vi

Đặc tả đầy đủ: `docs/nang-cap/ENG-1-mep-agent-integration.md`. Ràng buộc bổ sung từ track này
(nguyên tắc #11 mục 3 — "MEP không phải giới hạn kiến trúc"):

- Schema `engineering_objects`/`engineering_sources`/... **không có cột nào đặc thù riêng MEP**
  (vd không có cột `hvac_load`/`cable_size` cứng) — mọi dữ liệu domain-specific nằm trong
  `properties`/`geometry_ref` JSONB, đúng thiết kế đã có sẵn trên `main`. Domain khác (kết cấu,
  BIM kiến trúc...) dùng lại **đúng schema này**, chỉ khác giá trị `discipline`/`object_type`.
  Tên bảng cố tình **không** có tiền tố `mep_`/`mepf_` — xác nhận lại lúc code không lỡ đặt tên
  riêng theo domain.
- Cổng xác thực (`requireApiKey` scope `"engineering"`) và cổng duyệt (`review_status`) là cơ chế
  **chung cho mọi domain-agent** gọi vào track này sau này — không phải cơ chế chỉ dành cho
  MEP-Agents.
- **KHÔNG kéo phạm vi ENG-2/ENG-3/ENG-4 vào ENG-1** (đúng chỉ đạo người dùng "M43 không được kéo
  phạm vi M44–M46 vào làm quá sớm" + nguyên tắc #10 mục 3): không xây UI phân tích/khuyến nghị
  (ENG-2 "Engineering Intelligence"), không xây workflow nhiều bước duyệt (ENG-3 "Engineering
  Workflow OS" — khác cổng duyệt đơn giản 1 bước của ENG-1), không xây điều phối nhiều agent
  cùng lúc (ENG-4 "Multi-Agent Engineering OS").

## 7. ENG-2, ENG-3, ENG-4 — CHƯA viết đặc tả (có chủ đích)

Đúng nguyên tắc #10 (đừng xây hạ tầng trước khi có tải thực tế thật) — 3 phase này **chưa có file
đặc tả**, chỉ ghi định hướng khái niệm để không quên, chờ ENG-1 chạy thật với dữ liệu MEP-Agents
gửi sang rồi mới viết đặc tả chi tiết (đúng quy trình `AskUserQuestion` trước khi lập kế hoạch):

- **ENG-2 — Engineering Intelligence**: đọc dữ liệu đã duyệt trong `engineering_objects` để gợi ý
  (không tự quyết) map sang `boq_items`, phát hiện bất thường (object trùng, quantity lệch xa so
  với BOQ hiện có). Người quyết định cuối luôn là con người (nguyên tắc #1/#5).
- **ENG-3 — Engineering Workflow OS**: quy trình duyệt nhiều bước/nhiều vai trò cho object phức
  tạp (khác cổng duyệt 1 bước Admin/PM của ENG-1), tích hợp vào luồng nghiệm thu/VO đã có.
- **ENG-4 — Multi-Agent Engineering OS**: nhiều nguồn agent (không chỉ MEP-Agents) cùng ghi vào
  track `ENG-*`, cần cơ chế hoà giải xung đột dữ liệu giữa các nguồn — CHỈ làm khi có ≥2 nguồn
  thật cần hoà giải, không tự thiết kế cho tình huống giả định.

Vượt qua ENG-4 mới tới **Engineering OS → AI/Digital Twin → Predictive OS → Controlled
Autonomy** (mục 2) — ngoài mọi phạm vi lập kế hoạch hiện tại, chỉ ghi nhận làm điểm đến dài hạn
(đối chiếu "Long-term North Star" của chính MEP-Agents, `progress.md` mục 48).

## 8. Regression requirements — gate giữa các phase

Kế thừa bài học MEP-Agents ghi trong `docs/AUDIT_BOC_KHOI_LUONG.md` ("bất biến và test theo ca là
hai lưới khác nhau, cần cả hai" — sửa lỗi #20 vô tình gây lỗi #22, chỉ test theo ca cụ thể bắt
được) + văn hoá XBoss (`npm test` toàn bộ suite, không chỉ file mới):

- Mỗi PR thuộc track `ENG-*` chạy **toàn bộ** `npm run lint && npm run typecheck && npm test &&
npm run build`, không chỉ test của phase đang làm.
- Trước khi bắt đầu ENG-2, chạy lại toàn bộ test `ENG-1` (`tests/engineering.test.ts`) +
  `e2e/authed/engineering.spec.ts` — xác nhận vẫn xanh trên `main` mới nhất, không giả định "chắc
  vẫn ổn".
- Foundation Gate (mục 5) áp lại từ đầu cho mỗi phase mới — không chỉ kiểm 1 lần ở ENG-1.

## 9. Cập nhật tài liệu đi kèm

- `docs/nang-cap/README.md` — thêm dòng track `ENG-*` (tách khỏi bảng `M<xx>`, ghi rõ lý do tách
  ở mục 1).
- `PROGRESS.md` — mục mới ghi lại 2 sự cố (mục 1) + quyết định track `ENG-*` + trạng thái ENG-1.
