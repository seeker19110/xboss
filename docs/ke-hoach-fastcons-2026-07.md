# Kế hoạch nâng cấp XBoss theo bộ tính năng FastCons — 2026-07

> **Trạng thái: CHỈ LẬP KẾ HOẠCH — chờ người dùng duyệt từng nhóm.** Không triển khai module nào khi chưa có lệnh "triển khai" rõ ràng.
>
> **Nguồn:** brochure FastCons M&E 13 trang (file người dùng cung cấp, đã trích toàn bộ nội dung) đối chiếu với hiện trạng XBoss tại 2026-07-05 (đã xong M0–M5 + M15, xem `PROGRESS.md`). Tài liệu này **sắp xếp lại** phần còn lại của `docs/ke-hoach-nang-cap-he-thong-2026-07.md` (M6–M14) **+ bổ sung module mới** phát hiện từ brochure, nhóm theo chuỗi giá trị để mỗi phiên plan-mode (opusplan) triển khai hiệu quả nhất.
>
> Quy ước kỹ thuật chung (migration/API/quyền/UI/test) **không lặp lại ở đây** — xem `docs/nang-cap/README.md`.

## 1. Bảng đối chiếu đầy đủ tính năng FastCons ↔ XBoss

Ký hiệu: ✅ đã có tương đương · 🟡 một phần · 📋 đã có đặc tả chờ triển khai (`docs/nang-cap/M<xx>`) · 🆕 mới, đề xuất module mới · ⛔ đề nghị ngoài phạm vi (người dùng quyết).

### 1a. Thi công (Construction — lõi FastCons)

| Tính năng FastCons (theo brochure)                                      | XBoss hiện tại                                                                   | Trạng thái | Việc còn lại                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------- |
| Kế hoạch thi công ngày/tuần/tháng, WBS, Gantt chart                     | WBS 5 cấp, lưới tracking, Gantt + phụ thuộc + critical path, baseline, lookahead | ✅         | —                                                              |
| Theo dõi tiến độ thực tế vs kế hoạch                                    | S-curve kế hoạch/thực tế + baseline + forecast                                   | ✅         | —                                                              |
| Nhập Excel dự toán để quản lý BOQ                                       | `boq_items` + map task + KL 3 lớp (M1 đã xong)                                   | 🟡         | Import Excel BOQ — **PR 3 của M1, đang chờ file dự toán thật** |
| Nhật ký thi công online, khoá sổ, xuất PDF                              | M5 đã xong (prefill từ `task_history`, nhân lực, khoá sổ, PDF)                   | ✅         | —                                                              |
| Báo cáo tiến độ, nguồn lực hàng ngày từ app                             | Báo cáo ngày/tuần (email/Telegram/push) + PWA mobile                             | ✅         | —                                                              |
| Cung ứng vật tư công trường: **nhập – xuất – hoàn**                     | Nhập kho (`warehouse_receipts`), xuất (`/issue` theo tầng/tổ đội — M4)           | 🟡         | Giao dịch **hoàn** (trả vật tư về kho) — quick-win Q1          |
| Cảnh báo vượt định mức vật tư so tiến độ thực tế                        | `material_over` (theo định mức tổng của vật tư)                                  | 🟡         | Định mức **theo từng hạng mục BOQ** → 🆕 M18                   |
| Định mức vật tư / **nhân công** / **máy** chi tiết từng hạng mục        | Chưa có (nhân lực mới theo tổ đội/ngày ở M5)                                     | 🆕         | M18 — Định mức thi công                                        |
| Định mức cấp phát vật tư cho nhà thầu                                   | Cấp phát theo tầng/tổ đội (M4) + báo cáo tiêu hao theo tầng                      | 🟡         | Ngưỡng cấp phát theo thầu phụ — gộp vào M18                    |
| Máy thi công, điều chuyển qua dự án/kho                                 | Chưa có                                                                          | 📋         | M12 — Thiết bị/máy móc                                         |
| Ngân sách, tổng hợp chi phí, cảnh báo vượt chi                          | M2 đã xong (ngân sách–cam kết–thực chi + `cost_over`)                            | ✅         | —                                                              |
| Dòng tiền dự án (thu – chi)                                             | Chưa có (mới có `payment_bills` rời)                                             | 📋         | M9 — Dashboard mở rộng (cash flow)                             |
| **KL nghiệm thu – thanh toán theo BOQ; cảnh báo vượt giá trị hợp đồng** | `payment_bills` chưa nối BOQ/đợt KL                                              | 🆕         | M17 — Thanh toán khối lượng theo đợt (IPC)                     |
| Quản lý lỗi/defect trong thi công                                       | M3 đã xong (NCR vòng đời đầy đủ)                                                 | ✅         | —                                                              |
| Cảnh báo rủi ro, sức khoẻ dự án                                         | Cảnh báo trễ/vượt chi đã có; sổ rủi ro chưa                                      | 📋         | M13 (sổ rủi ro) + M9 (health card)                             |
| Drive lưu trữ tài liệu, hồ sơ dự án                                     | File đang phân tán theo task/package/quality                                     | 🆕         | M20 — Kho hồ sơ dự án hợp nhất                                 |
| Tích hợp Map vị trí công trình; Weather                                 | Thời tiết đã có trong nhật ký (M5)                                               | ⛔         | Map: 1 dự án cố định, giá trị thấp — đề nghị bỏ                |
| Chấm công công trình FaceID/GPS trên app                                | Không có (đã quyết ngoài phạm vi ở §4c kế hoạch cũ)                              | ⛔         | Nếu người dùng vẫn muốn: M22 (điểm danh GPS mức tổ đội)        |

