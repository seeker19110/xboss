// scripts/lib/membership-dry-run.ts — lõi CHỈ ĐỌC của `npm run membership:dry-run` (A1-FR03,
// AUDIT-S16). Tách khỏi CLI để test gọi thẳng và đếm SQL.
//
// Trả lời đúng câu hỏi trước khi bật XBOSS_STRICT_MEMBERSHIP: "ai sẽ MẤT quyền xem?". Luật
// hiện hành (lib/ha-tang/projects.ts visibleProjectIds, cờ tắt): non-admin thấy dự án được gán
// trong `user_projects` CÙNG tổ chức; riêng khi bảng `user_projects` rỗng TOÀN HỆ thì thấy mọi
// dự án cùng tổ chức (nhánh legacy). Bật cờ = bỏ nhánh legacy. Vì vậy:
//   - bảng rỗng toàn hệ  → mọi non-admin của org có ≥1 dự án đang thấy nhờ legacy → sẽ mất quyền;
//   - bảng đã có dòng     → nhánh legacy đã tắt sẵn, bật cờ không làm ai mất thêm quyền xem
//                           (user 0 membership vẫn được liệt kê để chủ dự án rà gán).
// Membership trỏ dự án KHÁC org không tính (giống visibleProjectIds).
//
// Không đọc password_hash/totp_* — chỉ id, email, vai trò.
import { query, withTransaction } from "@/lib/db";

export type DryRunUser = {
  id: number;
  email: string;
  role: string;
  /** Số dự án user đang thấy NHỜ nhánh legacy (0 nếu bảng user_projects đã có dòng). */
  duAnDangThayNhoLegacy: number;
  /** Bật cờ thì user này không còn thấy dự án nào. */
  seMatQuyen: boolean;
};

export type DryRunOrg = {
  id: number;
  name: string;
  soDuAn: number;
  /** Số dòng user_projects trỏ dự án của org này. */
  soMembership: number;
  /** Non-admin của org không có membership nào trong org. */
  userKhongMembership: DryRunUser[];
};

export type DryRunKetQua = {
  thoiDiem: string;
  bangUserProjectsRongToanHe: boolean;
  tongMembership: number;
  tongUserSeMatQuyen: number;
  /** Org chưa có dòng user_projects nào trỏ dự án của mình. */
  orgKhongCoMembership: { id: number; name: string }[];
  orgs: DryRunOrg[];
};

export async function thuThapMembershipDryRun(): Promise<DryRunKetQua> {
  return withTransaction(
    async () => {
      const [{ n }] = await query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM user_projects`);
      const bangRong = Number(n) === 0;
      const orgRows = await query<{
        id: number;
        name: string;
        soDuAn: number;
        soMembership: number;
      }>(
        `SELECT o.id, o.name,
                (SELECT COUNT(*) FROM projects p WHERE p.org_id = o.id)::int AS "soDuAn",
                (SELECT COUNT(*) FROM user_projects up
                   JOIN projects p ON p.id = up.project_id
                  WHERE p.org_id = o.id)::int AS "soMembership"
           FROM organizations o
          ORDER BY o.id`,
      );
      const userRows = await query<{ id: number; orgId: number; email: string; role: string }>(
        `SELECT u.id, u.org_id AS "orgId", u.email, u.role
           FROM users u
          WHERE u.role <> 'admin'
            AND NOT EXISTS (SELECT 1 FROM user_projects up
                              JOIN projects p ON p.id = up.project_id
                             WHERE up.user_id = u.id AND p.org_id = u.org_id)
          ORDER BY u.org_id, u.id`,
      );

      const orgs: DryRunOrg[] = orgRows.map((o) => {
        const thay = bangRong ? Number(o.soDuAn) : 0;
        return {
          id: o.id,
          name: o.name,
          soDuAn: Number(o.soDuAn),
          soMembership: Number(o.soMembership),
          userKhongMembership: userRows
            .filter((u) => u.orgId === o.id)
            .map((u) => ({
              id: u.id,
              email: u.email,
              role: u.role,
              duAnDangThayNhoLegacy: thay,
              seMatQuyen: thay > 0,
            })),
        };
      });
      return {
        thoiDiem: new Date().toISOString(),
        bangUserProjectsRongToanHe: bangRong,
        tongMembership: Number(n),
        tongUserSeMatQuyen: orgs.reduce(
          (s, o) => s + o.userKhongMembership.filter((u) => u.seMatQuyen).length,
          0,
        ),
        orgKhongCoMembership: orgs
          .filter((o) => o.soMembership === 0)
          .map((o) => ({ id: o.id, name: o.name })),
        orgs,
      };
    },
    { readOnly: true },
  );
}

/** Bảng chữ cho người vận hành/chủ dự án đọc. */
export function dinhDangBang(kq: DryRunKetQua): string {
  const dong: string[] = [];
  dong.push("=== Membership dry-run (CHỈ ĐỌC — không ghi gì vào DB) ===");
  dong.push(`Thời điểm: ${kq.thoiDiem}`);
  dong.push(
    `Bảng user_projects: ${kq.tongMembership} dòng — ` +
      (kq.bangUserProjectsRongToanHe
        ? "RỖNG toàn hệ → nhánh legacy ĐANG mở quyền theo tổ chức."
        : "đã có dòng → nhánh legacy đã tắt, bật cờ không làm ai mất thêm quyền xem."),
  );
  for (const o of kq.orgs) {
    dong.push("");
    dong.push(
      `--- Org #${o.id} ${o.name} — ${o.soDuAn} dự án, ${o.soMembership} dòng gán, ` +
        `${o.userKhongMembership.length} user non-admin chưa được gán`,
    );
    if (o.userKhongMembership.length === 0) continue;
    dong.push(`${"Email".padEnd(40)}${"Vai trò".padEnd(10)}${"Đang thấy".padStart(10)}  Bật cờ`);
    for (const u of o.userKhongMembership)
      dong.push(
        `${u.email.padEnd(40)}${u.role.padEnd(10)}${String(u.duAnDangThayNhoLegacy).padStart(10)}  ` +
          (u.seMatQuyen ? "MẤT quyền xem" : "không đổi"),
      );
  }
  dong.push("");
  dong.push(`Tổng user sẽ MẤT quyền xem khi bật XBOSS_STRICT_MEMBERSHIP: ${kq.tongUserSeMatQuyen}`);
  dong.push(
    `Org chưa có dòng user_projects nào: ${
      kq.orgKhongCoMembership.map((o) => `#${o.id} ${o.name}`).join(", ") || "(không có)"
    }`,
  );
  dong.push(
    "Bước tiếp: chủ dự án duyệt danh sách gán → admin gán ở /admin → chạy lại dry-run " +
      "(xem docs/nang-cap/AUDIT-S16-MEMBERSHIP-CUTOVER.md).",
  );
  return dong.join("\n");
}
