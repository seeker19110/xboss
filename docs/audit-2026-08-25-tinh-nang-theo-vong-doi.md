# Audit tính năng XBoss — gộp theo vòng đời dự án (2026-08-25)

> **Phạm vi đã chốt với người dùng:** rà toàn bộ tính năng đang có, **gộp lại theo trục vòng
> đời dự án**, ra **báo cáo trước** — đợt này **không sửa code**. Việc gộp thật (xoá/hợp nhất
> trang, route, bảng) chỉ làm sau khi người dùng duyệt danh sách ở §5.
>
> Đo trên `origin/main` tại commit `5a7617b` (sau PR #395). Mọi con số dưới đây đều đo bằng
> lệnh, cách tái lập ghi ở §7 — không ước lượng.

## 1. Quy mô hiện tại

| Hạng mục                     | Số lượng | Ghi chú     |
| ---------------------------- | -------: | ----------- |
| Trang (`app/**/page.tsx`)    |  **122** | 74.534 dòng |
| Route API (`route.ts`)       |  **505** | 42.203 dòng |
| Bảng DB (`migrations/*.sql`) |  **269** |             |
| Module `lib/`                |  **194** | 55.461 dòng |
| Spec e2e (`e2e/authed/`)     |   **69** |             |

Ba con số đáng chú ý ngay:

- **39/122 trang (32%) nằm dưới `/engineering`** — 25.617 dòng, tức **34% toàn bộ mã trang**.
- **143/505 route API (28%) là `/api/engineering/*`**; **119/269 bảng DB (44%) tên `engineering_*`**.
- `lib/ky-thuat/` một mình chiếm **31.426/55.461 dòng (57%)** của cả `lib/`.

Nói cách khác: **quá nửa khối lượng mã của XBoss nằm ở lớp kỹ thuật/AI**, trong khi phần lõi
nghiệp vụ (tiến độ, khối lượng, tài chính, vật tư, hiện trường) chỉ chiếm phần còn lại.

## 2. Bảng gộp tính năng theo vòng đời dự án

122 trang được xếp **đúng một lần** vào 6 giai đoạn vòng đời + 2 nhóm cắt ngang (kiểm bằng
script: 122 map / 122 trang, không trùng, không sót).

| Nhóm                                               | Trang |   Dòng | Trong đó `/engineering` | Không có trong sidebar |
| -------------------------------------------------- | ----: | -----: | ----------------------: | ---------------------: |
| **GĐ1 · Khởi động & pháp lý**                      |     5 |  4.123 |                       0 |                      1 |
| **GĐ2 · Thiết kế – BIM – bản vẽ**                  |    26 | 18.085 |                      18 |                     12 |
| **GĐ3 · Đấu thầu, hợp đồng & mua sắm**             |    11 |  7.872 |                       3 |                      5 |
| **GĐ4 · Thi công & kiểm soát**                     |    44 | 23.832 |                      17 |                     16 |
| **GĐ5 · Nghiệm thu, thanh toán & quyết toán**      |    11 |  8.206 |                       2 |                      1 |
| **GĐ6 · Bàn giao, bảo hành & kết thúc**            |     3 |  3.536 |                       0 |                      0 |
| **CC-A · Giao tiếp & hồ sơ dự án**                 |     3 |  1.817 |                       0 |                      0 |
| **CC-B · Nền tảng, tài khoản & quản trị hệ thống** |    19 |  7.063 |                       0 |                      6 |

### GĐ1 — Khởi động & pháp lý (5 trang)

`/kickoff` · `/portfolio` · `/environment` · `/insurance` · `/monitoring`

Điều kiện khởi công, danh mục dự án, giấy phép môi trường, bảo hiểm/bảo lãnh, quan hệ cộng
đồng & quan trắc. Nhóm mỏng nhất so với khối lượng nghiệp vụ thật của giai đoạn này.

### GĐ2 — Thiết kế – BIM – bản vẽ (26 trang, 18.085 dòng)

- **Lõi bản vẽ (6 trang, 1 nguồn):** `/ban-ve` (1.604 dòng) + 5 vỏ mỏng 6 dòng cùng gọi lại nó
  với `fixedKind` khác nhau — `/ban-ve-thiet-ke`, `/shopdrawings`, `/bien-phap-thi-cong`,
  `/mo-hinh-bim`, `/ban-ve-hoan-cong`. **Đây là cách gộp ĐÚNG**, nêu ở đây làm chuẩn tham chiếu.
- `/design-changes` · `/combine` · `/engineering/chuan-hoa-ban-ve`
- **Lớp CAD/BIM/AI (17 trang, cộng `/engineering/chuan-hoa-ban-ve` ở trên là 18):** `bim`, `bim-viewer`, `spatial-viewer`, `scan-to-bim`,
  `auto-routing`, `cad-corridor`, `cad-nesting`, `cad-tracking`, `god-tier-studio`,
  `mepf-studio`, `mepf-lifecycle`, `pipe-stash-hunter`, `thiet-bi-cad`, `reality`, `twin`,
  `graph`, `data-quality`.

### GĐ3 — Đấu thầu, hợp đồng & mua sắm (11 trang)

`/tenders` · `/subcontractors` · `/procurement` (hub 5 tab) · `/boq` · `/materials/import` ·
`/materials/reports` · `/contracts` · `/proposals` · `/engineering/bidding-matrix` ·
`/engineering/subcon-ai` · `/engineering/esign`

### GĐ4 — Thi công & kiểm soát (44 trang, 23.832 dòng — nhóm lớn nhất)

- **Tiến độ (12 lối vào):** `/` · `/progress/[system]` · `/tracking/[sheet]` · `/system/[code]` ·
  `/schedule` (hub) · `/schedule-control` · `/gantt` · `/scurve` · `/timeline` · `/lookahead` ·
  `/report` + `/reports`
- **Hiện trường (10):** `/site` (hub) · `/my-tasks` · `/diary` · `/work-fronts` +
  `/work-fronts/[floor]` · `/attendance` · `/equipment` · `/vehicles` · `/hse` · `/risks`
- **Chất lượng & quy trình (3):** `/quality` · `/mepf-process` · `/import`
- **Khác (2):** `/tech` · `/r/[kind]/[id]` (điều hướng QR)
- **Lớp AI vận hành (17):** `/engineering`, `/engineering-intelligence`, `hse-vision`,
  `site-copilot`, `zalo-copilot`, `predictions`, `prescriptive`, `iot-telemetry`,
  `suggestions`, `workflows`, `swarm`, `autonomy`, `agent-sessions`, `memory`,
  `nextgen-apex`, `quantum-hub`, `zero-error`

### GĐ5 — Nghiệm thu, thanh toán & quyết toán (11 trang)

`/approvals` · `/payment-certs` · `/payments` + `/payments/print` · `/costs` · `/finance` ·
`/variations` · `/claims` · `/commercial` (hub) · `/engineering/fidic-claims` ·
`/engineering/cashflow`

### GĐ6 — Bàn giao, bảo hành & kết thúc (3 trang)

`/handover` (1.890 dòng) · `/warranty` (1.180) · `/governance` (hub)

### CC-A — Giao tiếp & hồ sơ dự án (3 trang)

`/documents` · `/meetings` · `/correspondences`

### CC-B — Nền tảng, tài khoản & quản trị (19 trang)

`/login` · `/account` · `/password` · `/offline` · `/notifications` + `/notifications/all` ·
`/hub/[id]` · `/users` · `/org` · `/personnel` · `/admin` + 8 trang `/admin/*`

## 3. Phát hiện — theo mức nghiêm trọng

### 3.1 · NGHIÊM TRỌNG — 5 trang tính năng đầy đủ nhưng **không có lối vào nào**

Không nằm trong sidebar (`app/lib/dashboardTree.ts`) **và** không được trang nào trong `app/`
link tới. Chỉ vào được nếu gõ tay URL:

| Trang                | Dòng | Nội dung                                   |
| -------------------- | ---: | ------------------------------------------ |
| `/risks`             |  587 | **Sổ rủi ro** — ma trận 5×5, ghi nhận, lọc |
| `/materials/reports` |  469 | Báo cáo vật tư                             |
| `/schedule-control`  |  182 | Đường găng & chậm tiến độ (+ nút in)       |
| `/scurve`            |   29 | S-Curve theo hệ                            |
| `/timeline`          |   27 | Timeline tầng theo hệ                      |

Cả 5 nằm trong **20 trang được khôi phục** ở đợt `docs/audit-hop-nhat-hub.md` (§4: "khôi phục
20 trang từ git + trỏ lại nav"). Việc khôi phục **trang** đã xong, nhưng bước "trỏ lại nav"
sót đúng 5 trang này — chúng chỉ còn sống nhờ bộ e2e đang gọi thẳng URL.

**Kèm theo, một lỗi nav thật:** trong `dashboardTree.ts` (dòng 331–344), nhóm "An toàn – HSE &
Rủi ro" có **hai mục cùng trỏ `/hse`** — mục "HSE" và mục "Rủi ro". Trang `/hse` **không có một
chữ "rủi ro" nào** (`grep -c risk\|Rủi ro app/hse/page.tsx` → 0). Nghĩa là vai trò `bch`/`cdt`/
`viewer` — nhóm được cấp riêng mục "Rủi ro" — bấm vào sẽ ra trang HSE của kỹ sư, còn sổ rủi ro
thật thì không ai tới được.

### 3.2 · NGHIÊM TRỌNG — số liệu bịa trên các hub

Đúng lớp lỗi dự án từng dọn một lần ("eliminate hallucinations and mock data") và
`docs/audit-hop-nhat-hub.md` §5 đã ghi cho riêng `/site`. Rà lại cả 7 hub:

| Hub                         | KPI khởi tạo cứng                                | Có `fetch` đè? |
| --------------------------- | ------------------------------------------------ | -------------- |
| `/governance`               | "486 Tài liệu", "24 Thành viên", "1.840 Records" | **KHÔNG**      |
| `/engineering-intelligence` | "1.420 Items", "5 Đề Xuất", "11 Agents"          | **KHÔNG**      |
| `/commercial`               | "48.5 Tỷ", "24.2 Tỷ", "3.8 Tỷ"                   | có             |
| `/site`                     | "14 Task", "6 Phiếu", "8 Sàn", "96/100"          | có             |
| `/procurement`              | "320 Mục", "28 Đơn", "142 Phiếu"                 | có             |
| `/schedule`                 | "68.4%", "0.98"                                  | có             |

- **2 hub không fetch bao giờ** → số hiển thị **luôn** là số bịa, không liên quan dữ liệu thật.
- **4 hub còn lại** chỉ đúng khi API trả về; API lỗi/dự án rỗng → số bịa đứng nguyên trên màn
  hình như số thật. `/commercial` bịa **giá trị tiền tỷ** — mức rủi ro cao nhất trong nhóm này.

### 3.3 · CAO — hai stack song song cho cùng một khái niệm nghiệp vụ

Mỗi dòng dưới đây là **cùng một nghiệp vụ, hai lần**: một bản nghiệp vụ thật và một bản
`/engineering`, **bảng DB riêng, route API riêng, không tham chiếu nhau**.

| Nghiệp vụ   | Bản nghiệp vụ (bảng DB)                       | Bản `/engineering` (bảng DB)                                                     |
| ----------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| Claim / EOT | `/claims` — `claims`, `claim_documents`       | `/engineering/fidic-claims` — `engineering_fidic_claims`, `…_tia_claims`         |
| Thầu phụ    | `/subcontractors` — `subcontractor_profiles`  | `/engineering/subcon-ai` — `engineering_subcon_profiles`, `…_metrics`            |
| Đấu thầu    | `/tenders` — `tender_packages`, `tender_bids` | `/engineering/bidding-matrix` — `engineering_bidding_packages`, `…_quotes`       |
| Dòng tiền   | `/finance`, `/costs` — `invoices`, `payroll`  | `/engineering/cashflow` — `engineering_cashflow_forecast_runs`, `…_projections`  |
| HSE         | `/hse` — `hse_records`                        | `/engineering/hse-vision` — `engineering_hse_vision_scans`, `…_detected_hazards` |
| BIM/bản vẽ  | `/mo-hinh-bim` (`drawings`, kind=`bim`)       | `/engineering/bim`, `bim-viewer` — `engineering_bim_models`, `…_elements`        |
| Rủi ro      | `/risks` — `risks`                            | `/engineering/predictions`, `prescriptive` — `engineering_prediction_*`          |

Ví dụ cụ thể nhất — **danh tính thầu phụ bị lưu hai nơi**:

- `subcontractor_profiles` (0041): khoá chính `supplier_id` → gắn chặt vào `suppliers`.
- `engineering_subcon_profiles` (0115): khoá `uuid` riêng, có `company_name`/`tax_code` **tự
  nhập**, `supplier_id` chỉ là FK **tuỳ chọn** (`ON DELETE SET NULL`).

Nghĩa là cùng một nhà thầu phụ có thể tồn tại hai bản ghi lệch tên/lệch mã số thuế, không cơ
chế nào bắt được. Không phải chỉ trùng màn hình — **trùng ở tầng dữ liệu**.

### 3.4 · CAO — 4 trang chỉ là vỏ mỏng của tab hub `/schedule`

`/schedule` import đúng 5 component dùng chung: `ScheduleControlPanel`, `DelayedGroupsTable`,
`SCurveChart`, `ProgressMap`, `LookaheadTable`. Bốn trang riêng chỉ bọc lại chính các
component đó, **không thêm tính năng nào**:

| Trang riêng         | Dòng | Bọc component                                 | Đã có trong tab hub        |
| ------------------- | ---: | --------------------------------------------- | -------------------------- |
| `/scurve`           |   29 | `SCurveChart`                                 | "Đường Cong S-Curve & EVM" |
| `/timeline`         |   27 | `ProgressMap`                                 | (dùng trong hub)           |
| `/lookahead`        |  187 | `LookaheadTable`                              | "Sơ Đồ CPM & Lookahead"    |
| `/schedule-control` |  182 | `ScheduleControlPanel` + `DelayedGroupsTable` | "Lưới WBS & Kiểm soát trễ" |

Đúng khuôn đã xử lý ở PR #390 với `/notifications` (bản sao của tab trong `/my-tasks` → giữ
lại đúng một chuyển hướng + deep-link `?tab=`).

### 3.5 · TRUNG BÌNH — 26 route API không ai gọi

Không có lời gọi nào trong `app/`, `lib/`, `scripts/`, `e2e/`, `tests/`.

- **Hợp lệ, không phải rác (7):** 5 route `/api/cron/*` (gọi từ cron ngoài, đúng thiết kế:
  `deliver-webhooks`, `retention`, `sync-integrations`, `weekly-report`, `refresh-views`) và
  2 route `/api/v1/*` (`materials`, `packages` — API mở cho hệ ngoài, M49).
- **Thật sự không có ai gọi (19):**
  - `/api/tasks/batch`, `/api/dimensions/batch`, `/api/import/batches`, `/api/materials/allocation-meta`, `/api/devices/pair/claim`
  - 14 route `/api/engineering/*`: `digital-handover`, `project-health`, `multi-agent-copilot`,
    `compliance/audit-element`, `bim-models/[id]/link-wbs`, `god-tier/simulate-4d`,
    `closed-loop-sync`, `mepf-predictive`, `pipe-spool-tracking`, `cad/convert-to-dxf`,
    `cad/diff`, `carbon-lca`, `taxonomy`, `zero-error/pour-permits`

### 3.6 · TRUNG BÌNH — 2 trang nội dung tĩnh, tương tác không lưu được

| Trang           |      Dòng | `fetch` | `localStorage` |
| --------------- | --------: | ------: | -------------: |
| `/mepf-process` | **2.011** |       0 |              0 |
| `/combine`      |   **995** |       0 |              0 |

Cả hai có state tương tác (tick bước/hạng mục) nhưng **không đọc DB, không ghi đâu cả** — tải
lại trang là mất sạch. 3.006 dòng nội dung quy trình cắm cứng trong JSX, muốn sửa một bước
phải sửa mã nguồn và deploy lại.

### 3.7 · THẤP — ba trình xem canvas viết riêng

`/engineering/bim-viewer` (1.096 dòng), `/engineering/spatial-viewer` (774),
`/engineering/god-tier-studio` (1.269) đều tự vẽ trên `<canvas>` và **không chia sẻ một
component nào** (mỗi trang chỉ import `AppHeader`/`EngineeringNav`).

### 3.8 · Bối cảnh — 12/25 module trong registry đang tắt mặc định

`lib/nen/modules.ts` đánh `thuNghiem: true` cho 12 module (autonomy, twin, predictions, graph,
prescriptive, bim-models, iot-telemetry, subcon-ai, god-tier-studio, quantum-hub, swarm,
nextgen-apex) — tức mặc định **tắt cho mọi dự án**. Toàn bộ nằm trong lớp `/engineering`. Đây
là điểm cộng: rủi ro đã được nhận diện và khoanh vùng bằng cờ tính năng, không phải nợ mới.

## 4. Vì sao nên gộp theo trục vòng đời (chứ không theo trục hiện tại)

Sidebar hiện xếp theo **cụm kỹ thuật** (8 cụm, xem `DASHBOARD_TREE`), trong đó **2 cụm đầu
dành cho `/engineering`** — người dùng mở app ra là gặp "MEPF CAD/BIM Studio", "Apex Cockpit",
"Quantum & Merkle" trước cả Dashboard tiến độ. Nhưng theo `PROJECT.md`, người dùng trung tâm là
kỹ sư hiện trường và PM, và **12/25 module ở hai cụm đó đang tắt mặc định**.

Xếp theo vòng đời cho ba thứ mà cách xếp hiện tại không cho:

1. **Thấy chỗ mỏng:** GĐ6 (bàn giao/bảo hành) chỉ 3 trang, GĐ1 chỉ 5 — trong khi GĐ4 có 44.
2. **Thấy chỗ trùng:** hai bản của cùng một nghiệp vụ (§3.3) rơi vào **cùng một ô vòng đời**,
   nhìn là thấy; xếp theo cụm kỹ thuật thì chúng nằm hai cụm khác nhau nên trông như hai
   tính năng khác nhau.
3. **Thấy chỗ đứt:** 5 trang mồ côi ở §3.1 đều thuộc GĐ3/GĐ4 — đúng giai đoạn dùng hằng ngày.

## 5. Đề xuất gộp — cần người duyệt trước khi làm

Xếp theo tỷ lệ (lợi ích / rủi ro). **Chưa thi hành gì cả.**

| #   | Việc                                                                                                                                               | Nhóm     | Ước lượng | Rủi ro   | Vì sao                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------- | -------- | ---------------------------------------------------------------------------------------- |
| 1   | **Trỏ lại nav cho 5 trang mồ côi** + sửa mục "Rủi ro" trỏ `/hse` → `/risks`                                                                        | GĐ3/4    | nhỏ       | rất thấp | Tính năng đã có sẵn, chỉ thiếu lối vào (§3.1)                                            |
| 2   | **Bỏ số liệu bịa ở 7 hub**: `/governance` + `/engineering-intelligence` phải fetch thật hoặc hiện `—`; 4 hub còn lại khởi tạo rỗng thay vì số cứng | mọi nhóm | nhỏ       | thấp     | Số tiền tỷ bịa đang hiển thị như thật (§3.2)                                             |
| 3   | **Gộp 4 vỏ mỏng vào tab `/schedule?tab=`** (giữ chuyển hướng + deep-link, đúng khuôn `/notifications` ở PR #390)                                   | GĐ4      | vừa       | thấp     | −425 dòng, bớt 4 lối vào trùng (§3.4)                                                    |
| 4   | **Xoá 19 route API không ai gọi** (giữ nguyên `/api/cron/*` và `/api/v1/*`)                                                                        | mọi nhóm | vừa       | thấp     | Mỗi route là một mặt tấn công phải kiểm quyền (§3.5)                                     |
| 5   | **Nối `engineering_subcon_profiles` vào `subcontractor_profiles`** (FK bắt buộc, bỏ `company_name`/`tax_code` trùng)                               | GĐ3      | lớn       | **cao**  | Trùng danh tính ở tầng dữ liệu (§3.3) — cần migration đụng dữ liệu, bắt buộc qua staging |
| 6   | **Chốt hướng cho 6 cặp stack song song còn lại** (§3.3): gộp về một nguồn, hay giữ hai và khai rõ ranh giới                                        | GĐ2/3/5  | rất lớn   | **cao**  | Quyết định kiến trúc — cần người chốt từng cặp, không tự quyết                           |
| 7   | **Đưa nội dung `/mepf-process` + `/combine` vào DB** (hoặc chốt rõ đây là trang tài liệu tĩnh, bỏ tương tác giả)                                   | GĐ2/4    | lớn       | vừa      | 3.006 dòng nội dung cắm cứng, tick không lưu (§3.6)                                      |
| 8   | **Tách component canvas dùng chung cho 3 trình xem**                                                                                               | GĐ2      | lớn       | vừa      | 3.139 dòng vẽ canvas không chia sẻ gì (§3.7)                                             |

**Khuyến nghị làm trước:** #1 → #2 → #3 → #4. Bốn việc này đều **thấp rủi ro, không đụng dữ
liệu**, và xử lý đúng hai lớp lỗi mà người dùng thật nhìn thấy hằng ngày (tính năng không vào
được, số liệu sai). #5–#8 cần người chốt hướng trước vì đụng schema và kiến trúc.

## 6. Cố ý KHÔNG đề xuất gộp

| Thứ                                               | Vì sao giữ nguyên                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| 5 vỏ `/ban-ve-*`, `/shopdrawings`, `/mo-hinh-bim` | Mỗi vỏ 6 dòng, cùng gọi `/ban-ve` với `fixedKind` khác — **đây là mẫu gộp đúng** |
| `/report` vs `/reports`                           | Khác hẳn: một là bản in tức thời, một là kho báo cáo đã lưu                      |
| `/gantt` (539 dòng)                               | Có nội dung riêng, được `/schedule` link tới — không phải vỏ mỏng                |
| 5 route `/api/cron/*`, 2 route `/api/v1/*`        | Không có caller **trong repo** là đúng thiết kế (cron ngoài / API mở)            |
| 12 module `thuNghiem: true`                       | Đã khoanh bằng cờ tính năng, tắt mặc định — không phải nợ mới                    |

## 7. Cách tái lập số liệu

```bash
# Quy mô
find app -name page.tsx | wc -l && find app/api -name route.ts | wc -l
grep -rhoi "CREATE TABLE IF NOT EXISTS [a-z_]*" migrations/*.sql | awk '{print tolower($NF)}' | sort -u | wc -l

# Trang không có trong sidebar
grep -o 'href: "[^"]*"' app/lib/dashboardTree.ts | sed 's/href: "//; s/"$//; s/?.*//' | sort -u > /tmp/nav.txt
find app -name page.tsx | sed 's|^app||; s|/page.tsx||' | sort -u > /tmp/pages.txt
comm -23 /tmp/pages.txt /tmp/nav.txt

# Trang mồ côi thật (không nav VÀ không trang nào link tới) — thay $p từng đường dẫn ở trên
grep -rn "\"$p\"\|'$p'\|href=\"$p" app --include=*.tsx --include=*.ts | grep -v "^app$p/"

# Trang không gọi API
for f in $(find app -name page.tsx); do [ $(grep -c "fetch(" $f) -eq 0 ] && echo "$f"; done

# KPI cắm cứng ở hub
grep -n 'value: "' app/{site,commercial,procurement,schedule,governance,engineering-intelligence}/page.tsx
```

Bảng phân nhóm 122 trang được kiểm bằng script (mỗi trang đúng một nhóm, không sót/không
trùng); bảng nguồn nằm trong §2 của chính tài liệu này.

## 8. Việc chưa làm được trong đợt này

- **Không đo được mức dùng thật.** Các bảng `engineering_*` có dữ liệu thật hay rỗng thì phải
  đếm trên production; audit này chỉ đọc mã nguồn. Đây là dữ kiện quyết định cho đề xuất #6 —
  nếu bảng rỗng thì "gộp" thành "xoá", rẻ hơn nhiều.
- **Không rà quyền theo nhóm.** Ai được vào tính năng nào ở từng giai đoạn vòng đời chưa đối
  chiếu với ma trận `CAN` — nên làm thành đợt riêng, bám `docs/audit.md` §bảo mật.
- **Không rà trùng ở tầng `lib/`.** PR #390 đã làm một đợt; `lib/ky-thuat/` (31.426 dòng, 82
  file) chưa được rà lại sau đợt đó.
