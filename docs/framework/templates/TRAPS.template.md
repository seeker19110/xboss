# TRAPS.md — bẫy đã mắc trong repo này

> Sổ bẫy ĐÃ MẮC THẬT, không phải danh sách "nên tránh" chung chung. Mỗi mục có ngày + PR/commit +
> cách rà + test/cổng chốt chặn — tra được lại, không phải cảm tính. Khác `docs/adr/`: ADR ghi
> **quyết định** (chọn A thay B); file này ghi **lỗi đã xảy ra** và khuôn của nó.
>
> Cách dùng: gặp triệu chứng lạ → tìm khuôn khớp ở dưới trước khi đọc code từ đầu (`/debug` Pha 1
> đọc file này trước khi ra giả thuyết). Sửa bug xong → thêm mục mới nếu là khuôn mới, hoặc thêm
> ngày/PR vào mục cũ nếu là **tái phát** (đừng tạo mục trùng). Không dán giá trị secret/token thật
> vào đây — chỉ ghi vị trí, không ghi giá trị.

_Chưa có mục nào. Thêm mục đầu tiên khi bug đầu tiên được chẩn đoán và sửa xong._

## Mẫu một mục

**<Tên khuôn ngắn>.** <Triệu chứng: ai thấy gì, khi nào>. <Vì sao hỏng im lặng / vì sao khó tái hiện,
nếu có>. *Cách rà*: <bước cụ thể để nhận ra khuôn này, vd lệnh grep hoặc câu hỏi tự hỏi>. *Chốt chặn*:
<test/script/cổng CI cụ thể ngăn tái phát>. (Ngày, PR/commit)

_Tái phát <ngày>_: <mô tả ngắn nơi/lúc khuôn này xảy ra lần nữa, và bài học tổng quát hoá thêm được>.
