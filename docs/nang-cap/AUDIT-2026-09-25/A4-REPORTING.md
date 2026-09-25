# A4 — Báo cáo đúng nguồn, cùng snapshot và có nghĩa rõ ràng

State: **Approved for implementation**, QUALITY-FINAL-1, 2026-09-25; thi hành sau.
Quyết định D05/D06/D09 tại APPROVAL.md. Đọc SOURCE-MAP, DATA-CONTRACTS và TEST-MATRIX.

## 1. Hiện trạng, outcome và phương án

costTotals gọi lại costSummary(system), làm lặp tổng hợp khi route đã lấy cùng bảng.
Cost theo tầng đang lấy hợp đồng tầng làm gốc và truy vấn payment theo sheet/floor;
phải kiểm khóa thật trước khi kết luận dữ liệu có thể nhân đôi. Không tạo fixture vi phạm
unique constraint để chứng minh một lỗi không thể xảy ra trong schema hợp lệ.
Portfolio hiện mô tả trọng số task nhưng lấy trung bình theo dự án.

Chọn một service tổng hợp có nguồn/grain/filter rõ, tiền exact và một snapshot dữ liệu.
Không thêm Redis/materialized view hoặc kho báo cáo để che logic sai. Không thay công thức
nghiệp vụ đã chốt chỉ để giảm query. Runtime errors không được biến thành số 0 trên dashboard.

## 2. Source contract

A4-FR01: mỗi dòng nguồn tính một lần theo khóa thật: boq_items.id, po_items.id,
payment_bills.id; floor_contracts dùng PK/unique grain thực từ catalog của S00.
Pre-aggregate từng nguồn rồi mới join aggregate; không dùng SUM(DISTINCT amount), vì các
chứng từ khác nhau cùng giá trị đều có thể hợp lệ. Không dùng label/code làm khóa thay ID.

A4-FR02: giữ các công thức nguồn hiện tại, sửa độ chính xác và phạm vi chứ không đổi nghĩa:
BOQ gốc theo qty_contract nhân unit_price; VO chỉ các trạng thái approved,
partially_approved, contract_added và qty_approved khi includeVo bật; PO loại cancelled;
cam kết gồm nguồn PO và giao thầu theo quy ước hiện hữu; actual gồm payment_bills cả advance.
Purchase-order quantity float phải chuyển qua đường exact/provenance ở A3 trước nhân tiền.
Không tự suy mọi payment_bills là chỉ những hàng có một status paid chưa tồn tại.

A4-FR03: payment_bills đã có project_id, contract_id, payment_cert_id và sheet_type_id.
Lấy scope trực tiếp đã xác minh; mọi parent có mặt phải trỏ cùng project/org. Dòng legacy
thiếu project_id chỉ được backfill khi tất cả lineage xác định duy nhất cùng một project.
Thiếu hoặc mâu thuẫn lineage phải đưa vào đối soát riêng, không chọn parent thuận tiện để
đưa tiền vào báo cáo. Không trả tổng có vẻ đầy đủ khi có lỗi scope chưa giải quyết.

Phân biệt unassigned với invalid-scope: unassigned là đã biết đúng project nhưng chưa phân
hệ/tầng, vẫn tính vào projectTotals; invalid-scope không được lộ cho project tùy ý và khiến
báo cáo liên quan chưa đủ điều kiện đối soát. Không dùng bucket unassigned để hợp thức hóa
một khoản tiền không biết thuộc tổ chức nào.

A4-FR04: hệ được nhóm theo system ID, label/code chỉ hiển thị. Dòng thiếu hệ nhưng đúng
scope vào key unassigned, systemId null; không tạo FK 0 trong DB.
Tầng có grain sheet_type_id và floor_label theo khóa nguồn đã kiểm. Aggregate hợp đồng
và payment riêng rồi join ở cùng grain, giữ payment hợp lệ không có hợp đồng tầng.
Floor budget là proxy hợp đồng tầng, không phải BOQ đã được phân bổ tầng.

A4-FR05: PO và hợp đồng có thể có quan hệ tham chiếu; không tự loại một nguồn vì amount
hoặc tên giống nhau. S00 lập source-lineage và giữ định nghĩa cam kết đang áp. Nếu chứng minh
một nghĩa vụ bị biểu diễn hai lần, phải có rule đối soát theo ID nguồn/quan hệ đã kiểm,
không giải bằng SUM DISTINCT hoặc tự thay điều khoản thương mại.

## 3. API và snapshot

Service đích getCostReport(scope, options) thay việc route gọi lặp costSummary/costTotals.
Options gồm groupBy system/floor và includeVo; scope là A1 đã xác minh. Trả rows,
selectedTotals, projectTotals, settings, alerts và metadata phiên bản nguồn.

selectedTotals luôn bằng tổng exact của rows đang hiển thị.
projectTotals là tổng tài chính dự án đúng phạm vi, gồm unassigned, không mặc nhiên bằng
selectedTotals khi đang xem tầng. Trường totals legacy giữ nghĩa tổng dự án trong cửa sổ
chuyển đổi; UI mới dùng tên tường minh, không âm thầm đổi tổng theo tab.

Metadata cần có projectId, groupBy, includeVo, reportVersion, computedAt, currency,
moneyFormat, budgetBasis và coverage. Floor budgetBasis là floor-contract-proxy;
system là boq. Coverage phân biệt thiếu mapping tầng/hệ với nguồn sai phạm vi.
API tài chính private, no-store; SW network-only. Money wire theo A3, không number trung gian.