### 1b. Hợp đồng / CRM

| Tính năng FastCons                                                | XBoss hiện tại                                                              | Trạng thái | Việc còn lại                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| Quản lý hợp đồng **nhận thầu / giao thầu / NCC**                  | Mới có `floor_contracts` (giá trị giao thầu theo tầng)                      | 🆕         | M16 — Sổ hợp đồng                                                 |
| Cảnh báo hiệu lực hợp đồng                                        | Chưa có                                                                     | 🆕         | Gộp trong M16                                                     |
| Khối lượng – nghiệm thu – thanh toán theo từng hợp đồng           | Chưa nối                                                                    | 🆕         | M17 (phụ thuộc M16)                                               |
| Quản lý BOQ theo từng hợp đồng                                    | BOQ toàn dự án (M1)                                                         | 🟡         | Gắn `boq_items` ↔ hợp đồng khi làm M16/M17                        |
| Quản lý thầu phụ                                                  | `suppliers` + `discipline_contractors` + trang hệ (M15) + đánh giá NCC (M4) | ✅         | —                                                                 |
| Báo giá, so sánh giá nhiều nhà thầu, trúng thầu → hợp đồng        | Chưa có                                                                     | 📋         | M7 — Đấu thầu (nối ra M16)                                        |
| Công nợ phải trả NCC                                              | M4 đã xong (`supplierSummary`)                                              | ✅         | —                                                                 |
| Công nợ phải thu CĐT theo đợt thanh toán                          | Chưa có                                                                     | 🆕         | Gộp trong M17 + hiển thị M9                                       |
| Quản lý khách hàng/CĐT, pipeline tư vấn → báo giá → chốt hợp đồng | Không có                                                                    | ⛔         | CRM bán hàng — ngoài phạm vi công cụ 1 dự án                      |
| Kế hoạch sửa chữa, bảo hành công trình theo khách hàng            | Không có                                                                    | ⛔*        | M21 (tuỳ chọn) — chỉ có giá trị khi dự án sang giai đoạn bàn giao |
| Doanh thu, báo cáo kinh doanh                                     | Không có                                                                    | ⛔         | Làm trên hệ kế toán riêng                                         |

### 1c. Back-office / Productivity / HRM (nền tảng FastWork đi kèm)

| Tính năng FastCons                                                                             | XBoss hiện tại                                            | Trạng thái | Việc còn lại                                                                 |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| Đề xuất & phê duyệt online (tạm ứng, thanh toán, mua sắm, cấp phát), tuỳ chỉnh quy trình duyệt | Mới có duyệt **yêu cầu mua vật tư** (`purchase_requests`) | 🆕         | M19 — Đề xuất & phê duyệt tổng quát                                          |
| Cảnh báo khối lượng đề xuất vượt định mức                                                      | Chưa có                                                   | 🆕         | Gộp M19 (dựa định mức M18)                                                   |
| Công văn, văn bản (Dispatch)                                                                   | Chưa có                                                   | 📋         | M10 — RFI/công văn (phạm vi dự án)                                           |
| Quản lý họp                                                                                    | Chưa có                                                   | 📋         | M13 — Biên bản họp + action item                                             |
| Tài sản, cấp phát thiết bị (Assets)                                                            | Chưa có                                                   | 📋         | M12 (phạm vi thiết bị thi công)                                              |
| Công việc văn phòng, Workflow nội bộ, KPI nhân viên, Booking, News, Thu chi nội bộ             | Không có                                                  | ⛔         | Nền tảng điều hành doanh nghiệp — ngoài phạm vi XBoss (quản lý 1 công trình) |
| Chấm công văn phòng, tính lương, đơn từ, tuyển dụng (HRM)                                      | Không có                                                  | ⛔         | Đã quyết ngoài phạm vi (kế hoạch cũ §4c)                                     |

