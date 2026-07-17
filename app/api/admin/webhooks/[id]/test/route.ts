import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { queryOne, run } from "@/lib/db";
import { deliverDueWebhooks, type WebhookPayload } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

// POST /api/admin/webhooks/:id/test → chèn 1 delivery sự kiện 'ping' cho webhook rồi gửi ngay,
// trả kết quả để Admin kiểm URL/secret có nhận được không.
export async function POST(
  _req: NextRequest,
  { params: paramsP }: { params: Promise<{ id: string }> },
) {
  const params = await paramsP;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageIntegrations(user.role))
    return NextResponse.json({ error: "Chỉ Admin được quản lý webhook" }, { status: 403 });

  const id = parseInt(params.id);
  if (isNaN(id)) return NextResponse.json({ error: "ID không hợp lệ" }, { status: 400 });

  const wh = await queryOne<{ id: number; projectId: number | null }>(
    `SELECT id, project_id AS "projectId" FROM webhooks WHERE id = ?`,
    id,
  );
  if (!wh) return NextResponse.json({ error: "Không tìm thấy webhook" }, { status: 404 });

  const payload: WebhookPayload = {
    event: "ping",
    sentAt: new Date().toISOString(),
    projectId: wh.projectId,
    data: { message: `Kiểm tra webhook #${id} bởi ${user.name}` },
  };
  await run(
    `INSERT INTO webhook_deliveries (webhook_id, event, payload) VALUES (?, 'ping', ?::jsonb)`,
    id,
    JSON.stringify(payload),
  );

  // Gửi ngay các delivery đến hạn (gồm cả ping vừa chèn). deliverDueWebhooks bọc lỗi từng cái,
  // trả tổng {sent, failed} — Admin thấy ping có đi được không.
  const result = await deliverDueWebhooks();
  return NextResponse.json(result);
}
