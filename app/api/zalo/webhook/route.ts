import { NextRequest, NextResponse } from "next/server";
import {
  processIncomingZaloMessage,
  timBindingZaloDaXacThuc,
} from "@/lib/ky-thuat/engineering-zalo-copilot";
import { xacThucWebhookZalo } from "@/lib/bao-mat/webhook-inbound";
import { log } from "@/lib/nen/log";

export const dynamic = "force-dynamic";

// GET /api/zalo/webhook (Verification for Zalo Webhook setup)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get("challenge") || "ok";
  return NextResponse.json({ challenge });
}

// POST /api/zalo/webhook
// Endpoint công khai, không có phiên đăng nhập — chữ ký HMAC của Zalo OA là ranh giới bảo mật
// duy nhất, kiểm ngay dòng đầu trước khi xử lý bất cứ thứ gì.
export async function POST(req: NextRequest) {
  // Đọc raw body MỘT lần bằng req.text() rồi tự JSON.parse: HMAC phải tính trên đúng chuỗi byte
  // bên gửi đã ký, mà req.json() → JSON.stringify() lại sẽ đổi thứ tự khoá/khoảng trắng/escape
  // unicode nên chữ ký lệch. Body của Request chỉ đọc được một lần nên không thể gọi cả hai.
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Không đọc được nội dung yêu cầu" }, { status: 400 });
  }

  let hopLe: boolean;
  try {
    hopLe = xacThucWebhookZalo(req, rawBody);
  } catch (err) {
    log.error("Webhook Zalo thiếu cấu hình bảo mật", {
      err: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Webhook chưa được cấu hình bảo mật phía máy chủ" },
      { status: 500 },
    );
  }
  if (!hopLe) {
    return NextResponse.json({ error: "Chữ ký webhook không hợp lệ" }, { status: 401 });
  }

  try {
    // Cố ý KHÔNG khai trường projectId trong kiểu: dự án suy từ binding, body không được quyết.
    type ThanTinNhanZalo = {
      sender?: { id?: string };
      zaloUserId?: string;
      message?: { text?: string };
      rawText?: string;
    };
    let body: ThanTinNhanZalo;
    try {
      body = JSON.parse(rawBody || "{}") as ThanTinNhanZalo;
    } catch {
      return NextResponse.json({ error: "Nội dung yêu cầu không phải JSON" }, { status: 400 });
    }

    const zaloUserId: string = body.sender?.id || body.zaloUserId || "";
    const messageText: string = body.message?.text || body.rawText || "";

    if (!zaloUserId) {
      return NextResponse.json({ error: "Thiếu định danh người gửi Zalo" }, { status: 400 });
    }
    if (!messageText) {
      return NextResponse.json({ error: "Nội dung tin nhắn trống" }, { status: 400 });
    }

    // projectId SUY TỪ BINDING, tuyệt đối không lấy từ body: trước đây route đọc thẳng trường
    // projectId của body (mặc định 1) rồi đưa chính giá trị đó vào withProjectScope — tức RLS
    // bị hợp thức hoá bằng giá trị kẻ tấn công gửi lên.
    const binding = await timBindingZaloDaXacThuc(zaloUserId);
    if (!binding) {
      return NextResponse.json(
        {
          error:
            "Tài khoản Zalo chưa được liên kết với XBoss. Vui lòng mở ứng dụng XBoss → Zalo Copilot để lấy mã OTP và xác thực liên kết trước.",
        },
        { status: 403 },
      );
    }

    const response = await processIncomingZaloMessage({
      projectId: binding.projectId,
      zaloUserId,
      rawText: messageText,
    });

    return NextResponse.json({
      recipient: { id: zaloUserId },
      message: { text: response.replyText },
      metadata: { intent: response.intent, actionDispatched: response.actionDispatched },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
