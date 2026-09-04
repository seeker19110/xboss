import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm DASHBOARD & BÁO CÁO (cùng khuôn với
// tests/route-tai-chinh.test.ts). Route:
//   - app/api/dashboard/route.ts          (tổng quan + khối tài chính/chất lượng/công trường)
//   - app/api/dashboard/scurve/route.ts   (đường kế hoạch/thực tế + baseline)
//   - app/api/dashboard/spi/route.ts      (Schedule Performance Index theo hệ)
//   - app/api/timeline/route.ts           (tiến độ tầng × hệ + lịch sử tuần)
//   - app/api/gantt/route.ts              (bars/deps/CPM)
//   - app/api/lookahead/route.ts          (kế hoạch ngắn hạn)
//   - app/api/search/route.ts             (tìm kiếm toàn cục)

const S = { skip: !HAS_TEST_DB };

// PHỤ THUỘC CHÉO GIỮA CÁC FILE TEST — đã dính thật: `visibleProjectIds` (lib/ha-tang/projects.ts)
// chỉ trả "mọi dự án" khi bảng `user_projects` RỖNG; hễ bảng đó có dòng thì user không được gán
// sẽ không thấy dự án nào. Mỗi user ở đây được GÁN THẲNG vào dự án của nó (dangNhapDuAn) — test
// tự chủ, chạy đúng ở mọi thứ tự, không phụ thuộc trạng thái toàn cục do file khác để lại.
async function dangNhapDuAn(
  user: { id: number; passwordHash: string },
  projectId: number | null,
): Promise<void> {
  if (projectId != null) {
    const { run } = await import("@/lib/db");
    await run(
      `INSERT INTO user_projects (user_id, project_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      user.id,
      projectId,
    );
  }
  dangNhap(user, projectId);
}

const RUN = Date.now().toString(36);
let seq = 0;
/** Hậu tố tăng dần trong 1 lần chạy — chống trùng mã/email khi nhiều test tạo dữ liệu. */
function uniq(ten: string): string {
  seq += 1;
  return `${ten}${RUN}${seq}`;
}

async function taoDuAn(ten: string): Promise<number> {
  const { insertId } = await import("@/lib/db");
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `DB route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `db-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-db-route', ?, ?)`,
    `DB ${ten}`,
    email,
    role,
    orgId,
  );
  const u = await queryOne<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = ?`,
    id,
  );
  return { id, passwordHash: u!.password_hash };
}

/** Dựng đủ 1 chuỗi WBS (tháp → sheet → nhóm → task) trong 1 dự án, trả về id các tầng. */
async function dungWbs(
  projectId: number,
  ten: string,
  overrides: {
    startDate?: string | null;
    endDate?: string | null;
    progress?: number;
    status?: string;
    floorLabel?: string;
  } = {},
): Promise<{ towerId: number; sheetId: number; pkgId: number; taskId: number }> {
  const { insertId } = await import("@/lib/db");
  const towerId = await insertId(
    `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp DB')`,
    projectId,
  );
  const sheetId = await insertId(
    `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, ?, 'Sheet DB')`,
    towerId,
    `DBR${uniq(ten)}`,
  );
  const pkgId = await insertId(
    `INSERT INTO work_packages (sheet_type_id, code, name, floor_label, start_date, end_date, progress)
     VALUES (?, 'D1', 'Nhóm DB', ?, ?, ?, ?)`,
    sheetId,
    overrides.floorLabel ?? "T1",
    overrides.startDate ?? null,
    overrides.endDate ?? null,
    overrides.progress ?? 0,
  );
  const taskId = await insertId(
    `INSERT INTO tasks (package_id, code, name, start_date, end_date, progress_percent, status)
     VALUES (?, 'D1,01', 'Task DB', ?, ?, ?, ?)`,
    pkgId,
    overrides.startDate ?? null,
    overrides.endDate ?? null,
    overrides.progress ?? 0,
    overrides.status ?? "chuan_bi",
  );
  return { towerId, sheetId, pkgId, taskId };
}

async function taoHopDongVaVo(
  projectId: number,
  ten: string,
  overrides: { status?: string; qtyContract?: number; unitPrice?: number } = {},
): Promise<{ voId: number; boqId: number }> {
  const { insertId } = await import("@/lib/db");
  const voId = await insertId(
    `INSERT INTO variation_orders (code, title, reason, status, project_id)
     VALUES (?, ?, 'other', ?, ?)`,
    `VO-${uniq(ten)}`,
    `VO ${ten}`,
    overrides.status ?? "approved",
    projectId,
  );
  const boqId = await insertId(
    `INSERT INTO boq_items (code, name, unit, qty_contract, qty_approved, unit_price, vo_id)
     VALUES (?, ?, 'm', ?, ?, ?, ?)`,
    `BOQ-${uniq(ten)}`,
    `Dòng ${ten}`,
    overrides.qtyContract ?? 10,
    overrides.qtyContract ?? 10,
    overrides.unitPrice ?? 1000000,
    voId,
  );
  return { voId, boqId };
}

const jreq = (url: string) => new NextRequest(`http://localhost${url}`);

// ============================================================================
// GET /api/dashboard
// ============================================================================

test("GET /api/dashboard: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/dashboard/route");
  const res = await GET(jreq("/api/dashboard"));
  assert.equal(res.status, 401);
});

