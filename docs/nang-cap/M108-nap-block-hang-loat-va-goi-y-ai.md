# M108 — Đặc tả: nạp block hàng loạt từ file tổng hợp + gợi ý phân loại bằng AI

| Thuộc tính       | Giá trị                                                                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Đưa MỘT tệp DWG tổng hợp chứa hàng chục/hàng trăm block vào thư viện trong một lượt, có **đề xuất phân loại tự động** (luật tất định → khớp ngữ nghĩa → vision), người duyệt theo lô                                                  |
| Spec owner       | Phiên chính (tầng 1)                                                                                                                                                                                                                  |
| State            | ✅ **Approved for implementation** — duyệt 2026-08-26. Thi hành theo §16 (PR1 mở đầu)                                                                                                                                                  |
| Người/ngày duyệt | Seeker (donghanhcungban.org@gmail.com), 2026-08-26 — "Approved for implementation". 4 quyết định nền chốt cùng ngày qua `AskUserQuestion`, ghi ở §4                                                                                  |
| Quyết định nền   | `docs/adr/0006-plugin-autocad-va-pipeline-server.md` (bản vẽ là nguồn sự thật, quy tắc tải từ XBoss), `docs/nang-cap/ENG-0-roadmap-tich-hop-engineering-os.md` (boundary chống AI tự cấp quyền), M103 (hàng chờ duyệt), M104 (đa tệp) |
| Tiền đề          | M99–M107 đã đóng về code. M108 **không** đụng pipeline chuẩn hóa/bóc tách, chỉ đụng đường **nạp** thư viện block + 2 chỗ gợi ý ánh xạ dùng chung cỗ máy đó                                                                            |

> ✅ Đã duyệt — được code. 3 open decision ở §18 (O1–O3) chốt trong PR2, **không chặn** PR1.

## 1. Problem, vai trò và bằng chứng

Thư viện block (`cad_block_libs`, M100 PR2) là nguồn sự thật cho `drawTools` (vẽ shop drawing) lẫn
`takeoff.blockNameMatchAny` (bóc khối lượng). Hiện có **đúng 2 đường nạp, cả hai đều một-block-một-lần
và người tự khai phân loại**:

| Đường            | Điểm vào                                                                          | Ràng buộc thật đo được trong code                                                                                                |
| ---------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| M103 — AutoCAD   | `XBOSS_VE_DEXUAT` → `VeDeXuatCommands.cs:85` `ed.GetEntity(...)`                  | Chọn **1** khối trên màn hình mỗi lần; `BlockUngVienBuilder.DocDinhNghia(db, idKhoi)` nhận đúng 1 `ObjectId`                     |
| M104 — web       | `POST /api/engineering/cad/block-lib/blocks` → `lib/ky-thuat/cad/block-them-web.ts` | `block-them-web.ts:45` tìm **đúng một** định nghĩa trùng `meta.blockName` người gõ trong form; block còn lại trong tệp bị bỏ qua |

Hệ quả thật: một tệp thư viện nhà cung cấp 200 block cần 200 lượt thao tác + 200 lần gõ metadata, và
**`kind` luôn do người gõ** — `docMetaBlockCoBan` chỉ *kiểm* tính nhất quán (vd `kind: equipment` bắt
buộc có attribute `TAG`, `kind: titleblock` bắt buộc `paperSize`), **không có một dòng nào suy ra `kind`**.

Cùng lớp vấn đề "khớp hai bảng tên do người khác đặt" còn xuất hiện ở 2 chỗ nữa, đang làm tay:

- `layerMap` của rule pack — hồ sơ từ TVTK mới về, layer tên lạ, phải sửa rule pack bằng tay từng đợt.
- `boqCode` per-project (M101 PR4, `lib/ky-thuat/cad/boq-map.ts`) — gán mã BOQ cho từng item bóc tách bằng tay.

## 2. Outcome, metric và guardrail

- **O1** Nạp tệp tổng hợp **100 block** từ lúc chọn tệp tới lúc thư viện có version mới trong **≤10 phút**
  thao tác người (so với ~100 lượt thao tác lẻ hiện nay).
- **O2** Tỷ lệ đề xuất `kind` **đúng ngay từ đầu ≥90%** trên bộ mẫu đối chứng §15.4 (tầng 1 một mình
  đạt ~70–80%; phần chênh là phần AI phải gánh).
- **O3** **0** block vào thư viện mà không qua mắt người: mọi lượt nạp lô đều dừng ở bảng duyệt.
- **O4** Thiếu `ANTHROPIC_API_KEY` → hệ thống vẫn nạp lô được bằng tầng 1, **không** chặn luồng,
  **không** lỗi 500.
- **O5** `layerMap`/`boqCode` gợi ý xong người chỉ còn sửa, không còn gõ từ trắng.
- **Guardrail:** AI **không đo hình học**, **không tự phát hành**, **không ghi thẳng DB**; mọi đề xuất
  của AI đi vào đúng hàng chờ `cad_block_proposals` (M103) và đúng `kiemDinhManifest`/`kiemThuocTinhTheoLoai`
  đang có. AI **không được lật** kết quả tầng 1 khi tầng 1 đã chắc.
