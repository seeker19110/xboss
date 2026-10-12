# PHẦN 2 — Nhóm 2: mobile, hiệu năng, kiểm thử, UI/UX, chống lỗi logic

> Tài liệu này gắn các bổ sung "Nhóm 2" vào bộ khung đã có (KHUNG 1, KHUNG 2, Nhóm 1).
> Trọng tâm Nhóm 2: **mobile-first, hiệu năng (Lighthouse/Core Web Vitals), kiểm thử mở rộng
> (E2E + accessibility tự động), UI/UX, và chống lỗi logic.**
> Triết lý xuyên suốt vẫn là *"tự động hóa thay vì kỷ luật"*: mỗi checklist dưới đây đều
> kèm một hàng rào máy chạy được (CI/lint/test) — đừng chỉ dựa vào việc "nhớ kiểm tra".

## Các bổ sung gắn vào khung ở đâu

| Bổ sung | Lấp lỗ hổng | Liên quan giai đoạn | Hàng rào tự động |
|---------|-------------|---------------------|------------------|
| Checklist mobile-first | "Mobile-first" mới có 1 dòng ở GĐ 2 | GĐ 2 & 4 | Playwright project `mobile` |
| Performance budget + Lighthouse CI | "Lighthouse ≥ 90" chưa được ép trong pipeline | GĐ 5 & 6 | `lighthouserc.json` + workflow |
| Accessibility tự động | A11y mới ở mức "nhớ kiểm tra tay" | GĐ 4 & 5 | `eslint-plugin-jsx-a11y` + `@axe-core/playwright` |
| Kiểm thử E2E (Playwright) | Kim tự tháp test thiếu tầng E2E | GĐ 5 | `playwright.config.ts` |
| Ngưỡng coverage | "Có test" chưa có mức tối thiểu | GĐ 5 | `vitest` coverage thresholds |
| Checklist UI/UX trạng thái | Loading/rỗng/lỗi mới là nguyên tắc, chưa thành checklist | GĐ 4 | PR template |
| Checklist chống lỗi logic | "Type safety" không bắt được lỗi *nghiệp vụ* | GĐ 4 & 5 | review + test biên |
| Observability (Sentry) | GĐ 6 nhắc Sentry nhưng chưa nói *làm sao* | GĐ 6 & 8 | `@sentry/nextjs` |
| Issue template + CHANGELOG | Quản lý việc & lịch sử thay đổi chưa có công cụ | Xuyên suốt | GitHub templates |
| Tối ưu mã nguồn (refactor/tinh gọn) | "DRY/hàm nhỏ" (CLAUDE.md §3) mới là nguyên tắc, chưa có quy trình & cách đo | GĐ 4 & 5 | knip/depcheck + ESLint complexity (tùy chọn) |

---

## 1. Mobile-first (cụ thể hóa)

Khung yêu cầu "mobile-first; responsive" nhưng chưa nói *kiểm cái gì*. Phần lớn người dùng vào
bằng điện thoại — thiết kế cho màn nhỏ trước, rồi mở rộng ra màn lớn (`sm:`, `md:`, `lg:` của Tailwind).

**Checklist mobile-first (đối chiếu cho mỗi màn hình):**
- [ ] Thiết kế ở khổ ~360px trước; không có thanh cuộn ngang ở bất kỳ breakpoint nào.
- [ ] **Vùng chạm ≥ 44×44px** cho mọi nút/link (Apple HIG; tối thiểu WCAG 2.2 AA là 24px) — ngón tay không phải con trỏ chuột.
- [ ] `<meta name="viewport" content="width=device-width, initial-scale=1" />` (Next có sẵn qua `viewport` export).
- [ ] Tôn trọng **safe-area** trên máy có tai thỏ: `env(safe-area-inset-*)` cho header/footer cố định.
- [ ] Input không gây zoom bất ngờ trên iOS: cỡ chữ input ≥ 16px.
- [ ] Ảnh dùng `next/image` (tự `srcset`, lazy-load, tránh layout shift); luôn đặt `width`/`height` hoặc `fill` + `sizes`.
- [ ] Font nạp qua `next/font` (tránh FOIT/FOUT và giảm CLS).
- [ ] Bàn phím ảo không che mất ô nhập đang gõ; nút submit không bị bàn phím che.
- [ ] Test thật trên thiết bị (hoặc Playwright project `mobile` ở mục 4) trước khi coi là xong.

> **Tự động:** Playwright chạy mọi smoke test trên cả viewport mobile (`Pixel 5`) lẫn desktop —
> xem `playwright.config.ts`. Một luồng chính gãy ở mobile sẽ làm CI đỏ.

---

## 2. Performance budget & Lighthouse CI

Khung nói "Lighthouse ≥ 90" nhưng để nó là việc *nhớ chạy tay* thì sớm muộn cũng quên.
Biến nó thành **cổng tự động** chạy trên mỗi PR.

