---
description: Phỏng vấn dồn dập (grilling) để làm rõ một ý tưởng/kế hoạch/quyết định trước khi code — hỏi theo đợt, mỗi câu kèm đề xuất, dừng khi hết mơ hồ; ghi thuật ngữ vào đặc tả docs/nang-cap, đề xuất ADR khi có quyết định chốt
---

> 💡 Lệnh lấy từ `projects-template` @ `59bd1d1` (ADR-0014 của XBoss). Model theo `CLAUDE.md` mục "Quy trình theo mức rủi ro".
> Các chỗ ghi `CLAUDE.md §N`, "contract §3d" hay số ADR trong lệnh là của **repo khung** (`docs/framework/02-ai-rules-and-project-template.md`,
> `docs/framework/standard-delivery.md`); ở XBoss, `CLAUDE.md` + `docs/adr/` của XBoss thắng — đối chiếu ở `docs/framework/XBOSS.md`.

Chạy một phiên **phỏng vấn dồn dập** để đạt hiểu biết chung với người dùng trước khi hành động — kỹ thuật thực thi cụ thể cho mục 9 ("dừng và hỏi") và mục 2 ("chủ động góp ý") của `CLAUDE.md`.

> Dùng khi: yêu cầu người dùng mơ hồ/nhiều cách hiểu (trigger `CLAUDE.md` §1; chỉ hỏi phần không tự xác minh được — §9, contract §3d); một quyết định thiết kế có nhiều nhánh chưa chốt; hoặc gõ `/grill` trực tiếp.

Theo contract §3d, tự chốt các nhánh đủ dữ kiện và đã được ủy quyền trước khi tính biên hỏi.
Biên chỉ còn thông tin/mục tiêu không thể tự xác minh hoặc quyền chưa được cấp.

## Cơ chế — cây quyết định theo đợt (round)

1. **Dựng cây quyết định:** hình dung mọi thứ cần chốt cho việc đang bàn như một cây — mỗi quyết định phân nhánh ra các quyết định phụ thuộc vào nó.
2. **Tính "biên hỏi được" (frontier):** trong cây, đó là mọi câu hỏi mà **tiền đề của nó đã được trả lời** — tức hỏi được ngay, không phải đoán trước câu trả lời chưa nghe.
3. **Hỏi cả biên trong một đợt**, đánh số, mỗi câu kèm đề xuất:
   ```
   ❓ **C1** — **<tên câu hỏi>**: <nội dung, có thể nhiều lựa chọn>

   ➡️ <đề xuất của bạn>
   ```
   Câu nào còn phụ thuộc câu khác chưa trả lời trong đợt này → để dành đợt sau, không hỏi dồn.
4. **Chờ người dùng trả lời cả đợt**, rồi tính lại biên (câu vừa chốt có thể mở khóa câu phụ thuộc nó) và hỏi đợt tiếp.
5. **Việc tìm SỰ KIỆN luôn là việc của bạn, không phải người dùng.** Khi một câu hỏi ở biên cần một dữ kiện từ môi trường (đọc file, tra phiên bản, tìm quy ước hiện có) → tự tra hoặc giao subagent `ecc-code-explorer` (lần code)/`version-check` (tra phiên bản), **không hỏi người dùng thứ tự tra được**. Không cần chặn cả đợt để chờ — chỉ những câu phụ thuộc dữ kiện đó mới đợi, phần còn lại của biên vẫn hỏi luôn.
6. **Việc QUYẾT ĐỊNH theo ủy quyền toàn cục:** phiên chính tự chốt phương án tối giản nhất đạt chất lượng cao nhất trong scope, theo `docs/framework/standard-delivery.md` §3d. Chỉ hỏi dữ kiện/mục tiêu không thể tự xác minh hoặc phần cần quyền chưa được cấp.
7. **Kết thúc khi biên rỗng** — không còn nhánh nào bỏ ngỏ, không còn gì bạn đang ngầm giả định. Ghi ngắn hiểu biết đã chốt và căn cứ theo §3d rồi hành động tiếp (viết `PROJECT.md`, tạo ADR, hoặc bắt tay code).

## Cập nhật tài liệu ngay trong lúc phỏng vấn (không dồn cuối phiên)

- **Thuật ngữ chốt hoặc lệch nghĩa với thuật ngữ đã có** (`PROJECT.md`, `spec.md`, `docs/ERD.md`, enum trong `lib/`) → ghi vào đặc tả `docs/nang-cap/M<xx>-*.md` đang viết. Nếu người dùng dùng từ mâu thuẫn với thuật ngữ đã ghi → nêu ra ngay: "`spec.md` định nghĩa X là ... nhưng bạn vừa dùng nghĩa khác — ý nào đúng?".
- **Quyết định vừa chốt khó đảo + gây bất ngờ nếu không biết lý do + có đánh đổi thật** (đủ cả 3) → phiên chính ghi ADR mới trong `docs/adr/` (mẫu `0000-template.md`) trong phạm vi ủy quyền §3d, nêu căn cứ để phiên sau không vô tình lật ngược.

## Bất biến
- Không hỏi lại nhánh đã được ủy quyền; không tự bịa dữ kiện hoặc mở quyền ngoài scope. Phương án phải giữ bảo mật, tính đúng, TDD và cổng chất lượng (§3d).
- Không hỏi lại thứ đã có sẵn trong code/tài liệu (đúng CLAUDE.md §4 — chống ảo giác).
- Việc lớn quá 1 phiên (nhiều tính năng, nhiều tuần) → sau khi biên rỗng, chuyển sang lập kế hoạch chia nhỏ (mục 2 "Chia nhỏ") thay vì cố phỏng vấn hết trong một lượt.

Bắt đầu: dựng cây quyết định, tự giải quyết các nhánh đủ dữ kiện và đã được ủy quyền; chỉ hỏi biên còn thiếu thông tin/quyền thật sự.