test("GET /api/dashboard: subcon không có quyền xem dashboard → 403", S, async () => {
  // CAN.viewDashboard loại đúng 1 vai trò: subcon. Đây là cửa chặn đầu tiên trước mọi khối.
  const projectId = await taoDuAn("sub403");
  const sub = await taoUser("subcon", "sub403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/dashboard/route");
  const res = await GET(jreq("/api/dashboard"));
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /không có quyền xem dashboard/);
});

test(
  "GET /api/dashboard: engineer xem được dashboard nhưng khối tài chính (vo) BỊ ẨN TỪ SERVER",
  S,
  async () => {
    // Bất biến bảo mật cốt lõi của cụm: vo (VoBlock) chỉ tính cho PAYMENT_VIEW_ROLES =
    // admin/pm/bch. engineer KHÔNG nằm trong danh sách này — route phải trả vo=null,
    // và số tiền gài sẵn trong VO (unitPrice đặc trưng, khó trùng ngẫu nhiên) không được
    // xuất hiện ở BẤT KỲ đâu trong toàn bộ payload JSON (không chỉ trường vo).
    const projectId = await taoDuAn("vomask");
    const pm = await taoUser("pm", "vomaskPm");
    const eng = await taoUser("engineer", "vomaskEng");
    await dangNhapDuAn(pm, projectId);
    // unitPrice cố tình lẻ/đặc trưng để không trùng số liệu khác trong payload.
    await taoHopDongVaVo(projectId, "vomask", {
      status: "approved",
      qtyContract: 7,
      unitPrice: 123457,
    });
    // Tổng VO approved = 7 * 123457 = 864 199 — chuỗi số đặc trưng để đối chiếu.
    const soTienDacTrung = "864199";

    await dangNhapDuAn(eng, projectId);
    const { GET } = await import("@/app/api/dashboard/route");
    const res = await GET(jreq("/api/dashboard"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.vo, null, "engineer không có quyền xem payments → vo phải null");
    // approvals cũng chỉ dành cho CAN.approve (admin/pm).
    assert.equal(body.approvals, null);
    const raw = JSON.stringify(body);
    assert.ok(
      !raw.includes(soTienDacTrung),
      "số tiền VO không được rò rỉ ở BẤT KỲ trường nào trong payload của engineer",
    );

    // Đối chứng: PM (có quyền) PHẢI thấy đúng số tiền đó — chứng minh dữ liệu thật sự tồn
    // tại và bị ẩn có chủ đích, không phải do quên tạo dữ liệu.
    await dangNhapDuAn(pm, projectId);
    const resPm = await GET(jreq("/api/dashboard"));
    const bodyPm = await resPm.json();
    assert.ok(bodyPm.vo != null);
    assert.equal(Number(bodyPm.vo.approved), 864199);
  },
);

test("GET /api/dashboard: cách ly dự án — task trễ của dự án khác không lẫn vào", S, async () => {
  const projectA = await taoDuAn("isoA");
  const projectB = await taoDuAn("isoB");
  const pmA = await taoUser("pm", "isoA");
  // Task trễ thật sự: end_date quá khứ, progress < 1, chưa hoàn thành.
  await dungWbs(projectA, "isoA", { endDate: "2020-01-01", progress: 0.2 });
  await dungWbs(projectB, "isoB", { endDate: "2020-01-01", progress: 0.2 });
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/dashboard/route");
  const res = await GET(jreq("/api/dashboard"));
  assert.equal(res.status, 200);
  const body = await res.json();
  // Chỉ đúng 1 task trễ (của A) — không lẫn task trễ của B dù cùng điều kiện.
  assert.equal(body.delayedTasks.length, 1);
  assert.equal(body.totalDelayed, 1);
});

test(
  "GET /api/dashboard: ?range=week thêm Δ kỳ; task không có lịch sử coi % hiện tại không đổi",
  S,
  async () => {
    const projectId = await taoDuAn("range");
    const pm = await taoUser("pm", "range");
    await dungWbs(projectId, "range", { progress: 0.5 });
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/dashboard/route");
    const res = await GET(jreq("/api/dashboard?range=week"));
    assert.equal(res.status, 200);
    const { kpi } = await res.json();
    assert.ok(kpi.length >= 1);
    for (const k of kpi) {
      assert.ok("deltaProgress" in k, "range=week phải kèm deltaProgress cho mọi dòng KPI");
    }
  },
);

// ============================================================================
// GET /api/dashboard/scurve
// ============================================================================

test("GET /api/dashboard/scurve: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/dashboard/scurve/route");
  const res = await GET(jreq("/api/dashboard/scurve"));
  assert.equal(res.status, 401);
});

