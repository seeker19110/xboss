import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/bao-mat/auth";
import { capKhoaVault } from "@/lib/bao-mat/offline-vault";
import {
  chotBoiCanhVault,
  jsonOffline,
  loiOffline,
  moDauOffline,
  phanHoiLoiOffline,
} from "@/lib/bao-mat/offline-http";

export const dynamic = "force-dynamic";

// POST /api/offline/vault/keys  header X-XBoss-Context  body: { manifest: { tasks?, taskActions?, diary? } }
// Cấp DEK cho resource manifest trước khi đi offline (DATA-CONTRACTS §4, DATA-MIGRATIONS §2):
// server kiểm TOÀN BỘ tài nguyên với quyền hiện hành (thiếu quyền → 403, không nêu tài nguyên
// nào), lưu DEK đã bọc bằng KEK riêng, trả DEK thô duy nhất cho chính chủ (no-store). Cùng
// manifest đã có khoá → trả khoá cũ (200), không nhân bản.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return loiOffline(401, "unauthenticated", "Chưa đăng nhập");
  const md = await moDauOffline(req, user, {
    kiemOrigin: true,
    canVault: true,
    gioiHan: { ten: "vault-key", max: 60 },
  });
  if (!md.ok) return md.res;
  try {
    const boiCanh = await chotBoiCanhVault(req, user, md.proofHash);
    const body = (await req.json().catch(() => null)) as { manifest?: unknown } | null;
    const { khoa, moi } = await capKhoaVault(boiCanh, md.keyring!, body?.manifest);
    return jsonOffline({ key: khoa, created: moi }, moi ? 201 : 200);
  } catch (e) {
    return phanHoiLoiOffline(e);
  }
}
