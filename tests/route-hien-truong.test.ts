import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangNhap, dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Test THỰC THI route handler thật cho cụm HIỆN TRƯỜNG. Route:
//   - app/api/diaries/[date]/route.ts   (GET/PUT nhật ký thi công theo ngày)
//   - app/api/hse/route.ts              (GET/POST sổ HSE)
//   - app/api/hse/[id]/route.ts         (GET/PATCH/DELETE 1 ghi nhận HSE)
//   - app/api/ncrs/route.ts             (GET/POST NCR)
//   - app/api/ncrs/[id]/route.ts        (PATCH NCR)
//   - app/api/equipment/route.ts        (GET/POST thiết bị)
//   - app/api/equipment/[id]/route.ts   (GET/PATCH thiết bị)

const S = { skip: !HAS_TEST_DB };

// PHỤ THUỘC CHÉO GIỮA CÁC FILE TEST — xem tests/route-tai-chinh.test.ts: `visibleProjectIds`
// chỉ trả "mọi dự án" khi bảng `user_projects` RỖNG. Nhiều file test khác chèn vào bảng đó
// mà không dọn, nên nếu dùng dangNhap trần, file này xanh khi chạy riêng nhưng ĐỎ trong bộ
// đầy đủ. Gán thẳng user vào đúng dự án của nó để test tự chủ, chạy đúng ở mọi thứ tự.
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
  return insertId(`INSERT INTO projects (name) VALUES (?)`, `HT route ${uniq(ten)}`);
}

