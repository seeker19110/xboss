import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn } from "./helpers/phien";
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// QUALITY-FINAL-1 S02b (A1-AC02/AC03): file/QC/HSE/thông báo. Gọi route thật.
// Mỗi route: user không có dự án khả kiến → 404 (chi tiết/ghi/zip) hoặc 200 rỗng (danh sách);
// id thuộc dự án khác cùng org → 404 (DELETE: dòng + file còn nguyên); đúng dự án → như cũ.

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let seq = 0;
const PDF = Buffer.from("%PDF-1.4\nS02b\n%%EOF");

type U = { id: number; passwordHash: string };
type Side = {
  project: number;
  task: number;
  corrFile: number;
  corrFileName: string;
  hsePhoto: number;
  hsePhotoName: string;
  inspReq: number;
  taskDoc: number;
  qcInsp: number;
  warranty: number;
};
const ctx = {} as { A: Side; B: Side; userA: U; userNone: U };

async function taoUser(role: string): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02b', ?, 1)`,
    `S02b ${RUN}`,
    `s02b-${RUN}-${++seq}@test.local`,
    role,
  );
  return { id, passwordHash: "hash-s02b" };
}

async function taoPhia(tag: string, uploader: number): Promise<Side> {
  const { insertId, run } = await import("@/lib/db");
  const { storagePut } = await import("@/lib/nen/storage");
  const project = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, 1)`,
    `S02b ${tag} ${RUN}`,
  );
  const tower = await insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`, project);
  const sheet = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, 'S02B', 'Sheet', ?)`,
    tower,
    `s02b-${RUN}-${tag}`,
  );
  const wp = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label) VALUES (?, 'A1', 'Nhóm', 'T1')`,
    sheet,
  );
  // Task đã 100% nhưng quá hạn ở trạng thái thi công → vừa dùng cho YCNT, vừa là "trễ"
  // với feed (progress<1 không thoả) — nên tạo thêm task trễ riêng.
  const task = await insertId(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status) VALUES (?, ?, 'Task xong', 1, 'hoan_thanh')`,
    wp,
    `A1,01-${tag}`,
  );
  await run(
    `INSERT INTO tasks (package_id, code, name, progress_percent, status, end_date)
     VALUES (?, ?, ?, 0.2, 'dang_thi_cong', '2020-01-01')`,
    wp,
    `A1,02-${tag}`,
    `Task trễ S02b ${RUN} ${tag}`,
  );

  const corr = await insertId(
    `INSERT INTO correspondences (code, direction, counterparty, subject, sent_date, project_id)
     VALUES (?, 'in', 'CĐT', 'Công văn', '2026-01-01', ?)`,
    `CV-${RUN}-${tag}`,
    project,
  );
  const corrFileName = `s02b-cv-${RUN}-${tag}.pdf`;
  await storagePut(1, corrFileName, PDF);
  const corrFile = await insertId(
    `INSERT INTO correspondence_files (correspondence_id, file_name, mime_type, uploaded_by)
     VALUES (?, ?, 'application/pdf', ?)`,
    corr,
    corrFileName,
    uploader,
  );

  const hse = await insertId(
    `INSERT INTO hse_records (project_id, kind, record_date, description)
     VALUES (?, 'inspection', '2026-01-01', 'HSE')`,
    project,
  );
  const hsePhotoName = `s02b-hse-${RUN}-${tag}.jpg`;
  await storagePut(1, hsePhotoName, PDF);
  const hsePhoto = await insertId(
    `INSERT INTO hse_photos (record_id, file_path, mime, uploaded_by) VALUES (?, ?, 'image/jpeg', ?)`,
    hse,
    hsePhotoName,
    uploader,
  );

  const inspReq = await insertId(
    `INSERT INTO inspection_requests (code, scheduled_at, created_by) VALUES (?, NOW(), ?)`,
    `YCNT-S02B-${RUN}-${tag}`,
    uploader,
  );
  await run(
    `INSERT INTO inspection_request_tasks (request_id, task_id) VALUES (?, ?)`,
    inspReq,
    task,
  );

  const docName = `s02b-doc-${RUN}-${tag}.pdf`;
  await storagePut(1, docName, PDF);
  const taskDoc = await insertId(
    `INSERT INTO task_documents (task_id, file_name, original_name, mime_type, size_bytes, doc_category)
     VALUES (?, ?, ?, 'application/pdf', 1, 'cong_viec')`,
    task,
    docName,
    `ho-so-${tag}.pdf`,
  );

  const checklist = await insertId(
    `INSERT INTO qc_checklists (name, project_id) VALUES ('CL S02b', ?)`,
    project,
  );
  const qcInsp = await insertId(
    `INSERT INTO qc_inspections (checklist_id, task_id) VALUES (?, ?)`,
    checklist,
    task,
  );

  const warranty = await insertId(
    `INSERT INTO warranty_items (project_id, title) VALUES (?, 'BH S02b')`,
    project,
  );

  return {
    project,
    task,
    corrFile,
    corrFileName,
    hsePhoto,
    hsePhotoName,
    inspReq,
    taskDoc,
    qcInsp,
    warranty,
  };
}

const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
const p = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

before(async () => {
  if (!HAS_TEST_DB) return;
  ctx.userA = await taoUser("pm");
  ctx.userNone = await taoUser("pm");
  ctx.A = await taoPhia("A", ctx.userA.id);
  ctx.B = await taoPhia("B", ctx.userA.id);
  // Gán userA vào A ⇒ user_projects khác rỗng ⇒ userNone (không gán) không thấy dự án nào.
  await dangNhapDuAn(ctx.userA, ctx.A.project);
});

const asNone = () => dangNhapDuAn(ctx.userNone, null);
const asA = () => dangNhapDuAn(ctx.userA, ctx.A.project);

async function dem(sql: string, ...args: unknown[]) {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ n: number }>(sql, ...args))!.n;
}

test("correspondence-files/:id GET+DELETE: không dự án/dự án khác → 404, file còn", S, async () => {
  const { GET, DELETE } = await import("@/app/api/correspondence-files/[id]/route");
  const { storageGet } = await import("@/lib/nen/storage");
  await asNone();
  assert.equal((await GET(req("/x"), p(ctx.B.corrFile))).status, 404);
  assert.equal((await DELETE(req("/x", "DELETE"), p(ctx.B.corrFile))).status, 404);
  await asA();
  assert.equal((await GET(req("/x"), p(ctx.B.corrFile))).status, 404);
  assert.equal((await DELETE(req("/x", "DELETE"), p(ctx.B.corrFile))).status, 404);
  assert.equal(
    await dem(`SELECT COUNT(*)::int AS n FROM correspondence_files WHERE id = ?`, ctx.B.corrFile),
    1,
  );
  assert.ok(await storageGet(1, ctx.B.corrFileName), "file dự án B còn trên đĩa");

  const ok = await GET(req("/x"), p(ctx.A.corrFile));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Content-Type"), "application/pdf");
  assert.equal((await DELETE(req("/x", "DELETE"), p(ctx.A.corrFile))).status, 200);
});

test("hse-photos/:id GET+DELETE: không dự án/dự án khác → 404, ảnh còn", S, async () => {
  const { GET, DELETE } = await import("@/app/api/hse-photos/[id]/route");
  const { storageGet } = await import("@/lib/nen/storage");
  await asNone();
  assert.equal((await GET(req("/x"), p(ctx.B.hsePhoto))).status, 404);
  assert.equal((await DELETE(req("/x", "DELETE"), p(ctx.B.hsePhoto))).status, 404);
  await asA();
  assert.equal((await GET(req("/x"), p(ctx.B.hsePhoto))).status, 404);
  assert.equal((await DELETE(req("/x", "DELETE"), p(ctx.B.hsePhoto))).status, 404);
  assert.equal(
    await dem(`SELECT COUNT(*)::int AS n FROM hse_photos WHERE id = ?`, ctx.B.hsePhoto),
    1,
  );
  assert.ok(await storageGet(1, ctx.B.hsePhotoName), "ảnh dự án B còn trên đĩa");

  assert.equal((await GET(req("/x"), p(ctx.A.hsePhoto))).status, 200);
  assert.equal((await DELETE(req("/x", "DELETE"), p(ctx.A.hsePhoto))).status, 200);
});

test("inspection-requests GET: không dự án → 200 rỗng; dự án A không lộ phiếu B", S, async () => {
  const { GET } = await import("@/app/api/inspection-requests/route");
  await asNone();
  const none = await GET(req("/api/inspection-requests"));
  assert.equal(none.status, 200);
  assert.deepEqual(await none.json(), { requests: [] });
  await asA();
  const res = await GET(req("/api/inspection-requests"));
  const ids = ((await res.json()).requests as { id: number }[]).map((r) => r.id);
  assert.ok(ids.includes(ctx.A.inspReq));
  assert.ok(!ids.includes(ctx.B.inspReq));
});

test(
  "inspection-requests POST: không dự án/task dự án khác → 404, không tạo phiếu",
  S,
  async () => {
    const { POST } = await import("@/app/api/inspection-requests/route");
    const truoc = await dem(`SELECT COUNT(*)::int AS n FROM inspection_requests`);
    const body = (taskId: number) => ({ scheduledAt: "2026-12-01T08:00:00Z", taskIds: [taskId] });
    await asNone();
    assert.equal(
      (await POST(req("/api/inspection-requests", "POST", body(ctx.B.task)))).status,
      404,
    );
    await asA();
    assert.equal(
      (await POST(req("/api/inspection-requests", "POST", body(ctx.B.task)))).status,
      404,
    );
    assert.equal(await dem(`SELECT COUNT(*)::int AS n FROM inspection_requests`), truoc);
    assert.equal(
      (await POST(req("/api/inspection-requests", "POST", body(ctx.A.task)))).status,
      201,
    );
  },
);

test("qc/documents GET: không dự án → 200 rỗng; dự án A không lộ hồ sơ B", S, async () => {
  const { GET } = await import("@/app/api/qc/documents/route");
  await asNone();
  const none = await GET(req("/api/qc/documents"));
  assert.equal(none.status, 200);
  assert.deepEqual(await none.json(), { documents: [] });
  await asA();
  const ids = (
    (await (await GET(req("/api/qc/documents"))).json()).documents as { id: number }[]
  ).map((d) => d.id);
  assert.ok(ids.includes(ctx.A.taskDoc));
  assert.ok(!ids.includes(ctx.B.taskDoc));
});

test("qc/documents/export/zip GET: không dự án → 404; dự án A chỉ nén file A", S, async () => {
  const { GET } = await import("@/app/api/qc/documents/export/zip/route");
  await asNone();
  assert.equal((await GET(req("/api/qc/documents/export/zip"))).status, 404);
  await asA();
  const res = await GET(req("/api/qc/documents/export/zip"));
  assert.equal(res.status, 200);
  const zip = Buffer.from(await res.arrayBuffer()).toString("latin1");
  assert.ok(zip.includes("ho-so-A.pdf"), "có file dự án A");
  assert.ok(!zip.includes("ho-so-B.pdf"), "không nén file dự án B");
});

test("qc/inspections GET: không dự án → 200 rỗng; dự án A không lộ B", S, async () => {
  const { GET } = await import("@/app/api/qc/inspections/route");
  await asNone();
  const none = await GET(req("/api/qc/inspections"));
  assert.equal(none.status, 200);
  assert.deepEqual(await none.json(), { inspections: [] });
  await asA();
  const ids = (
    (await (await GET(req("/api/qc/inspections"))).json()).inspections as { id: number }[]
  ).map((i) => i.id);
  assert.ok(ids.includes(ctx.A.qcInsp));
  assert.ok(!ids.includes(ctx.B.qcInsp));
});

test(
  "warranty-items/:id GET (chốt hồi quy): không dự án/dự án khác → 404; đúng → 200",
  S,
  async () => {
    const { GET } = await import("@/app/api/warranty-items/[id]/route");
    await asNone();
    assert.equal((await GET(req("/x"), p(ctx.B.warranty))).status, 404);
    await asA();
    assert.equal((await GET(req("/x"), p(ctx.B.warranty))).status, 404);
    const ok = await GET(req("/x"), p(ctx.A.warranty));
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).item.id, ctx.A.warranty);
  },
);

test(
  "notifications GET: không dự án → không đồng bộ toàn hệ, vẫn trả thông báo riêng",
  S,
  async () => {
    const { GET } = await import("@/app/api/notifications/route");
    const { insertId } = await import("@/lib/db");
    const rieng = await insertId(
      `INSERT INTO notifications (user_id, type, message) VALUES (?, 'nav_changed', 'Thông báo riêng')`,
      ctx.userNone.id,
    );
    await asNone();
    const res = await GET(req("/api/notifications"));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.notifications) && typeof data.unread === "number");
    assert.deepEqual(
      (data.notifications as { id: number }[]).map((n) => n.id),
      [rieng],
      "chỉ thông báo riêng của user — không sinh cảnh báo từ dữ liệu dự án nào",
    );
    assert.equal(
      await dem(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ?`, ctx.userNone.id),
      1,
    );

    await asA();
    const a = await (await GET(req("/api/notifications?limit=1000"))).json();
    const msgs = (a.notifications as { message: string }[]).map((n) => n.message).join("\n");
    assert.ok(msgs.includes(`Task trễ S02b ${RUN} A`), "đúng dự án → có cảnh báo trễ A");
    assert.ok(!msgs.includes(`Task trễ S02b ${RUN} B`), "không sinh cảnh báo dự án B");
  },
);

test(
  "notifications/feed GET: không dự án → 200 rỗng đúng shape; dự án A không lộ B",
  S,
  async () => {
    const { GET } = await import("@/app/api/notifications/feed/route");
    await asNone();
    const none = await GET();
    assert.equal(none.status, 200);
    const d = await none.json();
    for (const k of ["overdue", "dueSoon", "upcomingStart", "recentActivity", "materialOver"])
      assert.deepEqual(d[k], [], k);
    assert.equal(d.fullAccess, true);
    assert.equal(d.role, "pm");

    await asA();
    const a = await (await GET()).json();
    const names = (a.overdue as { name: string }[]).map((t) => t.name);
    assert.ok(names.includes(`Task trễ S02b ${RUN} A`));
    assert.ok(!names.includes(`Task trễ S02b ${RUN} B`));
  },
);
