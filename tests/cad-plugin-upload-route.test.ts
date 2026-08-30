import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M99 PR5 — route XBOSS_UPLOAD end-to-end qua handler thật: POST tạo job rồi
// GET /:jobId phải trả status "completed" + revisionId. Trước bản vá, job kẹt "pending"
// vĩnh viễn (không worker nào claim loại 'cad.plugin-upload' nên completeAsyncTask no-op),
// plugin poll 10 vòng rồi báo "vẫn đang xử lý" dù revision đã tạo thật.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

const S = { skip: !HAS_TEST_DB };

// DXF tối thiểu nhưng HỢP LỆ với validateDxf/parseDxf (giống tests/cad-plugin-upload.ts).
const DXF_HOP_LE = [
  "0",
  "SECTION",
  "2",
  "HEADER",
  "0",
  "ENDSEC",
  "0",
  "SECTION",
  "2",
  "BLOCKS",
  "0",
  "ENDSEC",
  "0",
  "SECTION",
  "2",
  "TABLES",
  "0",
  "TABLE",
  "2",
  "LAYER",
  "0",
  "LAYER",
  "2",
  "01_ONG_GIO_CAP",
  "62",
  "140",
  "6",
  "CONTINUOUS",
  "0",
  "ENDTAB",
  "0",
  "ENDSEC",
  "0",
  "SECTION",
  "2",
  "ENTITIES",
  "0",
  "LINE",
  "8",
  "01_ONG_GIO_CAP",
  "10",
  "0.0",
  "20",
  "0.0",
  "30",
  "0.0",
  "11",
  "1000.0",
  "21",
  "0.0",
  "31",
  "0.0",
  "0",
  "ENDSEC",
  "0",
  "EOF",
  "",
].join("\n");

let U = 0;
let DU_AN = 0;
let DRAWING = 0;
let DRAWING2 = 0;
let TOKEN = "";

before(async () => {
  if (!HAS_TEST_DB) return;
  const { query, queryOne, insertId, run } = await import("@/lib/db");
  const rows = await query<{ id: number }>(
    `INSERT INTO users (name, email, role, password_hash)
     VALUES ('PluginUploadRoute','plugin-upload-route-test@x.vn','engineer','x')
     ON CONFLICT (email) DO UPDATE SET role = 'engineer' RETURNING id`,
  );
  U = rows[0].id;

  const duAnCu = await queryOne<{ id: number }>(
    `SELECT id FROM projects WHERE name = 'Dự án test plugin-upload route'`,
  );
  DU_AN =
    duAnCu?.id ??
    (await insertId(`INSERT INTO projects (name) VALUES ('Dự án test plugin-upload route')`));

  const daCo = await queryOne<{ id: number }>(`SELECT id FROM drawings WHERE code = 'PUR-TEST-001'`);
  DRAWING =
    daCo?.id ??
    (await insertId(
      `INSERT INTO drawings (code, name, kind, project_id, created_by)
       VALUES ('PUR-TEST-001','Bản vẽ test route PR5','shop',?,?)`,
      DU_AN,
      U,
    ));
  await run(`UPDATE drawings SET project_id = ? WHERE id = ?`, DU_AN, DRAWING);

  // Bản vẽ thứ hai — dùng cho ca kiểm tra ưu tiên drawingId vs drawingCode lệch nhau.
  const daCo2 = await queryOne<{ id: number }>(`SELECT id FROM drawings WHERE code = 'PUR-TEST-002'`);
  DRAWING2 =
    daCo2?.id ??
    (await insertId(
      `INSERT INTO drawings (code, name, kind, project_id, created_by)
       VALUES ('PUR-TEST-002','Bản vẽ test route PR5 #2','shop',?,?)`,
      DU_AN,
      U,
    ));
  await run(`UPDATE drawings SET project_id = ? WHERE id = ?`, DU_AN, DRAWING2);

  // Dọn dữ liệu lần chạy trước — ca idempotent phải bắt đầu sạch.
  await run(`DELETE FROM drawing_revisions WHERE drawing_id IN (?, ?)`, DRAWING, DRAWING2);
  await run(`DELETE FROM engineering_async_tasks WHERE created_by = ?`, U);
  await run(`DELETE FROM login_rate_limits WHERE key LIKE ?`, `cad-upload:${U}`);

  const { createCadToken } = await import("@/lib/bao-mat/cad-devices");
  TOKEN = (await createCadToken(U, 1, "May test plugin-upload route", null)).key;
});

/**
 * Dựng multipart y như plugin gửi (dwg + dxf sidecar + rulePackVersion + rev + drawingCode).
 * `tuyChon` cho phép ghi đè/bỏ drawingCode và/hoặc thêm drawingId — dùng để canh nhánh
 * plugin mới gửi kèm drawingId (M99 PR6+: plugin gửi cả hai khi biết, route ưu tiên id).
 */