### Ngân sách hiệu năng (đặt mục tiêu cụ thể trong `PROJECT.md` mục 3)

**Core Web Vitals** (đo trên 4G/thiết bị tầm trung — tức điều kiện thật của đa số người dùng):

| Chỉ số | Ngưỡng "tốt" | Ý nghĩa |
|--------|-------------|---------|
| **LCP** (Largest Contentful Paint) | ≤ 2.5s | nội dung chính hiện nhanh |
| **INP** (Interaction to Next Paint) | ≤ 200ms | bấm/gõ phản hồi mượt (thay FID từ 2024) |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 | bố cục không "nhảy" |

**Điểm Lighthouse tối thiểu (mobile):** Performance ≥ 90 · Accessibility ≥ 90 · Best Practices ≥ 90 · SEO ≥ 90.

### Cài Lighthouse CI

```bash
npm install --save-dev @lhci/cli
```

Ví dụ file `lighthouserc.json` (tự tạo ở gốc dự án đích) khai báo URL cần đo + các assertion (ngưỡng).
Ví dụ workflow `.github/workflows/lighthouse-ci.yml` (tự thêm ở dự án đích) chạy build, dựng server, đo, và **fail PR nếu dưới ngưỡng**.

> Mẹo chống nhiễu: Lighthouse dao động nhẹ giữa các lần chạy. `lighthouserc.json` đặt
> `numberOfRuns: 3` (lấy trung vị). Nếu một assertion quá ngặt lúc đầu, hạ về `"warn"` thay vì
> `"error"` cho riêng chỉ số đó, siết dần sau — đừng tắt cả cổng.

---

## 3. Accessibility tự động (a11y)

A11y không chỉ là đạo đức — nó là chất lượng đo được và ảnh hưởng SEO. Tự động hóa hai tầng:

**Tầng tĩnh — ESLint:** `eslint-config-next` đã bật sẵn bộ rule **jsx-a11y cốt lõi** (thiếu `alt`,
`label` rời rạc, `onClick` trên thẻ không tương tác...) — không cần cài gói riêng. `eslint.config.mjs`
(flat config) **siết thêm** vài rule (`jsx-a11y/no-autofocus`, `jsx-a11y/label-has-associated-control`).
Cần bắt sâu hơn thì dùng tầng động (axe) bên dưới.

**Tầng động — axe trong E2E:** quét cây DOM thật (đã render) bằng axe:

```bash
npm install --save-dev @axe-core/playwright
```

Mỗi smoke test E2E nên kèm một lần quét axe (xem `e2e/smoke.spec.ts`). axe bắt được lỗi mà
linter tĩnh không thấy: tương phản màu thực tế, thứ tự heading, focus trap, ARIA sai ngữ cảnh.

**Vẫn cần kiểm tay (máy không thay được):**
- [ ] Duyệt toàn bộ luồng chính **chỉ bằng bàn phím** (Tab/Shift-Tab/Enter/Esc); focus thấy rõ.
- [ ] Thử một lượt với trình đọc màn hình (VoiceOver/TalkBack) cho luồng quan trọng nhất.
- [ ] `prefers-reduced-motion`: tắt animation lớn cho người chọn giảm chuyển động.

---

## 4. Kiểm thử mở rộng — E2E (Playwright) + coverage

Khung mô tả kim tự tháp (nhiều unit → ít integration → vài E2E) nhưng chỉ cấu hình Vitest (unit).
Bổ sung tầng đỉnh và một mức sàn cho đáy.

### E2E với Playwright

```bash
npm install --save-dev @playwright/test
npx playwright install --with-deps   # tải trình duyệt (bỏ qua nếu môi trường đã có)
```

Ví dụ file `playwright.config.ts` (tự tạo ở dự án đích) định nghĩa **2 project**: `desktop` (Chromium) và
`mobile` (Pixel 5) → mọi luồng chính được kiểm trên cả hai kích thước, ép tinh thần mobile-first.

Viết E2E cho **đường đi quan trọng nhất** (đăng nhập → thao tác lõi → đạt mục tiêu), không cố phủ hết.
Mỗi E2E nên: (a) chạy được độc lập, tự dọn dữ liệu; (b) không phụ thuộc thứ tự; (c) dùng
`getByRole`/`getByLabel` (bền hơn selector CSS, lại ép a11y đúng).

### Ngưỡng coverage cho unit test

Đã thêm `coverage` vào `vitest.config.mts`. Coverage là *sàn an toàn tối thiểu*, **không phải mục tiêu** —
một số phủ cao mà toàn assert vô nghĩa thì vô dụng. Đặt sàn vừa phải (vd 70%) để bắt việc "quên viết test",
và luôn ưu tiên **chất lượng test ở đường đi quan trọng + trường hợp biên** hơn là con số.

```bash
npm install --save-dev @vitest/coverage-v8
```

Chạy: `npm run test:coverage`.

### Sổ trần cho LỐI THOÁT khỏi cổng coverage