test("GET /api/dashboard/scurve: subcon không được xem → 403", S, async () => {
  const projectId = await taoDuAn("sc403");
  const sub = await taoUser("subcon", "sc403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/dashboard/scurve/route");
  const res = await GET(jreq("/api/dashboard/scurve"));
  assert.equal(res.status, 403);
});

test(
  "GET /api/dashboard/scurve: đường kế hoạch = 100% tại/sau ngày kết thúc, đường thực tế = progress hiện tại khi không có lịch sử",
  S,
  async () => {
    const projectId = await taoDuAn("scok");
    const pm = await taoUser("pm", "scok");
    // Task đã kết thúc trong quá khứ, progress hiện tại 0.6, KHÔNG có task_history →
    // route phải coi thực tế = progress hiện tại từ đầu dải ngày (nhánh "không có lịch sử").
    await dungWbs(projectId, "scok", {
      startDate: "2024-01-01",
      endDate: "2024-01-10",
      progress: 0.6,
    });
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/dashboard/scurve/route");
    const res = await GET(jreq("/api/dashboard/scurve"));
    assert.equal(res.status, 200);
    const { points } = await res.json();
    assert.ok(points.length > 0);
    const cuoi = points[points.length - 1];
    assert.equal(cuoi.planned, 100, "sau ngày kết thúc, kế hoạch phải đạt 100%");
    assert.equal(cuoi.actual, 60, "không có lịch sử → thực tế = progress hiện tại (60%)");
  },
);

test(
  "GET /api/dashboard/scurve: ?baseline=<id> đổi đường kế hoạch sang ngày đã chốt, không đụng đường thực tế",
  S,
  async () => {
    const projectId = await taoDuAn("scbl");
    const pm = await taoUser("pm", "scbl");
    // Ngày HIỆN TẠI của task đã dời ra xa tương lai (chưa bắt đầu) → không có baseline thì
    // kế hoạch tại "hôm nay" phải là 0%.
    const { taskId } = await dungWbs(projectId, "scbl", {
      startDate: "2030-01-01",
      endDate: "2030-01-10",
      progress: 0.3,
    });
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/dashboard/scurve/route");

    const khongBaseline = await GET(jreq("/api/dashboard/scurve"));
    const jKhong = await khongBaseline.json();
    // Điểm đầu dải ngày bị chốt về "hôm nay" (route clamp `from` khi task ở tương lai) —
    // đúng lúc "hôm nay" là mốc cần kiểm, không phải điểm cuối (điểm cuối luôn chạm ngày kết
    // thúc task = 100% theo định nghĩa plannedRatio, dù task đó ở tương lai xa).
    const diemHomNayKhong = jKhong.points.find((p: { date: string }) => p.date === jKhong.today);
    assert.ok(diemHomNayKhong);
    assert.equal(diemHomNayKhong.planned, 0, "chưa tới ngày bắt đầu (2030) → kế hoạch 0%");

    // Chốt baseline với ngày BĐ/KT đã QUA — baseline_tasks lưu ngày độc lập với tasks.
    const { insertId } = await import("@/lib/db");
    const baselineId = await insertId(
      `INSERT INTO baselines (name) VALUES (?)`,
      `BL ${uniq("scbl")}`,
    );
    await insertId(
      `INSERT INTO baseline_tasks (baseline_id, task_id, start_date, end_date, progress_percent)
       VALUES (?, ?, '2024-01-01', '2024-01-10', 0.3)`,
      baselineId,
      taskId,
    );

    const coBaseline = await GET(jreq(`/api/dashboard/scurve?baseline=${baselineId}`));
    assert.equal(coBaseline.status, 200);
    const jCo = await coBaseline.json();
    const diemCuoiCo = jCo.points[jCo.points.length - 1];
    assert.equal(
      diemCuoiCo.planned,
      100,
      "?baseline= dùng ngày đã chốt (đã qua) → kế hoạch phải đạt 100%",
    );
  },
);

