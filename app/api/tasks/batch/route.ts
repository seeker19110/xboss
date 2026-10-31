import { NextRequest, NextResponse } from "next/server";
import { query, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { boqTakenBy } from "@/lib/khoi-luong/boq";
import {
  recomputePackage,
  recomputeTask,
  statusConsistentWithProgress,
} from "@/lib/tien-do/recompute";
import { assignTask, guiPushPhanCong, type PushPhanCong } from "@/lib/tien-do/assignments";
import { handoverBlocked, methodStatementBlocked } from "@/lib/ky-thuat/qaqc";
import { log } from "@/lib/nen/log";
import type { StatusSlug } from "@/lib/tien-do/status";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

const MAX_UPDATES = 500;
const KHONG_CON_QUYEN = "D01: không còn quyền lúc ghi";

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
  // Push phân công gom lại, gửi SAU COMMIT (đợt tối ưu 3, L5) — không giữ khoá task/sheet trong
  // lúc chờ mạng, và không báo "được giao" cho một phân công rồi bị rollback.
  const pushCho: PushPhanCong[] = [];
  // Khoá trước MỘT lần mọi task hợp lệ của lô theo id tăng dần (đợt tối ưu 3, L4) — cùng thứ tự
  // với tick theo lô; trước đây khoá từng task theo thứ tự client gửi, xen kẽ với UPDATE → hai
  // lô ngược chiều (hoặc lô + tick đơn) giữ chéo khoá rồi deadlock.
  const idHopLe = [
    ...new Set(updates.map((u) => parseInt(String(u.id))).filter((n) => !isNaN(n))),
  ].sort((a, b) => a - b);

  try {
    const updated = await withTransaction(async () => {
      // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay đầu transaction ghi (giữ tới COMMIT).
      if (!(await kiemQuyenTaiLucGhi(() => CAN.editStructure(me.role))))
        throw new Error(KHONG_CON_QUYEN);
      // Kèm dự án của task (P5 — trước đây 1 taskProjectId mỗi dòng). `OF t`: chỉ khoá dòng task.
      const khoa = idHopLe.length
        ? await query<{
            id: number;
            package_id: number;
            status: string | null;
            progress_percent: number | null;
            project_id: number | null;
          }>(
            `SELECT t.id, t.package_id, t.status, t.progress_percent, tw.project_id
               FROM tasks t
               JOIN work_packages wp ON wp.id = t.package_id
               JOIN sheet_types st ON st.id = wp.sheet_type_id
               LEFT JOIN towers tw ON tw.id = st.tower_id
              WHERE t.id IN (${idHopLe.map(() => "?").join(", ")})
              ORDER BY t.id FOR UPDATE OF t`,
            ...idHopLe,
          )
        : [];
      const taskDaKhoa = new Map(khoa.map((r) => [r.id, r]));
      let count = 0;
      // Duyệt theo thứ tự client gửi như trước (mọi khoá đã giữ ở trên) — lỗi đầu tiên báo ra
      // và thứ tự ghi (id trùng trong lô: dòng sau thắng) giữ y hệt.
      for (const u of updates) {
        const id = parseInt(String(u.id));
        const patch = (u.patch && typeof u.patch === "object" ? u.patch : {}) as Record<
          string,
          unknown
        >;
        if (isNaN(id)) throw new Error("ID không hợp lệ");

        const exists = taskDaKhoa.get(id);
        if (!exists) throw new Error(`Không tìm thấy task #${id}`);
        // Cách ly dự án (vá W7, Đợt 5) — kiểm TỪNG task trong vùng chọn trước khi ghi, cùng
        // lỗi generic "Không tìm thấy" như task không tồn tại (không xác nhận task tồn tại
        // ở dự án khác).
        if (projectId == null || exists.project_id !== projectId)
          throw new Error(`Không tìm thấy task #${id}`);
        const progressPercent = exists.progress_percent ?? 0;

        if (patch.status === "nghiem_thu")
          throw new Error("Dùng duyệt nghiệm thu để đặt trạng thái này");
        // Bất biến nghiệm thu (L1, audit 2026-09-22) — cùng luật với PATCH đơn: task ĐANG
        // nghiem_thu không đổi trạng thái qua route thường (kể cả hoan_thanh), phải huỷ
        // nghiệm thu trước. Cả lô atomic nên 1 task vướng là dừng nguyên lô.
        if (exists.status === "nghiem_thu" && patch.status !== undefined)
          throw new Error(
            `Task #${id} đã nghiệm thu — huỷ nghiệm thu (DELETE /api/tasks/:id/approve) trước khi sửa`,
          );
        // Cùng quy tắc validate với PATCH đơn: status là slug hợp lệ, ngày đúng dạng.
        if (
          patch.status !== undefined &&
          !["chuan_bi", "dang_thi_cong", "hoan_thanh", "tre"].includes(patch.status as string)
        )
          throw new Error(`Trạng thái không hợp lệ ở task #${id}`);
        // Batch không sửa progress_percent — status thủ công phải khớp % hiện có (bất biến
        // hoan_thanh ⇔ progress>=1, xem statusConsistentWithProgress trong lib/recompute.ts).
        if (
          patch.status !== undefined &&
          !statusConsistentWithProgress(patch.status as StatusSlug, progressPercent)
        )
          throw new Error(
            progressPercent >= 1
              ? `Task #${id} đã 100% — trạng thái phải là hoàn thành`
              : `Task #${id} chưa 100% — không thể đặt trạng thái hoàn thành`,
          );
        // Hold point (M3) + gate biện pháp thi công (M8): cùng quy tắc với PATCH progress đơn —
        // chặn khi tự đặt trạng thái hoàn thành mà tầng/nhóm chưa qua chuyển bước/BPTC.
        if (patch.status === "hoan_thanh" && exists.status !== "hoan_thanh") {
          const gate = await handoverBlocked(exists.package_id);
          if (gate.blocked) throw new Error(`Task #${id}: ${gate.reason}`);
          const methodGate = await methodStatementBlocked(exists.package_id);
          if (methodGate.blocked) throw new Error(`Task #${id}: ${methodGate.reason}`);
        }
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
            const usedBy = await boqTakenBy(boq, me.orgId, { table: "tasks", id });
            if (usedBy) throw new Error(`Mã BOQ "${boq}" đã được dùng bởi ${usedBy}`);
          }
        }

        if (patch.assignedTo !== undefined) {
          await assignTask(
            id,
            patch.assignedTo === null ? null : Number(patch.assignedTo),
            me.id,
            pushCho,
          );
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
          // Đổi status thủ công không kèm đổi ngày (recomputeTask không chạy) không để lại
          // vết — cùng lý do vá ở PATCH /tasks/:id (reconstructProgressAtDate cần đủ history).
          else if (patch.status !== undefined && patch.status !== exists.status) {
            await run(
              `INSERT INTO task_history (task_id, old_progress, new_progress, status, note, changed_by)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              id,
              progressPercent,
              progressPercent,
              patch.status,
              "Đổi trạng thái thủ công (hàng loạt)",
              me.name,
            );
          }
          // Lần ghi sau cùng id trong lô đọc trạng thái MỚI như vòng SELECT … FOR UPDATE cũ.
          if (patch.status !== undefined)
            taskDaKhoa.set(id, { ...exists, status: String(patch.status) });
        }
        count++;
      }
      // Task theo id tăng dần (đã khoá), rồi mỗi nhóm đúng 1 lần theo id tăng dần (P3) — % nhóm
      // chỉ phụ thuộc % task sau cùng nên kết quả y như tính lại nhóm sau từng task.
      const nhom = new Set<number>();
      for (const id of [...toRecompute].sort((a, b) => a - b)) {
        const r = await recomputeTask(id, undefined, { hoanTinhNhom: true });
        if (r) nhom.add(r.packageId);
      }
      for (const pid of [...nhom].sort((a, b) => a - b)) await recomputePackage(pid);
      return count;
    });
    await guiPushPhanCong(pushCho);
    return NextResponse.json({ ok: true, updated });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === KHONG_CON_QUYEN)
      return NextResponse.json(
        { error: "Không có quyền chỉnh sửa (chỉ Admin/PM)" },
        { status: 403 },
      );
    const msg = e instanceof Error ? e.message : "Lỗi máy chủ khi cập nhật task";
    const status = /BOQ|hợp lệ|tìm thấy|nghiệm thu|100%|Chờ/i.test(msg) ? 422 : 500;
    if (status === 500)
      log.error("PATCH /api/tasks/batch lỗi", { route: "PATCH /api/tasks/batch", err: msg });
    // Lỗi 500 không lộ thông điệp thô (pg/nội bộ) — chi tiết đã nằm trong log.
    return NextResponse.json(
      { error: status === 500 ? "Lỗi máy chủ khi cập nhật task" : msg },
      { status },
    );
  }
}