A4-FR06: rows/totals/alerts/settings được đọc trong cùng transaction REPEATABLE READ READ ONLY
đặt ngay khi BEGIN, trước mọi SELECT/set_config, hoặc một SQL statement CTE có scope đúng.
Không giả Promise.all trong READ COMMITTED cho snapshot nhất quán. Snapshot không được giữ
mở chờ UI, xuất file dài hoặc gọi hệ ngoài; materialize dữ liệu đã kiểm rồi kết thúc transaction.

Dữ liệu báo cáo không có N+1 theo số nhóm/dòng. Đếm query nghiệp vụ riêng với auth/context;
query count và p95 có baseline đo thật. Không cam kết tốc độ tăng nhiều lần khi chưa benchmark.

A4-FR07: alerts từ cùng rows exact. Budget dương mới chia tỷ lệ; budget 0 và committed dương
hiện chưa có ngân sách, không Infinity hoặc 100% giả. Ngưỡng lấy cost_settings hiện có;
bảng này là cấu hình toàn hệ id 1 ở baseline, chưa tự biến thành cấu hình per-project.
So ratio bằng cross multiplication exact, hiển thị ratio là thao tác presentation riêng.

## 4. Portfolio

A4-FR08: công thức mặc định đã chốt là tổng task.progress_percent chia số task hợp lệ của
tập project actor được phép xem trong org hiện tại. Project không có task vẫn tính vào
số dự án nhưng không tạo mẫu số giả. Toàn bộ không task trả avgProgress null,
progressAvailable false và taskCount 0; UI hiện Chưa có dữ liệu.

List/KPI dùng cùng filter status/org/visibility. Task join nhiều dimensions không tăng mẫu
số. Delayed theo ngày VN, ngày task kế thừa package khi cần, progress dưới 1 và không
hoan_thanh/nghiem_thu. Không làm tròn gần 100% thành trạng thái hoàn thành thật.

Dữ liệu progress null/ngoài miền là data-quality issue, không sửa upstream từ báo cáo.
Denominator chỉ tập hợp hợp lệ, coverage phải cho biết đã loại bao nhiêu bản ghi; không gọi
số này là đầy đủ khi coverage thiếu. Nhãn nêu tiến độ theo công việc, không giả tiến độ tiền/EVM.

## 5. Journeys và tiêu chí nghiệm thu

Loading/empty/error/unavailable khác nhau. Đổi project không lóe số liệu cũ; báo cáo sai
phạm vi hoặc thiếu nguồn trọng yếu hiện lỗi cần đối soát, không số 0. Drill-down chỉ tới
chứng từ được phép thấy, export phải kiểm quyền server và dùng exact source.
Keyboard/axe/theme/desktop/mobile giữ chuẩn chung; đồ thị không thay số exact trong tooltip.

A4-AC01: fixture hợp lệ nhiều nguồn cùng grain không nhân đôi actual; hai payment cùng amount
khác ID vẫn tính đủ. Nếu unique constraint cấm tình huống nhiều contract thì kiểm constraint
đó và dùng fixture hợp lệ khác để kiểm join, không tắt constraint.
A4-AC02: unassigned đúng project vẫn có trong tổng; payment không sheet/không contract tầng
không biến mất. Invalid-scope được chặn/đối soát, không gộp vào unassigned của project bất kỳ.
A4-AC03: VO/includeVo/PO cancelled/advance giữ semantics đã chốt, tiền exact.
A4-AC04: insert payment đồng thời không cho rows và totals hai snapshot; selectedTotals đúng
rows, projectTotals không bị ép bằng floor proxy khi coverage khác.
A4-AC05: một task 100% và chín task 0% cho 10%, thêm project rỗng không đổi mẫu số;
không task toàn bộ trả unavailable, không NaN hoặc 100% giả.
A4-AC06: list/KPI/filter cùng org; nhãn trùng không ghép nhầm; role bị che không nhận tiền qua
alert/metadata/export hoặc tham chiếu chứng từ khác tổ chức.
A4-AC07: ngày VN qua 00:00 đúng delayed; dimension joins không nhân task;
progress lỗi hiện coverage, không tự sửa data nghiệp vụ.
A4-AC08: SQL/API/export bằng nhau, query count không theo số nhóm, benchmark đạt D09 hoặc
báo FAIL/NOT_RUN. Q-AC05 kiểm cụ thể direct project và mọi parent của payment.

## 6. Điểm chạm, rollout và rollback

lib/tai-chinh/cost.ts, lib/ha-tang/projects.ts, app/api/costs/route.ts và consumers costs/
portfolio/dashboard/export theo inventory. DDL chỉ thêm index/backfill đã có plan chứng minh,
không mass ALTER. Permission và transaction contract phải hoàn tất trước canonical service.

S11 aggregate/API → UI/totals labels → export; S12 KPI sau khi projects.ts được giải phóng
file lock. Shadow compare ở disposable/snapshot được phép, không tự chạy production.
Metrics report_duration/query_count/coverage/reconciliation_mismatch, không amounts/PII.

No-go khi số tiền khác nguồn exact, rò scope, hai snapshot hoặc coverage bị che. Rollback
giữ adapter exact và quyền đúng; tạm khóa báo cáo lỗi, không trả tổng cũ như đã xác minh.
Không sửa dữ liệu gốc để ép cho hai báo cáo khác basis bằng nhau. Tất cả evidence main/UAT
còn phải thực hiện; bản đặc tả chưa tự chứng nhận hệ thống báo cáo hoàn tất.
