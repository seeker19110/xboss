import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M8 — quét thư mục bản vẽ cục bộ và đăng ký vào DB (route scan-local + script CLI dùng
// chung logic này). Rủi ro thật đã xảy ra (xem comment đầu file lib): bản script cũ chèn sai
// tên cột nên chết ngay câu INSERT — nghĩa là các nhánh phân loại tên tệp + ghi DB idempotent
// dưới đây chính là chỗ dễ vỡ nhất khi có ai chỉnh sửa quy ước đặt tên hoặc câu SQL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DRAWINGS_DIR,
  getAllDrawingFilesRecursively,
  mimeFromExt,
  parseDrawingInfo,
} from "@/lib/ky-thuat/drawings-scan";

const S = { skip: !HAS_TEST_DB };

// ===== mimeFromExt =====

test("mimeFromExt: map đúng mime cho từng đuôi bản vẽ, không phân biệt hoa/thường", () => {
  assert.equal(mimeFromExt(".dwg"), "image/vnd.dwg");
  assert.equal(mimeFromExt(".DWG"), "image/vnd.dwg");
  assert.equal(mimeFromExt(".dxf"), "application/dxf");
  assert.equal(mimeFromExt(".pdf"), "application/pdf");
  assert.equal(mimeFromExt(".png"), "image/png");
  assert.equal(mimeFromExt(".jpg"), "image/jpeg");
  assert.equal(mimeFromExt(".jpeg"), "image/jpeg");
  assert.equal(mimeFromExt(".ifc"), "application/x-step");
});

test("mimeFromExt: đuôi lạ trả về octet-stream thay vì undefined (chặn upload lỗi mime)", () => {
  assert.equal(mimeFromExt(".rvt"), "application/octet-stream");
  assert.equal(mimeFromExt(""), "application/octet-stream");
});

// ===== parseDrawingInfo — hệ thống (systemGroup) =====

test("parseDrawingInfo: nhận diện hệ PLUMBING qua các từ khoá quy ước đặt tên", () => {
  for (const ten of [
    "PLUMB-T05-001.dwg",
    "SAN-T05-001.dwg",
    "CAP_THOAT-T05.dwg",
    "P-001.dwg",
    "HE_THONG_NUOC.dwg",
  ]) {
    assert.equal(parseDrawingInfo(ten).systemGroup, "PLUMBING", ten);
  }
});

test("parseDrawingInfo: nhận diện hệ ELECTRICAL qua các từ khoá quy ước đặt tên", () => {
  for (const ten of ["ELEC-T05.dwg", "DIEN-T05.dwg", "E-001.dwg", "CABLE_TRAY.dwg"]) {
    assert.equal(parseDrawingInfo(ten).systemGroup, "ELECTRICAL", ten);
  }
});

test("parseDrawingInfo: nhận diện hệ FIREFIGHTING (PCCC) qua các từ khoá quy ước đặt tên", () => {
  for (const ten of ["FIRE-T05.dwg", "PCCC-T05.dwg", "F-001.dwg", "SPK-LAYOUT.dwg"]) {
    assert.equal(parseDrawingInfo(ten).systemGroup, "FIREFIGHTING", ten);
  }
});

test("parseDrawingInfo: nhận diện hệ ARCHITECTURE (kiến trúc) qua các từ khoá quy ước đặt tên", () => {
  for (const ten of ["ARCH-T05.dwg", "MB_KT_T05.dwg", "A-001.dwg", "KIEN_TRUC_T05.dwg"]) {
    assert.equal(parseDrawingInfo(ten).systemGroup, "ARCHITECTURE", ten);
  }
});

test("parseDrawingInfo: nhận diện hệ STRUCTURE (kết cấu) qua các từ khoá quy ước đặt tên", () => {
  for (const ten of ["STRUCT-T05.dwg", "MB_KC_T05.dwg", "S-001.dwg", "KET_CAU_T05.dwg"]) {
    assert.equal(parseDrawingInfo(ten).systemGroup, "STRUCTURE", ten);
  }
});

test("parseDrawingInfo: không khớp từ khoá nào → mặc định hệ HVAC (đúng nghiệp vụ chính của XBoss)", () => {
  assert.equal(parseDrawingInfo("KHONG_RO_HE.dwg").systemGroup, "HVAC");
});

// ===== parseDrawingInfo — loại bản vẽ (kind) =====