- **Stop:** phát hiện một block vào thư viện với `kind` sai do đề xuất AI mà bảng duyệt không phơi ra
  được → tắt tầng 2/3 (`XBOSS_AI_BLOCK_CLASSIFY=0`), giữ tầng 1, mở lại sau khi vá.

## 3. Nghiên cứu hiện trạng

| Thành phần                                              | Vai trò sau thay đổi                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `lib/ky-thuat/cad/block-lib.ts`                         | **Giữ nguyên** — `docManifest`/`kiemDinhManifest`/`kiemThuocTinhTheoLoai`/`ghiSoBlockLib`/`versionPhatHanhKeTiep`     |
| `lib/ky-thuat/cad/block-proposals.ts`                   | **Giữ** hàng chờ + `docMetaBlockCoBan` + `soSanhManifestUngVien`; thêm đường nhận **đề xuất lô**                     |
| `lib/ky-thuat/cad/block-them-web.ts`                    | **Giữ** đường 1-block; M108 thêm module lô cạnh nó, tái dùng `idTuTenBlock`/luồng advisory lock                       |
| `lib/ky-thuat/cad/block-preview-svg.ts` (`dungPreviewSvg`) | **Tái dùng làm mắt của tầng 3** — render từng ứng viên thành SVG rồi rasterize làm input vision                     |
| `lib/ky-thuat/cad/dxf-parser.ts` (`parseDxf`)           | Nguồn đọc block table của tệp tổng hợp phía web                                                                      |
| `lib/ky-thuat/cad/boq-map.ts` (M101 PR4)                | Nhận thêm đường **gợi ý** `boqCode`; đường ghi `ghiMapBoqTheoDuAn` không đổi                                          |
| `lib/ky-thuat/cad/rule-pack.ts` + `rule-packs/*.json`   | Nhận thêm đường **gợi ý** `layerMap`; rule pack vẫn do người phát hành, AI không tự ghi                              |
| `plugin-autocad/.../BlockUngVienBuilder.cs`             | Mở rộng: nhận **danh sách** `ObjectId` thay vì 1                                                                     |
| `plugin-autocad/.../VeDeXuatCommands.cs`                | Thêm lệnh lô `XBOSS_VE_DEXUAT_LO`; lệnh cũ giữ nguyên hành vi                                                        |
| `app/engineering/chuan-hoa-ban-ve/components/ThemBlockTuWebForm.tsx` | Giữ form 1 block; thêm form lô cạnh nó                                                                   |
| **Mới** `lib/dich-vu/cad-block-phan-loai.ts`            | Cỗ máy 3 tầng, **ở tầng 5** vì phối hợp `ky-thuat` (block/rule pack) + `khoi-luong` (BOQ) — ADR-0007/0008           |
| **Mới** `lib/nen/ai.ts`                                 | Client Anthropic dùng chung, tầng 0, **thuần cấu hình + gọi mạng**, không biết gì về block/CAD                       |

**Hạ tầng LLM hiện có: KHÔNG.** `grep -rn "anthropic\|openai\|langchain\|..."` trên `lib/ app/ package.json`
trả về rỗng — M108 là chỗ **đầu tiên** đưa SDK LLM vào codebase XBoss. Boundary đã chốt ở `ENG-0/ENG-1`
(AI nặng sống ở repo Python riêng `mep-agents`, gọi vào XBoss qua API key có scope, object mới **luôn ở
trạng thái chờ duyệt**) áp dụng nguyên vẹn: M108 gọi model **từ server XBoss**, kết quả **luôn** vào hàng chờ.

## 4. Phương án — 4 quyết định đã chốt với người dùng (2026-08-26)

| Điểm                | Đã chốt                                                              | Hệ quả thi hành                                                                                          |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Đường nạp           | **Cả hai** — AutoCAD (lệnh lô) *và* web (kéo-thả DWG nhiều block)   | 2 điểm vào, **một** cỗ máy phân loại + **một** hàng chờ duyệt dùng chung                                  |
| Mức tự động         | **4 tầng, người duyệt lô**                                          | Tầng 2/3 tuỳ chọn, thiếu khoá → tự tắt, rơi về tầng 1                                                     |
| Trùng tên           | **Bỏ qua, báo rõ**                                                   | Giữ nguyên bản trong thư viện, liệt kê danh sách bỏ qua kèm lý do — cùng ngữ nghĩa `conflict` của M104   |
| Mở rộng dùng chung  | **Gợi ý `layerMap`** + **gợi ý `boqCode` per-project**              | Cả hai tái dùng đúng cỗ máy khớp ngữ nghĩa của tầng 2, đều bắt buộc người duyệt                          |

Lựa chọn nội bộ còn lại:

