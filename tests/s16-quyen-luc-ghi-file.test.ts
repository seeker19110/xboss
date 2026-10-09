import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat, requestRieng } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { SoFixture, jreq, P, goi, uniq, type NguoiTest } from "./helpers/chuoi-nghiep-vu";

// S16 §4 (a)(b) — route ghi KÈM FILE: tái kiểm quyền lúc ghi (D01) + thứ tự "lưu file mới → ghi DB
// → mới xoá file cũ". Hai route: PATCH /api/insurance-bonds/:id (multipart) và
// POST /api/tenders/:id/bids/:bidId/file.
//
// Điểm chèn: một kết nối riêng giữ khoá advisory ĐỘC QUYỀN của org (đúng khoá setPermissionOverride
// dùng) và trong cùng transaction chèn override siết quyền theo dự án của ca. Route thật đã xác thực
// (snapshot cũ = còn quyền) rồi kẹt ở bước tái kiểm (khoá chia sẻ); COMMIT ⇒ tái kiểm thấy deny.
// Code cũ không tái kiểm nên không kẹt — ca vẫn chạy tới cuối và assert 403 đỏ.

const S = { skip: !HAS_TEST_DB };
const ORG = 1;
const PDF_CU = Buffer.from("%PDF-1.4\nfile cu\n%%EOF");
const PDF_MOI = Buffer.from("%PDF-1.4\nfile moi\n%%EOF");

test.after(() => dangXuat());

type KetQua = { status: number; body: Record<string, unknown> | null };

