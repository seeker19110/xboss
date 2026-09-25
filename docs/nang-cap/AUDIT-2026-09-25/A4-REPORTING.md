# A4 — Chi phí không cộng lặp và KPI portfolio có định nghĩa kiểm chứng

State: In review. Phụ thuộc A1, A3 cho schema exact; S00 cho mapping nguồn và query baseline.
Nguồn S02/S06/S07 ở README.md. Không đổi chính sách thương mại bằng một tối ưu SQL.

## 1. Hiện trạng và phương án

costTotals gọi lại costSummary("system"). Khi route đã gọi costSummary, đường system có thể
lặp bộ truy vấn. costByFloor trả từng floor_contract rồi subquery toàn payment_bills cùng
sheet/floor; cần fixture nhiều contract cùng grain để phát hiện nhân đôi actual. Chưa khẳng
định schema production hiện cho dữ liệu trùng như vậy; S00 kiểm constraints trước.
portfolioKpi mô tả trọng số theo task nhưng code lấy trung bình các progress dự án.

Chọn canonical aggregate service và công thức có denominator rõ; không thêm Redis,
materialized view hoặc kho báo cáo trong đợt này. Cache cross-project không thay quyền truy cập.
Không làm hoặc chỉ memoize costTotals để che query lặp không giải quyết grain/snapshot.

## 2. Nguồn sự thật và grain

A4-FR01: một bản ghi nguồn phải được tính đúng một lần. Grain nguồn: boq_items.id,
po_items.id, floor_contracts.id và payment_bills.id. Tập IDs được phép lấy từ A1;
phạm vi org bắt buộc. Join phụ không được làm một dòng nguồn xuất hiện N lần trước SUM.
Pre-aggregate từng nguồn trước khi join các aggregate; không SUM(DISTINCT amount) vì hai
chứng từ khác nhau có cùng amount vẫn đều phải tính.

A4-FR02: giữ semantics baseline trừ khi tài chính duyệt riêng:
ngân sách gốc `qty_contract * unit_price`; VO chỉ trạng thái approved/partially_approved/
contract_added và qty_approved khi includeVo=true; PO loại cancelled; cam kết gồm PO và
giao thầu; actual gồm payment_bills mọi type, kể cả advance theo quyết định đang ghi trong
cost.ts. Không tự đổi actual thành chỉ paid/status mới, không trừ tạm ứng hai lần.
S00 kiểm source lineage để phát hiện PO và hợp đồng cùng biểu diễn một cam kết; nếu đúng
thì cần rule nghiệp vụ duyệt, không tự dedup chỉ vì tiền giống nhau.

A4-FR03: system group khóa ID, không dùng label/code có thể trùng để định danh. Dòng chưa
phân loại đi bucket unassigned riêng, không âm thầm loại khỏi totals. Không tạo FK ID 0
trong DB để biểu diễn bucket; API dùng key "unassigned" và systemId null.

A4-FR04: floor group có grain `(sheet_type_id, floor_label)`; cộng hợp đồng một lần và
payment một lần tại cùng grain rồi join. Sheet code/label chỉ là hiển thị. Payment không có
floor contract vẫn phải được biểu diễn ở nhóm đúng/nhóm chưa phân loại theo dữ liệu nguồn,
không biến mất vì dùng floor_contracts làm bảng gốc duy nhất.
Floor budget hiện là proxy contract value, không phải BOQ phân bổ tầng. Response bắt buộc
`budgetBasis: "floor-contract-proxy"`; system là `"boq"`. Không đổi nghĩa mà giữ nhãn cũ.
Không đòi tổng floor budget/commitment bằng tổng system nếu PO/BOQ chưa có mapping tầng.

## 3. Contract dịch vụ và API

Service mới đề xuất `getCostReport(scope, {groupBy, includeVo})` trả rows, selectedTotals,
projectTotals, settings, alerts và metadata. costSummary/costTotals cũ làm adapter trong
cửa sổ chuyển đổi; không gọi lẫn nhau gây tính lại. Metadata gồm reportVersion,
computedAt, projectId, groupBy, includeVo, budgetBasis, currency, moneyFormat và coverage.

selectedTotals = tổng chính rows đang xem; projectTotals = tổng tài chính toàn project theo
semantics system, bao gồm unassigned. Ở groupBy=floor, hai tổng có thể khác vì coverage;
UI nêu rõ, không đặt hai giá trị chung nhãn “Tổng”. Hợp đồng `totals` cũ tiếp tục là
projectTotals để không đổi nghĩa im lặng; client mới dùng tên tường minh sau migration.
Mọi tiền sử dụng canonical decimal-string-v1 của A3 khi client opt-in.

Ví dụ response rút gọn, không phải implementation sẵn:

```json
{
  "groupBy": "floor",
  "rows": [],
  "selectedTotals": { "budget": "0.00", "committed": "0.00", "actual": "0.00" },
  "projectTotals": { "budget": "0.00", "committed": "0.00", "actual": "0.00" },
  "budgetBasis": "floor-contract-proxy",
  "coverage": { "hasUnassigned": false, "floorAllocationComplete": false },
  "moneyFormat": "decimal-string-v1"
}
```

A4-FR05: rows/totals/alerts cùng snapshot. Ưu tiên một SQL statement CTE tạo tập aggregate
rồi tính totals từ cùng tập; không tuyên bố Promise.all trong READ COMMITTED là snapshot
nhất quán. Nếu dùng nhiều statements cần transaction isolation phù hợp đặt từ BEGIN trước
mọi SELECT/set_config, qua API DB được review trong A1, không SET sau query đầu.
Số truy vấn dữ liệu báo cáo không tăng theo số group/dòng; ghi query count baseline và sau,
không đếm auth/permission/migration warmup vào số query tài chính.