| Điểm                   | Phương án                                                       | Kết luận                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model                  | `claude-opus-5` vs Sonnet/Haiku                                  | **`claude-opus-5`** ($5/$25 per MTok, context 1M). Không hạ cấp model để tiết kiệm — quyết định đó là của người dùng, không phải của code                                                                        |
| Ép định dạng đầu ra    | Prompt tự do vs **structured output**                            | **`client.messages.parse()` + `output_config.format`** (zod schema): `kind` ép về đúng enum `LOAI_BLOCK`, không parse chuỗi tay, không hallucinate giá trị lạ                                                    |
| Đồng bộ vs bất đồng bộ | Gọi thẳng trong request vs **Batches API**                       | **Batches API** (`client.messages.batches`) — nạp lô là việc không nhạy latency, **giảm 50% giá**, tối đa 100k request/lô. Lô nhỏ (≤20 block) đi đường đồng bộ cho phản hồi tức thì                             |
| Vision                 | Dựng ảnh riêng vs **rasterize `dungPreviewSvg`**                 | **Tái dùng `dungPreviewSvg`** — đã có, đã test, chạy trên DXF thuần; rasterize sang PNG rồi gửi base64 (`type: "image"`). Không thêm phụ thuộc render nặng nếu tránh được (§18 open)                              |
| Thứ tự tầng            | Gọi AI cho mọi block vs **chỉ phần tầng 1 không quyết được**     | **Chỉ phần dư** — tầng 1 chắc thì dừng luôn, vừa rẻ vừa loại hẳn rủi ro AI lật kết quả đúng                                                                                                                     |
| Prompt caching         | Không vs **có**                                                  | **Có** — phần mô tả luật phân loại + danh mục item bóc tách là **prefix ổn định**, đặt trước, `cache_control: {type:"ephemeral"}`; phần biến thiên (danh sách block của lô) đặt **sau** breakpoint cuối          |

## 5. Scope / non-goals

**Trong phạm vi:** lệnh lô trong AutoCAD; upload DWG tổng hợp trên web; cỗ máy phân loại 4 tầng; bảng
duyệt theo lô (sửa được từng dòng, đánh dấu dòng nào do AI đề xuất); xử lý trùng tên "bỏ qua + báo rõ";
gợi ý `layerMap`; gợi ý `boqCode` per-project; audit ai/khi nào/tầng nào ra quyết định.

**Non-goals:** AI đo hình học (mãi mãi — ADR-0006); AI tự phát hành thư viện không qua người; AI sửa rule
pack; ghi thẳng `boq_items`/cột tiền (vùng rủi ro cao M45 — chỉ gợi ý ánh xạ, người duyệt); phân loại
block trong xref; đổi cấu trúc `cad_block_libs`/`cad_block_proposals` đã phát hành; **fine-tune/nhúng
model tự host**; dùng AI cho `XBOSS_KIEMTRA`/`XBOSS_BOCKL` (không nằm trong đợt này).

## 6. User journeys và mọi trạng thái

### 6.1 Journey A — nạp lô từ AutoCAD (`XBOSS_VE_DEXUAT_LO`)

1. Kỹ sư mở tệp thư viện tổng hợp trong AutoCAD → chạy lệnh.
2. Chọn phạm vi: **toàn bộ block table** (mặc định) hoặc quét chọn trên màn hình.
3. Plugin lọc bỏ (kèm **đếm được từng lý do**): xref, block ẩn danh `*U…`/`*D…`, layout, block đã có
   trong thư viện hiện hành (trùng tên → bỏ qua theo quyết định §4).
4. Plugin dựng **một** gói ứng viên duy nhất cho cả lô (một `blocks.dwg` gộp + manifest đầy đủ + sidecar
   DXF) — đúng cơ chế `BlockUngVienBuilder` hiện có, chỉ đổi 1 → N, vẫn **không đụng bản vẽ đang mở**
   (side database trên bản sao, tệp tạm dọn trong `finally`).
5. Gửi lên `POST /api/engineering/cad/block-proposals/batch` → server chạy phân loại 4 tầng → tạo **một**
   bản ghi lô ở trạng thái `pending`.
6. Plugin hiện: đã nhận N block, M bỏ qua (kèm lý do), link duyệt trên web.
7. **Trạng thái lỗi:** chưa đăng nhập / token hết hạn → yêu cầu `XBOSS_LOGIN`; `base_lib_version` lệch →
   409 + đánh dấu `stale` (đúng cơ chế M103 AC4); mất mạng → giữ gói tạm, cho gửi lại; tệp không có block
   nào đủ điều kiện → dừng kèm bảng lý do, không tạo lô rỗng.

### 6.2 Journey B — nạp lô từ web

1. `/engineering/chuan-hoa-ban-ve` → mục "Thư Viện Block" → **"Nạp lô từ tệp tổng hợp"**.
2. Kéo-thả cặp `.dwg` + `.dxf` **cùng nội dung** (server không chạy AutoCAD nên chỉ đọc được DXF —
   ràng buộc y hệt M104; `.dwg` là thứ phát cho plugin tải về sau).
