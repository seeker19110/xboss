import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { dangXuat } from "./helpers/phien"; // mock next/headers — phải trước mọi import route
import { test } from "node:test";
import assert from "node:assert/strict";
import { SoFixture, jreq, P, goi, type NguoiTest } from "./helpers/chuoi-nghiep-vu";

// QUALITY-FINAL-1 S13a — hồi quy CHUỖI tiến độ → nghiệm thu (A5-AC02, A5-AC03, phần tiến độ
// của A5-AC09; docs/nang-cap/AUDIT-2026-09-25/A5-BUSINESS-CHAIN.md).
//
// Mọi bước đi qua ROUTE HANDLER THẬT với đúng người bấm (TRAPS.md §6): kỹ sư tick ô
// (PATCH /api/dimensions/:id | /batch) → % task = ô đã tick / tổng ô → status suy ra →
// PM nghiệm thu 2 bước (POST /api/tasks/:id/approve, task phải 100%, QA bắt buộc Đạt, luồng
// duyệt M46 nếu có). Chỉ cây WBS và phụ thuộc hold-point là dữ liệu đầu vào chèn bằng SQL.
//
// Ca ĐỎ trên code hiện tại (lỗi thật, sửa ở S13b) được đánh `todo` — KHÔNG skip (release-gate
// coi skip là lỗi) — kèm mô tả lỗi; khi S13b vá xong phải gỡ `todo` để ca thành cổng chặn.

const S = { skip: !HAS_TEST_DB };
const TODO = (lyDo: string) => ({ skip: !HAS_TEST_DB, todo: lyDo });

test.after(() => dangXuat());

// ── Bước người dùng (route thật) ────────────────────────────────────────────────────────

async function tick(dimId: number, installed = true) {
  const { PATCH } = await import("@/app/api/dimensions/[id]/route");
  return goi(PATCH(jreq(`/api/dimensions/${dimId}`, { installed }, "PATCH"), P(dimId)));
}

async function tickLo(ids: number[], installed = true) {
  const { PATCH } = await import("@/app/api/dimensions/batch/route");
  return goi(PATCH(jreq(`/api/dimensions/batch`, { ids, installed }, "PATCH")));
}

async function nghiemThu(taskId: number, body: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/tasks/[id]/approve/route");
  return goi(POST(jreq(`/api/tasks/${taskId}/approve`, body), P(taskId)));
}

async function huyNghiemThu(taskId: number) {
  const { DELETE } = await import("@/app/api/tasks/[id]/approve/route");
  return goi(DELETE(jreq(`/api/tasks/${taskId}/approve`, undefined, "DELETE"), P(taskId)));
}

async function suaTask(taskId: number, body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/tasks/[id]/route");
  return goi(PATCH(jreq(`/api/tasks/${taskId}`, body, "PATCH"), P(taskId)));
}

// ── Đọc trạng thái (chỉ để kiểm, không dựng) ─────────────────────────────────────────────

async function docTask(id: number) {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ status: string; progress: number; src: string | null }>(
    `SELECT status, progress_percent AS progress, approval_source AS src FROM tasks WHERE id = ?`,
    id,
  ))!;
}

async function demLichSu(taskId: number, status?: string): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  const r = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM task_history WHERE task_id = ? AND (?::text IS NULL OR status = ?)`,
    taskId,
    status ?? null,
    status ?? null,
  );
  return r!.n;
}

async function tienDoNhom(packageId: number): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ p: number }>(
    `SELECT progress AS p FROM work_packages WHERE id = ?`,
    packageId,
  ))!.p;
}

async function demOTick(dims: number[]): Promise<number> {
  const { queryOne } = await import("@/lib/db");
  return (await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM progress_dimensions WHERE id = ANY(?::int[]) AND installed = 1`,
    dims,
  ))!.n;
}

/** Dự án + WBS + kỹ sư + PM; kỹ sư đang đăng nhập. */
async function dung(f: SoFixture, soO: number, systemId?: number) {
  const projectId = await f.duAn("td");
  const cay = await f.wbs(projectId, { soO, systemId });
  const ks = await f.user("engineer");
  const pm = await f.user("pm");
  await f.vao(ks, projectId);
  return { projectId, ...cay, ks, pm };
}

/** Kỹ sư tick lần lượt mọi ô → task 100%. */
async function tickHet(ks: NguoiTest, projectId: number, f: SoFixture, dims: number[]) {
  await f.vao(ks, projectId);
  for (const d of dims) assert.equal((await tick(d)).status, 200);
}

// ── A5-AC02 + AC09: chuỗi chuẩn ──────────────────────────────────────────────────────────

