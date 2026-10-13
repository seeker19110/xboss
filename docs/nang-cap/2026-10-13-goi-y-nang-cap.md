# Gợi ý nâng cấp — rà soát 2026-10-13

> Lấy từ đợt rà soát chéo 19 repo của chủ sở hữu (ma trận vệ sinh ở [seeker19110/stored, mục 23 §8.1](https://github.com/seeker19110/stored/blob/main/23-own-repos-lessons/README.md); gợi ý tích hợp ở §7b của cùng file). Số liệu đo bằng lệnh trên HEAD (đếm `uses:` ghim SHA 40 ký tự, khối `permissions:`, `dependabot.yml`, `.claude/settings.json`), không suy ra từ văn xuôi. Đây là **đề xuất**, chưa sửa code. Mỗi mục kèm bằng chứng để kiểm lại trước khi làm; mục nào đã xử lý thì đánh dấu hoặc xoá.

## Hiện trạng đo được

| HEAD đọc | Action ghim SHA | Workflow thiếu `permissions:` cấp đầu | Dependabot | LICENSE · SECURITY | File test |
|---|---|---|---|---|---|
| `6eea2f6` (2026-10-13) | 39/39 | – | npm, github-actions | không · có | 470 |

## Đề xuất (🔴 cao · 🟠 trung bình · 🟢 nhẹ)

| # | Mức | Đề xuất | Bằng chứng | Kiểm xong khi |
|---|---|---|---|---|
| 1 | 🟢 | Nâng ECC vendor từ v2.2.2 lên **v2.2.3** (`affaan-m/ECC`, phát hành 1/10/2026), chạy lại `scripts/ecc-vendor.ts` để cập nhật `.claude/ecc/lock.json` và sửa số liệu trong ADR-0013 | `docs/adr/0013-tich-hop-ecc.md:7` ghi "v2.2.2 @ `c70874f`" (URL đã đúng). Upstream v2.2.3 có 71 agent / 311 skill / 97 command, so với 68 / 293 / 94 trong ADR | `npm test` xanh (gồm `tests/ecc-vendor.test.ts`) và lock trỏ đúng tag mới |
| 2 | 🟢 | Chọn LICENSE một cách có chủ đích, hoặc ghi rõ "giữ mọi quyền" trong README | Repo không có file LICENSE (mặc định pháp lý là giữ mọi quyền); trong khi đó vendor ECC MIT bắt buộc giữ thông báo bản quyền | Có `LICENSE` hoặc một dòng trong README; `.claude/ecc/` giữ thông báo MIT của ECC |

## Giữ nguyên (điểm mạnh)

- 39/39 action ghim SHA, Dependabot cho cả npm lẫn github-actions, Scorecard, OCR review không dùng `pull_request_target`.
- Fact-forcing gate, protect-config và mutation test tự viết.

## Gợi ý tích hợp từ catalog `stored`

- CodeFlow card làm badge sức khoẻ, cùng Graphify hoặc codegraph cho codebase khoảng 2.000 file (stored mục 16 §2c–§2d).
- agent-scan để quét 5 hook và phần vendor ECC (stored mục 12 §3d); đối chiếu protect-config với egress allowlist của Decepticon (mục 12 §3g).

## Ghi chú chung

- Ghim action theo SHA bằng [pinact](https://github.com/suzuki-shunsuke/pinact) hoặc [ratchet](https://github.com/sethvargo/ratchet), giữ comment tag (`# v7.0.1`), rồi để Dependabot `github-actions` tự nâng SHA. Đây là cách projects-template, xboss và Sales-Hunter đang làm.
- Chuẩn tham chiếu là `seeker19110/projects-template`: 25/25 action ghim SHA, mọi workflow có `permissions:` cấp đầu, Dependabot cho npm, github-actions và pip.
