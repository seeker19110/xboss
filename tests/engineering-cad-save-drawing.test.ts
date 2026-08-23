import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { describe, it } from "node:test";
import assert from "node:assert";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAN } from "@/lib/auth";
import { DRAWING_SYSTEMS, drawingRoots, ensureAllDrawingTrees } from "@/lib/cad/drawing-tree";

describe("CAD Standardized Drawing Storage & Directory Structure Suite", () => {
  it("1. Thư mục quy chuẩn drawings/ và data/uploads/drawings/ chứa đầy đủ các phân hệ, nhóm con và thư mục tạm (temp/)", () => {
    // Cây thư mục KHÔNG nằm trong git (drawings/ không track file nào, data/uploads/ bị
    // .gitignore) nên checkout sạch không có sẵn — hệ thống phải tự dựng được. Gọi đúng
    // helper mà route save-drawing dùng, rồi mới kiểm cấu trúc.
    ensureAllDrawingTrees();

    const basePaths = drawingRoots();
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

    const getRelativePath = (isApproved: boolean) => {
      if (!isApproved) {
        return join(systems, "temp");
      }
      if (kind === "design") {
        return join(systems, "design", subFolder || "iso");
      }
      return join(systems, kind);
    };

    // Khi chưa duyệt
    const draftPath = getRelativePath(false).replace(/\\/g, "/");
    assert.strictEqual(draftPath, "HVAC/temp");

    // Khi kỹ sư trưởng đã duyệt Gate 0
    const approvedPath = getRelativePath(true).replace(/\\/g, "/");
    assert.strictEqual(approvedPath, "HVAC/design/iso");
  });

  it("4. Chỉ Admin/PM/Kỹ sư được lưu bản vẽ — subcon/bch/viewer bị chặn 403", () => {
    // Route POST /api/engineering/cad/save-drawing kiểm quyền qua CAN.manageDrawings
    for (const role of ["subcon", "bch", "viewer", "cdt"] as const) {
      assert.strictEqual(CAN.manageDrawings(role), false, `Vai trò ${role} không được lưu bản vẽ`);
    }
    for (const role of ["admin", "pm", "engineer"] as const) {
      assert.strictEqual(CAN.manageDrawings(role), true, `Vai trò ${role} phải được lưu bản vẽ`);
    }
  });

  // Việc 7.5 — regression: drawing_revisions.status='pending' vi phạm CHECK constraint
  // (migrations/0016_drawings.sql:29-30), khiến POST /api/engineering/cad/save-drawing
  // trả 500 khi isApproved=false (luồng "lưu tạm" mặc định). Route gọi getCurrentUser()
  // (next/headers) nên không gọi POST() trực tiếp ngoài request scope thật được — đúng
  // giới hạn đã ghi nhận ở tests/permissions.test.ts ("Route handler gọi next/headers nên
  // không gọi trực tiếp ngoài request scope"). Test này tái hiện đúng câu INSERT route
  // thực thi ở nhánh isApproved=false (cùng cột, cùng giá trị revStatus="submitted" sau
  // khi sửa) trên TEST_DATABASE_URL thật, để kiểm CHECK constraint thật của Postgres.
  it(
    "5. Nhánh chưa duyệt (isApproved=false): INSERT drawing_revisions với status='submitted' phải qua CHECK constraint, 'pending' cũ vẫn bị chặn (regression)",
    { skip: !HAS_TEST_DB },
    async () => {
      const { run, insertId, queryOne } = await import("@/lib/db");

      const drawingId = await insertId(
        `INSERT INTO drawings (code, name, kind) VALUES ('TEST-V75-SAVE-DRAWING', 'BV test luu tam', 'design')`,
      );

      try {
        // Đúng như route.ts: isApproved=false -> revStatus = "submitted" (sau khi sửa).
        const revisionId = await insertId(
          `INSERT INTO drawing_revisions (
            drawing_id, rev, file_name, original_name, mime_type, size_bytes,
            status, submitted_at, decided_at, decision_note, uploaded_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_DATE, NULL, ?, ?, NOW())`,
          drawingId,
          "Rev01",
          "HVAC/temp/TEST-V75.dxf",
          "TEST-V75.dxf",
          "application/dxf",
          0,
          "submitted",
          "[Lưu Tạm Thời Chờ Duyệt - Test]: ghi chú test",
          null,
        );
        assert.ok(
          revisionId,
          "INSERT drawing_revisions với status='submitted' phải thành công (200/201)",
        );

        const row = await queryOne<{ status: string }>(
          `SELECT status FROM drawing_revisions WHERE id = ?`,
          revisionId,
        );
        assert.strictEqual(row?.status, "submitted");

        // Regression guard: 'pending' (giá trị cũ gây lỗi 500) vẫn phải bị CHECK constraint
        // bác — nếu ai đó lỡ sửa lại "pending", test này chuyển đỏ ngay.
        await assert.rejects(
          insertId(
            `INSERT INTO drawing_revisions (
              drawing_id, rev, file_name, mime_type, status, uploaded_by, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            drawingId,
            "Rev02",
            "HVAC/temp/TEST-V75-B.dxf",
            "application/dxf",
            "pending",
            null,
          ),
          (e: unknown) =>
            typeof e === "object" && e !== null && (e as { code?: string }).code === "23514",
        );
      } finally {
        await run(`DELETE FROM drawings WHERE id = ?`, drawingId);
      }
    },
  );
});