**Kết luận đối chiếu:** phần lõi thi công của FastCons (tiến độ, nhật ký, vật tư, chi phí, chất lượng, thầu phụ) XBoss đã **ngang hoặc sâu hơn** (hold-point, T&C, xe ra vào, đồng bộ Google Sheet là thứ FastCons không nêu). Khoảng trống thật sự nằm ở **chuỗi thương mại** (hợp đồng → VO → nghiệm thu KL → thanh toán đợt → công nợ 2 chiều → dòng tiền) và **định mức theo hạng mục**. Đó là trọng tâm của kế hoạch này.

## 2. Module mới đề xuất (M16–M22)

**Cập nhật 2026-07-05: đặc tả chi tiết đầy đủ cho M16–M20 đã viết** (`docs/nang-cap/M16-hop-dong.md` … `M20-kho-ho-so.md`, cùng khung schema DDL/API/UI/chia PR/điểm cần quyết như M00–M15) — phiên triển khai không cần viết lại, chỉ đọc và code theo. M21/M22 (nhóm E, hoãn/không làm) chưa viết đặc tả — chỉ viết khi có lệnh kích hoạt riêng.

### M16 — Sổ hợp đồng (nhận thầu / giao thầu / NCC)

- Bảng `contracts` (số HĐ, loại: `nhan_thau|giao_thau|ncc`, đối tác — FK `suppliers` hoặc text CĐT, giá trị, ngày ký, hiệu lực từ/đến, % tạm ứng, % giữ lại bảo hành, trạng thái, file đính kèm theo pattern `task_documents`) + phụ lục (`contract_addenda`, VO duyệt xong nối vào đây).
- Backfill: `floor_contracts` hiện có → dòng chi tiết của HĐ giao thầu; `payment_bills`/`purchase_orders` thêm FK `contract_id` (nullable, backfill dần).
- Cảnh báo hết hiệu lực (notification pattern `due_soon`); trang `/contracts` nhóm theo loại, tổng giá trị + đã thanh toán + còn lại.
- Phức tạp: **Trung bình** (2–3 PR). Phụ thuộc: không. Là **nền của M17** và đích nối của M6/M7.

### M17 — Nghiệm thu khối lượng & thanh toán theo đợt (IPC)

- Nghiệp vụ đinh của FastCons ("Acceptance"): mỗi **đợt thanh toán** = bảng KL nghiệm thu theo dòng BOQ (KL đợt này, luỹ kế, % so HĐ) → giá trị đề nghị thanh toán → trừ tạm ứng/giữ lại (tỷ lệ lấy từ M16) → giá trị chấp thuận.
- Bảng `payment_certs` + `payment_cert_items` (FK `boq_items`, KL đợt); 2 chiều: với CĐT (nhận thầu) và với thầu phụ (giao thầu). KL gợi ý sẵn từ tiến độ thực tế (`boqExecutedQty` đã có từ M1) trừ luỹ kế các đợt trước.
- **Cảnh báo luỹ kế vượt giá trị hợp đồng** (gồm VO đã duyệt — nối M6) — đúng tính năng FastCons nhấn mạnh; nối `payment_bills` hiện có (1 đợt duyệt xong sinh/khớp bill), công nợ phải thu CĐT.
- Xuất bảng KL đề nghị thanh toán (PDF tái dùng `lib/pdf-fonts.ts` + Excel tái dùng `exceljs`).
- Phức tạp: **Cao** (3–4 PR). Phụ thuộc: M1 ✅, M16, (M6 để gồm VO — nên xong trước).

### M18 — Định mức thi công theo hạng mục (vật tư / nhân công / máy)

