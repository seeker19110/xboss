# Fixture hợp đồng ingest — ENG-5 §5.3

Bộ ca thử **có version** cho `POST /api/v1/engineering/ingest`, dùng chung cho **cả hai phía**:

- **XBoss** — `tests/engineering-contract.test.ts` nạp thẳng các file này chạy qua route thật.
- **MEPF-Agents** — copy nguyên thư mục này làm consumer-contract test bên đó (ENG-5 §5.4).
  Hai bên pin cùng `contractVersion` để phát hiện lệch hợp đồng sớm.

Mỗi file có `name`, `contractVersion`, `request` (body gửi đi) và `expect` (kỳ vọng). Trường
`expect.status` là mã HTTP; `expect.pointer` là JSON Pointer tới vị trí lỗi khi 4xx.

Ca `retry-*` và `conflict-*` phụ thuộc **thứ tự** (gửi ca trước rồi mới tới ca sau) — trường
`dependsOn` nói rõ, đừng chạy ngẫu nhiên.

Hợp đồng máy-đọc-được: `docs/api/engineering-ingest.openapi.json`.