async function taoUser(
  role: string,
  ten: string,
  orgId = 1,
): Promise<{ id: number; passwordHash: string }> {
  const { insertId, queryOne } = await import("@/lib/db");
  const email = `ht-${uniq(ten)}@test.local`;
  const id = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id) VALUES (?, ?, 'hash-test-ht-route', ?, ?)`,
    `HT ${ten}`,
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

const jreq = (url: string, body?: unknown, method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// ============================================================================
// GET/PUT /api/diaries/[date]
// ============================================================================

test("GET /api/diaries/:date: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/diaries/[date]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ date: "2026-01-01" }),
  });
  assert.equal(res.status, 401);
});

test("GET /api/diaries/:date: ngày sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("dbad");
  const pm = await taoUser("pm", "dbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/diaries/[date]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ date: "01-01-2026" }),
  });
  assert.equal(res.status, 422);
});

test("PUT /api/diaries/:date: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PUT } = await import("@/app/api/diaries/[date]/route");
  const res = await PUT(jreq("/x", {}, "PUT"), {
    params: Promise.resolve({ date: "2026-01-01" }),
  });
  assert.equal(res.status, 401);
});

test(
  "PUT /api/diaries/:date: subcon không được lập nhật ký (chỉ Admin/PM/kỹ sư) → 403",
  S,
  async () => {
    // Bất biến bảo mật: nhật ký thi công là chứng từ pháp lý, chỉ vai trò nội bộ lập được.
    const projectId = await taoDuAn("dsub403");
    const sub = await taoUser("subcon", "dsub403");
    await dangNhapDuAn(sub, projectId);
    const { PUT } = await import("@/app/api/diaries/[date]/route");
    const res = await PUT(jreq("/x", {}, "PUT"), {
      params: Promise.resolve({ date: "2026-01-01" }),
    });
    assert.equal(res.status, 403);
  },
);

test("PUT /api/diaries/:date: ngày sai định dạng → 422", S, async () => {
  const projectId = await taoDuAn("dputbad");
  const pm = await taoUser("pm", "dputbad");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/diaries/[date]/route");
  const res = await PUT(jreq("/x", {}, "PUT"), {
    params: Promise.resolve({ date: "khong-phai-ngay" }),
  });
  assert.equal(res.status, 422);
});

test("PUT /api/diaries/:date: tên tổ đội rỗng → 422", S, async () => {
  const projectId = await taoDuAn("dcrewempty");
  const pm = await taoUser("pm", "dcrewempty");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/diaries/[date]/route");
  const res = await PUT(jreq("/x", { manpower: [{ crew: "  ", headcount: 5 }] }, "PUT"), {
    params: Promise.resolve({ date: "2026-02-01" }),
  });
  assert.equal(res.status, 422);
});

test("PUT /api/diaries/:date: tổ đội bị lặp lại → 422", S, async () => {
  const projectId = await taoDuAn("dcrewdup");
  const pm = await taoUser("pm", "dcrewdup");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/diaries/[date]/route");
  const res = await PUT(
    jreq(
      "/x",
      {
        manpower: [
          { crew: "Tổ điện", headcount: 5 },
          { crew: "Tổ điện", headcount: 3 },
        ],
      },
      "PUT",
    ),
    { params: Promise.resolve({ date: "2026-02-02" }) },
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /bị lặp lại/);
});

test("PUT /api/diaries/:date: số người âm/không nguyên → 422", S, async () => {
  const projectId = await taoDuAn("dcrewneg");
  const pm = await taoUser("pm", "dcrewneg");
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/diaries/[date]/route");
  const res = await PUT(jreq("/x", { manpower: [{ crew: "Tổ cơ", headcount: -1 }] }, "PUT"), {
    params: Promise.resolve({ date: "2026-02-03" }),
  });
  assert.equal(res.status, 422);
});

test(
  "PUT rồi GET /api/diaries/:date: tạo mới, cách ly dự án — nhật ký cùng ngày ở dự án khác không đụng độ",
  S,
  async () => {
    const projectA = await taoDuAn("diso A");
    const projectB = await taoDuAn("diso B");
    const pmA = await taoUser("pm", "disoA");
    const pmB = await taoUser("pm", "disoB");
    const date = "2026-03-15";

    await dangNhapDuAn(pmA, projectA);
    const { PUT, GET } = await import("@/app/api/diaries/[date]/route");
    const createdA = await PUT(
      jreq(
        "/x",
        { workDone: "Đổ bê tông tầng A", manpower: [{ crew: "Tổ A", headcount: 4 }] },
        "PUT",
      ),
      { params: Promise.resolve({ date }) },
    );
    assert.equal(createdA.status, 200);

    await dangNhapDuAn(pmB, projectB);
    const createdB = await PUT(jreq("/x", { workDone: "Lắp ống tầng B" }, "PUT"), {
      params: Promise.resolve({ date }),
    });
    assert.equal(createdB.status, 200, "cùng ngày nhưng khác dự án — không được xung đột UNIQUE");

    // Dự án B không thấy nội dung/nhân lực của dự án A dù cùng ngày.
    const getB = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ date }) });
    const bodyB = await getB.json();
    assert.equal(bodyB.diary.workDone, "Lắp ống tầng B");
    assert.deepEqual(bodyB.manpower, []);

    await dangNhapDuAn(pmA, projectA);
    const getA = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ date }) });
    const bodyA = await getA.json();
    assert.equal(bodyA.diary.workDone, "Đổ bê tông tầng A");
    assert.equal(bodyA.manpower.length, 1);
    assert.equal(bodyA.manpower[0].crew, "Tổ A");
  },
);

test(
  "PUT /api/diaries/:date: gọi lần 2 cùng ngày → UPDATE bản ghi cũ, không tạo bản ghi mới",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("dupdate");
    const pm = await taoUser("pm", "dupdate");
    const date = "2026-05-01";
    await dangNhapDuAn(pm, projectId);
    const { PUT } = await import("@/app/api/diaries/[date]/route");
    const first = await PUT(
      jreq("/x", { workDone: "Bản ghi lần 1", manpower: [{ crew: "Tổ A", headcount: 2 }] }, "PUT"),
      { params: Promise.resolve({ date }) },
    );
    const { id: id1 } = await first.json();

    const second = await PUT(jreq("/x", { workDone: "Bản ghi lần 2 (sửa)" }, "PUT"), {
      params: Promise.resolve({ date }),
    });
    assert.equal(second.status, 200);
    const { id: id2 } = await second.json();
    assert.equal(id2, id1, "cùng ngày/dự án phải UPDATE cùng 1 bản ghi, không tạo mới");

    const row = await queryOne<{ work_done: string }>(
      `SELECT work_done FROM site_diaries WHERE id = ?`,
      id1,
    );
    assert.equal(row?.work_done, "Bản ghi lần 2 (sửa)");
  },
);

test("PUT /api/diaries/:date: sổ đã khoá → 409, không cho sửa (bất biến pháp lý)", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("dlocked");
  const pm = await taoUser("pm", "dlocked");
  const date = "2026-04-01";
  await dangNhapDuAn(pm, projectId);
  const { PUT } = await import("@/app/api/diaries/[date]/route");
  const created = await PUT(jreq("/x", { workDone: "Khởi tạo" }, "PUT"), {
    params: Promise.resolve({ date }),
  });
  assert.equal(created.status, 200);
  await run(
    `UPDATE site_diaries SET status = 'locked' WHERE diary_date = ? AND project_id = ?`,
    date,
    projectId,
  );

  const res = await PUT(jreq("/x", { workDone: "Sửa sau khoá" }, "PUT"), {
    params: Promise.resolve({ date }),
  });
  assert.equal(res.status, 409);
});

// ============================================================================
// GET/POST /api/hse
// ============================================================================

test("GET /api/hse: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/hse/route");
  const res = await GET(jreq("/api/hse", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/hse: kind không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("hkind");
  const pm = await taoUser("pm", "hkind");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/hse/route");
  const res = await GET(jreq("/api/hse?kind=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/hse: cách ly dự án — không thấy ghi nhận của dự án khác", S, async () => {
  const projectA = await taoDuAn("hisoA");
  const projectB = await taoDuAn("hisoB");
  const pmA = await taoUser("pm", "hisoA");
  const pmB = await taoUser("pm", "hisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST, GET } = await import("@/app/api/hse/route");
  const created = await POST(
    jreq("/api/hse", {
      kind: "inspection",
      recordDate: "2026-01-05",
      description: "Kiểm tra định kỳ dự án B",
    }),
  );
  assert.equal(created.status, 201);

  await dangNhapDuAn(pmA, projectA);
  const res = await GET(jreq("/api/hse", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).records, []);
});

test("POST /api/hse: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/hse/route");
  const res = await POST(jreq("/api/hse", {}));
  assert.equal(res.status, 401);
});

test("POST /api/hse: bch không có quyền ghi nhận HSE → 403", S, async () => {
  const projectId = await taoDuAn("h403");
  const bch = await taoUser("bch", "h403");
  await dangNhapDuAn(bch, projectId);
  const { POST } = await import("@/app/api/hse/route");
  const res = await POST(jreq("/api/hse", {}));
  assert.equal(res.status, 403);
});

test(
  "POST /api/hse: subcon vẫn ghi được near-miss (mọi vai trò thao tác được phép)",
  S,
  async () => {
    // Chủ đích nghiệp vụ (comment trong route): càng nhiều báo cáo cận nguy càng tốt,
    // không chặn cả thầu phụ — chỉ chặn nhóm chỉ-xem (cdt/viewer/bch).
    const projectId = await taoDuAn("hsub");
    const sub = await taoUser("subcon", "hsub");
    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/hse/route");
    const res = await POST(
      jreq("/api/hse", {
        kind: "near_miss",
        recordDate: "2026-01-06",
        description: "Suýt trượt ngã tầng 5",
        severity: "medium",
      }),
    );
    assert.equal(res.status, 201);
  },
);

test("POST /api/hse: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("hbody");
  const pm = await taoUser("pm", "hbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/hse/route");
  const res = await POST(
    new NextRequest("http://localhost/api/hse", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/hse: sự cố/cận nguy thiếu mức độ nghiêm trọng → 422", S, async () => {
  const projectId = await taoDuAn("hsev");
  const pm = await taoUser("pm", "hsev");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/hse/route");
  const res = await POST(
    jreq("/api/hse", { kind: "incident", recordDate: "2026-01-07", description: "Sự cố X" }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /mức độ nghiêm trọng/);
});

test("POST /api/hse: giấy phép thiếu khung giờ hiệu lực → 422", S, async () => {
  const projectId = await taoDuAn("hpermit");
  const pm = await taoUser("pm", "hpermit");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/hse/route");
  const res = await POST(
    jreq("/api/hse", {
      kind: "permit",
      recordDate: "2026-01-08",
      description: "Hàn cắt tầng hầm",
      permitType: "hot_work",
    }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /khung giờ hiệu lực/);
});

test("POST /api/hse: người phụ trách khắc phục không tồn tại → 422 (checkHseRefs)", S, async () => {
  const projectId = await taoDuAn("href");
  const pm = await taoUser("pm", "href");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/hse/route");
  const res = await POST(
    jreq("/api/hse", {
      kind: "inspection",
      recordDate: "2026-01-09",
      description: "Kiểm tra PCCC",
      actionRequired: "Bổ sung bình chữa cháy",
      actionAssignee: 999999999,
    }),
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /Người phụ trách/);
});

test(
  "POST /api/hse: tạo thành công, actionRequired có giá trị → actionStatus = open",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("hok");
    const pm = await taoUser("pm", "hok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/hse/route");
    const res = await POST(
      jreq("/api/hse", {
        kind: "inspection",
        recordDate: "2026-01-10",
        description: "Kiểm tra định kỳ",
        actionRequired: "Sửa lan can",
      }),
    );
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const row = await queryOne<{ action_status: string }>(
      `SELECT action_status FROM hse_records WHERE id = ?`,
      id,
    );
    assert.equal(row?.action_status, "open");
  },
);

// ============================================================================
// GET/PATCH/DELETE /api/hse/[id]
// ============================================================================

test("GET /api/hse/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/hse/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/hse/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("hgidbad");
  const pm = await taoUser("pm", "hgidbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/hse/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/hse/:id: ghi nhận của dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("hgidisoA");
  const projectB = await taoDuAn("hgidisoB");
  const pmA = await taoUser("pm", "hgidisoA");
  const pmB = await taoUser("pm", "hgidisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/hse/route");
  const created = await POST(
    jreq("/api/hse", { kind: "toolbox", recordDate: "2026-01-11", description: "Toolbox B" }),
  );
  const { id } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/hse/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/hse/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/hse/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test(
  "PATCH /api/hse/:id: subcon không được sửa/đóng action (chỉ Admin/PM/kỹ sư) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("hpatch403");
    const sub = await taoUser("subcon", "hpatch403");
    await dangNhapDuAn(sub, projectId);
    const { PATCH } = await import("@/app/api/hse/[id]/route");
    const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
    assert.equal(res.status, 403);
  },
);

test("PATCH /api/hse/:id: đóng action khi không ở trạng thái mở → 404", S, async () => {
  const projectId = await taoDuAn("hclose404");
  const pm = await taoUser("pm", "hclose404");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/hse/route");
  const created = await POST(
    jreq("/api/hse", {
      kind: "inspection",
      recordDate: "2026-01-12",
      description: "Kiểm tra không action",
    }),
  );
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/hse/[id]/route");
  const res = await PATCH(jreq("/x", { closeAction: true }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/hse/:id: đóng action thành công → action_status = closed", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("hclose");
  const pm = await taoUser("pm", "hclose");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/hse/route");
  const created = await POST(
    jreq("/api/hse", {
      kind: "inspection",
      recordDate: "2026-01-13",
      description: "Kiểm tra có action",
      actionRequired: "Khắc phục ngay",
    }),
  );
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/hse/[id]/route");
  const res = await PATCH(jreq("/x", { closeAction: true }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ action_status: string }>(
    `SELECT action_status FROM hse_records WHERE id = ?`,
    id,
  );
  assert.equal(row?.action_status, "closed");
});

test("PATCH /api/hse/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("hpatchbody");
  const pm = await taoUser("pm", "hpatchbody");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/hse/[id]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 400);
});

test(
  "PATCH /api/hse/:id: sửa toàn bộ nội dung — action đã đóng vẫn giữ closed (không tự mở lại)",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("hpatchfull");
    const pm = await taoUser("pm", "hpatchfull");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/hse/route");
    const created = await POST(
      jreq("/api/hse", {
        kind: "inspection",
        recordDate: "2026-01-15",
        description: "Trước khi sửa",
        actionRequired: "Khắc phục A",
      }),
    );
    const { id } = await created.json();
    const { PATCH } = await import("@/app/api/hse/[id]/route");
    await PATCH(jreq("/x", { closeAction: true }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });

    const res = await PATCH(jreq("/x", { description: "Sau khi sửa" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(res.status, 200);
    const row = await queryOne<{ description: string; action_status: string }>(
      `SELECT description, action_status FROM hse_records WHERE id = ?`,
      id,
    );
    assert.equal(row?.description, "Sau khi sửa");
    assert.equal(row?.action_status, "closed", "sửa nội dung không được tự mở lại action đã đóng");
  },
);

test("PATCH /api/hse/:id: không tìm thấy ghi nhận → 404", S, async () => {
  const projectId = await taoDuAn("h404");
  const pm = await taoUser("pm", "h404");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/hse/[id]/route");
  const res = await PATCH(jreq("/x", { description: "x" }, "PATCH"), {
    params: Promise.resolve({ id: "999999999" }),
  });
  assert.equal(res.status, 404);
});

test("DELETE /api/hse/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { DELETE } = await import("@/app/api/hse/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 401);
});

test("DELETE /api/hse/:id: engineer không được xoá (chỉ Admin/PM) → 403", S, async () => {
  const projectId = await taoDuAn("hdel403");
  const eng = await taoUser("engineer", "hdel403");
  await dangNhapDuAn(eng, projectId);
  const { DELETE } = await import("@/app/api/hse/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: "1" }),
  });
  assert.equal(res.status, 403);
});

test("DELETE /api/hse/:id: xoá của dự án khác → 404, không xoá được xuyên dự án", S, async () => {
  const projectA = await taoDuAn("hdelisoA");
  const projectB = await taoDuAn("hdelisoB");
  const pmA = await taoUser("pm", "hdelisoA");
  const pmB = await taoUser("pm", "hdelisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/hse/route");
  const created = await POST(
    jreq("/api/hse", { kind: "toolbox", recordDate: "2026-01-14", description: "Toolbox B2" }),
  );
  const { id } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { DELETE } = await import("@/app/api/hse/[id]/route");
  const res = await DELETE(jreq("/x", undefined, "DELETE"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

// ============================================================================
// GET/POST /api/ncrs
// ============================================================================

test("GET /api/ncrs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/ncrs/route");
  const res = await GET(jreq("/api/ncrs", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/ncrs: cách ly dự án — không thấy NCR của dự án khác", S, async () => {
  const projectA = await taoDuAn("nisoA");
  const projectB = await taoDuAn("nisoB");
  const pmA = await taoUser("pm", "nisoA");
  const pmB = await taoUser("pm", "nisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST, GET } = await import("@/app/api/ncrs/route");
  await POST(jreq("/api/ncrs", { description: "NCR của B" }));

  await dangNhapDuAn(pmA, projectA);
  const res = await GET(jreq("/api/ncrs", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).ncrs, []);
});

test("POST /api/ncrs: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/ncrs/route");
  const res = await POST(jreq("/api/ncrs", { description: "x" }));
  assert.equal(res.status, 401);
});

test("POST /api/ncrs: chưa có dự án nào → 422", S, async () => {
  const { run } = await import("@/lib/db");
  const projectId = await taoDuAn("nnoproj");
  const pm = await taoUser("pm", "nnoproj");
  const other = await taoUser("pm", "nnoprojOther");
  // Gán dự án cho NGƯỜI KHÁC (bảng user_projects khác rỗng) → pm hiện tại không thấy dự án nào.
  await run(`INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)`, other.id, projectId);
  try {
    dangNhap(pm, null);
    const { POST } = await import("@/app/api/ncrs/route");
    const res = await POST(jreq("/api/ncrs", { description: "NCR không dự án" }));
    assert.equal(res.status, 422);
  } finally {
    await run(`DELETE FROM user_projects WHERE user_id = ?`, other.id);
  }
});

test("POST /api/ncrs: thiếu mô tả → 422", S, async () => {
  const projectId = await taoDuAn("nval");
  const pm = await taoUser("pm", "nval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/ncrs/route");
  const res = await POST(jreq("/api/ncrs", {}));
  assert.equal(res.status, 422);
});

test(
  "POST /api/ncrs: thành công → project_id do SERVER suy (dự án đang chọn), không tin client",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("nok");
    const pm = await taoUser("pm", "nok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/ncrs/route");
    const res = await POST(jreq("/api/ncrs", { description: "Bê tông rỗ", projectId: 999999 }));
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const row = await queryOne<{ project_id: number; code: string; status: string }>(
      `SELECT project_id, code, status FROM ncrs WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
    assert.match(row?.code ?? "", /^NCR-/);
    assert.equal(row?.status, "open");
  },
);

