# S00 nhỏ — công cụ inventory route theo AST

State: **Approved for implementation** theo QUALITY-FINAL-1 và yêu cầu chủ dự án
ngày 2026-09-25 tiếp tục triển khai các việc nhỏ. Spec: ../nang-cap/AUDIT-2026-09-25/PLAN.md,
S00. Base đọc: 381b06899b3eb5d9e1b2c99b167d51cc24419732.

## Phạm vi

Chỉ scripts/audit-route-inventory.ts, tests/audit-route-inventory.test.ts và tài liệu này.
Không đổi route, auth, permission, DB, migration, package hoặc CI. Không có subagent được
khởi chạy; các bộ kiểm thử độc lập chạy bằng tiến trình riêng đồng thời.

Công cụ liệt kê HTTP method từ function, biến wrapper, export alias, re-export, wildcard
và destructuring. Không thực thi route. Mọi entry vẫn NOT_MAPPED: tên helper trong cây cú
pháp là gợi ý đọc, không chứng minh đã kiểm quyền hoặc scope. Local shadowing, dynamic
import và wrapper bên ngoài phải review tiếp. Không thay check:route-perms hoặc gate cũ.

Output có source SHA, Git blob từng file, dòng export và workingTreeDirty. Chỉ đọc file
tracked trong app/api; chặn symlink, lỗi git và inventory rỗng. Không in arguments, SQL,
source body hoặc secret. HEAD và hash working tree khác nhau được giữ riêng.

## Chạy

```bash
npx tsx scripts/audit-route-inventory.ts . > route-inventory.json
npx tsx --test tests/audit-route-inventory.test.ts
```

JSON là điểm bắt đầu cho inventory S00, không phải chứng nhận toàn repo an toàn. Chưa map
DB catalog, parent join, DTO/masking, consumer và negative test của tất cả miền. Không
đánh dấu S00 toàn repo hoàn thành chỉ vì scanner chạy xong.

## Kiểm chứng và rollback

7 test fixture đạt cục bộ, không skip; có repo git tạm để kiểm tracked/dirty/symlink.
Local Node 22.16.0 và TypeScript có sẵn, không phải full môi trường Node 24/lockfile của CI.
Không clone được repo trong container do DNS; chưa chạy inventory đầy đủ trên main tại đây.
CI đúng HEAD và review độc lập vẫn là điều kiện trước tích hợp. Rollback bỏ công cụ mới,
không thay dữ liệu hay làm yếu cổng bảo mật đang có.
