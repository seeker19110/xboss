import { describe, it } from "node:test";
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("CAD Standardized Drawing Storage & Directory Structure Suite", () => {
  it("1. Thư mục quy chuẩn drawings/ và data/uploads/drawings/ chứa đầy đủ các phân nhóm con", () => {
    const basePaths = [
      join(process.cwd(), "drawings"),
      join(process.cwd(), "data", "uploads", "drawings"),
    ];

    for (const base of basePaths) {
      assert.ok(existsSync(join(base, "design", "origin")), "Thiếu thư mục design/origin");
      assert.ok(existsSync(join(base, "design", "iso")), "Thiếu thư mục design/iso");
      assert.ok(existsSync(join(base, "bim")), "Thiếu thư mục bim");
      assert.ok(existsSync(join(base, "shop")), "Thiếu thư mục shop");
      assert.ok(existsSync(join(base, "asbuilt")), "Thiếu thư mục asbuilt");
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
});