A4-FR06: alerts tính từ cùng rows. budget > 0 mới tính committed/budget; budget=0 và committed
lớn hơn 0 là trạng thái chưa có ngân sách riêng, không Infinity/100% giả. Ratio dùng exact cross
multiplication hoặc decimal theo A3; ngưỡng warnPct/overPct lấy settings, không hardcode mới.
getCostSettings baseline là cấu hình toàn hệ id=1; không tự giả định cấu hình theo project.
Muốn đổi scope settings phải có ADR/DDL và approval riêng.

## 4. KPI portfolio

A4-FR07: mặc định tiến độ portfolio trọng số theo số task trong tập dự án mà actor thực sự
được xem của org hiện tại:

`avgProgress = SUM(task.progress_percent) / COUNT(task.id)`.

Đơn vị progress giữ [0,1] nội bộ, chỉ UI nhân 100. Project không task vẫn tính vào totalProjects
nhưng không tạo mẫu số giả; nếu tổng task=0, API mới trả avgProgress=null, taskCount=0,
progressAvailable=false. Không hiển thị dự án không dữ liệu như chắc chắn đạt 0% hay 100%.
Legacy adapter giữ number 0 nếu hợp đồng cũ bắt buộc, nhưng UI mới dùng availability để hiển thị
“Chưa có dữ liệu”. Không đổi các trạng thái completed/approved bởi rounding của KPI.

A4-FR08: truyền cùng filter project-status/org/visibility tới danh sách và KPI. listProjects,
listOrganizations và portfolioKpi không được thấy cross-org chỉ vì role admin. Nếu lựa chọn
lọc không hợp lệ, báo lỗi/empty có nghĩa chứ không bỏ filter. Không tạo quyền toàn hệ mới.
Đếm task distinct theo grain; join nhiều dimensions không nhân số task. Delayed dùng
COALESCE(task.end_date, package.end_date), ngày VN, progress<1 và loại hoan_thanh/nghiem_thu.
Task có null/ngoài miền progress là data-quality issue, không âm thầm đưa 0 vào mẫu số;
S00 định lượng và owner xử lý trước cutover. Trả cảnh báo coverage khi phải loại bản ghi lỗi.

## 5. Dữ liệu, điểm chạm và chỉ số

File hiện có: lib/tai-chinh/cost.ts, lib/ha-tang/projects.ts, app/api/costs/route.ts;
UI costs/portfolio, dashboard/export/report consumers được S00 xác định chính xác.
Không bắt buộc DDL; EXPLAIN (ANALYZE, BUFFERS) chỉ trên disposable/staging được phép.
Index chỉ thêm khi có plan chứng minh và tên/cột từ catalog, không đoán tốc độ tăng X lần.
Không cache tổng toàn hệ trong biến singleton dùng chung nhiều actor.

NFR: fixture 10k task, nhiều project và group; query count O(1) theo group; p95 không tệ
hơn baseline 20% trên cùng máy/concurrency. Ngưỡng là đề xuất, phải ghi cả số đo tuyệt đối.
Metric report_duration, report_query_count, report_unassigned_count, reconciliation_mismatch;
không log tiền hoặc tên nhà thầu. Empty khác database failure; lỗi DB không trả totals=0.

## 6. Acceptance và test

A4-AC01: hai contract cùng sheet/floor 100 và 200, payment 40 và 60: floor committed=300,
actual=100, không 200; hai payment bằng nhau vẫn tính đủ. FK/unique thực tế quyết định cách
tạo fixture hợp lệ; nếu schema chặn nhiều contract thì test chứng minh constraint thay thế.
A4-AC02: unassigned BOQ/PO/payment vẫn có trong projectTotals, không nằm ngoài đối soát.
A4-AC03: includeVo tắt/bật chỉ tác động budget thuộc VO đủ điều kiện; cancelled PO không
được tính; advance payment vẫn giữ semantics được duyệt.
A4-AC04: rows+tổng cùng snapshot khi chèn payment đồng thời; không có total thuộc thời điểm
khác rows. selectedTotals đối chiếu đúng tập hiển thị, projectTotals độc lập coverage tầng.
A4-AC05: P1 một task 100%, P2 chín task 0%: portfolio=10%, không 50%; thêm P3 không task
không đổi denominator. Không task toàn bộ trả unavailable, không NaN.
A4-AC06: filter org/status tác động list và KPI giống nhau; role thiếu quyền không nhận số
tiền ẩn qua alert/metadata/export. Đổi nhãn group không làm nhân/ghép nhầm dữ liệu.
A4-AC07: kỳ ngày VN 23:59/00:01 trên server UTC có delayedCount đúng; join dimension không
nhân task. Dữ liệu lỗi được báo coverage, không sửa progress nghiệp vụ từ báo cáo.
A4-AC08: canonical money SQL/API/export bằng nhau, query count và p95 có số đo trước/sau.

## 7. Rollout, rollback và approval

Canonical aggregate → API adapter → UI label/tổng → export, mỗi bước một slice nhỏ.
Shadow compare trên fixture và snapshot được phép; ghi rõ thay đổi đúng do fix vs sai số.
Bất kỳ source không đối soát hoặc báo cáo cross-org là no-go. Không yêu cầu tổng của hai
basis khác nhau bằng nhau để che thiếu mapping. Rollback giữ adapter exact, tạm khóa báo cáo
nếu tổng không tin cậy; không phục vụ tổng cũ như đã xác minh. Không sửa dữ liệu gốc để ép số.
Owner tài chính duyệt source lineage/budgetBasis; chủ dự án duyệt weighting task và unavailable
state. Tất cả AC + UAT PM/BCH/role cấm + CI main mới được đóng.
