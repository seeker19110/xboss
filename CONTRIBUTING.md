# Quy trình đóng góp — XBoss

Tài liệu này mô tả quy trình Git/PR chuẩn cho dự án. Đặc tả kỹ thuật xem `CLAUDE.md` và `spec.md`.

## Luồng làm việc (Git flow)

Dự án dùng mô hình **nhánh tính năng + Pull Request**, không commit thẳng vào `main`.

```
main  ──────●───────────────────●────────►   (chỉ nhận merge qua PR đã review + CI xanh)
             \                  /
feat/...      ●──●──●──────────●  (nhánh tính năng: code → push → mở PR)
```

1. **Tạo nhánh** từ `main`:
   ```bash
   git switch main && git pull
   git switch -c feat/<mo-ta-ngan>     # feat/ | fix/ | chore/ | ci/ | docs/
   ```
2. **Code** theo nguyên tắc trong `CLAUDE.md` (đọc trước khi sửa, diff nhỏ, tiếng Việt).
3. **Kiểm tra cục bộ** trước khi push (xem Definition of Done bên dưới).
4. **Commit** — conventional prefix + mô tả tiếng Việt, dòng đầu nói rõ thay đổi gì ở đâu:
   ```
   fix(materials): sửa race khi ghi qty_used
   ```
   > Trên PowerShell, commit message tiếng Việt có nháy kép nên dùng `git commit -F <file>` thay vì `-m` để tránh lỗi escape.
5. **Push** nhánh: `git push -u origin feat/<mo-ta-ngan>`
6. **Mở PR draft** vào `main` (template tự điền từ `.github/PULL_REQUEST_TEMPLATE.md`).
7. **Đợi CI xanh** (`.github/workflows/ci.yml`: `npm audit` → lint → typecheck → test với Postgres 16 → build).
8. **Review** → sửa theo góp ý → **merge qua giao diện PR** (không merge thủ công thẳng vào `main`).
9. Xoá nhánh sau khi merge.

## Definition of Done (bắt buộc trước khi push)

- [ ] `npm run lint` và `npm run typecheck` xanh; `npm run build` chạy được; test liên quan pass.
- [ ] Route handler mới gọi `getCurrentUser()` và trả 401 khi chưa đăng nhập; kiểm quyền qua `CAN` / `canTouchTask`.
- [ ] Validate input; không lộ secret; thao tác nhạy cảm có rate-limit; endpoint cron bảo vệ bằng `CRON_SECRET` qua header Bearer.
- [ ] SQL dùng helper `lib/db` với placeholder `?` — không nối chuỗi để chèn giá trị.
- [ ] File test chạm DB import `tests/setup.ts` **đầu tiên**; đã tự review diff đúng phạm vi.

## Lệnh thường dùng

```bash
npm run dev          # dev server (cần .env.local với DATABASE_URL)
npm run build        # build production
npm run lint         # next lint
npm run typecheck    # tsc --noEmit
npm test             # node:test qua tsx
```

## Quy ước commit

| Prefix  | Dùng khi |
|---------|----------|
| `feat:` | thêm tính năng |
| `fix:`  | sửa lỗi |
| `chore:`| việc lặt vặt, cấu hình, dọn dẹp |
| `ci:`   | thay đổi CI/CD |
| `docs:` | tài liệu |
| `refactor:` | tái cấu trúc không đổi hành vi |