3. Server `parseDxf` → liệt kê mọi định nghĩa block → lọc như §6.1 bước 3 → phân loại 4 tầng.
4. Vì server không gộp được DWG, mỗi block thành **một tệp riêng** mang `fileKey`/`fileSha256` — đúng
   mô hình đa tệp M104 §1, tệp nền `blocks.dwg` giữ nguyên.
5. Ra bảng duyệt (§6.3).
6. **Trạng thái lỗi:** thiếu `.dxf` → từ chối kèm hướng dẫn xuất DXF; DXF không parse được → từ chối
   nêu rõ dòng lỗi; 0 block hợp lệ → dừng kèm bảng lý do; tệp vượt trần → từ chối kèm số đo thật.

### 6.3 Journey C — duyệt lô (chung cho A và B)

Bảng một dòng một block: **ảnh xem trước** · tên block · `kind` đề xuất · hệ · item bóc tách · thuộc tính
đọc được · **nguồn quyết định** (`luật` / `ngữ nghĩa` / `hình ảnh` / `người sửa`) · **độ tin cậy** · **lý do
một dòng**. Người duyệt: sửa từng dòng, bỏ chọn dòng không muốn nạp, chọn tất cả/bỏ chọn tất cả, lọc theo
nguồn quyết định (xem nhanh riêng phần AI đề xuất). Bấm **Duyệt** → phát hành **một** version thư viện mới
chứa mọi dòng được chọn (1 transaction + `pg_advisory_xact_lock` trên `cad_block_libs` như M103/M104).
Bấm **Từ chối** → cả lô `rejected` kèm lý do. Đóng trình duyệt giữa chừng → lô vẫn `pending`, mở lại duyệt tiếp.

**Trạng thái:** `pending` · `approved` · `rejected` · `stale` (thư viện đã lên version khác trong lúc chờ)
· `withdrawn` (người đề xuất thu hồi) — **tái dùng nguyên `TRANG_THAI_DE_XUAT` hiện có**, không thêm enum mới.

### 6.4 Journey D — gợi ý `layerMap`

Trang chuẩn hóa → tải hồ sơ TVTK → "Gợi ý ánh xạ layer": server lấy danh sách layer lạ + `layerMap.groups`
của rule pack hiện hành → cỗ máy tầng 2 → bảng `layer lạ → layer chuẩn` kèm độ tin cậy + lý do → người
duyệt sửa → **xuất ra đoạn JSON `layerMap` để dán vào rule pack**. **Server không tự ghi rule pack** —
rule pack là dữ liệu phát hành có version, giữ nguyên đường phát hành hiện tại.

### 6.5 Journey E — gợi ý `boqCode` per-project

Panel "Mã BOQ theo dự án" (`MaBoqDuAnPanel.tsx`) → nút "Gợi ý từ danh mục BOQ": ghép
`danhSachItemBocTach()` với danh mục BOQ của dự án → bảng gợi ý → người duyệt → ghi qua đúng
`ghiMapBoqTheoDuAn` đang có. **Không có đường ghi tắt**, không đụng cột tiền.

## 7. Functional / non-functional requirements

**FR**

- FR1 Một lượt nạp lô xử lý **≥200 block** trong một tệp.
- FR2 Phân loại chạy đúng thứ tự tầng 1 → 2 → 3, **dừng ngay khi đủ chắc**; mỗi block ghi lại **tầng nào
  quyết định** và **lý do một dòng**.
- FR3 Tầng 1 (tất định, không mạng): tên block, layer chứa block, tập attribute, có khớp
  `takeoff.blockNameMatchAny` của rule pack hiện hành không. Dùng **đúng bộ matcher token-boundary
  dùng chung** đã có ở Core (`layerMap`/`takeoff` xài chung một matcher — nguyên tắc đã chốt ở M99 §6.5).
- FR4 Tầng 2 (khớp ngữ nghĩa): so tên block với block đã có trong thư viện + danh mục item bóc tách.
- FR5 Tầng 3 (vision): render ứng viên bằng `dungPreviewSvg` → ảnh → model nhìn hình đề xuất `kind`.
- FR6 Kết quả AI **ép về enum** `LOAI_BLOCK` bằng structured output; giá trị ngoài enum = coi như
  **không quyết được**, rơi về "chờ người khai", **không** bao giờ tự sửa thành giá trị gần đúng.
- FR7 Mọi dòng đều đi qua `docMetaBlockCoBan` + `kiemThuocTinhTheoLoai` **trước khi** vào hàng chờ —
  đề xuất AI không có đường vòng nào qua mặt luật metadata.
- FR8 Trùng tên với thư viện hiện hành hoặc với đề xuất đang chờ → **bỏ qua**, liệt kê rõ trong kết quả.
- FR9 Thiếu `ANTHROPIC_API_KEY` → tầng 2/3 tự tắt, tầng 1 chạy bình thường, UI nói rõ "gợi ý AI đang tắt".
- FR10 `XBOSS_AI_BLOCK_CLASSIFY=0` → tắt tầng 2/3 kể cả khi có khoá (công tắc dừng khẩn theo §2 Stop).
- FR11 Bảng duyệt sửa được mọi trường metadata của từng dòng trước khi phát hành.
- FR12 Phát hành lô = **một** version thư viện mới, **một** transaction, idempotent khi bấm 2 lần.

