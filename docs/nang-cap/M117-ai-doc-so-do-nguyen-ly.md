# M117 — Đặc tả AI đọc sơ đồ nguyên lý → gợi ý tuyến tim (giai đoạn 3 của hướng đã chốt)

| Thuộc tính | Giá trị |
| --- | --- |
| Issue / Goal | AI đọc bản vẽ sơ đồ nguyên lý MEPF thành đồ thị kết nối, gợi ý sẵn tuyến tim cho kỹ sư sửa — khép kín "schematic → bản vẽ thi công" |
| Spec owner | Phiên chính (opusplan) |
| State | **Approved for implementation** — code được phép đi ngay sau M115/M116 (mọi khoá mặc định tắt); **PHÁT HÀNH rộng chỉ sau khi M115 verify + pilot ổn** |
| Người/ngày duyệt | Người dùng duyệt 2026-08-30 |
| Cập nhật | 2026-08-30 |
| Phụ thuộc | M115 (graph + hoàn thiện), M108 (pipeline AI nhiều tầng + `lib/nen/ai.ts`), M114 (`routingPolicy`, hành lang) |

> Không code khi chưa **Approved for implementation**. Đây là mảnh CUỐI của lộ trình nghiên cứu
> 2026-08-30 — không kéo lên trước M115/M116.

## 1. Problem, vai trò và bằng chứng

Sau M115, kỹ sư vẫn phải tự vẽ tuyến tim từ đầu bằng cách đọc sơ đồ nguyên lý (schematic) của
TVTK. Khảo sát thị trường 2026-08-30: chưa tool thương mại nào nhận schematic làm input; nhưng
nhóm "AI đọc-hiểu bản vẽ 2D" (Firmus — Bluebeam mua 9/2025, Kreo) chứng minh phần *đọc-hiểu* đã
khả thi. Nguyên tắc đã chốt: **AI hiểu ngữ nghĩa, thuật toán vẽ hình học** — AI chỉ dựng *đồ thị
kết nối* (nguồn → trục → nhánh → thiết bị, size, hệ) từ schematic; phần sinh tuyến tim dùng
routing tất định M114 trên mặt bằng; kỹ sư duyệt và sửa; hoàn thiện bằng M115.

## 2. Outcome, metric và guardrail

- **Target (pilot 1 hệ):** ≥80% cạnh/nút của schematic được AI dựng đúng (so người duyệt); tuyến
  tim gợi ý được kỹ sư giữ lại ≥50% chiều dài sau sửa; tổng thời gian schematic → bản vẽ hoàn
  thiện giảm thêm ≥30% so với chỉ có M115.
- **Guardrail:** (a) LLM **không bao giờ sinh tọa độ** — chỉ trả graph logic (JSON theo schema
  Zod); (b) hai chốt người duyệt: duyệt graph trên web TRƯỚC khi sinh tuyến, duyệt tuyến trong
  AutoCAD trước khi hoàn thiện; (c) thiếu `ANTHROPIC_API_KEY` hoặc `XBOSS_AI_BLOCK_CLASSIFY=0`
  ⇒ toàn bộ M117 ẩn, M115 vẫn nguyên vẹn (giống hợp đồng M108, không throw); (d) không gửi tên
  dự án/dữ liệu tài chính ra mô hình (chuẩn M108 §12).
- **Stop/rollback:** công tắc env tắt ngay không cần deploy; dữ liệu graph là bảng riêng, xoá
  được độc lập.

## 3. Nghiên cứu hiện trạng

