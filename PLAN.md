# PLAN.md — M64: Upload kế hoạch & tracking theo hệ

> Phiên chính (Fable 5) xuất kế hoạch theo mẫu này, giao **nguyên văn** cho `coordinator`
> (Opus · low) thi hành — dispatch từng việc theo nhãn `route:`, theo dõi, gọi `reviewer`,
> tích hợp, báo cáo lại; phiên chính duyệt cuối. Coordinator/worker KHÔNG thấy hội thoại
> trước đó — kế hoạch dưới đây tự chứa.

## Bối cảnh

Đặc tả đầy đủ: `docs/nang-cap/M64-upload-ke-hoach-tracking-theo-he.md` (đã chốt phạm vi
với người dùng qua `AskUserQuestion` — không còn điểm mơ hồ). 1 việc duy nhất, không cần
chia nhiều PR song song.

Yêu cầu gốc: trong mỗi trang hệ (`/progress/[system]`, 6 hệ: acmv/dien/nuoc/pccc/ket_cau/
xay_to), cho phép Admin xuất file Excel mẫu từ DB, tải xuống, điền, upload lại để cập
nhật **kế hoạch** (ngày BĐ/KT) và **tracking** (lưới x/○ dimension) — kỹ sư theo dõi và
tuân theo dữ liệu sau khi admin cập nhật.

## Việc 1 — Upload kế hoạch & tracking theo hệ (`route: spec`)

- **Nhánh**: `claude/feat-m64-upload-ke-hoach-tracking`
- **Agent**: `spec-executor` (Opus · low) — đặc tả đã kín (schema DDL, API, hành vi từng
  dòng lỗi của lib, UI touch point, test, tiêu chí chấp nhận đều có sẵn trong file đặc
  tả), chỉ cần thi hành chính xác, không sáng tạo.
- **Brief cho worker**: Đọc và thi hành ĐÚNG theo
  `docs/nang-cap/M64-upload-ke-hoach-tracking-theo-he.md` (đủ 7 mục: schema, lib
  `lib/system-upload.ts` + tách `lib/excel-tracking.ts` từ
  `app/api/export/excel/route.ts`, 4 route API dưới `app/api/systems/[code]/...` +
  `app/api/system-uploads/[id]/file`, UI `app/components/SystemUploadPanel.tsx` gắn vào
  `app/progress/[system]/page.tsx`, test `tests/system-upload.test.ts`, Definition of
  Done). Không tự suy diễn thêm phạm vi ngoài file đặc tả — thiếu chi tiết nào thì dừng
  việc đó, ghi rõ vào báo cáo cuối thay vì tự đoán.
- **Vùng rủi ro cao chạm tới**: gọi `recomputeTask`/`recomputePackage`
  (`lib/recompute.ts`) sau khi UPDATE ngày/dimension hàng loạt — PHẢI đúng pattern
  transaction mô tả ở mục 3 file đặc tả (đối chiếu cách `app/api/tasks/[id]/route.ts`
  PATCH ngày đang làm), **không tự đổi logic** `recomputeTask`/`deriveStatus` sẵn có.
  Route upload chỉ cho `user.role === "admin"` (chặt hơn `CAN.import`/`CAN.export` hiện
  có vốn cho cả Admin/PM) — đúng yêu cầu gốc, không nới lỏng.
- **Tiêu chí chấp nhận**: mục 7 file đặc tả (Definition of Done) — đủ hết mới coi là
  xong, bao gồm lint/typecheck/test/build xanh.
- **Sau khi worker xong**: `reviewer` soát diff — đặc biệt điểm chạm `lib/recompute.ts`,
  bọc transaction, kiểm quyền admin-only ở route upload, an toàn tên file
  (`storagePut`/path traversal), và việc tách `lib/excel-tracking.ts` không làm đổi hành
  vi export hiện có (`/api/export/excel`).
- **Trước khi báo cáo về phiên chính**: cập nhật `PROGRESS.md` (mục "Đã làm", có số PR
  khi đã mở) + `docs/nang-cap/README.md` (thêm/đóng mục M64).

## Loại khỏi đợt này

Không có — 1 việc trọn vẹn, không phát sinh nhánh song song.
