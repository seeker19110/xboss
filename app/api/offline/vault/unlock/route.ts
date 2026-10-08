import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { moKhoaVault } from "@/lib/bao-mat/offline-vault";
import {
  chotBoiCanhVault,
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
} from "@/lib/bao-mat/offline-http";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_KEY_IDS = 200;

// POST /api/offline/vault/unlock  header X-XBoss-Context  body: { keyIds?: string[] }
// Mở khoá vault (DATA-CONTRACTS §4): phiên đúng chủ + proof thiết bị chưa thu hồi + context còn
// khớp + kiểm lại TOÀN BỘ manifest của từng khoá với quyền hiện hành. Khoá có tài nguyên bị thu
// hồi / KEK đã gỡ / dữ liệu bị sửa / không phải của mình → chỉ nằm trong `locked` (không lý do).
// Rate limit theo user — đây là điểm phát DEK thô.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, {
    kiemOrigin: true,
    canVault: true,
    gioiHan: { ten: "unlock", max: 30 },
  });
  if (!md.ok) return md.res;
  const body = (await req.json().catch(() => null)) as { keyIds?: unknown } | null;
  let keyIds: string[] | null = null;
  if (body?.keyIds !== undefined && body?.keyIds !== null) {
    const ds = body.keyIds;
    if (
      !Array.isArray(ds) ||
      ds.length > MAX_KEY_IDS ||
      !ds.every((k) => typeof k === "string" && UUID_RE.test(k))
    )
      return loiOffline(422, "invalid_body", `keyIds phải là mảng tối đa ${MAX_KEY_IDS} UUID`);
    keyIds = [...new Set(ds as string[])];
  }
  try {
    const boiCanh = await chotBoiCanhVault(req, user, md.proofHash);
    return jsonOffline(await moKhoaVault(boiCanh, md.keyring!, keyIds));
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
