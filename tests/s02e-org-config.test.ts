import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhapDuAn, type NguoiDungTest } from "./helpers/phien"; // mock next/headers — trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

// S02e (QUALITY-FINAL-1) — cấu hình theo TỔ CHỨC thay vì toàn hệ (docs/nang-cap/
// AUDIT-S02E-ORG-CONFIG.md). A1-AC01: hai org cùng vai trò admin không đọc/ghi chéo cấu hình
// của nhau. Mọi ca gọi ROUTE/SERVICE THẬT; mỗi ca đỏ trên code trước S02e.

const S = { skip: !HAS_TEST_DB };
const RUN = Date.now().toString(36);
let seq = 0;
const uniq = (t: string) => `${t}${RUN}${++seq}`;

type U = NguoiDungTest & { orgId: number };

async function taoToChuc(): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO organizations (name) VALUES (?)`, `Org ${uniq("s02e")}`);
}
async function taoDuAn(orgId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name, org_id) VALUES (?, ?)`, `S02E ${uniq("p")}`, orgId);
}
async function taoThap(projectId: number): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO towers (project_id, name) VALUES (?, 'Tháp S02e')`, projectId);
}
async function taoUser(role: string, orgId: number): Promise<U> {
  const { insertId } = await import("@/lib/db");
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-s02e', ?, ?)`,
    `S02E ${role}`,
    `s02e-${uniq(role)}@test.local`,
    role,
    orgId,
  );
  return { id, passwordHash: "hash-s02e", orgId };
}

/** Hai tổ chức, mỗi bên 1 dự án (có tháp) + 1 admin. */
async function haiToChuc() {
  const orgA = await taoToChuc();
  const orgB = await taoToChuc();
  const pA = await taoDuAn(orgA);
  const pB = await taoDuAn(orgB);
  await taoThap(pA);
  await taoThap(pB);
  const adminA = await taoUser("admin", orgA);
  const adminB = await taoUser("admin", orgB);
  return { orgA, orgB, pA, pB, adminA, adminB };
}

const jreq = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// 1) Ngưỡng cảnh báo chi phí theo org
// ============================================================================
test(
  "costs/settings: admin org B đổi ngưỡng KHÔNG đổi ngưỡng org A; báo cáo dùng ngưỡng org của dự án",
  S,
  async () => {
    const { pA, pB, adminA, adminB } = await haiToChuc();
    const { GET, PATCH } = await import("@/app/api/costs/settings/route");
    const { getCostReport } = await import("@/lib/tai-chinh/cost");

    await dangNhapDuAn(adminA, pA);
    assert.equal(
      (await PATCH(jreq("/api/costs/settings", "PATCH", { warnPct: 80, overPct: 95 }))).status,
      200,
    );
    await dangNhapDuAn(adminB, pB);
    assert.equal(
      (await PATCH(jreq("/api/costs/settings", "PATCH", { warnPct: 50, overPct: 60 }))).status,
      200,
    );

    await dangNhapDuAn(adminA, pA);
    assert.deepEqual(await (await GET()).json(), { warnPct: 80, overPct: 95 });
    await dangNhapDuAn(adminB, pB);
    assert.deepEqual(await (await GET()).json(), { warnPct: 50, overPct: 60 });

    const opts = { groupBy: "system" as const, includeVo: true };
    const repA = await getCostReport({ kind: "project", projectId: pA }, opts);
    const repB = await getCostReport({ kind: "project", projectId: pB }, opts);
    assert.deepEqual(repA.settings, { warnPct: "80.00", overPct: "95.00" });
    assert.deepEqual(repB.settings, { warnPct: "50.00", overPct: "60.00" });
  },
);

test(
  "costs/settings: org chưa cấu hình → mặc định 90/100 (không lấy ngưỡng org khác)",
  S,
  async () => {
    const { pB, adminB } = await haiToChuc();
    const orgC = await taoToChuc();
    const pC = await taoDuAn(orgC);
    const adminC = await taoUser("admin", orgC);
    const { GET, PATCH } = await import("@/app/api/costs/settings/route");
    const { getCostReport } = await import("@/lib/tai-chinh/cost");

    await dangNhapDuAn(adminB, pB);
    await PATCH(jreq("/api/costs/settings", "PATCH", { warnPct: 40, overPct: 45 }));

    await dangNhapDuAn(adminC, pC);
    assert.deepEqual(await (await GET()).json(), { warnPct: 90, overPct: 100 });
    const rep = await getCostReport(
      { kind: "project", projectId: pC },
      { groupBy: "system", includeVo: true },
    );
    assert.deepEqual(rep.settings, { warnPct: "90.00", overPct: "100.00" });
  },
);

