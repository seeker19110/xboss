import { NextRequest, NextResponse } from "next/server";
import { query, withTransaction } from "@/lib/db";
import { recomputeTask } from "@/lib/tien-do/recompute";
import { ghiDauVetTick } from "@/lib/tien-do/dimension-events";
import { getCurrentUser, canTouchTask, CAN } from "@/lib/bao-mat/auth";
import { getCurrentProjectId } from "@/lib/ha-tang/projects";
import { assertModuleEnabled } from "@/lib/ha-tang/feature-flags";
import { handoverBlocked, methodStatementBlocked } from "@/lib/ky-thuat/qaqc";
import { taskProjectId } from "@/lib/tien-do/workpackages";
import {
  bamYeuCau,
  docThaoTacHangDoi,
  ghiBienNhan,
  khoaVaTraBienNhan,
  type PhamViBienNhan,
} from "@/lib/bao-mat/offline-receipt";
import { chotNguCanhHangDoi, traLoiOfflineHoacNem } from "@/lib/bao-mat/offline-http";
import { kiemQuyenTaiLucGhi } from "@/lib/bao-mat/permissions";

export const dynamic = "force-dynamic";

const MAX_IDS = 1000;

// PATCH /api/dimensions/batch  body: { ids: number[], installed: boolean }
// Tick/bỏ-tick nhiều ô dimension theo vùng chọn trên lưới tracking. recompute
// gộp một lần mỗi task (tránh tính lại trùng khi cả vùng cùng task). Atomic.
// Hàng đợi offline (S06, kind `tick_batch`): Idempotency-Key + X-XBoss-Context → receipt cho CẢ
// lô (lô atomic: một receipt, một hiệu ứng); replay trả `{ receipt }`.
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Vai trò chỉ-xem (BCH/CĐT/Viewer) không được tick ô tiến độ.
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền cập nhật tiến độ" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  // Context kiểm TRƯỚC phạm vi tài nguyên (xem app/api/dimensions/[id]/route.ts).
  let op: ReturnType<typeof docThaoTacHangDoi>;
  try {
    op = docThaoTacHangDoi(req.headers);
    if (op) await chotNguCanhHangDoi(op.context, user, projectId);
  } catch (e) {
    return traLoiOfflineHoacNem(e);
  }

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids)
    ? [
        ...new Set(
          body.ids.map((x: unknown) => parseInt(String(x))).filter((n: number) => !isNaN(n)),
        ),
      ]
    : [];
  if (!ids.length) return NextResponse.json({ error: "Không có dimension" }, { status: 400 });
  if (ids.length > MAX_IDS)
    return NextResponse.json({ error: `Tối đa ${MAX_IDS} ô mỗi lần` }, { status: 422 });
  const installed = body.installed ? 1 : 0;

  // Lấy task_id + package_id của từng dimension để kiểm quyền + gộp recompute + hold point.
  const placeholders = ids.map(() => "?").join(", ");
  const dims = await query<{
    id: number;
    task_id: number;
    package_id: number;
    status: string | null;
  }>(
    `SELECT pd.id, pd.task_id, t.package_id, t.status
       FROM progress_dimensions pd JOIN tasks t ON t.id = pd.task_id
      WHERE pd.id IN (${placeholders})`,
    ...ids,
  );
  if (!dims.length)
    return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });

  // Sắp tăng dần: mọi lô khoá task theo CÙNG một thứ tự (N2, audit logic 2026-10-01) — hai lô
  // chồng nhau xếp hàng ở task chung đầu tiên thay vì giữ chéo khoá rồi deadlock (Postgres huỷ 1
  // bên → 500). Khoá work_packages trong recomputeTask đến SAU khi đã giữ đủ khoá task.
  const taskIds = [...new Set(dims.map((d) => d.task_id))].sort((a, b) => a - b);

  // Cách ly dự án (vá W6, Đợt 5) — canTouchTask không so dự án (xem ghi chú ở
  // app/api/dimensions/[id]/route.ts). Kiểm TỪNG task trong vùng chọn: chỉ cần 1 ô thuộc
  // dự án khác là chặn nguyên request (id đoán được, "Không tìm thấy dimension" — không lộ
  // dòng nào thuộc dự án khác tồn tại).
  for (const tid of taskIds) {
    if (projectId == null || (await taskProjectId(tid)) !== projectId)
      return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });
  }

  for (const tid of taskIds) {
    if (!(await canTouchTask(user, tid)))
      return NextResponse.json(
        { error: "Bạn chỉ được cập nhật task được giao cho mình" },
        { status: 403 },
      );
  }

  const dimIds = dims.map((d) => d.id);
  const taskPlaceholders = taskIds.map(() => "?").join(", ");

  // Receipt (S06): hash theo TẬP ô client yêu cầu (đã khử trùng, sắp tăng) + trạng thái — gửi lại
  // cùng lô theo thứ tự khác vẫn là cùng thao tác; đổi tập ô/trạng thái dưới cùng key → 409.
  const bn: PhamViBienNhan | null =
    op && projectId != null
      ? {
          user,
          projectId,
          operationId: op.operationId,
          kind: "tick_batch",
          hash: bamYeuCau({
            kind: "tick_batch",
            orgId: user.orgId,
            projectId,
            userId: user.id,
            target: { dimIds: (ids as number[]).slice().sort((a, b) => a - b) },
            payload: { installed: !!installed },
            baseVersion: null,
          }),
        }
      : null;

  let result;
  try {
    result = await withTransaction(async () => {
      // Receipt tra TRƯỚC gate (xem PATCH đơn): khoá advisory receipt lấy trước khoá dòng task.
      if (bn) {
        const replay = await khoaVaTraBienNhan(bn);
        if (replay) return { replay } as const;
      }

      // Bất biến nghiệm thu (L2, audit 2026-09-22): bỏ tick ô của task đã nghiệm thu kéo % xuống
      // dưới 1 trong khi status vẫn nghiem_thu — phá bất biến "nghiem_thu ⇒ progress = 1". Chỉ cần
      // MỘT task trong vùng chọn đã nghiệm thu là chặn nguyên lô (lô atomic, không ghi gì).
      if (!installed && dims.some((d) => d.status === "nghiem_thu")) return NGHIEM_THU_409;

      // Hold point chuyển bước (M3) + gate biện pháp thi công (M8): chỉ chặn khi TICK —
      // kiểm từng package liên quan (dedup).
      if (installed) {
        const packageIds = [...new Set(dims.map((d) => d.package_id))];
        for (const pid of packageIds) {
          const gate = await handoverBlocked(pid);
          if (gate.blocked) return { error: gate.reason, httpStatus: 409 } as const;
          const methodGate = await methodStatementBlocked(pid);
          if (methodGate.blocked) return { error: methodGate.reason, httpStatus: 409 } as const;
        }
      }

      // Kiểm lại nghiệm thu DƯỚI KHOÁ (review): kiểm ở trên chưa khoá, giữa lúc đó và đây có thể
      // có POST /approve chạy song song đặt nghiem_thu — FOR UPDATE cùng row với /approve nên các
      // request tuần tự hoá, không còn race (TOCTOU).
      const locked = await query<{ id: number; status: string | null }>(
        `SELECT id, status FROM tasks WHERE id IN (${taskPlaceholders}) ORDER BY id FOR UPDATE`,
        ...taskIds,
      );
      if (!installed && locked.some((t) => t.status === "nghiem_thu")) return NGHIEM_THU_409;
      // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay sau khi khoá dòng, trước lần ghi đầu.
      if (!(await kiemQuyenTaiLucGhi(() => CAN.editProgress(user.role))))
        return { error: "Không có quyền cập nhật tiến độ", httpStatus: 403 } as const;

      // Dữ liệu sự kiện (M120 FR2) — cùng lib dùng chung với PATCH đơn. Không truyền `note`:
      // ghi chú là việc của từng ô, gán chung cả vùng chọn sẽ ra dữ liệu vô nghĩa (ghi chú cũ
      // của các ô được giữ nguyên khi tick, và bị xoá cùng dấu vết lắp khi bỏ tick).
      await ghiDauVetTick(dimIds, !!installed, { userId: user.id });
      for (const tid of taskIds) await recomputeTask(tid, user.name);
      const receipt = bn
        ? await ghiBienNhan(bn, {
            resourceType: "progress_dimension_batch",
            resourceId: [...dimIds].sort((a, b) => a - b).join(","),
            version: null,
          })
        : undefined;
      return { receipt } as const;
    });
  } catch (e) {
    return traLoiOfflineHoacNem(e);
  }

  if ("replay" in result) return NextResponse.json({ receipt: result.replay });
  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });

  return NextResponse.json({
    ok: true,
    updated: dimIds.length,
    installed: !!installed,
    ...(result.receipt ? { receipt: result.receipt } : {}),
  });
}

const NGHIEM_THU_409 = {
  error: "Task đã nghiệm thu — huỷ nghiệm thu (DELETE /api/tasks/:id/approve) trước khi sửa",
  httpStatus: 409,
} as const;
