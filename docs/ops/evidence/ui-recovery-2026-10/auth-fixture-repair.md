# Sửa fixture auth sau CI main của PR #680

## Lỗi đã quan sát

CI PR #680 `40063268763` đạt 869 pass/0 fail/0 flaky/51 skip cũ. Trên main
`3a678381ecc2b4314cbe7eed76a6835c1a367848`, CI `40063910943`, job `120783020920`
ghi nhận ca `primary 401 dùng flow hết phiên hiện hữu` flaky rồi đạt khi retry.
Tổng E2E main là 868 pass/0 fail/1 flaky/51 skip cũ; không ghi thành 869 pass sạch.

Lỗi `apiResponse.json: Response has been disposed` phát sinh trong helper test
`e2e/authed/ui-reliable-floor-detail.spec.ts`, khi đọc JSON sau `route.fetch()` auth.
Primary 401 chuyển tới login trong lúc proxy auth còn xử lý; context test đóng có thể
dispose response của fixture. Log này chưa chỉ ra lỗi ở auth hoặc redirect của ứng dụng.

## Thay đổi hẹp

Helper chỉ proxy `/api/auth/me` khi test truyền role tường minh. Phiên admin mặc định dùng
auth thật của PostgreSQL disposable và storageState từ setup. Ba ca viewer/engineer/pm
giữ nguyên role override. Các test body/assertion, kiểm GET retry, timeout, retries và
quyền ứng dụng không đổi; không thêm skip hoặc catch bỏ qua response bị dispose.

Không đổi app/lib/dependency/schema/API. App content giống main #680; dùng lại production
build `QTpB20JxOWhybrez898ap` từ `251ec883` để kiểm đúng runtime đó. Review độc lập xác
nhận diff chỉ đổi helper, không có P1/P2 actionable; reviewer không tự chạy runtime.

## Kiểm chứng

- Toàn file trên Chromium desktop và Pixel 5: **37 pass/0 fail/0 flaky/0 skip**, gồm
  36 lần chạy hành vi và 1 setup; retries=0, PostgreSQL 16 disposable, auth thật.
- Ca 401 lặp 20 lần mỗi profile: **40 pass/0 fail/0 flaky/0 skip**, retries=0, không
  chạy lại setup; đây là kiểm lặp, không phải 40 hành vi mới. [Số liệu](auth-fixture-checks.json).
- Format/lint/typecheck và gate **18/18** đạt; build app giữ nguyên như trên.
  Không chạy lại full unit local cho diff test/docs; CI của follow-up chạy lại đầy đủ.
- Không dùng tài khoản/dữ liệu production để kiểm thử. UAT/usage vẫn WAITING theo owner.

Đây là checkpoint trước CI/phát hành của follow-up; kết quả cuối cùng phải đối chiếu
HEAD, squash SHA, CI main, deploy và public smoke trong mục Kết quả phát hành của PR.