// ============================================================================
// 2) code_lists theo org
// ============================================================================
test("code-lists: hai org tạo cùng (domain, code) không 409; đọc không chéo org", S, async () => {
  const { pA, pB, adminA, adminB } = await haiToChuc();
  const { POST } = await import("@/app/api/admin/code-lists/route");
  const { GET } = await import("@/app/api/code-lists/route");
  const code = uniq("ma");

  await dangNhapDuAn(adminA, pA);
  const resA = await POST(
    jreq("/api/admin/code-lists", "POST", { domain: "delay_reason", code, label: "Nhãn org A" }),
  );
  assert.equal(resA.status, 201);

  await dangNhapDuAn(adminB, pB);
  const resB = await POST(
    jreq("/api/admin/code-lists", "POST", { domain: "delay_reason", code, label: "Nhãn org B" }),
  );
  assert.equal(resB.status, 201, "org B tạo cùng mã với org A phải được (unique theo org)");

  const listB = (await (await GET(jreq("/api/code-lists?domain=delay_reason"))).json()) as {
    items: { code: string; label: string }[];
  };
  const mine = listB.items.filter((i) => i.code === code);
  assert.deepEqual(
    mine.map((i) => i.label),
    ["Nhãn org B"],
    "org B chỉ thấy mục của chính mình",
  );

  // Tạo lại cùng mã trong CHÍNH org → vẫn 409.
  const dup = await POST(
    jreq("/api/admin/code-lists", "POST", { domain: "delay_reason", code, label: "x" }),
  );
  assert.equal(dup.status, 409);
});

test("code-lists: require_2fa_roles của org A không áp cho org B", S, async () => {
  const { orgA, orgB, pA, adminA } = await haiToChuc();
  const { POST } = await import("@/app/api/admin/code-lists/route");
  const { requiredRoles } = await import("@/lib/bao-mat/auth");

  await dangNhapDuAn(adminA, pA);
  const res = await POST(
    jreq("/api/admin/code-lists", "POST", {
      domain: "require_2fa_roles",
      code: "viewer",
      label: "Bắt buộc viewer",
    }),
  );
  assert.ok(res.status === 201 || res.status === 409);
  assert.ok((await requiredRoles(orgA)).has("viewer"));
  assert.equal((await requiredRoles(orgB)).has("viewer"), false);
});

test("code-lists DELETE: tham chiếu của org khác không chặn xoá mục cùng mã", S, async () => {
  const { pA, pB, adminB } = await haiToChuc();
  const { insertId, queryOne } = await import("@/lib/db");
  const code = uniq("ref");
  // Task org A đang dùng mã `code` làm nguyên nhân trễ.
  const tw = await queryOne<{ id: number }>(`SELECT id FROM towers WHERE project_id = ?`, pA);
  const st = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name, slug) VALUES (?, ?, 'S', ?)`,
    tw!.id,
    uniq("C"),
    uniq("s"),
  );
  const wp = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, ?, 'N')`,
    st,
    uniq("W"),
  );
  await insertId(
    `INSERT INTO tasks (package_id, code, name, delay_reason) VALUES (?, ?, 'T', ?)`,
    wp,
    uniq("T"),
    code,
  );
  const idB = await insertId(
    `INSERT INTO code_lists (domain, code, label, org_id) VALUES ('delay_reason', ?, 'B', (SELECT org_id FROM projects WHERE id = ?))`,
    code,
    pB,
  );
  await dangNhapDuAn(adminB, pB);
  const { DELETE } = await import("@/app/api/admin/code-lists/route");
  const res = await DELETE(jreq(`/api/admin/code-lists?id=${idB}`, "DELETE"));
  assert.equal(res.status, 200);
  assert.equal(await queryOne(`SELECT 1 FROM code_lists WHERE id = ?`, idB), undefined);
});

