// scripts/membership-dry-run.ts — Membership dry-run TRƯỚC khi bật XBOSS_STRICT_MEMBERSHIP
// (A1-FR03, AUDIT-S16). Liệt kê theo tổ chức: user non-admin chưa có membership, số dự án họ
// đang thấy nhờ nhánh legacy "bảng user_projects rỗng = thấy cả org", tổng số user sẽ MẤT quyền
// xem khi bật cờ, và org chưa có dòng gán nào.
//
// CHỈ ĐỌC: mọi câu chạy trong 1 transaction BEGIN READ ONLY; không ghi/xoá/đổi schema; không in
// mật khẩu/hash. An toàn chạy trên production (người vận hành được cấp quyền chạy).
//
// Chạy:  DATABASE_URL=<chuỗi kết nối> npm run membership:dry-run            (bảng chữ)
//        DATABASE_URL=<chuỗi kết nối> npm run membership:dry-run -- --json  (JSON)
// Runbook: docs/nang-cap/AUDIT-S16-MEMBERSHIP-CUTOVER.md.
import "./env";
import { dinhDangBang, thuThapMembershipDryRun } from "./lib/membership-dry-run";

async function main() {
  const kq = await thuThapMembershipDryRun();
  console.log(process.argv.includes("--json") ? JSON.stringify(kq, null, 2) : dinhDangBang(kq));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