test(
  "A5-AC02/AC09 chuỗi: kỹ sư tick từng ô → % = ô/tổng + status + lịch sử; kỹ sư không tự nghiệm thu; PM nghiệm thu → nghiem_thu + audit",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 4);

      const r1 = await tick(c.dims[0]);
      assert.equal(r1.status, 200);
      let t = await docTask(c.taskId);
      assert.equal(t.progress, 0.25);
      assert.equal(t.status, "dang_thi_cong");

      for (const d of c.dims.slice(1)) assert.equal((await tick(d)).status, 200);
      t = await docTask(c.taskId);
      assert.equal(t.progress, 1);
      assert.equal(t.status, "hoan_thanh");
      assert.equal(await tienDoNhom(c.packageId), 1, "% nhóm = trung bình task");
      assert.equal(await demLichSu(c.taskId), 4, "mỗi lần % đổi ghi đúng 1 dòng task_history");

      // Thi công xong ≠ nghiệm thu: kỹ sư (không có CAN.approve, chưa có luồng) bị chặn.
      const ksDuyet = await nghiemThu(c.taskId);
      assert.equal(ksDuyet.status, 403);
      assert.equal((await docTask(c.taskId)).status, "hoan_thanh");

      await f.vao(c.pm, c.projectId);
      const ok = await nghiemThu(c.taskId);
      assert.equal(ok.status, 200);
      assert.equal(ok.body?.status, "nghiem_thu");
      t = await docTask(c.taskId);
      assert.equal(t.status, "nghiem_thu");
      assert.equal(t.src, "task", "duyệt riêng lẻ đánh dấu approval_source='task'");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 1, "audit nghiệm thu đúng 1 dòng");

      const lan2 = await nghiemThu(c.taskId);
      assert.equal(lan2.status, 409, "đã nghiệm thu rồi → 409, không ghi audit trùng");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC02: 199/200 ô (tick theo lô) → 0.99, nghiệm thu bị chặn 422; tick ô cuối → 100% → nghiệm thu được",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 200);
      const lo = await tickLo(c.dims.slice(0, 199));
      assert.equal(lo.status, 200);
      let t = await docTask(c.taskId);
      assert.equal(t.progress, 0.99, "199/200 không được làm tròn thành 1");
      assert.equal(t.status, "dang_thi_cong");

      await f.vao(c.pm, c.projectId);
      const chan = await nghiemThu(c.taskId);
      assert.equal(chan.status, 422);
      assert.equal((await docTask(c.taskId)).status, "dang_thi_cong");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 0);

      await f.vao(c.ks, c.projectId);
      assert.equal((await tick(c.dims[199])).status, 200);
      t = await docTask(c.taskId);
      assert.equal(t.progress, 1);
      assert.equal(t.status, "hoan_thanh");

      await f.vao(c.pm, c.projectId);
      assert.equal((await nghiemThu(c.taskId)).status, 200);
      assert.equal((await docTask(c.taskId)).status, "nghiem_thu");
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC02: task 100% nhưng phiếu QA bắt buộc Trượt → 409 vẫn chặn; có phiếu Đạt → nghiệm thu",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const he = await f.heThong();
      const c = await dung(f, 1, he);
      await f.vao(c.pm, c.projectId);
      const { POST: TAO_CHECKLIST } = await import("@/app/api/qc/checklists/route");
      const ck = await goi(
        TAO_CHECKLIST(
          jreq(`/api/qc/checklists`, {
            name: "Thử áp S13a",
            required: true,
            systemId: he,
            items: [{ label: "Áp lực thử", type: "pass_fail" }],
          }),
        ),
      );
      assert.equal(ck.status, 201);
      const checklistId = ck.body!.id as number;

      await tickHet(c.ks, c.projectId, f, c.dims);
      assert.equal((await docTask(c.taskId)).status, "hoan_thanh");

      const { POST: TAO_PHIEU } = await import("@/app/api/qc/inspections/route");
      const { PATCH: DUYET_PHIEU } = await import("@/app/api/qc/inspections/[id]/route");
      const taoPhieu = async (pass: boolean) => {
        await f.vao(c.ks, c.projectId);
        const p = await goi(
          TAO_PHIEU(
            jreq(`/api/qc/inspections`, {
              checklistId,
              taskId: c.taskId,
              results: [{ label: "Áp lực thử", pass }],
              status: "submitted",
            }),
          ),
        );
        assert.equal(p.status, 201);
        const id = p.body!.id as number;
        await f.vao(c.pm, c.projectId);
        const d = await goi(
          DUYET_PHIEU(
            jreq(`/api/qc/inspections/${id}`, { status: pass ? "passed" : "failed" }, "PATCH"),
            P(id),
          ),
        );
        assert.equal(d.status, 200);
      };

      await taoPhieu(false);
      const chan = await nghiemThu(c.taskId);
      assert.equal(chan.status, 409, "100% nhưng QA bắt buộc chưa Đạt → chặn");
      assert.equal((await docTask(c.taskId)).status, "hoan_thanh");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 0);

      await taoPhieu(true);
      assert.equal((await nghiemThu(c.taskId)).status, 200);
      assert.equal((await docTask(c.taskId)).status, "nghiem_thu");
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR04 phạm vi QA: checklist bắt buộc của dự án KHÁC (cùng hệ) không được chặn nghiệm thu dự án này",
  TODO(
    "S13b: requiredInspectionMissing (lib/ky-thuat/qaqc.ts) không lọc qc_checklists.project_id — " +
      "checklist required của dự án A chặn vĩnh viễn nghiệm thu mọi task cùng hệ (hoặc mọi hệ nếu " +
      "system_id NULL) ở dự án B, mà B không thể lập phiếu cho checklist của A (POST " +
      "/api/qc/inspections đòi checklist cùng dự án) → 409 không lối thoát",
  ),
  async () => {
    const f = new SoFixture();
    try {
      const he = await f.heThong();
      // Dự án A: PM tạo checklist bắt buộc cho hệ `he` qua route thật.
      const duAnA = await f.duAn("qa-a");
      const pmA = await f.user("pm");
      await f.vao(pmA, duAnA);
      const { POST: TAO_CHECKLIST } = await import("@/app/api/qc/checklists/route");
      const ck = await goi(
        TAO_CHECKLIST(
          jreq(`/api/qc/checklists`, {
            name: "Checklist riêng dự án A",
            required: true,
            systemId: he,
            items: [{ label: "Hạng mục A", type: "pass_fail" }],
          }),
        ),
      );
      assert.equal(ck.status, 201);

      // Dự án B (cùng hệ): thi công đủ 100%, PM của B nghiệm thu.
      const c = await dung(f, 1, he);
      await tickHet(c.ks, c.projectId, f, c.dims);
      await f.vao(c.pm, c.projectId);
      const r = await nghiemThu(c.taskId);
      assert.equal(r.status, 200, `checklist của dự án A chặn dự án B: ${JSON.stringify(r.body)}`);
      assert.equal((await docTask(c.taskId)).status, "nghiem_thu");
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC02: luồng duyệt pm→cdt — chờ duyệt và bị từ chối GIỮ status; chỉ bước cuối mới nghiem_thu + đúng 1 dòng lịch sử",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 2);
      const admin = await f.user("admin");
      await f.vao(admin, c.projectId);
      const { POST: TAO_LUONG } = await import("@/app/api/admin/approval-flows/route");
      const luong = await goi(
        TAO_LUONG(
          jreq(`/api/admin/approval-flows`, {
            entityType: "task_acceptance",
            name: "Nghiệm thu 2 bước S13a",
            projectId: c.projectId,
            steps: [
              { seq: 1, role: "pm" },
              { seq: 2, role: "cdt" },
            ],
          }),
        ),
      );
      assert.equal(luong.status, 201, JSON.stringify(luong.body));

      await tickHet(c.ks, c.projectId, f, c.dims);
      const cdt = await f.user("cdt");
      const bch = await f.user("bch");

      await f.vao(c.pm, c.projectId);
      const b1 = await nghiemThu(c.taskId);
      assert.equal(b1.status, 200);
      assert.equal(b1.body?.pending, true);
      assert.equal(b1.body?.nextRole, "cdt");
      assert.equal((await docTask(c.taskId)).status, "hoan_thanh", "pending không đổi status");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 0);

      await f.vao(bch, c.projectId);
      assert.equal((await nghiemThu(c.taskId)).status, 403, "BCH chỉ xem, không duyệt bước nào");

      await f.vao(cdt, c.projectId);
      assert.equal((await nghiemThu(c.taskId, { decision: "reject" })).status, 422, "thiếu lý do");
      const tuChoi = await nghiemThu(c.taskId, { decision: "reject", note: "Thiếu biên bản" });
      assert.equal(tuChoi.status, 200);
      assert.equal(tuChoi.body?.rejected, true);
      assert.equal((await docTask(c.taskId)).status, "hoan_thanh", "rejected không đổi status");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 0);

      // Trình lại → CĐT duyệt bước cuối → mới nghiem_thu.
      await f.vao(c.pm, c.projectId);
      const b2 = await nghiemThu(c.taskId);
      assert.equal(b2.body?.pending, true);
      await f.vao(cdt, c.projectId);
      const cuoi = await nghiemThu(c.taskId);
      assert.equal(cuoi.status, 200);
      assert.equal(cuoi.body?.status, "nghiem_thu");
      assert.equal((await docTask(c.taskId)).status, "nghiem_thu");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR04: PATCH task thường không đặt được nghiem_thu — kể cả Admin (không có đường bypass)",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 1);
      await tickHet(c.ks, c.projectId, f, c.dims);
      const admin = await f.user("admin");
      for (const u of [admin, c.pm]) {
        await f.vao(u, c.projectId);
        const r = await suaTask(c.taskId, { status: "nghiem_thu" });
        assert.equal(r.status, 422, `${u.role} PATCH status=nghiem_thu phải bị chặn`);
      }
      assert.equal((await docTask(c.taskId)).status, "hoan_thanh");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 0);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR04: nghiem_thu không bị hạ cấp tự động — quá hạn + tick lại (replay offline) vẫn giữ; bỏ tick 409; huỷ qua /approve mới hạ",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 2);
      await tickHet(c.ks, c.projectId, f, c.dims);
      await f.vao(c.pm, c.projectId);
      assert.equal((await nghiemThu(c.taskId)).status, 200);

      // Đổi ngày KT về quá khứ: route gọi recomputeTask — task quá hạn vẫn không bị hạ.
      const doiNgay = await suaTask(c.taskId, { endDate: "2020-01-01" });
      assert.equal(doiNgay.status, 200, JSON.stringify(doiNgay.body));
      assert.equal((await docTask(c.taskId)).status, "nghiem_thu");

      await f.vao(c.ks, c.projectId);
      const lai = await tick(c.dims[0], true);
      assert.equal(lai.status, 200, "tick lại ô đã tick (replay) không bị kẹt");
      let t = await docTask(c.taskId);
      assert.equal(t.status, "nghiem_thu");
      assert.equal(t.progress, 1);

      const bo = await tick(c.dims[0], false);
      assert.equal(bo.status, 409, "bỏ tick task đã nghiệm thu phải huỷ nghiệm thu trước");
      assert.equal(await demOTick(c.dims), 2);
      assert.equal((await docTask(c.taskId)).status, "nghiem_thu");

      await f.vao(c.pm, c.projectId);
      const huy = await huyNghiemThu(c.taskId);
      assert.equal(huy.status, 200);
      t = await docTask(c.taskId);
      assert.equal(t.status, "hoan_thanh", "huỷ: status suy lại từ tiến độ (100% → hoàn thành)");
      assert.equal(t.src, null);
    } finally {
      await f.don();
    }
  },
);