// ============================================================================
// 3) alert_rules theo org
// ============================================================================
test(
  "alert-rules: hai org cùng rule toàn cục không 500; ngưỡng không đọc chéo org",
  S,
  async () => {
    const { pA, pB, adminA, adminB } = await haiToChuc();
    const orgC = await taoToChuc();
    const pC = await taoDuAn(orgC);
    const { POST, GET } = await import("@/app/api/admin/alert-rules/route");
    const { getAlertThreshold } = await import("@/lib/van-hanh/alerts");
    // Metric riêng của ca này để không đụng rule toàn cục do file khác tạo trên cùng DB.
    const metric = "cpi_below";

    await dangNhapDuAn(adminA, pA);
    const a = await POST(jreq("/api/admin/alert-rules", "POST", { metric, threshold: 0.9 }));
    assert.equal(a.status, 201);

    await dangNhapDuAn(adminB, pB);
    const b = await POST(jreq("/api/admin/alert-rules", "POST", { metric, threshold: 0.5 })).catch(
      (e: unknown) => e,
    );
    assert.ok(b instanceof Response, `org B tạo rule toàn cục không được ném lỗi: ${String(b)}`);
    assert.equal(b.status, 201);

    assert.equal(await getAlertThreshold(metric, pA), 0.9);
    assert.equal(await getAlertThreshold(metric, pB), 0.5);
    // Org không có rule → mặc định hệ thống, không lấy rule toàn cục của org khác.
    assert.equal(await getAlertThreshold(metric, pC), 1);

    const list = (await (await GET()).json()) as { rules: { threshold: number }[] };
    assert.deepEqual(
      list.rules.map((r) => Number(r.threshold)),
      [0.5],
      "admin org B chỉ thấy rule của org mình",
    );
  },
);

// ============================================================================
// 4) sheet_types.slug unique theo dự án
// ============================================================================
function workbookOgtd(group: string): XLSX.WorkBook {
  const aoa: unknown[][] = [
    [],
    [],
    [
      "CODE",
      "STT",
      "CHI TIẾT",
      "GHI CHÚ",
      "NGÀY BĐ",
      "SỐ NGÀY",
      "NGÀY KT",
      "% Tiến độ",
      "Lắp đặt",
      "D1",
    ],
    [],
    [],
    [group, "1", "Nhóm S02e", "", "2026-01-01", 10, "2026-01-10", 0],
    [`${group},01`, "01", "Task S02e", "", "2026-01-01", 5, "2026-01-05", 0, null, null],
  ];
  return {
    SheetNames: ["TRACKING OGTĐ"],
    Sheets: { "TRACKING OGTĐ": XLSX.utils.aoa_to_sheet(aoa) },
  };
}

test(
  "sheets: import Excel sang 2 dự án cùng slug được; tra slug theo dự án đang chọn",
  S,
  async () => {
    const { pA, pB, adminA, adminB } = await haiToChuc();
    const { importWorkbook } = await import("@/lib/tien-do/import");
    const { query, run } = await import("@/lib/db");

    await importWorkbook(workbookOgtd(uniq("G")), { projectId: pA });
    await importWorkbook(workbookOgtd(uniq("G")), { projectId: pB });
    const rows = await query<{ id: number; slug: string; projectId: number }>(
      `SELECT st.id, st.slug, tw.project_id AS "projectId" FROM sheet_types st
       JOIN towers tw ON tw.id = st.tower_id WHERE tw.project_id IN (?, ?) ORDER BY tw.project_id`,
      pA,
      pB,
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].slug, rows[1].slug, "hai dự án dùng cùng slug");
    const [sA, sB] = rows;

    // Watermark khác nhau để phân biệt sheet được chọn.
    for (const [id, v] of [
      [sA.id, 7001],
      [sB.id, 5001],
    ]) {
      await run(
        `INSERT INTO sheet_versions (sheet_type_id, version) VALUES (?, ?)
       ON CONFLICT (sheet_type_id) DO UPDATE SET version = EXCLUDED.version`,
        id,
        v,
      );
    }

    const tasks = await import("@/app/api/tasks/route");
    const version = await import("@/app/api/tasks/version/route");
    for (const [user, pid, sheet, v] of [
      [adminA, pA, sA, "7001"],
      [adminB, pB, sB, "5001"],
    ] as const) {
      await dangNhapDuAn(user, pid);
      const res = await tasks.GET(jreq(`/api/tasks?sheet=${sheet.slug}`));
      assert.equal(res.status, 200);
      const body = (await res.json()) as { sheet: { id: number }; version: string };
      assert.equal(body.sheet.id, sheet.id, "GET /api/tasks giải slug trong dự án đang chọn");
      assert.equal(body.version, v);
      const vr = (await (
        await version.GET(jreq(`/api/tasks/version?sheet=${sheet.slug}`))
      ).json()) as {
        v: string;
      };
      assert.equal(vr.v, v, "watermark đúng sheet của dự án đang chọn");
    }
  },
);

