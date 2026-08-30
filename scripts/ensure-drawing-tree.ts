// Dựng cây thư mục bản vẽ quy chuẩn ISO 19650 (`npm run setup:drawing-tree`).
//
// Vì sao là script chứ không phải gọi trong route:
//
//  1. **Đúng chỗ.** Dựng đủ cây bàn giao là việc CẤP PHÁT MÔI TRƯỜNG, làm một lần lúc triển
//     khai — không phải việc của mỗi lần người dùng bấm Lưu. Route `save-drawing` vẫn tự
//     `mkdirSync(..., { recursive: true })` đúng nhánh nó ghi, nên không phụ thuộc script này.
//  2. **Build.** `mkdirSync(join(baseDir, sys, sub))` là đường dẫn dựng động: Turbopack phân
//     tích tĩnh ra "Dynamic filesystem access causes tracing of the whole project" và trace
//     TOÀN BỘ dự án vào output của mọi route có tệp này trong đồ thị import. Build VPS vốn đã
//     20–23 phút (xem `.github/workflows/deploy.yml`), phình thêm phần trace là tốn cả thời
//     gian lẫn bộ nhớ. Từ khi `drawing-tree` gộp vào `lib/ky-thuat/cad/drawing.ts` (tệp mà
//     route parse-dxf có import), chặn việc trace bằng `turbopackIgnore` ngay tại lời gọi —
//     xem `ensureDrawingTree()`. Đừng gỡ dấu đó.
//
// Chạy lại nhiều lần vô hại (`recursive: true`).
import { ensureAllDrawingTrees, drawingRoots } from "@/lib/ky-thuat/cad/drawing";

ensureAllDrawingTrees();
console.log("✅ Đã dựng cây thư mục bản vẽ quy chuẩn tại:");
for (const goc of drawingRoots()) console.log(`   - ${goc}`);