// ── A5-AC03: đồng thời, lặp lại, hold-point ──────────────────────────────────────────────

test(
  "A5-AC03: 4 lượt tick 4 ô khác nhau của CÙNG task gửi đồng thời → không lost update (4/4 = 100%)",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 4);
      const kq = await Promise.all(c.dims.map((d) => tick(d)));
      assert.deepEqual(
        kq.map((r) => r.status),
        [200, 200, 200, 200],
      );
      const t = await docTask(c.taskId);
      assert.equal(t.progress, 1, "mỗi recompute phải đọc số ô SAU khi lượt trước commit");
      assert.equal(t.status, "hoan_thanh");
      assert.equal(await tienDoNhom(c.packageId), 1);
      assert.equal(await demLichSu(c.taskId), 4);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC03: hai lượt nghiệm thu đồng thời → đúng 1 lần chuyển trạng thái, 1 dòng audit",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 1);
      await tickHet(c.ks, c.projectId, f, c.dims);
      await f.vao(c.pm, c.projectId);
      const kq = await Promise.all([nghiemThu(c.taskId), nghiemThu(c.taskId)]);
      assert.deepEqual(kq.map((r) => r.status).sort(), [200, 409]);
      assert.equal((await docTask(c.taskId)).status, "nghiem_thu");
      assert.equal(await demLichSu(c.taskId, "nghiem_thu"), 1);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-AC03: gửi lại cùng lượt tick (hàng đợi offline replay) idempotent — % và lịch sử không đổi",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 2);
      assert.equal((await tick(c.dims[0])).status, 200);
      const lichSu = await demLichSu(c.taskId);
      const lai = await tick(c.dims[0]);
      assert.equal(lai.status, 200);
      assert.equal((await docTask(c.taskId)).progress, 0.5);
      assert.equal(await demLichSu(c.taskId), lichSu, "replay không ghi thêm dòng lịch sử");
      const lo = await tickLo([c.dims[0]]);
      assert.equal(lo.status, 200);
      assert.equal((await docTask(c.taskId)).progress, 0.5);
      assert.equal(await demLichSu(c.taskId), lichSu);
    } finally {
      await f.don();
    }
  },
);

