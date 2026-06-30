# KHUNG 1 — Quy trình & Tiêu chuẩn phát triển phần mềm

> **File khung chung (master), tái sử dụng cho MỌI dự án.**
> Đây là "cuốn sổ tay" định nghĩa: làm gì, theo trình tự nào, và đạt tiêu chuẩn gì ở mỗi giai đoạn.
> Cặp đôi với **KHUNG 2** (luật AI + mẫu định nghĩa dự án). Từ hai khung này + yêu cầu một dự án cụ thể, ta sinh ra `PROJECT.md` và `CLAUDE.md` riêng cho dự án đó.

---

## Cách dùng khung này

1. Khi bắt đầu một dự án mới, đọc khung này để nắm trình tự và tiêu chuẩn.
2. Điền **Mẫu định nghĩa dự án** trong KHUNG 2 → tạo ra `PROJECT.md` của dự án.
3. Tinh chỉnh `CLAUDE.md` cho dự án (dựa trên mẫu trong KHUNG 2 / file CLAUDE.md mẫu).
4. Đi qua từng giai đoạn dưới đây. **Không bỏ giai đoạn.** Mỗi giai đoạn có một "cổng" (gate) phải đạt mới được sang giai đoạn sau.

---

## 7 nguyên tắc nền tảng (áp dụng xuyên suốt mọi giai đoạn)

1. **Lỗi rẻ nhất là lỗi bắt sớm nhất** — dịch chuyển kiểm tra về càng sớm càng tốt (shift-left).
2. **An toàn kiểu dữ liệu** — TypeScript `strict`, không `any`, mọi dữ liệu ngoài phải validate lúc chạy.
3. **Bảo mật từ thiết kế** — giả định mọi đầu vào là độc hại; không bao giờ tin client; logic nhạy cảm luôn ở server.
4. **Một nguồn sự thật** — mỗi thông tin/logic chỉ định nghĩa ở một nơi (DRY).
5. **Mọi thay đổi đều quay lại được** — commit nhỏ, migration có phiên bản, luôn có kế hoạch rollback.
6. **Tự động hóa thay vì kỷ luật** — tiêu chuẩn nào kiểm tra được bằng máy thì bắt buộc tự động hóa.
7. **Tài liệu hóa "tại sao"** — code nói "cái gì", tài liệu/comment nói "tại sao".

---

## Tổng quan 9 giai đoạn

| GĐ | Tên | Thời gian (solo) | Cổng để qua |
|----|-----|------------------|-------------|
| 0 | Ý tưởng & Xác thực | 3–7 ngày | Có bằng chứng nhu cầu thật |
| 1 | Lập kế hoạch & Phạm vi | 2–4 ngày | MVP + tiêu chí chấp nhận + DoD rõ ràng |
| 2 | Thiết kế | 3–7 ngày | Schema CSDL + kiến trúc + API contract được duyệt |
| 3 | Thiết lập môi trường | 1–2 ngày | Hàng rào tự động hoạt động, deploy thử OK |
| 4 | Phát triển | 60–70% thời gian | Tính năng đạt tiêu chí chấp nhận |
| 5 | Kiểm thử | Đan xen GĐ 4 | Test xanh, qua các loại kiểm thử bắt buộc |
| 6 | Triển khai | 1–2 ngày | Cổng CI/CD đạt, backup & rollback sẵn sàng |
| 7 | Ra mắt | ~1 tuần | Checklist pháp lý/SEO/onboarding đủ |
| 8 | Sau ra mắt | Liên tục | Quy trình giám sát & cải tiến vận hành |

---

## Giai đoạn 0 — Ý tưởng & Xác thực

**Mục tiêu:** Chắc chắn vấn đề có thật và có người cần, trước khi viết dòng code nào.

**Việc cần làm:**
- [ ] Phát biểu vấn đề trong 1–2 câu rõ ràng (ai, khi nào, đau ở đâu).
- [ ] Xác định người dùng mục tiêu cụ thể (không "mọi người").
- [ ] Phân tích đối thủ có dẫn chứng: họ thiếu gì, mình khác ở đâu.
- [ ] Trò chuyện với 3–5 người thuộc nhóm mục tiêu (hỏi vấn đề, đừng bán ý tưởng).
- [ ] Lập **sổ rủi ro**: các giả định nguy hiểm nhất + cách kiểm chứng.
- [ ] **AI chạy PHẦN A của KHUNG 3** — đề xuất chủ động về mọi mặt (bảo mật, pháp lý, hiệu năng, quy mô...) ngay từ ý tưởng.

