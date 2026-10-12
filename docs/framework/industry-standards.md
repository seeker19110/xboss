# Tiêu chuẩn nghiêm ngặt ngành phần mềm — ánh xạ vào khung

> Khung đã có nhiều mảnh của các tiêu chuẩn này rải rác (SAST qua CodeQL, coverage threshold, threat
> model template, SBOM/supply-chain, branch protection...). File này **không lặp lại** những gì đã có —
> chỉ (1) đặt tên tường minh cho đúng tiêu chuẩn ngành đang áp, (2) lấp phần còn thiếu (ASVS level, DAST,
> SOLID có ngưỡng đo được, 12-factor, signed commit, compliance mapping), (3) trỏ về nơi đã có sẵn.
> Đọc khi dự án cần đối chiếu với tiêu chuẩn ngành chính thức (audit khách hàng, bán vào doanh nghiệp,
> chuẩn bị SOC2/ISO, hoặc khi người dùng yêu cầu "làm nghiêm ngặt hơn").

---

## A. Bảo mật — OWASP ASVS + SAST/DAST + threat modeling

**Đã có:** CodeQL (SAST) trong `new-project-runbook.md`; threat model bắt buộc cho
auth/payment/multi-tenant/automation/high-impact ở `standard-delivery.md` §9 (mẫu:
`docs/framework/templates/THREAT-MODEL.template.md`); secret scanning (gitleaks) + push protection ở
`docs/ops/repository-settings.md`.

**Bổ sung — mức ASVS làm mốc đối chiếu** ([OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)):

| Mức | Khi nào áp | Ý nghĩa thực tế cho dự án |
|---|---|---|
| **ASVS L1** | Mặc định cho MỌI dự án có input từ bên ngoài | Validate input runtime (đã có ở `CLAUDE.md` §3.1), auth cơ bản, không lộ thông tin lỗi chi tiết ra client, HTTPS bắt buộc |
| **ASVS L2** | Có tài khoản người dùng, dữ liệu cá nhân, hoặc xử lý giao dịch | Thêm: quản lý phiên đăng nhập chặt (rotate session, logout thu hồi token), phân quyền kiểm ở mọi endpoint (không chỉ ở UI), mã hóa dữ liệu nhạy cảm khi lưu, rate-limit chống brute-force |
| **ASVS L3** | Tài chính, y tế, hạ tầng trọng yếu, hoặc khách hàng yêu cầu | Thêm: threat model bắt buộc cho MỌI thay đổi (không chỉ auth/payment), review mã bởi người thứ hai bắt buộc cho vùng nhạy cảm, pentest định kỳ bởi bên độc lập |

Dự án tự chốt mức ASVS mục tiêu vào `PROJECT.md`/ADR — không mặc định L3 cho mọi thứ (chi phí không tương xứng), nhưng **không được thấp hơn L1**.

**Bổ sung — DAST (Dynamic Application Security Testing):** SAST (CodeQL) chỉ bắt lỗi ở mã tĩnh, không bắt được lỗi cấu hình runtime (header thiếu, CORS sai, TLS yếu). Với dự án có UI/API public:
- Thêm bước quét DAST (vd OWASP ZAP baseline scan) chạy trên môi trường staging trước mỗi release lớn — không chạy trên production.
- Không bắt buộc chạy mỗi PR (chậm) — chạy theo lịch (vd hàng tuần) hoặc trước khi lên ASVS L2 trở lên.

**Bổ sung — quản lý bí mật vượt mức `.env`:** với ASVS L2+, cân nhắc secret vault (Vault/AWS Secrets Manager/Doppler...) thay vì `.env` tĩnh — đặc biệt khi có nhiều môi trường/nhiều người vận hành. Rotation có chủ (owner) + lịch, không "set rồi quên" (khớp `repository-settings.md` §Environments).

---

## B. Chất lượng mã & kiến trúc — SOLID + ngưỡng đo được

**Đã có (rải rác):** DRY + hàm nhỏ (`CLAUDE.md` §3.4); ESLint `complexity` ngưỡng 12 (`code-optimization-audit-prompt.md`); coverage threshold (`quality-supplements.md` mục 4).

**Bổ sung — 5 nguyên tắc SOLID, diễn giải thành luật kiểm được** (không chỉ nêu tên):