- Bảng `boq_norms` (FK `boq_items` × loại nguồn lực: vật tư (FK `materials`) / nhân công (công) / máy (ca), định mức trên 1 đơn vị KL).
- Đối chiếu **tiêu hao thực tế vs định mức × KL thực hiện**: vật tư từ `material_transactions` (đã có tầng/tổ đội — M4), nhân công từ `diary_manpower` (M5); cảnh báo vượt định mức theo hạng mục (nâng cấp `material_over` hiện tại lên mức dòng BOQ) + ngưỡng cấp phát cho thầu phụ.
- Phức tạp: **Trung bình** (2–3 PR). Phụ thuộc: M1 ✅, M4 ✅, M5 ✅. Nguồn dữ liệu cho "kho năng suất" dài hạn (N2).

### M19 — Đề xuất & phê duyệt online tổng quát

- Tổng quát hoá `purchase_requests` thành `proposals` (loại: tạm ứng / thanh toán / mua sắm / cấp phát / khác; giá trị, file, người duyệt theo vai trò; vòng đời gửi → duyệt/từ chối, mượn pattern nghiệm thu 2 bước). Giữ `purchase_requests` hiện có, nối thành 1 loại proposal (không big-bang).
- Cảnh báo đề xuất vượt định mức/ngân sách (dựa M18/M2); danh sách chờ duyệt trên dashboard + push.
- Phức tạp: **Trung bình** (2–3 PR). Phụ thuộc: M18 (phần cảnh báo định mức — có thể làm sau bằng PR riêng).

### M20 — Kho hồ sơ dự án (Drive)

- Trang `/documents` hợp nhất: mọi file đã có (biên bản nghiệm thu, hồ sơ chất lượng M3, bản vẽ M8, hợp đồng M16, biên bản họp M13…) + thư mục tự do cấp dự án (`project_documents`, upload theo pattern sẵn có); lọc theo loại/hệ/tầng, tìm theo tên.
- Chủ yếu là **view hợp nhất + 1 bảng mới**, không di trú file cũ. Phức tạp: **Thấp-Trung bình** (1–2 PR). Nên làm **sau M8** để gồm bản vẽ.

### M21 — Bảo hành công trình _(tuỳ chọn — chỉ khi dự án sang giai đoạn bàn giao)_

- Sổ thiết bị/hạng mục bàn giao + hạn bảo hành + yêu cầu sửa chữa từ CĐT (vòng đời như NCR). Phức tạp: **Thấp-Trung bình**. Đề nghị: **chưa xếp lịch**, kích hoạt khi có nhu cầu thật (YAGNI).

### M22 — Điểm danh công trường GPS _(tuỳ chọn — khuyến nghị KHÔNG làm)_

- FastCons có chấm công FaceID/GPS vì họ bán kèm HRM/payroll. XBoss đã quyết không làm chấm công từng người (§4c kế hoạch cũ); nhân lực mức tổ đội/ngày (M5) đã đủ cho KPI năng suất. Nếu người dùng vẫn cần: check-in GPS mức tổ đội gắn nhật ký, **không** FaceID, **không** tính lương.

## 3. Lộ trình sắp xếp lại — 4 nhóm + quick-win (thay §5 kế hoạch cũ cho phần còn lại)

Nguyên tắc nhóm: các module **dùng chung bảng/pattern đứng cạnh nhau** (quyết định schema 1 lần, phiên sau tái dùng ngay); phụ thuộc cứng đi trước; trong 1 nhóm làm **tuần tự**, giữa các nhóm **độc lập** (duyệt nhóm nào làm nhóm đó, không chặn nhau).

