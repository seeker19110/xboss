# M98 — Đặc tả: xuất DXF R2000 đầy đủ & xử lý tệp DWG

| Thuộc tính       | Giá trị                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Issue / Goal     | Bản vẽ chuẩn hóa 2D phải mở lại được trên AutoCAD, giữ được kích thước và chữ nhiều dòng; và trả lời dứt điểm việc đọc thẳng tệp DWG |
| Spec owner       | (chờ gán)                                                                                                                            |
| State            | **Draft** — chờ duyệt                                                                                                                |
| Người/ngày duyệt |                                                                                                                                      |
| Cập nhật         | 2026-08-22 (thu hẹp còn **tầng 3** sau ADR-0006)                                                                                     |
| Quyết định nền   | `docs/adr/0006-plugin-autocad-va-pipeline-server.md`                                                                                 |

> Không code khi chưa **Approved for implementation**.

> **Cập nhật phạm vi 2026-08-22 (ADR-0006).** Đường chính chuẩn hóa bản vẽ chuyển sang
> **plugin AutoCAD** (`M99`). Đặc tả này thu hẹp còn **tầng 3 — pipeline server**:
> kiểm định tệp plugin tải lên, chạy hàng loạt không cần license AutoCAD, và xuất DXF
> R2000 cho luồng chỉ có DXF. **PR4 (ODA File Converter) bị BỎ** — plugin tải lên kèm
> **DXF sidecar** nên server không cần đọc DWG nữa. Mục 1(a) giữ nguyên vì vẫn là bằng
> chứng cho việc phải bỏ nhánh bịa hình học (PR1).

## 1. Problem, vai trò và bằng chứng

Kỹ sư MEPF chuẩn hóa bản vẽ trên `/engineering/chuan-hoa-ban-ve` rồi mở lại tệp bằng AutoCAD tại
công trường. Hai vấn đề tách bạch:

**(a) Tệp DWG tải lên không được đọc thật.** `parseDwgBinary` (`lib/cad/dxf-parser.ts:649`) **không
phải bộ đọc DWG**. Nó chỉ:

1. Đọc 6 byte header để nhận tên phiên bản (phần này đúng).
2. Quét chuỗi UTF-16LE/ASCII lẫn trong khối nhị phân.
3. Đoán tên layer/khối bằng regex trên các chuỗi quét được.
4. **Bịa toạ độ** cho mọi thực thể: `center: [1000 + (idx % 8) * 4000, 1000 + Math.floor(idx / 8) * 3000, 0]`
   — vị trí sinh từ chỉ số mảng, không liên quan gì tới vị trí thật trong bản vẽ.

Toàn hàm chỉ sinh 2 loại thực thể: `TEXT` và `INSERT`. **Không có một đường nét hình học nào** —
`LINE`/`POLYLINE`/`CIRCLE`/`ARC` không bao giờ được tạo, vì hình học trong DWG nằm ở dạng nhị phân
nén và đóng gói bit, không thể lấy ra bằng cách quét chuỗi.

Bằng chứng (chạy `parseDwgBinary` trên khối nhị phân có header `AC1032` + vài chuỗi tên layer):

```
tổng thực thể: 1
theo loại: { INSERT: 1 }
hình học (LINE/POLYLINE/CIRCLE/ARC): 0
toạ độ thực thể đầu: [ 2000, 2000, 0 ]      ← = 2000 + (0 % 6) * 5000, sinh từ chỉ số
```

Hệ quả nghiêm trọng hơn tệp hỏng: luồng `POST /api/engineering/cad/convert-to-dxf` nhận DWG → chạy
`parseDwgBinary` → `exportDxf` → trả về một tệp DXF **mở được, trông hợp lệ, nhưng nội dung là bịa**
(chữ thật của bản vẽ đặt trên một lưới toạ độ tự chế). Kỹ sư không có cách nào nhận ra bằng mắt.