function taoForm(
  noiDungDwg: string,
  rev: string,
  phienBanRulePack: string,
  tuyChon?: { drawingCode?: string | null; drawingId?: number | string | null },
): FormData {
  const form = new FormData();
  form.set("dwg", new File([noiDungDwg], "PUR.dwg", { type: "application/acad" }));
  form.set("dxf", new File([DXF_HOP_LE], "PUR.dxf", { type: "text/plain" }));
  form.set("rulePackVersion", phienBanRulePack);
  form.set("rev", rev);
  const drawingCode = tuyChon && "drawingCode" in tuyChon ? tuyChon.drawingCode : "PUR-TEST-001";
  if (drawingCode !== null && drawingCode !== undefined) form.set("drawingCode", drawingCode);
  if (tuyChon?.drawingId !== null && tuyChon?.drawingId !== undefined) {
    form.set("drawingId", String(tuyChon.drawingId));
  }
  return form;
}

async function goiUpload(form: FormData, token: string | null) {
  const { POST } = await import("@/app/api/engineering/cad/plugin-upload/route");
  const { runWithRequestContext } = await import("@/lib/nen/request-context");
  const req = new NextRequest("http://x/api/engineering/cad/plugin-upload", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  // Ngữ cảnh request: route gọi getCurrentProjectId() — có projectId trong ngữ cảnh thì hàm
  // này không chạm cookies() của Next (ngoài request scope sẽ throw).
  return runWithRequestContext({ userId: U, role: "engineer", orgId: 1, projectId: DU_AN }, () =>
    POST(req),
  );
}

async function goiTrangThai(jobId: string) {
  const { GET } = await import("@/app/api/engineering/cad/plugin-upload/[jobId]/route");
  return GET(
    new NextRequest(`http://x/api/engineering/cad/plugin-upload/${jobId}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    }),
    { params: Promise.resolve({ jobId }) },
  );
}

test(
  "POST rồi GET /:jobId → completed + revisionId (job KHÔNG kẹt 'pending'); gửi lại cùng tệp vẫn completed cùng revision",
  S,
  async () => {
    const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
    const v = getCurrentRulePack().version;

    const res = await goiUpload(taoForm("noi-dung-dwg-route-1", "A", v), TOKEN);
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as { jobId: string };
    assert.ok(jobId);

    const resTt = await goiTrangThai(jobId);
    assert.equal(resTt.status, 200);
    const tt = (await resTt.json()) as {
      status: string;
      revisionId: number | null;
      idempotent: boolean;
    };
    assert.equal(tt.status, "completed"); // ĐỎ nếu bug quay lại (kẹt "pending")
    assert.ok(tt.revisionId, "phải trả revisionId cho plugin");
    assert.equal(tt.idempotent, false);

    // Gửi lại đúng tệp đó → không tạo revision đôi, vẫn báo xong với cùng revisionId.
    const resLai = await goiUpload(taoForm("noi-dung-dwg-route-1", "A", v), TOKEN);
    assert.equal(resLai.status, 202);
    const { jobId: jobId2 } = (await resLai.json()) as { jobId: string };
    const tt2 = (await (await goiTrangThai(jobId2)).json()) as {
      status: string;
      revisionId: number | null;
      idempotent: boolean;
    };
    assert.equal(tt2.status, "completed");
    assert.equal(tt2.revisionId, tt.revisionId);
    assert.equal(tt2.idempotent, true);

    const { queryOne } = await import("@/lib/db");
    const dem = await queryOne<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM drawing_revisions WHERE drawing_id = ?`,
      DRAWING,
    );
    assert.equal(dem?.n, 1); // idempotent: đúng 1 revision cho cùng hash
  },
);

test("kiểm định fail → job kết thúc ở 'failed' kèm thông điệp, không treo 'pending'", S, async () => {
  const res = await goiUpload(taoForm("noi-dung-dwg-route-2", "Z", "0.0.1-cu"), TOKEN);
  assert.equal(res.status, 422);
  const { jobId } = (await res.json()) as { jobId: string };

  const tt = (await (await goiTrangThai(jobId)).json()) as {
    status: string;
    revisionId: number | null;
    validation: { errors?: string[] } | null;
  };
  assert.equal(tt.status, "failed");
  assert.equal(tt.revisionId, null);
  assert.ok(tt.validation);
});

test("không có phiên/token hợp lệ → 401, không tạo job lẫn revision nào", S, async () => {
  const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
  const { queryOne } = await import("@/lib/db");
  const truoc = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM engineering_async_tasks WHERE task_type = 'cad.plugin-upload'`,
  );

  // Bearer rác: nhánh token trả null, route rơi về getCurrentUser() → không có cookie phiên.
  // Ngoài request scope, cookies() của Next throw — cả hai kết cục đều KHÔNG được xử lý tệp.
  let status = 0;
  try {
    status = (await goiUpload(taoForm("x", "A", getCurrentRulePack().version), "xbk_khong_ton_tai"))
      .status;
  } catch {
    status = 401;
  }
  assert.equal(status, 401);

  const sau = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM engineering_async_tasks WHERE task_type = 'cad.plugin-upload'`,
  );
  assert.equal(sau?.n, truoc?.n);
});