test(
  "sheets POST: cùng slug ở dự án khác được; sheet gắn vào tháp của DỰ ÁN ĐANG CHỌN",
  S,
  async () => {
    const { pA, pB, adminA, adminB } = await haiToChuc();
    const { POST } = await import("@/app/api/sheets/route");
    const { queryOne } = await import("@/lib/db");
    const slug = uniq("sl").toLowerCase();

    await dangNhapDuAn(adminA, pA);
    const a = await POST(jreq("/api/sheets", "POST", { name: `Sheet ${slug}`, slug }));
    assert.equal(a.status, 201);
    await dangNhapDuAn(adminB, pB);
    const b = await POST(jreq("/api/sheets", "POST", { name: `Sheet ${slug}`, slug }));
    assert.equal(b.status, 201, "slug trùng ở dự án KHÁC không còn 409");
    const idB = ((await b.json()) as { sheet: { id: number } }).sheet.id;
    const owner = await queryOne<{ projectId: number }>(
      `SELECT tw.project_id AS "projectId" FROM sheet_types st JOIN towers tw ON tw.id = st.tower_id
      WHERE st.id = ?`,
      idB,
    );
    assert.equal(
      owner?.projectId,
      pB,
      "sheet mới phải thuộc dự án đang chọn, không phải tháp đầu toàn hệ",
    );

    // Trùng slug TRONG cùng dự án → 409.
    const dup = await POST(jreq("/api/sheets", "POST", { name: `Khác ${slug}`, slug }));
    assert.equal(dup.status, 409);
  },
);

// ============================================================================
// 5) Nhật ký traffic in-memory theo org
// ============================================================================
async function docSse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const { value } = await reader.read();
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(value);
}

test(
  "traffic/events: admin chỉ thấy traffic của org mình, không thấy org khác/ẩn danh",
  S,
  async () => {
    const { orgA, orgB, pA, adminA } = await haiToChuc();
    const { recordTraffic, latestId } = await import("@/lib/bao-mat/traffic");
    const { GET } = await import("@/app/api/admin/traffic/events/route");
    const moc = latestId();
    const base = { method: "GET", ip: "10.0.0.1", ua: "t", ts: Date.now() };
    recordTraffic({ ...base, path: `/api/a-${RUN}`, orgId: orgA });
    recordTraffic({ ...base, path: `/api/b-${RUN}`, orgId: orgB });
    recordTraffic({ ...base, path: `/api/anon-${RUN}`, orgId: null });

    await dangNhapDuAn(adminA, pA);
    const ac = new AbortController();
    const req = new NextRequest(`http://localhost/api/admin/traffic/events?since=${moc}`, {
      signal: ac.signal,
    });
    const res = await GET(req);
    assert.equal(res.status, 200);
    const text = await docSse(res);
    ac.abort();
    assert.match(text, new RegExp(`/api/a-${RUN}`));
    assert.doesNotMatch(text, new RegExp(`/api/b-${RUN}`), "không lộ traffic org khác");
    assert.doesNotMatch(text, new RegExp(`/api/anon-${RUN}`), "không lộ traffic ẩn danh");
  },
);

test(
  "proxy: ghi traffic gắn orgId từ cookie phiên đã ký; không cookie → orgId null",
  S,
  async (t) => {
    const { makeToken, COOKIE } = await import("@/lib/bao-mat/session-token");
    const { proxy } = await import("@/proxy");
    const bodies: Record<string, unknown>[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response("{}");
    });
    const orgId = 4242;
    const token = makeToken(99, "hash-s02e", false, 0, orgId);
    proxy(
      new NextRequest("http://localhost/api/dashboard", {
        headers: { cookie: `${COOKIE}=${token}` },
      }),
    );
    proxy(new NextRequest("http://localhost/api/project"));
    // Cookie giả chữ ký → không được gán org.
    proxy(
      new NextRequest("http://localhost/api/dashboard", {
        headers: { cookie: `${COOKIE}=${token.slice(0, -4)}abcd` },
      }),
    );
    assert.equal(bodies.length, 3);
    assert.equal(bodies[0].orgId, orgId);
    assert.equal(bodies[1].orgId, null);
    assert.equal(bodies[2].orgId, null);
  },
);