**(b) Xuất DXF hiện ở R12.** Sau bản sửa 2026-08-22, bộ ghi `lib/cad/dxf-writer.ts` xuất R12
(AC1009) — mở được trên mọi AutoCAD, `ezdxf.Auditor` 0 lỗi. Đánh đổi đã chấp nhận: `DIMENSION` hạ
thành `LINE` + `TEXT` (R12 đòi block hình học `*D<n>` mới hợp lệ), `MTEXT` hạ thành `TEXT`.

## 2. Outcome, metric và guardrail

- **O1:** Tệp DXF xuất ra qua `ezdxf.readfile` + `Auditor` với **0 lỗi**, trên 100% bản vẽ mẫu.
- **O2:** `DIMENSION` giữ nguyên là đối tượng kích thước liên kết (sửa hình → số đo tự cập nhật);
  `MTEXT` giữ nguyên xuống dòng và định dạng.
- **O3:** Tệp DWG tải lên hoặc được chuyển đổi **thật**, hoặc bị **từ chối có thông báo rõ ràng** —
  tuyệt đối không sinh hình học bịa.
- **Guardrail:** không bản vẽ nào rời hệ thống mà chưa qua `validateDxf`; không gửi bản vẽ ra dịch
  vụ ngoài khi chưa có quyết định bằng văn bản của CĐT (hồ sơ thiết kế là tài sản dự án).
- **Stop/rollback:** bất kỳ bản vẽ mẫu nào audit ra lỗi → giữ nguyên đường R12, không phát hành.

## 3. Nghiên cứu hiện trạng

| Thành phần                               | Trạng thái                                                  |
| ---------------------------------------- | ----------------------------------------------------------- |
| `lib/cad/dxf-writer.ts`                  | Bộ ghi R12 + `validateDxf`, đã có test                      |
| `lib/cad/dxf-parser.ts`                  | Đọc DXF ASCII thật; `parseDwgBinary` chỉ quét chuỗi (mục 1) |
| `app/api/engineering/cad/convert-to-dxf` | Có `validateDxf`, trả 422 khi tệp hỏng                      |
| `app/api/engineering/cad/save-drawing`   | Có `validateDxf` trước khi ghi đĩa                          |
| **`Dockerfile.mepf-worker`**             | **Đã cài sẵn `ezdxf`** (dòng 25) trong worker Python 3.12   |
| `lib/engineering-worker-bridge.ts`       | Cầu nối điều phối việc sang worker (hàng đợi async)         |

Phát hiện quyết định phương án: **hạ tầng cần thiết đã có sẵn.** `ezdxf` là thư viện ghi DXF theo
đúng spec Autodesk (tự sinh handle, subclass marker, section `OBJECTS`, `BLOCK_RECORD`, dimension
block) và đang nằm trong image worker của chính dự án.

## 4. Phương án

### (a) Xử lý thẳng tệp DWG

| Phương án                                           | Lợi ích                                                                                      | Chi phí/rủi ro                                                                                                                      | Kết luận                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Giữ nguyên hiện trạng                               | 0                                                                                            | **Sinh bản vẽ bịa** — rủi ro hồ sơ nghiêm trọng                                                                                     | **Loại**                       |
| Tự viết bộ đọc DWG bằng TS                          | Không phụ thuộc ngoài                                                                        | DWG là định dạng **đóng, không công bố**, khác nhau theo từng phiên bản, nén LZ77 + đóng gói bit. Không khả thi trong phạm vi dự án | **Loại**                       |
| **ODA File Converter** (sidecar trong image worker) | Chuyển DWG→DXF **đúng**, mọi phiên bản, miễn phí, chạy **cục bộ** (bản vẽ không rời hạ tầng) | Nhị phân đóng, cần chấp thuận điều khoản redistribution; thêm ~200MB image                                                          | **Chọn**                       |
| LibreDWG (GPL)                                      | Mã nguồn mở                                                                                  | Hỗ trợ phiên bản mới chưa đủ; giấy phép GPL lan sang sản phẩm                                                                       | Dự phòng                       |
| API đám mây (Aspose/CloudConvert)                   | Không phải vận hành                                                                          | **Gửi hồ sơ thiết kế ra ngoài** — cần CĐT duyệt; chi phí theo lượt                                                                  | Loại (trừ khi CĐT chấp thuận)  |
| Yêu cầu người dùng tự xuất DXF từ AutoCAD           | 0 chi phí, luôn đúng                                                                         | Thêm 1 thao tác thủ công                                                                                                            | **Chọn làm phương án tạm PR1** |

