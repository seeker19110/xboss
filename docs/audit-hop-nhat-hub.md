# Audit đợt hợp nhất "7 Đại Trung Tâm Điều Hành" (Unified Hubs)

> Rà 2026-08-24, khởi nguồn từ việc điều tra **vì sao job `e2e` đỏ liên tục trên `main`**
> hàng chục commit liền. Nguyên nhân đã ghi trước đây ("nợ color-contrast chế độ sáng")
> **không phải** lý do — rule `color-contrast` vốn đã bị tắt trong spec.

## 1. Nguyên nhân thật khiến e2e đỏ

**84/193 ca `authed-desktop` đỏ** (đo cục bộ trên Postgres 16 sạch, cùng cấu hình CI).
Ca đỏ đầu tiên mở ra là `/attendance` trả về **404**.

Đối chiếu 72 đường dẫn mà e2e dùng với route thật: **19 route đã bị xoá** khi gom vào hub —
`/attendance`, `/claims`, `/contracts`, `/costs`, `/diary`, `/equipment`, `/finance`, `/hse`,
`/insurance`, `/materials`, `/order`, `/payment-certs`, `/payments`, `/proposals`, `/quality`,
`/risks`, `/schedule-control`, `/scurve`, `/timeline`, `/variations`, `/vehicles`, `/work-fronts`.

Bộ e2e chưa từng được cập nhật theo đợt gom, nên nó đang canh một ứng dụng không còn tồn tại.

## 2. Phát hiện nghiêm trọng hơn: hai hub mất toàn bộ khả năng NHẬP LIỆU

Đếm lời gọi ghi trong các tab hub (`method: "POST" | "PATCH" | "PUT" | "DELETE"`):

| Hub                        | Số tab | Lời gọi đọc | Lời gọi **ghi** |
| -------------------------- | -----: | ----------: | --------------: |
| `/site` (hiện trường)      |      5 |           9 |           **0** |
| `/commercial` (thương mại) |      5 |          10 |           **0** |
| `/procurement` (mua sắm)   |      5 |          26 |          **14** |

`/procurement` được chuyển **đúng**: tab giữ nguyên khả năng tạo/sửa. `/site` và `/commercial`
thì chỉ còn là **bảng tóm tắt chỉ-đọc**. Route API tương ứng vẫn tồn tại đầy đủ — nghĩa là dữ
liệu vẫn ghi được qua API, chỉ **không còn đường nào trên giao diện**.

11 hành động nhập liệu không còn tồn tại ở bất kỳ đâu trong `app/` (đối chiếu từng chuỗi
kỳ vọng của e2e với toàn bộ mã nguồn `app/` + `lib/`, cả `.ts` lẫn `.tsx`):

`Chọn ngày chấm công` · `Ghi nhận HSE` · `Ghi nhận rủi ro` · `Lưu nháp` (nhật ký) ·
`Thêm bảo hiểm/bảo lãnh` · `Thêm checklist` · `Thêm hoá đơn` · `Thêm hợp đồng` ·
`Thêm phát sinh` · `Thêm thiết bị` · `Tạo đề xuất`

Đây là các thao tác hằng ngày của kỹ sư hiện trường và QS — đúng đối tượng người dùng
mà `PROJECT.md` đặt làm trung tâm.

## 3. Bảng quyết định theo miền

Cột "còn" = số chuỗi UI mà e2e kỳ vọng và vẫn tìm thấy trong mã nguồn.
**Cần người chốt** từng dòng: hub như hiện tại là đủ, hay phải khôi phục màn hình nhập liệu.

| Miền          | Route cũ         | Còn  | Đã mất (trích)                                        | API còn? |
| ------------- | ---------------- | ---- | ----------------------------------------------------- | -------- |
| risks         | `/risks`         | 0/7  | toàn bộ: ghi nhận rủi ro, ma trận 5×5, lọc trạng thái | còn      |
| finance       | `/finance`       | 1/8  | phải thu/phải trả, kỳ lương, thêm hoá đơn             | còn      |
| equipment     | `/equipment`     | 1/6  | thêm thiết bị, tìm theo serial, trạng thái bảo trì    | còn      |
| quality       | `/quality`       | 2/7  | NCR, checklist mẫu, thêm checklist                    | –        |
| hse           | `/hse`           | 2/5  | ghi nhận HSE, phân loại ghi nhận                      | còn      |
| attendance    | `/attendance`    | 2/6  | chọn ngày chấm công, tổng nhân công, biểu đồ tháng    | còn      |
| proposals     | `/proposals`     | 2/5  | tạo đề xuất, danh sách chờ duyệt                      | còn      |
| work-fronts   | `/work-fronts`   | 2/5  | ma trận mặt bằng, báo cáo EOT                         | còn      |
| insurance     | `/insurance`     | 3/6  | thêm bảo hiểm/bảo lãnh, tổng giá trị hiệu lực         | –        |
| costs         | `/costs`         | 1/3  | chi phí theo tầng                                     | còn      |
| payment-certs | `/payment-certs` | 1/2  | thanh toán khối lượng                                 | còn      |
| payments      | `/payments`      | 0/1  | tổng giá trị HĐ                                       | còn      |
| timeline      | `/timeline`      | 0/1  | timeline tầng                                         | còn      |
| claims        | `/claims`        | 5/10 | lọc/chọn loại claim, KPI claim chi phí & EOT          | còn      |
| variations    | `/variations`    | 5/8  | thêm phát sinh, dòng khối lượng                       | còn      |
| contracts     | `/contracts`     | 5/7  | thêm hợp đồng                                         | còn      |
| diary         | `/diary`         | 5/7  | lưu nháp nhật ký                                      | –        |

