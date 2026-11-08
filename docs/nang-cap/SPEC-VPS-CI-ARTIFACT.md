# Đặc tả bàn giao artifact CI sang VPS

| Thuộc tính       | Giá trị                                              |
| ---------------- | ---------------------------------------------------- |
| Issue / Goal     | X-Templates · xác minh artifact production của xboss |
| Spec owner       | Chủ repo xboss                                       |
| State            | **Approved for implementation**                      |
| Người/ngày duyệt | Chủ dự án, yêu cầu triển khai ngày 2026-11-08        |
| Cập nhật         | 2026-11-08                                           |

## Vấn đề và phương án

Run VPS `42444799787` đã phục vụ đúng archive được quan sát trên VPS. CI `main` kiểm cùng SHA nhưng job deploy tự build lại, nên CI chưa là nơi phát hành gói. Chuyển build production tới job `build` của CI trên push `main`, ở đúng `/var/www/xboss` với Node 24. Job VPS dùng gói đã xuất bản của CI thay cho bước build tại job deploy. [CI trước thay đổi](https://github.com/seeker19110/xboss/actions/runs/42444172232) · [Deploy đã xác minh](https://github.com/seeker19110/xboss/actions/runs/42444799787)

## Yêu cầu và hợp đồng

- **FR1** CI đóng gói `.next-ci` cùng `.next-ci.info` theo định dạng `deploy.sh` hiện dùng. Cache build nằm ngoài gói deploy. `metadata.json` chứa schema, repo, SHA nguồn, run ID, attempt, Node major, SHA-256 và kích thước archive, Build ID và SHA-256 của manifest tĩnh theo Build ID. CI PR build và kiểm gói ở cùng đường dẫn. Chỉ push lên `main` xuất bản gói dùng cho VPS.
- **FR2** Sau duyệt `Production`, job VPS chọn đúng artifact ID chưa hết hạn theo repo, run ID, attempt và SHA của CI đã kích hoạt nó. GitHub kiểm digest bao ngoài ở mức lỗi. Job kiểm SHA-256 bên trong, metadata và Build ID trước khi dùng SSH. VPS kiểm lại archive tạm trước khi đổi tên và kiểm lần nữa ngay trước khi gọi script deploy. Lượt chạy lại chỉ các job lỗi có thể thiếu artifact của attempt mới. Luồng dừng và yêu cầu chạy lại toàn bộ CI trong trường hợp đó.
- **FR3** Sau khi `deploy.sh` thành công, đọc Build ID từ `/login` qua HTTPS của VPS production và đối chiếu SHA-256 của manifest theo Build ID với metadata CI. Giới hạn thời gian và thử lại khi tuyến chưa ổn định. Lệch hoặc thiếu bằng chứng làm workflow đỏ sau deploy.
- **FR4** Lưu biên nhận JSON cho mỗi job deploy đã bắt đầu. Biên nhận ghi run/attempt CI và deploy, artifact ID/digest, SHA archive, Build ID dự kiến và quan sát, kết quả, giai đoạn lỗi và giờ kiểm. Kết quả sau deploy ghi rõ app đã kích hoạt trước khi probe lỗi. Artifact biên nhận giữ 30 ngày.
- **NFR1** Dùng đúng cổng `Production`, điều kiện CI `main` và concurrency hiện hành. Workflow staging và đường deploy tay giữ nguyên. Bằng chứng loại dữ liệu kết nối và nội dung HTML thô. Sentry phía trình duyệt giữ cấu hình build hiện hành.

## Nghiệm thu

| Ca kiểm          | Điều kiện đạt                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Handoff          | Gói thật build tại đường dẫn production. Metadata của gói và checksum đối chiếu thành công.                                   |
| Từ chối artifact | Sai byte, SHA nguồn, run/attempt hoặc Build ID đều dừng trước khi deploy.                                                     |
| Live proof       | Fixture Flight của Next và manifest khớp cho biên nhận `verified`. Build ID cũ, manifest sai hoặc HTTP lỗi cho biên nhận lỗi. |
| Phạm vi          | Diff giữ nguyên cổng duyệt `Production` và workflow staging. PR qua CI trước khi chủ repo quyết định merge.                   |
