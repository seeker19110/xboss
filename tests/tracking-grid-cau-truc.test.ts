import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// M121 PR1 (AC13) — canh cấu trúc file lưới tracking.
// `TrackingGrid.tsx` từng là 2424 dòng gộp lưới + 4 modal + hàm nén ảnh; mỗi lần sửa lưới phải
// cuộn qua cả trăm dòng không liên quan. Sau khi tách còn 1780 dòng. Ca này giữ mốc đó khỏi trôi
// ngược: thêm tính năng thì mở file mới, đừng nhồi tiếp vào file cũ.
//
// Ngưỡng 1800 (không phải 1500 như dự thảo đầu): xem ghi chú NFR5 trong
// docs/nang-cap/M121-luoi-tick-theo-vung.md — bóc sâu hơn không còn là tách cơ học.

const GOC = process.cwd();
const LUOI = join(GOC, "app/tracking/[sheet]/TrackingGrid.tsx");
const THU_MUC_MODAL = "app/tracking/[sheet]/modals";

const MODAL = ["PhotosModal", "PkgDatesModal", "CommentsModal", "HistoryModal"] as const;

test("AC13: TrackingGrid.tsx dưới 1800 dòng", () => {
  const soDong = readFileSync(LUOI, "utf8").split("\n").length;
  assert.ok(
    soDong < 1800,
    `TrackingGrid.tsx đang ${soDong} dòng — vượt mốc 1800. Tính năng mới nên nằm ở file/hook riêng.`,
  );
});

test("AC13: 4 modal nằm ở file riêng và được export", () => {
  for (const ten of MODAL) {
    const duongDan = join(GOC, THU_MUC_MODAL, `${ten}.tsx`);
    assert.ok(existsSync(duongDan), `Thiếu ${THU_MUC_MODAL}/${ten}.tsx`);
    const src = readFileSync(duongDan, "utf8");
    assert.match(src, new RegExp(`export function ${ten}\\b`), `${ten} phải được export`);
  }
});

test("AC13: TrackingGrid.tsx không còn định nghĩa 4 modal đó nữa", () => {
  // Chặn ca "tách xong rồi lại copy ngược vào" — file lưới chỉ được IMPORT modal, không khai lại.
  const src = readFileSync(LUOI, "utf8");
  for (const ten of MODAL) {
    assert.doesNotMatch(
      src,
      new RegExp(`^function ${ten}\\(`, "m"),
      `${ten} phải nằm ở ${THU_MUC_MODAL}/, không khai lại trong TrackingGrid.tsx`,
    );
    assert.match(
      src,
      new RegExp(`import \\{ ${ten} \\} from "./modals/${ten}"`),
      `TrackingGrid.tsx phải import ${ten} từ ${THU_MUC_MODAL}/`,
    );
  }
});