**NFR**

- NFR1 Nạp lô 200 block: tầng 1 xong **<5s**; tầng 2+3 qua Batches API xong **<1 giờ** (SLA batch), lô
  **≤20 block** đi đường đồng bộ xong **<60s**.
- NFR2 Gọi model **chỉ từ server**; khoá API **không bao giờ** rời server (plugin không giữ khoá — đúng
  ranh giới token `cad`/`XBOSS_LOGIN` đã có).
- NFR3 Lỗi/timeout/rate-limit của model **không** làm hỏng lượt nạp: bắt theo lớp lỗi typed của SDK
  (`RateLimitError` → lùi và thử lại; `BadRequestError` → bỏ tầng đó, ghi lý do), kết quả rơi về tầng thấp hơn.
- NFR4 Trần: ≤500 block/lô, ≤50MB/tệp, ≤200 ảnh vision/lô — vượt thì từ chối kèm số đo thật, không cắt âm thầm.
- NFR5 Toàn bộ nhãn/thông báo tiếng Việt (quy ước dự án).

## 8. Acceptance criteria

- **AC1** Tệp mẫu §15.4 chứa **≥50 block** nạp một lượt qua web → bảng duyệt đủ 50 dòng, đúng số dòng
  bỏ qua, đúng lý do bỏ qua.
- **AC2** `XBOSS_VE_DEXUAT_LO` trên cùng tệp mẫu ra **cùng tập block** như AC1 (hai đường không lệch).
- **AC3** Tỷ lệ `kind` đúng ngay từ đầu **≥90%** trên bộ đối chứng có nhãn chuẩn; tầng 1 một mình được
  ghi lại làm số nền để đo phần AI thật sự đóng góp.
- **AC4** Gỡ `ANTHROPIC_API_KEY` → AC1 vẫn chạy trọn, không 500, UI hiện "gợi ý AI đang tắt", mọi dòng
  mang nguồn `luật`.
- **AC5** Ép model trả `kind: "ống gió"` (giá trị ngoài enum, giả lập trong test) → dòng đó thành "chờ
  người khai", **không** có block nào vào thư viện với `kind` lạ.
- **AC6** Block trùng tên với thư viện hiện hành **không** được nạp; version thư viện sau khi duyệt
  **không** mất block cũ nào.
- **AC7** Duyệt lô 2 lần liên tiếp (bấm đúp) → chỉ **một** version mới sinh ra.
- **AC8** Trong lúc lô đang `pending`, phát hành một version khác → lô thành `stale`, duyệt bị chặn kèm
  lý do tiếng Việt (đúng hành vi M103 AC4).
- **AC9** Người sửa `kind` của một dòng do AI đề xuất → dòng đổi nguồn thành `người sửa`, thư viện lưu
  đúng giá trị người chọn.
- **AC10** Gợi ý `layerMap` ra JSON dán được vào rule pack; **không** có đường nào server tự ghi rule pack.
- **AC11** Gợi ý `boqCode` ghi qua đúng `ghiMapBoqTheoDuAn`; không route nào của M108 chạm bảng/cột tiền.
- **AC12** `npm run check:lib-layers` xanh — `lib/nen/ai.ts` không import ngược lên, `lib/dich-vu/cad-block-phan-loai.ts` không trả `NextResponse`.

## 9. Kiến trúc và điểm chạm code

```
[AutoCAD]  XBOSS_VE_DEXUAT_LO ──┐
                                 ├─→ POST /api/engineering/cad/block-proposals/batch
[Web]      form nạp lô ─────────┘         │ (route = ranh giới HTTP: auth + đọc tham số)
                                          ↓
                        lib/dich-vu/cad-block-phan-loai.ts   ← tầng 5, phối 2 miền, KHÔNG biết HTTP
                                          │
              ┌───────────────┬───────────┴───────────┬────────────────┐
        tầng 1 luật      tầng 2 ngữ nghĩa       tầng 3 vision     lọc trùng tên
        (thuần, test CI)   lib/nen/ai.ts          lib/nen/ai.ts    block-lib.ts
                                          ↓
                        cad_block_proposals (hàng chờ M103, + cột lô)
                                          ↓  người duyệt
                        ghiSoBlockLib → version thư viện mới
```

