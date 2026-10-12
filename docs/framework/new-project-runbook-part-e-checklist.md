# Phần E — Triển khai trên DỰ ÁN THẬT (việc chỉ làm được khi có dự án)

> **Theo ADR-0004: repo khung KHÔNG kèm sẵn scaffold Web.** Mọi tên công nghệ/file cụ thể trong tài liệu này
> (Next.js, Supabase, Vercel, `lighthouse-ci.yml`, `lib/env.ts`…) là **ví dụ cho hồ sơ Web (C1)** — dự án đích tự tạo
> khi hồ sơ áp dụng là Web; hồ sơ khác thay bằng công cụ tương đương (`quality-gates-by-profile.md`).

> **File ghi chú để bổ sung sau.** Template chứa sẵn *quy trình + cấu hình mẫu*, nhưng có những thứ
> **chỉ tồn tại khi đã có dự án thật** (mã nguồn thật, repo settings, tài khoản dịch vụ, bí mật, lựa chọn
> nhà cung cấp). Tài liệu này gom hết lại thành một chỗ — đi từ trên xuống, tick dần.
>
> Đây **không phải lỗ hổng của template** mà là phần "điền vào chỗ trống" theo từng dự án. Mỗi mục ghi rõ
> *mở khóa cái gì* (file/cổng nào trong khung sẽ hoạt động sau khi làm) và *xem chi tiết ở đâu*.

---

## 1. Tạo bộ mã nguồn thật (mở khóa toàn bộ CI)

- [ ] `npx create-next-app@latest` (TypeScript + Tailwind + ESLint) → sinh `package.json`, `tsconfig.json`, `next.config.ts`.
- [ ] Cài gói + thêm khối `scripts` + `npx husky init` (rồi copy đè 2 hook `.husky/*`) — chi tiết **Phần D**.
- [ ] Thêm các cờ TypeScript `strict` (`noUncheckedIndexedAccess`...) — **Phần D** (Bước 5).
- [ ] Nối theme vào `app/globals.css` + `app/layout.tsx` (script no-flash) — xem `quality-supplements.md` PHẦN 3.

> **Mở khóa:** mọi job CI hiện đang *tự bỏ qua khi chưa có `package.json`* (quality/e2e/lighthouse/codeql/release)
> sẽ tự kích hoạt. Sau bước này, xóa step guard `package.json` nếu muốn CI luôn chạy đầy đủ.

## 2. Xác minh lại công nghệ & phiên bản (research-first)

- [ ] **Xác minh lại phiên bản** từng gói bằng nguồn sống tại thời điểm khởi tạo (KHUNG 3, PHẦN B/B4) —
      bản ghi trong khung là ảnh chụp **2026-06-29**, sẽ lỗi thời.
- [ ] Ghi `PROJECT.md` mục 4: mỗi lựa chọn + **phiên bản + ngày xác minh** + 1 câu lý do; ghi **ADR** cho quyết định lớn.

## 3. Điền đặc tả & luật cho dự án

- [ ] `PROJECT.md`: điền đủ 10 mục (vấn đề, MVP+tiêu chí chấp nhận, phi chức năng, schema, API, DoD, rủi ro).
- [ ] `CLAUDE.md`: thay **mọi** chỗ `[ĐIỀN: ...]` (stack, lệnh, cấu trúc, quy ước). *CI sẽ fail nếu còn `[ĐIỀN]`.*
- [ ] `PROGRESS.md`: ghi giai đoạn hiện tại + việc tiếp theo.
- [ ] `LICENSE` + `.github/CODEOWNERS`: đổi `seeker19110`/MIT thành chủ sở hữu & giấy phép thật của dự án.

## 4. Cấu hình GitHub repository (Settings — không đóng gói được trong code)

- [ ] **Branch protection** cho `main` (Phần A Bước 6 / Phần D Bước 11): yêu cầu PR + status checks xanh +
      nhánh cập nhật + review từ Code Owners. Chọn các check bắt buộc: `quality`, `e2e`, `lighthouse`,
      `analyze` (CodeQL), `gitleaks`.
- [ ] **Code scanning**: Settings → Code security & analysis → bật (CodeQL cần để upload kết quả; nếu không
      job sẽ lỗi "Code scanning is not enabled"). Public: miễn phí · Private: cần GitHub Advanced Security.
- [ ] **Dependabot alerts** + **security updates**: bật trong Code security (file `dependabot.yml` đã có sẵn).
- [ ] **Secret scanning** (GitHub native) — bật nếu repo hỗ trợ (bổ trợ cho gitleaks).

### 4b. Danh tính commit cho phiên AI (bắt buộc nếu để AI mở PR)