Ngưỡng coverage có vài **lối thoát hợp lệ**, và đây là chỗ con số đẹp âm thầm rỗng ruột: mỗi lối thoát là một
dòng ai đó thêm vào với lý do đúng *lúc đó*, không có hạn đáo, không ai đếm lại. Sau vài chục PR, "phủ 85%"
có thể nghĩa là 85% của phần chưa bị loại trừ.

Bốn lối thoát phổ biến (tên theo hệ sinh thái; JS/TS bên trái, tương đương Python bên phải):

| Lối thoát | JS/TS | Python |
|---|---|---|
| Bỏ qua một dòng/nhánh | `/* v8 ignore next */`, `/* c8 ignore */` | `# pragma: no cover` |
| Loại cả file khỏi phép đo | `coverage.exclude` trong `vitest.config.mts` | `omit` trong `pyproject.toml` |
| Bỏ qua ca test | `it.skip`, `it.todo`, `describe.skip` | `@pytest.mark.skip`, `skipif`, `xfail` |
| Miễn trừ của linter/scanner | `eslint-disable`, `// @ts-expect-error` | `# noqa`, `# type: ignore` |

**Cách chặn — một sổ so BẰNG ĐÚNG, không phải "không vượt quá":**

```
# Ví dụ (điều chỉnh theo ngôn ngữ/test runner của dự án):
# đếm từng loại, so với số đã ghi; LỆCH THEO CHIỀU NÀO CŨNG ĐỎ.
TRAN = { "ignore-comment": 6, "exclude-file": 2, "skip-test": 3 }
```

Ba điểm khiến nó hiệu quả, bỏ một là mất tác dụng:

1. **So bằng đúng, không phải "≤".** Thêm một miễn trừ ⇒ đỏ, phải sửa số ⇒ đi qua review. **Bớt** một cũng đỏ,
   phải hạ số — nếu không, sổ phình dần thành trần vô nghĩa và không ai biết thực tế đã tốt lên.
2. **Tách theo package/khu vực**, không gộp một số tổng: một số tổng cho phép đổi chác im lặng giữa các vùng.
3. **Sổ đặt ngay cạnh phép đếm, kèm ghi chú vì sao từng con số là thế** — người sau đọc sổ, không đọc được
   đầu người viết. Số không kèm lý do sẽ bị nâng cho qua cổng trong PR đầu tiên thấy phiền.

**Bẫy đã mắc thật:** bộ đếm **tự khớp chính nó** — file chứa phép đếm (và file test của nó) có chứa đúng những
chuỗi đang bị đếm dưới dạng regex hoặc dữ liệu fixture, nên số đo phình lên vô nghĩa. Hai cách xử, chọn một và
ghi rõ: loại chính file đó khỏi phép đếm bằng một hằng số tường minh (`_TU_NO = "<tên file>"`), hoặc đếm **cú
pháp dùng thật** (`# pragma: no cover` phải nằm trong comment; `@pytest.mark.skip` phải ở dạng decorator) thay
vì đếm mọi chỗ nhắc tới tên. Đừng thêm lớp lọc đoán ý chuỗi — nó hỏng theo cách im lặng.

Đi kèm: **độ sâu của chính phép đo.** `coverage` mặc định nhiều nơi chỉ tính **dòng**; dòng 100% vẫn để lọt
nhánh chưa đi. Bật đo nhánh (`branch: true` / `--branch`) và ghi rõ trong tài liệu là *100% dòng* hay *100%
dòng và nhánh* — nói trống là một câu khẳng định không kiểm được. Chưa bật được ở mọi nơi thì ghi **sổ những
chỗ chưa bật**, cùng luật so-bằng-đúng ở trên.

### Chiến lược dữ liệu test

- **Unit/integration:** dùng factory/fixture tạo dữ liệu tối thiểu cần cho ca test; không dùng dump production.
- **E2E:** chạy trên Supabase "staging" (Preview), **không bao giờ** chạm dữ liệu thật; mỗi test tự tạo & xóa.
- Cố định thời gian/ngẫu nhiên (mock `Date`, seed random) để test **tất định** (chạy lần nào cũng ra một kết quả).

---

## 5. UI/UX — checklist trạng thái & tương tác

Khung đã nói "xử lý trạng thái lỗi/rỗng/tải" — nâng thành checklist cụ thể để không sót.

**Mỗi màn hình hiển thị dữ liệu phải xử lý đủ 4 trạng thái:**
- [ ] **Đang tải:** skeleton hoặc spinner — *không* để màn trắng/nhảy layout.
- [ ] **Rỗng:** thông điệp rõ + hành động gợi ý ("Chưa có mục nào — Tạo mục đầu tiên").
- [ ] **Lỗi:** thông báo thân thiện (không phơi stack trace) + nút thử lại.
- [ ] **Thành công/có dữ liệu:** trạng thái bình thường.