test(
  "A5-FR03: hold-point (nhóm trước chưa bàn giao) chặn tick đơn và tick lô cùng ngữ nghĩa — không ô nào bị ghi",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 2);
      const { insertId, run } = await import("@/lib/db");
      // Dữ liệu đầu vào: nhóm đi trước + phụ thuộc bắt buộc bàn giao (cấu hình WBS của PM).
      const nhomTruoc = await insertId(
        `INSERT INTO work_packages (sheet_type_id, code, name, sort_order) VALUES (?, ?, 'Nhóm trước', 0)`,
        c.sheetTypeId,
        `PKT${c.packageId}`,
      );
      await run(
        `INSERT INTO package_dependencies (predecessor_id, successor_id, requires_handover) VALUES (?, ?, TRUE)`,
        nhomTruoc,
        c.packageId,
      );
      const don = await tick(c.dims[0]);
      assert.equal(don.status, 409);
      const lo = await tickLo(c.dims);
      assert.equal(lo.status, 409);
      assert.equal(await demOTick(c.dims), 0);
      assert.equal((await docTask(c.taskId)).progress, 0);
    } finally {
      await f.don();
    }
  },
);

// ── A5-AC09 (phần tiến độ) + cách ly dự án ───────────────────────────────────────────────

test(
  "A5-AC09 vai trò: subcon chỉ tick task được giao; bch/cdt/viewer không tick; mọi vai trò không có quyền đều 403 khi nghiệm thu",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const c = await dung(f, 2);
      const subcon = await f.user("subcon");
      await f.vao(subcon, c.projectId);
      assert.equal((await tick(c.dims[0])).status, 403, "subcon chưa được giao");

      await f.vao(c.pm, c.projectId);
      assert.equal((await suaTask(c.taskId, { assignedTo: subcon.id })).status, 200);
      await f.vao(subcon, c.projectId);
      assert.equal((await tick(c.dims[0])).status, 200, "subcon tick task được giao");

      for (const role of ["bch", "cdt", "viewer"] as const) {
        const u = await f.user(role);
        await f.vao(u, c.projectId);
        assert.equal((await tick(c.dims[1])).status, 403, `${role} không được tick`);
      }
      assert.equal((await docTask(c.taskId)).progress, 0.5);

      await f.vao(c.ks, c.projectId);
      assert.equal((await tick(c.dims[1])).status, 200);
      for (const role of ["engineer", "subcon", "bch", "cdt", "viewer"] as const) {
        const u = await f.user(role);
        await f.vao(u, c.projectId);
        assert.equal((await nghiemThu(c.taskId)).status, 403, `${role} không được nghiệm thu`);
      }
      assert.equal((await docTask(c.taskId)).status, "hoan_thanh");
    } finally {
      await f.don();
    }
  },
);