1. **Single Responsibility** — một hàm/class/module chỉ nên có một lý do để thay đổi. Kiểm bằng cảm quan lúc review + ngưỡng độ dài: hàm > 50 dòng hoặc file > 300 dòng logic (không tính test/type) là dấu hiệu vi phạm, cần soát lại (không phải cấm cứng — biện minh nếu giữ nguyên).
2. **Open/Closed** — thêm hành vi mới nên mở rộng (thêm case/strategy), không sửa logic đã ổn định đang được nhiều nơi phụ thuộc. Áp dụng khi thêm loại thứ N của một switch/if-else đã có ≥ 3 case — cân nhắc polymorphism/strategy pattern thay vì thêm nhánh thứ N+1.
3. **Liskov Substitution** — subtype/implementation thay thế được cho type cha mà không phá hành vi caller mong đợi. Vi phạm phổ biến: override throw lỗi mà bản gốc không throw, hoặc trả kiểu/hình dạng dữ liệu khác hẳn.
4. **Interface Segregation** — interface/type hẹp, đúng nhu cầu người dùng, không ép implement method không dùng tới.
5. **Dependency Inversion** — module nghiệp vụ phụ thuộc abstraction (interface), không phụ thuộc trực tiếp chi tiết hạ tầng (DB cụ thể, SDK cụ thể) — để test được bằng fake/mock và đổi hạ tầng không phải sửa logic lõi.

**Ngưỡng đo được (thêm vào cổng, không thay ngưỡng coverage đã có):**

| Chỉ số | Ngưỡng mặc định | Công cụ | Vi phạm → |
|---|---|---|---|
| Cyclomatic complexity/hàm | ≤ 12 | ESLint `complexity` (đã có) | Cảnh báo — tách hàm trước khi merge nếu không có lý do rõ |
| Coverage unit test (logic quan trọng) | ≥ 70% (điểm khởi đầu — dự án tự nâng dần) | Vitest coverage (đã có) | Không hạ threshold để né đỏ (`standard-delivery.md` §8 đã cấm) |
| Độ dài hàm | ≤ 50 dòng (khuyến nghị, không chặn cứng) | Review thủ công / `eslint-plugin-sonarjs` | Nêu trong code-review, không tự động chặn merge |
| Trùng lặp mã | Không có khối ≥ 15 dòng lặp y hệt ≥ 3 nơi | `jscpd` hoặc `eslint-plugin-sonarjs` (tùy chọn) | Refactor về hàm dùng chung khi "đụng đâu dọn đó" |

Đây là **ngưỡng mặc định để bắt đầu** — dự án chốt số thật vào `PROJECT.md`, không coi 12/70%/50 là bất biến tuyệt đối cho mọi ngôn ngữ/domain.

---

## C. Vận hành/CI-CD — 12-Factor App + signed commit

**Đã có:** branch protection, required checks, quét rò rỉ bí mật (secret scanning), SBOM/provenance.
Xem `docs/ops/repository-settings.md` và `docs/ops/supply-chain.md` để biết chi tiết.

