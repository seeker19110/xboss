import { NextRequest, NextResponse } from "next/server";
import { queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { assertModuleEnabled } from "@/lib/feature-flags";
import { boqTakenBy } from "@/lib/boq";
import { recomputeTask } from "@/lib/recompute";
import { assignTask } from "@/lib/assignments";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

const MAX_UPDATES = 500;

// PATCH /api/tasks/batch  body: { updates: { id, patch }[] }  (Admin/PM)
// Sửa metadata nhiều task cùng lúc (tên/mã/ngày/status/người phụ trách) cho lưới
// kiểu bảng tính. Tái dùng quy tắc PATCH đơn: chặn status=nghiem_thu, validate BOQ,
// gán người qua assignTask, recompute khi đổi ngày. Cả lô atomic.
export async function PATCH(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.editStructure(me.role))
    return NextResponse.json({ error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" }, { status: 403 });

  const projectId = await getCurrentProjectId(me);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const updates: { id: unknown; patch: unknown }[] = Array.isArray(body.updates)
    ? body.updates
    : [];
  if (!updates.length) return NextResponse.json({ error: "Không có cập nhật" }, { status: 400 });
  if (updates.length > MAX_UPDATES)
    return NextResponse.json({ error: `Tối đa ${MAX_UPDATES} ô mỗi lần` }, { status: 422 });

  const fields: Record<string, string> = {
    name: "name",
    code: "code",
    note: "note",
    status: "status",
    startDate: "start_date",
    endDate: "end_date",
    boqCode: "boq_code",
  };
  const toRecompute = new Set<number>();

  try {
    const updated = await withTransaction(async () => {
      let count = 0;
      for (const u of updates) {
        const id = parseInt(String(u.id));
        const patch = (u.patch && typeof u.patch === "object" ? u.patch : {}) as Record<
          string,
          unknown
        >;
        if (isNaN(id)) throw new Error("ID không hợp lệ");

        const exists = await queryOne<{ id: number }>(`SELECT id FROM tasks WHERE id = ?`, id);
        if (!exists) throw new Error(`Không tìm thấy task #${id}`);

        if (patch.status === "nghiem_thu")
          throw new Error("Dùng duyệt nghiệm thu để đặt trạng thái này");
        // Cùng quy tắc validate với PATCH đơn: status là slug hợp lệ, ngày đúng dạng.
        if (
          patch.status !== undefined &&
          !["chuan_bi", "dang_thi_cong", "hoan_thanh", "tre"].includes(patch.status as string)
        )
          throw new Error(`Trạng thái không hợp lệ ở task #${id}`);
        for (const k of ["startDate", "endDate"] as const) {
          if (
            patch[k] !== undefined &&
            patch[k] !== null &&
            !/^\d{4}-\d{2}-\d{2}$/.test(String(patch[k]))
          )
            throw new Error(`Ngày không hợp lệ ở task #${id} (cần dạng YYYY-MM-DD)`);
        }
        if (patch.name !== undefined && !String(patch.name ?? "").trim())
          throw new Error(`Tên không hợp lệ ở task #${id} (không được để trống)`);

        if (patch.boqCode !== undefined) {
          const boq = String(patch.boqCode ?? "").trim();
          patch.boqCode = boq || null;
          if (boq) {
            // TODO(M54 PR2): lấy orgId thật từ session
            const usedBy = await boqTakenBy(boq, 1, { table: "tasks", id });
            if (usedBy) throw new Error(`Mã BOQ "${boq}" đã được dùng bởi ${usedBy}`);
          }
        }

        if (patch.assignedTo !== undefined) {
          await assignTask(id, patch.assignedTo === null ? null : Number(patch.assignedTo), me.id);
        }

        const sets: string[] = [];
        const vals: unknown[] = [];
        for (const [key, col] of Object.entries(fields)) {
          if (patch[key] !== undefined) {
            sets.push(`${col} = ?`);
            vals.push(patch[key]);
          }
        }
        if (sets.length) {
          vals.push(id);
          await run(
            `UPDATE tasks SET ${sets.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            ...vals,
          );
          if (patch.startDate !== undefined || patch.endDate !== undefined) toRecompute.add(id);
        }
        count++;
      }
      for (const id of toRecompute) await recomputeTask(id);
      return count;
    });
    return NextResponse.json({ ok: true, updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Lỗi máy chủ khi cập nhật task";
    const status = /BOQ|hợp lệ|tìm thấy|nghiệm thu/i.test(msg) ? 422 : 500;
    if (status === 500)
      log.error("PATCH /api/tasks/batch lỗi", { route: "PATCH /api/tasks/batch", err: msg });
    return NextResponse.json({ error: msg }, { status });
  }
}
