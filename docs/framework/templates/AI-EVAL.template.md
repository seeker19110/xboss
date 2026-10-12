# Eval offline cho thay đổi prompt/model — `[ĐIỀN: tên tính năng AI]`

> Dùng khi một PR đổi system prompt, đổi model, hoặc đổi guardrail của một tính năng gọi LLM.
> Chi tiết luật: `docs/framework/quality-gates-by-profile.md` (C7 mục 3 và mục 8).
> **Dán kết quả điền sẵn vào mô tả PR** — không merge thay đổi prompt/model mà không có bảng so sánh này.

## Golden fixtures

- Đường dẫn bộ fixtures cố định: `[ĐIỀN: vd tests/eval/fixtures/<tên>.jsonl]`
- Số lượng ca: `[ĐIỀN: vd 120 ca, chia N nhóm theo loại input]`
- Ai/khi nào chốt bộ fixtures này: `[ĐIỀN: người chốt + ngày + link PR/spec chốt fixtures]`
- Xác nhận **không** tự sinh eval từ chính output của model đang test (tránh khuôn lỗi "oracle tự trùng
  nguồn" — `docs/framework/quality-supplements.md`, Nhóm 2 mục 6): `[ĐIỀN: có/không, giải thích nguồn gốc
  kỳ vọng — vd gán nhãn thủ công, dữ liệu thật đã xảy ra, chuyên gia domain duyệt]`

## Baseline trước thay đổi

- Model/prompt/guardrail cũ: `[ĐIỀN]`
- Chỉ số đo được trên bộ fixtures trên (tùy dự án — recall/precision/tỷ lệ đúng/latency p95/chi phí mỗi
  request…):

| Chỉ số | Giá trị baseline |
|---|---|
| `[ĐIỀN: vd Accuracy]` | `[ĐIỀN]` |
| `[ĐIỀN: vd Latency p95]` | `[ĐIỀN]` |
| `[ĐIỀN: vd Chi phí/1000 request]` | `[ĐIỀN]` |

## Kết quả sau thay đổi

- Model/prompt/guardrail mới: `[ĐIỀN]`
- Cùng bộ fixtures, cùng chỉ số:

| Chỉ số | Giá trị sau thay đổi |
|---|---|
| `[ĐIỀN: vd Accuracy]` | `[ĐIỀN]` |
| `[ĐIỀN: vd Latency p95]` | `[ĐIỀN]` |
| `[ĐIỀN: vd Chi phí/1000 request]` | `[ĐIỀN]` |

## So sánh & kết luận

| Chỉ số | Baseline | Sau thay đổi | Chênh lệch | Tốt lên/Tệ đi | Giải thích nếu tệ đi |
|---|---|---|---|---|---|
| `[ĐIỀN]` | `[ĐIỀN]` | `[ĐIỀN]` | `[ĐIỀN]` | `[ĐIỀN]` | `[ĐIỀN: đánh đổi có chủ đích — vd đổi latency lấy accuracy — hoặc "n/a" nếu tốt lên]` |

- [ ] Mọi chỉ số **tệ đi** đều có lý do đánh đổi có chủ đích ghi ở cột cuối — nếu **không giải thích được**,
      coi là **hồi quy, không merge** (đối chiếu văn phong `GOLDEN-TEST.template.md`).
- [ ] Đã tự hỏi "có giải thích được chênh lệch này bằng thay đổi khác trong PR không?" — có, xem trên.

## Rủi ro an toàn kèm theo (tùy chọn — điền nếu dự án có bộ red-team fixtures)

- [ ] Đã chạy lại test prompt injection: `[ĐIỀN: kết quả, hoặc "n/a — chưa có bộ red-team"]`
- [ ] Đã chạy lại test rò rỉ dữ liệu (data leakage/PII trong output): `[ĐIỀN: kết quả]`
- [ ] Đã chạy lại test lạm dụng tool-calling (gọi tool ngoài phạm vi/gọi lặp bất thường): `[ĐIỀN: kết quả]`

## Xác nhận

- [ ] Bộ fixtures dùng để so sánh là **cùng một bộ** cho baseline và sau thay đổi (không đổi fixtures giữa
      chừng).
- [ ] Bảng so sánh trên đã dán vào mô tả PR.
- [ ] Không có chỉ số tệ đi chưa giải thích được.