**Form & hành động:**
- [ ] Validate inline, ngay cạnh ô lỗi; thông báo nói *cách sửa*, không chỉ "sai".
- [ ] Nút submit **disable + hiện loading** khi đang gửi → chặn double-submit.
- [ ] Sau hành động: phản hồi rõ (toast/redirect); thất bại thì giữ nguyên dữ liệu người dùng đã nhập.
- [ ] Hành động phá hủy (xóa) cần xác nhận; ưu tiên cho **hoàn tác (undo)** hơn là hỏi "chắc chưa?".

**Phản hồi & chuyển động:**
- [ ] Thao tác > ~400ms phải có chỉ báo tiến trình.
- [ ] Tôn trọng `prefers-reduced-motion`.
- [ ] Optimistic UI (nếu dùng): có **đường rollback** khi server trả lỗi (xem mục 6).

---

## 6. Chống lỗi logic (lỗi nghiệp vụ — type-checker KHÔNG bắt được)

Đây là loại bug nguy hiểm nhất: code *biên dịch sạch, type đúng*, nhưng **làm sai việc**.
TypeScript không cứu bạn ở đây — chỉ có suy nghĩ kỹ + test biên + review.

**Checklist rà soát logic (đối chiếu khi viết & khi review mọi logic nghiệp vụ):**

*Biên & rỗng:*
- [ ] Mảng/danh sách rỗng, đúng 1 phần tử, rất nhiều phần tử — đều xử lý đúng?
- [ ] `null`/`undefined`/chuỗi rỗng/số 0 — phân biệt rõ "không có" với "bằng 0/rỗng"? (`??` vs `||`).
- [ ] Off-by-one: vòng lặp, phân trang, cắt chuỗi, chỉ số mảng (`noUncheckedIndexedAccess` đã giúp một phần).

*Số & tiền:*
- [ ] Tiền tệ: **không** dùng số thực (float) — dùng số nguyên (cents) hoặc kiểu decimal. `0.1 + 0.2 !== 0.3`.
- [ ] Chia cho 0, tràn số, làm tròn — định nghĩa rõ hành vi.

*Thời gian:*
- [ ] Lưu & tính bằng **UTC**; chỉ đổi sang giờ địa phương khi hiển thị.
- [ ] Múi giờ, giờ mùa hè (DST), ranh giới ngày/tháng — test ca chuyển ngày.

*Bất đồng bộ & đồng thời:*
- [ ] **Race condition:** hai request/click đồng thời — kết quả vẫn đúng? (khóa, disable nút, idempotency).
- [ ] **Idempotency:** gửi lại cùng một thao tác (mạng chập chờn, người dùng bấm 2 lần) không tạo bản ghi trùng / tính tiền 2 lần.
- [ ] `await` đặt đúng chỗ; không có promise "trôi" (đã có `no-floating-promises`).
- [ ] Thứ tự phản hồi không đảm bảo: phản hồi cũ về sau không ghi đè dữ liệu mới (stale closure / race).

*Trạng thái & nhất quán:*
- [ ] Cập nhật một chỗ → mọi nơi phụ thuộc đồng bộ (một nguồn sự thật).
- [ ] Optimistic update có rollback khi server lỗi; UI không "kẹt" ở trạng thái lạc quan sai.
- [ ] Thao tác nhiều bước (giao dịch): hoặc xong cả, hoặc rollback cả — không để nửa vời.

> **Quy tắc:** với mỗi nhánh logic phức tạp, viết *ít nhất một test cho ca biên* trước khi coi là xong.
> Lỗi logic rẻ nhất khi bị một unit test bắt; đắt nhất khi người dùng thật gặp trên production.

### Kỷ luật viết test (một test "có" không có nghĩa là test *tốt*)

Viết test biên (mục trên) chỉ có giá trị nếu bản thân test đó đáng tin. Ba lỗi thường gặp khiến
test **vô dụng dù vẫn xanh** — rà cả khi viết mới lẫn khi review PR:

- **Test ăn khớp cách cài đặt (implementation-coupled):** mock thẳng hàm/module nội bộ, gọi
  `private`, hoặc verify bằng cách truy vấn thẳng DB thay vì qua interface công khai. Dấu hiệu:
  refactor xong (hành vi không đổi) mà test vẫn đỏ. → chỉ test qua **interface công khai** mà
  caller thật sự dùng.
- **Test tự-đúng-vì-tính-lại-công-thức (tautological):** giá trị kỳ vọng được tính lại **bằng
  đúng công thức trong code** (`expect(tinhTong(items)).toBe(items.reduce(...))`), nên test
  không thể trượt kể cả khi logic sai. → giá trị kỳ vọng phải là **con số cụ thể, độc lập**
  (`expect(tinhTong([{gia:10},{gia:5}])).toBe(15)`).
- **Viết test hàng loạt trước, code hàng loạt sau (horizontal slicing):** khi tách rời viết test
  và viết implementation thành hai đợt lớn, test dễ mô tả *hình dạng tưởng tượng* thay vì hành vi
  thật, và không phản ánh những gì code thực sự học được. → làm theo **lát cắt dọc**: một test →
  một implementation tối thiểu cho nó pass → lặp lại, mỗi vòng chỉ một hành vi.

