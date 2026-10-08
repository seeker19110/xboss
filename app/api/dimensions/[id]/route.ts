import { NextRequest, NextResponse } from "next/server";
import { queryOne, withTransaction } from "@/lib/db";
import { recomputeTask } from "@/lib/tien-do/recompute";
import { chuanHoaGhiChuO, ghiDauVetTick } from "@/lib/tien-do/dimension-events";
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

export const dynamic = "force-dynamic";

// PATCH /api/dimensions/:id  body: { installed: boolean, note?: string | null }
//   → toggle + tính lại % task/package.
// Bọc trong transaction: update dimension + recompute phải atomic để tránh
// 2 tick đồng thời tính sai % (đọc cùng snapshot rồi cả 2 cùng ghi).
// Hàng đợi offline (S06, kind `tick`): gửi kèm Idempotency-Key + X-XBoss-Context → receipt
// (lib/bao-mat/offline-receipt.ts) — cùng key một hiệu ứng, replay trả `{ receipt }`.
export async function PATCH(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  // Vai trò chỉ-xem (BCH/CĐT/Viewer) không được tick ô tiến độ.
  if (!CAN.editProgress(user.role))
    return NextResponse.json({ error: "Không có quyền cập nhật tiến độ" }, { status: 403 });

  const projectId = await getCurrentProjectId(user);
  const blocked = await assertModuleEnabled("tracking", projectId);
  if (blocked) return blocked;

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  // Context kiểm TRƯỚC phạm vi tài nguyên: tab cũ sau khi đổi dự án nhận 409 (xác minh lại),
  // không phải 404 "bị từ chối" làm hàng đợi bỏ thao tác (A2-AC02).
  let op: ReturnType<typeof docThaoTacHangDoi>;
  try {
    op = docThaoTacHangDoi(req.headers);
    if (op) await chotNguCanhHangDoi(op.context, user, projectId);
  } catch (e) {
    return traLoiOfflineHoacNem(e);
  }

  const body = await req.json().catch(() => ({}));
  const installed = body.installed ? 1 : 0;

  // Ghi chú theo ô (M120 FR3) — chuẩn hoá bằng lib dùng chung (ADR-0008: route chỉ là ranh
  // giới HTTP). Bỏ tick thì ghi chú bị xoá cùng dấu vết lắp (D2) nên `note` gửi kèm
  // installed=false không có tác dụng.
  const gc = chuanHoaGhiChuO(body.note);
  if (!gc.ok) return NextResponse.json({ error: gc.error }, { status: 422 });
  const note = gc.note;

  const dim = await queryOne<{ task_id: number; package_id: number; status: string | null }>(
    `SELECT pd.task_id, t.package_id, t.status
       FROM progress_dimensions pd JOIN tasks t ON t.id = pd.task_id
      WHERE pd.id = ?`,
    id,
  );
  if (!dim) return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });

  // Cách ly dự án (vá W6, Đợt 5) — canTouchTask chỉ trả lời "subcon có được giao task này
  // không" và trả `true` vô điều kiện cho mọi vai trò khác, KHÔNG so dự án. Không kiểm riêng
  // thì mọi vai trò không phải subcon ở dự án A tick được ô của dự án B (id đoán được).
  if (projectId == null || (await taskProjectId(dim.task_id)) !== projectId)
    return NextResponse.json({ error: "Không tìm thấy dimension" }, { status: 404 });

  if (!(await canTouchTask(user, dim.task_id)))
    return NextResponse.json(
      { error: "Bạn chỉ được cập nhật task được giao cho mình" },
      { status: 403 },
    );

  // Receipt (S06): hash gồm đúng thứ server sẽ ghi — ô đích + trạng thái + ghi chú đã chuẩn hoá
  // (ghi chú chỉ có tác dụng khi tick, xem chuanHoaGhiChuO/ghiDauVetTick). Giữ đủ 3 trạng thái
  // ghi chú: vắng mặt (giữ nguyên) ≠ null (xoá) — gộp thì đổi nghĩa dưới cùng key vẫn được ACK.
  const bn: PhamViBienNhan | null =
    op && projectId != null
      ? {
          user,
          projectId,
          operationId: op.operationId,
          kind: "tick",
          hash: bamYeuCau({
            kind: "tick",
            orgId: user.orgId,
            projectId,
            userId: user.id,
            target: { dimId: id },
            payload: {
              installed: !!installed,
              note: !installed ? null : note === undefined ? { giuNguyen: true } : note,
            },
            baseVersion: null,
          }),
        }
      : null;

  let result;
  try {
    result = await withTransaction(async () => {
      // Receipt tra TRƯỚC gate/precondition: thao tác đã COMMIT rồi mất ACK không được thất bại
      // giả vì gate đóng sau đó (DATA-CONTRACTS §5).
      if (bn) {
        const replay = await khoaVaTraBienNhan(bn);
        if (replay) return { replay } as const;
      }

      // Bất biến nghiệm thu (L2, audit 2026-09-22): bỏ tick ô của task đã nghiệm thu sẽ kéo %
      // xuống dưới 1 trong khi status vẫn nghiem_thu (deriveStatus giữ) — phá bất biến
      // "nghiem_thu ⇒ progress = 1". Phải huỷ nghiệm thu trước. Tick (installed=true) vẫn cho
      // vì không giảm %. Kiểm sớm (chưa khoá) để trả 409 trước khi đụng hold point.
      if (!installed && dim.status === "nghiem_thu") return NGHIEM_THU_409;

      // Hold point chuyển bước (M3) + gate biện pháp thi công (M8): chỉ chặn khi TICK
      // (installed=true) — bỏ tick không cần mở khoá.
      if (installed) {
        const gate = await handoverBlocked(dim.package_id);
        if (gate.blocked) return { error: gate.reason, httpStatus: 409 } as const;
        const methodGate = await methodStatementBlocked(dim.package_id);
        if (methodGate.blocked) return { error: methodGate.reason, httpStatus: 409 } as const;
      }

      // Kiểm lại nghiệm thu DƯỚI KHOÁ (review): kiểm ở trên chưa khoá, giữa lúc đó và đây có thể
      // có POST /approve chạy song song đặt nghiem_thu — FOR UPDATE cùng row với /approve nên 2
      // request tuần tự hoá, không còn race (TOCTOU). Khoá advisory receipt (nếu có) luôn lấy
      // TRƯỚC khoá dòng task → thứ tự khoá cố định, không deadlock.
      const locked = await queryOne<{ id: number; status: string | null }>(
        `SELECT id, status FROM tasks WHERE id = ? FOR UPDATE`,
        dim.task_id,
      );
      if (!installed && locked?.status === "nghiem_thu") return NGHIEM_THU_409;

      // Dữ liệu sự kiện theo ô (M120 FR1) — luật ai/lúc nào/ghi chú nằm trong lib dùng chung,
      // route chỉ là ranh giới HTTP (ADR-0008). `installedAt`/`installedBy` client gửi bị bỏ qua.
      await ghiDauVetTick([id], !!installed, { userId: user.id, note });
      const task = await recomputeTask(dim.task_id, user.name);
      const receipt = bn
        ? await ghiBienNhan(bn, {
            resourceType: "progress_dimension",
            resourceId: String(id),
            version: null,
          })
        : undefined;
      return { task, receipt } as const;
    });
  } catch (e) {
    return traLoiOfflineHoacNem(e);
  }

  if ("replay" in result) return NextResponse.json({ receipt: result.replay });
  if ("error" in result)
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });

  return NextResponse.json({
    id,
    installed: !!installed,
    task: result.task,
    ...(result.receipt ? { receipt: result.receipt } : {}),
  });
}

const NGHIEM_THU_409 = {
  error: "Task đã nghiệm thu — huỷ nghiệm thu (DELETE /api/tasks/:id/approve) trước khi sửa",
  httpStatus: 409,
} as const;