- `lib/nen/ai.ts`: cửa duy nhất ra LLM (structured output Zod, retry, prompt-cache) — tái dùng.
- `lib/dich-vu/cad.ts` (khối `cad-block-phan-loai`, sau refactor #438): mẫu pipeline nhiều tầng
  "luật trước, AI phần chưa quyết, người duyệt cuối" + trần chi phí theo mẻ — sao chép mô hình.
- `dxf-parser.ts`: đọc DXF, block/attribute/text/line — nguồn dữ liệu thô của schematic.
- `NapLoBlockPanel.tsx` (M108): mẫu UI bảng duyệt lô trên web — tái dùng khung cho màn duyệt graph.
- `Core/Routing/` M114 + `XBOSS_VE_TUYENTUDONG`: sinh tuyến theo hành lang từ danh sách điểm cấp
  — chính là "đầu ra hình học" của M117.

## 4. Phương án

| Phương án | Lợi ích | Chi phí/rủi ro | Kết luận |
| --- | --- | --- | --- |
| Không làm | 0 | Kỹ sư đọc schematic tay (chấp nhận được — M115 đã gánh phần nặng) | Fallback vĩnh viễn |
| A. LLM đọc schematic và vẽ thẳng tuyến | "Một bước" | LLM sinh hình học — vi phạm nguyên tắc đã chốt, sai không kiểm soát | Loại |
| **B. 3 tầng: luật DXF → LLM ngữ nghĩa → routing tất định (chọn)** | Đúng nguyên tắc, chi phí AI thấp (chỉ phần luật không quyết được), kiểm soát từng chặng | Nhiều bước hơn | **Chọn** |

## 5. Scope / non-goals

**Scope:** upload schematic DXF lên web; trích xuất tầng-luật; LLM bù ngữ nghĩa; màn duyệt graph;
đẩy graph đã duyệt xuống plugin sinh tuyến tim gợi ý; bảng `cad_schematic_graphs`. Pilot 1 hệ
(cùng hệ pilot M115). **Non-goals:** đọc schematic PDF/ảnh scan (chỉ DXF ở phiên bản này); tự
sinh bản vẽ không qua kỹ sư; sizing/tính toán thuỷ lực (size lấy từ schematic, không tính lại).

## 6. User journey

1. **Web:** Admin/PM/kỹ sư upload DXF schematic vào dự án (mục mới trên
   `/engineering/chuan-hoa-ban-ve`, tab "Sơ đồ nguyên lý").
2. **Tầng 1 — luật (server, không AI):** parse DXF: block thiết bị (đối chiếu thư viện block M113
   theo tên/`kind`), text size/tag cạnh tuyến, line/pline nối — dựng graph thô bằng hình học
   schematic (điểm chạm = cạnh). Nút/cạnh suy được từ luật gắn `nguon=luat`; phần mơ hồ (text
   không khớp, block lạ, nhánh đứt) để `chua_quyet` — không đoán.
3. **Tầng 2 — AI ngữ nghĩa (một lượt/lô, qua `lib/nen/ai.ts`):** chỉ nhận phần `chua_quyet` + ngữ
   cảnh danh mục (hệ trong rule pack, block thư viện): gán thiết bị vào node, đọc size từ text
   gần cạnh, nối nhánh đứt nét. Trả JSON theo schema; giá trị ngoài enum ⇒ giữ `chua_quyet`.
   AI không lật kết quả tầng 1. `doTinCay` < 0.8 ⇒ đánh dấu cần người xem.
4. **Người duyệt trên web:** màn graph (danh sách nút/cạnh + SVG sơ hoạ từ toạ độ schematic),
   sửa/duyệt từng phần tử → bấm "Chốt graph" (ghi `trang_thai='da_duyet'`, audit ai/lúc nào).
5. **Plugin:** lệnh `XBOSS_TUYEN_GOIY` tải graph đã duyệt của dự án (API mới, xác thực ghép máy
   M99), kỹ sư chỉ định điểm nguồn + tầng trên mặt bằng; plugin ánh xạ thiết bị graph ↔ block đã
   đặt trên mặt bằng (`kind`/`systemId`/tag), rồi sinh tuyến tim bằng routing hành lang M114
   (`routingPolicy`) dưới dạng pline **nháp trên layer riêng**, kèm XData thuộc tính đã điền sẵn
   (hệ/size từ graph).
6. Kỹ sư sửa/di chuyển pline nháp như tuyến vẽ tay → nhận vào M115 (bước 3 `XBOSS_TUYEN_DOTHI`
   trở đi, quy trình y hệt). Từ đây M115 là đường chung, không phân biệt tuyến vẽ tay hay gợi ý.

Trạng thái: AI tắt ⇒ tab schematic vẫn dùng được ở mức tầng 1 + duyệt tay; thiết bị trong graph
không tìm thấy trên mặt bằng ⇒ liệt kê thiếu, sinh phần tìm thấy.

## 7. FR/NFR chính

- **FR1** Upload schematic: theo pattern upload hiện có (whitelist `.dxf`, giới hạn 50MB, lưu qua
  `lib/nen/storage.ts`), gắn `project_id` + hệ.
- **FR2** Tầng 1 thuần trong `lib/ky-thuat/cad/` (hàm mới trong `drawing.ts` hoặc module
  `schematic.ts` nếu vượt 300 dòng — theo ranh giới refactor #438), test node:test bằng DXF mẫu.
- **FR3** Tầng 2 trong `lib/dich-vu/cad.ts` (khối mới `cad-schematic`), hợp đồng y hệt M108: mẻ,
  trần chi phí, prompt-cache, không throw khi thiếu key.
- **FR4** Màn duyệt graph: quyền Admin/PM/engineer của dự án; mọi sửa ghi audit (ai, trước/sau).
- **FR5** API: `POST /api/engineering/cad/schematic` (upload+parse), `GET .../schematic/:id`
  (graph), `PATCH .../schematic/:id` (duyệt/sửa), `GET .../schematic/:id/plugin` (plugin tải, xác
  thực device pairing). Tất cả `force-dynamic`, `getCurrentUser()`, RLS theo `project_id`.
- **FR6** `XBOSS_TUYEN_GOIY` (plugin): sinh pline nháp layer `XBOSS-GOIY`, không đụng thực thể
  hiện có; chạy lại thay thế nháp của chính nó (idempotent theo id graph).
- **NFR:** chi phí AI trần theo lô như M108; graph 500 nút xử lý tầng 1 <5s; offline plugin: graph
  cache cùng cơ chế M113.

## 8. Acceptance criteria (rút gọn)

- **AC1** DXF schematic mẫu (đã chuẩn hoá) ⇒ tầng 1 dựng đúng ≥90% cạnh, phần mơ hồ ở `chua_quyet`
  — test node:test, không AI.
- **AC2** AI tắt (`XBOSS_AI_BLOCK_CLASSIFY=0`) ⇒ toàn pipeline vẫn chạy, chỉ thiếu tầng 2; không lỗi.
- **AC3** Giá trị AI trả ngoài enum/schema ⇒ giữ `chua_quyet`, không ghi bừa (test mock).
- **AC4** Chưa "Chốt graph" ⇒ `GET .../plugin` trả 409; sau chốt, plugin sinh đúng số tuyến nháp
  = số cạnh có thiết bị ánh xạ được.
- **AC5** `XBOSS_TUYEN_GOIY` chạy 2 lần ⇒ không nhân đôi pline nháp; xoá nháp không đụng thực thể khác.
- **AC6** Không gửi tên dự án/tài chính trong prompt (test quét payload như M108 AC).

## 9. Data contract và DDL

Migration mới (lấy số thật bằng `ls migrations | sort -V | tail -3` lúc code — không tin số đoán):

```sql
CREATE TABLE IF NOT EXISTS cad_schematic_graphs (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  system_id TEXT NOT NULL,               -- hệ theo rule pack drawTools
  file_path TEXT NOT NULL,               -- DXF gốc qua lib/nen/storage
  graph JSONB NOT NULL,                  -- {nodes:[{id,kind,blockName,tag,nguon,doTinCay}],edges:[{from,to,size,nguon}]}
  trang_thai TEXT NOT NULL DEFAULT 'nhap' CHECK (trang_thai IN ('nhap','da_duyet')),
  duyet_boi BIGINT REFERENCES users(id),
  duyet_luc TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schematic_project ON cad_schematic_graphs(project_id);
```

RLS theo `project_id` (pattern `cad_takeoff_boq_map` 0140). Append-only về schema; sửa graph =
UPDATE cột `graph` kèm audit (bảng audit hiện hành).

## 10. Chia PR

| PR | Nội dung | route: |
| --- | --- | --- |
| PR1 | Migration + tầng 1 (parse schematic → graph luật) + test DXF mẫu | `complex` (ranh giới quyết: schema JSONB graph + heuristic bắt cạnh trong schematic) |
| PR2 | Tầng 2 AI (`lib/dich-vu/cad.ts` khối mới) + API 4 route + test mock | `spec` |
| PR3 | Màn duyệt graph trên web (tab "Sơ đồ nguyên lý") + e2e axe | `standard` |
| PR4 | `XBOSS_TUYEN_GOIY` (plugin: tải graph, ánh xạ thiết bị, gọi routing M114, pline nháp) + tài liệu + verify | `spec` |

## 11. Điều kiện tiên quyết & rủi ro

- **Kích hoạt:** M115 đã verify tay + chạy pilot ổn (ít nhất 1 tầng thật); nợ verify M111 đã trả.
- Rủi ro chính: schematic TVTK vẽ tự do (không block chuẩn) ⇒ tầng 1 ra ít, dồn gánh sang AI/duyệt
  tay — chấp nhận ở pilot, đo tỉ lệ `chua_quyet` làm metric quyết định có mở rộng hệ tiếp hay không.
- Chi phí AI: dùng trần mẻ như M108; theo dõi qua log `lib/nen/log.ts` trước khi mở nhiều dự án.
