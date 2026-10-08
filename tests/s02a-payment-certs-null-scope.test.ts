import { HAS_TEST_DB } from "./setup";
import { dangNhap, dangXuat } from "./helpers/phien";
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// S02a (A1-AC02): user KHÔNG có dự án khả kiến (getCurrentProjectId → null) gọi chi tiết/Excel/
// PDF đợt IPC → 404, không đọc dữ liệu đợt của dự án nào. Trước bản này 3 route mở GUC RLS "*"
// rồi mới dựa vào helper lọc project để fail-closed; nay chặn ngay đầu handler. Test là chốt hồi
// quy cho cả hai lớp (helper vẫn lọc project — gỡ guard đầu handler test vẫn phải xanh).

const S = { skip: !HAS_TEST_DB };
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

async function dung() {
  const { insertId, queryOne, run } = await import("@/lib/db");
  const projectId = await insertId(
    `INSERT INTO projects (name, org_id) VALUES (?, 1)`,
    `IPC null scope ${RUN}`,
  );
  const taoUser = async (role: string, tag: string) => {
    const id = await insertId(
      `INSERT INTO users (name, email, password_hash, role, org_id)
       VALUES (?, ?, 'hash-ipc-null-scope', ?, 1)`,
      `IPC null ${RUN}`,
      `ipc-null-${RUN}-${tag}@test.local`,
      role,
    );
    const row = await queryOne<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = ?`,
      id,
    );
    return { id, passwordHash: row!.password_hash };
  };
  // user_projects có ít nhất 1 dòng (của người khác) → pm không được gán thấy 0 dự án.
  const nguoiKhac = await taoUser("engineer", "khac");
  await run(
    `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`,
    nguoiKhac.id,
    projectId,
  );
  const pm = await taoUser("pm", "pm");
  const contractId = await insertId(
    `INSERT INTO contracts (code, kind, title, party_name, value, status, project_id)
     VALUES (?, 'nhan_thau', 'HĐ IPC null', 'CĐT', 10000, 'active', ?)`,
    `HD-IPC-NULL-${RUN}`,
    projectId,
  );
  const certId = await insertId(
    `INSERT INTO payment_certs (code, contract_id, period_no, status)
     VALUES (?, ?, 1, 'draft')`,
    `IPC-NULL-${RUN}`,
    contractId,
  );
  return { projectId, pm, nguoiKhac, contractId, certId };
}

async function don(f: Awaited<ReturnType<typeof dung>>) {
  const { run } = await import("@/lib/db");
  await run(`DELETE FROM payment_certs WHERE id = ?`, f.certId);
  await run(`DELETE FROM contracts WHERE id = ?`, f.contractId);
  await run(`DELETE FROM user_projects WHERE project_id = ?`, f.projectId);
  await run(`DELETE FROM users WHERE id IN (?, ?)`, f.pm.id, f.nguoiKhac.id);
  await run(`DELETE FROM projects WHERE id = ?`, f.projectId);
  dangXuat();
}

const req = (url: string) => new NextRequest(`http://localhost${url}`, { method: "GET" });
const thamSo = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

test("S02a IPC: user không có dự án khả kiến → GET chi tiết/Excel/PDF đều 404", S, async () => {
  const f = await dung();
  try {
    dangNhap(f.pm, f.projectId); // cookie trỏ dự án user KHÔNG được gán → resolver trả null
    const { GET: CHI_TIET } = await import("@/app/api/payment-certs/[id]/route");
    const { GET: EXCEL } = await import("@/app/api/payment-certs/[id]/excel/route");
    const { GET: PDF } = await import("@/app/api/payment-certs/[id]/pdf/route");
    for (const [ten, goi] of [
      ["chi tiết", () => CHI_TIET(req(`/api/payment-certs/${f.certId}`), thamSo(f.certId))],
      ["excel", () => EXCEL(req(`/api/payment-certs/${f.certId}/excel`), thamSo(f.certId))],
      ["pdf", () => PDF(req(`/api/payment-certs/${f.certId}/pdf`), thamSo(f.certId))],
    ] as const) {
      const res = await goi();
      assert.equal(res.status, 404, `${ten}: phải 404`);
      const body = await res.text();
      assert.doesNotMatch(body, new RegExp(`IPC-NULL-${RUN}`), `${ten}: không lộ mã đợt`);
    }
    // Đối chứng: gán pm vào dự án → cùng request đọc được (404 ở trên đúng do thiếu scope).
    const { run } = await import("@/lib/db");
    await run(
      `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`,
      f.pm.id,
      f.projectId,
    );
    const ok = await CHI_TIET(req(`/api/payment-certs/${f.certId}`), thamSo(f.certId));
    assert.equal(ok.status, 200);
  } finally {
    await don(f);
  }
});