**Đỏ vì lý do KHÁC, không liên quan đợt gom hub** (trang vẫn còn, chuỗi vẫn đủ) — cần điều
tra riêng: `admin-config` (12/12), `appshell` (18/19), `dashboard`, `notifications`,
`project-switcher`, `correspondences`, `drawings`, `system`, `design-changes`. Nguyên nhân
quan sát được gồm strict-mode violation (locator khớp 2 phần tử) và timeout khi click.

## 4. Vì sao không tự ý sửa

Có ba cách xử lý, dẫn tới kết quả rất khác nhau, nên **phải người quyết từng miền**:

1. **Viết lại spec bám theo hub** — e2e xanh nhanh nhất, nhưng nếu đợt gom lỡ làm mất tính
   năng thật thì việc này **xoá luôn tín hiệu duy nhất còn báo điều đó**.
2. **Khôi phục màn hình nhập liệu** — nếu coi đợt gom là hồi quy.
3. **Chấp nhận hub chỉ-đọc cho một số miền** và xoá spec tương ứng có chủ đích, kèm ghi lý do.

## 5. Nợ kèm theo, đã định lượng nhưng chưa sửa

**Tương phản màu (WCAG AA) — hai chiều, không phải chỉ chế độ sáng như ghi nhận cũ.**
113 chỗ dùng nền màu đặc + `text-zinc-950`. `app/globals.css` chỉ đảo thang `zinc` và shade
`-300/-400` của màu nhấn, nên chữ lật giữa gần-đen và gần-trắng trong khi nền `-500/-600/-700`
đứng yên:

| Nhóm                                         | Số chỗ | Chế độ sáng    | Chế độ tối     |
| -------------------------------------------- | -----: | -------------- | -------------- |
| `bg-*-500/600` (amber, emerald, cyan, sky)   |     92 | **2,0–3,5 vỡ** | 5,3–9,3 ok     |
| `bg-*-700` (amber, emerald, sky, teal, blue) |     21 | 4,7–6,3 ok     | **3,0–4,0 vỡ** |

Tức **21 chỗ đang vỡ ngay ở chế độ tối — chế độ mặc định của app**. Cách sửa đúng: chọn màu
chữ theo độ sáng của **nền**, bằng token **không đảo theo theme** (2 utility: chữ tối cho nền
`-500/-600`, chữ sáng cho nền `-700`), không phải tắt rule `color-contrast` trong spec.

**Nhiễu log CI:** healthcheck Postgres trong `.github/workflows/ci.yml` dùng `pg_isready -U ci`
không kèm `-d`, nên mặc định hỏi database tên `ci` (không tồn tại) → log job spam
`FATAL: database "ci" does not exist` mỗi 5 giây suốt cả job. Vô hại nhưng làm log khó đọc;
thêm `-d xboss_test` là xong.

**Số liệu bịa trong hub:** `app/site/page.tsx` khởi tạo state bằng số liệu cứng
("14 Task", "6 Phiếu", "8 Sàn", "96/100", "FL06 - FL13") rồi mới fetch đè. Khi API lỗi hoặc
rỗng, giao diện hiển thị số **bịa** như thật — đúng lớp lỗi mà dự án đã từng phải dọn
(xem commit "eliminate hallucinations and mock data").

## 6. Cách tái lập

```bash
# Postgres 16 cục bộ + build + chạy nhánh sau đăng nhập
export E2E_DATABASE_URL=postgres://... DATABASE_URL=$E2E_DATABASE_URL
export XBOSS_SECRET=e2e-ci-secret-khong-bi-mat-du-32-ky-tu XBOSS_ADMIN_PASSWORD=e2e-ci-admin-pw
npm run build && npx playwright test --project=setup --project=authed-desktop
```

Lưu ý: mặc định `E2E_SECRET` trong `e2e/constants.ts` chỉ 23 ký tự, dưới ngưỡng 32 ký tự mà
production yêu cầu, nên chạy e2e cục bộ **không đặt biến** thì luôn đỏ ở bước đăng nhập với
thông báo "XBOSS_SECRET quá ngắn" — không phải lỗi test.