**Bổ sung — [12-Factor App](https://12factor.net/) cho hồ sơ Backend/API (C4) và mọi service chạy production:**

| # | Yếu tố | Áp dụng trong khung |
|---|---|---|
| I | Codebase | Một repo (hoặc monorepo C10) theo dõi bằng git, nhiều lần deploy từ cùng một codebase |
| II | Dependencies | Khai báo tường minh qua lockfile — không phụ thuộc package cài sẵn trên máy/server |
| III | Config | Cấu hình qua biến môi trường (`.env`, không commit — đã có ở `CLAUDE.md` §3.5), không hardcode theo môi trường |
| IV | Backing services | DB/cache/queue là resource gắn qua URL/config, đổi được không sửa code |
| V | Build/release/run | 3 giai đoạn tách biệt — CI build → release gắn version/tag → run không build lại |
| VI | Processes | Service stateless — trạng thái phiên/cache nằm ở backing service (Redis...), không lưu trong process |
| VII | Port binding | Service tự expose qua port, không phụ thuộc web server ngoài tiêm vào lúc runtime |
| VIII | Concurrency | Scale bằng chạy nhiều process/instance, không phụ thuộc thread bên trong một process duy nhất |
| IX | Disposability | Khởi động nhanh, tắt sạch (graceful shutdown xử lý nốt request đang chạy) |
| X | Dev/prod parity | Môi trường dev gần giống prod nhất có thể (cùng loại DB, cùng version runtime) |
| XI | Logs | Log ra stdout dạng stream có cấu trúc — không tự quản lý file log trong app |
| XII | Admin processes | Tác vụ quản trị (migration, script một lần) chạy như process riêng cùng codebase/config, không sửa tay trên server |

Vi phạm rõ nhất cần tránh: state lưu trong RAM của một instance (mục VI), cấu hình hardcode theo môi trường (mục III), build lẫn với run (mục V).

**Bổ sung — signed commit/tag:**
- Dự án ASVS L2+ hoặc có nhiều người đóng góp không quen biết trực tiếp: **bật "Require signed commits"** (GitHub Settings → Branches) và ký bằng GPG/SSH signing key cho commit lên nhánh chính.
- Release/tag phát hành ra ngoài: **luôn ký** (khớp `supply-chain.md` §Provenance — signing bằng OIDC/identity ngắn hạn khi hỗ trợ).
- Không bắt buộc cho dự án cá nhân/nội bộ nhỏ — chi phí vận hành (mỗi máy dev phải cấu hình key) không tương xứng lợi ích ở quy mô đó; dự án tự chốt vào `PROJECT.md`.

---

## D. Tuân thủ pháp lý/quy chuẩn — GDPR / SOC2 / ISO 27001 (mức tài liệu hóa)

> **Khung này KHÔNG tự cấp/tuyên bố đạt chứng nhận nào** (đúng nguyên tắc "không claim compliance/SLSA
> nếu chưa audit đủ" ở `standard-delivery.md` §9) — mục này chỉ giúp dự án **chuẩn bị đúng artifact**
> để khi cần audit chính thức (khách hàng doanh nghiệp/châu Âu yêu cầu, hoặc chủ động xin chứng nhận),
> không phải bắt đầu từ số 0.

**GDPR (hoặc Nghị định 13/2023 VN — đã nhắc ở `03-tech-selection-and-proactive-advice.md` PHẦN A mục 6):**
đã có cổng cụ thể ở `docs/framework/quality-gates-by-profile.md` (mục "Cổng bổ sung áp cho MỌI hồ sơ có
dữ liệu cá nhân"). Bổ sung 2 artifact còn thiếu khi dự án thực sự thuộc phạm vi GDPR (có người dùng EU)
hoặc tương đương:
- **Data Processing Agreement (DPA)** với mọi bên thứ ba xử lý dữ liệu cá nhân thay bạn (hosting, email, analytics).
- **Data Protection Impact Assessment (DPIA)** cho tính năng xử lý dữ liệu nhạy cảm ở quy mô lớn (đối chiếu threat model đã làm — DPIA là bản mở rộng góc độ quyền riêng tư).

**SOC 2 (Type I/II):** thường được khách hàng doanh nghiệp B2B yêu cầu. Ánh xạ 5 Trust Service Criteria vào phần đã có trong khung:

| Trust Service Criteria | Đã có ở đâu trong khung |
|---|---|
| Security | `repository-settings.md` §Security, ASVS ở mục A file này |
| Availability | Health-check/rollback (`quality-gates-by-profile.md` §C4), incident response (`docs/ops/incident-response.md`) |
| Processing integrity | Test/cổng chất lượng (`CLAUDE.md` §5–§7), migration có rollback |
| Confidentiality | Secret management, mã hóa lưu trữ (mục PII ở `quality-gates-by-profile.md`) |
| Privacy | Mục GDPR ở trên |

SOC 2 **Type II** đòi hỏi bằng chứng kiểm soát hoạt động ổn định qua **thời gian** (thường 3–12 tháng), không phải một lần audit — nghĩa là các log/evidence ở `repository-settings.md` §Evidence phải được **duy trì liên tục**, không chỉ điền một lần rồi bỏ.

**ISO 27001:** khung nặng hơn SOC 2 (toàn bộ Information Security Management System — ISMS, không chỉ kiểm soát kỹ thuật). Dự án cần ISO 27001 thật sự nên có tư vấn/audit chuyên trách riêng — khung này chỉ đảm bảo phần **kiểm soát kỹ thuật (Annex A)** đã có nền: access control, cryptography, secure development (đã có ở mục A/B file này), supplier relationship (đã có ở `supply-chain.md`), incident management (`docs/ops/incident-response.md`).

**Khi nào bắt buộc phải làm mục D này:** chỉ khi dự án **thực sự** cần (khách hàng yêu cầu, xử lý dữ liệu EU/quy định VN, bán vào doanh nghiệp) — không áp mặc định cho mọi dự án nhỏ, chi phí duy trì evidence liên tục không tương xứng nếu không cần. Quyết định áp hay không → ghi ADR.

---

## Cách dùng file này

- Đọc **một lần** khi dự án nâng mức nghiêm ngặt (khách hàng yêu cầu, chuẩn bị audit, hoặc người dùng
  yêu cầu "áp tiêu chuẩn ngành nghiêm ngặt hơn").
- Không áp máy móc cả 4 mục cho mọi dự án — mục A (ASVS L1) là sàn tối thiểu cho mọi dự án có input
  ngoài; các mục còn lại **chọn theo nhu cầu thật**, ghi quyết định vào ADR/`PROJECT.md`.
- Khi một mục ở đây đã đủ chi tiết để trở thành cổng bắt buộc, đưa **con số cụ thể** đó vào
  `CLAUDE.md` §5–§6 hoặc `quality-gates-by-profile.md` đúng hồ sơ — file này giữ vai trò **bản đồ tiêu
  chuẩn ngành**, không phải nơi thi hành cổng.
