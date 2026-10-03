# Audit lỗi logic & toàn vẹn dữ liệu — 2026-10-01

Phạm vi: trụ **Logic nghiệp vụ & toàn vẹn dữ liệu** của `docs/audit.md` (§4) cùng các vùng rủi ro
cao §8 (nghiệm thu, engine phê duyệt M46, thanh toán IPC, kho vật tư, import Excel), kèm các lỗi
"khác" bắt gặp trên đường rà. Không rà lại bảo mật (đợt 2026-09-27) hay layout/UI (đợt sáng nay).

Baseline: `3d087ae` (`main`), nhánh `claude/busy-gates-81ttq0`.

## Phương pháp (ground-truth, không đoán)

1. Dựng PostgreSQL 16 dùng một lần; chạy **toàn bộ** bộ test ở chế độ `--release-gate` trên
   baseline: 239 file · 3842 ca pass · 0 fail · 1 skip có lý do — tức mọi lỗi dưới đây nằm NGOÀI
   vùng test đang phủ.
2. Đọc code theo vùng rủi ro + grep theo lớp lỗi (FOR UPDATE ngoài transaction, `await` bị
   thiếu, `hoan_thanh` thiếu `nghiem_thu`, cộng ngày bằng giờ địa phương, `Number(null)`…).
3. Mỗi ứng viên được **tái hiện bằng route handler thật** (cookie phiên ký thật qua
   `tests/helpers/phien.ts`) trên DB thật trước khi coi là lỗi. Ví dụ số đo thật trước khi sửa:
   F1 → `403 "Người tạo không được tự duyệt"`; F5 → KL thi công 60 m × 1.000đ nhưng 3 đợt sinh
   bill tổng **80.000đ**; F6 → task `nghiem_thu` với `progress_percent = 0.5`.
4. Sửa xong: mỗi lỗi có test hồi quy; đã **gỡ tạm phần sửa và chạy lại** để xác nhận các test
   mới ĐỎ trên code cũ (trừ 2 ca đối chứng cố ý xanh ở cả hai phía).

Lưu ý trung thực: test route cũ của engine phê duyệt (`tests/approvals-task-proposal.test.ts`)
chỉ gọi lib với HAI user khác nhau (kỹ sư mở, PM duyệt), còn test huỷ nghiệm thu tầng
(`route-tien-do-3`) đặt `approval_source` bằng `UPDATE` tay — cả hai đều không đi qua đúng
đường mà người dùng đi, nên F1/F2 lọt qua dù "có test".

## Phát hiện & xử lý

Mức: 🔴 lỗi thật ảnh hưởng dữ liệu/tiền/quy trình · 🟡 lỗi thật mức thấp · 🟢 ghi nhận, chưa sửa.