### (b) Xuất DXF R2000 đầy đủ

| Phương án                                            | Lợi ích                                                                          | Chi phí/rủi ro                                                                                                                                                                                                                                                                                                                                                                          | Kết luận                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Không làm (giữ R12)                                  | 0 chi phí; đã mở được trên AutoCAD                                               | Mất dim liên kết + MTEXT                                                                                                                                                                                                                                                                                                                                                                | Giữ làm mặc định tới khi có nhu cầu thật |
| **A. Tự viết bộ ghi R2000 bằng TS**                  | Không thêm phụ thuộc                                                             | R2000 đòi handle duy nhất cho **mọi** thực thể + `$HANDSEED`, con trỏ owner (330), subclass marker (`100/AcDbEntity`, `AcDbLine`…), đủ 9 bảng bắt buộc (VPORT/LTYPE/LAYER/STYLE/VIEW/UCS/APPID/DIMSTYLE/BLOCK_RECORD), section `OBJECTS` với dictionary gốc + `ACAD_LAYOUT`, và dimension cần block `*D<n>` dựng tay. Sai 1 chỗ → AutoCAD không mở. Đây **chính là lớp lỗi vừa xảy ra** | **Loại**                                 |
| **B. Uỷ thác cho `ezdxf` trong worker Python đã có** | Thư viện chuẩn, tự lo toàn bộ mục trên; **đã cài sẵn**; kèm `Auditor` để tự kiểm | Luồng xuất thành bất đồng bộ khi qua worker; cần định nghĩa hợp đồng dữ liệu                                                                                                                                                                                                                                                                                                            | **Chọn**                                 |

## 5. Scope / non-goals

**Trong phạm vi:** hợp đồng dữ liệu bản vẽ (JSON) giữa app và worker; endpoint xuất R2000 qua worker;
chuyển DWG→DXF bằng ODA trong worker; chặn/cảnh báo tệp DWG khi chưa có bộ chuyển đổi; giữ R12 làm
mặc định và cho chọn R2000.

**Non-goals:** đọc DWG bằng TypeScript; xuất DWG (chỉ xuất DXF); 3D/BIM; sửa bản vẽ trong AutoCAD.

## 6. User journeys và mọi trạng thái

1. **Tải DXF → chuẩn hóa → xuất R12** (mặc định, đồng bộ): giữ nguyên như hiện tại.
2. **Xuất R2000**: chọn định dạng → job vào hàng đợi worker → trạng thái "đang xuất" → tải về khi
   xong. Lỗi worker → thông báo tiếng Việt + tự lùi về R12 kèm ghi chú mất dim liên kết.
3. **Tải DWG (PR1, chưa có ODA)**: từ chối rõ ràng — _"Hệ thống chưa đọc được tệp DWG. Vui lòng mở
   bằng AutoCAD và lưu thành DXF (Save As → AutoCAD 2000/LT2000 DXF), rồi tải lại."_ Kèm hướng dẫn.
4. **Tải DWG (PR3, có ODA)**: tự chuyển sang DXF trong worker rồi vào luồng chuẩn hóa bình thường.
5. Offline: hàng đợi giữ job, gửi lại khi có mạng.

## 7. Functional / non-functional requirements

- **FR1** Bộ ghi R2000 nhận cùng cấu trúc dữ liệu bản vẽ như R12 (không đổi mô hình trong app).
- **FR2** `DIMENSION` xuất thành dimension liên kết thật, có `DIMSTYLE` và block `*D<n>`.
- **FR3** `MTEXT` giữ nguyên nhiều dòng; chữ tiếng Việt hiển thị đúng dấu.
- **FR4** Mọi tệp xuất ra chạy qua `ezdxf.Auditor` **trong worker**; audit có lỗi → job FAILED, không
  trả tệp.
