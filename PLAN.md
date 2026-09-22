# PLAN.md — M124: Ánh xạ BOQ theo tầng + cải tiến trang BOQ và lưới tracking

**Cập nhật:** 2026-09-22 · **Nguồn đặc tả:** `docs/nang-cap/M124-anh-xa-boq-theo-tang-va-cai-tien-tracking.md` (ĐỌC TOÀN BỘ trước khi làm — mọi DDL/API/AC nằm ở đó).
**Nhánh làm việc:** `claude/tracking-boq-improvements-kgkyx5` (= `origin/main` HEAD `79d4f20`). **Trạng thái:** CHỜ THI HÀNH.

## Ràng buộc CỨNG (mọi việc)

- Worker không thấy hội thoại. Đọc trước: `CLAUDE.md` (Auth, cấu trúc `lib/` ADR-0007, UI/UX, Quy ước tiền M45), spec M124, `tests/helpers/phien.ts`,
  file test mẫu `tests/boq-coverage.test.ts` (dựng dữ liệu) và `tests/route-boq-vat-tu.test.ts` (gọi route).
- Không đổi `lib/tien-do/recompute.ts`, không đổi hợp đồng `PUT /api/boq/:id/map`, không đổi lớp tài chính. Migration chỉ THÊM (`0154`).
- SQL qua helper `lib/db` placeholder `?`; tiền tính trong SQL (`::text` khi cần) — không cộng/nhân tiền trên float JS. Comment + thông điệp tiếng Việt.
- UI: dark-first, không `dark:`/hex, dùng `app/components/ui`, nút ≥40px, `aria-label` cho nút icon, hover nền đậm dần (ADR-0010).
- Route mới: `getCurrentUser()` 401, `export const dynamic = "force-dynamic"`, lọc dự án qua `getCurrentProjectId` + `assertModuleEnabled("materials")` như `app/api/boq/[id]/map/route.ts`.
- Test chạm DB: `import { HAS_TEST_DB } from "./setup"` dòng đầu. Chạy: `TEST_DATABASE_URL=postgres://ci:ci@localhost:5432/xboss_test npx tsx --test tests/<file>.test.ts`.
- Cổng trước khi báo xong: `npm run lint`, `npm run typecheck`, test của việc xanh + `tests/boq.test.ts`, `tests/boq-coverage.test.ts`, `tests/route-boq-vat-tu.test.ts`, `tests/grid.test.ts`, `tests/tick-lo.test.ts` vẫn xanh; việc thêm module `lib/` chạy thêm `npm run check:lib-layers`.
- Worker commit trên nhánh/worktree của mình, **không push**, không sửa `PROGRESS.md`/`docs/nang-cap/README.md` (phiên chính cập nhật).

## Thứ tự & song song

- Chuỗi A (tuần tự, cùng chạm `app/boq/page.tsx`): **Việc 1 → Việc 2 → Việc 3**.
- Chuỗi B (song song với A, độc lập file): **Việc 4**, **Việc 5** (cả hai chạm `app/tracking/[sheet]/` — chạy tuần tự 4 → 5 trong 1 worktree để tránh conflict `TrackingGrid.tsx`/`page.tsx`), **Việc 6** (worktree riêng; chạm `app/boq/page.tsx` phần `NormsSection` ⇒ làm SAU Việc 2 trong chuỗi A, hoặc chỉ sửa 2 mục còn lại song song rồi mục `addNorm` gộp vào Việc 2).
- Coordinator gộp về nhánh làm việc theo thứ tự 1,2,3,4,5,6; sau mỗi việc gọi `reviewer` soát diff; xung đột nhỏ tự giải, xung đột logic thì dừng và báo.

## Việc 1 — Map theo tầng — `route: spec`
Spec §Việc 1. File mới: `lib/nen/van-ban.ts`, `lib/khoi-luong/boq-map-tang.ts`, `app/api/boq/[id]/tasks-theo-tang/route.ts`, `tests/boq-map-tang.test.ts`. Sửa: `app/boq/page.tsx` (`BoqDetailModal`, panel "Thêm theo tầng"). Trước khi viết `van-ban.ts`: `grep -rn "normalize(\"NFD\")\|unaccent\|boDau" lib/nen lib/tien-do/search.ts` — có hàm bỏ dấu sẵn thì tái dùng.
Commit: `feat(boq): thêm task vào map theo tầng cùng hệ, xếp theo độ giống tên (M124 việc 1)`.

## Việc 2 — Trang /boq: tìm/lọc/sắp xếp/xuất Excel + tách component — `route: standard`
Spec §Việc 2. Tách 4 khối ra `app/boq/_components/*.tsx` + `types.ts` (không đổi hành vi). Route mới `app/api/boq/export/route.ts` (exceljs, mẫu `app/api/export/excel/route.ts`; tên dự án qua cách `/api/project` đang lấy). Test `tests/route-boq-export.test.ts`. Gộp luôn mục `addNorm` try/catch của Việc 6.
Commit: `feat(boq): tìm/lọc/sắp xếp + xuất Excel trang BOQ, tách modal ra _components (M124 việc 2)`.

## Việc 3 — Lịch sử dòng BOQ — `route: standard`
Spec §Việc 3. `migrations/0154_boq_item_history.sql`, `lib/khoi-luong/boq-history.ts`, ghi ở `app/api/boq/[id]/route.ts` PATCH + `commitBoqImport`, route `app/api/boq/[id]/history/route.ts`, mục lịch sử trong `app/boq/_components/BoqDetailModal.tsx`, cập nhật `docs/ERD.md` (bảng mới). Test `tests/boq-history.test.ts`.
Commit: `feat(boq): lịch sử thay đổi dòng BOQ (boq_item_history) + tab lịch sử (M124 việc 3)`.

## Việc 4 — Lọc cấp task + URL trên lưới tracking — `route: standard`
Spec §Việc 4. Sửa `app/tracking/[sheet]/page.tsx`, `TrackingToolbar.tsx`, `TrackingGrid.tsx` (prop `taskFilter`), mới `app/tracking/[sheet]/locTask.ts` + `tests/tracking-loc-task.test.ts`. Được phép quyết: tắt chọn vùng khi đang lọc task nếu cần (ghi rõ trong commit).
Commit: `feat(tracking): lọc task theo trạng thái trong nhóm + bộ lọc ghi vào URL (M124 việc 4)`.

## Việc 5 — Dán/copy vùng tick với Excel — `route: standard`
Spec §Việc 5. Mới `app/tracking/[sheet]/dan.ts` + `tests/tracking-dan.test.ts`; sửa `useTickVung.ts` (+ `TrackingGrid.tsx` nếu cần bắt sự kiện). Tái dùng `parseTSV`/`serializeTSV`/`spreadPaste` từ `@/lib/tien-do/grid`, `ghiThaoTacLo` sẵn có.
Commit: `feat(tracking): dán ma trận tick từ Excel vào vùng chọn, copy vùng ra TSV, hoàn tác được (M124 việc 5)`.

## Việc 6 — Nợ kỹ thuật — `route: mechanical`
Spec §Việc 6 (trừ `addNorm` đã gộp vào Việc 2): `lib/vat-tu/material-sync.ts:449` orgId thật (sửa chữ ký + 2 điểm gọi nếu cần, cập nhật `tests/material-sync.test.ts` nếu chữ ký đổi); 14 `text-zinc-600` → `text-zinc-500` trong `TrackingGrid.tsx`; chạy `npm run check:contrast`.
Commit: `fix: material-sync dùng orgId thật khi kiểm BOQCODE; nâng tương phản chữ mờ trên lưới tracking (M124 việc 6)`.
