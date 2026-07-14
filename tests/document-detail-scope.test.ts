import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// M22 — 3 route stream/xoá file đính kèm theo id (contract-documents, correspondence-files,
// hse-photos) trước đây không lọc theo dự án đang chọn. Test này mirror đúng câu SELECT
// (JOIN + WHERE project_id) đã thêm trong từng route: id thuộc project A → chỉ thấy khi
// context = project A; context = project B (hoặc null id không khớp) → không thấy (404).

test(
  "contract-documents: tài liệu HĐ chỉ thấy khi lọc đúng project_id của hợp đồng cha",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA Tài liệu HĐ 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA Tài liệu HĐ 2')`);

    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, title, value, status, project_id)
       VALUES ('HD-SCOPE-TEST', 'nhan_thau', 'HĐ test scope', 0, 'active', ?)`,
      p1,
    );
    const docId = await insertId(
      `INSERT INTO contract_documents (contract_id, file_name, mime_type)
       VALUES (?, 'a.pdf', 'application/pdf')`,
      contractId,
    );

    const findInProject = (id: number, projectId: number | null) => {
      const conds = ["cd.id = ?"];
      const args: unknown[] = [id];
      if (projectId != null) {
        conds.push("c.project_id = ?");
        args.push(projectId);
      }
      return queryOne<{ id: number }>(
        `SELECT cd.id
           FROM contract_documents cd JOIN contracts c ON c.id = cd.contract_id
          WHERE ${conds.join(" AND ")}`,
        ...args,
      );
    };

    assert.ok(await findInProject(docId, p1), "context project A phải thấy tài liệu của A");
    assert.equal(await findInProject(docId, p2), undefined, "context project B không được thấy");

    await run(`DELETE FROM contracts WHERE id = ?`, contractId); // cascade xoá contract_documents
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "correspondence-files: file công văn chỉ thấy khi lọc đúng project_id của công văn cha",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA Công văn 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA Công văn 2')`);

    const corrId = await insertId(
      `INSERT INTO correspondences (code, direction, counterparty, subject, sent_date, project_id)
       VALUES ('CV-SCOPE-TEST', 'in', 'CĐT', 'Công văn test scope', '2026-01-01', ?)`,
      p1,
    );
    const fileId = await insertId(
      `INSERT INTO correspondence_files (correspondence_id, file_name, mime_type)
       VALUES (?, 'cv.pdf', 'application/pdf')`,
      corrId,
    );

    const findInProject = (id: number, projectId: number | null) => {
      const conds = ["cf.id = ?"];
      const args: unknown[] = [id];
      if (projectId != null) {
        conds.push("c.project_id = ?");
        args.push(projectId);
      }
      return queryOne<{ id: number }>(
        `SELECT cf.id
           FROM correspondence_files cf JOIN correspondences c ON c.id = cf.correspondence_id
          WHERE ${conds.join(" AND ")}`,
        ...args,
      );
    };

    assert.ok(await findInProject(fileId, p1), "context project A phải thấy file của A");
    assert.equal(await findInProject(fileId, p2), undefined, "context project B không được thấy");

    await run(`DELETE FROM correspondences WHERE id = ?`, corrId); // cascade xoá correspondence_files
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);

test(
  "hse-photos: ảnh HSE chỉ thấy khi lọc đúng project_id của biên bản cha",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");

    const p1 = await insertId(`INSERT INTO projects (name) VALUES ('DA HSE 1')`);
    const p2 = await insertId(`INSERT INTO projects (name) VALUES ('DA HSE 2')`);

    const recordId = await insertId(
      `INSERT INTO hse_records (kind, record_date, description, project_id)
       VALUES ('inspection', '2026-01-01', 'Kiểm tra test scope', ?)`,
      p1,
    );
    const photoId = await insertId(
      `INSERT INTO hse_photos (record_id, file_path, mime)
       VALUES (?, 'x.jpg', 'image/jpeg')`,
      recordId,
    );

    const findInProject = (id: number, projectId: number | null) => {
      const conds = ["p.id = ?"];
      const args: unknown[] = [id];
      if (projectId != null) {
        conds.push("r.project_id = ?");
        args.push(projectId);
      }
      return queryOne<{ id: number }>(
        `SELECT p.id
           FROM hse_photos p JOIN hse_records r ON r.id = p.record_id
          WHERE ${conds.join(" AND ")}`,
        ...args,
      );
    };

    assert.ok(await findInProject(photoId, p1), "context project A phải thấy ảnh của A");
    assert.equal(await findInProject(photoId, p2), undefined, "context project B không được thấy");

    await run(`DELETE FROM hse_records WHERE id = ?`, recordId); // cascade xoá hse_photos
    await run(`DELETE FROM projects WHERE id IN (?, ?)`, p1, p2);
  },
);