```
Q  (quick-win, chen bất kỳ lúc nào, mỗi mục 1 PR):
   Q1 vật tư giao dịch "hoàn"  ·  Q2 import Excel BOQ (chờ file thật — PR 3 của M1)
   Q3 sửa nợ kỹ thuật st.deadline trong /api/export/pdf (cần quyết: thêm cột hay bỏ mục Dự báo)

A  Chuỗi thương mại (giá trị cao nhất — lấp đúng khoảng trống FastCons):
   M16 hợp đồng → M6 VO → M17 thanh toán KL theo đợt → M9 dashboard mở rộng (cash flow, CPI, health)
   (M7 đấu thầu: tuỳ chọn cuối nhóm — chỉ khi còn gói giao thầu chưa chốt nhà thầu)

B  Bản vẽ & hồ sơ:
   M8 bản vẽ BIM/Shop + biện pháp thi công → M10 RFI/công văn → M20 kho hồ sơ (Drive)

C  Hiện trường & nguồn lực:
   M14 mặt bằng thi công → M12 thiết bị/máy → M18 định mức theo hạng mục → M11 HSE
   (M11 cuối vì tái dùng checklist engine M3 — đã sẵn, không chặn; M18 sau M12 để định mức "máy" có danh mục thiết bị tham chiếu)

D  Quản trị mở rộng:
   M13 họp + sổ rủi ro → M19 đề xuất & phê duyệt tổng quát
   (M19 sau M18 nếu muốn cảnh báo vượt định mức ngay từ đầu; không thì làm trước, bổ sung cảnh báo bằng PR riêng)

E  Chờ quyết riêng (mặc định KHÔNG làm): M21 bảo hành · M22 điểm danh GPS · CRM bán hàng · HRM/lương · Map vị trí
```

Phụ thuộc cứng còn lại: M16 → M17; M6 → M17 (để IPC gồm VO); M2 ✅ → M9; M8 → M20 (nên, không bắt buộc); M12 → M18 (nên); M3 ✅ → M11. Khuyến nghị thứ tự duyệt: **A trước** (đúng trọng tâm FastCons + hoàn tất chuỗi đấu thầu→thanh toán đã đặt ra từ đầu), B/C song song theo nhu cầu hiện trường, D sau cùng.

## 4. Quy trình chuẩn 1 phiên opusplan (để mỗi phiên hiệu quả nhất)

Mỗi phiên nhận lệnh **"triển khai M<xx>"** (hoặc "triển khai M<xx> PR <n>") và chạy theo khuôn:

1. **Nạp ngữ cảnh tối thiểu** (không đọc lan man): `CLAUDE.md` + `docs/nang-cap/README.md` (quy ước chung) + đặc tả `M<xx>-*.md` + mục module tương ứng trong `PROGRESS.md`. Chỉ đọc thêm file code được đặc tả trỏ tới.
2. **Module mới (M16+) chưa có đặc tả** → việc đầu tiên của phiên là **viết `docs/nang-cap/M<xx>-*.md`** theo đúng khung các file M00–M15 (schema DDL, API, UI/UX, điểm chạm code, chia PR, điểm cần quyết) rồi mới lập plan code. Đặc tả là sản phẩm bàn giao — phiên sau đọc lại không cần suy diễn.
3. **Hỏi hết "điểm cần quyết" ngay đầu phiên** (một lần, gộp câu hỏi) — tránh block giữa chừng khi người dùng vắng mặt. Điểm chưa quyết được thì chọn phương án mặc định an toàn + ghi rõ vào đặc tả.
4. **Kích cỡ phiên**: 1 phiên ≈ 1–2 PR. Module Trung bình = 2–3 PR (migration+API+test → UI → tích hợp notification/dashboard); Cao = 3–5 PR. Không dồn cả module Cao vào 1 phiên — mỗi PR tự chạy được, dừng phiên ở ranh giới PR luôn an toàn.
5. **Verify thật** trước khi push (bài học M3/M4/M5): dựng Postgres cục bộ + seed + thao tác qua UI/API thật (Playwright), axe desktop+mobile cho trang mới; lint/typecheck/test/build xanh.
6. **Kết phiên**: cập nhật `PROGRESS.md` (mục module) + `docs/ERD.md` nếu đổi schema + đánh dấu bảng §5 dưới đây; push nhánh + PR draft.

## 5. Bảng duyệt

> **Đã duyệt toàn bộ 2026-07-05** (người dùng: "duyệt tất cả theo Claude kiến nghị"). Nghĩa là: nhóm A/B/C/D được duyệt triển khai theo thứ tự khuyến nghị; nhóm E (M21/M22 + CRM/HRM/Map) được duyệt **giữ nguyên khuyến nghị hoãn/không làm** — không tự triển khai trừ khi có lệnh riêng sau này khi nhu cầu thật xuất hiện. Đặc tả M16–M20 đã viết đủ (2026-07-05) theo khung `docs/nang-cap/README.md`.

