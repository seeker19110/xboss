import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, withTransaction } from "@/lib/db";
import { getCurrentUser, CAN } from "@/lib/auth";
import { getCurrentProjectId } from "@/lib/projects";
import { todayISO } from "@/lib/date";
import { advanceApproval } from "@/lib/approvals";
import { emitWebhook } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

type Decision = "approved" | "partially_approved" | "rejected";
const DECISIONS: Decision[] = ["approved", "partially_approved", "rejected"];

// POST /api/variations/:id/decide — CĐT/TVGS quyết định.
// body: { decision: 'approved'|'partially_approved'|'rejected', lines?: [{ id, qtyApproved }] }
// - approved: duyệt toàn bộ, qty_approved = qty_contract mọi dòng.
// - partially_approved: bắt nhập qty_approved từng dòng qua `lines` (0 ≤ qty ≤ đề xuất).
// - rejected: không duyệt dòng nào (qty_approved giữ NULL).
// M46 PR2: có approval_request đang pending cho VO này (do openApproval mở lúc tạo, chỉ
// xảy ra khi Admin cấu hình flow — PR4) → quyền + SoD do engine (advanceApproval) quyết
// định thay CAN.approve; approve ở bước CHƯA CUỐI chỉ ghi nhận bước (không đụng
// boq_items/status), lines gửi kèm bị bỏ qua (chỉ bước duyệt cuối mới áp dụng KL).
// reject ở bất kỳ bước nào chốt ngay (advanceApproval trả 'rejected'). Không có flow/
// request pending → hành vi y hệt trước đây (CAN.approve).
export async function POST(
  req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const decision = body?.decision as Decision;
  if (!DECISIONS.includes(decision))
    return NextResponse.json(
      { error: "decision phải là approved/partially_approved/rejected" },
      { status: 422 },
    );

  const lineInputs: { id: number; qtyApproved: number }[] = Array.isArray(body?.lines)
    ? body.lines.map((l: Record<string, unknown>) => ({
        id: Number(l?.id),
        qtyApproved: Number(l?.qtyApproved),
      }))
    : [];

  const projectId = await getCurrentProjectId(user);
  // withTransaction trả trực tiếp trạng thái "chưa tới bước cuối" thay vì gán qua biến
  // ngoài trong closure — gán qua closure khiến TS CFA narrow biến top-level về `never`
  // ở nhánh `if` bên dưới (không track được nhánh gán bên trong async callback).
  let pendingStep: { currentSeq: number; nextRole: string } | undefined;

  try {
    pendingStep = await withTransaction(async () => {
      const vo =
        projectId != null
          ? await queryOne<{ status: string }>(
              `SELECT status FROM variation_orders WHERE id = ? AND project_id = ? FOR UPDATE`,
              id,
              projectId,
            )
          : undefined;
      if (!vo) throw Object.assign(new Error("Không tìm thấy phát sinh"), { status: 404 });
      if (vo.status !== "submitted")
        throw Object.assign(
          new Error("Chỉ quyết định được phát sinh đã trình (đã được trình CĐT)"),
          {
            status: 409,
          },
        );

      const liveRequest = await queryOne<{ id: number }>(
        `SELECT id FROM approval_requests WHERE entity_type = 'variation' AND entity_id = ? AND status = 'pending'`,
        id,
      );
      if (liveRequest) {
        const result = await advanceApproval({
          entityType: "variation",
          entityId: id,
          user,
          decision: decision === "rejected" ? "reject" : "approve",
        });
        if (result.status === "pending") {
          // chưa tới bước cuối — không đụng boq_items/status, dừng ở đây.
          return { currentSeq: result.currentSeq, nextRole: result.nextRole };
        }
        // Bước cuối (approved) hoặc reject → áp domain logic bên dưới như cũ.
      } else if (!CAN.approve(user.role)) {
        throw Object.assign(new Error("Chỉ Admin/PM được duyệt phát sinh"), { status: 403 });
      }

      const lines = await query<{ id: number; qtyContract: number }>(
        `SELECT id, qty_contract AS "qtyContract" FROM boq_items WHERE vo_id = ? FOR UPDATE`,
        id,
      );
      if (lines.length === 0)
        throw Object.assign(new Error("Phát sinh không có dòng khối lượng nào"), { status: 409 });

      if (decision === "rejected") {
        await run(
          `UPDATE variation_orders SET status = 'rejected', decided_at = ? WHERE id = ?`,
          todayISO(),
          id,
        );
        return undefined;
      }

      if (decision === "approved") {
        await run(`UPDATE boq_items SET qty_approved = qty_contract WHERE vo_id = ?`, id);
      } else {
        // partially_approved: bắt buộc gửi đủ qty_approved cho từng dòng, 0 ≤ qty ≤ đề xuất.
        const byId = new Map(lineInputs.map((l) => [l.id, l.qtyApproved]));
        for (const line of lines) {
          const qty = byId.get(line.id);
          if (qty == null || !Number.isFinite(qty))
            throw Object.assign(new Error(`Thiếu khối lượng duyệt cho dòng #${line.id}`), {
              status: 422,
            });
          if (qty < 0 || qty > Number(line.qtyContract))
            throw Object.assign(
              new Error(
                `Khối lượng duyệt dòng #${line.id} phải trong khoảng 0–${line.qtyContract}`,
              ),
              { status: 422 },
            );
        }
        for (const line of lines) {
          await run(
            `UPDATE boq_items SET qty_approved = ? WHERE id = ?`,
            byId.get(line.id),
            line.id,
          );
        }
      }

      await run(
        `UPDATE variation_orders SET status = ?, decided_at = ? WHERE id = ?`,
        decision,
        todayISO(),
        id,
      );
      return undefined;
    });
  } catch (err: unknown) {
    const e = err as { message?: string; status?: number };
    return NextResponse.json({ error: e.message ?? String(err) }, { status: e.status ?? 500 });
  }

  if (pendingStep)
    return NextResponse.json({
      decided: id,
      pending: true,
      currentSeq: pendingStep.currentSeq,
      nextRole: pendingStep.nextRole,
    });

  // VO vừa CHUYỂN sang approved/partially_approved THẬT (pendingStep undefined = domain logic
  // đã chạy — nhánh legacy CAN.approve lẫn bước cuối engine đều rơi vào đây). Không phát khi
  // reject hay khi mới qua bước giữa (pendingStep set). Re-fetch code sau commit để tránh
  // vướng CFA của closure withTransaction.
  if (decision === "approved" || decision === "partially_approved") {
    const vo = await queryOne<{ code: string }>(
      `SELECT code FROM variation_orders WHERE id = ?`,
      id,
    );
    await emitWebhook("variation.approved", projectId, {
      voId: id,
      code: vo?.code ?? null,
      status: decision,
    });
  }
  return NextResponse.json({ decided: id, decision });
}