| #   | Mức | Phát hiện (đã tái hiện)                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Xử lý                                                                                                                                                                                                                                                                                                                                                                |
| --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | 🔴  | **Bật flow duyệt nghiệm thu task (M46) là không ai nghiệm thu được nữa.** `POST /api/tasks/:id/approve` và `POST /api/approvals` mở `approval_request` với người bấm là `created_by` rồi gọi ngay `advanceApproval` cho chính người đó → luật SoD trả 403 và rollback cả request vừa mở, mọi lượt bấm. Kèm: route chặn `CAN.approve` ngay đầu nên vai trò bước khác (kỹ sư/CĐT) bấm "Duyệt" từ hộp thư "Chờ tôi duyệt" cũng 403; flow bắt đầu bằng vai trò ≠ Admin/PM kẹt vĩnh viễn. | Theo quyết định chủ dự án: `task_acceptance` **miễn SoD** (`SOD_EXEMPT_ENTITY_TYPES` trong `lib/tien-do/approvals.ts`, áp cả hộp thư `pendingForUser`). Đã có request đang chờ → quyền do engine quyết (giống VO/IPC); chưa có → vẫn chỉ Admin/PM mở; người mở khác vai trò bước 1 thì chỉ "trình" (giữ request, chờ vai trò bước 1). VO/IPC/đề xuất giữ nguyên SoD. |
| F2  | 🔴  | **Huỷ nghiệm thu tầng hạ cả task đã duyệt riêng lẻ.** `POST /api/approvals` đặt `approval_source='floor'` cho MỌI task trong tầng, ghi đè cả task đã nghiệm thu riêng (`'task'`) — đúng lỗi mà cột `approval_source` (migration 0151) sinh ra để chặn — kèm 1 dòng `task_history` "nghiệm thu" và 1 webhook `task.approved` trùng cho mỗi task đó.                                                                                                                                   | Duyệt tầng chỉ ghi phần task CHƯA `nghiem_thu` (gate QC, engine, UPDATE, audit, webhook, `taskCount`).                                                                                                                                                                                                                                                               |
| F5  | 🔴  | **Thanh toán IPC trả trùng tiền.** KL gợi ý + luỹ kế đợt mới tính từ đợt _đã duyệt_ gần nhất, nhưng không gì chặn lập đợt N+1 khi đợt N còn nháp/đã trình: P1 duyệt 30, P2 trình 20, P3 gợi ý 60−30 = 30 (đúng: 10) → duyệt cả hai là tổng bill 80 trên 60 KL đã thi công.                                                                                                                                                                                                           | Theo quyết định chủ dự án: `POST /api/payment-certs` trả **409** khi hợp đồng còn đợt nháp/đã trình; khoá dòng hợp đồng (`FOR UPDATE`) để 2 lần lập đồng thời không cùng lọt; gợi ý KL tính trong cùng transaction.                                                                                                                                                  |
| F6  | 🔴  | **Thêm/copy cột lưới phá bất biến nghiệm thu.** `POST`/`PATCH(copy) /api/workpackages/:id/dimensions/column` thêm ô chưa tick vào task đã nghiệm thu → % tụt (vd 1 → 0.5) trong khi status vẫn `nghiem_thu`, `actual_end_date` bị xoá. Cùng lớp lỗi L1/L2 (audit 2026-09-22) nhưng ở đường đổi cấu trúc. Kèm lỗi phụ: `afterLabel` dời `sort_order` TRƯỚC khi kiểm 409 "cột đã tồn tại" → cột lệch mà không thêm gì.                                                                 | Khoá các task sắp nhận cột (`FOR UPDATE`), có task `nghiem_thu` → 409 "huỷ nghiệm thu trước khi thêm cột"; dời cột + chèn ô + tính lại % gộp trong MỘT transaction, chỉ chạy khi đã qua mọi kiểm tra.                                                                                                                                                                |
| F8  | 🔴  | **Import lại Excel hạ % task đã nghiệm thu.** `importWorkbook` giữ status `nghiem_thu` (đã sửa từ trước) nhưng vẫn ghi % thấp hơn từ file và dựng lại lưới (bỏ tick) → task `nghiem_thu` với % < 100%.                                                                                                                                                                                                                                                                               | Task đã nghiệm thu mà file ghi < 100% → giữ nguyên, thêm cảnh báo vào kết quả import ("huỷ nghiệm thu trước nếu muốn ghi đè").                                                                                                                                                                                                                                       |
| F7  | 🟡  | Sổ kho: dòng `nhap_kho` (nhập từ PO) ghi `qty_after = qty_used` đọc NGOÀI transaction, trong khi `xuat_cong_truong`/`hoan_kho`/`dieu_chinh_kho` đều ghi tồn kho sau giao dịch — sổ có một loại dòng mang số dư của cột khác (và có thể cũ).                                                                                                                                                                                                                                          | `UPDATE ... RETURNING qty_stock` trong transaction, ghi `qty_after` = tồn kho sau nhập; bỏ truy vấn đọc trước.                                                                                                                                                                                                                                                       |
| F3  | 🟡  | Hạn bảo hành cộng tháng bị tràn: 31/01 + 1 tháng → **03/03**, 29/02/2024 + 12 tháng → 01/03/2025 (lệch với phép `interval` của Postgres). Cả bản server lẫn bản client của `/warranty`.                                                                                                                                                                                                                                                                                              | Kẹp ngày về cuối tháng đích (khớp Postgres: 28/02, 28/02/2025).                                                                                                                                                                                                                                                                                                      |
| F4  | 🟡  | `PATCH /api/tasks/:id/progress` với `{ progress: null }` (hoặc `""`, `false`) âm thầm hạ tiến độ về **0%** (`Number(null) = 0`) thay vì báo thiếu.                                                                                                                                                                                                                                                                                                                                   | Chỉ nhận số/chuỗi số hữu hạn, còn lại 400.                                                                                                                                                                                                                                                                                                                           |
| N1  | 🟢  | Báo cáo ngày/tuần (`buildDailyReport`/`buildWeeklyReport`, cron) cộng dồn **mọi dự án** nhưng tiêu đề lấy tên dự án đầu tiên — sai lệch khi chạy đa dự án (M22).                                                                                                                                                                                                                                                                                                                     | **Đã sửa 2026-10-03** — chủ dự án chốt mỗi dự án một báo cáo; người nhận/push theo dự án.                                                                                                                                                                                                                                                                            |
| N2  | 🟢  | `PATCH /api/dimensions/batch` khoá nhiều task `FOR UPDATE` theo `IN (...)` không `ORDER BY`, rồi khoá `work_packages` theo thứ tự task — 2 lô chồng nhau có thể deadlock (Postgres huỷ 1 bên → 500).                                                                                                                                                                                                                                                                                 | **Đã gia cố 2026-10-03** — khoá `ORDER BY id`, recompute cùng thứ tự.                                                                                                                                                                                                                                                                                                |
| N3  | 🟢  | `POST /api/purchase-orders/:id/receive` kiểm trạng thái PO (huỷ/đã nhận đủ) NGOÀI khoá; `logPoStatusChange` dùng trạng thái đọc trước khoá → 2 phiếu nhập đồng thời có thể ghi trùng dòng nhật ký đổi trạng thái.                                                                                                                                                                                                                                                                    | **Đã sửa 2026-10-03** — kiểm trạng thái dưới khoá PO, test hồi quy.                                                                                                                                                                                                                                                                                                  |
| N4  | 🟢  | Đồng bộ Google Sheet so sánh cả dòng: DB sửa trường A, Sheet sửa trường B → "xung đột", DB thắng cả dòng, thay đổi trường B bị bỏ (có liệt kê trong kết quả).                                                                                                                                                                                                                                                                                                                        | Thiết kế có chủ đích (`CONFLICT_POLICY`); ghi nhận để cân nhắc merge theo trường.                                                                                                                                                                                                                                                                                    |

