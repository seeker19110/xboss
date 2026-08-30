// scripts/scan-drawings.ts — Quét file trong data/uploads/drawings và đăng ký vào DB (CLI).
// Chỉ là vỏ CLI: logic quét dùng chung với route POST /api/drawings/scan-local
// qua lib/ky-thuat/drawings-scan.ts.
import { queryOne, getPool } from "@/lib/db";
import { DRAWINGS_DIR, syncDrawingsFromDisk } from "@/lib/ky-thuat/drawings-scan";

async function main() {
  console.log(`🔍 Bắt đầu quét thư mục bản vẽ: ${DRAWINGS_DIR}`);

  // CLI không có phiên đăng nhập — lấy dự án đầu tiên làm mặc định.
  const defaultProject = await queryOne<{ id: number }>(
    `SELECT id FROM projects ORDER BY id LIMIT 1`,
  );
  const projectId = defaultProject?.id || 1;

  const res = await syncDrawingsFromDisk({
    projectId,
    userId: null,
    onProgress: (msg) => console.log(msg),
  });

  if (res.totalFilesOnDisk === 0) {
    console.log(`ℹ️ Thư mục ${DRAWINGS_DIR} hiện chưa có file bản vẽ nào.`);
    console.log(
      `👉 Hãy copy các file bản vẽ (.pdf, .dwg, .dxf, .png, .ifc) vào thư mục trên rồi chạy lại lệnh!`,
    );
  } else {
    console.log(
      `\n🎉 Hoàn thành đồng bộ! Đã cập nhật ${res.newlySyncedRevisions}/${res.totalFilesOnDisk} phiên bản bản vẽ lên giao diện Web.`,
    );
    if (res.failedFiles.length > 0) {
      console.error(`⚠️ ${res.failedFiles.length} tệp lỗi: ${res.failedFiles.join(", ")}`);
    }
  }

  await getPool().end();
}

main().catch((err) => {
  console.error("Lỗi khi chạy quét bản vẽ:", err);
  process.exit(1);
});
