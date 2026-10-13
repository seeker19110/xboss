# /auto-complete 2026-10-13-e2e-flaky-offline — hoàn thiện dự án: ca e2e chập chờn lộ ra ở #644

- Trạng thái: Done
- Bắt đầu: 2026-10-13 · base `origin/main` `7c1917b`
- Phạm vi: chẩn đoán gốc rễ + làm ổn định các ca e2e đỏ/flaky ở run 38344161012 (#644, PR chỉ đổi Markdown):
  `offline-deep.spec.ts:318` A2-AC07 "nâng cấp bị chặn" (đỏ cả 2 lần thử), flaky `offline-deep.spec.ts:417` A2-AC08
  và `thiet-bi-offline-admin.spec.ts:21` (axe `link-in-text-block` footer, tương phản 1.01:1) — đều ở `authed-mobile`
  · KHÔNG: nới/skip/quarantine test, tăng `retries`, đổi workflow/cấu hình cổng; không đổi hành vi offline ngoài
  phần gốc rễ chứng minh được.
- Definition of Complete: gốc rễ có bằng chứng (log/tái hiện) cho từng ca; sửa (test hoặc app — theo gốc rễ) có
  bằng chứng ổn định (chạy lặp cục bộ `--repeat-each`); nếu là lỗi app thì có test hồi quy đỏ-trước; CI xanh
  trên PR và `main`.

## Kế hoạch

| ID    | Việc (gốc)                               | Mức | route  | Phụ thuộc | PR · merge SHA   | Trạng thái · bằng chứng          |
| ----- | ---------------------------------------- | --- | ------ | --------- | ---------------- | -------------------------------- |
| W-301 | Sửa A2-AC07 (lỗi app) + 2 ca e2e chờ sai | S   | tự làm | —         | #645 · `85245c0` | merged; 4 shard e2e xanh lần đầu |

## Quyết định và bằng chứng

- Đưa ca e2e chập chờn vào phạm vi "hoàn thiện" · loại "bỏ qua vì lần chạy lại xanh" · bậc 1 · test đỏ ngẫu nhiên
  làm mỗi PR tốn một lần chạy lại và che lỗi thật; DoC mặc định đòi CI xanh trên `main`. #572/§0 không có việc
  code mới (đối chiếu `list_issues`/`list_pull_requests` 2026-10-13).

- Gốc rễ (agent chẩn đoán + tự kiểm code/e2e): A2-AC07 = **lỗi app** — open() bị chặn vẫn trong hàng trình
  duyệt, open sau xếp sau và treo; `IdbTxDb` cache promise treo → hàng đợi treo. Bằng chứng: e2e thêm assert
  `POST vault/keys` 200 → timeout 30s trên build cũ (2/2); 22/30 run CI dính. A2-AC08 + axe thiết bị = **lỗi test**
  (chờ banner hiện cả khi 0 op; axe đo màu đang transition). Chạy lặp trên build cũ không tái hiện A2-AC07
  (33/33) vì lần tick thứ 2 thường thắng đua xin khoá muộn — tải CI làm thua.
- Sửa ở `moCsdl` (cờ `WeakSet` factory còn open bị chặn) · loại "không cache promise ở IdbTxDb" (open mới vẫn
  treo) và "timeout quanh open" (thêm hằng thời gian, vẫn để open treo xếp hàng) · bậc 1–2 · ít code nhất, lỗi rõ
  ngay, cờ tự gỡ khi request bị chặn kết thúc.
- Không làm (ngoài phạm vi, ghi nợ): `admin.spec:52` flaky 7/30, `payment-certs-canh-bao:306` flaky 10/30;
  upload `test-results/` khi e2e đỏ (đổi workflow — tách việc riêng).

- Audit `audit-logic` (tách người viết): ĐẠT, 0 Cao/Trung do bản sửa; cờ không kẹt (request bị chặn luôn kết
  thúc success/error, cả hai gỡ cờ). Thấp: `index.ts:352` `.catch(() => 0)` im lặng (có từ trước), không kích
  `refreshStats` khi open bị chặn hoàn tất (chỉ UX), test unit "bị chặn rồi lỗi" chỉ canh gỡ cờ (không đỏ-trước)
  · giữ nguyên, ghi nợ · bậc 2. Trung ngoài phạm vi (có từ trước): tab Y mở SAU khi tab X bị chặn vẫn treo vì cờ
  chỉ trong một tab · ghi nợ `PROGRESS.md` (hướng: timeout không-sự-kiện trong `moCsdl`) · bậc 2.
- E2E lặp trên build mới: `offline-deep` + `thiet-bi-offline-admin`, 2 project × `--repeat-each=5` → 81/81 xanh
  (lần đầu 10 đỏ do assert `status()==200` — server trả 201 cho khoá mới; sửa thành `ok()`).

- CI #645: 4 shard e2e xanh ngay lần đầu; `test (Postgres)` đỏ 1 ca không liên quan
  (`s16-quyen-luc-ghi-import-quet.test.ts:343` quét bản vẽ, kết thúc sau 43ms) → bình luận PR + chạy lại 1 lần →
  xanh. Giả thuyết: `scan-local` quét cả `DRAWINGS_DIR` dùng chung, `drawings-scan.test.ts` tạo/xoá tệp cùng thư
  mục song song → ghi nợ `PROGRESS.md`, không sửa trong lượt (ngoài phạm vi) · bậc 2.
- Hoàn thiện: phạm vi 1 module client + test → audit = `audit-logic` (ĐẠT); clone sạch thay bằng CI #645 (checkout
  sạch: build + test Postgres + e2e 4 shard) · bậc 4. DoC: gốc rễ có bằng chứng ✔; test hồi quy đỏ-trước (unit +
  e2e) ✔; lặp cục bộ 81/81 ✔; CI PR + `main` xanh ✔. GO/NO-GO: không đổi (GO có điều kiện).

## Bàn giao / bước tiếp theo

- Không còn việc làm được bằng code trong phạm vi. Nợ kế tiếp (đợt sau): flaky `admin.spec:52`,
  `payment-certs-canh-bao:306`, `s16-quyen-luc-ghi-import-quet:343`; treo IDB ở tab mở sau tab bị chặn.
