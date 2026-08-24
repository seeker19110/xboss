import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { insertId, run } from "@/lib/db";
import { chotProjectIdChoGhi } from "@/lib/ha-tang/projects";

// ─────────────────────────────────────────────────────────────────────────────
// Hồi quy cho lỗi #3 của đợt audit quy trình chuẩn hoá bản vẽ 2D (2026-08-24).
//
// `/api/engineering/cad/save-drawing` viết `inputProjectId || getCurrentProjectId(user) || 1`,
// tức lấy project_id CLIENT GỬI trước tiên — chỉ cần sửa một con số trong request là ghi được bản
// vẽ vào dự án mình không thuộc. Trái thẳng quy ước ghi ở đầu `lib/ha-tang/projects.ts`:
// "Route KHÔNG tin project_id client gửi qua body/query". Cùng lớp lỗi đã xảy ra thật với
// /api/payment-certs (docs/audit.md §3).
//
// `visibleProjectIds` có một quy tắc tương thích ngược quan trọng: bảng `user_projects` RỖNG
// toàn hệ thống nghĩa là chưa ai cấu hình gán dự án → mọi user thấy mọi dự án. Nên test phải
// tự tạo bản ghi gán, nếu không nhánh "bị từ chối" sẽ không bao giờ chạy tới.
// ─────────────────────────────────────────────────────────────────────────────

describe("chotProjectIdChoGhi — không tin project_id client gửi", { skip: !HAS_TEST_DB }, () => {
  it("từ chối dự án user KHÔNG được gán", async () => {
    const duAnCuaToi = await insertId(`INSERT INTO projects (name) VALUES ('CAD scope A')`);
    const duAnNguoiKhac = await insertId(`INSERT INTO projects (name) VALUES ('CAD scope B')`);
    const uid = await insertId(
      `INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)`,
      `cad-scope-${Date.now()}@x.test`,
      "KS CAD",
      "engineer",
      "x",
    );
    // Gán user vào ĐÚNG một dự án → bảng user_projects không còn rỗng, quy tắc lọc bật lên.
    //
    // PHẢI DỌN SẠCH ở finally: bộ chạy test cấp cho mỗi worker một database riêng nhưng NHIỀU
    // FILE dùng chung database của worker đó. Để lại dòng trong `user_projects` là phá vỡ quy tắc
    // tương thích ngược "bảng rỗng = mọi user thấy mọi dự án", làm `tests/projects.test.ts` đỏ oan
    // nếu nó chạy sau — đúng lớp lỗi repo đã gặp ("3 file test tích hợp không tự dọn dữ liệu, gây
    // fail giả khi chạy lại"). Đã tái hiện thật khi viết test này.
    await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, uid, duAnCuaToi);
    try {
      const user = { id: uid, role: "engineer" as const };

      const biTuChoi = await chotProjectIdChoGhi(user, duAnNguoiKhac, 1);
      assert.equal(biTuChoi.ok, false, "dự án không được gán phải bị từ chối");

      const duocPhep = await chotProjectIdChoGhi(user, duAnCuaToi, 1);
      assert.equal(duocPhep.ok, true, "dự án được gán phải đi qua");
      assert.equal(duocPhep.ok === true && duocPhep.projectId, duAnCuaToi);
    } finally {
      await run(`DELETE FROM user_projects WHERE user_id = ?`, uid);
    }
  });

  it("admin đi qua mọi dự án", async () => {
    const duAn = await insertId(`INSERT INTO projects (name) VALUES ('CAD scope admin')`);
    const uid = await insertId(
      `INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)`,
      `cad-admin-${Date.now()}@x.test`,
      "Admin",
      "admin",
      "x",
    );
    const kq = await chotProjectIdChoGhi({ id: uid, role: "admin" as const }, duAn, 1);
    assert.equal(kq.ok, true);
    assert.equal(kq.ok === true && kq.projectId, duAn);
  });

  it("không gửi projectId thì dùng dự án đang chọn, không nổ", async () => {
    const uid = await insertId(
      `INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)`,
      `cad-none-${Date.now()}@x.test`,
      "KS",
      "engineer",
      "x",
    );
    const user = { id: uid, role: "engineer" as const };
    for (const v of [null, undefined, ""]) {
      const kq = await chotProjectIdChoGhi(user, v, 1);
      assert.equal(kq.ok, true, `giá trị ${JSON.stringify(v)} phải rơi về dự án đang chọn`);
      assert.ok(kq.ok === true && Number.isInteger(kq.projectId));
    }
  });

  it("giá trị rác (không phải số nguyên dương) bị từ chối, không ép kiểu bừa", async () => {
    const uid = await insertId(
      `INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?)`,
      `cad-rac-${Date.now()}@x.test`,
      "KS",
      "engineer",
      "x",
    );
    const user = { id: uid, role: "engineer" as const };
    for (const v of ["abc", -1, 0, 1.5, {}, []]) {
      const kq = await chotProjectIdChoGhi(user, v, 1);
      assert.equal(kq.ok, false, `giá trị ${JSON.stringify(v)} phải bị từ chối`);
    }
  });
});
