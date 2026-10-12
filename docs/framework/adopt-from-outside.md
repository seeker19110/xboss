# Học từ repo / khung / skill BÊN NGOÀI — phương pháp ba cột

> Dùng khi: người dùng đưa một repo, một bộ skill, một bài viết "best practice" và bảo *"lấy cái hay của nó
> về"*; hoặc khi bạn tự thấy một công cụ hay và định mang vào. Đọc file này **trước khi chép một dòng nào**.

## 0. Vì sao cần luật riêng cho việc này

Chép một thực hành hay vào một repo **đã có thực hành đó** không phải là "thừa một chút" — nó là một
**nguồn lệch mới**: hai chỗ nói cùng một luật, hai sổ phải khớp nhau bằng tay, và tới lúc chúng lệch thì
không ai biết chỗ nào đúng. Với repo khung, rủi ro còn cao hơn: khung là thứ được **chép sang nhiều dự án**,
nên một luật thừa nhân bản theo.

Rủi ro ngược lại cũng thật: bỏ qua một thứ hay chỉ vì "trông quen quen", hoặc vì "chưa gặp sự cố nào". Ba cột
dưới đây tách hai ca đó ra.

## 1. Ba cột — bắt buộc điền đủ

Với **mỗi** hạng mục của nguồn ngoài, xếp vào đúng một cột:

| Cột | Nghĩa | Việc phải làm |
|---|---|---|
| **Đã có và SÂU HƠN** | ở đây đã có, và bản ở đây mạnh hơn | không lấy gì; ghi một câu *mạnh hơn ở chỗ nào* |
| **Đã có nhưng NÔNG HƠN** | cùng ý, bản ở đây yếu hơn ở một điểm **cụ thể** | chỉ lấy **đúng điểm đó**, không lấy cả hạng mục |
| **CHƯA CÓ** | không có gì tương đương | lấy khi chứng minh được **tốt hơn bản hiện có** theo §2 |

Không có cột "hay quá, lấy luôn". Một hạng mục không xếp được vào cột nào nghĩa là bạn chưa hiểu nó hoặc
chưa hiểu repo mình — đọc tiếp, đừng chép.

## 2. Cổng cho cột "CHƯA CÓ" và "NÔNG HƠN": phải **tốt hơn bản hiện có**, chứng minh được

> Luật từ 2026-10-12 (chủ repo quyết): **không cần có sự cố mới được lấy** — một hạng mục chỉ cần **tốt hơn
> bản hiện có** là cập nhật. Bản trước (2026-09-14 → 2026-10-11) đòi "phải ứng với một sự cố thật"; lý do đổi:
> cổng đó chặn luôn cả cải tiến thật — thứ bắt được lớp lỗi *trước khi* nó xảy ra, hoặc làm cùng việc rẻ hơn.

Trả lời được câu này thì lấy:

> So với **bản đang chạy ở đây** (cổng/script/luật hiện có, hoặc "không có gì" nếu cột CHƯA CÓ), hạng mục này
> **tốt hơn ở điểm nào, đo/kiểm được bằng cách nào**?

"Tốt hơn" phải **cụ thể và bác lại được** — ít nhất một trong các dạng sau, ghi rõ dạng nào:

- **Bắt thêm một lớp lỗi** bản hiện có bỏ lọt (nêu được ca cụ thể bản hiện có cho qua; sự cố thật trong
  `TRAPS.md`/bug đã ghi/PR làm lại/phát hiện audit là bằng chứng **mạnh nhất**, nhưng không bắt buộc).
- **Cùng kết quả, ít hơn**: ít code/bước/cấu hình/dependency/việc bảo trì hơn (thang `CLAUDE.md` §3.4, bậc 2 §3d).
- **Kiểm được hơn**: biến một luật chỉ có văn xuôi thành cổng máy, hoặc bằng chứng rẻ/rõ hơn.
- **Nhanh/rẻ hơn** đo được (thời gian, token, chi phí) khi ba điểm trên hoà.

**"Tốt hơn" là tốt hơn RÒNG:** trừ đi những gì nó mang thêm vào — một luật nữa phải nhớ, một file nữa phải đồng bộ,
một dependency, một bước vận hành. Thứ chỉ *trông* hay nhưng cộng thêm nặng mà không bắt thêm lỗi, không bớt việc,
không kiểm được hơn → **không tốt hơn**. "Thực hành tốt mà", "repo kia có", "sớm muộn cũng cần" vẫn **không** là
lý do — đó là cảm tính, không phải phép so sánh với bản hiện có.

Không chứng minh được tốt hơn (hoặc chưa đo được) → xếp **"chưa cần"**, ghi rõ lý do, và ghi luôn **điều kiện
xem lại** (vd *"xem lại khi số lệnh > 5"*, *"khi có ca đo được"*). "Chưa cần" không phải "không bao giờ" — nó là
một quyết định có hạn dùng.

**Riêng repo KHUNG (`projects-template`):** "tốt hơn" được tính cả cho **dự án đích** mà khung phục vụ, không chỉ
cho repo khung — khung tồn tại để đóng gói cải tiến **trước khi** dự án đích cần tới. Nhưng vẫn phải chỉ ra tốt
hơn ở đâu, bằng gì — "về lý thuyết thì tốt" vẫn không đủ.