/** Chạy `r1` trong lúc giữ khoá quyền org; nếu `thuHoi` thì chèn override deny trước khi COMMIT. */
async function chenTaiKiem(
  r1: () => Promise<KetQua>,
  thuHoi: { permKey: string; projectId: number } | null,
): Promise<KetQua> {
  const { getPool } = await import("@/lib/db");
  const c = await getPool().connect();
  let daNha = false;
  const nha = async () => {
    if (daNha) return;
    daNha = true;
    await c.query("COMMIT").catch(() => {});
    c.release();
  };
  try {
    await c.query("BEGIN");
    const pid = (await c.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `role_permissions:${ORG}`,
    ]);
    if (thuHoi)
      await c.query(
        `INSERT INTO role_permissions (role, perm_key, allowed, project_id, org_id)
         VALUES ('pm', $1, false, $2, $3)`,
        [thuHoi.permKey, thuHoi.projectId, ORG],
      );
    let xong = false;
    const dangBay = r1().finally(() => (xong = true));
    // Đợi R1 kẹt ở bước tái kiểm (code cũ không kẹt ⇒ R1 tự xong, thoát vòng).
    for (let i = 0; i < 200 && !xong; i++) {
      const r = await getPool().query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))`,
        [pid],
      );
      if (r.rows[0].n > 0) break;
      await new Promise((ok) => setTimeout(ok, 25));
    }
    await nha();
    return await dangBay;
  } finally {
    await nha();
  }
}

async function coFile(fileName: string): Promise<boolean> {
  const { storageGet } = await import("@/lib/nen/storage");
  return (await storageGet(ORG, fileName)) != null;
}

async function datFile(fileName: string, buf: Buffer): Promise<void> {
  const { storagePut } = await import("@/lib/nen/storage");
  await storagePut(ORG, fileName, buf);
}

/** File trong storage có tiền tố `prefix` (file mới do server sinh tên). */
async function fileTheoTienTo(prefix: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  const { UPLOAD_DIR } = await import("@/lib/nen/photos");
  return (await readdir(UPLOAD_DIR).catch(() => [] as string[])).filter((f) =>
    f.startsWith(prefix),
  );
}

function formReq(url: string, form: FormData, method: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method, body: form });
}

function pdfForm(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  form.set("file", new File([new Uint8Array(PDF_MOI)], "moi.pdf", { type: "application/pdf" }));
  return form;
}

async function donThem(projectId: number, fileNames: string[]): Promise<void> {
  const { run } = await import("@/lib/db");
  const { storageDelete } = await import("@/lib/nen/storage");
  for (const f of fileNames) await storageDelete(ORG, f).catch(() => {});
  await run(`DELETE FROM role_permissions WHERE project_id = ?`, projectId);
  await run(`DELETE FROM insurance_bonds WHERE project_id = ?`, projectId);
  await run(
    `DELETE FROM tender_bids WHERE tender_id IN (SELECT id FROM tender_packages WHERE project_id = ?)`,
    projectId,
  );
  await run(`DELETE FROM tender_packages WHERE project_id = ?`, projectId);
}

// ── (a) PATCH /api/insurance-bonds/:id ───────────────────────────────────────────────────

async function dungBaoHiem(f: SoFixture) {
  const { run } = await import("@/lib/db");
  const { POST } = await import("@/app/api/insurance-bonds/route");
  const pm = await f.user("pm");
  const projectId = await f.duAn("S16FILEIB");
  await f.vao(pm, projectId);
  const r = await goi(
    requestRieng(() =>
      POST(
        jreq("/api/insurance-bonds", { kind: "car", title: "Bảo hiểm cũ" }, "POST", {
          "content-type": "application/json",
        }),
      ),
    ),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body!.id as number;
  const fileCu = `ib${id}-cu-${uniq("f")}.pdf`;
  await datFile(fileCu, PDF_CU);
  await run(`UPDATE insurance_bonds SET file_name = ? WHERE id = ?`, fileCu, id);
  return { pm, projectId, id, fileCu };
}

async function suaBaoHiem(f: SoFixture, pm: NguoiTest, projectId: number, id: number) {
  const { PATCH } = await import("@/app/api/insurance-bonds/[id]/route");
  await f.vao(pm, projectId);
  return goi(
    requestRieng(() =>
      PATCH(
        formReq(`/api/insurance-bonds/${id}`, pdfForm({ title: "Bảo hiểm mới" }), "PATCH"),
        P(id),
      ),
    ),
  );
}

async function dongBaoHiem(id: number) {
  const { queryOne } = await import("@/lib/db");
  return queryOne<{ title: string; fileName: string | null }>(
    `SELECT title, file_name AS "fileName" FROM insurance_bonds WHERE id = ?`,
    id,
  );
}

test(
  "S16 §4(a): PATCH bảo lãnh kèm file — thu hồi manageContracts lúc ghi ⇒ 403, DB + file cũ giữ nguyên, không sót file mới",
  S,
  async () => {
    const f = new SoFixture();
    let c: Awaited<ReturnType<typeof dungBaoHiem>> | undefined;
    try {
      c = await dungBaoHiem(f);
      const { id, pm, projectId, fileCu } = c;
      const r1 = await chenTaiKiem(() => suaBaoHiem(f, pm, projectId, id), {
        permKey: "manageContracts",
        projectId,
      });
      assert.equal(r1.status, 403, `ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.deepEqual(await dongBaoHiem(id), { title: "Bảo hiểm cũ", fileName: fileCu });
      assert.equal(await coFile(fileCu), true, "file cũ bị xoá dù không ghi DB");
      assert.deepEqual(
        (await fileTheoTienTo(`ib${id}-`)).filter((x) => x !== fileCu),
        [],
        "sót file mới trên storage",
      );
    } finally {
      if (c) await donThem(c.projectId, await fileTheoTienTo(`ib${c.id}-`));
      await f.don();
    }
  },
);

test(
  "S16 §4(a) (đối chứng): PATCH bảo lãnh kèm file — còn quyền ⇒ 200, DB trỏ file mới, file cũ đã xoá",
  S,
  async () => {
    const f = new SoFixture();
    let c: Awaited<ReturnType<typeof dungBaoHiem>> | undefined;
    try {
      c = await dungBaoHiem(f);
      const { id, pm, projectId, fileCu } = c;
      const r1 = await chenTaiKiem(() => suaBaoHiem(f, pm, projectId, id), null);
      assert.equal(r1.status, 200, JSON.stringify(r1.body));
      const dong = await dongBaoHiem(id);
      assert.equal(dong?.title, "Bảo hiểm mới");
      assert.ok(dong?.fileName && dong.fileName !== fileCu);
      assert.equal(await coFile(dong.fileName), true);
      assert.equal(await coFile(fileCu), false, "file cũ chưa được xoá");
    } finally {
      if (c) await donThem(c.projectId, await fileTheoTienTo(`ib${c.id}-`));
      await f.don();
    }
  },
);

// ── (b) POST /api/tenders/:id/bids/:bidId/file ─────────────────────────────────────────────

