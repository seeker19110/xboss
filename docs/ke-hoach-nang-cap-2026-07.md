# Kế hoạch nâng cấp — 2026-07

> Tổng hợp & sắp xếp thứ tự các hạng mục nâng cấp (dependency + hạ tầng chất lượng) đang tồn đọng trong `PROGRESS.md` § Nợ kỹ thuật / Tiếp theo, để triển khai theo từng phiên nhỏ, rủi ro thấp. Không phải tính năng mới — chỉ nâng cấp/củng cố những gì đã có.

## 1. Dependency (rủi ro thấp, làm trước)

`npm outdated` hiện chỉ có bản vá/minor, không có breaking change:

| Package | Hiện tại | Lên | Ghi chú |
|---|---|---|---|
| `next` | 16.2.9 | 16.2.10 | patch |
| `lucide-react` | 1.18.0 | 1.23.0 | icon set only, ít rủi ro |
| `pg` | 8.13.1 | 8.22.0 | minor, kiểm tra lại pool/type parser tuỳ chỉnh trong `lib/db` |
| `recharts` | 3.8.1 | 3.9.2 | minor, smoke-test `SCurveChart`/`ForecastCards` |
| `nodemailer` | 9.0.1 | 9.0.3 | patch |
| `@tanstack/react-virtual` | 3.14.3 | 3.14.5 | patch |
| `npm` (global, CI) | 10.x | 11.18.0 | không bắt buộc, cân nhắc riêng cho runner CI |

**Cách làm:** 1 PR riêng `chore: cập nhật dependency minor/patch`, chạy `npm install`, `npm run lint && npm run typecheck && npm test && npm run build`, kiểm tay S-curve + export Excel + gửi mail (3 điểm chạm rủi ro nhất theo bảng trên). Không gộp vào PR tính năng.

## 2. Hạ tầng chất lượng (đã có kế hoạch trong PROGRESS.md, xếp lại thứ tự)

Ưu tiên theo rủi ro/công sức, tách mỗi hạng mục thành 1 PR nhỏ:

1. **CI: pin action bên thứ 3 theo SHA** (`gitleaks/gitleaks-action@v2`, `actions/*@v4`) — rủi ro supply-chain thấp nhưng dễ làm, không đụng logic app. Làm trước để dọn nền.
2. **Test cho business logic rủi ro cao nhất chưa có test tích hợp:** `recomputeTask`/`recomputePackage` (chỉ `deriveStatus` thuần có test) và `boqTakenBy`/`makeBoq` — dùng `TEST_DATABASE_URL` sẵn có. Ưu tiên trước khi đụng tới các route gọi 2 hàm này.
3. **Bọc nốt `recomputeTask`/`recomputePackage` trong `withTransaction`** ở 2 call site còn thiếu (`tasks/:id` PATCH đổi ngày, `workpackages/:id/dimensions/column` DELETE) — làm sau khi có test ở bước 2 để verify không hồi quy.
4. **Nợ a11y contrast còn lại:** `/notifications`, `/admin`, `/timeline`, `/gantt`, `/materials/reports`, `/materials/import`, `/materials/purchase-orders`, `/lookahead`, `/report`, `/import` (`text-zinc-500/600` trên body-text). Theo đúng quy trình đã dùng: thêm `e2e/authed/<trang>.spec.ts`, chạy axe, sửa, xác nhận xanh. `/notifications` (24 chỗ) và `/admin` (23 chỗ) làm trước vì mật độ cao nhất.
5. **Siết Lighthouse a11y `warn` → `error`** (`lighthouserc.json`) — làm **sau** bước 4 vì hiện chỉ đo `/login`; mở rộng gate sau khi các trang mật độ cao đã sạch, tránh CI đỏ hàng loạt ngay khi đổi ngưỡng.

## 3. Cần xác nhận người dùng trước khi làm (phụ thuộc ngoài repo)

- **Sentry observability** — cần `SENTRY_DSN` từ người vận hành, không tự thêm được.
- **Deploy zero-downtime** (build ra thư mục tạm rồi swap, hoặc `output: "standalone"` + release theo version) — đụng hạ tầng VPS, cần phiên riêng ngoài phạm vi code app; rủi ro nếu làm sai là downtime thật.
- **BOQCODE ràng buộc DB xuyên bảng** (`boq_codes(code UNIQUE)` dùng chung + FK) — đổi schema có ảnh hưởng 3 bảng (`tasks`/`work_packages`/`materials`), cần xác nhận có đáng đánh đổi so với rủi ro race hẹp hiện tại hay không.

## 4. Không nâng cấp (đã quyết định giữ nguyên, xem ADR)

`docs/adr/0001-postgres-raw-sql.md`, `docs/adr/0002-node-test-runner.md` — không đổi sang ORM/ Supabase / vitest / jest.

## Thứ tự triển khai đề xuất

1. Dependency minor/patch (mục 1)
2. CI pin SHA (mục 2.1)
3. Test `recompute`/`boq` (mục 2.2) → bọc transaction còn thiếu (mục 2.3)
4. A11y contrast các trang còn lại (mục 2.4) → siết Lighthouse gate (mục 2.5)
5. Các hạng mục cần xác nhận người dùng (mục 3) — hỏi trước khi bắt đầu từng hạng mục

Mỗi bước là 1 PR độc lập, có thể merge riêng mà không phụ thuộc thứ tự tuyệt đối (trừ 2.2 → 2.3 và 2.4 → 2.5 đã ghi chú).
