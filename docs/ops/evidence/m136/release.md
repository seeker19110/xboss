# M136 — phát hành và kiểm tra sau deploy

Đối soát ngày 24/10/2026. [Dữ liệu kết quả](release.json) chỉ chứa metadata phát hành và
phản hồi endpoint công khai; không có cookie, credential, hồ sơ người dùng hoặc log server thô.
Kết quả kiểm chứng mã nguồn và lab trước phát hành nằm ở [verification.md](verification.md).

## Chuỗi phiên bản đã xác minh

- [PR #675](https://github.com/seeker19110/xboss/pull/675) đã squash merge:
  commit nguồn `12a99e648ba87cbb7bb41e2193e8016fc7c97f5b` → main
  `d413650c567fa9a515eae5081e612eea53ea8913`.
- Cây Git hai commit giống nhau: `af3117dc037d710093c9ff901b028eb1b6bfa3ad`.
- [CI PR](https://github.com/seeker19110/xboss/actions/runs/39960994295) thành công sau khi
  chạy lại một shard E2E bị treo tải font từ mirror Ubuntu. Không sửa code, gate hoặc skip.
- [CI main](https://github.com/seeker19110/xboss/actions/runs/39963366086) thành công trên
  đúng SHA phát hành, attempt 1: 5.160 test pass, 0 fail, 1 skip allowlist; 693 E2E pass,
  51 skip điều kiện có sẵn; mutation 52/52 runnable, 0 survivor. Coverage lines 91,68%,
  branches 85,02%, functions 94,84%. Số 5.152 trong báo cáo local là lần chạy trước CI,
  không thay thế hoặc cộng gộp hai lần chạy.
- [Deploy to VPS](https://github.com/seeker19110/xboss/actions/runs/39964822526) thành công.
  Log job `120451826548` xác nhận artifact khớp SHA main, Node 24, PM2 reload và health-check
  đạt. Script hoàn tất 13:57:11 UTC ngày 23/10 (20:57:11 UTC+7); workflow xong 13:57:15 UTC.

## Kiểm tra công khai

Production: [XBoss](https://xboss.donghanhcungban.org).
Chromium desktop và Pixel 5 mô phỏng, context mới, chặn service worker, không đăng nhập/ghi dữ liệu.
Lượt đầu 23/10 và kiểm lại 24/10 đều PASS; timestamp UTC từng lượt ở JSON.

| Kiểm tra                              | Kết quả cả hai lượt                         |
| ------------------------------------- | ------------------------------------------- |
| `/login` desktop/mobile, form hiện đủ | 200, mobile không tràn ngang, input 16px    |
| Page exception / asset tĩnh HTTP lỗi  | 0 / 0                                       |
| axe WCAG 2/2.1 A/AA serious/critical  | 0; không suy thành audit a11y toàn ứng dụng |
| CSS responsive header/focus M136      | Có; path/hash trong JSON                    |
| Dashboard/search khi chưa đăng nhập   | 401                                         |
| `/api/health`                         | 200, status ok, DB true                     |
| `/api/ready`                          | 200, ready true, schema ok, 171 migration   |

`0171_users_disabled.sql` là **migration head**, không phải SHA Git. SHA bản phát hành được
xác minh bằng chuỗi checkout/build/artifact/deploy trong workflow, không suy từ endpoint health.
Không có bằng chứng thay đổi code production sau M136 trong lần đối soát này.

Python urllib mặc định bị Cloudflare Error 1010 (`browser_signature_banned`) trong một lần
kiểm lại; curl mặc định và Chromium truy cập bình thường. Không đổi WAF hoặc cookie để kiểm.
Đây không phải bằng chứng app trả lỗi nghiệp vụ hay lý do sửa code.

## Kết luận và phần còn chờ

Code M136 đã phát hành và public smoke đã được kiểm chứng. Business flow có đăng nhập được
kiểm trong CI trên DB cô lập, chưa thử ghi trên production. UAT 3–5 người, Safari/cảm ứng thật,
usage dài hạn, quyết định giữ/gộp/gỡ capability và field Core Web Vitals chưa được nghiệm thu.
Không tự lấy ngày deploy làm ngày bắt đầu usage: phải xác nhận nguồn và coverage trước.
Thực hiện phần còn lại theo [runbook](../../upgrade-ux-performance.md).
