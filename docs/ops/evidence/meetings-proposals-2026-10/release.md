# Họp và Đề xuất #686 — đối soát phát hành

Đối soát ngày **26/10/2026** từ GitHub PR, metadata workflow và jobs; không triển khai mới.

| Bằng chứng                                                                           | Kết quả                                                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [PR #686](https://github.com/seeker19110/xboss/pull/686)                             | Merged; squash `0f5cef55e914711a0d004411d4123c5a966e3c25`, đúng `origin/main` lúc đối soát |
| [PR CI 40095296291](https://github.com/seeker19110/xboss/actions/runs/40095296291)   | Success trên HEAD cuối theo kết quả phát hành trong PR                                     |
| [Main CI 40114346685](https://github.com/seeker19110/xboss/actions/runs/40114346685) | `push`, completed/success; `head_sha` đúng squash SHA; 11/11 jobs success                  |
| [Deploy 40115106717](https://github.com/seeker19110/xboss/actions/runs/40115106717)  | `workflow_run`, completed/success; cùng `head_sha`; job120934667617 success                |

Main CI chạy 17:03:00–17:13:01Z ngày24/10; deploy chạy17:13:03–17:16:41Z.
Đó là00:03:00–00:13:01 và00:13:03–00:16:41 ngày25/10 theo UTC+7.
PR ghi bước deploy hoàn tất00:16:37; timestamp cập nhật cuối workflow là00:16:41.

Số liệu main CI được ghi trong kết quả phát hành PR: **5.173 unit pass, 1.127 E2E pass,
0 fail/flaky**, 1 unit skip allowlist/51 E2E skip cũ, mutation52/52 runnable/0 survivor.
Public smoke được PR ghi lúc00:20:13 ngày25/10 UTC+7: desktop/393/360px, hai theme đạt.
Đây là bằng chứng phát hành cũ được đối soát, không phải một lần chạy local mới ngày26/10.

Jobs được đọc bằng GitHub connector; metadata run dùng `gh api` chỉ đọc vì công cụ jobs
không trả run SHA. Combined status riêng có Vercel success không được dùng thay CI Actions.
Checkpoint [verification.md](verification.md) giữ kết quả local trước merge của lượt cũ.

**Kết luận:** #686 DEPLOYED. Chưa xác minh phiên production có auth; F2 UAT người thật/
Safari/cảm ứng và F3 nguồn/cửa sổ usage tiếp tục WAITING theo owner. Không suy nghiệm thu
toàn sản phẩm hoặc quyền vận hành mới từ kết quả này.
