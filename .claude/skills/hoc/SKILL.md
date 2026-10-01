---
name: hoc
description: Biến một bài học vừa rút ra trong phiên (lỗi lặp lại, bẫy, quy ước mới phát hiện, cách làm hiệu quả) thành tri thức BỀN trong repo XBoss — đúng chỗ (docs/audit.md, TRAPS.md, rule path-scoped, skill mới, cổng CI mới, CLAUDE.md) và có commit. Dùng khi vừa sửa xong một lỗi không tầm thường, khi người dùng phải nhắc lại cùng một điều lần thứ 2, khi review bắt được thứ agent đáng lẽ phải biết, hoặc khi người dùng gõ /hoc. Bản XBoss của ecc /learn + continuous-learning (ECC lưu ở ~/.claude — mất khi container cloud bị thu hồi).
---

# /hoc — ghi bài học vào repo (XBoss)

Nguyên tắc của dự án (đúc kết qua nhiều đợt, xem PROGRESS.md "Đợt 5/6"): **viết luật vào văn bản
là CHƯA ĐỦ** — lớp lỗi đã lặp phải thành **cổng tự động** mới hết lặp. Skill này chọn mức bền
nhất mà bài học xứng đáng.

## Bước 1 — Rút bài học (trả lời ngắn, có bằng chứng)

1. Chuyện gì đã sai / tốn công? (file:dòng, lệnh, thông báo lỗi thật)
2. Nguyên nhân gốc là gì — không phải triệu chứng.
3. Luật chuyển giao được: "Khi <tình huống>, phải <làm gì>, vì <hệ quả nếu không>".
4. Đã lặp mấy lần? (grep `PROGRESS.md`, `TRAPS.md`, `docs/audit.md`, `git log --grep`)

## Bước 2 — Chọn nơi lưu (mức cao nhất mà bài học đủ điều kiện)

| Điều kiện                                 | Nơi lưu                                                                                                                   | Ghi chú                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Máy kiểm được **và** đã lặp ≥ 2 lần       | Cổng mới `scripts/check-<ten>.ts` + logic ở `scripts/lib/` + test fixture (mẫu `check-test-fk-ids`) + bước trong `ci.yml` | Sửa `ci.yml` sẽ bị hook hỏi người dùng — đúng chủ đích |
| Bẫy nghiệp vụ đã gây lỗi thật             | `TRAPS.md` (mục mới: chuyện gì, vì sao, cách tránh) + dòng checklist `docs/audit.md` §3–§7                                | Kèm test hồi quy nếu chưa có                           |
| Quy ước chỉ đúng cho một vùng file        | `.claude/rules/xboss/<vung>.md` (frontmatter `paths`)                                                                     | Rẻ ngữ cảnh: chỉ nạp khi chạm file khớp                |
| Quy trình nhiều bước lặp lại              | Skill mới `.claude/skills/<ten>/SKILL.md`                                                                                 | Mô tả nói rõ KHI NÀO dùng                              |
| Mâu thuẫn mới phát hiện giữa ECC và XBoss | Thêm điểm vào `.claude/rules/00-uu-tien-ecc.md`                                                                           | Không sửa file `ecc-*` (bị chặn)                       |
| Quy ước toàn dự án, ngắn                  | `CLAUDE.md`                                                                                                               | **Hỏi người dùng trước** — file này nạp vào mọi phiên  |
| Quyết định kiến trúc                      | ADR mới `docs/adr/00NN-*.md` (mẫu `0000-template.md`)                                                                     |                                                        |

Không lưu: điều đọc code là thấy, chuyện một lần, sở thích cá nhân chưa được người dùng xác nhận.

## Bước 3 — Đề xuất rồi mới ghi

Trình bày: bài học (3 dòng) · nơi lưu + lý do chọn mức đó · diff dự kiến. Ghi file sau khi người
dùng đồng ý (trừ khi họ đã bảo "cứ ghi"). Ghi xong:

- Thêm 1 dòng vào `PROGRESS.md` (mục đợt hiện tại): "Bài học → <nơi lưu>".
- Cổng CI mới: chứng minh cổng ĐỎ trên đoạn vi phạm dựng sẵn trước khi tin nó xanh.
- Commit cùng PR đang mở (quy ước CLAUDE.md), prefix `docs:`/`chore:`/`ci:` phù hợp.
