# M121 — Tick theo vùng, hoàn tác, và gộp lô trên lưới tracking

| Thuộc tính       | Giá trị                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Issue / Goal     | Giai đoạn 2 của lộ trình cải thiện kế hoạch/tiến độ/tracking (rà soát 2026-09-02). Giai đoạn 1 = M120 (#460). |
| Spec owner       | Phiên chính (opusplan)                                                                                        |
| State            | **Approved for implementation**                                                                               |
| Người/ngày duyệt | Người dùng · 2026-09-03 (chốt D1/D2/D3 theo đề xuất, xem §18)                                                 |
| Cập nhật         | 2026-09-03                                                                                                    |

> Không code khi chưa **Approved for implementation**.

## 1. Problem, vai trò và bằng chứng

Lưới tracking là màn hình được dùng nhiều nhất của XBoss, nhưng thao tác tick vẫn ở mức "mỗi ô
một cú bấm, mỗi cú bấm một request". Ba vấn đề cụ thể, đo được:

**(a) Tick hàng loạt bắn N request song song.** `setAllInRow`
(`app/tracking/[sheet]/TrackingGrid.tsx:438-458`) gọi `Promise.all` trên từng ô:

```ts
cells.map((c) => fetch(`/api/dimensions/${c.id}`, { method: "PATCH", ... }))
```

Mỗi request là **1 transaction + 1 `recomputeTask` + 1 `recomputePackage`** riêng. Hàng 30 cột =
30 round-trip và 30 lần tính lại % của cùng một task/nhóm. Trên 3G công trường đây là vài giây
đơ và một loạt ghi DB thừa. Tương tự, `saveDates` (`:503-525`) loop `PATCH /api/tasks/:id` từng
task khi PM đặt ngày hàng loạt — lỗi giữa chừng để lại **lô nửa chừng**, không nguyên tử.

**(b) Hai API bulk đã xây xong nhưng KHÔNG có ai gọi.** `PATCH /api/dimensions/batch`
(`MAX_IDS = 1000`, gộp recompute 1 lần/task, atomic) và `PATCH /api/tasks/batch`
(`MAX_UPDATES = 500`, atomic) đều có đủ kiểm quyền, hold-point gate và test — grep toàn `app/**`
chỉ thấy chính file route. Đây là công đã bỏ ra nhưng chưa thu được giá trị nào.

**(c) Không có chọn vùng, không có hoàn tác.** Grep `undo` trong `TrackingGrid.tsx` = 0 kết quả.
Kỹ sư tick nhầm 20 ô chỉ có cách bấm lại 20 lần. `setAllInRow(task, false)` chạy ngay, không hỏi
lại, không hoàn tác được. Cơ chế undo 50 bước + chọn vùng ĐÃ TỒN TẠI trong
`app/components/SpreadsheetGrid.tsx` nhưng chỉ phục vụ đúng một nơi
(`app/procurement/_components/InventoryTab.tsx:631`).

**(d) Tick offline bị từ chối biến mất im lặng.** `app/components/offlineQueue/logic.ts:85-88`:
4xx → bỏ khỏi hàng đợi. Người dùng chỉ thấy badge về 0, không biết "5 tick của bạn bị từ chối vì
hold-point QC chưa mở". Ở công trường mất sóng cả buổi thì đây là mất dữ liệu thật mà không ai hay.

| Vai trò           | Không làm được hôm nay                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Kỹ sư hiện trường | Tick 1 tầng (30-200 ô) phải bấm từng ô; tick nhầm không hoàn tác được; tick offline bị từ chối không biết lý do. |
| PM                | Đặt ngày cho 50 task = 50 request, lỗi giữa chừng để lại dữ liệu nửa vời, không biết task nào đã đổi.            |
| Admin             | Không có cách nào sửa nhanh một mảng ô bị import sai (phải bấm lại từng ô hoặc xoá cả cột).                      |

## 2. Outcome, metric và guardrail

**Outcome:** thao tác trên lưới tracking nhanh và an toàn như bảng tính — chọn vùng, tick cả
vùng bằng 1 request, sai thì Ctrl+Z.

| Metric                                     | Baseline             | Target sau M121              |
| ------------------------------------------ | -------------------- | ---------------------------- |
| Số request khi "tick cả hàng" 30 ô         | 30                   | **1**                        |
| Số lần `recomputeTask` cho cùng 1 task/lô  | = số ô               | **1**                        |
| Số request khi đặt ngày hàng loạt 50 task  | 50 (không nguyên tử) | **1** (atomic)               |
| Hoàn tác được thao tác tick vừa rồi        | Không                | 50 bước gần nhất trong phiên |
| Tick offline bị từ chối được báo cho người | Không (im lặng)      | Có, kèm lý do server trả về  |

**Guardrail (dừng/rollback nếu vi phạm):**

- **Không đổi bất kỳ con số `progress_percent`/`work_packages.progress` nào** — M121 chỉ đổi cách
  UI gọi API, không đụng công thức. Test cũ phải xanh nguyên (AC10).
- **Không đổi hợp đồng API**: 2 route batch giữ nguyên request/response/mã lỗi hiện có. Không
  migration, không đổi schema.
- **Không làm thụt lùi mobile**: chọn vùng phải dùng được bằng ngón tay (`pointer events`), không
  chỉ chuột. Vùng chạm giữ ≥44px. Nếu không đạt, cắt tính năng chọn vùng trên mobile chứ **không**
  hạ kích thước ô.
- Hoàn tác **không được** dùng để lách hold-point: undo một thao tác bị server từ chối phải là
  no-op, không phải ghi đè.

## 3. Nghiên cứu hiện trạng

**Đường tick hiện có** (`app/tracking/[sheet]/TrackingGrid.tsx`):

| Hàm           | Dòng    | Hành vi                                                                                                   |
| ------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `toggle`      | 386-436 | Optimistic update → `PATCH /api/dimensions/:id` → rollback + toast nếu 4xx → `onOfflineTick` nếu mất mạng |
| `setAllInRow` | 438-458 | `Promise.all` N request, gom lỗi đầu tiên, `load()` lại toàn nhóm                                         |
| `saveDates`   | 503-525 | Loop `PATCH /api/tasks/:id`, không atomic                                                                 |

**API bulk sẵn có, chưa ai gọi:**

- `PATCH /api/dimensions/batch` — body `{ ids: number[], installed: boolean }`; dedup ids;
  `canTouchTask` từng task; hold-point + BPTC gate theo package (dedup); `ghiDauVetTick` (M120)
  cho cả lô; `recomputeTask` **1 lần/task**; tất cả trong 1 transaction. `MAX_IDS = 1000` → 422.
- `PATCH /api/tasks/batch` — body `{ updates: { id, patch }[] }`; `CAN.editStructure` (Admin/PM);
  validate status theo bất biến M120 `statusConsistentWithProgress`; hold-point gate khi đặt
  `hoan_thanh`; ghi `task_history` khi đổi status thủ công; atomic cả lô. `MAX_UPDATES = 500`.

**Cơ chế có thể tái dùng** (kết luận khảo sát 2026-09-03 — xem §4):

- `lib/tien-do/grid.ts` (thuần, đã có `tests/grid.test.ts`): `normalizeRect(a, b): Rect`,
  `type Rect`, `serializeTSV`, `parseTSV`, `spreadPaste`.
- `app/components/SpreadsheetGrid.tsx`: có undo 50 bước (diff từng ô, `:99-104`, `:230`), chọn
  vùng anchor/active + `extraRects` (`:75-107`), phím tắt Ctrl+Z/Ctrl+Shift+Z (`:420-429`).
  **Chỉ 1 consumer**: `InventoryTab.tsx:631`.

**Hàng đợi offline** (`app/components/offlineQueue/`): `QueueKind = "tick" | "photo" |
"diary_note"`; `TickPayload = { dimId, installed }`; `opEndpoint` (`logic.ts:117`) ánh xạ
`tick → PATCH /api/dimensions/:dimId`; dedup theo `dimId` giữ thao tác mới nhất
(`logic.ts:92-94`); 4xx → **bỏ im lặng** (`logic.ts:85-88`).

**Ràng buộc nghiệp vụ không được phá:** `CAN.editProgress` + `canTouchTask` (subcon chỉ task được
giao) + hold-point M3/M8. Cả 2 route batch đã có đủ — M121 **không đụng** lớp này.

## 4. Phương án

| Phương án                                                                 | Lợi ích                                                                                          | Chi phí/rủi ro                                                                                                                                                                                                                                                                                                                                                                  | Kết luận                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **Không làm**                                                             | 0 rủi ro                                                                                         | 2 API bulk mãi là code chết; kỹ sư tiếp tục bấm từng ô; tick nhầm không sửa nhanh được                                                                                                                                                                                                                                                                                          | Bác                           |
| **A. Nhét `TrackingGrid` vào `SpreadsheetGrid`**                          | "Miễn phí" undo + chọn vùng + copy/paste                                                         | `SpreadsheetGrid` giả định lưới phẳng `rows × columns` **không có id ô**, gom mọi ô cùng hàng thành 1 patch theo `rowKey` → không phát được N `dimension.id`; cột động per-nhóm làm undo stack (lưu chỉ số cột) ghi nhầm cột sau khi thêm/xoá cột; mất rollback hold-point, offline queue, tooltip M120; không có touch → **thụt lùi mobile**; theme "giấy trắng" xung đột dark | **Bác** (khảo sát 2026-09-03) |
| **B. Tái dùng hàm thuần + hook chọn vùng mới, giữ nguyên `TrackingGrid`** | Giữ trọn nghiệp vụ đang có; dùng lại `normalizeRect`/TSV đã có test; kiểm soát được touch/mobile | Phải viết mới tầng selection + undo cho lưới 2 tầng (hàng nhóm/hàng task + cột meta)                                                                                                                                                                                                                                                                                            | **Chọn**                      |
| **C. Chỉ nối API bulk, không làm chọn vùng/undo**                         | Rẻ nhất, đạt ngay metric số request                                                              | Không giải quyết (c) tick nhầm — vấn đề người dùng kêu nhiều nhất; "tick cả hàng" vẫn là nút duy nhất                                                                                                                                                                                                                                                                           | Bác (làm nửa vời)             |

**Quyết định kiến trúc:** theo phương án B. Tách **hook thuần UI** `useVungChon` dùng chung, đặt
ở `app/components/grid/useVungChon.ts`; `TrackingGrid` và (về sau) `SpreadsheetGrid` cùng dùng.
M121 **không** refactor `SpreadsheetGrid` (không đụng `InventoryTab` đang chạy tốt) — chỉ tạo hook
và dùng cho tracking; hợp nhất là việc của đợt sau nếu thấy đáng.

## 5. Scope / non-goals

**Trong scope:**

1. Nối UI vào `PATCH /api/dimensions/batch`: "tick cả hàng" và "tick cả vùng" = **1 request**.
2. Nối UI vào `PATCH /api/tasks/batch`: `saveDates` hàng loạt = **1 request atomic**.
3. Chọn vùng ô dimension bằng chuột **và** chạm; Shift+click mở rộng; Ctrl/Cmd+A chọn cả nhóm.
4. Hoàn tác/làm lại (Ctrl+Z / Ctrl+Shift+Z) cho thao tác tick, 50 bước, phạm vi **1 phiên trình duyệt**.
5. Hàng đợi offline: gộp tick cùng lô thành 1 op `tick_batch`; **báo cho người dùng** khi op bị
   server từ chối (4xx) thay vì bỏ im lặng.
6. Tách `TrackingGrid.tsx` (2424 dòng) — **chỉ mức tách file cơ học**: 4 modal (Photos, PkgDates,
   Comments, History) ra file riêng, không đổi hành vi.

**Non-goals (nói rõ để không bị nhặt thêm khi code):**

- ❌ **Không** copy/paste vùng tick sang/từ Excel trong M121 (TSV đã có sẵn hàm, nhưng ngữ nghĩa
  "dán 1/0 vào ô có id" cần đặc tả riêng: dán vào ô không tồn tại thì làm gì?).
- ❌ **Không** refactor `SpreadsheetGrid`/`InventoryTab` (giữ nguyên, tránh làm hỏng chỗ đang chạy).
- ❌ **Không** đổi công thức %, không đổi schema, không migration.
- ❌ **Không** làm undo xuyên phiên (đóng tab là mất stack) — cần bảng lịch sử thao tác, đợt khác.
- ❌ **Không** đụng `lib/tien-do/recompute.ts` (khác M120) — M121 thuần tầng UI + client.

## 6. User journeys và mọi trạng thái

**J1 — Tick cả vùng (desktop).** Kỹ sư bấm ô đầu, kéo tới ô cuối (hoặc Shift+click) → vùng sáng
lên, thanh trạng thái hiện "12 ô đã chọn" → bấm **Space** hoặc nút "Tick vùng" → 1 request →
optimistic update cả vùng → server trả % mới → cập nhật hàng task.

**J2 — Tick cả vùng (mobile).** Chạm giữ 1 ô → vào chế độ chọn, kéo ngón tay → cùng luồng J1.
Nút "Tick vùng"/"Bỏ tick vùng" hiện ở thanh dưới, cao ≥44px.

**J3 — Hoàn tác.** Sau J1, bấm Ctrl+Z (desktop) hoặc nút "Hoàn tác" → gửi 1 request batch với giá
trị **cũ** của đúng các ô đó → lưới trở lại. Redo bằng Ctrl+Shift+Z.

**Mọi trạng thái phải xử lý:**

| Trạng thái           | Hành vi bắt buộc                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Loading              | Vùng đang gửi: ô mờ + con trỏ chờ, **khoá thao tác mới trên chính vùng đó** (tránh gửi chồng); vùng khác vẫn tick được              |
| Rỗng                 | Chọn vùng không có ô nào có thật (toàn ô `·`) → nút tick **disabled**, không gửi request rỗng                                       |
| Lỗi 4xx (nghiệp vụ)  | Rollback **toàn bộ** vùng về trạng thái trước (lô atomic ở server ⇒ client cũng phải all-or-nothing), toast kèm lý do server trả về |
| Lỗi 422 quá hạn mức  | Vùng > `MAX_IDS` (1000 ô): chặn **ở client trước khi gửi**, báo "Chọn tối đa 1000 ô mỗi lần"                                        |
| Offline              | Xếp 1 op `tick_batch` vào hàng đợi, badge tăng đúng số ô; khi online gửi lại nguyên lô                                              |
| Offline bị từ chối   | Toast + dòng trong panel hàng đợi: "N thao tác bị từ chối: &lt;lý do&gt;", **không** xoá im lặng                                    |
| Unauthorized 403     | Toast "Bạn chỉ được cập nhật task được giao cho mình", rollback vùng                                                                |
| Mất focus/điều hướng | Vùng chọn xoá khi đổi nhóm/đổi sheet/đóng nhóm (không giữ vùng "ma" trỏ tới ô đã unmount)                                           |

## 7. Functional và non-functional requirements

**FR1** — `setAllInRow` gọi `PATCH /api/dimensions/batch` **một lần** với toàn bộ `ids` của hàng,
thay cho `Promise.all` N request. Ô đã đúng trạng thái đích vẫn gửi kèm (server idempotent) để
giữ lô nguyên tử — **không** lọc bớt ở client.

**FR2** — Chọn vùng ô dimension trong **một** `TrackingGrid` (một nhóm): kéo chuột, Shift+click,
Ctrl/Cmd+A (chọn mọi ô của nhóm). Vùng **không** xuyên nhiều nhóm (mỗi nhóm là một component có
lưới riêng — xuyên nhóm là bài toán khác, để đợt sau).

**FR3** — Thao tác trên vùng: "Tick vùng" / "Bỏ tick vùng", mỗi thao tác = **1 request batch**.
Chỉ gửi những ô **có thật** (`cell !== undefined`).

**FR4** — Undo/redo stack 50 bước cho thao tác tick (đơn lẻ lẫn theo vùng). Mỗi mục lưu
`{ dimIds: number[], truoc: boolean[], sau: boolean }`. Undo gửi lại request batch với giá trị
`truoc`; ô nào giá trị `truoc` khác nhau thì tách thành 2 lô (tick / bỏ tick).

**FR5** — Undo **không lách được gate**: nếu server từ chối lô undo (409 hold-point), giữ nguyên
trạng thái hiện tại + toast, và **không** pop mục đó khỏi stack (để người dùng thử lại sau khi mở gate).

**FR6** — `saveDates` với nhiều `ids` gọi `PATCH /api/tasks/batch` một lần. Một `id` vẫn dùng
`PATCH /api/tasks/:id` như cũ (không đổi đường đang chạy tốt).

**FR7** — Hàng đợi offline thêm loại op `tick_batch` với payload `{ dimIds: number[], installed:
boolean }` → `PATCH /api/dimensions/batch`. Dedup: op `tick_batch` mới **thay thế** các op `tick`
đơn lẻ trùng `dimId` đang chờ (thao tác sau thắng, đúng luật dedup hiện có).

**FR8** — Op bị server từ chối (4xx) **phải báo cho người dùng**: giữ lý do lỗi vào bản ghi op,
hiện trong panel hàng đợi + 1 toast khi flush xong. Vẫn xoá khỏi hàng đợi (không kẹt), nhưng có
dấu vết để người dùng biết mà tick lại.

**NFR1 (hiệu năng)** — "Tick cả hàng" 30 ô: từ 30 request xuống 1; thời gian phản hồi cảm nhận
được (optimistic update ngay, không đợi server).

**NFR2 (a11y, NFR3 của M120 vẫn giữ)** — Vùng chọn phải thấy được **không chỉ bằng màu** (viền
đậm + đếm số ô trên thanh trạng thái); mọi nút thao tác vùng có `aria-label` tiếng Việt; điều
hướng vùng bằng bàn phím (Shift+mũi tên) hoạt động; `aria-live="polite"` thông báo "Đã chọn N ô".

**NFR3 (mobile)** — Dùng **Pointer Events** (`onPointerDown/Move/Up`), không phải Mouse Events, để
một đường code chạy cả chuột lẫn chạm. Vùng chạm ô giữ ≥44px như hiện tại. Chạm giữ (long-press
~400ms) mới vào chế độ chọn — tránh cướp thao tác cuộn trang.

**NFR4 (tương thích ngược)** — Không đổi hợp đồng 2 route batch; client cũ (SW cache) vẫn chạy
đúng vì đường `PATCH /api/dimensions/:id` giữ nguyên.

**NFR5 (kích thước file)** — 4 modal (Photos, PkgDates, Comments, History) ra file riêng trong
`app/tracking/[sheet]/modals/`, tách **thuần cơ học**, không đổi một dòng hành vi nào; sau đó
`TrackingGrid.tsx` phải **dưới 1800 dòng**.

> **Sửa mốc 2026-09-03 (từ "< 1500" xuống "< 1800").** Con số 1500 đặt ra trước khi đo. Đo thật:
> 4 modal + type + `compressImage` là 640 dòng, tách hết còn **1780**. Phần dư còn lại là ~30
> handler đóng gói quanh state chung của component (`pkg`, `grid`, `load`, `onChanged`…) và ~1000
> dòng JSX — bóc tiếp phải thiết kế ranh giới prop thật sự, **không còn là tách cơ học**, và đụng
> đúng những hàm mà PR2/PR3 sắp viết lại (`toggle`, `setAllInRow`, `saveDates`). Gộp cả hai việc
> vào một PR chỉ làm tăng rủi ro mà không đem lại gì cho người dùng. Việc bóc sâu hơn tách riêng,
> làm sau khi M121 xong.

## 8. Acceptance criteria

| #    | Given / When / Then                                                                                                                     | Bằng chứng                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| AC1  | Given hàng 30 ô · When bấm "tick cả hàng" · Then đúng **1** request `PATCH /api/dimensions/batch` chứa 30 id                            | E2E (chặn network) + unit     |
| AC2  | Given vùng chọn 12 ô, 3 ô không có thật · When "Tick vùng" · Then request chỉ chứa 9 id có thật                                         | Unit (hàm thuần dựng payload) |
| AC3  | Given vùng 1001 ô · When "Tick vùng" · Then **không gửi request**, toast "Chọn tối đa 1000 ô mỗi lần"                                   | Unit                          |
| AC4  | Given vừa tick vùng 9 ô · When Ctrl+Z · Then 1 request batch đưa đúng 9 ô đó về giá trị trước, lưới khớp                                | E2E + unit stack              |
| AC5  | Given lô tick bị server trả 409 (hold-point) · When nhận lỗi · Then **toàn bộ** vùng rollback về trạng thái cũ, toast hiện lý do server | Unit (giả lập fetch)          |
| AC6  | Given undo bị server từ chối · When nhận 409 · Then mục undo **vẫn còn** trong stack, trạng thái không đổi                              | Unit                          |
| AC7  | Given mất mạng · When tick vùng 9 ô · Then hàng đợi có **1** op `tick_batch` chứa 9 id (không phải 9 op)                                | Unit (offlineQueue thuần)     |
| AC8  | Given op `tick_batch` chờ, rồi tick lại 1 ô trong đó · When dedup · Then op cũ bị thay, không gửi 2 lần giá trị mâu thuẫn               | Unit                          |
| AC9  | Given op bị server trả 4xx khi flush · When flush xong · Then người dùng thấy lý do (toast + panel), op không kẹt lại hàng đợi          | Unit                          |
| AC10 | Given toàn bộ test cũ · When `npm test -- --release-gate` · Then **không ca nào đổi kết quả**; không con số % nào đổi                   | CI                            |
| AC11 | Given lưới trên mobile · When chạm giữ rồi kéo · Then chọn được vùng; cuộn trang vẫn hoạt động khi chạm-kéo thường                      | E2E mobile (Playwright)       |
| AC12 | Given trang tracking · When chạy axe · Then 0 vi phạm mới; thanh vùng chọn có `aria-live`, nút có `aria-label`                          | E2E axe desktop + mobile      |
| AC13 | Given `TrackingGrid.tsx` sau khi tách · When đếm dòng · Then < 1800 dòng (xem ghi chú NFR5) và 4 modal nằm ở file riêng                 | Kiểm tự động trong test       |

## 9. Kiến trúc và điểm chạm code

```
TrackingGrid (1 nhóm)
  ├─ useVungChon()        ← MỚI, hook thuần UI: anchor/active/rect, pointer + bàn phím
  ├─ useLichSuTick()      ← MỚI, hook undo/redo 50 bước (chỉ state, không biết fetch)
  └─ ganTick(dimIds, v)   ← MỚI, hàm gửi: 1 ô → /api/dimensions/:id · nhiều ô → /batch
                              (offline → enqueue tick_batch)
```

| File                                    | Thay đổi                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `app/components/grid/useVungChon.ts`    | **Mới** — state vùng chọn thuần (anchor/active/rect, mở rộng bằng phím), không phụ thuộc dữ liệu lưới |
| `app/components/grid/lichSuTick.ts`     | **Mới** — logic stack undo/redo **thuần** (push/undo/redo/giới hạn 50), test không cần React          |
| `app/tracking/[sheet]/tick.ts`          | **Mới** — dựng payload lô từ vùng chọn (lọc ô không có thật, chặn quá `MAX_IDS`), thuần, test được    |
| `app/tracking/[sheet]/TrackingGrid.tsx` | Nối 3 thứ trên; `setAllInRow`/`saveDates` chuyển sang route batch; thanh trạng thái vùng chọn         |
| `app/tracking/[sheet]/modals/*.tsx`     | **Mới** — tách 4 modal ra khỏi `TrackingGrid.tsx` (cơ học, không đổi hành vi)                         |
| `app/components/offlineQueue/logic.ts`  | Thêm `tick_batch` vào `QueueKind` + payload + `opEndpoint` + luật dedup + giữ lý do lỗi 4xx           |
| `app/components/offlineQueue/index.ts`  | `sendOp` cho `tick_batch`; báo lỗi bị từ chối ra UI                                                   |
| `app/tracking/[sheet]/page.tsx`         | Truyền hàm enqueue lô xuống lưới                                                                      |

**Không đụng:** `lib/tien-do/recompute.ts`, `lib/tien-do/dimension-events.ts`, 2 route batch (đã
đủ), `SpreadsheetGrid.tsx`, `InventoryTab.tsx`, mọi route tài chính/nghiệm thu.

## 10. API contract

**Không thêm/đổi endpoint nào.** M121 chỉ đổi _ai gọi_ và _gọi bao nhiêu lần_.

Dùng nguyên hợp đồng hiện có:

```jsonc
// PATCH /api/dimensions/batch
{ "ids": [12, 13, 14], "installed": true }
// 200 → { ok: true, updated: 3, installed: true }
// 403 canTouchTask · 409 hold-point/BPTC · 422 quá MAX_IDS(1000) hoặc ids rỗng
```

```jsonc
// PATCH /api/tasks/batch  (Admin/PM)
{ "updates": [{ "id": 5, "patch": { "startDate": "2026-09-10", "endDate": "2026-09-20" } }] }
// 200 → { ok: true, updated: 1 } · 422 lỗi nghiệp vụ · 500 khác
```

Client phải tự chặn `ids.length > 1000` **trước khi gửi** (AC3) để không tốn round-trip lấy 422.

## 11. Data contract và DDL

**Không có migration.** M121 không đổi schema, không thêm cột, không đụng dữ liệu.

Dữ liệu duy nhất phát sinh là **state phía client**: undo stack sống trong React state của
`TrackingGrid` (mất khi đóng tab — non-goal §5), và op `tick_batch` trong IndexedDB
(`xboss-offline`/`ops`) — cùng store hiện có, chỉ thêm một `kind` mới. Store dùng
`autoIncrement` nên không cần đổi schema IndexedDB; op cũ (`tick`) vẫn đọc/gửi được bình thường
(NFR4).

## 12. Security/privacy/abuse

- **Không nới quyền**: mọi thao tác vẫn qua 2 route batch đã có `getCurrentUser` + `CAN.editProgress`
  / `CAN.editStructure` + `canTouchTask` từng task + hold-point gate. Client **không** được tự
  quyết ô nào bỏ qua gate.
- **Không tin client về phạm vi**: server tự kiểm từng `id` thuộc task nào và người gọi có quyền
  không — client gửi id lạ sẽ bị 403/404, không phải lỗ hổng.
- **Chặn lạm dụng**: giới hạn `MAX_IDS = 1000` giữ nguyên; client chặn trước để tránh spam request lỗi.
- **Undo không phải cửa hậu**: undo đi đúng route batch với đúng kiểm quyền/gate (FR5).
- **Không log nội dung ghi chú/tên người** ra console khi báo lỗi hàng đợi (giữ NFR5 của M120).

## 13. UX/a11y/content

- Vùng chọn: viền `emerald-400` 2px + nền `emerald-500/10` (emerald = "đang chọn" theo ADR-0009),
  **kèm** đếm số ô trên thanh trạng thái — không truyền tin chỉ bằng màu (NFR2).
- Thanh thao tác vùng nổi ở đáy nhóm khi có vùng chọn: "Đã chọn N ô" + nút "Tick vùng" /
  "Bỏ tick vùng" / "Bỏ chọn" (nút ≥40px theo ADR-0009, dùng `Button` trong `app/components/ui/`).
- Hoàn tác: nút biểu tượng `Undo2`/`Redo2` cạnh nút chế độ sửa, `title` + `aria-label` tiếng Việt
  kèm phím tắt ("Hoàn tác (Ctrl+Z)"). Disabled khi stack rỗng.
- `aria-live="polite"` thông báo "Đã chọn N ô" và "Đã hoàn tác N ô".
- Mọi thông điệp tiếng Việt; toast lỗi giữ nguyên lý do server trả (đã là tiếng Việt).
- Chế độ in: vùng chọn và thanh thao tác **ẩn khi in** (`print-hidden`).

## 14. Observability và vận hành

- Không thêm metric server (không có endpoint mới). Đếm request giảm quan sát được qua log truy cập.
- Client: khi lô bị từ chối, log `console.warn` **không kèm** tên người/ghi chú, chỉ mã lỗi + số ô.
- Runbook: nếu người dùng báo "tick vùng không ăn", kiểm theo thứ tự: (1) hold-point của nhóm,
  (2) vai trò/`canTouchTask`, (3) hàng đợi offline còn op chưa gửi.

## 15. Test plan

| Lớp                       | Nội dung                                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit (thuần, không DB)    | `lichSuTick`: push/undo/redo, giới hạn 50, redo bị xoá khi có thao tác mới · `tick.ts`: dựng payload từ vùng (AC2, AC3) · `useVungChon`: normalizeRect qua các hướng kéo |
| Unit (offlineQueue thuần) | `tick_batch` enqueue/dedup/endpoint (AC7, AC8), giữ lý do lỗi 4xx (AC9)                                                                                                  |
| Integration (Postgres)    | Không thêm mới — 2 route batch đã có test; chạy lại để chứng minh AC10 (không ca nào đổi)                                                                                |
| E2E Playwright desktop    | AC1 (đếm request), AC4 (undo), AC12 (axe)                                                                                                                                |
| E2E Playwright mobile     | AC11 (chạm giữ + kéo chọn vùng; cuộn vẫn chạy), AC12 (axe mobile)                                                                                                        |
| Kiểm tự động              | AC13: `TrackingGrid.tsx` < 1800 dòng, 4 modal ở file riêng                                                                                                               |

## 16. Kế hoạch slice/PR

Thứ tự bắt buộc: **tách file → gộp lô → chọn vùng → undo → offline**. Mỗi PR tự đứng được.

| PR      | Nội dung                                                                                        | `route:`     | Cổng                      |
| ------- | ----------------------------------------------------------------------------------------------- | ------------ | ------------------------- |
| **PR1** | Tách 4 modal khỏi `TrackingGrid.tsx` (cơ học, 0 đổi hành vi) + test AC13                        | `mechanical` | lint/typecheck/build/test |
| **PR2** | `setAllInRow` + `saveDates` chuyển sang route batch (FR1, FR6) + `tick.ts` thuần + AC1-AC3, AC5 | `standard`   | thêm E2E đếm request      |
| **PR3** | `useVungChon` + UI vùng chọn + thao tác vùng (FR2, FR3) + AC11, AC12                            | `complex`    | thêm E2E mobile + axe     |
| **PR4** | `lichSuTick` + undo/redo (FR4, FR5) + AC4, AC6                                                  | `standard`   | như trên                  |
| **PR5** | `tick_batch` trong hàng đợi offline + báo lỗi bị từ chối (FR7, FR8) + AC7-AC9                   | `standard`   | như trên                  |
| **PR6** | Cập nhật `PROGRESS.md` + `docs/nang-cap/README.md`                                              | `mechanical` | —                         |

Ghi chú định tuyến: PR3 là `complex` vì phải tự cân nhắc đánh đổi giữa pointer events, long-press
và cuộn trang trên mobile — ranh giới được phép quyết: cách phát hiện long-press, ngưỡng ms, có
cho vùng xuyên hàng task hay không (mặc định: có, trong cùng nhóm). Các PR còn lại đặc tả đã kín.

## 17. Rollout/rollback

1. **Không migration** → không cần staging cho DB. Vẫn deploy tuần tự từng PR.
2. PR2 (gộp lô) là thay đổi hành vi ghi có rủi ro cao nhất → deploy riêng, theo dõi 1 ngày làm
   việc: đối chiếu 20 task mẫu trước/sau, `progress_percent` phải không đổi.
3. PR3–PR5 deploy tiếp, mỗi bước cách nhau ít nhất 1 ngày làm việc.
4. **Go/no-go:** huỷ đợt nếu (a) bất kỳ con số % nào đổi, (b) tick trên mobile bị chậm/khó hơn
   trước, (c) lô bị từ chối để lại lưới lệch với DB sau khi `load()`.
5. **Rollback:** revert PR — không có dữ liệu nào phải hoàn nguyên. Op `tick_batch` còn kẹt trong
   IndexedDB của máy người dùng sau khi revert sẽ bị server từ chối 404 → bị bỏ khỏi hàng đợi kèm
   thông báo (FR8), không kẹt vĩnh viễn. **Đây là lý do FR8 phải làm trong cùng đợt, không tách ra sau.**

## 18. Risk/assumption/open decisions

| Mục                                                                        | Xác minh/giảm thiểu                                                                                                                   | Owner       | Hạn       | Quyết định                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------- | --------- | --------------------------------------- |
| **D1** Long-press bao nhiêu ms mới vào chế độ chọn trên mobile?            | **400ms** — đủ dài để không cướp thao tác cuộn, đủ ngắn để không thấy ì. Cần thử tay trên máy thật; ranh giới quyết của PR3           | Người dùng  | Trước PR3 | ✅ chốt 2026-09-03: 400ms               |
| **D2** Vùng chọn có được xuyên nhiều hàng task trong cùng nhóm không?      | **CÓ** (đó chính là giá trị chính: tick 1 tầng gồm nhiều task). Xuyên **nhiều nhóm** thì không (mỗi nhóm là component riêng, xem FR2) | Người dùng  | Trước PR3 | ✅ chốt 2026-09-03: có, trong cùng nhóm |
| **D3** Undo giữ trong bao lâu?                                             | **trong phiên trình duyệt**, mất khi đóng tab (non-goal §5). Muốn undo xuyên phiên phải có bảng lịch sử thao tác server — đợt khác    | Người dùng  | Trước PR4 | ✅ chốt 2026-09-03: trong phiên         |
| **R1** Optimistic update cả vùng rồi rollback có nhấp nháy khó chịu không? | Đo trên vùng 200 ô; nếu nháy, đổi sang chỉ mờ vùng đang gửi thay vì đổi trạng thái ngay                                               | Phiên chính | PR3       | ⬜                                      |
| **R2** `SpreadsheetGrid` có bug undo ghi nhầm cột sau khi thêm/xoá cột     | **Không thuộc M121** (bug sẵn có ở `InventoryTab`, khác luồng). Đã ghi nhận để mở việc riêng — M121 không refactor file đó            | Phiên chính | —         | ✅ tách ra                              |
| **A1** Giả định 2 route batch đủ dùng, không phải sửa server               | Đã đọc code 2026-09-03: đủ quyền/gate/atomic/recompute-gộp. Nếu khi code phát hiện thiếu → dừng, báo phiên chính, KHÔNG tự nới server | —           | —         | —                                       |

## 19. Approval

- [x] Product/scope — **D1** long-press 400ms · **D2** vùng chọn xuyên nhiều hàng task trong
      **cùng một nhóm** (không xuyên nhóm) · **D3** undo sống trong phiên trình duyệt
- [x] UX/a11y
- [x] Architecture/API/data
- [x] Security/RBAC/SoD/audit
- [x] Test/telemetry/rollout/rollback
- [x] Không còn blocking question

**Kết luận:** **Approved for implementation**
**Người/ngày duyệt:** Người dùng · 2026-09-03