// ============================================================================
// PATCH /api/ncrs/[id]
// ============================================================================

test("PATCH /api/ncrs/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/ncrs/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/ncrs/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("npidbad");
  const pm = await taoUser("pm", "npidbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/ncrs/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/ncrs/:id: NCR của dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("npidisoA");
  const projectB = await taoDuAn("npidisoB");
  const pmA = await taoUser("pm", "npidisoA");
  const pmB = await taoUser("pm", "npidisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/ncrs/route");
  const created = await POST(jreq("/api/ncrs", { description: "NCR B" }));
  const { id } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/ncrs/[id]/route");
  const res = await PATCH(jreq("/x", { description: "sửa trộm" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/ncrs/:id: mô tả rỗng → 422", S, async () => {
  const projectId = await taoDuAn("nempty");
  const pm = await taoUser("pm", "nempty");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/ncrs/route");
  const created = await POST(jreq("/api/ncrs", { description: "NCR gốc" }));
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/ncrs/[id]/route");
  const res = await PATCH(jreq("/x", { description: "   " }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 422);
});

test("PATCH /api/ncrs/:id: trạng thái không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("nstatusbad");
  const pm = await taoUser("pm", "nstatusbad");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/ncrs/route");
  const created = await POST(jreq("/api/ncrs", { description: "NCR" }));
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/ncrs/[id]/route");
  const res = await PATCH(jreq("/x", { status: "khong_ton_tai" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 422);
});

test(
  "PATCH /api/ncrs/:id: engineer chuyển open→fixing được, nhưng đóng (closed) bị 403",
  S,
  async () => {
    // Bất biến quan trọng nhất của NCR: mọi vai trò cập nhật tiến trình được, nhưng CHỈ
    // Admin/PM được đóng — nếu không kỹ sư có thể tự đóng lỗi của chính mình.
    const projectId = await taoDuAn("nclose403");
    const pm = await taoUser("pm", "nclose403");
    const eng = await taoUser("engineer", "nclose403");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/ncrs/route");
    const created = await POST(jreq("/api/ncrs", { description: "NCR cần đóng" }));
    const { id } = await created.json();

    await dangNhapDuAn(eng, projectId);
    const { PATCH } = await import("@/app/api/ncrs/[id]/route");
    const fixing = await PATCH(jreq("/x", { status: "fixing" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(fixing.status, 200);

    const closed = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
      params: Promise.resolve({ id: String(id) }),
    });
    assert.equal(closed.status, 403);
    assert.match((await closed.json()).error, /Chỉ Admin\/PM/);
  },
);

test("PATCH /api/ncrs/:id: PM đóng NCR → status=closed và closed_at được ghi", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("ncloseok");
  const pm = await taoUser("pm", "ncloseok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/ncrs/route");
  const created = await POST(jreq("/api/ncrs", { description: "NCR đóng được" }));
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/ncrs/[id]/route");
  const res = await PATCH(jreq("/x", { status: "closed" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ status: string; closed_at: string | null }>(
    `SELECT status, closed_at FROM ncrs WHERE id = ?`,
    id,
  );
  assert.equal(row?.status, "closed");
  assert.ok(row?.closed_at != null);
});

// ============================================================================
// GET/POST /api/equipment
// ============================================================================

test("GET /api/equipment: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/equipment/route");
  const res = await GET(jreq("/api/equipment", undefined, "GET"));
  assert.equal(res.status, 401);
});

test("GET /api/equipment: condition không hợp lệ → 422", S, async () => {
  const projectId = await taoDuAn("econd");
  const pm = await taoUser("pm", "econd");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/equipment/route");
  const res = await GET(jreq("/api/equipment?condition=khong_ton_tai", undefined, "GET"));
  assert.equal(res.status, 422);
});

test("GET /api/equipment: cách ly dự án — không thấy thiết bị của dự án khác", S, async () => {
  const projectA = await taoDuAn("eisoA");
  const projectB = await taoDuAn("eisoB");
  const pmA = await taoUser("pm", "eisoA");
  const pmB = await taoUser("pm", "eisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST, GET } = await import("@/app/api/equipment/route");
  await POST(
    jreq("/api/equipment", { code: `EQ-${uniq("eisoB")}`, name: "Máy khoan", kind: "may" }),
  );

  await dangNhapDuAn(pmA, projectA);
  const res = await GET(jreq("/api/equipment", undefined, "GET"));
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).equipment, []);
});

test("POST /api/equipment: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { POST } = await import("@/app/api/equipment/route");
  const res = await POST(jreq("/api/equipment", {}));
  assert.equal(res.status, 401);
});

test(
  "POST /api/equipment: subcon không được tạo thiết bị (chỉ Admin/PM/kỹ sư) → 403",
  S,
  async () => {
    const projectId = await taoDuAn("ep403");
    const sub = await taoUser("subcon", "ep403");
    await dangNhapDuAn(sub, projectId);
    const { POST } = await import("@/app/api/equipment/route");
    const res = await POST(jreq("/api/equipment", {}));
    assert.equal(res.status, 403);
  },
);

test("POST /api/equipment: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("ebody");
  const pm = await taoUser("pm", "ebody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/equipment/route");
  const res = await POST(
    new NextRequest("http://localhost/api/equipment", { method: "POST", body: "x" }),
  );
  assert.equal(res.status, 400);
});

test("POST /api/equipment: thiếu tên/loại → 422 (validateEquipmentInput)", S, async () => {
  const projectId = await taoDuAn("eval");
  const pm = await taoUser("pm", "eval");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/equipment/route");
  const res = await POST(jreq("/api/equipment", { code: `EQ-${uniq("eval")}` }));
  assert.equal(res.status, 422);
});

test("POST /api/equipment: trùng mã thiết bị → 409", S, async () => {
  const projectId = await taoDuAn("edup");
  const pm = await taoUser("pm", "edup");
  const code = `EQ-${uniq("edup")}`;
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/equipment/route");
  const first = await POST(jreq("/api/equipment", { code, name: "Máy hàn A", kind: "may" }));
  assert.equal(first.status, 201);
  const second = await POST(jreq("/api/equipment", { code, name: "Máy hàn B", kind: "may" }));
  assert.equal(second.status, 409);
});

test(
  "POST /api/equipment: thành công → project_id do SERVER suy, không tin client",
  S,
  async () => {
    const { queryOne } = await import("@/lib/db");
    const projectId = await taoDuAn("eok");
    const pm = await taoUser("pm", "eok");
    await dangNhapDuAn(pm, projectId);
    const { POST } = await import("@/app/api/equipment/route");
    const res = await POST(
      jreq("/api/equipment", {
        code: `EQ-${uniq("eok")}`,
        name: "Máy phát điện",
        kind: "may",
        projectId: 999999,
      }),
    );
    assert.equal(res.status, 201);
    const { id } = await res.json();
    const row = await queryOne<{ project_id: number }>(
      `SELECT project_id FROM equipment WHERE id = ?`,
      id,
    );
    assert.equal(row?.project_id, projectId);
  },
);

// ============================================================================
// GET/PATCH /api/equipment/[id]
// ============================================================================

test("GET /api/equipment/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { GET } = await import("@/app/api/equipment/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("GET /api/equipment/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("egidbad");
  const pm = await taoUser("pm", "egidbad");
  await dangNhapDuAn(pm, projectId);
  const { GET } = await import("@/app/api/equipment/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("GET /api/equipment/:id: thiết bị dự án khác → 404 (cách ly dự án)", S, async () => {
  const projectA = await taoDuAn("egidisoA");
  const projectB = await taoDuAn("egidisoB");
  const pmA = await taoUser("pm", "egidisoA");
  const pmB = await taoUser("pm", "egidisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/equipment/route");
  const created = await POST(
    jreq("/api/equipment", { code: `EQ-${uniq("egidisoB")}`, name: "Máy nén khí", kind: "may" }),
  );
  const { id } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { GET } = await import("@/app/api/equipment/[id]/route");
  const res = await GET(jreq("/x", undefined, "GET"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/equipment/:id: chưa đăng nhập → 401", S, async () => {
  dangXuat();
  const { PATCH } = await import("@/app/api/equipment/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 401);
});

test("PATCH /api/equipment/:id: subcon không được sửa (chỉ Admin/PM/kỹ sư) → 403", S, async () => {
  const projectId = await taoDuAn("epat403");
  const sub = await taoUser("subcon", "epat403");
  await dangNhapDuAn(sub, projectId);
  const { PATCH } = await import("@/app/api/equipment/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "1" }) });
  assert.equal(res.status, 403);
});

test("PATCH /api/equipment/:id: ID không phải số → 400", S, async () => {
  const projectId = await taoDuAn("epatbad");
  const pm = await taoUser("pm", "epatbad");
  await dangNhapDuAn(pm, projectId);
  const { PATCH } = await import("@/app/api/equipment/[id]/route");
  const res = await PATCH(jreq("/x", {}, "PATCH"), { params: Promise.resolve({ id: "abc" }) });
  assert.equal(res.status, 400);
});

test("PATCH /api/equipment/:id: không tìm thấy (dự án khác) → 404", S, async () => {
  const projectA = await taoDuAn("epatisoA");
  const projectB = await taoDuAn("epatisoB");
  const pmA = await taoUser("pm", "epatisoA");
  const pmB = await taoUser("pm", "epatisoB");
  await dangNhapDuAn(pmB, projectB);
  const { POST } = await import("@/app/api/equipment/route");
  const created = await POST(
    jreq("/api/equipment", { code: `EQ-${uniq("epatisoB")}`, name: "Máy cắt", kind: "may" }),
  );
  const { id } = await created.json();

  await dangNhapDuAn(pmA, projectA);
  const { PATCH } = await import("@/app/api/equipment/[id]/route");
  const res = await PATCH(jreq("/x", { name: "Sửa trộm" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 404);
});

test("PATCH /api/equipment/:id: body không phải object → 400", S, async () => {
  const projectId = await taoDuAn("epatbody");
  const pm = await taoUser("pm", "epatbody");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/equipment/route");
  const created = await POST(
    jreq("/api/equipment", { code: `EQ-${uniq("epatbody")}`, name: "Máy hàn", kind: "may" }),
  );
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/equipment/[id]/route");
  const res = await PATCH(new NextRequest("http://localhost/x", { method: "PATCH", body: "x" }), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 400);
});

test("PATCH /api/equipment/:id: đổi mã trùng thiết bị khác → 409", S, async () => {
  const projectId = await taoDuAn("epatdup");
  const pm = await taoUser("pm", "epatdup");
  const codeA = `EQ-${uniq("epatdupA")}`;
  const codeB = `EQ-${uniq("epatdupB")}`;
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/equipment/route");
  const createdA = await POST(jreq("/api/equipment", { code: codeA, name: "A", kind: "may" }));
  const { id: idA } = await createdA.json();
  await POST(jreq("/api/equipment", { code: codeB, name: "B", kind: "may" }));

  const { PATCH } = await import("@/app/api/equipment/[id]/route");
  const res = await PATCH(jreq("/x", { code: codeB }, "PATCH"), {
    params: Promise.resolve({ id: String(idA) }),
  });
  assert.equal(res.status, 409);
});

test("PATCH /api/equipment/:id: sửa thành công (merge field không gửi giữ nguyên)", S, async () => {
  const { queryOne } = await import("@/lib/db");
  const projectId = await taoDuAn("epatok");
  const pm = await taoUser("pm", "epatok");
  await dangNhapDuAn(pm, projectId);
  const { POST } = await import("@/app/api/equipment/route");
  const created = await POST(
    jreq("/api/equipment", {
      code: `EQ-${uniq("epatok")}`,
      name: "Máy bơm",
      kind: "may",
      condition: "good",
    }),
  );
  const { id } = await created.json();

  const { PATCH } = await import("@/app/api/equipment/[id]/route");
  const res = await PATCH(jreq("/x", { condition: "broken" }, "PATCH"), {
    params: Promise.resolve({ id: String(id) }),
  });
  assert.equal(res.status, 200);
  const row = await queryOne<{ condition: string; name: string }>(
    `SELECT condition, name FROM equipment WHERE id = ?`,
    id,
  );
  assert.equal(row?.condition, "broken");
  assert.equal(row?.name, "Máy bơm"); // field không gửi giữ nguyên
});
