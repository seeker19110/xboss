---
name: Sự cố (Incident)
about: Ghi nhận một sự cố production để điều phối xử lý (xem docs/ops/incident-response.md)
title: '[INCIDENT] '
labels: incident
assignees: ''
---

> Mở ngay khi phát hiện sự cố. Cập nhật liên tục trong lúc xử lý. Sau khi đóng (SEV1/SEV2):
> viết post-mortem (mục **Mẫu post-mortem** ở cuối `docs/ops/incident-response.md`).

## Mức nghiêm trọng

- [ ] SEV1 — sập / mất dữ liệu / lộ dữ liệu
- [ ] SEV2 — suy giảm nặng (luồng chính lỗi)
- [ ] SEV3 — ảnh hưởng nhỏ, có cách lách

## Triệu chứng

<!-- Quan sát thấy gì? Nguồn cảnh báo (Sentry / uptime / người dùng báo)? Thời điểm bắt đầu (UTC)? -->

## Ảnh hưởng

<!-- Ai/bao nhiêu người dùng? Chức năng nào? Dữ liệu/tiền có bị ảnh hưởng không? -->

## Hành động giảm thiệt hại đã làm

<!-- Rollback deploy? Tắt feature flag? Khôi phục từ backup? -->

## Dòng thời gian

| Thời điểm (UTC) | Sự kiện |
|-----------------|---------|
| | Phát hiện |
| | |

## Người điều phối

<!-- @ai-đang-xử-lý -->
