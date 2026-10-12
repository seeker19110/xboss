# ADR-0014: Quy trình theo rủi ro (S/M/L), model mặc định Sonnet mới nhất, trần 5 subagent — nâng khung lên `projects-template` @ `59bd1d1`

- **Trạng thái:** Đã chấp nhận (chủ repo chọn trực tiếp 3 điểm chính sách trong phiên 2026-10-12)
- **Ngày:** 2026-10-12
- **Thay thế:** mục "Lập kế hoạch → điều phối → thi hành (3 tầng)" bắt buộc của `CLAUDE.md` (quyết định
  2026-07-16) và `"model": "opusplan"` trong `.claude/settings.json`
- **Nguồn upstream:** [`seeker19110/projects-template`](https://github.com/seeker19110/projects-template)
  v0.1.0 @ `59bd1d1` — ADR-0007 (bỏ `opusplan`), ADR-0010 (quy trình theo rủi ro, agent chính tự làm),
  ADR-0011 (trần 5 subagent toàn cây) **của repo khung** (số ADR của khung KHÔNG trùng nghĩa với số ADR
  của XBoss — ADR-0010 của XBoss là tương phản màu)

## Bối cảnh

XBoss lấy bộ khung quy trình từ `projects-template` lần cuối 2026-09-21 (chép chọn lọc, xem
`docs/archive/PROGRESS-before-2026-09-25.md` mục "Chép có chọn lọc từ seeker19110/projects-template").
Từ đó khung đổi ba điểm chính sách mà XBoss vẫn chạy theo bản cũ:

1. **`opusplan`**: khung ghi nhận CLI không còn hỗ trợ `/model opusplan`; XBoss vẫn đặt
   `"model": "opusplan"` và mô tả Tầng 1 là "phiên chính (opusplan · Fable 5)".
2. **3 tầng bắt buộc**: mọi việc, kể cả sửa một dòng, đi qua đặc tả → `PLAN.md` → coordinator → worker.
   Chi phí bàn giao (mất ngữ cảnh, token, vòng review) lớn hơn lợi ích ở việc nhỏ; chất lượng thật do
   cổng máy giữ (`npm run gate`, CI, test đỏ-trước, hook `risk-zone-gate`/`protect-config`).
3. **Không có trần subagent**: agent lồng agent (coordinator → worker → audit-* → ecc-*) có thể bùng
   nổ token mà không gì chặn.

XBoss cũng không có `docs/framework/FRAMEWORK-VERSION`, nên `copy-framework.sh --upgrade` của khung coi
XBoss như dự án chưa áp khung và **ghi đè** `.claude/commands/review.md`, `maintain.md`,
`docs/ops/incident-response.md` (đã kiểm bằng chạy thử trên bản sao, 2026-10-12).

## Quyết định

1. **Model mặc định = Sonnet mới nhất** (`.claude/settings.json` → `claude-sonnet-5-5`). Lập kế hoạch/
   đặc tả mức L hay quyết định kiến trúc khó → chủ động `/model` sang model cao cấp nhất đang có
   (Opus/Fable), xong quay lại. Không dùng `opusplan`. Đổi model theo độ khó thật, không phải nghi thức
   đầu mỗi việc. (Phiên cloud chọn model lúc tạo phiên; dòng `model` của settings áp cho phiên CLI.)
2. **Quy trình theo mức rủi ro S/M/L** (bảng trong `CLAUDE.md`): chọn theo yếu tố rủi ro cao nhất,
   nghi ngờ thì chọn mức cao hơn. Mức chỉ đổi **lượng giấy tờ và điều phối**; sàn chất lượng (DoD,
   `npm run gate`, CI xanh, test hồi quy đỏ-trước cho fix logic, `PROGRESS.md`) giống nhau ở mọi mức.
   Agent chính tự làm là mặc định cho việc **một PR**; từ **2 PR trở lên** giao subagent thực thi theo
   bảng `route:`; điều phối 3 tầng (coordinator) là tùy chọn cho mức L có ≥ 2 PR độc lập.
3. **Trần 5 subagent đang chạy trong toàn cây**, tính cả coordinator, reviewer, `audit-*`, `ecc-*` và
   agent do subagent tạo. Coordinator đang chạy còn tối đa 4 slot. Chỉ đơn vị độc lập (không chung
   file/migration/lockfile) mới chạy song song; phụ thuộc thì tuần tự.
4. **Giữ nguyên** bảng `route:` (4 worker), LUẬT CỨNG "thiếu đặc tả thì hỏi" (áp cho mức M/L), agent
   `audit-*` bắt buộc khi chạm vùng rủi ro `docs/audit.md` §8, lớp ECC (ADR-0013), OCR (ADR-0012).
5. **Đóng dấu bản khung** `docs/framework/FRAMEWORK-VERSION` (v0.1.0 @ `59bd1d1`) và nâng bản về sau qua
   `scripts/framework-upgrade.sh` (gọi `copy-framework.sh --upgrade --no-hooks` rồi dọn phần XBoss không
   lấy). Danh sách lấy/không lấy và lý do: `docs/framework/XBOSS.md`.

## Lý do

- Alias CLI cố định là điểm gãy (bài học ADR-0007 của khung); chính sách "model mạnh khi khó" mô tả được
  bằng hành vi, không cần alias.
- Rủi ro mới là thứ quyết định cần bao nhiêu thủ tục; cổng máy của XBoss đã đủ dày để việc S/M không
  cần thêm tầng bàn giao.
- Trần cố định chặn bùng nổ agent lồng agent; con số 5 khớp khung để lần nâng bản sau không lệch.

## Các phương án đã cân nhắc

- **Giữ nguyên 3 tầng bắt buộc + `opusplan`** — chủ repo chọn theo khung (2026-10-12).
- **Chạy thẳng `copy-framework.sh`** — bị loại: không có dấu bản nên ghi đè lệnh/runbook đã tuỳ biến, thêm
  ~117 file (cầu nối Cursor/Gemini/Codex, `.mcp.json`, engine Python, test shell) XBoss không dùng, và đặt
  `core.hooksPath` có thể vô hiệu husky.
- **Gỡ hẳn coordinator/worker** — bị loại: mất khả năng song song cho việc lớn thật.

## Hệ quả

- Tích cực: việc S/M đi thẳng từ yêu cầu tới PR; ít token bàn giao; nâng khung về sau có merge 3 chiều.
- Đánh đổi: chọn mức là phán đoán — chống chọn thấp bằng luật "nghi ngờ thì mức cao hơn" và hook
  `risk-zone-gate` (vẫn bắt nêu bất biến trước khi sửa vùng §8 dù ở mức nào).
- Đặc tả `docs/nang-cap/M<xx>-*.md` cũ ghi "Spec owner: Phiên chính (opusplan)" là lịch sử, không sửa.
