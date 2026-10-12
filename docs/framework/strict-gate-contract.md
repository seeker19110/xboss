# Gate thực thi và chẩn đoán môi trường

Điểm vào vẫn là `scripts/dev-task.sh`; không có quy trình/scheduler thứ hai.
Contract này cụ thể hóa phần Verify của `standard-delivery.md`.

## Bốn kết quả khác nhau

| Kết quả | Exit code | Ý nghĩa |
| --- | --- | --- |
| BLOCKED | 2 | Chưa đủ cấu hình/tool; command/config sai cú pháp; command là no-op (`true`, `:`, `echo`…) hoặc test cho phép 0 ca (`--passWithNoTests`); HEAD/config/working tree đổi trong lượt kiểm. Không được nghiệm thu. |
| READY | 0 từ doctor | Đủ điều kiện cấu hình để bắt đầu. Chưa chạy build/lint/test, không phải PASS. |
| FAIL | 1 từ gate | Một command kiểm tra đã chạy và thất bại, hoặc test chạy 0 ca theo `gate_test_count_regex`. Dừng, sửa nguyên nhân rồi kiểm lại. |
| PASS | 0 từ gate | Các command đã cố định trong tiền kiểm đều chạy thành công; HEAD/config/working tree không đổi giữa hai lần chụp. |
| N/A | — | Task được loại theo `gate_skip_<task>_reason` đã review. Ghi rõ trong log/evidence, không đếm là PASS. |

Dùng `bash scripts/dev-task.sh doctor`, sau đó `bash scripts/dev-task.sh gate`.
Các lệnh đơn lẻ và `--print` vẫn phục vụ khảo sát/adoption; không dùng exit 0 của
một lệnh no-op riêng lẻ để thay cho nghiệm thu gate.

## Cấu hình theo dự án

Copy `.claude/project-commands.example.sh` thành `.claude/project-commands.sh`.
Điền command thật cho build/typecheck/lint/test. Bộ dò 13 stack vẫn hoạt động nhưng
không suy ra rằng kiểm tra bị thiếu là không áp dụng. Dự án không cần một loại kiểm
tra phải khai `gate_skip_<task>_reason` có lý do được review trong spec/ADR. Lý do
rỗng, tất cả task N/A, hoặc command và N/A cùng tồn tại đều không được chấp nhận.

`gate_tools` khai executable cần có; `gate_python_modules` khai module cần có.
Bash, Git và jq là tiền đề chung. Các biến là tên không chứa bí mật. Thay đổi
contract/lý do N/A phải được review như thay đổi quality gate, không giao worker
tự nới cấu hình chỉ để biến đỏ thành xanh.

Config là shell tin cậy, được nạp trong shell riêng fail-fast để đọc các biến;
chỉ nên chứa gán biến, không thực thi side effect. Doctor không chạy các command
kiểm tra, nhưng không phải sandbox chống một config shell độc hại.

## Bảo vệ kết quả

Tiền kiểm toàn bộ contract trước khi chạy task đầu tiên; lỗi cấu hình không được
âm thầm rơi xuống autodetect. Command được giữ nguyên trong suốt lượt chạy và thực
thi với errexit/pipefail. HEAD hoặc bytes config thay đổi thì lượt đó BLOCKED.
Output ghi context gồm HEAD, hash config và vân tay working tree; không phải attestation
mật mã. CI của đúng commit là nguồn nghiệm thu tích hợp.

Vân tay working tree = diff mọi file đã theo dõi so với HEAD + hash từng file chưa theo dõi
không bị ignore (chỉ đọc, không ghi object vào `.git`). File **đã theo dõi** bị sửa/xoá trong lúc
kiểm → BLOCKED vì kết quả không thuộc về một phiên bản. File chưa theo dõi được sinh/ghi lại/xoá
(gần như luôn là output build chưa ignore như `__pycache__`, `dist/`) chỉ bị cảnh báo kèm tên để thêm
vào `.gitignore`; evidence ghi trạng thái sau lượt chạy và liệt kê chúng ở `untracked_changed_during_run`.

Command là no-op nguyên văn (`true`, `:`, `echo`, `printf`, `exit 0`) bị BLOCKED: muốn loại một
task thì khai N/A có lý do, không dùng lệnh giả. Test có `--passWithNoTests` cũng BLOCKED. Đây là
chặn lỗi cẩu thả phổ biến, không phải bảo đảm: một lệnh không kiểm gì nhưng khác dạng vẫn qua.
Reviewer vẫn phải đối chiếu acceptance criteria với assertions, dữ liệu, artifact và mức phủ thực;
assertion bị vô hiệu hoá chỉ bị bắt bởi negative test/mutation của chính dự án.

## Evidence máy đọc và evidence-check (LD-03)

