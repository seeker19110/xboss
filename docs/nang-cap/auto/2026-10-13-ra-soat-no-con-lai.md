# /auto-complete 2026-10-13-ra-soat-no-con-lai — Hoàn thiện dự án (rà lại nợ làm được bằng code)

- Trạng thái: Done
- Bắt đầu: 2026-10-13 · base `origin/main` `6eea2f6`
- Phạm vi: đối chiếu lại lộ trình `docs/ops/lo-trinh-hoan-thien-2026-10-07.md` §0 + issue #572/#570 sau lượt
  `2026-10-12-hoan-thien-no-code` (Done); làm phần còn làm được bằng code · **KHÔNG làm:** N05/N09/N12 (VPS, PITR,
  deploy), staging 0165–0169, bật `XBOSS_STRICT_MEMBERSHIP`, Safari/iOS thật, UAT/review độc lập (N03/N11), plugin
  AutoCAD, M60, `.env.example` (agent bị chặn đọc `.env.*`), DROP `cost_settings`.
- Definition of Complete:
  1. Mọi mục §0.3 còn ghi "chưa chạy/chờ" có kết cục đo được.
  2. Fix phát sinh có bằng chứng đỏ trước/xanh sau; CI xanh trên `main` sau PR cuối.
  3. `npm audit --omit=dev` = 0; tài liệu (lộ trình §0.3, `PROGRESS.md`) khớp code.

## Đối chiếu (2026-10-13)

| Nguồn                                                               | Kết quả                                                                                                                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue mở                                                            | Chỉ #572 (sổ nợ, cập nhật cuối 2026-10-11) + #570 (credential VPS) — không có gì mới                                                                                                                                |
| #572 N01–N12                                                        | Phần code (N06/N07/N08) đã "code xong" ở §0.2; còn lại cần môi trường/người/thiết bị thật                                                                                                                           |
| §0.3 "e2e `thiet-bi-offline-admin.spec.ts` (M131) chưa chạy cục bộ" | **Chạy cục bộ 5/5 xanh** (desktop + mobile, axe 2 theme) với env giống CI                                                                                                                                           |
| Phát hiện mới **F-101**                                             | `e2e/constants.ts`: secret mặc định 23 ký tự < 32 mà `lib/nen/env.ts:135` đòi ở production → e2e cục bộ không đặt `XBOSS_SECRET` hỏng ở bước đăng nhập ("sai mật khẩu") · Thấp (chỉ hạ tầng test, CI tự đặt secret) |

## Kế hoạch

| ID    | Việc (F-xxx gốc)                                                    | Mức | route  | Phụ thuộc | PR · merge SHA   | Trạng thái · bằng chứng                                                                |
| ----- | ------------------------------------------------------------------- | --- | ------ | --------- | ---------------- | -------------------------------------------------------------------------------------- |
| W-101 | F-101 secret mặc định e2e ≥32 ký tự + ghi kết quả M131 e2e vào §0.3 | S   | tự làm | —         | #640 · `cd83afd` | Xong — mọi check xanh (gồm gitleaks), merge squash; trước: đăng nhập đỏ, sau: 5/5 xanh |

## Quyết định và bằng chứng

- Không mở lại hạng mục đã có quyết định ở hồ sơ 2026-10-12 (F-007/F-009/F-010/F-013) · bậc 2 · đã có quyết định
  của chủ repo hoặc dòng chấp nhận rủi ro.
- F-101: kéo dài giá trị mặc định trong `e2e/constants.ts` · loại "hạ ngưỡng ≥32 ở `env.ts` khi `XBOSS_E2E=1`"
  (nới cổng bảo mật) và "bắt buộc đặt biến khi chạy e2e" (thêm bước vận hành) · bậc 1 rồi 2.
- M131 e2e coi là đã chạy: 5/5 cục bộ trên DB mới với env giống `ci.yml` (job e2e) · bậc 3.

- Review W-101 (`reviewer`): 0 chặn · đã sửa đoạn lỗi thời `docs/audit-hop-nhat-hub.md` §6 (mô tả secret 23 ký
  tự) · không thêm mục allowlist gitleaks (chuỗi sau `??` không khớp rule `generic-api-key`, CI gitleaks quyết định)
  · bậc 2.
- Gate `--test --build` trên DB mới: 5029 ca pass; chỉ 3 file DR/restore/migration-boundary đỏ do biến chỉ CI đặt
  (như mọi lượt); format sửa bằng prettier · bậc 3.

- Bàn giao clone sạch: không chạy lại toàn bộ — từ `c61edc6` (clone sạch 2026-10-12: `npm ci` + build OK, 5029
  pass) tới `main` hiện tại chỉ đổi `e2e/constants.ts` + tài liệu; gate `--test --build` hôm nay trên DB mới cho cùng
  kết quả · loại chạy lại clone sạch (~25 phút, không thêm thông tin) · bậc 4.

## Kết quả hoàn thiện (Definition of Complete)

1. §0.3 không còn mục "chưa chạy/chờ" làm được bằng code: M131 e2e 5/5 xanh cục bộ + trong CI.
2. F-101 sửa (#640) có bằng chứng đỏ trước/xanh sau; CI `main` xanh sau merge.
3. `npm audit --omit=dev` = 0; lộ trình §0.3, `PROGRESS.md`, `docs/audit-hop-nhat-hub.md` khớp code.

**Đề xuất phát hành: GO có điều kiện** — không đổi so với hồ sơ 2026-10-12 (0165/0166 qua staging trước production;
deploy do chủ repo). Nợ còn lại của #572 (N01, N03, N05, N07 Safari/iOS, N09 PITR, N11 review độc lập, N12) đều
cần môi trường/người/thiết bị thật — ngoài khả năng của lượt code.

## Bàn giao / bước tiếp theo

- Lượt xong (`Done`). Không còn nợ làm được bằng code; việc kế tiếp thuộc vận hành/chủ repo (staging 0165/0166,
  credential migrator #570, deploy, UAT).