**Vòng đỏ-xanh (khi áp dụng TDD có chủ đích):** viết test thất bại trước → chỉ viết đủ code để
test đó pass (không đoán trước tính năng chưa cần) → refactor an toàn (có lưới test) → lặp lại
cho hành vi tiếp theo. Chỉ **1 seam, 1 test, 1 lần sửa tối thiểu** mỗi vòng.

> **Hai luật bắt buộc, một danh sách ngoại lệ — đừng lẫn.** *(ADR-0005: vòng đỏ-xanh cho code mới là
> **mặc định bắt buộc**, không phải khuyến nghị.)*
>
> 1. **Sửa bug (`fix:`) phải có test tái hiện chạy đỏ TRƯỚC khi sửa** (`CLAUDE.md` §3.6). Đây không
>    phải TDD "có chủ đích" mà là điều kiện để coi một bug là đã sửa đúng — không có nó, không biết
>    sửa có trúng nguyên nhân hay chỉ trùng hợp hết triệu chứng. `/gate`, `/debug`, `/completion`
>    đều áp luật này.
> 2. **Code MỚI có nhánh điều kiện, tính toán, hoặc xử lý lỗi/quyền cũng phải đỏ trước** (ADR-0005).
>
> **Ngoại lệ ĐÓNG cho luật 2** — không cần test-trước, nhưng PR ghi **một dòng** nói rơi vào mục nào:
> (1) scaffolding/boilerplate sinh từ template hoặc generator; (2) đổi tên, di chuyển, thay đổi cơ
> học không đổi hành vi; (3) chỉ chạm tài liệu, comment, hoặc config thuần (không có nhánh logic);
> (4) code sinh tự động — sửa nguồn rồi sinh lại, không sửa tay bản dẫn xuất; (5) prototype vứt đi
> có timebox, khai rõ sẽ xoá.
>
> Ngoại lệ **đóng** là điểm mấu chốt. Phản đối cũ ("ép test-trước lên scaffolding/rename/docs là
> nghi thức rỗng") vẫn **đúng** và được giữ nguyên bằng đúng năm mục trên — nhưng nó chỉ đúng cho
> năm mục đó. Ngoài chúng ra, ba câu sau **không** phải ngoại lệ, chúng là biện hộ:
> *"quá đơn giản nên khỏi test"* · *"test sau cũng như nhau"* · *"đã tự tay thử rồi"*.
> Test viết sau khi code đã chạy chỉ chứng minh nó xanh ngay từ lần đầu, **không** chứng minh nó
> từng bắt được lỗi.
>
> **Không có cổng máy cho luật 2** (ADR-0005 §Hệ quả) — "test này từng đỏ" không đọc được từ trạng
> thái cuối của repo. Nó được cưỡng chế bằng review, cùng hạng với `CLAUDE.md` §9. Nói thẳng ra đây
> để không ai tưởng có cổng canh.

### Oracle test tự trùng nguồn với input (test luôn xanh giả)

Biến thể **nguy hiểm hơn** tautological ở trên: không phải một test tính lại công thức, mà cả một
**bộ dữ liệu kiểm thử "chấm đúng/sai"** được sinh ra bằng chính hàm/logic dùng để chấm nó. Ca thật
đã xảy ra: 4 môn học tự sinh đáp án bằng cùng một hàm/service **dùng để CHẤM** đáp án đó — nên test
luôn báo đúng, kể cả khi công thức chấm điểm sai từ gốc, vì test tự so nó với chính nó (oracle
trùng nguồn với input).

- **Cách nhận diện:** hỏi thẳng "nếu tôi cố tình phá công thức/logic nghiệp vụ ngay bây giờ, test
  này có đỏ không?" — nếu câu trả lời là **không**, đây là oracle tự trùng nguồn, không phải test.
- **Cách rà:** mọi ca test kiểm tra "kết quả đúng/sai" phải có một **nguồn đối chứng độc lập** với
  logic đang kiểm — ví dụ: golden set chốt bằng tay (người/chuyên gia xác nhận trực tiếp từng giá
  trị), hoặc một implementation/oracle khác độc lập để so chéo. **Không được** lấy chính hàm/service
  đang test làm luôn nguồn sinh dữ liệu kỳ vọng cho nó.
- **Ghi chú:** khuôn lỗi này nguy hiểm hơn ở tầng 2 (subagent/PR review) — khi tài liệu hoặc mô tả PR
  viện dẫn "đã có test pass" làm bằng chứng để duyệt, người duyệt tưởng logic đã được kiểm chứng
  nhưng thực chất test đó không kiểm chứng được gì.
- Đây là mở rộng của nguyên tắc "test tái hiện đỏ trước khi sửa" (`CLAUDE.md` §3.6) sang một lớp
  sâu hơn: không chỉ trình tự đỏ → sửa → xanh phải đúng, mà **bản thân oracle của test cũng phải
  được xét lại** — một test không có nguồn đối chứng độc lập thì không bao giờ đỏ đúng nghĩa.

### Golden test — khi nào dùng, lưu ở đâu, cập nhật thế nào

Golden test = so đầu ra thật với một giá trị kỳ vọng đã lưu ("golden") thay vì viết lại từng
assertion. Mạnh cho đầu ra **lớn, có cấu trúc, ổn định** — yếu và giòn nếu dùng sai chỗ.

**(a) Dùng khi / KHÔNG dùng khi.** Dùng cho đầu ra tuần tự hoá được, tất định: output CLI, phản
hồi API đã chuẩn hoá, SQL/migration/ERD sinh ra, file cấu hình sinh ra, kết quả tính toán dạng
bảng. **KHÔNG** dùng làm mặc định cho snapshot UI component diện rộng — đó là nguồn test giòn kinh
điển (fail mỗi lần đổi 1px, không nói được gì về hành vi đúng/sai); UI thì test qua interface công
khai (xem "Kỷ luật viết test" trên) hoặc E2E. Golden cho đầu ra LLM/AI là chủ đề riêng (eval), không
nằm trong mục này.

**(b) Nơi lưu fixture.** Cạnh file test: `__golden__/<tên-ca>.golden.<ext>` hoặc dùng snapshot có
sẵn của framework test (`toMatchSnapshot`/`toMatchFileSnapshot` của Vitest). Không trộn fixture của
nhiều ca vào một file dùng chung — mỗi ca một file, tên nói rõ ca nào. **Không** để dữ liệu thật
(PII, token, secret) trong fixture — dùng dữ liệu tổng hợp; `secret-scan.yml`/gitleaks là hàng rào
sau cùng, không phải hàng rào đầu.

**(c) Luật chuẩn hoá trước khi so (bắt buộc, không phải gợi ý).** Golden chập chờn vì thiếu bước
này sẽ bị vô hiệu hoá trong vài tuần rồi thành rác. Trước khi so, thay bằng placeholder ổn định:
timestamp/`Date.now()`, UUID/id tự sinh, đường dẫn tuyệt đối (khác máy/CI), thứ tự khoá object
(`JSON.stringify` không đảm bảo thứ tự — sort khoá trước), locale, timezone (cố định `TZ=UTC` khi
chạy test).

**(d) Luật cập nhật (quan trọng nhất — chống lạm dụng).** Golden đỏ **không** có nghĩa là "chạy
`-u` cho xanh". Không `-u` phản xạ. Khi golden đỏ: đọc diff, hỏi "thay đổi nào trong PR này giải
thích được diff đó?" — giải thích được (đổi hành vi có chủ đích) → cập nhật golden **và trong PR
body nêu rõ lý do + dán diff golden** để người review thấy; không giải thích được → đó là hồi quy,
sang `/debug`, đừng cập nhật golden để "cho xanh".

**(e) CI không được tự tạo snapshot mới.** Snapshot/golden thiếu ở môi trường CI phải làm test
**đỏ**, không tự sinh rồi pass — nếu không, một golden bị xoá nhầm sẽ không bao giờ bị phát hiện.
Vitest tự phát hiện biến môi trường `CI` (mà GitHub Actions và hầu hết CI provider tự đặt
`CI=true`) và **từ chối viết snapshot thiếu** thay vì tự tạo — đã xác minh thật: `vitest run` không
đặt `CI` sẽ tự tạo snapshot mới rồi PASS (nguy hiểm — golden bị xoá nhầm sẽ không bao giờ bị phát
hiện); cùng lệnh với `CI=true` thì **FAIL** đúng, không tạo file. Không cần cờ CLI hay cấu hình
thêm trong `vitest.config.mts` — `ci.yml` của khung chạy trên GitHub Actions nên đã tự động đúng.

*Hồ sơ non-Node:* pytest có `--snapshot-update` (plugin `syrupy`) cùng nguyên tắc cập nhật thủ
công; Rust dùng `insta` (`cargo insta review`). Nguyên tắc (a)-(e) áp dụng như nhau, chỉ đổi công cụ.

---

## 7. Observability — Sentry (cụ thể hóa GĐ 6)

Khung nhắc "theo dõi lỗi (Sentry)" nhưng chưa hướng dẫn. Không có giám sát = mù trên production:
người dùng gặp lỗi, bạn không biết cho tới khi họ rời đi.

```bash
npx @sentry/wizard@latest -i nextjs
```

Wizard tự tạo config client/server/edge, gắn source map, và một route test. Sau khi cài:
- [ ] Đặt `SENTRY_DSN` qua biến môi trường (thêm vào `lib/env.ts`) — **không** hard-code.
- [ ] Tách môi trường (`environment: process.env.NODE_ENV`) để lọc lỗi dev/staging/prod riêng.
- [ ] Bật cảnh báo (email/Slack) cho lỗi mới hoặc tần suất tăng đột biến.
- [ ] Lọc dữ liệu nhạy cảm khỏi báo cáo lỗi (`beforeSend`) — đừng gửi token/PII lên Sentry.

> Tối thiểu cần: bắt lỗi chưa xử lý ở cả client lẫn server. Thêm performance tracing sau nếu cần.

---

## 8. Quản lý dự án — issue template & CHANGELOG

**Issue templates** (`.github/ISSUE_TEMPLATE/`, đã kèm): ép mọi báo lỗi/đề xuất tính năng có đủ
thông tin (các bước tái hiện, kỳ vọng vs thực tế, tiêu chí chấp nhận) → gắn với **Definition of Ready**.

**CHANGELOG.md** (đã kèm, theo chuẩn *Keep a Changelog*): ghi lại thay đổi theo phiên bản cho con người đọc.
Vì commit đã theo *conventional commits*, có thể sinh CHANGELOG tự động sau (`standard-version`/`changesets`),
nhưng bản viết tay vẫn giá trị cho mục "Unreleased".

**Nhịp nhìn lại (với người làm một mình):** cuối mỗi đợt/sprint, cập nhật `PROGRESS.md` và tự hỏi 3 câu:
gì chạy tốt, gì vướng, lần sau đổi gì. Ghi nợ kỹ thuật vào `PROGRESS.md` để không quên quay lại dọn.

---

## 9. Tối ưu mã nguồn (refactor & tinh gọn)

`CLAUDE.md` §3 đã đặt nguyên tắc "DRY, hàm nhỏ, không số/chuỗi ma thuật" và mục 2 ở trên lo
**hiệu năng runtime** (Core Web Vitals). Mục này lấp khoảng giữa: **tối ưu chính mã nguồn** —
gỡ rác, giảm trùng lặp & độ phức tạp, tỉa phụ thuộc, thu nhỏ bundle — một cách *có kỷ luật*, **không đổi hành vi**.

> **Phân biệt:** mục 2 = "trang chạy nhanh cho *người dùng*"; mục 9 = "mã dễ đọc, dễ sửa, ít rác cho *lập trình viên*".
> Hai việc khác nhau, đôi khi đánh đổi nhau (tách hàm cho gọn nhưng thêm một lớp gián tiếp) — cân nhắc theo bối cảnh, đừng tối ưu mù.

### Dấu nợ `DEBT:` — chỗ CỐ Ý dừng ở một trần đã biết

Không phải chỗ rườm rà nào cũng nên sửa ngay: đôi khi bản đơn giản là **lựa chọn đúng** và điều cần
là ghi lại *đã chấp nhận trần nào* và *bao giờ quay lại*. Một `TODO` trơ trọi không làm được việc đó —
nó không nói trần, không nói điều kiện, nên không ai biết lúc nào nó thành nợ xấu.

Khuôn, đặt ngay tại dòng code làm tắt (mọi kiểu comment, `//` hay `#` đều được):

```
# DEBT: khoá toàn cục cho cả tiến trình | trần: ~50 req/s | xem lại khi: p95 latency > 300ms
// DEBT: quét O(n²) danh sách thành viên | trần: n < 500 | xem lại khi: một tổ chức vượt 500 thành viên
```

Ba phần, thiếu phần nào mất tác dụng phần đó:

1. **đã giản lược gì** — người sau đọc được ngay mà không phải suy ra từ code.
2. **trần** — giới hạn *đã biết* của bản này. Đây là điểm khác `TODO`: nợ có trần thì đo được.
3. **xem lại khi** — điều kiện quay lại. **Đây là phần hay bị bỏ và là phần đắt nhất.**
   `TRAPS.md` mục 14 đã tái phát đúng vì một khoản hoãn ("không có cổng máy, chốt bằng quy ước")
   có trần nhưng không có điều kiện quay lại, nên không ai quay lại.

**Cổng:** `scripts/maintenance-sweep.sh` (mảng 3) đếm dấu `DEBT:` và cảnh báo 🟡 riêng cho các dấu
**thiếu `xem lại khi:`** — đúng nhóm sẽ mục âm thầm. Số dấu có đủ ba phần chỉ là ℹ️: nợ được khai báo
đúng không phải lỗi.

**Phân vai ba loại dấu** (đừng dùng lẫn): `TODO` = việc còn dở, sẽ làm nốt · `DEBT:` = **cố ý** dừng
ở một trần đã biết, có điều kiện quay lại · **ADR** = quyết định kiến trúc, không phải chỗ làm tắt.
Cùng họ với **sổ trần cho lối thoát khỏi cổng coverage** ở mục 4 — cùng một ý: mỗi ngoại lệ phải
đếm được và có đường quay lại; và cùng một bẫy, **bộ đếm tự khớp chính nó** (file chứa phép đếm phải
được loại khỏi phép đếm, xem `TRAPS.md` mục 18).

### Nguyên tắc vàng khi refactor
- **Không đổi hành vi.** Refactor = đổi *cấu trúc*, giữ nguyên *kết quả*. Nếu phải đổi hành vi → đó là feature/fix, tách commit riêng.
- **Có lưới an toàn trước.** Phải có test phủ vùng sắp sửa *trước khi* động vào. Chưa có test → viết test mô tả hành vi hiện tại (characterization test) trước, rồi mới refactor.
- **Bước nhỏ, xanh liên tục.** Mỗi bước nhỏ → chạy lại test → commit. Không refactor lớn trong một cú nhảy.
- **Đo trước–sau.** Có số liệu (số dòng, bundle size, số cảnh báo complexity, số dependency) trước & sau để chứng minh *thật sự* gọn hơn, không chỉ "cảm giác".
- **Commit tách bạch.** Dùng `refactor:`; **không** trộn refactor với feature trong cùng commit/PR (khó review, khó lần lỗi).

### Checklist tối ưu mã nguồn (đối chiếu định kỳ & trước khi đóng một mảng lớn)

*Gỡ rác (dead code):*
- [ ] Không còn code không ai gọi: hàm/biến/import/export thừa, nhánh không bao giờ chạy tới.
- [ ] Không còn file/asset "mồ côi" (không được import ở đâu).
- [ ] Không còn `console.log` debug, code bị comment "để phòng khi cần", feature flag đã chết.

*Trùng lặp & độ phức tạp:*
- [ ] Logic lặp ≥ 3 lần → tách dùng chung (DRY) — nhưng **đừng** gom thứ chỉ *trông* giống nhau (tránh trừu tượng hóa sai, sau này khó tách).
- [ ] Hàm quá dài / quá nhiều nhánh (cyclomatic/cognitive complexity cao) → tách nhỏ, đặt tên tự giải thích.
- [ ] Lồng `if/else` sâu → early return / guard clause cho phẳng.
- [ ] Quá nhiều tham số (> ~4) → gom thành object có kiểu.

*Phụ thuộc (dependencies):*
- [ ] Tỉa package không còn dùng khỏi `package.json`.
- [ ] Gỡ thư viện nặng dùng cho một việc nhỏ (vd kéo cả `lodash` chỉ để `debounce`) → import lẻ hoặc tự viết.
- [ ] Không có dep trùng vai trò (hai thư viện ngày tháng, hai thư viện HTTP...).

*Bundle:*
- [ ] Import lẻ (`import debounce from 'lodash/debounce'`), tránh import cả thư viện.
- [ ] Tách động (`next/dynamic` / `import()`) cho phần nặng, ít dùng (modal, biểu đồ, editor).
- [ ] Giữ vùng `'use client'` nhỏ nhất có thể — đẩy logic về Server Component khi được (giảm JS gửi xuống client).

> **Công cụ:** `knip` (rác + export/dep thừa) **đã có job CI `source-hygiene`** trong `ci.yml` —
> mặc định BÁO CÁO (continue-on-error, không chặn oan khi mới áp); dự án muốn thành **cổng chặn thật**
> thì xóa dòng `continue-on-error` (+ thêm `knip.json` nếu cần loại trừ). Tùy chọn thêm (chỉ tài liệu):
> `depcheck` (dep thừa), rule `complexity` của ESLint + `eslint-plugin-sonarjs` (độ phức tạp & trùng lặp),
> `@next/bundle-analyzer` (xem cây bundle). Xác minh phiên bản khi dùng (research-first, KHUNG 3 PHẦN B).

### Khi nào KHÔNG nên refactor
- Sát ngày ra mắt / đang giữa việc gấp → ghi vào **nợ kỹ thuật** (`PROGRESS.md`), quay lại sau.
- Vùng code rủi ro cao mà chưa có test bảo vệ và chưa kịp viết.
- **Tối ưu non** (premature optimization): tối ưu hiệu năng cho chỗ chưa chứng minh là điểm nghẽn — đo trước (mục 2), đừng đoán.

→ **Gắn vào khung (bắt buộc khi triển khai — `CLAUDE.md §3` mục 7, Tối ưu mã nguồn):**
> - **Dự án mới:** chạy checklist **cuối GĐ 4** (trước khi coi một mảng là xong) + một bước trong **GĐ 5 / review**; là quy tắc chất lượng bất biến khi phát triển (`KHOI-TAO` Phần B — Chất lượng). Cổng MERGE (`CLAUDE.md §6`) yêu cầu đã rà mục này.
> - **Dự án có sẵn (brownfield):** đo **baseline** rồi **hạ dần** theo "đụng đâu dọn đó" — không dọn cả repo một lần (`AP-DUNG` Bước 2 & 3).
> - **Dự án đang chạy:** tối ưu định kỳ ở **GĐ 8 (Cải tiến)**.
>
> Refactor lớn nên có DoR rõ (Nhóm 1 mục 7) và đi qua **PR riêng** tách khỏi feature.


===============================================================================
