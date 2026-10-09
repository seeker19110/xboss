import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, datCookie, dangXuat, COOKIE_DU_AN } from "./helpers/phien"; // mock next/headers
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

// A1-AC03 (GAP-2 iii): đường import Excel lấy dự án từ cookie `xboss_project` qua
// getCurrentProjectIdStrict — cookie sai kiểu / vượt safe-integer / dự án org khác ⇒ 404 theo
// contract hiện tại, KHÔNG ghi gì (không import_batches, không task/nhóm nào). Đối chứng: cookie
// hợp lệ ghi đúng dự án đã chọn. (Hành vi "cookie sai → dự án đầu" của getCurrentProjectId
// thường KHÔNG đổi — route này dùng bản Strict.)

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);

test(
  "A1-AC03: POST /api/import/excel với cookie dự án sai kiểu/vượt safe-integer ⇒ 404, không ghi",
  S,
  async () => {
    const { insertId, queryOne, run } = await import("@/lib/db");
    const { POST } = await import("@/app/api/import/excel/route");
    const orgKhac = await insertId(
      `INSERT INTO organizations (name) VALUES (?)`,
      `A1AC03 khác ${RUN}`,
    );
    const pKhac = await insertId(
      `INSERT INTO projects (name, org_id) VALUES (?, ?)`,
      `A1AC03 org khác ${RUN}`,
      orgKhac,
    );
    const p = await insertId(`INSERT INTO projects (name, org_id) VALUES (?, 1)`, `A1AC03 ${RUN}`);
    const admin = {
      id: await insertId(
        `INSERT INTO users (name, email, password_hash, role, org_id) VALUES ('A1AC03', ?, 'h-a1ac03', 'admin', 1)`,
        `a1ac03-${RUN}@test.local`,
      ),
      passwordHash: "h-a1ac03",
    };
    const tenFile = (i: number | string) => `a1ac03-${RUN}-${i}.xlsx`;
    const goiImport = (ten: string) => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[`a1ac03 ${RUN}`]]), "Khac");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const fd = new FormData();
      fd.set("file", new File([new Uint8Array(buf)], ten));
      return POST(
        new NextRequest("http://localhost/api/import/excel", { method: "POST", body: fd }),
      );
    };
    const soBatch = async () =>
      (
        await queryOne<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM import_batches WHERE source_name LIKE ?`,
          `a1ac03-${RUN}-%`,
        )
      )?.n;
    try {
      await dangNhapDuAn(admin, p);
      const sai = [
        "9007199254740993",
        "9007199254740992",
        String(Number.MAX_SAFE_INTEGER),
        "1e0",
        "0x1",
        "01",
        "true",
        "[1]",
        "-1",
        " 1",
        String(pKhac), // dự án hợp lệ về cú pháp nhưng thuộc tổ chức khác
      ];
      for (const [i, raw] of sai.entries()) {
        datCookie(COOKIE_DU_AN, raw);
        const res = await goiImport(tenFile(i));
        assert.equal(res.status, 404, `cookie ${JSON.stringify(raw)}`);
      }
      assert.equal(await soBatch(), 0, "không được ghi sổ import nào");
      const t = await queryOne<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM towers WHERE project_id IN (?, ?)`,
        p,
        pKhac,
      );
      assert.equal(t?.n, 0, "không được tạo WBS nào");

      // Đối chứng: cookie hợp lệ → 200, sổ import gắn đúng dự án đã chọn.
      datCookie(COOKIE_DU_AN, String(p));
      assert.equal((await goiImport(tenFile("ok"))).status, 200);
      const batch = await queryOne<{ projectId: number }>(
        `SELECT project_id AS "projectId" FROM import_batches WHERE source_name = ?`,
        tenFile("ok"),
      );
      assert.equal(batch?.projectId, p);
    } finally {
      dangXuat();
      await run(`DELETE FROM import_batches WHERE source_name LIKE ?`, `a1ac03-${RUN}-%`);
      await run(`DELETE FROM user_projects WHERE user_id = ?`, admin.id);
      await run(`DELETE FROM users WHERE id = ?`, admin.id);
      // Import đối chứng tạo tháp mặc định cho dự án (không sheet tracking nào nên không có WBS con).
      await run(
        `DELETE FROM sheet_types WHERE tower_id IN (SELECT id FROM towers WHERE project_id = ?)`,
        p,
      );
      await run(`DELETE FROM towers WHERE project_id = ?`, p);
      await run(`DELETE FROM projects WHERE id IN (?, ?)`, p, pKhac);
      await run(`DELETE FROM organizations WHERE id = ?`, orgKhac);
    }
  },
);
