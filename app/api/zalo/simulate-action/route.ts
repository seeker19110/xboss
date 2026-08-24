import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { chotProjectIdChoGhi, getCurrentProjectId } from "@/lib/ha-tang/projects";
import { processIncomingZaloMessage } from "@/lib/ky-thuat/engineering-zalo-copilot";

export const dynamic = "force-dynamic";

// POST /api/zalo/simulate-action
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  try {
    const body = await req.json();
    // Không tin project_id client gửi — trước đây `(user as any).projectId` không tồn tại
    // trên kiểu User nên biểu thức luôn rơi về giá trị client gửi, cho phép INSERT binding
    // giả vào project_id BẤT KỲ (IDOR ghi chéo dự án).
    const chotDuAn = await chotProjectIdChoGhi(
      user,
      body.projectId,
      (await getCurrentProjectId(user)) || 1,
    );
    if (!chotDuAn.ok)
      return NextResponse.json(
        { error: "Không có quyền thao tác trên dự án này" },
        { status: 403 },
      );
    const projectId = chotDuAn.projectId;
    const rawText = body.text || "";
    const zaloUserId = body.zaloUserId || `ZALO_USER_${user.id}`;

    if (!rawText.trim()) {
      return NextResponse.json({ error: "Nội dung tin nhắn không được để trống" }, { status: 400 });
    }

    // processIncomingZaloMessage nay chỉ xử lý tin nhắn của Zalo ID ĐÃ liên kết & xác thực
    // (V1 — chặn giả mạo qua webhook). Trang giả lập chạy dưới phiên đăng nhập thật nên tự
    // bảo đảm binding cho chính người đang thử — cùng cách route giả lập Telegram vẫn làm.
    const { query, withProjectScope } = await import("@/lib/db");
    await withProjectScope(
      projectId,
      async () => {
        await query(
          `INSERT INTO zalo_user_bindings (project_id, user_id, zalo_user_id, zalo_display_name, is_verified)
           VALUES (?, ?, ?, ?, true)
           ON CONFLICT (project_id, zalo_user_id)
           DO UPDATE SET is_verified = true, user_id = EXCLUDED.user_id
           WHERE zalo_user_bindings.user_id = EXCLUDED.user_id OR zalo_user_bindings.is_verified = false`,
          projectId,
          user.id,
          zaloUserId,
          user.name,
        );
      },
      { readOnly: false },
    );

    const result = await processIncomingZaloMessage({
      projectId,
      zaloUserId,
      rawText,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