| Việc                            | Tệp                                                                  |
| ------------------------------- | -------------------------------------------------------------------- |
| Client model dùng chung         | **mới** `lib/nen/ai.ts`                                              |
| Cỗ máy phân loại 4 tầng         | **mới** `lib/dich-vu/cad-block-phan-loai.ts`                         |
| Nhận + phát hành lô             | **mới** `lib/ky-thuat/cad/block-lo.ts`                               |
| Hàng chờ (thêm khái niệm lô)    | `lib/ky-thuat/cad/block-proposals.ts`                                |
| Route nhận lô / duyệt lô        | **mới** `app/api/engineering/cad/block-proposals/batch/route.ts` + `[id]/approve` (mở rộng) |
| Gợi ý layerMap                  | **mới** `app/api/engineering/cad/layer-map-suggest/route.ts`         |
| Gợi ý boqCode                   | **mới** `app/api/engineering/cad/boq-map/suggest/route.ts`           |
| Form nạp lô + bảng duyệt lô     | **mới** `app/engineering/chuan-hoa-ban-ve/components/NapLoBlockPanel.tsx` |
| Panel gợi ý mã BOQ              | `app/engineering/chuan-hoa-ban-ve/components/MaBoqDuAnPanel.tsx`     |
| Lệnh lô trong plugin            | `plugin-autocad/XBoss.Cad.Acad/Commands/VeDeXuatCommands.cs`         |
| Dựng gói ứng viên N block       | `plugin-autocad/XBoss.Cad.Acad/Services/BlockUngVienBuilder.cs`      |
| Hộp thoại lệnh lô               | `XBoss.Cad.Core/Ui/ViewModels/` + `DataTemplate` trong `XBossDialog.xaml` (khung M106) |
| Đăng ký lệnh vào Ribbon         | `XBoss.Cad.Core/Ui/LenhCatalog.cs` (**bắt buộc** khai `Buoc`/`ThuTuTrongBuoc`, quên là không biên dịch) |

## 10. API contract