test("chỉ gửi drawingId (không drawingCode) → 202, revision rơi đúng bản vẽ theo id", S, async () => {
  const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
  const { queryOne } = await import("@/lib/db");
  const v = getCurrentRulePack().version;

  const res = await goiUpload(
    taoForm("noi-dung-dwg-route-only-id", "B", v, { drawingCode: null, drawingId: DRAWING }),
    TOKEN,
  );
  assert.equal(res.status, 202);
  const { jobId } = (await res.json()) as { jobId: string };

  const tt = (await (await goiTrangThai(jobId)).json()) as {
    status: string;
    revisionId: number | null;
  };
  assert.equal(tt.status, "completed");
  assert.ok(tt.revisionId, "phải trả revisionId khi chỉ gửi drawingId");

  const rev = await queryOne<{ drawing_id: number }>(
    `SELECT drawing_id FROM drawing_revisions WHERE id = ?`,
    tt.revisionId,
  );
  assert.equal(rev?.drawing_id, DRAWING, "revision phải gắn đúng bản vẽ theo drawingId gửi lên");
});

test(
  "gửi lệch drawingId (bản vẽ #2) và drawingCode (bản vẽ #1) → route ưu tiên drawingId, revision rơi vào bản vẽ #2",
  S,
  async () => {
    // Đọc code route (app/api/engineering/cad/plugin-upload/route.ts): biến `drawing` được
    // chọn bằng `drawingIdTho ? SELECT ... WHERE id = ? : SELECT ... WHERE code = ?` — nghĩa
    // là hễ có drawingId (dù drawingCode cũng có) thì drawingId LUÔN thắng, drawingCode bị
    // bỏ qua hoàn toàn. Ca này khẳng định đúng hành vi thật đó (không phải giả định thông
    // thường "code đáng tin hơn id" hay ngược lại).
    const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
    const { queryOne } = await import("@/lib/db");
    const v = getCurrentRulePack().version;

    const res = await goiUpload(
      taoForm("noi-dung-dwg-route-lech", "A", v, {
        drawingCode: "PUR-TEST-001", // bản vẽ #1 (DRAWING)
        drawingId: DRAWING2, // bản vẽ #2 — phải thắng
      }),
      TOKEN,
    );
    assert.equal(res.status, 202);
    const { jobId } = (await res.json()) as { jobId: string };

    const tt = (await (await goiTrangThai(jobId)).json()) as {
      status: string;
      revisionId: number | null;
    };
    assert.equal(tt.status, "completed");
    assert.ok(tt.revisionId);

    const rev = await queryOne<{ drawing_id: number }>(
      `SELECT drawing_id FROM drawing_revisions WHERE id = ?`,
      tt.revisionId,
    );
    assert.equal(
      rev?.drawing_id,
      DRAWING2,
      "drawingId phải thắng drawingCode khi cả hai cùng gửi và lệch nhau",
    );
  },
);

test("drawingId không tồn tại → 404, không tạo revision nào", S, async () => {
  const { getCurrentRulePack } = await import("@/lib/ky-thuat/cad/rule-pack");
  const { queryOne } = await import("@/lib/db");
  const v = getCurrentRulePack().version;

  const idKhongTonTai = 999_999_999;
  const truoc = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM drawing_revisions WHERE drawing_id IN (?, ?)`,
    DRAWING,
    DRAWING2,
  );

  const res = await goiUpload(
    taoForm("noi-dung-dwg-route-id-sai", "A", v, {
      drawingCode: null,
      drawingId: idKhongTonTai,
    }),
    TOKEN,
  );
  // Route trả 404 khi không tìm thấy bản vẽ theo id (giống trường hợp không tìm thấy theo code).
  assert.equal(res.status, 404);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /Không tìm thấy bản vẽ/);

  const sau = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM drawing_revisions WHERE drawing_id IN (?, ?)`,
    DRAWING,
    DRAWING2,
  );
  assert.equal(sau?.n, truoc?.n, "drawingId sai không được tạo revision nào");
});
