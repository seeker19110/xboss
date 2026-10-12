---
description: Vòng chẩn đoán có kỷ luật cho bug khó/không tái hiện được hoặc suy giảm hiệu năng — dựng feedback loop đỏ-được trước, rồi mới tái hiện, ra giả thuyết, đo đạc, sửa kèm test hồi quy
---

> 💡 Lệnh lấy từ `projects-template` @ `59bd1d1` (ADR-0014 của XBoss). Model theo `CLAUDE.md` mục "Quy trình theo mức rủi ro".
> Các chỗ ghi `CLAUDE.md §N`, "contract §3d" hay số ADR trong lệnh là của **repo khung** (`docs/framework/02-ai-rules-and-project-template.md`,
> `docs/framework/standard-delivery.md`); ở XBoss, `CLAUDE.md` + `docs/adr/` của XBoss thắng — đối chiếu ở `docs/framework/XBOSS.md`.

Chẩn đoán một bug **khó** — không tái hiện được ngay, chập chờn, hoặc hồi quy hiệu năng — theo trình tự cố định. Chỉ bỏ qua một pha khi có lý do rõ ràng.

> Dùng khi: người dùng nói "debug"/"tìm lỗi này giúp", báo lỗi/crash/chậm mà chưa rõ nguyên nhân; hoặc gõ `/debug`. Bug **đơn giản, tái hiện ngay lập tức** thì cứ sửa thẳng — khỏi cần chạy hết 6 pha.

> Đây khác `/incident` (sự cố **production** đang ảnh hưởng người dùng thật — ưu tiên giảm thiệt hại trước) và khác `/review` + agent `audit-*` (rà diện rộng theo `docs/audit.md`, không nhắm một bug cụ thể).

## Pha 0 — Tra `TRAPS.md` trước khi ra giả thuyết

Nếu repo có `TRAPS.md` ở gốc: đọc nó trước. Triệu chứng hiện tại có khớp một khuôn đã ghi không? Khớp
→ áp thẳng "cách rà" của mục đó, tiết kiệm cả vòng Pha 1–4. Không khớp → tiếp tục bình thường, và ghi
mục mới vào `TRAPS.md` ở Pha 6 khi sửa xong. Chưa có `TRAPS.md` (dự án đích chưa tạo) → bỏ qua pha
này, không chặn.

## Pha 1 — Dựng feedback loop (quan trọng nhất, dồn phần lớn công sức ở đây)

Có một lệnh **đỏ-được-trên-đúng-bug-này** thì mọi thứ sau chỉ là cơ học; không có thì càng đọc code càng vô ích. Thử theo thứ tự: test tự động ở đúng seam chạm bug → script curl/HTTP vào dev server → chạy CLI với input mẫu, so khớp output đã biết đúng → script trình duyệt headless (Playwright) → replay lại một request/log đã ghi → harness tối giản dựng lại đúng đường đi chạm bug → vòng lặp input ngẫu nhiên (nếu lỗi kiểu "thỉnh thoảng sai") → bisect qua các commit/state đã biết tốt/xấu → so sánh vi sai giữa 2 phiên bản/cấu hình.

**Bug chập chờn:** mục tiêu là **tăng tỷ lệ tái hiện** (lặp 100 lần, tăng tải, thu hẹp cửa sổ thời gian), không phải một repro sạch tuyệt đối — chập chờn 50% debug được, 1% thì chưa.

**Hoàn thành Pha 1 khi:** có đúng MỘT lệnh đã **chạy thật** (dán lệnh + output), và lệnh đó: bắt đúng triệu chứng người dùng mô tả · ra kết quả ổn định (hoặc tỷ lệ tái hiện đủ cao) · chạy vài giây, không phải vài phút · tự chạy được không cần người canh.

