import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M99 PR5 — plugin nộp DWG + DXF sidecar vào sổ bản vẽ (2 cổng kiểm định).
// (1) Route-source: auth Bearer-trước, CAN, rate limit, trần dung lượng.
// (2) Integration (TEST_DATABASE_URL, tự skip): AC5 (422 không tạo revision), AC8 (409 rule
//     pack cũ), idempotency theo sha256 DWG, rev trùng, job processing → giả lập worker
//     completed valid/invalid → revision giữ submitted / tự chuyển rejected.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const S = { skip: !HAS_TEST_DB };

// ===== (1) Route-source =====

function docRoute(...duongDan: string[]): string {
  return readFileSync(join(process.cwd(), "app", "api", ...duongDan, "route.ts"), "utf8");
}

test("route plugin-upload: Bearer cad trước cookies, CAN.manageDrawings, rate limit, trần MB", () => {
  const src = docRoute("engineering", "cad", "plugin-upload");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCadTokenUser/);
  assert.match(src, /CAN\.manageDrawings/);
  assert.match(src, /hitRateLimit\(`cad-upload:/);
  assert.match(src, /status: 413/);
  assert.match(src, /chotProjectIdChoGhi/);
  assert.match(src, /status: 422/);
});

test("route plugin-upload/[jobId]: Bearer cad + validate jobId UUID", () => {
  const src = docRoute("engineering", "cad", "plugin-upload", "[jobId]");
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /getCadTokenUser/);
  assert.match(src, /CAN\.manageDrawings/);
  assert.match(src, /\^\[0-9a-f-\]\{36\}\$/);
});

// ===== (2) Integration (Postgres) =====

let userId = 0;
let projectId = 0;

function nguoiNop() {
  return {
    id: userId,
    name: "Kỹ sư nộp bản vẽ",
    email: "pr5@test.local",
    role: "engineer" as const,
    orgId: 1,
  };
}

// DXF hợp lệ tối thiểu: dùng CHÍNH bộ ghi R2000 của repo trên parse-result rỗng —
// "bản vẽ không có nét thì tệp xuất ra cũng không có nét" nhưng cấu trúc vẫn đầy đủ,
// qua được validateDxf (nguồn sự thật duy nhất, không tự chế chuỗi DXF trong test).
async function dxfHopLe(): Promise<string> {
  const { exportDxf } = await import("@/lib/ky-thuat/cad/dxf-parser");
  return exportDxf({ layers: [], entities: [], blocks: [] } as never);
}

function mauInput(dxf: string, dwgNoiDung: string, ghiDe: Partial<Record<string, string>> = {}) {
  return {
    user: nguoiNop(),
    projectId,
    dwg: Buffer.from(dwgNoiDung),
    dwgOriginalName: "MB-TANG-05.dwg",
    dxfContent: dxf,
    report: { cheDo: "chuan-hoa" },
    rulePackVersion: ghiDe.rulePackVersion ?? "v2",
    drawingCode: ghiDe.drawingCode ?? "ACMV-SD-T05-001",
    drawingName: "Mặt bằng tầng 5",
    systems: "HVAC",
    rev: ghiDe.rev ?? "A",
  };
}

before(async () => {
  if (!HAS_TEST_DB) return;
  const { insertId } = await import("@/lib/db");
  userId = await insertId(
    `INSERT INTO users (name, email, password_hash, role, org_id)
     VALUES ('Kỹ sư nộp bản vẽ', 'cad-pr5-${Date.now()}@test.local', 'x', 'engineer', 1)`,
  );
  projectId = await insertId(
    `INSERT INTO projects (name, code, org_id) VALUES ('Dự án test PR5', 'PR5-${Date.now()}', 1)`,
  );
});

after(async () => {
  if (!HAS_TEST_DB || !userId) return;
  const { run } = await import("@/lib/db");
  await run(
    `DELETE FROM engineering_async_tasks WHERE task_type = 'mepf.cad.plugin_validate' AND created_by = ?`,
    userId,
  );
  await run(`DELETE FROM drawing_revisions WHERE uploaded_by = ?`, userId);
  await run(`DELETE FROM drawings WHERE created_by = ?`, userId);
  await run(`DELETE FROM users WHERE id = ?`, userId);
  if (projectId) await run(`DELETE FROM projects WHERE id = ?`, projectId);
});

test("AC5: DXF hỏng cấu trúc → invalid-dxf, KHÔNG tạo drawings/drawing_revisions", S, async () => {
  const { nhanPluginUpload } = await import("@/lib/ky-thuat/cad/plugin-upload");
  const { queryOne } = await import("@/lib/db");
  const kq = await nhanPluginUpload(mauInput("day khong phai dxf", "dwg-1"));
  assert.equal(kq.kind, "invalid-dxf");
  const banVe = await queryOne(`SELECT 1 FROM drawings WHERE created_by = ?`, userId);
  assert.equal(banVe, undefined);
});

test("AC8: rulePackVersion lỗi thời → rule-pack-cu kèm version hiện hành", S, async () => {
  const { nhanPluginUpload } = await import("@/lib/ky-thuat/cad/plugin-upload");
  const kq = await nhanPluginUpload(mauInput(await dxfHopLe(), "dwg-2", { rulePackVersion: "v1" }));
  assert.equal(kq.kind, "rule-pack-cu");
  if (kq.kind === "rule-pack-cu") assert.equal(kq.hienHanh, "v2");
});

test(
  "nộp hợp lệ → revision submitted + task enqueue; nộp lại cùng DWG → trung-lap",
  S,
  async () => {
    const { nhanPluginUpload } = await import("@/lib/ky-thuat/cad/plugin-upload");
    const { queryOne } = await import("@/lib/db");
    const dxf = await dxfHopLe();

    const kq = await nhanPluginUpload(mauInput(dxf, "dwg-noi-dung-3"));
    assert.equal(kq.kind, "ok");
    if (kq.kind !== "ok") return;

    const rev = await queryOne<{
      status: string;
      sourceTool: string;
      rulePackVersion: string;
      dxfFileName: string | null;
    }>(
      `SELECT status, source_tool AS "sourceTool", rule_pack_version AS "rulePackVersion",
            dxf_file_name AS "dxfFileName"
       FROM drawing_revisions WHERE id = ?`,
      kq.revisionId,
    );
    assert.ok(rev);
    assert.equal(rev.status, "submitted");
    assert.equal(rev.sourceTool, "plugin");
    assert.equal(rev.rulePackVersion, "v2");
    assert.ok(rev.dxfFileName);

    const task = await queryOne<{ status: string }>(
      `SELECT status FROM engineering_async_tasks WHERE id = ?::uuid`,
      kq.jobId,
    );
    assert.equal(task?.status, "pending");

    // Idempotency: cùng nội dung DWG (dù đổi code/rev) → trả revision cũ, không tạo mới.
    const lai = await nhanPluginUpload(
      mauInput(dxf, "dwg-noi-dung-3", { drawingCode: "KHAC-001", rev: "B" }),
    );
    assert.deepEqual(lai, { kind: "trung-lap", revisionId: kq.revisionId });

    // Cùng bản vẽ + cùng rev nhưng DWG khác → rev-ton-tai (phải tăng rev).
    const revTrung = await nhanPluginUpload(mauInput(dxf, "dwg-noi-dung-3-sua"));
    assert.equal(revTrung.kind, "rev-ton-tai");
  },
);

test("job: processing → giả lập worker fail → revision tự chuyển rejected (1 lần)", S, async () => {
  const { nhanPluginUpload, layPluginUploadJob } = await import("@/lib/ky-thuat/cad/plugin-upload");
  const { queryOne, run } = await import("@/lib/db");

  const kq = await nhanPluginUpload(
    mauInput(await dxfHopLe(), "dwg-se-bi-tu-choi", { drawingCode: "ACMV-SD-T06-001" }),
  );
  assert.equal(kq.kind, "ok");
  if (kq.kind !== "ok") return;

  // Chưa có worker → processing.
  const dangCho = await layPluginUploadJob(kq.jobId, nguoiNop());
  assert.deepEqual(dangCho, {
    kind: "ok",
    status: "processing",
    revisionId: kq.revisionId,
    validation: null,
  });

  // Người khác (không phải admin/pm) không xem được job.
  const nguoiLa = { ...nguoiNop(), id: userId + 999_999 };
  assert.equal((await layPluginUploadJob(kq.jobId, nguoiLa)).kind, "khong-co-quyen");

  // Giả lập worker ezdxf hoàn tất với kết quả KHÔNG đạt (đúng shape cad_plugin_validate.py).
  await run(
    `UPDATE engineering_async_tasks
        SET status = 'completed',
            result = '{"status":"ok","valid":false,"errors":["ezdxf phải tự vá 455 chỗ"]}'::jsonb
      WHERE id = ?::uuid`,
    kq.jobId,
  );
  const sau = await layPluginUploadJob(kq.jobId, nguoiNop());
  assert.equal(sau.kind === "ok" && sau.status, "rejected");

  const rev = await queryOne<{ status: string; note: string }>(
    `SELECT status, decision_note AS note FROM drawing_revisions WHERE id = ?`,
    kq.revisionId,
  );
  assert.equal(rev?.status, "rejected");
  assert.match(rev!.note, /ezdxf/);
});

test(
  "job: worker đạt → status ok, revision giữ submitted + kết quả ghi vào report",
  S,
  async () => {
    const { nhanPluginUpload, layPluginUploadJob } =
      await import("@/lib/ky-thuat/cad/plugin-upload");
    const { queryOne, run } = await import("@/lib/db");

    const kq = await nhanPluginUpload(
      mauInput(await dxfHopLe(), "dwg-dat-kiem-dinh", { drawingCode: "ACMV-SD-T07-001" }),
    );
    assert.equal(kq.kind, "ok");
    if (kq.kind !== "ok") return;

    await run(
      `UPDATE engineering_async_tasks
        SET status = 'completed',
            result = '{"status":"ok","valid":true,"errors":[],"layerMatchPercent":98}'::jsonb
      WHERE id = ?::uuid`,
      kq.jobId,
    );
    const sau = await layPluginUploadJob(kq.jobId, nguoiNop());
    assert.equal(sau.kind === "ok" && sau.status, "ok");

    const rev = await queryOne<{
      status: string;
      report: { serverValidation: { valid: boolean } };
    }>(
      `SELECT status, standardize_report AS report FROM drawing_revisions WHERE id = ?`,
      kq.revisionId,
    );
    assert.equal(rev?.status, "submitted");
    assert.equal(rev!.report.serverValidation.valid, true);
  },
);