| Hạng mục | Nội dung                                            | Nhóm | Phức tạp          | Đặc tả                        | Duyệt                                                                       |
| -------- | --------------------------------------------------- | ---- | ----------------- | ----------------------------- | --------------------------------------------------------------------------- |
| Q1       | Vật tư giao dịch "hoàn"                             | Q    | Thấp (1 PR)       | không cần                     | ✅                                                                          |
| Q2       | Import Excel BOQ (PR 3 M1 — cần file dự toán)       | Q    | Trung bình (1 PR) | `M01-boq.md` ✅               | ✅ (chờ file dự toán thật)                                                  |
| Q3       | Sửa `st.deadline` /api/export/pdf                   | Q    | Thấp (1 PR)       | nợ kỹ thuật `PROGRESS.md`     | ✅                                                                          |
| M16      | Sổ hợp đồng + cảnh báo hiệu lực                     | A    | Trung bình        | `M16-hop-dong.md` ✅          | ✅ **đã xong** (3/3 PR)                                                     |
| M6       | Phát sinh / VO                                      | A    | Trung bình        | `M06-phat-sinh-vo.md` ✅      | ✅ **đã xong** (schema/API/tích hợp ngân sách + UI + tài liệu/notification) |
| M17      | Thanh toán KL theo đợt (IPC) + cảnh báo vượt GTHĐ   | A    | Cao               | `M17-thanh-toan-kl.md` ✅     | ✅                                                                          |
| M9       | Dashboard mở rộng (cash flow, CPI, health)          | A    | Thấp-TB           | `M09-dashboard.md` ✅         | ✅                                                                          |
| M7       | Đấu thầu / so sánh báo giá                          | A*   | Trung bình        | `M07-dau-thau.md` ✅          | ✅ (cuối nhóm A, tuỳ chọn theo nhu cầu gói thầu còn mở)                     |
| M8       | Bản vẽ BIM/Shop + biện pháp thi công                | B    | TB-Cao            | `M08-ban-ve.md` ✅            | ✅                                                                          |
| M10      | RFI / công văn                                      | B    | Thấp-TB           | `M10-rfi-cong-van.md` ✅      | ✅                                                                          |
| M20      | Kho hồ sơ dự án (Drive)                             | B    | Thấp-TB           | `M20-kho-ho-so.md` ✅         | ✅                                                                          |
| M14      | Mặt bằng thi công (work front)                      | C    | Trung bình        | `M14-mat-bang.md` ✅          | ✅                                                                          |
| M12      | Thiết bị / máy thi công                             | C    | Thấp-TB           | `M12-thiet-bi.md` ✅          | ✅                                                                          |
| M18      | Định mức vật tư/nhân công/máy theo hạng mục         | C    | Trung bình        | `M18-dinh-muc.md` ✅          | ✅                                                                          |
| M11      | HSE / an toàn                                       | C    | Trung bình        | `M11-hse.md` ✅               | ✅                                                                          |
| M13      | Biên bản họp + sổ rủi ro                            | D    | Trung bình        | `M13-hop-rui-ro.md` ✅        | ✅                                                                          |
| M19      | Đề xuất & phê duyệt tổng quát                       | D    | Trung bình        | `M19-de-xuat-phe-duyet.md` ✅ | ✅                                                                          |
| M21      | Bảo hành công trình                                 | E    | Thấp-TB           | chưa (chỉ viết khi kích hoạt) | ☐ hoãn — kích hoạt khi dự án sang giai đoạn bàn giao                        |
| M22      | Điểm danh công trường GPS                           | E    | Trung bình        | chưa (chỉ viết khi kích hoạt) | ☐ không làm — trừ khi có lệnh riêng                                         |
| —        | CRM bán hàng, HRM/lương, thu chi nội bộ, Map vị trí | E    | —                 | —                             | ☐ không làm — ngoài phạm vi công cụ quản lý 1 công trình                    |

Thứ tự triển khai trong mỗi nhóm **tuần tự theo bảng trên** (A: M16→M6→M17→M9→(M7 tuỳ chọn); B: M8→M10→M20; C: M14→M12→M18→M11; D: M13→M19) — đúng phụ thuộc đã nêu ở §3. Giữa 4 nhóm độc lập, làm nhóm nào trước cũng được; khuyến nghị **A trước** vì đúng trọng tâm khoảng trống FastCons.

Cách ra lệnh: `"triển khai nhóm A"` (chạy tuần tự cả nhóm, mỗi module vẫn theo quy trình §4, dừng ở ranh giới PR an toàn) hoặc `"triển khai M16"` / `"tiếp tục M16"` từng module lẻ.