**Cổng:** Nêu được tên một người cụ thể sẽ dùng và lý do họ dùng. Nếu không, chưa qua.

**Đầu ra:** Mô tả vấn đề + người dùng + giải pháp dự kiến (nửa trang).

---

## Giai đoạn 1 — Lập kế hoạch & Phạm vi

**Mục tiêu:** Định nghĩa MVP nhỏ nhất nhưng đủ dùng.

**Việc cần làm:**
- [ ] Liệt kê mọi tính năng, rồi phân loại **MoSCoW** (Must / Should / Could / Won't).
- [ ] Viết **tiêu chí chấp nhận** đo được cho từng tính năng Must (thế nào là "đúng").
- [ ] Viết user story: *"Là [ai], tôi muốn [làm gì] để [mục đích gì]."*
- [ ] Vẽ luồng người dùng chính (user flow).
- [ ] Liệt kê **yêu cầu phi chức năng**: tốc độ mục tiêu, mức bảo mật, accessibility, thiết bị hỗ trợ.
- [ ] Chốt tech stack **theo KHUNG 3** (nghiên cứu, cân bằng phổ biến ↔ năng lực, **phiên bản ổn định đã xác minh**, ghi ADR).
- [ ] **Đóng băng phạm vi MVP** — ý tưởng mới đi vào danh sách chờ.

**Định nghĩa "Done" (DoD) — một tính năng chỉ XONG khi:**
- Chạy đúng tiêu chí chấp nhận.
- Qua lint, format, type-check, build.
- Có test cho logic quan trọng và test xanh.
- Xử lý trạng thái lỗi / rỗng / đang tải.
- Chạy được trên điện thoại lẫn máy tính.
- Không còn bí mật hay code rác (console.log debug).
- Đã tự review diff một lượt.
- Đã merge vào nhánh chính và deploy thử OK.

**Cổng:** Mọi tính năng MVP có tiêu chí chấp nhận; DoD được chốt.

**Đầu ra:** Danh sách MVP ưu tiên + tiêu chí chấp nhận + DoD + lịch trình.

---

## Giai đoạn 2 — Thiết kế

**Mục tiêu:** Hình dung sản phẩm trước khi xây.

**Cơ sở dữ liệu (khó sửa nhất — làm kỹ):**
- [ ] Chuẩn hóa hợp lý; phi chuẩn hóa có chủ đích nếu cần tốc độ.
- [ ] Ràng buộc đầy đủ: `NOT NULL`, `UNIQUE`, kiểu chặt, khóa ngoại + hành vi `ON DELETE`.
- [ ] Index cho cột hay lọc/sắp xếp/join.
- [ ] **Row Level Security** xác định ngay từ thiết kế.
- [ ] Thời gian dùng UTC; tiền tệ tránh số thực (float).

**Kiến trúc & API:**
- [ ] "Hợp đồng API" rõ: đầu vào, đầu ra, mã lỗi cho mỗi endpoint.
- [ ] Phân định rạch ròi client vs server; logic nhạy cảm luôn ở server.
- [ ] Mô hình mối đe dọa đơn giản: ai tấn công ở đâu (lạm dụng input, vượt quyền, lộ dữ liệu).

**Giao diện:**
- [ ] Design tokens nhất quán (màu, khoảng cách, font) — không "màu tùy hứng".
- [ ] **Theme: nền Dark blue mặc định + chế độ Light** (xem `BO-SUNG-chat-luong.md` PHẦN 3).
- [ ] Mobile-first; responsive (checklist cụ thể: `BO-SUNG-chat-luong.md` Nhóm 2 mục 1).
- [ ] Tương phản màu đạt WCAG AA **ở cả hai chế độ nền**.

**Cổng:** Schema + kiến trúc + API contract được phản biện và duyệt.

**Đầu ra:** Wireframe + schema CSDL + sơ đồ kiến trúc + danh sách endpoint.

---

## Giai đoạn 3 — Thiết lập môi trường (nền tảng chống lỗi)

**Mục tiêu:** Dựng sẵn "hàng rào tự động" TRƯỚC khi viết code nghiệp vụ. (Cấu hình cụ thể: xem file hướng dẫn pre-commit + CI.)

**Bắt buộc:**
- [ ] TypeScript `strict` toàn phần.
- [ ] ESLint (nghiêm) + Prettier.
- [ ] **Pre-commit hooks** (Husky + lint-staged): chặn commit nếu lint/format/type-check fail.
- [ ] **CI** (GitHub Actions): tự build + test + lint trên mỗi push/PR.
- [ ] **Branch protection**: cấm push thẳng nhánh chính; bắt buộc PR + CI xanh.
- [ ] Quản lý bí mật: `.env` + `.gitignore` + token giới hạn phạm vi.
- [ ] Tách môi trường dev / staging / production.
- [ ] Dependabot / cảnh báo bảo mật.

**Cổng:** Thử commit code sai kiểu/sai format mà bị hook chặn lại; deploy thử "Hello World" thành công.

**Đầu ra:** Repo có đủ hàng rào + app chạy thử trên production.

---

## Giai đoạn 4 — Phát triển

**Mục tiêu:** Xây từng tính năng MVP đến khi đạt DoD.

**Trình tự:** CSDL → xác thực người dùng → tính năng lõi (theo ưu tiên) → giao diện → xử lý lỗi/biên.

**Tiêu chuẩn code:**
- [ ] Không bỏ qua cảnh báo nào của linter/type-checker.
- [ ] Mọi đầu vào người dùng/API được validate (ví dụ Zod) trước khi dùng.
- [ ] Mọi thao tác có thể fail đều có nhánh xử lý lỗi.
- [ ] Không "số/chuỗi ma thuật"; hàm nhỏ làm một việc; tên tự giải thích; không lặp logic.

**Bảo mật khi code:**
- [ ] Truy vấn tham số hóa (chống SQL injection).
- [ ] Escape dữ liệu hiển thị ra HTML (chống XSS).
- [ ] Kiểm tra quyền phía server cho mọi thao tác nhạy cảm.

**Git:**
- [ ] Mỗi tính năng/sửa lỗi một nhánh riêng.
- [ ] Commit nhỏ; dùng **conventional commits** (`feat`, `fix`, `refactor`, `docs`...).
- [ ] Mọi merge vào nhánh chính qua PR (kể cả làm một mình — để tự review).

**Cổng:** Tính năng đạt tiêu chí chấp nhận + DoD; qua cổng commit/merge của AI (KHUNG 2).

**Đầu ra:** Các tính năng MVP hoàn chỉnh.

---

## Giai đoạn 5 — Kiểm thử

**Mục tiêu:** Đảm bảo đúng và ổn định. Làm **đan xen** với GĐ 4.

**Kim tự tháp kiểm thử:** nhiều unit test → ít hơn integration test → ít e2e cho luồng quan trọng nhất. Ưu tiên phủ **đường đi quan trọng + trường hợp biên**, không chạy theo con số phần trăm máy móc.

**Loại kiểm thử bắt buộc:**
- [ ] Trường hợp biên: ô trống, dữ liệu cực dài, số âm, ký tự lạ, nhấn nút liên tục, mất mạng giữa chừng.
- [ ] Bảo mật cơ bản: thử truy cập dữ liệu người khác, thử vượt kiểm tra phía client.
- [ ] Accessibility: điều hướng bằng bàn phím, trình đọc màn hình, tương phản; **tự động** bằng `jsx-a11y` + axe (Nhóm 2 mục 3).
- [ ] **E2E luồng chính bằng Playwright** trên cả viewport desktop lẫn mobile (Nhóm 2 mục 4).
- [ ] Hiệu năng: đo Lighthouse (đặt **performance budget**, xem Nhóm 2 mục 2), thử với dữ liệu lớn.
- [ ] Đa nền tảng: nhiều trình duyệt, nhiều kích thước màn hình.
- [ ] Người thật: quan sát 2–3 người dùng, không hướng dẫn.

**Cổng:** Toàn bộ test xanh; đã qua các loại kiểm thử bắt buộc cho luồng chính.

**Đầu ra:** Sản phẩm ổn định, ít bug.

---

## Giai đoạn 6 — Triển khai

**Mục tiêu:** Đưa lên production an toàn.

**Cổng chất lượng CI/CD (phải đạt trước khi lên production):**
- [ ] Toàn bộ test xanh (gồm **E2E Playwright**), build OK, không lỗi type/lint.
- [ ] **Lighthouse CI xanh** — ngân sách hiệu năng (Performance/A11y/Best-Practices/SEO ≥ 90; CWV trong ngưỡng) là **cổng tự động** trên PR (xem `lighthouserc.json` + Nhóm 2 mục 2).
- [ ] Audit bảo mật: không còn lỗ hổng nghiêm trọng.

**Vận hành:**
- [ ] Migration CSDL có phiên bản, chạy được và **rollback được**.
- [ ] Row Level Security đã bật và đã test trước khi mở cho người ngoài.
- [ ] Giám sát + theo dõi lỗi (Sentry) + cảnh báo đã hoạt động.
- [ ] Backup tự động đã bật và **đã thử khôi phục một lần**.
- [ ] Kế hoạch rollback rõ ràng.
- [ ] Có môi trường staging giống production để thử lần cuối.

**Cổng:** Cổng CI/CD đạt; backup khôi phục được; rollback sẵn sàng.

**Đầu ra:** App chạy ổn định trên production, có giám sát.

---

## Giai đoạn 7 — Ra mắt

**Mục tiêu:** Đưa sản phẩm đến người dùng thật và bắt đầu thu phản hồi.

**Checklist trước khi công khai:**
- [ ] Pháp lý: privacy policy + terms (đặc biệt nếu thu thập dữ liệu).
- [ ] SEO cơ bản: meta, title, Open Graph, sitemap, robots.txt.
- [ ] Analytics đã cài.
- [ ] Trang lỗi thân thiện (404, 500).
- [ ] Onboarding rõ ràng cho người mới.
- [ ] Kiểm tra luồng quan trọng trên production thật lần cuối.
- [ ] Có kênh nhận phản hồi/báo lỗi.

**Quy trình:** soft launch (nhóm nhỏ) → sửa vấn đề nghiêm trọng → public launch → quảng bá đúng kênh (Product Hunt, cộng đồng liên quan, mạng xã hội) → theo dõi sát 48 giờ đầu.

**Cổng:** Người lạ tự dùng được app từ link công khai mà không cần bạn bên cạnh.

**Đầu ra:** Người dùng thật đang sử dụng.

---

## Giai đoạn 8 — Sau ra mắt & Cải tiến

**Mục tiêu:** Cải tiến liên tục dựa trên dữ liệu thật.

**Vận hành liên tục:**
- [ ] Quy trình xử lý sự cố (incident response) rõ ràng.
- [ ] Giám sát liên tục: lỗi, tốc độ, thời gian phản hồi.
- [ ] Cập nhật phụ thuộc đều đặn (Dependabot) — vá bảo mật kịp thời.
- [ ] Theo dõi nợ kỹ thuật: ghi lại chỗ "làm tạm" để quay lại dọn.
- [ ] Mọi cải tiến lại đi qua đúng quy trình: kế hoạch → code → test → cổng chất lượng → ra mắt.

**Đầu ra:** Một sản phẩm sống, cải tiến không ngừng.

---

## Ba tầng phòng thủ chống lỗi

- **Tầng 1 — Con người + AI có kỷ luật:** tiêu chuẩn từng giai đoạn (file này) + luật AI tự kiểm tra (KHUNG 2).
- **Tầng 2 — Tự động hóa cục bộ:** pre-commit hooks chặn lỗi ngay trên máy.
- **Tầng 3 — Tự động hóa tập trung:** CI + branch protection chặn lỗi trước khi vào nhánh chính.

Lỗi lọt tầng này thì tầng sau bắt. Càng nhiều tầng độc lập, càng ít lỗi đến production.
