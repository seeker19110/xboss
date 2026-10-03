---
name: gate
description: Cổng máy trước khi push/mở PR của XBoss — chạy đúng các bước CI (job static của ci.yml + PROGRESS.md + tuỳ chọn test Postgres/build) bằng `npm run gate`, rồi soát diff theo Definition of Done và xuất báo cáo SẴN SÀNG / CHƯA SẴN SÀNG. Dùng khi vừa xong một tính năng/fix, trước `git push`, trước khi mở PR, hoặc khi người dùng hỏi "chạy cổng/verify giúp". Bản XBoss của ecc-verification-loop.
---

# /gate — cổng máy trước push/PR (XBoss)

Quy ước repo là **merge ngay khi CI xanh** → mọi trách nhiệm chất lượng dồn vào bước tự kiểm
này. `/gate` là phần MÁY; `/review` là phần ĐỌC-HIỂU — làm cả hai, không thay nhau.

## Bước 1 — Chạy cổng

```bash
npm run gate                      # 17+ bước job "static" của ci.yml (đọc động) + PROGRESS.md
npm run gate -- --test --build    # trước khi mở PR: thêm test + build
```

- Có `TEST_DATABASE_URL` → test chạy `--release-gate` như CI. Không có → báo rõ "test tích hợp
  bị skip, kết quả CHƯA đủ" — **không** được nói là xanh hoàn toàn.
- Bước đỏ: sửa tận gốc rồi chạy lại đúng bước đó (`npm run <script>`), cuối cùng chạy lại cả gate.
  Không nới cấu hình để xanh (hook `protect-config.sh` sẽ hỏi người dùng nếu chạm file cổng).

## Bước 2 — Soát diff theo Definition of Done (`git diff origin/main...HEAD`)

Những điều máy không bắt được:

- [ ] Route mới: `getCurrentUser()` → 401, `CAN`/`canTouchTask`, `force-dynamic` (check:route-perms
      chỉ bắt route GHI).
- [ ] Migration đụng dữ liệu → đã ghi "qua staging + `db:migrate --dry-run`" vào PR/PROGRESS.
- [ ] Đổi schema → đã `npm run gen:erd`.
- [ ] Logic đổi → có test; fix lỗi → test hồi quy đã thấy đỏ trên code cũ.
- [ ] `PROGRESS.md` có mục mô tả thay đổi (+ `docs/nang-cap/README.md` nếu đóng/mở `M<xx>`).
- [ ] Không secret/`.env`/dữ liệu thật trong diff; không file rác (log, ảnh chụp tạm).
- [ ] Diff chạm vùng rủi ro (`.claude/hooks/risk-zones.txt`) → đã chạy agent audit tương ứng.

## Bước 3 — Báo cáo

```
BÁO CÁO GATE — <nhánh> @ <sha ngắn>
Cổng CI tĩnh : PASS/FAIL (x/y)
PROGRESS.md  : PASS/FAIL
Test         : PASS/FAIL/CHƯA ĐỦ (lý do) | chưa chạy
Build        : PASS/FAIL | chưa chạy
DoD (đọc)    : các mục chưa đạt
Tổng         : SẴN SÀNG / CHƯA SẴN SÀNG — việc còn lại: …
```

Chỉ nói "SẴN SÀNG" khi mọi dòng PASS hoặc có lý do ghi rõ.
