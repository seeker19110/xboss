# UI tải đúng nhu cầu — scope vòng 4

Baseline main e52b4937 (#682), đã deploy và public smoke đạt; owner tiếp tục ủy quyền rà, sửa, kiểm kỹ, merge/deploy ngày24/10/2026. UAT/usage F2/F3 vẫn WAITING. Lát S fix/refactor, không thêm capability/API/schema/dependency/quyền.

- Nhân sự: danh sách không chờ tổ đội/nhà thầu phụ; filter bỏ response cũ, loading/lỗi/empty rõ, retry giữ snapshot và chỉ GET cần thiết. Ngăn mở thao tác trên snapshot khác filter; nút xem chi tiết keyboard/target rõ, bảng giữ cột và cuộn trong vùng. Không sửa PersonnelModal, CertificationModal, DetailModal hoặc CrewsModal/write/payload/certBadge.
- Hợp đồng: suppliers/systems chỉ là nguồn form tạo mới, không fetch khi chỉ đọc danh sách. Tải khi mở tạo mới, cache trong vòng đời trang, lỗi/đang tải có phản hồi/retry/đóng, không mở form thiếu option. Giữ AddContractModal, ContractDocument, taiDanhSach/refresh/quyền/tính tiền/payload/header decimal-string nguyên vẹn.

Oracle trước source: RED baseline trên build production local có app content đồng nhất main; test desktop/mobile held auxiliary, stale filter, HTTP/network retry, count contract options trước/sau mở form, role/401, form option và payload giữ nguyên. GREEN trên build mới, regression liên quan, axe Light/Dark Blue/360px, screenshot trực tiếp; gate18/18, unit disposable, build, CI exactHEAD; mainCI/deploy cùngSHA và public smoke chỉ đọc sau deploy.

Rà thêm contracts/proposals/meetings/vehicles/notifications và tổ đội: loader/cert/write nâng rộng để vòng sau, không gom thêm vào lát này. Không gỡ capability khi usage đang chờ. Rollback revert squash, không migration. Cùng failure tối đa ba repair, không hạ gate/threshold/timeout/skip.