## 3. Luật quan trọng nhất: **grep CỔNG ĐANG CHẠY, đừng đọc văn xuôi**

Đây là chỗ trượt đắt nhất, và nó trượt theo cách rất thuyết phục.

Tài liệu mô tả vấn đề thường **cũ hơn** cổng đã bịt vấn đề đó. Bạn đọc một câu kiểu *"ba lối thoát này không
có trần, không ai đếm lại"*, tin rằng chỗ đó còn trống, rồi xây lại thứ đã có — trong khi bản có sẵn còn mạnh
hơn bản bạn đang viết.

Trước khi kết luận "chưa có", chạy **cả ba** kiểu tìm dưới đây, không chỉ kiểu đầu:

```bash
# 1. Tên khái niệm trong tài liệu — KHÔNG đủ để kết luận, chỉ để định hướng
grep -ril "<khái niệm>" --exclude-dir=.git .

# 2. CỔNG: test/script/job CI đang thực thi luật đó — đây mới là câu trả lời
grep -rn "def test_\|^[a-z_]*()" --include='*.py' --include='*.sh' . | grep -i "<khái niệm>"
ls .github/workflows/ && grep -n "^  [a-z-]*:" .github/workflows/*.yml

# 3. Hằng số/sổ mà cổng đó so — thứ hay nằm ở file test, không nằm ở tài liệu
grep -rn "BASELINE\|TRAN_\|THRESHOLD\|fail_under\|ceiling" --exclude-dir=.git .
```

Quy tắc rút gọn: **tài liệu nói "chưa có" chỉ là giả thuyết; một lần `grep` ra cổng đang chạy mới là dữ kiện.**
Và nếu phát hiện tài liệu nói sai (luật đã có cổng mà văn xuôi vẫn bảo chưa), **đó là một phát hiện phải ghi
lại** — chính câu văn đó sẽ lừa người tiếp theo.

## 4. Kiểm tra mâu thuẫn luật, không chỉ kiểm trùng lặp

Một hạng mục có thể **chưa có** mà vẫn **không được lấy**, vì nó ngược với một luật đang có hiệu lực. Ví dụ
thật: một khung có kỹ năng "phỏng vấn dồn dập để làm rõ yêu cầu trước khi code"; một repo khác có luật "khi
bối rối thì nêu giả định rồi đi tiếp, chỉ dừng hỏi trong 4 trường hợp". Hai thứ đều hợp lý, nhưng lấy cái
trước vào repo sau là **cấy một mâu thuẫn luật** — và AI đọc luật sẽ chọn ngẫu nhiên tuỳ phiên.

Nên với mỗi hạng mục sắp lấy, hỏi thêm: *luật nào đang có ở đây sẽ nói ngược với nó?* Có → không lấy, hoặc
đưa mâu thuẫn ra cho người dùng quyết, đừng tự hoà giải trong im lặng.

## 5. Đầu ra bắt buộc

Một **bản đối chiếu** lưu lại (`docs/reports/<ngày>-doi-chieu-<nguồn>.md` hoặc tương đương), gồm:

- ba bảng theo ba cột, **mỗi dòng một câu lý do** — viết đủ để người khác **bác lại được**;
- cột "chưa cần" ghi kèm điều kiện xem lại;
- danh sách thứ **thực sự lấy** — thường rất ngắn;
- mọi **đính chính giữa chừng** giữ nguyên trong văn bản, không xoá dấu vết. Một ứng viên bị chính phép đo
  của mình loại bỏ là **kết quả**, không phải thất bại cần giấu.

Không có con số "đúng" phải đạt: lấy 0 hay lấy 10 đều hợp lệ nếu mỗi dòng có phép so sánh với bản hiện có.
Dấu hiệu phương pháp bị bỏ là ở **lý do**, không ở số lượng: một dòng "chưa có" mà `grep` ra cổng đang chạy (§3
bị bỏ), hoặc một dòng "lấy" chỉ ghi "hay" mà không nói tốt hơn ở điểm nào (§2 bị bỏ).

## 6. Cạm bẫy đã mắc

- **Đọc văn xuôi mô tả vấn đề rồi tin là chỗ đó còn trống** (§3). Bẫy đã mắc thật: thứ định "bổ sung" hoá ra
  đã có cổng thật đang chạy, và bản có sẵn mạnh hơn.
- **Loại một ứng viên sau khi NGHĨ, thay vì sau khi ĐO.** Ngược lại cũng vậy: một bộ dò tưởng hay, đo thử
  trên repo thật thì ra 42 kết quả mà gần như toàn bộ là dương tính giả. Đo trước khi kết luận, cả hai chiều.
- **Chép cả hạng mục khi chỉ nông hơn một điểm.** Cột 2 tồn tại để chặn đúng việc này.
- **Giấu đính chính.** Sửa bản nháp cho "gọn" làm mất đúng phần có giá trị nhất của bản đối chiếu.