test(
  "GET /api/dashboard/scurve: cách ly dự án — task dự án khác không lẫn vào sheets",
  S,
  async () => {
    const projectA = await taoDuAn("scisoA");
    const projectB = await taoDuAn("scisoB");
    const pmA = await taoUser("pm", "scisoA");
    await dungWbs(projectA, "scisoA", { startDate: "2024-01-01", endDate: "2024-01-05" });
    await dungWbs(projectB, "scisoB", { startDate: "2024-01-01", endDate: "2024-01-05" });
    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/dashboard/scurve/route");
    const res = await GET(jreq("/api/dashboard/scurve"));
    assert.equal(res.status, 200);
    const { sheets } = await res.json();
    assert.equal(sheets.length, 1, "chỉ thấy đúng 1 sheet của dự án A");
  },
);

// ============================================================================
// GET /api/dashboard/spi
// ============================================================================

test("GET /api/dashboard/spi: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/dashboard/spi/route");
  const res = await GET(jreq("/api/dashboard/spi"));
  assert.equal(res.status, 401);
});

test("GET /api/dashboard/spi: subcon không được xem → 403", S, async () => {
  const projectId = await taoDuAn("spi403");
  const sub = await taoUser("subcon", "spi403");
  await dangNhapDuAn(sub, projectId);
  const { GET } = await import("@/app/api/dashboard/spi/route");
  const res = await GET(jreq("/api/dashboard/spi"));
  assert.equal(res.status, 403);
});

test(
  "GET /api/dashboard/spi: task đã hoàn thành 100% quá khứ → SPI = 1 (đúng tiến độ)",
  S,
  async () => {
    const projectId = await taoDuAn("spiok");
    const pm = await taoUser("pm", "spiok");
    // Đã qua hết thời hạn (kế hoạch = 100%) và progress thực tế cũng 100% → SPI = 1.
    await dungWbs(projectId, "spiok", {
      startDate: "2024-01-01",
      endDate: "2024-01-10",
      progress: 1,
    });
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/dashboard/spi/route");
    const res = await GET(jreq("/api/dashboard/spi"));
    assert.equal(res.status, 200);
    const { overall } = await res.json();
    assert.equal(overall.planned, 1);
    assert.equal(overall.actual, 1);
    assert.equal(overall.spi, 1);
  },
);

// ============================================================================
// GET /api/timeline
// ============================================================================

test("GET /api/timeline: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/timeline/route");
  const res = await GET(jreq("/api/timeline"));
  assert.equal(res.status, 401);
});

test("GET /api/timeline: cách ly dự án — tầng của dự án khác không lẫn vào towers", S, async () => {
  const projectA = await taoDuAn("tlA");
  const projectB = await taoDuAn("tlB");
  const pmA = await taoUser("pm", "tlA");
  await dungWbs(projectA, "tlA", { floorLabel: "T5" });
  await dungWbs(projectB, "tlB", { floorLabel: "T9" });
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/timeline/route");
  const res = await GET(jreq("/api/timeline"));
  assert.equal(res.status, 200);
  const { current, floors } = await res.json();
  assert.ok(current.every((c: { floorLabel: string }) => c.floorLabel !== "T9"));
  assert.ok(!floors.includes("T9"));
});

// ============================================================================
// GET /api/gantt
// ============================================================================