| Method | Đường dẫn                                          | Quyền           | Vào                                                                | Ra                                                                              |
| ------ | -------------------------------------------------- | --------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST` | `/api/engineering/cad/block-proposals/batch`       | Admin/PM/engineer | multipart: `dwg`, `dxf`, `baseLibVersion`, `nguon: "plugin"\|"web"` | `{ loId, tong, deXuat[], boQua[{blockName, lyDo}] }`                             |
| `GET`  | `/api/engineering/cad/block-proposals/batch/:id`   | Admin/PM/engineer | —                                                                   | trạng thái lô + danh sách dòng (kèm `nguonQuyetDinh`, `doTinCay`, `lyDo`)        |
| `POST` | `/api/engineering/cad/block-proposals/batch/:id/approve` | Admin/PM   | `{ dong: [{ id, kind, systemId, takeoffItemId, paperSize, chon }] }` | `{ version, soBlockThem }` \| 409 `stale`                                       |
| `POST` | `/api/engineering/cad/block-proposals/batch/:id/reject`   | Admin/PM   | `{ lyDo }`                                                          | `{ ok: true }`                                                                   |
| `POST` | `/api/engineering/cad/layer-map-suggest`           | Admin/PM        | `{ layersLa: string[], rulePackVersion }`                           | `{ goiY: [{ layerLa, layerChuan, doTinCay, lyDo }], jsonDeDan }`                 |
| `POST` | `/api/engineering/cad/boq-map/suggest`             | Admin/PM        | `{ projectId }`                                                     | `{ goiY: [{ takeoffItemId, boqCode, doTinCay, lyDo }] }`                         |

Mọi route: `getCurrentUser()` → 401 khi chưa đăng nhập; kiểm quyền qua `CAN`;
`export const dynamic = "force-dynamic"`; validate input; đường plugin đi qua token scope `cad` sẵn có.
Route **không** chứa logic — gọi `lib/dich-vu/cad-block-phan-loai.ts` rồi bọc `NextResponse` (ADR-0008).

## 11. Data contract và DDL

Migration **thêm thuần** (`CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX`, không đụng dòng dữ liệu hiện có)
⇒ theo DoD được đi thẳng production. Số hiệu: **`0144_cad_block_batches.sql`** (cao nhất hiện tại là `0143`).

```sql
CREATE TABLE IF NOT EXISTS cad_block_batches (
  id                    SERIAL PRIMARY KEY,
  nguon                 TEXT NOT NULL,              -- plugin | web
  base_lib_version      TEXT NOT NULL,
  candidate_storage_key TEXT,                       -- gói gộp (đường plugin); NULL với đường web đa tệp
  candidate_dwg_sha256  TEXT,
  status                TEXT NOT NULL DEFAULT 'pending',  -- tái dùng TRANG_THAI_DE_XUAT
  reject_reason         TEXT,
  published_version     TEXT,
  ai_enabled            BOOLEAN NOT NULL DEFAULT false,   -- lô này có chạy tầng 2/3 không
  proposed_by           INTEGER NOT NULL REFERENCES users(id),
  decided_by            INTEGER REFERENCES users(id),
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cad_block_batches_status ON cad_block_batches(status);

-- Mỗi dòng = 1 block ứng viên trong lô.
CREATE TABLE IF NOT EXISTS cad_block_batch_items (
  id               SERIAL PRIMARY KEY,
  batch_id         INTEGER NOT NULL REFERENCES cad_block_batches(id) ON DELETE CASCADE,
  block_name       TEXT NOT NULL,
  kind             TEXT,                    -- NULL = chưa quyết được, chờ người khai
  system_id        TEXT,
  takeoff_item_id  TEXT,
  paper_size       TEXT,
  attributes       JSONB,                   -- thẻ attribute đọc được từ định nghĩa
  file_key         TEXT,                    -- đường web đa tệp (M104 §1); NULL với gói gộp
  file_sha256      TEXT,
  preview_svg      TEXT,
  nguon_quyet_dinh TEXT NOT NULL,           -- luat | ngu_nghia | hinh_anh | nguoi_sua | chua_quyet
  do_tin_cay       NUMERIC(3,2),            -- 0.00–1.00; NULL với nguồn luat/nguoi_sua
  ly_do            TEXT,
  chon             BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cad_block_batch_items_batch ON cad_block_batch_items(batch_id);
```

RLS: theo đúng khuôn 2 nhánh đang dùng cho bảng CAD (xem `migrations/0143_mepf_joint_segmentation.sql`).
`do_tin_cay` là `NUMERIC` → **không** cộng/nhân ở JS ngoài mục hiển thị (quy ước M45; đây không phải tiền
nên không cần `lib/nen/money.ts`, nhưng vẫn không làm số học tích lũy trên float).

## 12. Security / privacy / abuse

- **Khoá API chỉ ở server.** `ANTHROPIC_API_KEY` đọc trong `lib/nen/ai.ts`; thiếu → tầng 2/3 tắt (**không**
  throw — đây là tính năng tuỳ chọn, khác `XBOSS_SECRET` bắt buộc fail-fast).
- **Dữ liệu gửi ra ngoài:** tên block, tên layer, thẻ attribute, ảnh xem trước hình học. **Không** gửi tệp
  DWG gốc, không gửi dữ liệu dự án/tài chính/nhân sự. Ghi rõ trong `docs/audit.md` và trên UI để người dùng
  biết đang gửi gì ra dịch vụ ngoài **trước khi** bật.
- **Prompt injection:** tên block/layer là dữ liệu do người ngoài đặt → coi là **dữ liệu, không phải chỉ thị**;
  structured output ép enum nên đầu ra không mở rộng được thành hành động; AI **không cầm tool nào** ghi được DB.
- **Rate-limit** đường nạp lô (thao tác nhạy cảm, tốn tài nguyên) theo `lib/bao-mat/ratelimit.ts`.
- **Audit:** ghi ai nạp lô, ai duyệt, dòng nào do AI đề xuất, tầng nào quyết — phục vụ điều tra khi block sai lọt vào.
- Trần kích thước/số lượng ở NFR4 chặn nạp lô làm cạn tài nguyên.

## 13. UX / a11y / content

Bám `app/components/ui/` (ADR-0009) — `Card`/`Button`/`Chip`/`Section`, `rounded-xl` thẻ / `rounded-lg`
control, emerald = đang chọn/hành động chính, amber-đỏ chỉ cho cảnh báo, nút ≥40px. Dark-first, **không**
`dark:`, **không** hex cứng (ADR-0010). Bảng duyệt lô là bảng dữ liệu dày → header dính, cuộn ngang,
`Skeleton` lúc tải. Độ tin cậy **không** chỉ thể hiện bằng màu — kèm số + nhãn chữ. Chip nguồn quyết định
có icon `lucide-react` riêng cho dòng do AI đề xuất. Mọi nhãn tiếng Việt.

## 14. Observability và vận hành

- Log mỗi lượt phân loại: số block, số quyết ở từng tầng, số token vào/ra, thời gian, số lần lùi-thử-lại.
- Đếm `usage.cache_read_input_tokens` để xác minh prompt caching thật sự ăn (bằng 0 lặp lại = có kẻ phá
  prefix, phải sửa).
- Sentry (`SENTRY_DSN`, đã có) nhận lỗi gọi model; lỗi model **không** báo động đỏ vì đã có đường lui.
- Biến môi trường mới, ghi vào `CLAUDE.md` mục "Biến môi trường quan trọng":
  `ANTHROPIC_API_KEY` (tuỳ chọn — thiếu thì tầng 2/3 tắt), `XBOSS_AI_BLOCK_CLASSIFY` (mặc định bật khi có khoá; `0` = tắt khẩn cấp).

## 15. Test plan

1. **Thuần, không mạng (node:test):** tầng 1 trên bảng ca tên/layer/attribute; lọc trùng tên; ép enum
   (AC5 — giả lập model trả giá trị lạ); dựng manifest lô; `soSanhManifestUngVien` với gói N block.
2. **Tích hợp DB (`TEST_DATABASE_URL`, import `tests/setup.ts` ĐẦU TIÊN):** tạo lô → duyệt → đúng một
   version mới (AC7); `stale` khi thư viện đổi giữa chừng (AC8); bỏ qua trùng tên (AC6).
3. **.NET (xunit, chạy trên CI Linux qua AcadShim):** `BlockUngVienBuilder` với N block; ViewModel hộp thoại
   lệnh lô; `LenhCatalog` đối chiếu mọi `[CommandMethod]`.
4. **Bộ đối chứng có nhãn chuẩn** (`plugin-autocad/testdata/`): **≥50 block** gán nhãn `kind` tay, gồm cả
   3 lớp khó — tên viết tắt tiếng Việt (`V1C`, `CO90`, `TE THU`), block không attribute, block tên vô nghĩa
   (`BLOCK1`…). Chạy đo AC3; **số nền của riêng tầng 1 phải được ghi lại** để biết AI đóng góp thật bao nhiêu.
5. **e2e Playwright:** kéo-thả tệp lô → bảng duyệt → sửa 1 dòng → duyệt → thư viện lên version.
6. **Ca tắt AI:** toàn bộ (1)(2)(5) chạy lại với `ANTHROPIC_API_KEY` gỡ bỏ (AC4).

Cổng: `npm run lint`, `npm run typecheck`, `npm test -- --release-gate`, `npm run build`,
`npm run check:lib-layers`, `npm run check:contrast`, `npm run check:mau-accent`.

## 16. Kế hoạch slice/PR

| PR  | Nội dung                                                                                              | route đề nghị |
| --- | ------------------------------------------------------------------------------------------------------ | ------------- |
| PR1 | Migration `0144` + `lib/ky-thuat/cad/block-lo.ts` + tầng 1 thuần + test (1)(2). **Chưa có AI, chưa có UI** | `spec`        |
| PR2 | `lib/nen/ai.ts` + tầng 2/3 + đường lui khi thiếu khoá + bộ đối chứng §15.4 + đo AC3                    | `complex`     |
| PR3 | Route batch + form nạp lô + bảng duyệt lô + e2e                                                        | `standard`    |
| PR4 | Plugin: `XBOSS_VE_DEXUAT_LO` + `BlockUngVienBuilder` 1→N + hộp thoại M106 + `LenhCatalog`              | `spec`        |
| PR5 | Gợi ý `layerMap` + gợi ý `boqCode` (tái dùng tầng 2) + 2 panel web                                     | `standard`    |

PR1 đứng một mình có ích (nạp lô bằng tay, không AI) — nếu §18 mở ra vấn đề thì dừng sau PR1 vẫn có giá trị.

## 17. Rollout / rollback

Bật dần: PR1–PR3 lên production với `XBOSS_AI_BLOCK_CLASSIFY` **tắt** → chạy thật vài lô bằng tầng 1 →
bật AI cho một dự án pilot → mở rộng. Rollback: đặt `XBOSS_AI_BLOCK_CLASSIFY=0` (tức thì, không cần deploy);
nặng hơn thì gỡ `ANTHROPIC_API_KEY`. Migration `0144` thêm thuần nên không có bước lùi dữ liệu; thư viện
block vốn có version nên phát hành nhầm thì phát hành lại version sau — **không sửa version cũ**.

## 18. Risk / assumption / open decisions

| #   | Rủi ro / giả định                                                                                            | Xử lý                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R1  | AI đề xuất `kind` sai, người duyệt bấm qua nhanh                                                              | Bảng duyệt lọc riêng được dòng do AI; độ tin cậy thấp phải sửa tay mới chọn được; audit đủ để truy ngược              |
| R2  | Chi phí gọi model vượt dự kiến                                                                                 | Chỉ gọi cho phần dư của tầng 1; Batches API giảm 50%; prompt caching; trần 200 ảnh/lô                                 |
| R3  | Đây là chỗ **đầu tiên** đưa SDK LLM vào codebase XBoss                                                         | Cô lập trong `lib/nen/ai.ts`; mọi tầng trên gọi qua một cửa; tắt được bằng biến môi trường                            |
| R4  | Bộ đối chứng §15.4 do chính người làm gán nhãn → đo AC3 dễ thiên vị                                           | Nhãn chuẩn do **kỹ sư trưởng/CAD manager** gán, không phải người viết code (đúng như M100 §16 đã chốt cho nội dung block) |
| **O1** | **Rasterize SVG→PNG trên server**: chọn thư viện nào, hay gửi thẳng SVG?                                    | **Cần chốt ở PR2.** Ưu tiên phương án **không thêm phụ thuộc render nặng**; nếu buộc phải thêm thì nêu rõ lý do trong PR |
| **O2** | Ngưỡng độ tin cậy để một dòng được **chọn sẵn** trong bảng duyệt                                            | **Cần chốt** — đề nghị mặc định 0.80, đo lại trên bộ đối chứng ở PR2 rồi điều chỉnh                                   |
| **O3** | Có gửi tên dự án/tên tệp kèm theo prompt để tăng độ chính xác không?                                        | **Đề nghị KHÔNG** ở đợt này (§12 giữ dữ liệu gửi ra ngoài ở mức tối thiểu); mở lại nếu AC3 không đạt                  |

## 19. Approval

- [x] Người duyệt: **Seeker** — ngày **2026-08-26** ("Approved for implementation").
- [x] State đã chuyển `Approved for implementation` — PR1 được phép bắt đầu.
