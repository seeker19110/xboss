# Rà nợ & lộ trình hoàn thiện XBoss — 2026-10-07

Theo yêu cầu chủ dự án "hoàn thiện dự án" → chọn phương án **rà nợ & đề xuất lộ trình, chưa code**.
Tài liệu này chỉ tổng hợp từ nguồn có sẵn, **không** đóng khoản nợ nào và không thay sổ nợ gốc.

Nguồn đã đọc: main `49283cf` (sau #582), issue #572 (N01–N12 + 3 comment checkpoint), issue #570,
`docs/ops/quality-execution-2026-10-06.md`, `docs/nang-cap/AUDIT-2026-09-25/PLAN.md` (S00–S16),
`docs/goals/audit-2026-09-25.md`, `docs/nang-cap/PROJECT-COMPLETION-ROADMAP.md`, `PROGRESS.md`.
Không chạy test/DB/deploy trong lượt rà này; trạng thái "có code" dưới đây là đối chiếu tĩnh
(file/migration tồn tại), **không** phải bằng chứng AC đạt.

## 1. Ảnh chụp hiện trạng

- **Không còn PR mở.** 7 PR nguồn (#562/#565/#566/#567/#568/#569/#571) đã vào main qua #574
  (`c838a12`), bản bổ sung guard credential #576 đã merge; CI push main `37494895895` PASS.
- Đợt bump dependency 07/10 (#577–#582) đã merge; Sentry 11 cần import từ `@sentry/nextjs/config`.
- **Production chưa nhận bản mới kể từ #560.** Deploy main `c838a12` (run `37495572230`) dừng ở
  preflight: không đọc được `/etc/xboss/migrate.env` (#570). Host key VPS cũng chưa ghim độc lập
  (`VPS_SSH_KNOWN_HOSTS` không khả dụng, workflow còn fallback `ssh-keyscan`).
- Migration mới nhất: `0158_role_permissions_org_scope.sql`.

## 2. Phân loại 12 khoản nợ (#572)

Cột **Ai mở khoá** là điểm mấu chốt: phần "Code" làm được trong phiên Claude + CI; phần
"Môi trường"/"Owner" không code nào thay được.

| Mã  | Nội dung                             | Trạng thái                             | Ai mở khoá                       |
| --- | ------------------------------------ | -------------------------------------- | -------------------------------- |
| N01 | Executor/agent thật nhận việc        | Mở được ngay                           | Phiên Claude Code (có subagent)  |
| N02 | Full CI trên HEAD tích hợp           | Coi như đạt (#574/#576 PASS)           | Chỉ cần ghi nhận trong #572      |
| N03 | Review độc lập bản vá deploy         | Thiếu review thật                      | Reviewer (audit-bao-mat + người) |
| N04 | Tích hợp các PR chưa vào main        | **Đã xong** qua #574                   | Đóng trong #572                  |
| N05 | Credential migrator trên VPS         | BLOCKED_ENV                            | **Người vận hành VPS**           |
| N06 | Scope/quyền/DB (S00–S03, S02a–c)     | Một phần                               | Code                             |
| N07 | Offline an toàn (S04–S08)            | S04 một phần, S05+ chưa có             | Code + thiết bị iOS thật         |
| N08 | Tiền exact, báo cáo, chuỗi (S09–S13) | Helper exact có, caller chưa chuyển    | Code                             |
| N09 | Backup/restore đầy đủ (S14)          | Manifest + smoke có; PITR/WAL/key chưa | Code + **môi trường**            |
| N10 | Đồng bộ tài liệu                     | Liên tục                               | Code                             |
| N11 | Final QA 54 AC                       | Chờ N06–N09                            | Reviewer độc lập                 |
| N12 | Phát hành + rollout D09              | Chờ N05, N11                           | **Vận hành + owner**             |

## 3. Đối chiếu tĩnh 17 bước PLAN

| Bước | Nội dung                         | Dấu vết trên main                                          | Đánh giá     |
| ---- | -------------------------------- | ---------------------------------------------------------- | ------------ |
| S00  | Inventory/baseline               | Chỉ có inventory payment (`S00-PAYMENT-…`, còn NOT_MAPPED) | Một phần     |
| S01  | Resolver/cache quyền theo org    | `0158_role_permissions_org_scope`, CAN chặn khi chưa nạp   | Một phần     |
| S03  | Transaction/RLS, tách migrate    | #563 tách credential migrate; RLS app role chưa nghiệm thu | Một phần     |
| S02  | Chuyển caller (~86 null-as-wide) | Vài route payment (#567/#568), quản trị dự án (#562)       | Mới bắt đầu  |
| S04  | Cache nhạy cảm + purge           | #560 purge ACK + quarantine queue cũ                       | Gần xong     |
| S05  | Device/context/vault key         | Chưa có bảng `offline_devices`/`offline_vault_keys`        | Chưa làm     |
| S06  | Receipt/precondition             | —                                                          | Chưa làm     |
| S07  | Queue vault + IndexedDB          | —                                                          | Chưa làm     |
| S08  | UI phục hồi + browser            | —                                                          | Chưa làm     |
| S09  | Money exact + golden             | `lib/nen/money.ts` có bộ `*Exact`; golden IPC chưa thấy    | Một phần     |
| S10  | SQL/DTO/UI/export tiền           | Chưa có caller `decimal-string-v1`                         | Chưa làm     |
| S11  | Canonical cost report            | —                                                          | Chưa làm     |
| S12  | Portfolio task-weighted          | —                                                          | Chưa làm     |
| S13  | Chain & IPC                      | #557, #558 (vá hẹp)                                        | Một phần nhỏ |
| S14  | PITR/manifest/verifier           | #564 manifest, #566 archive, #569 smoke Postgres           | Một phần     |
| S15  | Final audit                      | —                                                          | Chờ          |
| S16  | Production                       | Chặn bởi N05                                               | Chặn         |

Ước lượng thô: phần code còn lại ≈ **25–35 PR nhỏ** (mỗi PR một boundary theo PLAN), nặng nhất
là S02 (chuyển caller) và S05–S08 (offline vault).

## 4. Lộ trình đề xuất

Giữ thứ tự phụ thuộc của PLAN, nhưng ưu tiên **giá trị cho người dùng + gỡ chặn production** trước.

### Đợt 0 — Gỡ chặn phát hành (song song, phần lớn KHÔNG phải code)

1. **[Vận hành]** Tạo `/etc/xboss/migrate.env` (mode 0600, owner tài khoản deploy, role migrator
   riêng), cấu hình secret `VPS_SSH_KNOWN_HOSTS` từ nguồn tin cậy → chạy lại deploy đúng SHA main.
   Đây là việc duy nhất đưa ~2 tuần sửa lỗi (#561–#582) tới người dùng thật.
2. **[Code, nhỏ]** Bỏ fallback `ssh-keyscan` trong `deploy.yml` khi đã có host key ghim.
3. **[Sổ nợ]** Cập nhật #572: đóng N04, ghi N02 đạt cho `c838a12`/`d79e8ae`.

### Đợt 1 — Phạm vi dữ liệu (N06) — rủi ro bảo mật cao nhất còn lại

S00 hoàn tất inventory theo miền → S01 xong resolver → S03 RLS app role → S02a (tài chính/
nghiệm thu) → S02b (tracking/vật tư/ảnh/nhật ký) → S02c (portfolio/export/cron/API key).
Mỗi PR: inventory miền + test âm khác org/dự án/parent lệch. Route: `complex` (S01/S03), `spec` (S02).

### Đợt 2 — Tiền & báo cáo (N08)

S09 golden IPC → S10 theo miền (costs → contracts/IPC/payment → còn lại) → S11 → S12 → S13.
Bắt buộc `audit-logic`; không đổi parser toàn cục, không reprice lịch sử.

### Đợt 3 — Phục hồi (N09)

S14: verifier PITR/WAL + attachments + key trên disposable, đo RPO/RTO thật. Có thể chạy song
song Đợt 1–2 (khác file). Diễn tập trên snapshot thật cần quyền vận hành.

### Đợt 4 — Offline an toàn (N07) — lớn nhất, có thể hoãn

S05 → S06 → S07 → S08. Hiện queue offline đang **khoá** (an toàn). Nếu công trường chưa cần lưu
offline ngay, đề xuất hoãn đợt này sau v1.0 để rút ngắn đường tới release.

### Đợt 5 — Nghiệm thu & phát hành (N11, N12)

S15 final audit 54 AC trên một release SHA → S16 rollout D09 (pilot 48h → 25%/24h → mở rộng,
theo dõi 7 ngày) do vận hành + owner thực hiện.

## 5. Quyết định cần chủ dự án

1. **Ai làm N05** (người có quyền VPS) và khi nào — không có nó thì mọi đợt code chỉ nằm ở main.
2. **Offline (Đợt 4) vào v1.0 hay hoãn?** Hoãn rút bớt ~8–12 PR khỏi đường găng.
3. **Bắt đầu Đợt 1 từ đâu:** đề xuất S00 inventory miền tài chính/nghiệm thu rồi S02a, vì đã có
   nền #567/#568 và là vùng rủi ro §8.
4. Có tiếp tục quy ước **merge ngay khi CI xanh** cho các PR vùng §8 không, hay cần thêm review
   người trước khi merge (N03 vẫn thiếu review độc lập)?