## Báo cáo theo mẫu §12

```
=== BÁO CÁO AUDIT LOGIC & TOÀN VẸN DỮ LIỆU — 2026-10-01 · nhánh claude/busy-gates-81ttq0 · baseline 3d087ae ===

CỔNG TỰ ĐỘNG (chặn)
  lint ✅ | typecheck ✅ | format ✅ | build ✅
  test --release-gate trên PostgreSQL 16 cục bộ (DB sạch): 241 file · 3858 ca pass · 0 fail · 1 skip có lý do
  (baseline 3d087ae: 239 file · 3842 ca pass)
  check:route-perms ✅ | check:project-scope ✅ | check:db-params ✅ | check:lib-layers ✅
  | check:migrations ✅ | check:sw-exclude ✅ | check:test-fk-ids ✅ | check:dead-code ✅

§4 LOGIC & TOÀN VẸN DỮ LIỆU
  Làm tròn % ✅ (progressFromChecks/recomputePackage giữ trần 0.99)
  | FOR UPDATE trong transaction ✅ (mọi file có FOR UPDATE đều có withTransaction)
  | race/idempotency ✅ sau sửa (F5 khoá hợp đồng, F6 khoá task; N2/N3 ghi nợ)
  | tiền tính trong SQL ✅ | trả trùng IPC ❌→✅ (F5)
  | ngày Asia/Ho_Chi_Minh ✅ (server sạch; F3 cộng tháng ❌→✅)
  | nghiem_thu không tự hạ cấp ❌→✅ (F2 huỷ tầng, F6 thêm cột, F8 import)
  | engine phê duyệt M46 dùng được cho nghiệm thu ❌→✅ (F1)
  | migration: không có migration mới

ĐỐI CHIẾU TÀI LIỆU & HẠ TẦNG
  Git: nhánh từ main 3d087ae | PROGRESS cập nhật mục 2026-10-01 (logic) | không migration

--- PHÂN LOẠI VIỆC ---
  [AI] đã làm: F1–F8 + test hồi quy (route thật, DB thật).
  [Người dùng] cần thao tác tay trên production (chỉ ĐỌC, không sửa tự động):
    1. Rà dữ liệu đã hỏng trước bản vá (truy vấn ở mục dưới) — quyết định xử lý từng dòng.
    2. Chốt nghiệp vụ báo cáo ngày/tuần đa dự án (N1).
  Rủi ro/ảnh hưởng: F5 đổi quy trình — đợt IPC sau phải chờ đợt trước được duyệt/từ chối.
    F1: người bấm đầu tiên vừa mở vừa duyệt bước 1 của flow nghiệm thu (miễn SoD, đã chốt).

KẾT LUẬN: Cần xử lý phần [Người dùng] (dữ liệu cũ); phần code đã đóng.
```

## Truy vấn rà dữ liệu đã hỏng trước bản vá (chỉ đọc)

Bản vá chặn lỗi phát sinh MỚI, không tự sửa dữ liệu đã ghi sai. Chạy trên production để biết có
cần xử lý tay không:

```sql
-- F6/F8: task "đã nghiệm thu" nhưng % < 100% (bất biến nghiem_thu ⇒ progress = 1 đã vỡ)
SELECT t.id, t.code, t.progress_percent FROM tasks t
 WHERE t.status = 'nghiem_thu' AND t.progress_percent < 1;

-- F5: hợp đồng đang có ≥ 2 đợt IPC chưa quyết định (nguy cơ trả trùng khi duyệt cả hai)
SELECT contract_id, array_agg(code ORDER BY period_no) AS dot
  FROM payment_certs WHERE status IN ('draft', 'submitted')
 GROUP BY contract_id HAVING COUNT(*) > 1;

-- F5: dòng BOQ có tổng KL các đợt đã duyệt > KL thực hiện theo tiến độ (dấu hiệu đã trả trùng)
SELECT i.boq_item_id, SUM(i.qty_period) AS da_thanh_toan
  FROM payment_cert_items i JOIN payment_certs c ON c.id = i.cert_id
 WHERE c.status = 'approved'
 GROUP BY i.boq_item_id
HAVING SUM(i.qty_period) > MAX(i.qty_cumulative);

-- F2: task từng được duyệt riêng lẻ rồi bị duyệt tầng ghi đè nguồn (có cả 2 loại dòng audit)
SELECT h.task_id FROM task_history h
 WHERE h.note LIKE 'Nghiệm thu bởi %'
   AND EXISTS (SELECT 1 FROM task_history h2 WHERE h2.task_id = h.task_id
                AND h2.note LIKE 'Nghiệm thu tầng %' AND h2.changed_at > h.changed_at);
```
