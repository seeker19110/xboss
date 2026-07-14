import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test(
  "listAllDocuments: gộp đúng từ nhiều nguồn, lọc hệ/tầng/nguồn đúng, lọc quyền đúng theo vai trò",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { listAllDocuments } = await import("@/lib/documents-hub");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = 'dien'`);
    assert.ok(dien, "system 'dien' phải có sẵn từ migration 0005_boq.sql");

    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM Test Hub', 'pm-hub-test@test.local', 'x', 'pm')`,
    );
    const subconId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Subcon Test Hub', 'subcon-hub-test@test.local', 'x', 'subcon')`,
    );
    const viewerId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Viewer Test Hub', 'viewer-hub-test@test.local', 'x', 'viewer')`,
    );

    const projectId = await insertId(`INSERT INTO projects (name) VALUES ('Test Hub')`);
    const towerId = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp Hub')`,
      projectId,
    );
    const sheetId = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, 'HUBDIEN', 'Sheet điện hub', ?)`,
      towerId,
      dien!.id,
    );
    const wpId = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'HUB1', 'Nhóm hub', 'T05')`,
      sheetId,
    );
    // Task giao cho subcon — subcon phải thấy tài liệu này.
    const assignedTaskId = await insertId(
      `INSERT INTO tasks (package_id, code, name, assigned_to) VALUES (?, 'HUB1,01', 'Task giao subcon', ?)`,
      wpId,
      subconId,
    );
    // Task KHÔNG giao cho subcon — subcon không được thấy tài liệu này.
    const otherTaskId = await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, 'HUB1,02', 'Task không giao')`,
      wpId,
    );

    const assignedDocId = await insertId(
      `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by)
       VALUES (?, 'a.pdf', 'a.pdf', 'application/pdf', ?)`,
      assignedTaskId,
      pmId,
    );
    const otherDocId = await insertId(
      `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by)
       VALUES (?, 'b.pdf', 'b.pdf', 'application/pdf', ?)`,
      otherTaskId,
      pmId,
    );

    const contractId = await insertId(
      `INSERT INTO contracts (code, kind, party_name, title, value, status, system_id)
       VALUES ('HD-HUB-TEST', 'nhan_thau', 'CĐT Hub', 'Hợp đồng test hub', 0, 'active', ?)`,
      dien!.id,
    );
    const contractDocId = await insertId(
      `INSERT INTO contract_documents (contract_id, file_name, original_name, mime_type, uploaded_by)
       VALUES (?, 'hd.pdf', 'hd.pdf', 'application/pdf', ?)`,
      contractId,
      pmId,
    );

    // PM (viewPayments=true): thấy cả 2 nguồn, cả 2 task.
    const pmUser = { id: pmId, name: "PM", email: "x", role: "pm" as const };
    const pmDocs = await listAllDocuments(pmUser, null);
    const pmIds = pmDocs.map((d) => `${d.source}:${d.id}`);
    assert.ok(pmIds.includes(`task:${assignedDocId}`));
    assert.ok(pmIds.includes(`task:${otherDocId}`));
    assert.ok(pmIds.includes(`contract:${contractDocId}`));

    // Subcon: chỉ thấy tài liệu của task được giao; không thấy nguồn contract (viewPayments=false).
    const subconUser = { id: subconId, name: "Subcon", email: "x", role: "subcon" as const };
    const subconDocs = await listAllDocuments(subconUser, null);
    const subconIds = subconDocs.map((d) => `${d.source}:${d.id}`);
    assert.ok(subconIds.includes(`task:${assignedDocId}`));
    assert.ok(!subconIds.includes(`task:${otherDocId}`));
    assert.ok(!subconIds.includes(`contract:${contractDocId}`));

    // Viewer: không thấy nguồn contract (CAN.viewPayments=false) nhưng vẫn thấy task documents.
    const viewerUser = { id: viewerId, name: "Viewer", email: "x", role: "viewer" as const };
    const viewerDocs = await listAllDocuments(viewerUser, null);
    const viewerIds = viewerDocs.map((d) => `${d.source}:${d.id}`);
    assert.ok(viewerIds.includes(`task:${assignedDocId}`));
    assert.ok(!viewerIds.includes(`contract:${contractDocId}`));

    // Lọc theo hệ 'dien': cả 2 nguồn đều thuộc hệ điện.
    const bySystem = await listAllDocuments(pmUser, null, { system: "dien" });
    const bySystemIds = bySystem.map((d) => `${d.source}:${d.id}`);
    assert.ok(bySystemIds.includes(`task:${assignedDocId}`));
    assert.ok(bySystemIds.includes(`contract:${contractDocId}`));

    // Lọc theo hệ khác: không còn dòng nào của test này.
    const byOtherSystem = await listAllDocuments(pmUser, null, { system: "nuoc" });
    const byOtherIds = byOtherSystem.map((d) => `${d.source}:${d.id}`);
    assert.ok(!byOtherIds.includes(`task:${assignedDocId}`));

    // Lọc theo tầng T05: chỉ 2 dòng task (có tầng); hợp đồng không có tầng nên bị ẩn.
    const byFloor = await listAllDocuments(pmUser, null, { floor: "T05" });
    const byFloorIds = byFloor.map((d) => `${d.source}:${d.id}`);
    assert.ok(byFloorIds.includes(`task:${assignedDocId}`));
    assert.ok(!byFloorIds.includes(`contract:${contractDocId}`));

    // Lọc theo nguồn 'contract': chỉ còn dòng hợp đồng.
    const bySource = await listAllDocuments(pmUser, null, { source: "contract" });
    assert.ok(bySource.every((d) => d.source === "contract"));
    assert.ok(bySource.some((d) => d.id === contractDocId));

    // Tìm kiếm theo tiêu đề (title = tên task/hợp đồng).
    const bySearch = await listAllDocuments(pmUser, null, { q: "test hub" });
    const bySearchIds = bySearch.map((d) => `${d.source}:${d.id}`);
    assert.ok(bySearchIds.includes(`contract:${contractDocId}`));

    await run(`DELETE FROM contracts WHERE id = ?`, contractId); // cascade xoá contract_documents
    await run(`DELETE FROM task_documents WHERE task_id IN (?, ?)`, assignedTaskId, otherTaskId);
    await run(`DELETE FROM tasks WHERE id IN (?, ?)`, assignedTaskId, otherTaskId);
    await run(`DELETE FROM work_packages WHERE id = ?`, wpId);
    await run(`DELETE FROM sheet_types WHERE id = ?`, sheetId);
    await run(`DELETE FROM towers WHERE id = ?`, towerId);
    await run(`DELETE FROM projects WHERE id = ?`, projectId);
    await run(`DELETE FROM users WHERE id IN (?, ?, ?)`, pmId, subconId, viewerId);
  },
);

test(
  "listAllDocuments: nguồn bản vẽ (drawing) hiện cho mọi vai trò kể cả subcon",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listAllDocuments } = await import("@/lib/documents-hub");

    const drawingId = await insertId(
      `INSERT INTO drawings (code, name, kind) VALUES ('DWG-HUB-TEST', 'Bản vẽ test hub', 'shop')`,
    );
    const revId = await insertId(
      `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status)
       VALUES (?, 'A', 'dwg.pdf', 'application/pdf', 'approved')`,
      drawingId,
    );

    const subconUser = { id: 999_999, name: "Subcon", email: "x", role: "subcon" as const };
    const docs = await listAllDocuments(subconUser, null);
    assert.ok(docs.some((d) => d.source === "drawing" && d.id === revId));

    await run(`DELETE FROM drawings WHERE id = ?`, drawingId); // cascade xoá drawing_revisions
  },
);

test(
  "listAllDocuments: lọc theo projectId — không lộ tài liệu contract/vo/drawing/project/task của dự án khác (M22)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId, queryOne } = await import("@/lib/db");
    const { listAllDocuments } = await import("@/lib/documents-hub");

    const dien = await queryOne<{ id: number }>(`SELECT id FROM systems WHERE code = 'dien'`);
    assert.ok(dien, "system 'dien' phải có sẵn từ migration 0005_boq.sql");

    const pmId = await insertId(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('PM Test Hub Scope', 'pm-hub-scope-test@test.local', 'x', 'pm')`,
    );
    const pmUser = { id: pmId, name: "PM", email: "x", role: "pm" as const };

    // Dựng 2 dự án A/B, mỗi dự án có đủ 5 nguồn tài liệu.
    async function seedProject(label: string) {
      const projectId = await insertId(
        `INSERT INTO projects (name) VALUES (?)`,
        `Test Scope ${label}`,
      );
      const towerId = await insertId(
        `INSERT INTO towers (project_id, name) VALUES (?, ?)`,
        projectId,
        `Tháp ${label}`,
      );
      const sheetId = await insertId(
        `INSERT INTO sheet_types (tower_id, code, name, system_id) VALUES (?, ?, ?, ?)`,
        towerId,
        `SC${label}`,
        `Sheet ${label}`,
        dien!.id,
      );
      const wpId = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, ?)`,
        sheetId,
        `SC${label}1`,
        `Nhóm ${label}`,
      );
      const taskId = await insertId(
        `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, ?)`,
        wpId,
        `SC${label}1,01`,
        `Task ${label}`,
      );
      const taskDocId = await insertId(
        `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, uploaded_by)
         VALUES (?, ?, ?, 'application/pdf', ?)`,
        taskId,
        `t-${label}.pdf`,
        `t-${label}.pdf`,
        pmId,
      );

      const contractId = await insertId(
        `INSERT INTO contracts (code, kind, party_name, title, value, status, system_id, project_id)
         VALUES (?, 'nhan_thau', 'CĐT', ?, 0, 'active', ?, ?)`,
        `HD-SC-${label}`,
        `Hợp đồng ${label}`,
        dien!.id,
        projectId,
      );
      const contractDocId = await insertId(
        `INSERT INTO contract_documents (contract_id, file_name, original_name, mime_type, uploaded_by)
         VALUES (?, ?, ?, 'application/pdf', ?)`,
        contractId,
        `hd-${label}.pdf`,
        `hd-${label}.pdf`,
        pmId,
      );

      const voId = await insertId(
        `INSERT INTO variation_orders (code, reason, title, status, system_id, project_id)
         VALUES (?, 'design_change', ?, 'draft', ?, ?)`,
        `VO-SC-${label}`,
        `VO ${label}`,
        dien!.id,
        projectId,
      );
      const voDocId = await insertId(
        `INSERT INTO vo_documents (vo_id, file_name, original_name, mime_type, uploaded_by)
         VALUES (?, ?, ?, 'application/pdf', ?)`,
        voId,
        `vo-${label}.pdf`,
        `vo-${label}.pdf`,
        pmId,
      );

      const drawingId = await insertId(
        `INSERT INTO drawings (code, name, kind, project_id) VALUES (?, ?, 'shop', ?)`,
        `DWG-SC-${label}`,
        `Bản vẽ ${label}`,
        projectId,
      );
      const drawingRevId = await insertId(
        `INSERT INTO drawing_revisions (drawing_id, rev, file_name, mime_type, status)
         VALUES (?, 'A', ?, 'application/pdf', 'approved')`,
        drawingId,
        `dwg-${label}.pdf`,
      );

      const projectDocId = await insertId(
        `INSERT INTO project_documents (title, file_name, original_name, mime_type, uploaded_by, project_id)
         VALUES (?, ?, ?, 'application/pdf', ?, ?)`,
        `File dự án ${label}`,
        `pd-${label}.pdf`,
        `pd-${label}.pdf`,
        pmId,
        projectId,
      );

      return {
        projectId,
        towerId,
        sheetId,
        wpId,
        taskId,
        taskDocId,
        contractId,
        contractDocId,
        voId,
        voDocId,
        drawingId,
        drawingRevId,
        projectDocId,
      };
    }

    const a = await seedProject("A");
    const b = await seedProject("B");

    const docsA = await listAllDocuments(pmUser, a.projectId);
    const idsA = docsA.map((d) => `${d.source}:${d.id}`);
    assert.ok(idsA.includes(`task:${a.taskDocId}`));
    assert.ok(idsA.includes(`contract:${a.contractDocId}`));
    assert.ok(idsA.includes(`vo:${a.voDocId}`));
    assert.ok(idsA.includes(`drawing:${a.drawingRevId}`));
    assert.ok(idsA.includes(`project:${a.projectDocId}`));
    // Không lẫn tài liệu của dự án B.
    assert.ok(!idsA.includes(`task:${b.taskDocId}`));
    assert.ok(!idsA.includes(`contract:${b.contractDocId}`));
    assert.ok(!idsA.includes(`vo:${b.voDocId}`));
    assert.ok(!idsA.includes(`drawing:${b.drawingRevId}`));
    assert.ok(!idsA.includes(`project:${b.projectDocId}`));

    // projectId = null: không lọc, thấy tài liệu cả 2 dự án (tương thích ngược).
    const docsAll = await listAllDocuments(pmUser, null);
    const idsAll = docsAll.map((d) => `${d.source}:${d.id}`);
    assert.ok(idsAll.includes(`task:${a.taskDocId}`));
    assert.ok(idsAll.includes(`task:${b.taskDocId}`));

    for (const p of [a, b]) {
      await run(`DELETE FROM contracts WHERE id = ?`, p.contractId); // cascade contract_documents
      await run(`DELETE FROM variation_orders WHERE id = ?`, p.voId); // cascade vo_documents
      await run(`DELETE FROM drawings WHERE id = ?`, p.drawingId); // cascade drawing_revisions
      await run(`DELETE FROM project_documents WHERE id = ?`, p.projectDocId);
      await run(`DELETE FROM task_documents WHERE id = ?`, p.taskDocId);
      await run(`DELETE FROM tasks WHERE id = ?`, p.taskId);
      await run(`DELETE FROM work_packages WHERE id = ?`, p.wpId);
      await run(`DELETE FROM sheet_types WHERE id = ?`, p.sheetId);
      await run(`DELETE FROM towers WHERE id = ?`, p.towerId);
      await run(`DELETE FROM projects WHERE id = ?`, p.projectId);
    }
    await run(`DELETE FROM users WHERE id = ?`, pmId);
  },
);