- **FR5** `validateDxf` phía app vẫn chạy như cổng chặn thứ hai; bổ sung nhánh hiểu R2000 (có
  subclass marker thì không báo `VERSION_WITHOUT_SUBCLASS`).
- **FR6** **Bỏ hẳn** đường sinh thực thể bịa trong `parseDwgBinary`: hoặc chuyển đổi thật, hoặc lỗi.
- **NFR1** Bản vẽ ≤50MB xuất xong trong ≤60s. **NFR2** Bản vẽ không rời hạ tầng tự host.
- **NFR3** Toàn bộ thông báo tiếng Việt. **NFR4** R12 vẫn là mặc định, không phá luồng đang chạy.

## 8. Acceptance criteria

- **AC1** _Given_ bản vẽ có LINE/LWPOLYLINE/CIRCLE/ARC/TEXT/MTEXT/INSERT/DIMENSION, _when_ xuất
  R2000, _then_ `ezdxf.readfile` + `Auditor` trả **0 lỗi 0 fix**. → test worker.
- **AC2** _Given_ bản vẽ có DIMENSION, _when_ xuất R2000 và đọc lại, _then_ thực thể vẫn là
  `DIMENSION` với `dimstyle` hợp lệ (không bị hạ thành LINE+TEXT). → test.
- **AC3** _Given_ chữ "Ống gió 800x500", _when_ xuất và đọc lại, _then_ chuỗi khớp chính xác.
- **AC4** _Given_ mọi toạ độ, _when_ xuất, _then_ Z = 0 (2D thuần). → test.
- **AC5** _Given_ tệp DWG, _when_ chưa có bộ chuyển đổi, _then_ API trả 422 với hướng dẫn xuất DXF —
  **không** trả bản vẽ có hình học sinh ra từ chỉ số. → test.
- **AC6** _Given_ tệp DWG và có ODA, _when_ chuyển đổi, _then_ số thực thể hình học > 0 và toạ độ
  khớp bản gốc trong sai số 1e-6. → test với cặp DWG/DXF đối chứng.

## 9. Kiến trúc và điểm chạm code

```
app  ──JSON hợp đồng bản vẽ──►  engineering-worker-bridge  ──hàng đợi──►  worker Python
                                                                          ├─ ezdxf  → ghi DXF R2000 + Auditor
                                                                          └─ ODA FC → DWG → DXF
```

File dự kiến: `lib/cad/drawing-payload.ts` (hợp đồng + kiểm), `app/api/engineering/cad/export-r2000/route.ts`,
`mepf-worker/` (handler `export_dxf_r2000`, `convert_dwg`), sửa `lib/cad/dxf-parser.ts` (bỏ nhánh
bịa), `lib/cad/dxf-writer.ts` (`validateDxf` hiểu R2000), `Dockerfile.mepf-worker` (thêm ODA).

## 10. API contract

- `POST /api/engineering/cad/export-r2000` → `{ drawingId | payload, format: "R2000" }` →
  `202 { jobId }`. Auth: `getCurrentUser()` + `CAN.manageDrawings`; kiểm project scope.
- `GET /api/engineering/cad/export-r2000/:jobId` → `{ status, dxfContent?, validation, error? }`.
- `POST /api/engineering/cad/convert-to-dxf` (đã có): thêm nhánh DWG → job worker; khi chưa bật ODA
  trả `422 { error, guide }`.
- Idempotent theo hash nội dung bản vẽ + định dạng; timeout 60s; retry tối đa 2.

## 11. Data contract và DDL

Không cần bảng mới nếu tái dùng hàng đợi async sẵn có của worker bridge. Nếu cần lưu vết bản xuất:
thêm cột vào `drawing_revisions` (`export_format TEXT`, `export_audit JSONB`) qua migration
**append-only** thuần `ADD COLUMN` — đi thẳng production được theo DoD.

## 12. Security/privacy/abuse

Bản vẽ là tài sản dự án → **chỉ xử lý trong hạ tầng tự host**, cấm API đám mây khi chưa có chấp
thuận. Kiểm kích thước/định dạng tệp tải lên; worker chạy không đặc quyền, thư mục tạm cách ly, dọn
sau job. Không ghi nội dung bản vẽ vào log. Rate limit endpoint xuất. Kiểm project scope để không
xuất chéo dự án.

