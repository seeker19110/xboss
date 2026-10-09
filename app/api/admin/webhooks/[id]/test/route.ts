import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/bao-mat/auth";
import { queryOne, run } from "@/lib/db";
import { deliverDueWebhooks, type WebhookPayload } from "@/lib/bao-mat/webhooks";
import { ghiNeuConQuyen } from "@/lib/bao-mat/permissions";

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

  // M54 GĐ1 PR2 (đồng bộ GET/POST/PATCH/DELETE): cô lập tenant — chỉ test webhook thuộc org người gọi.
  const wh = await queryOne<{ id: number; projectId: number | null }>(
    `SELECT id, project_id AS "projectId" FROM webhooks WHERE id = ? AND org_id = ?`,
    id,
    user.orgId,
  );
  if (!wh) return NextResponse.json({ error: "Không tìm thấy webhook" }, { status: 404 });

  const payload: WebhookPayload = {
    event: "ping",
    sentAt: new Date().toISOString(),
    projectId: wh.projectId,
    data: { message: `Kiểm tra webhook #${id} bởi ${user.name}` },
  };
  // D01: tái kiểm quyền với dữ liệu có hiệu lực ngay trước ghi (snapshot lúc xác thực có thể stale). Chỉ phần ghi DB (xếp hàng ping) nằm trong transaction; gửi HTTP đi sau, ngoài transaction.
  const kq = await ghiNeuConQuyen(
    () => CAN.manageIntegrations(user.role),
    () =>
      run(
        `INSERT INTO webhook_deliveries (webhook_id, event, payload) VALUES (?, 'ping', ?::jsonb)`,
        id,
        JSON.stringify(payload),
      ),
  );
  if (!kq.ok)
    return NextResponse.json({ error: "Chỉ Admin được quản lý webhook" }, { status: 403 });

  // Gửi ngay các delivery đến hạn (gồm cả ping vừa chèn). deliverDueWebhooks bọc lỗi từng cái,
  // trả tổng {sent, failed} — Admin thấy ping có đi được không.
  const result = await deliverDueWebhooks();
  return NextResponse.json(result);
}
