# M60 — Nâng major dependencies bị giữ lại (TypeScript 7, ESLint 10, Node 26 + @types/node 26)

> **Trạng thái: ĐANG HOÃN CÓ CHỦ ĐÍCH (2026-07-18) — KHÔNG tự nhặt lại khi chưa đạt điều kiện kích hoạt của từng PR.**
> Đây là 3 major bị caret range chặn lại có chủ đích sau đợt cập nhật bản vá (PR #239):
> `typescript ^6.0.3` (latest 7.0.2), `eslint ^9.39.4` (latest 10.7.0), `@types/node ^24.x` (latest 26.x).
> Mỗi major = **1 PR riêng, 1 đợt riêng**, không gộp, không làm chung với tính năng khác.
> Nghiên cứu nền viết đặc tả này: 2026-07-18 (nguồn ghi ở cuối file) — **kiểm lại hiện trạng bên ngoài trước khi thi hành** vì hệ sinh thái đổi nhanh (mục "Kiểm tra định kỳ").

## Bối cảnh & nguyên tắc chung

- Dự án: Next.js 16 (hiện `^16.2.10`) + React 19 + TS strict + ESLint 9 flat config (`eslint.config.mjs`) + Node runtime chuẩn **24 LTS** (`.nvmrc`, CI `node-version: 24`, `DEPLOY.md` "Node ≥ 24"; Node 24 Active LTS tới 2028-04).
- Caret range trong `package.json` tự chặn major → `npm update` thường ngày không bao giờ kéo nhầm 3 gói này lên. **Không cần pin cứng thêm** — giữ nguyên caret.
- Cả 3 PR đều là **thay đổi hạ tầng build/lint/typecheck, KHÔNG đụng schema/dữ liệu** → không cần staging DB; cổng chất lượng là toàn bộ CI (audit → lint → typecheck → check:sw-exclude → test Postgres 16 → gen:erd diff → build) + job E2E.
- Thứ tự khuyến nghị khi đủ điều kiện: **PR1 (ESLint 10) → PR3 (Node 26 + @types/node 26) → PR2 (TypeScript 7)**. PR2 để cuối vì phụ thuộc chuỗi dài nhất (Next stable + TS 7.1 API cho typescript-eslint); 3 PR độc lập nhau, không đụng chung file ngoài `package.json`/`package-lock.json` → không chạy song song để khỏi conflict lockfile vô ích.
- Mỗi PR đều phải: tự chạy đủ `npm run lint` + `npm run typecheck` + `npm test` + `npm run build` cục bộ trước khi push; PR draft; cập nhật `PROGRESS.md` khi merge.

---

## PR1 — ESLint 9 → 10 (`route: standard`)

### Điều kiện kích hoạt (đủ CẢ HAI mới làm)

1. `eslint-config-next` (bản khớp Next đang dùng) khai `eslint` `^10` trong `peerDependencies`. Kiểm:
   ```bash
   npm info eslint-config-next@latest peerDependencies
   ```
   Hiện trạng 2026-07-18: **CHƯA** — vercel/next.js PR #91710 còn mở; các plugin Vercel bundle (`eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`) còn cap `eslint ^9` và dùng API đã bị ESLint 10 xoá (`context.getFilename()` → crash lúc chạy). **KHÔNG lách bằng `--legacy-peer-deps`/`overrides`** — cài được nhưng crash/silent-skip lúc lint, mất cổng CI thật.
2. `npm run lint` với ESLint 10 chạy sạch trên nhánh thử (bước Thi hành bên dưới) — không crash plugin nào.

### Điều đã biết về breaking changes (nghiên cứu 2026-07-18)

- ESLint 10 **xoá hẳn eslintrc**: `.eslintrc.*`/`.eslintignore`/`ESLINT_USE_FLAT_CONFIG` không còn được đọc; các cờ CLI eslintrc bị bỏ. XBoss đã thuần flat config (`eslint.config.mjs`) → không ảnh hưởng trực tiếp.
- Tìm config **bắt đầu từ thư mục của file được lint** thay vì cwd (hỗ trợ nhiều config/monorepo). XBoss 1 repo 1 config ở root → không ảnh hưởng, nhưng lưu ý 2 khối `ignores` đầu file (`_framework-dropins/**`, `.claude/**`) phải vẫn có hiệu lực (worktree agent nằm trong repo).
- Yêu cầu Node ≥ 20.19 → Node 24 của dự án thoả.
- Có codemod chính thức `@eslint/v9-to-v10` (4 codemod con) — dự án không có custom rule/RuleTester nên nhiều khả năng chỉ cần codemod config hoặc không cần gì.

### Thi hành

1. Nhánh mới từ `origin/main`. `npm install -D eslint@10` (đúng semver mới nhất lúc đó) — **không** đụng gói khác; `eslint-config-next` chỉ nâng nếu cần bản mới hơn để có peer `^10`.
2. `npm run lint` toàn repo. Xử lý theo thứ tự: lỗi config (sửa `eslint.config.mjs` tối thiểu) → rule đổi tên/bị xoá (kiểm 5 rule `react-hooks/*` đang `off` trong config còn tồn tại không; rule nào ESLint 10/plugin mới đã xoá thì bỏ dòng `off` tương ứng kèm comment) → lỗi lint mới hàng loạt ở code: sửa cơ học từng thông báo, **không** tắt rule diện rộng để né; rule mới mà đội thấy sai với codebase (kiểu React-Compiler quá strict như tiền lệ trong config) thì `off` kèm comment tiếng Việt giải thích, cùng phong cách khối `rules` hiện có.
3. Xác nhận 2 khối `ignores` vẫn hiệu lực: `npx eslint --debug` 1 file trong `.claude/` phải bị bỏ qua (hoặc `npx eslint .claude/x.ts` báo ignored).
4. Chạy đủ lint/typecheck/test/build. Diff kỳ vọng: `package.json` + `package-lock.json` + (có thể) `eslint.config.mjs` + các file code sửa lint cơ học.

### Tiêu chí chấp nhận

- CI xanh toàn bộ; `npm run lint` 0 lỗi 0 warning mới; không rule nào bị tắt thêm mà thiếu comment lý do; hành vi runtime không đổi (diff code chỉ là sửa lint thuần).
- Rollback: revert 1 commit (chỉ devDependencies + config) — không có tác dụng phụ dữ liệu.

---

## PR2 — TypeScript 6 → 7 (`route: complex` — lỗi hàng loạt phải tự cân nhắc cách xử lý; ranh giới quyết định ghi rõ bên dưới)

### Điều kiện kích hoạt (đủ CẢ BA mới làm)

1. **Next.js hỗ trợ TS 7 ở kênh ổn định** cho `next build`: TS 7.0 GA (2026-07-08) không có JS API (compiler API ổn định dời tới TS 7.1), mà `next build` gọi TS qua JS API → Next 16.3 Preview mới thêm đường vòng `experimental.useTypeScriptCli` (gọi thẳng lệnh `tsc`). **Chờ cơ chế này (hoặc tương đương) hết `experimental`**, hoặc tối thiểu Next stable mà dự án đang dùng đã hỗ trợ chính thức — đọc release notes Next tại thời điểm làm. Cũng kiểm bug đã biết: `next build` từng nhận nhầm TS 7 là "chưa cài TypeScript" (vercel/next.js issue #95490) — xác nhận đã fix ở bản Next đang dùng.
2. **TS 7.1+ đã phát hành JS/compiler API ổn định** — cần cho `typescript-eslint` (nền của `eslint-config-next`) và plugin language-service `"next"` trong `tsconfig.json`. Nếu làm ngay ở 7.0.x, lint kiểu type-aware và IDE có thể vỡ. Thực tế khuyến nghị: **chờ 7.1, bỏ qua 7.0.x**.
3. `tsx` (chạy test + scripts) xác nhận không ảnh hưởng — `tsx` transpile bằng esbuild, không gọi `tsc`, nên về lý thuyết miễn nhiễm; vẫn phải chạy `npm test` thật để xác nhận.

### Điều đã biết về breaking changes (nghiên cứu 2026-07-18)

- Cùng tên gói `typescript`, cùng binary `tsc` — nhưng là compiler Go (Project Corsa), typecheck nhanh ~8–12×.
- Mọi thứ TS 6.0 mới chỉ deprecate thành **hard error** ở 7.0: `target: es5`, `moduleResolution: node` (legacy), `module: amd/umd/system`, `baseUrl`. Đối chiếu `tsconfig.json` XBoss: `target: ES2020`, `module: esnext`, `moduleResolution: bundler`, `paths` không dùng `baseUrl` → **không dính mục nào**.
- `types` mặc định thành `[]` (không còn tự nạp mọi `@types/*`): XBoss không khai `types` → khi nâng phải kiểm lỗi kiểu `Cannot find name 'process'` và nếu có, thêm tường minh `"types": ["node"]` vào `compilerOptions`.
- `rootDir` mặc định `./` — XBoss `noEmit`, không quan tâm output structure → không ảnh hưởng.

### Thi hành

1. Nhánh mới từ `origin/main`. `npm install -D typescript@7` (khuyến nghị đợi ≥7.1 theo điều kiện 2).
2. Bật cơ chế TS-CLI của Next theo tài liệu bản Next lúc đó (nếu còn cần cờ, ghi comment trong `next.config.ts` lý do + điều kiện gỡ cờ).
3. `npm run typecheck`: sửa lần lượt — thiếu `types` (thêm `"types": ["node"]`), lỗi type mới do checker Go chặt hơn (sửa code đúng kiểu, không rải `any`/`@ts-expect-error`; chỗ nào buộc phải suppress thì kèm comment lý do).
4. `npm run lint` — xác nhận typescript-eslint hoạt động với TS 7 (đây là chỗ vỡ ngầm dễ nhất). `npm test`, `npm run build`, và chạy `npm run dev` mở vài trang chính để chắc plugin `"next"`/dev server không kêu.
5. **Ranh giới quyết định được phép** (route `complex`): cách sửa từng lỗi type mới; có thêm `"types": ["node"]` hay liệt kê thêm gói types khác; giữ hay gỡ cờ experimental của Next kèm lý do. **KHÔNG được phép**: hạ `strict`, nới `tsconfig` diện rộng (`skipLibCheck` đã bật sẵn thì giữ nguyên, không thêm nới mới), dual-install TS6/TS7 qua npm alias (chỉ là phương án chờ, không phải trạng thái kết thúc của PR này — nếu buộc phải alias nghĩa là chưa đủ điều kiện kích hoạt, dừng PR báo lại).

### Tiêu chí chấp nhận

- CI xanh toàn bộ (đặc biệt job E2E — build production thật); `npm run typecheck` đo được nhanh hơn rõ rệt (ghi số giây trước/sau vào mô tả PR); IDE/VS Code mở dự án không báo lỗi language service; không suppress mới thiếu comment.
- Rollback: revert 1 commit (devDependencies + tsconfig + sửa type) — không tác dụng phụ dữ liệu.

---

## PR3 — Node 24 → 26 + @types/node 24 → 26 (`route: standard` — kèm việc ops ngoài repo)

### Nguyên tắc đã chốt

**`@types/node` bám đúng major của Node runtime thật, không nâng độc lập.** Runtime thật = VPS production + CI + `.nvmrc`. Vì vậy PR này là "nâng Node runtime lên 26", trong đó `@types/node` chỉ là 1 dòng đi kèm — không bao giờ có PR "chỉ nâng @types/node lên 26" khi máy còn chạy Node 24.

### Điều kiện kích hoạt

1. **Node 26 vào Active LTS** — lịch chính thức: 2026-10 (Node 26 ra 2026-05, hiện là Current). Không chạy production trên Current.
2. Không có deadline ép: Node 24 Active LTS tới 2028-04 → có thể thong thả sau khi 26 LTS vài tháng cho hệ sinh thái (pg, sharp/native deps nếu có, pm2, Playwright CI) bắt kịp.
3. Người vận hành VPS sẵn sàng làm phần ops (nâng Node trên máy thật + restart pm2) cùng đợt — phần này ngoài repo, phối hợp qua `DEPLOY.md`.

### Thi hành

1. Nhánh mới từ `origin/main`. Sửa đồng bộ 1 lượt: `.nvmrc` → `26`; `.github/workflows/ci.yml` cả 2 job `node-version: 26`; `npm install -D @types/node@26`; rà `DEPLOY.md` mọi chỗ ghi "Node ≥ 24" → cập nhật, kèm mục ngắn hướng dẫn nâng Node trên VPS (nvm/nodesource + `pm2 restart`).
2. Rà `package.json#engines` (hiện không khai — nếu vẫn không khai thì thôi, không thêm mới ngoài phạm vi).
3. Chạy đủ lint/typecheck/test/build trên Node 26 cục bộ (nvm use 26). Chú ý lỗi type mới từ `@types/node` 26 (API Node đổi chữ ký) — sửa cơ học.
4. Merge xong mới làm ops VPS (tài liệu hoá thứ tự trong PR: merge → deploy có sẵn Node mới). CI đã chạy Node 26 từ lúc PR nên chính CI là bằng chứng tương thích.

### Tiêu chí chấp nhận

- CI xanh toàn bộ trên Node 26; `.nvmrc`/CI/`DEPLOY.md`/`@types/node` cùng chỉ về 26 trong đúng 1 PR (không để lệch nửa vời); app chạy thật trên VPS sau nâng (smoke: login, tick 1 dimension, dashboard).
- Rollback: revert commit + hạ Node VPS về 24 (giữ hướng dẫn 2 chiều trong PR description).

---

## Kiểm lại 2026-07-20 (kết quả `npm info` thật — cả 3 vẫn CHƯA đạt điều kiện)

- **PR1 (ESLint 10):** `eslint-config-next@16.2.10` đã **lỏng** peer thành `eslint: '>=9.0.0'` (tiến triển so với ghi nhận 2026-07-18, không còn cap `^9` tường minh) — nhưng 2 gói nó **bundle cứng trong `dependencies`** vẫn chặn: `eslint-plugin-react@^7.37` peer `eslint: '^3 || … || ^9.7'` (không có `^10`), `eslint-plugin-jsx-a11y@^6.10` peer `eslint: '^3 || … || ^9'` (không có `^10`). Cài ESLint 10 sẽ báo lỗi peer dep ở 2 gói này qua chuỗi phụ thuộc của `eslint-config-next` → **vẫn chưa đủ điều kiện**, đổi lý do chặn từ "chính `eslint-config-next`" sang "2 plugin nó bundle".
- **PR2 (TypeScript 7):** xa hơn lúc ghi nhận. `typescript@latest` = `7.0.2` (đã GA), nhưng `typescript-eslint@latest` (8.46) khai peer **`typescript: '>=4.8.4 <6.1.0'`** — **loại trừ hẳn dải 7.x**, không phải kiểu "chờ 7.1 có JS API" như ghi nhận 2026-07-18 mà là hoàn toàn chưa hỗ trợ TS7 ở bất kỳ bản nào. **Chưa đủ điều kiện, cách đích còn xa hơn dự kiến trước.**
- **PR3 (Node 26):** không fetch được `endoflife.date/nodejs` để xác nhận trực tiếp (403 qua proxy môi trường này). Theo lịch dự kiến ghi trong đặc tả (Node 26 LTS ~2026-10), hôm nay 2026-07-20 còn ~2.5 tháng → nhiều khả năng **vẫn Current, chưa Active LTS**. Cần xác nhận lại bằng nguồn khác khi kiểm định kỳ kế tiếp.
- **Quyết định:** giữ nguyên trạng thái ĐANG HOÃN, không lập PLAN.md/mở PR nào trong đợt này — đúng nguyên tắc "không tự nhặt lại khi chưa đạt điều kiện". Kiểm lại vào lần rà deps kế tiếp.

## Kiểm tra định kỳ (đưa vào các đợt rà deps hằng tháng, KHÔNG tự thi hành khi chưa đạt)

```bash
# PR1 — eslint-config-next đã peer eslint ^10 chưa?
npm info eslint-config-next@latest peerDependencies
# PR2 — TS đã ≥7.1 (có JS API) chưa? Next đã hỗ trợ ổn định chưa (đọc release notes)?
npm info typescript version
npm info next version   # + đọc https://nextjs.org/blog mục TypeScript 7
# PR3 — Node 26 đã LTS chưa?
# xem https://endoflife.date/nodejs (26 dự kiến LTS 2026-10)
```

Đạt điều kiện PR nào → mở đợt riêng cho PR đó theo đúng mục trên (mỗi đợt 1 PR, tuần tự, không gộp).

## Nguồn nghiên cứu (truy cập 2026-07-18)

- ESLint 10: [Migrate to v10.x](https://eslint.org/docs/latest/use/migrate-to-10.0.0) · [ESLint v10.0.0 released](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/)
- Chặn PR1: [vercel/next.js#91702 — ESLint v10 support in eslint-config-next](https://github.com/vercel/next.js/issues/91702) (đóng duplicate về [PR #91710](https://github.com/vercel/next.js/pull/91710) — còn mở 2026-07)
- TypeScript 7: [Announcing TypeScript 7.0 RC](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/) · [vercel/next.js discussion #95633 — Add support for TypeScript 7](https://github.com/vercel/next.js/discussions/95633) (`experimental.useTypeScriptCli`, Next 16.3 Preview) · [vercel/next.js#95490 — next build misdetects TS 7](https://github.com/vercel/next.js/issues/95490)
- Node: [endoflife.date/nodejs](https://endoflife.date/nodejs) · [Node.js Releases](https://nodejs.org/en/about/previous-releases) (24 LTS → 2028-04; 26 LTS dự kiến 2026-10)