async function dungBaoGia(f: SoFixture) {
  const { insertId } = await import("@/lib/db");
  const pm = await f.user("pm");
  const projectId = await f.duAn("S16FILEBID");
  const tenderId = await insertId(
    `INSERT INTO tender_packages (code, name, project_id) VALUES (?, 'Gói thầu S16', ?)`,
    `GT-${uniq("s16")}`,
    projectId,
  );
  const supplierId = await insertId(
    `INSERT INTO suppliers (name, org_id) VALUES (?, ?)`,
    `NCC ${uniq("s16")}`,
    ORG,
  );
  const fileCu = `bid-cu-${uniq("f")}.pdf`;
  await datFile(fileCu, PDF_CU);
  const bidId = await insertId(
    `INSERT INTO tender_bids (tender_id, supplier_id, file_name, original_name, mime_type, size_bytes)
     VALUES (?, ?, ?, 'cu.pdf', 'application/pdf', ?)`,
    tenderId,
    supplierId,
    fileCu,
    PDF_CU.length,
  );
  return { pm, projectId, tenderId, supplierId, bidId, fileCu };
}

async function taiFileBaoGia(
  f: SoFixture,
  pm: NguoiTest,
  projectId: number,
  tenderId: number,
  bidId: number,
) {
  const { POST } = await import("@/app/api/tenders/[id]/bids/[bidId]/file/route");
  await f.vao(pm, projectId);
  return goi(
    requestRieng(() =>
      POST(formReq(`/api/tenders/${tenderId}/bids/${bidId}/file`, pdfForm(), "POST"), {
        params: Promise.resolve({ id: String(tenderId), bidId: String(bidId) }),
      }),
    ),
  );
}

async function fileBaoGia(bidId: number) {
  const { queryOne } = await import("@/lib/db");
  return (
    await queryOne<{ fileName: string | null }>(
      `SELECT file_name AS "fileName" FROM tender_bids WHERE id = ?`,
      bidId,
    )
  )?.fileName;
}

async function donBaoGia(c: Awaited<ReturnType<typeof dungBaoGia>>) {
  const { run } = await import("@/lib/db");
  await donThem(c.projectId, [c.fileCu, ...(await fileTheoTienTo(`bid${c.bidId}-`))]);
  await run(`DELETE FROM suppliers WHERE id = ?`, c.supplierId);
}

test(
  "S16 §4(b): POST file báo giá thầu — thu hồi manageTenders lúc ghi ⇒ 403, DB + file cũ giữ nguyên, không sót file mới",
  S,
  async () => {
    const f = new SoFixture();
    let c: Awaited<ReturnType<typeof dungBaoGia>> | undefined;
    try {
      c = await dungBaoGia(f);
      const { pm, projectId, tenderId, bidId, fileCu } = c;
      const r1 = await chenTaiKiem(() => taiFileBaoGia(f, pm, projectId, tenderId, bidId), {
        permKey: "manageTenders",
        projectId,
      });
      assert.equal(r1.status, 403, `ghi bằng snapshot stale: ${JSON.stringify(r1.body)}`);
      assert.equal(await fileBaoGia(bidId), fileCu);
      assert.equal(await coFile(fileCu), true, "file cũ bị xoá dù không ghi DB");
      assert.deepEqual(await fileTheoTienTo(`bid${bidId}-`), [], "sót file mới trên storage");
    } finally {
      if (c) await donBaoGia(c);
      await f.don();
    }
  },
);

test(
  "S16 §4(b) (đối chứng): POST file báo giá thầu — còn quyền ⇒ 201, DB trỏ file mới, file cũ đã xoá",
  S,
  async () => {
    const f = new SoFixture();
    let c: Awaited<ReturnType<typeof dungBaoGia>> | undefined;
    try {
      c = await dungBaoGia(f);
      const { pm, projectId, tenderId, bidId, fileCu } = c;
      const r1 = await chenTaiKiem(() => taiFileBaoGia(f, pm, projectId, tenderId, bidId), null);
      assert.equal(r1.status, 201, JSON.stringify(r1.body));
      const moi = await fileBaoGia(bidId);
      assert.ok(moi && moi !== fileCu);
      assert.equal(await coFile(moi), true);
      assert.equal(await coFile(fileCu), false, "file cũ chưa được xoá");
    } finally {
      if (c) await donBaoGia(c);
      await f.don();
    }
  },
);