**Nếu thật sự không dựng được:** dừng lại, nói rõ đã thử gì, xin người dùng: quyền vào môi trường tái hiện được, artifact đã ghi (log/HAR/core dump), hoặc cho phép thêm instrument tạm thời vào production. **Không** nhảy sang đoán nguyên nhân khi chưa có lệnh đỏ-được.

## Pha 2 — Tái hiện + thu nhỏ

Chạy lệnh ở Pha 1, xác nhận đúng triệu chứng người dùng mô tả (không phải lỗi khác na ná). Sau đó **thu nhỏ dần**: bớt từng phần input/gọi/cấu hình một, chạy lại sau mỗi lần bớt, chỉ giữ lại phần **cốt lõi cho bug xảy ra**. Xong khi bớt gì cũng làm lệnh chạy xanh trở lại.

## Pha 3 — Ra giả thuyết (3–5 cái, xếp hạng, có thể bác bỏ)

Mỗi giả thuyết viết dạng: "Nếu X là nguyên nhân thì đổi Y sẽ hết bug / đổi Z sẽ bug nặng hơn". Không phát biểu được dạng này thì giả thuyết đó chỉ là cảm tính — bỏ hoặc mài sắc lại. **Cho người dùng xem danh sách đã xếp hạng trước khi kiểm tra** — họ thường biết ngay ("tụi mình vừa deploy cái #3 tuần trước") hoặc đã loại trừ sẵn vài cái.

## Pha 4 — Đo đạc

Mỗi phép đo nhắm đúng một giả thuyết, **đổi một biến một lần**. Ưu tiên debugger/REPL (một breakpoint hơn mười dòng log) trước khi thêm log; log thêm phải gắn tiền tố duy nhất (vd `[DEBUG-a4f2]`) để dọn sạch bằng một lệnh grep. Không "log tất cả rồi grep mò". Hồi quy hiệu năng thì đo baseline trước (timing/profiler), rồi mới bisect — log ở đây thường sai hướng.

## Pha 5 — Sửa + test hồi quy

Viết test hồi quy **trước** khi sửa — nhưng chỉ khi có **seam đúng** (test chạm đúng đường đi thật gây bug, không phải seam nông giả tạo cho xanh). Không có seam đúng → đó tự nó là một phát hiện quan trọng (kiến trúc đang cản việc khóa chặt bug này) — ghi lại, để dành cho Pha 6. Có seam: viết test thất bại → xác nhận đỏ → sửa → xác nhận xanh → chạy lại lệnh gốc ở Pha 1 (chưa thu nhỏ) để chắc chắn.

## Pha 6 — Dọn dẹp + rút kinh nghiệm

Trước khi coi là xong: repro gốc hết tái hiện · test hồi quy xanh (hoặc đã ghi rõ lý do không có seam) · gỡ sạch mọi log `[DEBUG-...]` (`grep` tiền tố để chắc) · xóa prototype tạm dùng để chẩn đoán · ghi giả thuyết đúng vào commit/PR để người debug sau học được.

**Ghi vào `TRAPS.md`** (nếu bug này là một khuôn — không phải lỗi đơn lẻ do gõ sai một lần): thêm mục
mới (triệu chứng → cách rà → chốt chặn → ngày/PR), hoặc nếu khuôn đã có sẵn trong `TRAPS.md` (Pha 0
đã khớp) thì thêm dòng "Tái phát <ngày>" vào mục cũ — **không** tạo mục trùng. Repo chưa có
`TRAPS.md` → tạo mới từ `docs/framework/templates/TRAPS.template.md`.

**Rồi mới hỏi:** điều gì lẽ ra ngăn được bug này? Nếu câu trả lời chạm kiến trúc (không có seam test tốt, caller rối, coupling ẩn) → đề xuất rà bằng agent `audit-*`/`ecc-architect` hoặc ghi ADR, **sau khi** đã sửa xong — lúc này biết nhiều hơn lúc mới bắt đầu.

Bắt đầu: hỏi nhanh **triệu chứng cụ thể là gì + đã thử tái hiện chưa**, rồi vào Pha 1.
