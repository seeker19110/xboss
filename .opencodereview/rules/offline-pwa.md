## Service worker & hàng đợi offline (PWA)

- `public/sw.js`: đổi bất kỳ logic cache nào phải **tăng version `CACHE`** — không thì thiết bị cũ kẹt cache cũ vĩnh viễn. `/api/events` (SSE) và `/api/photos/*` phải nằm ngoài cache (cổng `npm run check:sw-exclude`).
- API GET: stale-while-revalidate; điều hướng HTML mất mạng chưa có trong cache rơi về `/offline`. Không cache response lỗi (status ≠ 2xx) hay response của request có thông tin xác thực riêng tư dưới khoá dùng chung.
- Hàng đợi offline (`useOfflineTickQueue`, 3 loại op `tick`/`photo`/`diary_note`): khi online gửi lại phải idempotent; **4xx → bỏ khỏi hàng đợi**, **5xx/mất mạng → giữ lại** thử tiếp; không retry vô hạn dồn dập (có giãn cách).
- Người dùng phải thấy trạng thái offline/số thao tác đang chờ; thao tác bị server từ chối khi đồng bộ phải báo rõ lý do, không âm thầm mất.
