// Dựng cây thư mục bản vẽ quy chuẩn ISO 19650 (`npm run setup:drawing-tree`).
//
// Vì sao là script chứ không phải gọi trong route:
//
//  1. **Đúng chỗ.** Dựng đủ cây bàn giao là việc CẤP PHÁT MÔI TRƯỜNG, làm một lần lúc triển
//     khai — không phải việc của mỗi lần người dùng bấm Lưu. Route `save-drawing` vẫn tự
//     `mkdirSync(..., { recursive: true })` đúng nhánh nó ghi, nên không phụ thuộc script này.
//  2. **Build.** Khi `lib/ky-thuat/cad/drawing-tree.ts` còn nằm trong đồ thị import của một
//     route, Turbopack thấy `mkdirSync(join(baseDir, sys, sub))` — đường dẫn dựng động — và
//     báo "Dynamic filesystem access causes tracing of the whole project": bộ phân tích bó tay
//     nên phải trace TOÀN BỘ dự án. Build VPS vốn đã 20–23 phút (xem `.github/workflows/
//     deploy.yml`), phình thêm phần trace là tốn cả thời gian lẫn bộ nhớ.
//
// Chạy lại nhiều lần vô hại (`recursive: true`).
import { ensureAllDrawingTrees, drawingRoots } from "@/lib/ky-thuat/cad/drawing-tree";

ensureAllDrawingTrees();
console.log("✅ Đã dựng cây thư mục bản vẽ quy chuẩn tại:");
for (const goc of drawingRoots()) console.log(`   - ${goc}`);