test("parseDrawingInfo: nhận diện đủ 5 loại bản vẽ (kind) + mặc định design", () => {
  assert.equal(parseDrawingInfo("SHOP_DRAWING.dwg").kind, "shop");
  assert.equal(parseDrawingInfo("MODEL_BIM.rvt").kind, "bim");
  assert.equal(parseDrawingInfo("KHONG_CO_TU_KHOA.ifc").kind, "bim", "đuôi .ifc luôn là bim");
  assert.equal(parseDrawingInfo("KHONG_CO_TU_KHOA.nwd").kind, "bim", "đuôi .nwd luôn là bim");
  assert.equal(parseDrawingInfo("HOAN_CONG_T05.dwg").kind, "asbuilt");
  assert.equal(parseDrawingInfo("ASBUILT_T05.dwg").kind, "asbuilt");
  assert.equal(parseDrawingInfo("AS_BUILT_T05.dwg").kind, "asbuilt");
  assert.equal(parseDrawingInfo("BPTC_LAP_DAT.dwg").kind, "method");
  assert.equal(parseDrawingInfo("BIEN_PHAP_THI_CONG.dwg").kind, "method");
  assert.equal(parseDrawingInfo("BINH_THUONG.dwg").kind, "design", "không khớp từ khoá nào");
});

// ===== parseDrawingInfo — tầng (floorLabel) =====

test("parseDrawingInfo: suy ra tầng từ các pattern FL/TANG/T/HAM/BASEMENT", () => {
  assert.equal(parseDrawingInfo("DUCT_FL3.dwg").floorLabel, "Tầng 3");
  assert.equal(parseDrawingInfo("DUCT_TANG_05.dwg").floorLabel, "Tầng 05");
  assert.equal(parseDrawingInfo("DUCT_T12.dwg").floorLabel, "Tầng 12");
  assert.equal(parseDrawingInfo("DUCT_HAM_2.dwg").floorLabel, "Tầng Hầm 2");
  assert.equal(parseDrawingInfo("DUCT_BASEMENT_1.dwg").floorLabel, "Tầng Hầm 1");
});

test("parseDrawingInfo: không có pattern tầng nào → mặc định Tầng Điển Hình", () => {
  assert.equal(parseDrawingInfo("KHONG_CO_TANG.dwg").floorLabel, "Tầng Điển Hình");
});

// ===== parseDrawingInfo — revision =====

test("parseDrawingInfo: suy ra revision từ REV_x / REVx / Rx, mặc định Rev A", () => {
  assert.equal(parseDrawingInfo("DUCT_REV_B.dwg").rev, "Rev B");
  assert.equal(parseDrawingInfo("DUCT_REVC.dwg").rev, "Rev C");
  assert.equal(parseDrawingInfo("DUCT_R05.dwg").rev, "Rev 05");
  assert.equal(parseDrawingInfo("KHONG_CO_REV.dwg").rev, "Rev A");
});

// ===== parseDrawingInfo — mã (code) và tên (name) =====

test("parseDrawingInfo: code CẮT hậu tố _REV.../_R\\d+, còn name giữ nguyên (kể cả hậu tố)", () => {
  // Bẫy dễ sai: code và name lấy từ 2 phép biến đổi KHÁC NHAU trên cùng tên gốc — nếu ai
  // gộp chung logic sẽ vô tình làm mã bản vẽ dính theo số revision, phá tính duy nhất của
  // BOQCODE khi bản vẽ được duyệt lên rev mới.
  const a = parseDrawingInfo("ACMV_SHOP_T05_REV_B.dwg");
  assert.equal(a.code, "ACMV_SHOP_T05");
  assert.equal(a.name, "ACMV SHOP T05 REV B");

  const b = parseDrawingInfo("DUCT_LAYOUT_R2.dwg");
  assert.equal(b.code, "DUCT_LAYOUT");
  assert.equal(b.name, "DUCT LAYOUT R2");

  const c = parseDrawingInfo("KHONG_CO_HAU_TO.dwg");
  assert.equal(c.code, "KHONG_CO_HAU_TO");
  assert.equal(c.name, "KHONG CO HAU TO");
});

test("parseDrawingInfo: giữ đúng đuôi tệp gốc (ext) và hạ chữ thường", () => {
  assert.equal(parseDrawingInfo("FILE.DWG").ext, ".dwg");
  assert.equal(parseDrawingInfo("FILE.PdF").ext, ".pdf");
});

