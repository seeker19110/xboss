import { NextRequest } from "next/server";
import { queryOne } from "@/lib/db";
import { CAN, getCurrentUser } from "@/lib/bao-mat/auth";
import { capNhatThietBi, type ThayDoiThietBi } from "@/lib/bao-mat/offline-devices";
import {
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
} from "@/lib/bao-mat/offline-http";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// PATCH /api/offline/devices/:id  body: { profile: "shared-safe" | "field-personal" } | { revoke: true }
// Chỉ Admin cùng tổ chức có CAN.manageUsers VÀ đã bật 2FA (DATA-CONTRACTS §3). Chỉ đổi profile/
// duyệt/thu hồi — không đổi owner/org/proof. Thu hồi là một chiều. Không cần KEK (thu hồi vẫn làm
// được khi tính năng đang tắt).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, { kiemOrigin: true, canVault: false });
  if (!md.ok) return md.res;
  if (user.role !== "admin" || !CAN.manageUsers(user.role))
    return loiOffline(403, "forbidden", "Chỉ Admin được duyệt/thu hồi thiết bị offline");
  const tfa = await queryOne<{ on: boolean }>(
    `SELECT totp_enabled_at IS NOT NULL AS on FROM users WHERE id = ?`,
    user.id,
  );
  if (!tfa?.on)
    return loiOffline(
      403,
      "two_factor_required",
      "Cần bật xác thực 2 lớp trước khi duyệt/thu hồi thiết bị",
    );

  const { id } = await params;
  if (!UUID_RE.test(id)) return loiOffline(404, "device_not_found", "Không tìm thấy thiết bị");

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const khoa = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body) : [];
  let thayDoi: ThayDoiThietBi | null = null;
  if (khoa.length === 1 && khoa[0] === "revoke" && body?.revoke === true)
    thayDoi = { revoke: true };
  else if (
    khoa.length === 1 &&
    khoa[0] === "profile" &&
    (body?.profile === "shared-safe" || body?.profile === "field-personal")
  )
    thayDoi = { profile: body.profile };
  if (!thayDoi)
    return loiOffline(
      422,
      "invalid_body",
      'Chỉ nhận đúng một trường: { profile: "shared-safe" | "field-personal" } hoặc { revoke: true }',
    );

  try {
    return jsonOffline({ device: await capNhatThietBi(user, id, thayDoi) });
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