test(
  "Cách ly dự án: tick/tick lô/nghiệm thu/huỷ nghiệm thu task của dự án khác → 404, không ghi gì",
  S,
  async () => {
    const f = new SoFixture();
    try {
      const b = await dung(f, 2); // dự án B: task đã 100%, đã nghiệm thu
      await tickHet(b.ks, b.projectId, f, b.dims);
      await f.vao(b.pm, b.projectId);
      assert.equal((await nghiemThu(b.taskId)).status, 200);
      const lichSu = await demLichSu(b.taskId);

      const a = await dung(f, 1); // dự án A: người của A chỉ thuộc A
      await f.vao(a.ks, a.projectId);
      assert.equal((await tick(b.dims[0], false)).status, 404);
      assert.equal((await tickLo([a.dims[0], b.dims[1]], false)).status, 404);
      await f.vao(a.pm, a.projectId);
      assert.equal((await nghiemThu(b.taskId)).status, 404);
      assert.equal((await huyNghiemThu(b.taskId)).status, 404);

      assert.equal(await demOTick(b.dims), 2);
      assert.equal(await demOTick(a.dims), 0, "lô bị chặn nguyên khối, kể cả ô của dự án mình");
      assert.equal((await docTask(b.taskId)).status, "nghiem_thu");
      assert.equal(await demLichSu(b.taskId), lichSu);
    } finally {
      await f.don();
    }
  },
);