## 13. UX/a11y/content

Thêm ô chọn định dạng xuất (R12 mặc định / R2000) kèm giải thích ngắn bằng tiếng Việt về đánh đổi.
Trạng thái job: đang xuất → xong → lỗi, có nút thử lại, không kẹt "Đang lưu...". Thông báo từ chối
DWG phải kèm hướng dẫn thao tác cụ thể trong AutoCAD.

## 14. Observability và vận hành

Metric: số job xuất theo định dạng, tỉ lệ audit lỗi, thời gian xuất p95, tỉ lệ DWG bị từ chối.
Alert khi tỉ lệ audit lỗi > 0. Runbook: worker chết → app tự lùi về R12 đồng bộ.

## 15. Test plan

- Unit (TS): hợp đồng dữ liệu; `validateDxf` nhận R2000 hợp lệ, vẫn bắt R2000 thiếu subclass.
- Worker (Python): mỗi loại thực thể → ghi → `Auditor` 0 lỗi; round-trip toạ độ/chữ tiếng Việt.
- **Golden file**: bộ bản vẽ mẫu cam kết trong repo, so sánh kết quả audit ở CI.
- Đối chứng DWG: cặp DWG + DXF xuất từ AutoCAD thật, so số thực thể và toạ độ.
- E2E: chọn R2000 → job → tải về; tải DWG khi chưa có ODA → thấy thông báo hướng dẫn.

## 16. Kế hoạch slice/PR

| PR      | Nội dung                                                                                                                                  | Route      | Phụ thuộc |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------- |
| **PR1** | **Bỏ nhánh bịa hình học trong `parseDwgBinary`**; DWG → 422 kèm hướng dẫn xuất DXF. Sửa lớp rủi ro hồ sơ **ngay**, không chờ phần còn lại | `standard` | —         |
| PR2     | Hợp đồng dữ liệu bản vẽ + handler `export_dxf_r2000` trong worker (ezdxf) + test golden file                                              | `spec`     | PR1       |
| PR3     | Endpoint `export-r2000` + hàng đợi + UI chọn định dạng + `validateDxf` hiểu R2000                                                         | `standard` | PR2       |
| ~~PR4~~ | ~~ODA File Converter~~ — **BỎ** theo ADR-0006: plugin tải lên DWG kèm DXF sidecar nên server không cần đọc DWG                            | —          | —         |

**PR1 nên tách và làm trước, độc lập với quyết định R2000.**

## 17. Rollout/rollback

R12 giữ làm mặc định suốt quá trình; R2000 bật sau cờ cấu hình. PR4 cần dựng lại image worker →
chạy staging trước. Rollback: tắt cờ, luồng về R12 đồng bộ, không mất dữ liệu.

## 18. Risk/assumption/open decisions

| Mục                                              | Xác minh/giảm thiểu                                  | Owner | Hạn | Quyết định                           |
| ------------------------------------------------ | ---------------------------------------------------- | ----- | --- | ------------------------------------ |
| Điều khoản redistribution của ODA File Converter | Đọc license, xin chấp thuận trước khi đóng vào image |       |     | **Mở**                               |
| Có thật sự cần dim liên kết không?               | Hỏi kỹ sư dùng thật: R12 (đã chạy) có đủ chưa        |       |     | **Mở — quyết định này chặn PR2/PR3** |
| Worker thành điểm chết đơn lẻ cho việc xuất      | Luôn giữ đường R12 đồng bộ làm dự phòng              |       |     | Giảm thiểu                           |
| Bản vẽ lớn vượt timeout                          | Đo với bản vẽ thật lớn nhất của dự án                |       |     | Mở                                   |

## 19. Approval

- [ ] Product/scope
- [ ] UX/a11y
- [ ] Architecture/API/data
- [ ] Security/RBAC/SoD/audit
- [ ] Test/telemetry/rollout/rollback
- [ ] Không còn blocking question

**Kết luận:** Draft — chờ duyệt  
**Người/ngày duyệt:**
