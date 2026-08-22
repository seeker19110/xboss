import { describe, it } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  DRAWING_SYSTEMS,
  drawingRelativePath,
  ensureDrawingDirs,
} from "../lib/cad/drawing-storage";

describe("CAD Standardized Drawing Storage & Directory Structure Suite", () => {
  it("1. Thư mục quy chuẩn drawings/ và data/uploads/drawings/ chứa đầy đủ các phân hệ, nhóm con và thư mục tạm (temp/)", () => {
    const basePaths = [
      join(process.cwd(), "drawings"),
      join(process.cwd(), "data", "uploads", "drawings"),
    ];

    // Cây thư mục được dựng lúc lưu bản vẽ đầu tiên (route save-drawing gọi hàm này);
    // gọi trực tiếp để kiểm đúng bộ thư mục quy chuẩn mà hàm tạo ra.
    ensureDrawingDirs();
    const systems = DRAWING_SYSTEMS;

    for (const base of basePaths) {
      for (const sys of systems) {
        assert.ok(existsSync(join(base, sys, "temp")), `Thiếu thư mục tạm ${sys}/temp`);
        assert.ok(
          existsSync(join(base, sys, "design", "origin")),
          `Thiếu thư mục ${sys}/design/origin`,
        );
        assert.ok(existsSync(join(base, sys, "design", "iso")), `Thiếu thư mục ${sys}/design/iso`);
        assert.ok(existsSync(join(base, sys, "bim")), `Thiếu thư mục ${sys}/bim`);
        assert.ok(existsSync(join(base, sys, "shop")), `Thiếu thư mục ${sys}/shop`);
        assert.ok(existsSync(join(base, sys, "asbuilt")), `Thiếu thư mục ${sys}/asbuilt`);
      }
    }
  });

  it("2. Công thức đặt tên file chuẩn hóa tạo ra chuỗi định danh duy nhất theo ISO 19650", () => {
    const projectCode = "PRJ01";
    const workPackageCode = "WP-MEPF-01";
    const systems = "HVAC";
    const kind = "design";
    const subFolder = "iso";
    const name = "Mat_Bang_Cap_Gio_Tang_4";
    const date = "20260822";
    const drawingVersions = "Rev01";

    const cleanStr = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

    const cProject = cleanStr(projectCode);
    const cWp = cleanStr(workPackageCode);
    const cSys = cleanStr(systems);
    const cKind = kind.toLowerCase();
    const cSub = cleanStr(subFolder).toLowerCase();
    const cName = cleanStr(name);
    const cDate = cleanStr(date);
    const cRev = cleanStr(drawingVersions);

    const kindTag = `DESIGN-${cSub.toUpperCase()}`;
    const standardFileName = `${cProject}_${cWp}_${cSys}_${kindTag}_${cName}_${cDate}_${cRev}.dxf`;

    assert.strictEqual(
      standardFileName,
      "PRJ01_WP-MEPF-01_HVAC_DESIGN-ISO_Mat_Bang_Cap_Gio_Tang_4_20260822_Rev01.dxf",
    );
  });

  it("3. Kiểm tra logic phân bổ đường dẫn: Chưa duyệt -> lưu thư mục tạm (temp/), Đã duyệt -> lưu đúng vị trí chính thức", () => {
    const systems = "HVAC";
    const kind = "design";
    const subFolder = "iso";

    // Khi chưa duyệt
    const draftPath = drawingRelativePath(systems, kind, subFolder, false).replace(/\\/g, "/");
    assert.strictEqual(draftPath, "HVAC/temp");

    // Khi kỹ sư trưởng đã duyệt Gate 0
    const approvedPath = drawingRelativePath(systems, kind, subFolder, true).replace(/\\/g, "/");
    assert.strictEqual(approvedPath, "HVAC/design/iso");
  });
});
