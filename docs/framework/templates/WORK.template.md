# Công việc: <tên>

- Work ID: <ngày-slug; không tái sử dụng ID đã done>
- Yêu cầu / outcome: <yêu cầu đã chốt>
- Trạng thái: Planned / Active / Blocked / Ready; chỉ Done sau nghiệm thu và merge thật.
- Chủ trì / writer: <phiên chính hoặc worker được giao phạm vi riêng>
- Mức rủi ro / số PR: <S/M/L; số PR và lý do>
- Scope / non-goal: <phạm vi>
- Spec / goal / issue: <đường dẫn/link; dùng checklist gốc, không sao chép>
- Nhánh / base SHA / thời điểm reconcile: <giá trị đã đo hoặc unknown>

## Kế hoạch và phân công

<Một outcome/PR; owner/cấp năng lực, input/output, file được ghi, dependency,
test/AC và nhánh/worktree. Từ 2 PR giao subagent; tối đa 5 subagent chạy toàn cây.
Song song nếu độc lập, tuần tự nếu phụ thuộc hoặc ghi chung.>

## Quyết định và bằng chứng

<Quyết định + lý do; lệnh/test, head/base và kết quả thật; PR/review/CI/merge SHA.
Không ghi test xanh từ lời khai hoặc dùng kết quả trước thay đổi.>

## Lần thử / blocker

<Failure, số lần cùng failure, giả thuyết đã bác bỏ, blocker và cách kiểm tiếp.>

## Bàn giao / bước tiếp theo

<Một hành động cụ thể, file/lệnh cần đọc/chạy; thay đổi chưa commit và nơi giữ;
điều kiện có thể tiếp tục. Cập nhật trước nén/chuyển phiên/giao việc.>

## Nghiệm thu cuối (chỉ điền khi đủ bằng chứng)

<DoD, mọi PR MERGED + merge SHA và main đã đối chiếu, giới hạn/rủi ro còn lại,
ngày và người nghiệm thu theo ủy quyền. Khi đủ điều kiện rename working.md → done.md
trong cùng thư mục; không overwrite lịch sử. Chưa có PR/merge thì giữ working.md.>