**Vì sao có mục này:** nếu ruleset bật `require_extra_approval_for_unattributed_changes`
(bản mẫu `.github/rulesets/main.json` có bật), GitHub **chặn auto-merge** mọi PR có commit
không gắn được vào một tài khoản GitHub. Phiên AI hay commit bằng một email chưa liên kết
tài khoản → **mọi PR do AI tạo đều kẹt**, mỗi phiên một lần, và triệu chứng
(`blocked` dù CI xanh hết) không nói ra nguyên nhân.

Git tách **author** (người viết — quyết định GitHub gán commit cho ai) khỏi **committer**
(người tạo commit — quyết định chữ ký), nên **không phải đánh đổi**:

```bash
# author = email ĐÃ LIÊN KẾT tài khoản GitHub của bạn (Settings → Emails)
# committer = danh tính của harness, để commit được ký Verified
git -c user.email=noreply@anthropic.com -c user.name=Claude \
    commit --author="<Tên bạn> <email-đã-liên-kết@example.com>" -m "feat: ..."
```

- [ ] Xác minh email tác giả **đã liên kết** tài khoản: `Settings → Emails` trên GitHub.
- [ ] Kiểm chứng sau commit đầu tiên: `git log -1 --format='%an <%ae> | %cn <%ce>'`, rồi mở
      commit trên GitHub xem avatar tác giả có hiện không (không hiện = chưa gắn được).
- [ ] Nếu đã lỡ commit bằng email chưa liên kết: `git commit --amend --author="..."` rồi
      force-push **nhánh của chính mình** (không bao giờ force-push nhánh người khác).

## 5. Bí mật & biến môi trường (KHÔNG commit — đặt qua dashboard)

- [ ] **GitHub Actions secrets** (dùng bởi `lighthouse-ci.yml`, job `e2e`): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY` (+ biến build khác nếu có).
- [ ] **Vercel env**: đặt riêng cho **Production** và **Preview**; Preview trỏ Supabase "staging".
- [ ] `.env.local` (local, đã bị `.gitignore` chặn): copy từ `.env.example`, điền giá trị thật.
- [ ] Đổi tên biến trong `lib/env.ts` cho khớp dự án; thêm bí mật mới vào `serverSchema`.

## 6. Cơ sở dữ liệu — Supabase (mở khóa RLS + migration thật)

- [ ] `npx supabase init` → `link --project-ref <ref>`; commit `supabase/` (gồm `config.toml`).
- [ ] Thay migration **mẫu** (`supabase/migrations/...init_example.sql`) bằng **schema thật**.
- [ ] **Bật & test RLS** trước khi mở cho người ngoài.
- [ ] **Backup tự động** đã bật và **đã thử khôi phục một lần** (BO-SUNG Nhóm 1 mục 2).

## 7. Hosting & triển khai — Vercel

- [ ] Kết nối repo với Vercel; xác nhận build + deploy "Hello World" OK.
- [ ] Mỗi PR tự sinh **Preview** (= staging miễn phí); chỉ `main` deploy production.

## 8. Quan sát & ra mắt (GĐ 6–7)

- [ ] **Sentry**: chạy `npx @sentry/wizard@latest -i nextjs`; đặt `SENTRY_DSN` qua env; bật cảnh báo
      (`quality-supplements.md` PHẦN 4 — Sentry).
- [ ] **Analytics**: chọn nhà cung cấp theo nhu cầu (`quality-supplements.md` PHẦN 4 — Analytics) + đặt khóa qua env.
- [ ] **release-please**: lần merge đầu vào `main` sẽ mở "release PR"; merge nó để cắt phiên bản + CHANGELOG.
- [ ] Checklist ra mắt GĐ 7 (KHUNG 1): privacy/terms, SEO meta/OG, trang lỗi, onboarding, kênh phản hồi.

## 9. Kiểm thử thật

- [ ] Thay `e2e/smoke.spec.ts` bằng **luồng chính thật** (đăng nhập → thao tác lõi → đạt mục tiêu).
- [ ] Viết unit test cho logic quan trọng + ca biên; giữ coverage ≥ ngưỡng (`vitest.config.mts`).

## 10. Kiểm chứng hàng rào (cổng "sẵn sàng phát triển")

- [ ] Thử commit message sai chuẩn → **bị chặn**; thêm code sai kiểu rồi commit → **bị chặn**.
- [ ] Tạo PR thử → CI chạy; khi đỏ thì **không merge được**.
- [ ] Đối chiếu **Phần C** của `new-project-runbook.md` — đạt đủ mới bắt đầu code tính năng.

---

> Với **dự án đã có sẵn** (brownfield), không làm tuần tự như trên mà áp tăng dần theo
> `existing-project-adoption.md` (đo baseline → hạ nợ dần). Checklist này vẫn là danh mục "đích đến".
