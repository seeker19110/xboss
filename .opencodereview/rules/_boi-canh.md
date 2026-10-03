# Luật review XBoss

Bối cảnh: XBoss là web app quản lý tiến độ thi công MEP/ACMV (Next.js App Router + React 19 + TypeScript strict + PostgreSQL tự host, raw SQL, không ORM). Dữ liệu thật: % tiến độ, tiền hợp đồng/thanh toán, quyền theo vai trò và theo dự án.

Cách review:

- Chỉ nhận xét **dòng code thay đổi** (+) và hệ quả trực tiếp của chúng; đọc thêm code xung quanh/route anh em khi cần để xác nhận.
- Mỗi phát hiện phải nêu **kịch bản cụ thể** (input/trạng thái → kết quả sai, lộ dữ liệu, crash) và chỉ ra đúng mục luật bên dưới bị vi phạm. Ưu tiên **độ chính xác hơn số lượng** — không chắc thì không báo.
- Mức độ: sai % tiến độ / sai tiền / rò chéo dự án / vượt quyền / mất dữ liệu là **cao nhất**; thẩm mỹ, văn phong là thấp nhất.
- Viết nhận xét bằng **tiếng Việt**.