// ===== getAllDrawingFilesRecursively =====

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "xboss-drawings-scan-"));
}

test("getAllDrawingFilesRecursively: thư mục không tồn tại → trả mảng rỗng, không ném lỗi", () => {
  assert.deepEqual(
    getAllDrawingFilesRecursively(join(tmpdir(), "khong-ton-tai-" + Date.now())),
    [],
  );
});

test("getAllDrawingFilesRecursively: duyệt đệ quy, lọc đúng đuôi hợp lệ, relativePath dùng dấu /", () => {
  const dir = tmpDir();
  try {
    mkdirSync(join(dir, "HVAC", "shop"), { recursive: true });
    writeFileSync(join(dir, "HVAC", "shop", "A.dwg"), "x");
    writeFileSync(join(dir, "HVAC", "B.PDF"), "x"); // hoa toàn bộ vẫn phải nhận (so sánh không phân biệt hoa/thường)
    writeFileSync(join(dir, "ghi-chu.txt"), "x"); // đuôi không hợp lệ — phải bị loại

    const ds = getAllDrawingFilesRecursively(dir);
    const rel = ds.map((d) => d.relativePath).sort();
    assert.deepEqual(rel, ["HVAC/B.PDF", "HVAC/shop/A.dwg"]);
    const a = ds.find((d) => d.fileName === "A.dwg")!;
    assert.equal(a.fullPath, join(dir, "HVAC", "shop", "A.dwg"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("getAllDrawingFilesRecursively: thư mục con không đọc được (ENOTDIR) — bỏ qua, không chặn phần còn lại", () => {
  // Không thể ép EACCES thật (tiến trình test chạy quyền root, chmod không có tác dụng) —
  // dùng cách khác để trúng nhánh catch: readdirSync trên MỘT TỆP (không phải thư mục) ném
  // ENOTDIR giống hệt lỗi thư mục hỏng/mất quyền mà đoạn code này được viết để chịu được.
  const dir = tmpDir();
  try {
    const tepGiaLamThuMuc = join(dir, "khong-phai-thu-muc");
    writeFileSync(tepGiaLamThuMuc, "x");
    assert.deepEqual(getAllDrawingFilesRecursively(tepGiaLamThuMuc), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("getAllDrawingFilesRecursively: symlink không phải file/thư mục thật — bị loại qua entry.isFile()", () => {
  const dir = tmpDir();
  try {
    const target = join(dir, "khong-ton-tai.dwg");
    const link = join(dir, "link.dwg");
    symlinkSync(target, link); // symlink gãy — isFile()/isDirectory() của Dirent đều false
    assert.equal(existsSync(link), false, "symlink trỏ tới đích không tồn tại");
    assert.deepEqual(getAllDrawingFilesRecursively(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ===== syncDrawingsFromDisk (tích hợp DB thật, quét đúng DRAWINGS_DIR cố định) =====
//
// DRAWINGS_DIR là hằng số tính từ process.cwd(), không truyền được qua tham số — nên các
// test dưới tự tạo thư mục con DUY NHẤT bên trong DRAWINGS_DIR thật (không đổi mã nguồn để
// "tiêm" đường dẫn giả) và dọn sạch trong finally. Vì hàm quét TOÀN BỘ cây thư mục, các test
// không giả định tổng số tệp trên đĩa (có thể có nội dung khác đã tồn tại từ trước) mà chỉ
// kiểm đúng bản ghi DB ứng với các tệp do CHÍNH test này tạo ra, nhận diện qua mã ngẫu nhiên.

function taoThuMucConTest(): { dir: string; sub: string } {
  const sub = `__test_scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const dir = join(DRAWINGS_DIR, sub);
  mkdirSync(dir, { recursive: true });
  return { dir, sub };
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, ten);
}

async function taoNguoiDung(email: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(
    `INSERT INTO users (name, email, role, password_hash) VALUES ('Test scan', ?, 'admin', 'x')`,
    email,
  );
}

test(
  "syncDrawingsFromDisk: tệp mới trên đĩa → đăng ký đúng drawing + revision đầu tiên (Rev A, approved)",
  S,
  async () => {
    const { run } = await import("@/lib/db");
    const { syncDrawingsFromDisk } = await import("@/lib/ky-thuat/drawings-scan");

    const projectId = await taoDuAn("Test scan disk 1");
    const userId = await taoNguoiDung(`scan1-${Date.now()}@test.local`);
    const { dir, sub } = taoThuMucConTest();
    const maDuyNhat = `SCAN-${Date.now()}-A`;
    try {
      writeFileSync(join(dir, `${maDuyNhat}.dwg`), "noi dung gia");

      const tienDo: string[] = [];
      const kq = await syncDrawingsFromDisk({
        projectId,
        userId,
        onProgress: (m) => tienDo.push(m),
      });

      assert.ok(kq.totalFilesOnDisk >= 1);
      assert.ok(kq.newlySyncedRevisions >= 1);
      assert.deepEqual(kq.failedFiles, [], "không có tệp lỗi trong ca này");
      assert.ok(
        tienDo.some((m) => m.includes("Đã tạo bản vẽ mới") && m.includes(maDuyNhat)),
        "phải log đúng bản vẽ mới tạo",
      );
      assert.ok(
        tienDo.some((m) => m.includes("Đã đăng ký phiên bản")),
        "phải log đúng revision đăng ký",
      );

      const { queryOne } = await import("@/lib/db");
      const dr = await queryOne<{ id: number; kind: string; system_group: string }>(
        `SELECT id, kind, system_group FROM drawings WHERE code = ? AND project_id = ?`,
        maDuyNhat,
        projectId,
      );
      assert.ok(dr, "phải có bản ghi drawings ứng với mã vừa quét");
      assert.equal(dr!.kind, "design");
      assert.equal(dr!.system_group, "HVAC");

      const rev = await queryOne<{
        rev: string;
        status: string;
        file_name: string;
        mime_type: string;
        uploaded_by: number;
        decision_note: string;
      }>(`SELECT * FROM drawing_revisions WHERE drawing_id = ?`, dr!.id);
      assert.equal(rev!.rev, "Rev A");
      assert.equal(rev!.status, "approved");
      assert.equal(rev!.file_name, `drawings/${sub}/${maDuyNhat}.dwg`);
      assert.equal(rev!.mime_type, "image/vnd.dwg");
      assert.equal(rev!.uploaded_by, userId);
      assert.equal(rev!.decision_note, "Đồng bộ tự động từ thư mục dự án");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await run(
        `DELETE FROM drawing_revisions WHERE drawing_id IN (SELECT id FROM drawings WHERE project_id = ?)`,
        projectId,
      );
      await run(`DELETE FROM drawings WHERE project_id = ?`, projectId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);

test(
  "syncDrawingsFromDisk: chạy lại lần 2 với cùng tệp — idempotent, KHÔNG tạo revision trùng",
  S,
  async () => {
    const { run, query } = await import("@/lib/db");
    const { syncDrawingsFromDisk } = await import("@/lib/ky-thuat/drawings-scan");

    const projectId = await taoDuAn("Test scan disk idempotent");
    const userId = await taoNguoiDung(`scan2-${Date.now()}@test.local`);
    const { dir } = taoThuMucConTest();
    const maDuyNhat = `SCAN-${Date.now()}-IDEM`;
    try {
      writeFileSync(join(dir, `${maDuyNhat}.dwg`), "noi dung");

      const lan1 = await syncDrawingsFromDisk({ projectId, userId });
      assert.ok(lan1.newlySyncedRevisions >= 1);

      const lan2 = await syncDrawingsFromDisk({ projectId, userId });
      assert.equal(lan2.newlySyncedRevisions, 0, "chạy lại không có tệp mới nào phải đăng ký thêm");

      const dr = await query<{ id: number }>(
        `SELECT id FROM drawings WHERE code = ? AND project_id = ?`,
        maDuyNhat,
        projectId,
      );
      assert.equal(dr.length, 1, "vẫn chỉ 1 bản ghi drawing, không nhân đôi");
      const revs = await query(`SELECT id FROM drawing_revisions WHERE drawing_id = ?`, dr[0].id);
      assert.equal(revs.length, 1, "vẫn chỉ 1 revision Rev A, không nhân đôi");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await run(
        `DELETE FROM drawing_revisions WHERE drawing_id IN (SELECT id FROM drawings WHERE project_id = ?)`,
        projectId,
      );
      await run(`DELETE FROM drawings WHERE project_id = ?`, projectId);
      await run(`DELETE FROM users WHERE id = ?`, userId);
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);

test(
  "syncDrawingsFromDisk: code trùng bản vẽ đã thuộc DỰ ÁN KHÁC — bám vào bản ghi cũ, không vi phạm UNIQUE(code)",
  S,
  async () => {
    // BOQCODE/`drawings.code` là duy nhất TOÀN HỆ THỐNG (UNIQUE trên cột code, không kèm
    // project_id) — đây là bất biến quan trọng nhất của module: quét 2 dự án có tệp trùng
    // tên tuyệt đối không được INSERT trùng và vỡ ràng buộc unique.
    const { run, query, insertId } = await import("@/lib/db");
    const { syncDrawingsFromDisk } = await import("@/lib/ky-thuat/drawings-scan");

    const projectA = await taoDuAn("Test scan disk du an A");
    const projectB = await taoDuAn("Test scan disk du an B");
    const { dir } = taoThuMucConTest();
    const maDungChung = `SCAN-${Date.now()}-CROSS`;
    const drawingIdA = await insertId(
      `INSERT INTO drawings (project_id, code, name, kind) VALUES (?, ?, 'Bản vẽ dự án A', 'design')`,
      projectA,
      maDungChung,
    );
    try {
      writeFileSync(join(dir, `${maDungChung}.dwg`), "noi dung");

      const kq = await syncDrawingsFromDisk({ projectId: projectB, userId: null });
      assert.ok(kq.newlySyncedRevisions >= 1);

      const ds = await query<{ id: number; project_id: number }>(
        `SELECT id, project_id FROM drawings WHERE code = ?`,
        maDungChung,
      );
      assert.equal(ds.length, 1, "vẫn chỉ 1 bản ghi drawings — không nhân đôi theo project");
      assert.equal(ds[0].id, drawingIdA);
      assert.equal(ds[0].project_id, projectA, "quyền sở hữu bản ghi KHÔNG đổi sang dự án B");

      const revs = await query<{ uploaded_by: number | null }>(
        `SELECT uploaded_by FROM drawing_revisions WHERE drawing_id = ?`,
        drawingIdA,
      );
      assert.equal(revs.length, 1, "revision mới vẫn được đăng ký vào ĐÚNG drawing đã có");
      assert.equal(revs[0].uploaded_by, null, "userId null khi chạy CLI thì uploaded_by null");
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await run(`DELETE FROM drawing_revisions WHERE drawing_id = ?`, drawingIdA);
      await run(`DELETE FROM drawings WHERE id = ?`, drawingIdA);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, projectA, projectB);
    }
  },
);

test(
  "syncDrawingsFromDisk: userId vi phạm khoá ngoại → gom vào failedFiles, KHÔNG chặn tệp khác, không ném lỗi",
  S,
  async () => {
    // Bất biến chịu lỗi từng tệp: một tệp hỏng (ví dụ dữ liệu tham chiếu sai) không được làm
    // hỏng cả đợt quét hàng trăm bản vẽ khác — đây là lý do try/catch nằm TRONG vòng lặp.
    const { run } = await import("@/lib/db");
    const { syncDrawingsFromDisk } = await import("@/lib/ky-thuat/drawings-scan");

    const projectId = await taoDuAn("Test scan disk userId invalid");
    const { dir } = taoThuMucConTest();
    const ma1 = `SCAN-${Date.now()}-BAD1`;
    const ma2 = `SCAN-${Date.now()}-BAD2`;
    try {
      writeFileSync(join(dir, `${ma1}.dwg`), "x");
      writeFileSync(join(dir, `${ma2}.dwg`), "x");

      const userIdKhongTonTai = 999_999_999;
      const kq = await syncDrawingsFromDisk({ projectId, userId: userIdKhongTonTai });

      assert.ok(kq.failedFiles.includes(`${ma1}.dwg`));
      assert.ok(kq.failedFiles.includes(`${ma2}.dwg`));
      assert.equal(
        kq.newlySyncedRevisions,
        0,
        "cả 2 tệp đều lỗi, không tệp nào đăng ký thành công",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
      await run(`DELETE FROM drawings WHERE project_id = ?`, projectId);
      await run(`DELETE FROM projects WHERE id = ?`, projectId);
    }
  },
);
