import "./env";
import { queryOne } from "../lib/db";
import { setNavEnabled, isKnownNodeKey } from "../lib/nav-settings";

// Tắt mặc định (toàn hệ thống, project_id NULL) các mục AppShell chưa cần thiết cho
// trọng tâm "quản lý thi công tại công trường" — theo quyết định 2026-07 (chat với PM):
// giữ M00-M22 (lõi tracking/BOQ/chi phí/chất lượng/an toàn/hợp đồng) + M32-M34 (gắn
// trực tiếp thi công/thầu phụ), tắt các module vòng ngoài công ty/giai đoạn chưa tới.
// KHÔNG tắt "dash.nhan-su" (M24) dù đã bàn — node này gộp chung với 2 trang lõi M00
// (/users, /admin) làm con, tắt cả node sẽ mất luôn 2 trang quản trị lõi. Cần tách cây
// riêng mới tắt được phần mở rộng (Chấm công/Nhân sự/Sơ đồ tổ chức) — để quyết định sau.
const NODES_TO_DISABLE = [
  "dash.tai-chinh-ke-toan", // M27 — kế toán VAT/lương/công nợ, việc phòng kế toán công ty
  "dash.bao-hiem-bao-lanh", // M28 — hồ sơ pháp lý cấp công ty, ít biến động
  "dash.chuyen-doi-so", // M31 — trang danh mục link, chưa có nghiệp vụ thật
  "dash.khoi-dong-phap-ly", // M23 — chỉ dùng đầu dự án, TT AVIO đã qua giai đoạn này
  "dash.ban-giao-ket-thuc", // M29 — chưa tới giai đoạn bàn giao
  "dash.bao-hanh-bao-tri", // M30 — chỉ cần sau bàn giao
  "dash.moi-truong", // M25 — thường do tư vấn môi trường ngoài làm + nộp báo cáo
  "dash.quan-he-quan-trac", // M26 — quan trắc lún/nghiêng do đơn vị trắc đạc độc lập đảm nhiệm
];

async function main() {
  const email = process.argv[2] ?? "admin@xboss.vn";
  const actor = await queryOne<{ id: number }>(`SELECT id FROM users WHERE email = ?`, email);
  if (!actor) {
    console.error(
      `Không tìm thấy user "${email}" để ghi updated_by. Dùng: npx tsx scripts/apply-nav-defaults.ts [email_admin]`,
    );
    process.exit(1);
  }

  for (const nodeKey of NODES_TO_DISABLE) {
    if (!isKnownNodeKey(nodeKey)) {
      console.error(
        `⚠️  Bỏ qua "${nodeKey}" — không khớp id nào trong dashboardTree.ts (cây đã đổi?).`,
      );
      continue;
    }
    const { changed, wasEnabled } = await setNavEnabled(nodeKey, false, null, actor.id);
    console.log(
      changed
        ? `✅ Đã tắt "${nodeKey}" (trước đó: ${wasEnabled ? "bật" : "tắt"})`
        : `↷ "${nodeKey}" đã tắt sẵn, không đổi`,
    );
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