`bash scripts/dev-task.sh gate --evidence <file>` (hoặc `GATE_EVIDENCE=<file>`) ghi JSON
`gate-evidence/1`: `status` PASS/FAIL/BLOCKED, `head`, `config_sha`, `worktree`, thời điểm, từng
task với `status` PASS/FAIL/N/A/NOT_RUN, command, exit code, số giây; `test_cases` là số ca khi dự án
khai `gate_test_count_regex` (ERE có một nhóm bắt số, vd `'([0-9]+) passed'`), còn lại là `null` —
không biết, không phải 0. File cũ bị xoá ngay đầu lượt nên lượt BLOCKED/FAIL không để lại PASS cũ.
File evidence phải nằm ngoài repo hoặc trong thư mục đã ignore; nằm trong cây đang kiểm → BLOCKED.
Khi đã yêu cầu evidence, lỗi tạo/ghi/đổi tên file → BLOCKED (exit 2), không báo PASS dù
các kiểm tra đã xanh. Đích phải là file; không chuyển file tạm vào một thư mục cùng tên.
File tạm được dọn khi ghi thất bại; khắc phục đường dẫn/quyền ghi rồi chạy lại gate.

`bash scripts/dev-task.sh evidence-check <file>` chỉ trả 0 (VERIFIED) khi evidence là PASS, đủ
build/typecheck/lint/test (mỗi task PASS hoặc N/A có lý do) **và** HEAD, config, working tree hiện
tại khớp. Lệch → 1 (STALE/INCOMPLETE/không phải PASS); file hỏng hoặc tạo ngoài git → 2. Dùng nó
thay cho việc tin lời "đã PASS" của worker hay của lượt trước. Giới hạn: không phải chữ ký — một
JSON viết tay khớp cây hiện tại vẫn qua; nghiệm thu tích hợp vẫn là CI của đúng commit.

## Bản đồ AC → bằng chứng

Spec Approved đặt tên từ 2026-10-07 phải có bảng `| AC | Bằng chứng | … |` (mẫu ở
`FEATURE-SPEC.template.md` §16). Mỗi AC của mục Acceptance criteria có một dòng: tham chiếu
`path` hoặc `path::tên-test` có thật, `thủ công: <cách quan sát>`, hoặc `chưa có — <lý do>`.
Contract C-4 (`spec-compiler.sh --compile-all`) đỏ khi AC thiếu dòng, AC lạ, ô trống, file/tên test
không tồn tại, hoặc spec không có AC. `spec-compiler.sh --trace <spec>` in trạng thái từng AC và chỉ
thoát 0 khi mọi AC đã có bằng chứng thật (không còn "chưa có"). Truy vết ≠ nghiệm thu: nó cho biết
cái gì chứng minh, còn kết quả chạy nằm ở CI/evidence của đúng commit.
Doctor cũng không chứng minh credentials/branch protection/thiết bị production
đã được kiểm; các cổng chuyên biệt vẫn giữ nguyên.

## Chính repo khung

`.claude/project-commands.sh` trong repo này chạy syntax, static complexity,
ShellCheck, docs/CI policy, toàn bộ self-test và runtime safety. Nó không được
copy làm cấu hình mặc định sang dự án khác. Hai installer chỉ phát mẫu để dự án
đích lựa chọn command đúng stack. Bộ kiểm resolver 13 stack vẫn là fixture,
ngoại trừ fixture Node nhỏ chạy chương trình/test thật được bổ sung để đối chứng.
Không suy rộng fixture đó thành chứng minh mọi toolchain hay sản phẩm production.

## Các khoảng trống không được coi là đã đóng

C01: kiểm chứng áp dụng đầu-cuối trên một sản phẩm thật vẫn cần thực hiện.
C02: tương thích toàn bộ CI drop-in trên mọi stack vẫn cần đối chiếu đầy đủ.
Hook thiếu jq vẫn có đường fail-open như tài liệu cũ; doctor phát hiện thiếu tool,
không thay thế sandbox hoặc vô hiệu hóa mọi bypass thủ công.
Native PowerShell nâng cấp, spec-approval proof và đánh giá UX thực tế là các phạm vi riêng,
không được đánh dấu hoàn tất bởi gate này. Bản đồ AC → bằng chứng (LD-03) khai cái gì chứng
minh từng AC; nó chưa tự nối kết quả chạy của từng test với từng AC (cần artifact CI theo test).


## Parity của CI và local gate

Local gate chạy toàn bộ shell suite. CI Linux đã gọi từng suite trong các job
bắt buộc nên không gọi full gate thêm một lần; doctor chỉ báo READY. Kiểm parity
ở `tests/test_ci_suite_parity.py` giữ tập suite bằng nhau và mỗi suite đúng một
lần trên Linux. Các lượt Windows vẫn là kiểm tra tính tương thích riêng.
Không giảm ngưỡng, không bỏ cổng aggregate, không dùng READY thay cho test PASS.