test("GET /api/gantt: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/gantt/route");
  const res = await GET(jreq("/api/gantt"));
  assert.equal(res.status, 401);
});

test("GET /api/gantt: cách ly dự án — bars chỉ chứa nhóm của dự án đang chọn", S, async () => {
  const projectA = await taoDuAn("ganttA");
  const projectB = await taoDuAn("ganttB");
  const pmA = await taoUser("pm", "ganttA");
  const { pkgId: pkgA } = await dungWbs(projectA, "ganttA", {
    startDate: "2024-01-01",
    endDate: "2024-01-10",
  });
  const { pkgId: pkgB } = await dungWbs(projectB, "ganttB", {
    startDate: "2024-01-01",
    endDate: "2024-01-10",
  });
  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/gantt/route");
  const res = await GET(jreq("/api/gantt"));
  assert.equal(res.status, 200);
  const { bars } = await res.json();
  const ids = bars.map((b: { id: number }) => b.id);
  assert.ok(ids.includes(pkgA));
  assert.ok(!ids.includes(pkgB));
});

test(
  "GET /api/gantt: nhóm sau bị 'chặn' khi nhóm trước chưa xong và đã tới ngày bắt đầu",
  S,
  async () => {
    const projectId = await taoDuAn("ganttblk");
    const pm = await taoUser("pm", "ganttblk");
    const { insertId } = await import("@/lib/db");
    // Nhóm trước: đã bắt đầu từ lâu, còn dang dở (progress < 1).
    const pred = await dungWbs(projectId, "ganttblkPred", {
      startDate: "2024-01-01",
      endDate: "2024-01-10",
      progress: 0.5,
    });
    // Nhóm sau: đã tới ngày bắt đầu (quá khứ), chưa xong → bị chặn vì nhóm trước chưa xong.
    const succ = await dungWbs(projectId, "ganttblkSucc", {
      startDate: "2024-02-01",
      endDate: "2024-02-10",
      progress: 0,
    });
    await insertId(
      `INSERT INTO package_dependencies (predecessor_id, successor_id) VALUES (?, ?)`,
      pred.pkgId,
      succ.pkgId,
    );
    await dangNhapDuAn(pm, projectId);
    const { GET } = await import("@/app/api/gantt/route");
    const res = await GET(jreq("/api/gantt"));
    assert.equal(res.status, 200);
    const { blocked } = await res.json();
    const dong = blocked.find((b: { id: number }) => b.id === succ.pkgId);
    assert.ok(dong, "nhóm sau phải xuất hiện trong danh sách 'blocked'");
    assert.deepEqual(dong.preds, ["D1"]); // mã nhóm trước (code = 'D1' theo dungWbs)
  },
);

// ============================================================================
// GET /api/lookahead
// ============================================================================

test("GET /api/lookahead: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/lookahead/route");
  const res = await GET(jreq("/api/lookahead"));
  assert.equal(res.status, 401);
});

test("GET /api/lookahead: ?days= vượt trần bị chốt lại 60 (Math.min)", S, async () => {
  const projectId = await taoDuAn("laday");
  const pm = await taoUser("pm", "laday");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/lookahead/route");
  const res = await GET(jreq("/api/lookahead?days=999"));
  assert.equal(res.status, 200);
  const { days } = await res.json();
  assert.equal(days, 60);
});

test(
  "GET /api/lookahead: task đến hạn trong cửa sổ N ngày xuất hiện ở 'due', cách ly dự án",
  S,
  async () => {
    const projectA = await taoDuAn("laA");
    const projectB = await taoDuAn("laB");
    const pmA = await taoUser("pm", "laA");
    const { taskId: taskA } = await dungWbs(projectA, "laA", {
      startDate: "2020-01-01",
      endDate: daysFromToday(5),
      progress: 0.5,
    });
    await dungWbs(projectB, "laB", {
      startDate: "2020-01-01",
      endDate: daysFromToday(5),
      progress: 0.5,
    });
    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/lookahead/route");
    const res = await GET(jreq("/api/lookahead?days=14"));
    assert.equal(res.status, 200);
    const { due } = await res.json();
    const ids = due.map((t: { id: number }) => t.id);
    assert.ok(ids.includes(taskA));
    assert.equal(due.length, 1, "chỉ thấy task đến hạn của dự án A, không lẫn dự án B");
  },
);

