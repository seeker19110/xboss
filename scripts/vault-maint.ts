// Bảo trì vault offline (M131 §2): `npm run vault:maint -- [--rewrap] [--retire] [--apply]`.
// Mặc định DRY-RUN (chỉ in số liệu); `--apply` mới ghi. Kết nối bằng role riêng xboss_vault_maint qua
// XBOSS_VAULT_MAINT_DATABASE_URL (không dùng pool app). Chạy hằng ngày bằng crontab hệ thống
// (xem DEPLOY.md). Không in vật liệu khoá — chỉ số đếm theo kek_version.
import "./env";
import { docKeyringKek } from "@/lib/nen/offline-crypto";
import {
  baoCaoTheoKek,
  retireKhoaVault,
  rewrapKhoaVault,
  soNgayKhoiPhuc,
  taoPoolBaoTri,
} from "@/lib/bao-mat/offline-vault-bao-tri";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const rewrap = args.includes("--rewrap");
  const retire = args.includes("--retire");
  if (!rewrap && !retire) {
    console.log("Cách dùng: npm run vault:maint -- [--rewrap] [--retire] [--apply]");
    console.log("Không có --apply = dry-run (không ghi gì).");
    process.exit(2);
  }
  const soNgay = soNgayKhoiPhuc();
  const pool = taoPoolBaoTri();
  try {
    console.log(apply ? "⏳ Chạy THẬT (--apply)." : "🔍 Dry-run — không ghi gì.");
    if (rewrap) {
      const keyring = docKeyringKek(process.env.XBOSS_OFFLINE_KEK, process.env.XBOSS_SECRET);
      if (!keyring) throw new Error("Thiếu XBOSS_OFFLINE_KEK — không rewrap được.");
      const kq = await rewrapKhoaVault(pool, keyring, { apply });
      console.log(
        `Rewrap sang KEK ${kq.kekActive}: cần ${kq.canRewrap}, đã bọc lại ${kq.daRewrap}`,
      );
      console.log(`  bỏ qua: thiếu KEK cũ ${kq.boQuaThieuKek}, giải bọc lỗi ${kq.boQuaGiaiBocLoi}`);
    }
    if (retire) {
      const kq = await retireKhoaVault(pool, { apply, soNgay });
      console.log(
        `Retire (cửa sổ ${kq.soNgay} ngày): yêu cầu khôi phục hết hạn ${kq.yeuCauHetHan}, khoá retire ${kq.khoaRetire}`,
      );
    }
    console.log("Khoá theo kek_version (còn dùng / đã retire):");
    for (const d of await baoCaoTheoKek(pool))
      console.log(`  ${d.kekVersion}: ${d.conDung} / ${d.daRetire}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ vault:maint lỗi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
