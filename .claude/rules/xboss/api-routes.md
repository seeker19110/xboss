---
paths:
  - "app/api/**/*.ts"
  - "app/api/**/*.tsx"
---

# Checklist khi chạm route API (XBoss — API là ranh giới bảo mật duy nhất)

- `getCurrentUser()` đầu handler → **401** `{ error: "Chưa đăng nhập" }` khi thiếu phiên;
  `export const dynamic = "force-dynamic"`.
- Quyền qua `CAN.<quyền>` / `canTouchTask` / `canTouchPackage` — **đối chiếu route anh em cùng
  tài nguyên** (GET/POST/PATCH/DELETE phải đối xứng; lỗi thật đã lặp, `docs/audit.md` §3).
  Cổng: `npm run check:route-perms`.
- `project_id` từ client (body/query/formData) **không tin trần** — chốt qua
  `chotProjectIdChoGhi` (`lib/ha-tang/projects.ts`). Cổng: `npm run check:project-scope`.
- SQL qua `lib/db` với `?` theo **tham số rời** (`query(sql, a, b)`), không truyền mảng, không nối
  chuỗi giá trị. Cổng: `npm run check:db-params`.
- Cron: chỉ `Authorization: Bearer ${CRON_SECRET}`. Upload: kiểm mime + giới hạn dung lượng.
  Cookie phiên: đủ `httpOnly`, `sameSite: "lax"`, `secure` ở production.
- Route mới phải có nơi gọi thật (`npm run check:dead-routes`); logic nghiệp vụ nằm ở
  `lib/<miền>/`, logic ≥2 miền ở `lib/dich-vu/` (ADR-0008) — route chỉ bọc HTTP.
- Vùng rủi ro cao (`docs/audit.md` §8: tiến độ/nghiệm thu/tài chính/notification): hook
  `risk-zone-gate.sh` sẽ đòi nêu bất biến trước lần sửa đầu. Review: `audit-bao-mat` (+
  `audit-logic` nếu đổi số liệu/trạng thái), thêm `ecc-security-reviewer` cho góc OWASP chung.