function daysFromToday(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// GET /api/search
// ============================================================================

test("GET /api/search: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/search/route");
  const res = await GET(jreq("/api/search?q=ab"));
  assert.equal(res.status, 401);
});

test("GET /api/search: q dưới 2 ký tự → trả rỗng ngay, không query DB", S, async () => {
  const projectId = await taoDuAn("sqshort");
  const pm = await taoUser("pm", "sqshort");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/search/route");
  const res = await GET(jreq("/api/search?q=a"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).hits, []);
});

test(
  "GET /api/search: cách ly dự án — task của dự án khác không xuất hiện trong kết quả",
  S,
  async () => {
    const projectA = await taoDuAn("sisoA");
    const projectB = await taoDuAn("sisoB");
    const pmA = await taoUser("pm", "sisoA");
    const { insertId } = await import("@/lib/db");
    const towerA = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`,
      projectA,
    );
    const towerB = await insertId(
      `INSERT INTO towers (project_id, name) VALUES (?, 'Tháp')`,
      projectB,
    );
    const maDacTrung = uniq("SRCHTASK");
    const stA = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'SA', 'Sheet')`,
      towerA,
    );
    const stB = await insertId(
      `INSERT INTO sheet_types (tower_id, code, name) VALUES (?, 'SB', 'Sheet')`,
      towerB,
    );
    const pkgA = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'P1', 'Nhóm')`,
      stA,
    );
    const pkgB = await insertId(
      `INSERT INTO work_packages (sheet_type_id, code, name) VALUES (?, 'P1', 'Nhóm')`,
      stB,
    );
    await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, 'Task A')`,
      pkgA,
      maDacTrung,
    );
    await insertId(
      `INSERT INTO tasks (package_id, code, name) VALUES (?, ?, 'Task B')`,
      pkgB,
      maDacTrung,
    );
    await dangNhapDuAn(pmA, projectA);
    const { GET } = await import("@/app/api/search/route");
    const res = await GET(jreq(`/api/search?q=${maDacTrung}`));
    assert.equal(res.status, 200);
    const { hits } = await res.json();
    const taskHits = hits.filter((h: { kind: string }) => h.kind === "task");
    assert.equal(taskHits.length, 1, "cùng mã, nhưng chỉ thấy task của dự án A");
  },
);

test(
  "GET /api/search: engineer thấy hợp đồng (viewVariations-style) nhưng bị CHẶN từ registry — không lộ hợp đồng nào",
  S,
  async () => {
    // SOURCES['contract'].canView = PAYMENT_VIEW_ROLES (admin/pm/bch). engineer không nằm
    // trong đó → dù hợp đồng khớp từ khoá, kết quả tìm kiếm không được có kind="contract".
    const projectId = await taoDuAn("scontract");
    const pm = await taoUser("pm", "scontractPm");
    const eng = await taoUser("engineer", "scontractEng");
    const { insertId } = await import("@/lib/db");
    const maDacTrung = uniq("HDSRCH");
    await dangNhapDuAn(pm, projectId);
    await insertId(
      `INSERT INTO contracts (code, kind, title, party_name, project_id) VALUES (?, 'nhan_thau', ?, 'CĐT', ?)`,
      `HD-${maDacTrung}`,
      `Hợp đồng ${maDacTrung}`,
      projectId,
    );

    const { GET } = await import("@/app/api/search/route");
    // PM (có quyền) phải thấy được hợp đồng.
    const resPm = await GET(jreq(`/api/search?q=${maDacTrung}`));
    const hitsPm = (await resPm.json()).hits;
    assert.ok(
      hitsPm.some((h: { kind: string }) => h.kind === "contract"),
      "PM có quyền phải thấy hợp đồng khớp từ khoá",
    );

    // engineer (không có viewPayments) tìm cùng từ khoá → không được thấy hợp đồng.
    await dangNhapDuAn(eng, projectId);
    const resEng = await GET(jreq(`/api/search?q=${maDacTrung}`));
    assert.equal(resEng.status, 200);
    const hitsEng = (await resEng.json()).hits;
    assert.ok(
      !hitsEng.some((h: { kind: string }) => h.kind === "contract"),
      "engineer không có quyền xem thanh toán → hợp đồng phải bị chặn từ registry",
    );
  },
);
