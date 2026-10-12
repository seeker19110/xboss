# FEATURE-MAP — Bản đồ tính năng

> Nguồn sự thật về "dự án này CÓ NHỮNG GÌ". Cập nhật khi thêm/bỏ tính năng.
> Trạng thái: ✅ ổn · ⚠️ nghi ngờ (có phát hiện audit) · 🚧 dở dang.
> (Bản mẫu — copy thành `docs/FEATURE-MAP.md` ở dự án đích rồi điền; xem `docs/framework/project-completion.md` Pha 1.)

| ID | Tính năng / luồng | Điểm vào (route/endpoint/cmd) | Dữ liệu đụng tới | Trạng thái | Test hiện có |
|----|-------------------|-------------------------------|------------------|-----------|--------------|
| FT-01 | (vd) Đăng nhập | `/login`, `POST /api/auth` | users, sessions | ✅ | unit + E2E |
| FT-02 | … | … | … | ⚠️ (F-003) | thiếu E2E |

## Luồng chính (bắt buộc có E2E — đối chiếu Definition of Complete)
- (liệt kê 2–5 luồng sống còn của sản phẩm)
