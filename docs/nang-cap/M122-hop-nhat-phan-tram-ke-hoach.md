# M122 — Hợp nhất "% kế hoạch" và trọng số theo giá trị BOQ

| Thuộc tính       | Giá trị                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Issue / Goal     | Giai đoạn 3 của lộ trình cải thiện kế hoạch/tiến độ/tracking. Giai đoạn 2 = M121 (#464). |
| Spec owner       | Phiên chính (opusplan)                                                                   |
| State            | **Draft — chờ người dùng duyệt**                                                         |
| Người/ngày duyệt | (chưa)                                                                                   |
| Cập nhật         | 2026-09-03                                                                               |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

**Người dùng đã chốt hướng: trọng số theo giá trị BOQ.** Khảo sát mã nguồn 2026-09-03 cho thấy
hướng đó đúng cho **lớp phân tích**, nhưng hiện trạng có 4 điểm phải xử lý trước khi bật, nếu
không sẽ ra số liệu trông chính xác mà thực chất vô nghĩa.

**(a) Bốn cách tính "% kế hoạch" song song, không ai đối chiếu ai.**

| #   | Nơi tính                    | Công thức                                           | File:dòng                                        |
| --- | --------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| 1   | `GET /api/dashboard/scurve` | nội suy tuyến tính start→end, **bình quân số task** | `app/api/dashboard/scurve/route.ts:196-231`      |
| 2   | `GET /api/dashboard/spi`    | **copy nguyên `plannedRatio`**, bình quân số task   | `app/api/dashboard/spi/route.ts:20-25`, `:80-94` |
| 3   | `lib/tien-do/evm.ts` (PV)   | cùng nội suy nhưng **trọng số giá trị BOQ**         | `lib/tien-do/evm.ts:57-63`, `:219-229`           |
| 4   | `app/schedule/page.tsx`     | suy ra `pv / bac` từ EVM                            | `app/schedule/page.tsx:167-176`                  |

Hệ quả cụ thể: hub `/schedule` hiện **cùng lúc** hiện SPI lấy từ EVM (có trọng số) trong khi
`/api/dashboard/spi` cho ra SPI khác (không trọng số). Hai con số này không bao giờ được đối
chiếu, và không có gì nói cho người xem biết chúng khác nhau.

**(b) Độ phủ dữ liệu BOQ hiện KHÔNG AI BIẾT — và nhiều khả năng rất thấp.**

`boq_task_map(boq_item_id, task_id, weight)` là **con đường DUY NHẤT** để một task có giá trị
tiền. Cột `tasks.boq_code` **không hề được join với `boq_items.code` ở bất kỳ đâu** (đã grep toàn
repo) — nó chỉ là mã định danh duy nhất, không phải quan hệ giá trị.

Trong khi đó:

- `weight` **luôn nhập tay** qua `PUT /api/boq/:id/map` — không có cơ chế tự sinh
  (`app/api/boq/[id]/map/route.ts:9-11`).
- Hai script backfill hiện có (`scripts/backfill-boq.ts`, `scripts/seed-boq.ts`) **không đụng**
  `boq_task_map` một dòng nào.
- **Chưa có route/script nào đo được "bao nhiêu % task đã map BOQ"**. Chỉ số gần nhất là
  `valuedTasks`/`totalTasks` trong `EvmSummary` (`lib/tien-do/evm.ts:38-39`), nhưng chỉ trong
  phạm vi đang lọc và không hiện thành báo cáo.

**(c) Task chưa map BOQ đang được gán trọng số = trung bình các task đã map**
(`lib/tien-do/evm.ts:152-161`). Đây là chỗ nguy hiểm nhất: nếu độ phủ ~0%, công thức trọng số
**thoái hoá im lặng về đúng bình quân cũ** nhưng nhãn trên giao diện lại nói "theo giá trị BOQ".
Nếu độ phủ thấp và lệch (vd chỉ hệ ACMV được map), vài task được map sẽ **kéo lệch** toàn bộ
đường cong mà không ai hay.

**(d) Không có ràng buộc Σweight = 1** — chỉ cảnh báo mềm, không chặn
(`app/api/boq/[id]/map/route.ts:82-88`), không CHECK/trigger DB, không job kiểm định kỳ. Một task
còn có thể map nhiều dòng BOQ (PK là `(boq_item_id, task_id)`). Hệ quả đã có sẵn:
`Σ(weight × progress)` vượt 1 ⇒ `executedQty > qty_contract` mà không ai chặn.

| Vai trò | Không làm được / bị sai hôm nay                                                                                             |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| PM      | Nhìn hai chỗ trên cùng một trang ra hai SPI khác nhau, không biết tin cái nào.                                              |
| PM/BCH  | "% kế hoạch" đang coi task 200 ô ngang task 1 ô — không phản ánh giá trị hợp đồng, nên S-curve không dùng để đàm phán được. |
| Admin   | Không biết dữ liệu BOQ đã map được bao nhiêu, nên không biết con số EVM đang đáng tin tới đâu.                              |

## 2. Outcome, metric và guardrail

**Outcome:** một công thức "% kế hoạch" duy nhất, có **trọng số theo giá trị BOQ**, dùng chung cho
S-curve / SPI / EVM / hub — kèm **chỉ số độ phủ hiển thị công khai** để người xem biết con số đang
dựa trên bao nhiêu dữ liệu thật.

| Metric                                            | Baseline                 | Target sau M122                    |
| ------------------------------------------------- | ------------------------ | ---------------------------------- |
| Số cách tính "% kế hoạch" trong mã nguồn          | 4 (2 bản `plannedRatio`) | **1** (một hàm dùng chung)         |
| SPI trên hub `/schedule` vs `/api/dashboard/spi`  | 2 con số khác nhau       | **Bằng nhau** (cùng nguồn)         |
| Biết được độ phủ `boq_task_map`                   | Không đo được            | Có báo cáo, hiện ngay cạnh biểu đồ |
| Người xem biết số liệu dựa trên bao nhiêu dữ liệu | Không                    | Có nhãn độ phủ + cảnh báo khi thấp |

**Guardrail (dừng/rollback nếu vi phạm):**

- **KHÔNG đụng `tasks.progress_percent` và `work_packages.progress`.** Hai cột này nuôi gate
  nghiệm thu (`progress >= 1`), trần an toàn 0.99, gate "blocked" của Gantt/CPM, định nghĩa "trễ"
  (lặp ở ~14 chỗ), và số tiền trên `/api/payments`. Đổi chúng là đổi **hành vi**, không phải đổi
  cách hiển thị — nằm ngoài M122 (xem §5).
- **Không im lặng thoái hoá.** Khi độ phủ BOQ dưới ngưỡng, giao diện phải **nói rõ** là đang dùng
  bình quân số task, không được hiện nhãn "theo giá trị BOQ" trên dữ liệu không có thật.
- Không migration đụng dữ liệu; không sửa số đã lưu lịch sử (`payment_bills.progress_snapshot`,
  `baseline_tasks.progress_percent`, `mv_progress_daily`) — xem §11.

## 3. Nghiên cứu hiện trạng

**Ba tầng % hiện tại, đều là bình quân số học theo SỐ TASK:**

| Tầng           | Hàm/SQL                                                     | File:dòng                          |
| -------------- | ----------------------------------------------------------- | ---------------------------------- |
| Task           | `progressFromChecks` = tick/tổng ô, trần 0.99               | `lib/tien-do/recompute.ts:23-26`   |
| Nhóm           | `ROUND(AVG(progress_percent::numeric), 2)`, trần 0.99       | `lib/tien-do/recompute.ts:162-176` |
| Sheet/Hệ/Dự án | `AVG(t.progress_percent)` **lặp lại ~20 câu SQL khác nhau** | nhiều file                         |

**Ngoại lệ đã có trọng số:** `lib/tien-do/evm.ts` (PV/EV/BAC) và `boqExecutedQty`
(`lib/khoi-luong/boq.ts:61-72`). `migrations/0055_matviews.sql:9-12` ghi rõ EVM **cố ý không dùng**
`mv_progress_daily` vì matview chỉ lưu AVG không trọng số — tiền lệ tốt cho M122.

**Vì sao KHÔNG gom hết ~20 câu SQL trong M122:** phần lớn trong số đó phục vụ các mục đích khác
nhau (đếm task trễ, KPI theo sheet, bản đồ nhiệt tầng, workload…) chứ không phải "% kế hoạch".
Gom bừa vào một hàm sẽ đổi hành vi ở những chỗ không liên quan tới mục tiêu của đợt này.

**Điểm % dùng làm điều kiện nghiệp vụ** (đổi công thức = đổi hành vi, nên M122 tránh xa): gate
nghiệm thu task (`approve/route.ts:71`) và nghiệm thu tầng (`approvals/route.ts:128-133`), trần
0.99 chống mở khoá nghiệm thu sai, `deriveStatus`, gate hold-point, định nghĩa "trễ", cảnh báo
"sắp đến hạn"/"đình trệ", lọc lookahead, Gantt "blocked", chặn thanh toán vượt 100%, định mức.

## 4. Phương án

| Phương án                                                                            | Lợi ích                                                | Chi phí/rủi ro                                                                                                                                                                                          | Kết luận |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Không làm**                                                                        | 0 rủi ro                                               | Hai SPI mâu thuẫn trên cùng trang; S-curve không dùng để đàm phán được                                                                                                                                  | Bác      |
| **A. Đổi TOÀN BỘ % (cả task/nhóm) sang trọng số BOQ**                                | Nhất quán tuyệt đối                                    | Đổi **hành vi** gate nghiệm thu, "trễ", tiền trên `/api/payments`; trần 0.99 mất tác dụng ⇒ **mở khoá nghiệm thu sai**; phụ thuộc dữ liệu độ phủ chưa ai đo; số đã lưu lịch sử thành không so sánh được | **Bác**  |
| **B. Trọng số BOQ cho LỚP PHÂN TÍCH (S-curve/SPI/EVM/hub), giữ nguyên lớp vận hành** | Đạt đúng mục tiêu người dùng nêu; không đụng gate/tiền | Trong app tồn tại hai khái niệm % (vận hành vs giá trị) — phải nói rõ trên giao diện, nếu không người dùng tưởng số bị sai                                                                              | **Chọn** |
| **C. Bật trọng số nhưng chưa đo độ phủ**                                             | Nhanh                                                  | Độ phủ ~0% thì công thức thoái hoá im lặng về bình quân cũ, nhãn "theo giá trị BOQ" thành **nói dối**; độ phủ thấp mà lệch thì vài task kéo lệch cả đường cong                                          | Bác      |

**Quyết định:** phương án **B**, và **đo độ phủ trước khi bật** (PR1 trước PR3). Hai khái niệm %
tồn tại song song là có chủ đích, được đặt tên rõ trên giao diện:

- **% thi công** (lớp vận hành, giữ nguyên): bình quân ô/task — dùng cho lưới tracking, nghiệm
  thu, cảnh báo trễ, thanh toán. Đây là "đã làm được bao nhiêu phần việc".
- **% giá trị** (lớp phân tích, đổi sang trọng số BOQ): dùng cho S-curve, SPI, EVM. Đây là "đã
  làm được bao nhiêu phần giá trị hợp đồng".

## 5. Scope / non-goals

**Trong scope:**

1. **Báo cáo độ phủ BOQ** — đo tỉ lệ task đã map `boq_task_map`, phân bố theo hệ/sheet, và số
   dòng BOQ có Σweight ≠ 1. Có route + hiển thị.
2. **Một hàm dùng chung** tính % có trọng số giá trị (planned + actual) cho lớp phân tích, thay
   cho 2 bản `plannedRatio` sao chép và 2 chỗ bình quân riêng.
3. `GET /api/dashboard/scurve` và `GET /api/dashboard/spi` chuyển sang dùng hàm đó ⇒ SPI trên hub
   và SPI của route bằng nhau.
4. **Nhãn độ phủ hiển thị cùng biểu đồ**: nói rõ đang dùng trọng số giá trị hay bình quân task, và
   độ phủ bao nhiêu %.
5. Cảnh báo Σweight ≠ 1 gom thành danh sách để Admin sửa (hiện chỉ cảnh báo lúc PUT rồi mất).

**Non-goals (nói rõ để không bị nhặt thêm khi code):**

- ❌ **Không đụng `tasks.progress_percent`, `work_packages.progress`, `recomputeTask/Package`,
  `progressFromChecks`, trần 0.99, `deriveStatus`.** Toàn bộ lớp vận hành giữ nguyên.
- ❌ **Không đổi gate nghiệm thu, định nghĩa "trễ", cảnh báo, lookahead, Gantt blocked, thanh toán.**
- ❌ **Không sửa số đã lưu lịch sử**: `payment_bills.progress_snapshot`, `baseline_tasks.progress_percent`,
  `mv_progress_daily`. Chúng ghi theo công thức cũ và **phải giữ nguyên** để báo cáo cũ tái lập được.
- ❌ **Không gom ~20 câu SQL `AVG(progress_percent)` còn lại** — phần lớn phục vụ mục đích khác
  (đếm trễ, KPI sheet, heatmap, workload), gom bừa là đổi hành vi ngoài mục tiêu.
- ❌ **Không thêm ràng buộc CHECK Σweight = 1 ở DB** — dữ liệu hiện có gần như chắc chắn vi phạm,
  thêm CHECK sẽ làm mọi lần ghi BOQ đổ vỡ. M122 chỉ **báo cáo** để người dùng sửa dần.
- ❌ Không tạo cột `qty` cho `progress_dimensions` (M120 R1) — nó thuộc bài toán % thi công theo
  khối lượng vật lý, khác với % giá trị của đợt này.

## 6. User journeys và mọi trạng thái

**J1 — Admin xem độ phủ trước khi tin số.** Mở trang BOQ → khối "Độ phủ ánh xạ BOQ": _"412/1.850
task đã map (22%). 6 dòng BOQ có tổng tỷ trọng khác 1."_ → bấm vào xem danh sách để sửa.

**J2 — PM xem S-curve.** Biểu đồ hiện như cũ, thêm một dòng nhỏ dưới tiêu đề: _"Tính theo giá trị
BOQ — độ phủ 22%"_ (hoặc _"Tính theo bình quân số task — chưa đủ dữ liệu BOQ"_ khi độ phủ thấp).

| Trạng thái                    | Hành vi bắt buộc                                                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Độ phủ 0%                     | Dùng bình quân số task, nhãn nói **thẳng** "chưa có dữ liệu BOQ"; **không** hiện nhãn "theo giá trị BOQ"              |
| Độ phủ dưới ngưỡng            | Dùng bình quân số task + nhãn cảnh báo kèm số phủ thực tế; có link tới trang BOQ để bổ sung                           |
| Độ phủ đủ                     | Dùng trọng số giá trị, nhãn ghi rõ độ phủ                                                                             |
| Task chưa map trong ca đủ phủ | Gán trọng số = trung bình task đã map (giữ quy tắc EVM hiện có), và **đếm vào phần "chưa map" của nhãn** để minh bạch |
| Σweight ≠ 1                   | Không chặn tính toán (dữ liệu cũ đang vậy), nhưng liệt kê trong báo cáo độ phủ                                        |
| Lọc theo hệ/dự án             | Độ phủ tính **trong đúng phạm vi đang lọc** — phủ toàn dự án 40% nhưng hệ đang xem 0% thì phải nói 0%                 |
| Không có task nào             | Biểu đồ rỗng như hiện tại, không hiện nhãn độ phủ                                                                     |

## 7. Functional và non-functional requirements

**FR1** — `lib/tien-do/trong-so.ts` (mới): một nơi duy nhất quyết định trọng số của task cho lớp
phân tích. Trả `{ trongSo: Map<taskId, bigint>, daMap: number, tong: number, dungTrongSo: boolean }`.
Tái dùng đúng câu SQL giá trị BOQ mà `evm.ts` đang chạy (kể cả luật VO chỉ tính khi đã duyệt).

**FR2** — `plannedRatio` chỉ còn **một bản** (`lib/tien-do/evm.ts` export sẵn); `spi/route.ts` và
`scurve/route.ts` import lại, xoá bản sao chép.

**FR3** — `GET /api/dashboard/scurve` và `GET /api/dashboard/spi` tính planned **và** actual bằng
trọng số của FR1. Hai đường của cùng một biểu đồ phải cùng trọng số — nếu không SPI vô nghĩa.

**FR4** — Ngưỡng độ phủ tối thiểu để bật trọng số là **cấu hình được theo dự án**, mặc định giữ
hành vi an toàn. Dùng lại mẫu bảng `alert_rules` (`migrations/0056`) thay vì bịa cơ chế mới.

**FR5** — Cả hai route trả thêm khối `trongSo: { dungTrongSo, daMap, tong, tyLe }` để giao diện
hiện nhãn. **Không** để client tự đoán.

**FR6** — `GET /api/boq/coverage` (mới): độ phủ theo hệ/sheet + danh sách dòng BOQ có Σweight ≠ 1.
Quyền đọc như `/api/boq` hiện tại.

**FR7** — Khi `dungTrongSo = false`, kết quả phải **giống hệt** công thức cũ (bình quân số task) —
đây là đường lùi an toàn, có test khoá.

**NFR1 (không đổi hành vi vận hành)** — Không route/hàm nào của lớp vận hành đổi kết quả. Test cũ
phải xanh nguyên (AC8).

**NFR2 (hiệu năng)** — Truy vấn giá trị BOQ đã có sẵn trong `evm.ts`, thêm vào scurve/spi là thêm
1 `LEFT JOIN` gộp sẵn; không thêm vòng lặp N+1.

**NFR3 (trung thực)** — Nhãn phải nói đúng cái đang dùng. Cấm hiện "theo giá trị BOQ" khi thực tế
đang chạy bình quân số task. Đây là yêu cầu **chức năng**, không phải mỹ quan.

**NFR4 (a11y)** — Nhãn độ phủ là chữ, không phải chỉ màu; đủ tương phản AA cả hai theme.

## 8. Acceptance criteria

| #   | Given / When / Then                                                                                                                                    | Bằng chứng       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| AC1 | Given không task nào map BOQ · When gọi scurve/spi · Then `dungTrongSo=false` và số liệu **trùng khít** công thức cũ                                   | Integration      |
| AC2 | Given mọi task đã map, giá trị khác nhau · When tính · Then task giá trị lớn ảnh hưởng nhiều hơn task giá trị nhỏ (đúng tỷ lệ giá trị)                 | Unit (hàm thuần) |
| AC3 | Given độ phủ dưới ngưỡng · When tính · Then `dungTrongSo=false` + `tyLe` báo đúng độ phủ thật                                                          | Integration      |
| AC4 | Given cùng dữ liệu · When so SPI của `/api/dashboard/spi` với SPI của `/api/dashboard/evm` · Then **bằng nhau** (sai số làm tròn)                      | Integration      |
| AC5 | Given lọc theo hệ · When tính độ phủ · Then chỉ đếm task trong hệ đó, không lấy độ phủ toàn dự án                                                      | Integration      |
| AC6 | Given 3 dòng BOQ có Σweight ≠ 1 · When gọi `/api/boq/coverage` · Then liệt kê đủ 3 dòng kèm tổng thực tế                                               | Integration      |
| AC7 | Given VO chưa duyệt · When tính trọng số · Then dòng VO đó **không** vào giá trị (giữ đúng luật EVM hiện có)                                           | Integration      |
| AC8 | Given toàn bộ test cũ · When `npm test -- --release-gate` · Then không ca nào đổi kết quả; `tasks.progress_percent`/`work_packages.progress` không đổi | CI               |
| AC9 | Given độ phủ 0% · When mở S-curve · Then nhãn nói "chưa có dữ liệu BOQ", **không** hiện "theo giá trị BOQ"                                             | E2E + axe        |

## 9. Kiến trúc và điểm chạm code

```
lib/tien-do/trong-so.ts   ← MỚI: nguồn trọng số DUY NHẤT cho lớp phân tích
   ├─ dùng bởi → app/api/dashboard/scurve/route.ts
   ├─ dùng bởi → app/api/dashboard/spi/route.ts
   └─ (evm.ts giữ nguyên logic, PR sau có thể gọi chung — không bắt buộc trong M122)

lib/khoi-luong/boq-coverage.ts ← MỚI: đo độ phủ + Σweight lệch
   └─ dùng bởi → app/api/boq/coverage/route.ts
```

| File                                | Thay đổi                                                                |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `lib/tien-do/trong-so.ts`           | **Mới** — lấy giá trị BOQ theo task, quyết định có đủ phủ để dùng không |
| `lib/khoi-luong/boq-coverage.ts`    | **Mới** — thống kê độ phủ + dòng Σweight lệch                           |
| `app/api/boq/coverage/route.ts`     | **Mới** — FR6                                                           |
| `app/api/dashboard/scurve/route.ts` | Dùng trọng số; xoá bản `plannedRatio` sao chép; trả khối `trongSo`      |
| `app/api/dashboard/spi/route.ts`    | Như trên                                                                |
| `app/components/SCurveChart.tsx`    | Nhãn độ phủ                                                             |
| `app/components/SpiCards.tsx`       | Nhãn độ phủ                                                             |
| `app/boq/page.tsx`                  | Khối "Độ phủ ánh xạ BOQ"                                                |
| `lib/van-hanh/alerts.ts`            | Thêm ngưỡng độ phủ vào whitelist metric cấu hình được                   |

**Không đụng:** `lib/tien-do/recompute.ts`, mọi route nghiệm thu/thanh toán/cảnh báo, `mv_progress_daily`,
`lib/tien-do/kpi.ts`, `lib/tien-do/group-progress.ts`, export Excel/PDF, báo cáo email/Telegram.

## 10. API contract

```jsonc
// GET /api/dashboard/scurve  (và /spi) — THÊM khối trongSo, không đổi trường cũ
{
  "points": [/* như cũ */],
  "trongSo": { "dungTrongSo": true, "daMap": 412, "tong": 1850, "tyLe": 0.223 },
}
```

```jsonc
// GET /api/boq/coverage?system=&project=
{
  "tong": 1850,
  "daMap": 412,
  "tyLe": 0.223,
  "theoHe": [{ "he": "acmv", "tong": 900, "daMap": 400, "tyLe": 0.444 }],
  "weightLech": [{ "boqItemId": 12, "code": "A-01", "name": "...", "tongWeight": 1.35 }],
}
```

Lỗi: `401` chưa đăng nhập · `403` không có quyền xem BOQ. Không thêm đường ghi nào.

## 11. Data contract và DDL

**Không migration đụng dữ liệu.** Nếu cần lưu ngưỡng độ phủ theo dự án thì dùng **bảng
`alert_rules` đã có** (`migrations/0056_alert_rules.sql`) với một `metric` mới trong whitelist tĩnh
của `lib/van-hanh/alerts.ts` — không tạo bảng mới cho một con số.

**Dữ liệu lịch sử giữ nguyên tuyệt đối:**

- `payment_bills.progress_snapshot` (`NUMERIC(5,4)`) — ghi theo công thức cũ tại thời điểm lập
  phiếu, là **chứng từ**; sửa lại là làm sai lịch sử thanh toán.
- `baseline_tasks.progress_percent` — ảnh chụp lúc chốt baseline.
- `mv_progress_daily.avg_progress` — bình quân không trọng số; `migrations/0055:9-12` đã ghi rõ
  EVM cố ý không dùng nó. M122 giữ nguyên: nhánh đọc matview của scurve **chỉ dùng khi
  `dungTrongSo = false`**.

**Verify sau khi triển khai:** so `tasks.progress_percent` và `work_packages.progress` trước/sau
trên 20 task mẫu — phải **không đổi một giá trị nào** (guardrail §2).

## 12. Security/privacy/abuse

- Không thêm đường ghi nào; 2 route sửa + 1 route mới đều chỉ đọc.
- `/api/boq/coverage` gọi `getCurrentUser()` + `force-dynamic`, quyền xem như `/api/boq` hiện tại;
  lọc theo dự án đang chọn để không rò rỉ chéo dự án.
- SQL qua helper `lib/db` placeholder `?`; tái dùng nguyên câu giá trị BOQ của `evm.ts`.
- Giá trị hợp đồng là **dữ liệu tài chính**: khối `trongSo` chỉ trả **số đếm và tỷ lệ**, tuyệt đối
  không trả số tiền — nếu không sẽ lộ giá trị hợp đồng cho vai trò không có `CAN.viewPayments`.

## 13. UX/a11y/content

- Nhãn dưới tiêu đề biểu đồ, chữ nhỏ `text-zinc-400`: _"Tính theo giá trị BOQ · độ phủ 22% (412/1.850 task)"_
  hoặc _"Tính theo bình quân số task · chưa đủ dữ liệu BOQ (0/1.850 task đã map)"_.
- Khối độ phủ ở `/boq` dùng `Card` + `StatCard` sẵn có (ADR-0009), không tự vẽ.
- Dòng Σweight lệch: badge amber (cảnh báo, đúng quy ước màu) **kèm chữ**, không chỉ màu.
- Mọi nhãn tiếng Việt; số dùng `toLocaleString("vi-VN")`.

## 14. Observability và vận hành

- Không thêm metric server. Độ phủ tự nó là chỉ số vận hành: Admin xem ở `/boq`.
- Runbook: "S-curve khác EVM" → kiểm `dungTrongSo` của scurve; `false` nghĩa là chưa đủ phủ, cần bổ
  sung `boq_task_map` chứ không phải lỗi tính toán.

## 15. Test plan

| Lớp                    | Nội dung                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unit (thuần)           | Hàm trọng số: phân bổ đúng tỷ lệ giá trị (AC2); ngưỡng phủ (AC3); ca 0 task map (AC1)                        |
| Integration (Postgres) | AC1, AC3, AC4 (SPI hai nguồn bằng nhau), AC5 (phủ theo phạm vi lọc), AC6 (Σweight lệch), AC7 (VO chưa duyệt) |
| Hồi quy                | AC8 — chạy lại toàn bộ; thêm ca khoá `tasks.progress_percent`/`work_packages.progress` không đổi             |
| E2E + axe              | AC9 — nhãn nói đúng khi độ phủ 0%                                                                            |

## 16. Kế hoạch slice/PR

Thứ tự bắt buộc: **đo trước → hợp nhất → bật trọng số → hiển thị**. Không đảo: bật trọng số trước
khi đo là đúng cái §4 phương án C đã bác.

| PR      | Nội dung                                                                       | `route:`     | Cổng                      |
| ------- | ------------------------------------------------------------------------------ | ------------ | ------------------------- |
| **PR1** | `boq-coverage.ts` + `GET /api/boq/coverage` + khối độ phủ ở `/boq` (AC6)       | `standard`   | lint/typecheck/test/build |
| **PR2** | Gom `plannedRatio` về một bản; scurve/spi import lại (FR2) — **0 đổi số liệu** | `mechanical` | như trên                  |
| **PR3** | `trong-so.ts` + scurve/spi dùng trọng số + khối `trongSo` (AC1-AC5, AC7, AC8)  | `spec`       | như trên                  |
| **PR4** | Nhãn độ phủ trên SCurveChart/SpiCards (AC9)                                    | `standard`   | thêm E2E + axe            |
| **PR5** | `PROGRESS.md` + `docs/nang-cap/README.md`                                      | `mechanical` | —                         |

## 17. Rollout/rollback

1. Không migration đụng dữ liệu → không cần staging cho DB.
2. **PR1 deploy riêng và DỪNG LẠI**: người dùng xem độ phủ thật rồi mới quyết định ngưỡng cho PR3.
   Đây là cổng bắt buộc, không phải thủ tục — độ phủ quá thấp thì PR3 chỉ nên bật sau khi bổ sung
   `boq_task_map`.
3. PR3 deploy → chạy verify §11 (20 task mẫu, % vận hành không đổi).
4. **Go/no-go:** huỷ nếu (a) bất kỳ giá trị `tasks.progress_percent`/`work_packages.progress` nào
   đổi, (b) SPI hai nguồn vẫn lệch, (c) nhãn hiện sai so với công thức đang chạy.
5. **Rollback:** revert PR — không có dữ liệu phải hoàn nguyên (M122 chỉ đọc).

## 18. Risk/assumption/open decisions

| Mục                                                                         | Xác minh/giảm thiểu                                                                                                                                                                     | Owner       | Hạn       | Quyết định     |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | -------------- |
| **D1** Ngưỡng độ phủ tối thiểu để bật trọng số là bao nhiêu?                | **Không đoán được trước khi có số thật.** PR1 đo xong mới chốt. Đề xuất khởi điểm **80%**: dưới mức đó thì phần "gán trọng số trung bình" lớn hơn phần dữ liệu thật, con số mất ý nghĩa | Người dùng  | Sau PR1   | ⬜ chờ số thật |
| **D2** Task chưa map trong ca đủ phủ: giữ quy tắc "trung bình task đã map"? | Đề xuất **giữ** (đúng quy tắc EVM hiện có, không tạo khái niệm thứ hai), nhưng **đếm rõ trong nhãn** để người xem biết bao nhiêu phần là ước lượng                                      | Người dùng  | Trước PR3 | ⬜ chờ duyệt   |
| **R1** Hai khái niệm % song song gây nhầm lẫn                               | Đặt tên rõ trên giao diện: "% thi công" vs "% giá trị" (§4). Rủi ro thật nhưng nhỏ hơn nhiều so với đổi % vận hành                                                                      | Phiên chính | PR4       | ✅ chấp nhận   |
| **R2** Độ phủ thấp làm PR3 vô dụng                                          | Đây chính là lý do PR1 đi trước và có cổng dừng ở §17.2. Nếu phủ 0% thì M122 vẫn có giá trị: gom `plannedRatio` (PR2) + báo cáo độ phủ (PR1) + đường lùi an toàn có test (FR7)          | Phiên chính | Sau PR1   | ✅ đã tính     |
| **A1** Giả định `boq_task_map` là đường DUY NHẤT tới giá trị BOQ            | Đã grep toàn repo 2026-09-03: `tasks.boq_code` không join `boq_items` ở đâu cả. Nếu khi code phát hiện đường thứ hai → dừng, báo phiên chính                                            | —           | —         | —              |

## 19. Approval

- [ ] Product/scope — đặc biệt **phạm vi B** (chỉ lớp phân tích, KHÔNG đụng % vận hành/gate/tiền)
- [ ] UX/a11y
- [ ] Architecture/API/data
- [ ] Security/RBAC/SoD/audit
- [ ] Test/telemetry/rollout/rollback
- [ ] Không còn blocking question

**Kết luận:** **Draft — chờ duyệt**
**Người/ngày duyệt:** (chưa)
