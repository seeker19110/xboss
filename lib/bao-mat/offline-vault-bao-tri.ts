// Bảo trì vault offline (M131 §2): rewrap khoá sang KEK đang dùng + retire khoá của thiết bị đã
// thu hồi quá cửa sổ khôi phục. CHỈ chạy từ script `npm run vault:maint` bằng role riêng
// `xboss_vault_maint` (migration 0170) — không route HTTP nào gọi, không dùng pool runtime app.
//
// Bất biến:
// - Rewrap thay `wrapped_key`/`kek_version` TẠI CHỖ (cùng DEK, cùng AAD chỉ đổi kekVersion) → client
//   mở lại ra đúng DEK; không tạo khoá mới, không đổi cột bất biến (role không có quyền).
// - Không bao giờ log vật liệu khoá: log/báo cáo chỉ có keyId, kekVersion, loại lỗi, số đếm.
// - Retire chỉ ĐÁNH DẤU retired_at, không xoá; không dựa vào tuổi khoá.
import { Pool, type PoolClient } from "pg";
import { log } from "@/lib/nen/log";
import {
  aadBocKhoa,
  bocDek,
  danXuatKek,
  moDek,
  OfflineCryptoError,
  type KekKeyring,
} from "@/lib/nen/offline-crypto";

/** Số dòng mỗi lô rewrap. */
export const LO_REWRAP = 200;
/** Cửa sổ khôi phục mặc định (ngày). */
export const SO_NGAY_KHOI_PHUC_MAC_DINH = 30;
/** app.role đặt trong mọi transaction bảo trì — trigger audit ghi thành actor_role. */
const VAI_TRO_BAO_TRI = "vault_maint";

/** Pool riêng của role bảo trì (khuôn getMigrationPool). Thiếu biến → throw fail-fast. */
export function taoPoolBaoTri(env: Record<string, string | undefined> = process.env): Pool {
  const url = env.XBOSS_VAULT_MAINT_DATABASE_URL?.trim();
  if (!url)
    throw new Error(
      "Thiếu XBOSS_VAULT_MAINT_DATABASE_URL (role xboss_vault_maint) để chạy bảo trì vault offline.",
    );
  return new Pool({ connectionString: url, max: 2 });
}

/** XBOSS_VAULT_RECOVERY_DAYS: nguyên ≥1, mặc định 30; sai → throw. */
export function soNgayKhoiPhuc(env: Record<string, string | undefined> = process.env): number {
  const raw = env.XBOSS_VAULT_RECOVERY_DAYS?.trim();
  if (!raw) return SO_NGAY_KHOI_PHUC_MAC_DINH;
  if (!/^[1-9][0-9]{0,4}$/.test(raw))
    throw new Error("XBOSS_VAULT_RECOVERY_DAYS phải là số nguyên ≥ 1");
  return Number(raw);
}

async function trongGiaoDich<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.role', $1, true)`, [VAI_TRO_BAO_TRI]);
    const kq = await fn(c);
    await c.query("COMMIT");
    return kq;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

// ── Báo cáo theo kek_version ────────────────────────────────────────────────────────────────

export type DongTheoKek = { kekVersion: string; conDung: number; daRetire: number };

/** Số khoá theo kek_version (còn dùng / đã retire) — để biết lúc nào gỡ version cũ khỏi keyring. */
export async function baoCaoTheoKek(pool: Pool): Promise<DongTheoKek[]> {
  const { rows } = await pool.query<DongTheoKek>(
    `SELECT kek_version AS "kekVersion",
            COUNT(*) FILTER (WHERE retired_at IS NULL)::int AS "conDung",
            COUNT(*) FILTER (WHERE retired_at IS NOT NULL)::int AS "daRetire"
       FROM offline_vault_keys GROUP BY kek_version ORDER BY kek_version`,
  );
  return rows;
}

// ── Rewrap ─────────────────────────────────────────────────────────────────────────────────

export type KetQuaRewrap = {
  apply: boolean;
  kekActive: string;
  /** Số dòng cần rewrap (retired_at IS NULL, kek_version khác active) lúc bắt đầu. */
  canRewrap: number;
  daRewrap: number;
  boQuaThieuKek: number;
  boQuaGiaiBocLoi: number;
};

type DongRewrap = {
  id: string;
  deviceId: string;
  userId: number;
  orgId: number;
  projectId: number;
  keyVersion: number;
  manifestHash: string;
  wrappedKey: Buffer;
  kekVersion: string;
};

const COT_REWRAP = `id::text AS id, device_id::text AS "deviceId", user_id AS "userId",
  org_id AS "orgId", project_id AS "projectId", key_version AS "keyVersion",
  manifest_hash AS "manifestHash", wrapped_key AS "wrappedKey", kek_version AS "kekVersion"`;

const aadCua = (r: DongRewrap, kekVersion: string) =>
  aadBocKhoa({
    keyId: r.id,
    manifestHash: r.manifestHash,
    userId: r.userId,
    orgId: r.orgId,
    projectId: r.projectId,
    deviceId: r.deviceId,
    keyVersion: r.keyVersion,
    kekVersion,
  });

type KetQuaDong = "ok" | "thieu_kek" | "giai_boc_loi" | "khong_con";

/** Rewrap 1 dòng trong transaction riêng, dưới cùng advisory lock với capKhoaVault. */
async function rewrapMotDong(
  pool: Pool,
  id: string,
  deviceId: string,
  projectId: number,
  keyring: KekKeyring,
  kekCua: (v: string) => Promise<CryptoKey> | null,
): Promise<KetQuaDong> {
  return trongGiaoDich(pool, async (c) => {
    await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `offline-vault|${deviceId}|${projectId}`,
    ]);
    const { rows } = await c.query<DongRewrap>(
      `SELECT ${COT_REWRAP} FROM offline_vault_keys
        WHERE id = $1::uuid AND retired_at IS NULL AND kek_version <> $2
        FOR UPDATE`,
      [id, keyring.active],
    );
    const r = rows[0];
    if (!r) return "khong_con";
    const kekCu = kekCua(r.kekVersion);
    if (!kekCu) {
      log.warn("Bảo trì vault: thiếu version KEK cũ trong keyring — bỏ qua khoá", {
        keyId: r.id,
        kekVersion: r.kekVersion,
        loai: "kek_version_missing",
      });
      return "thieu_kek";
    }
    let dek: Uint8Array<ArrayBuffer>;
    try {
      dek = await moDek(new Uint8Array(r.wrappedKey), await kekCu, aadCua(r, r.kekVersion));
    } catch (e) {
      log.warn("Bảo trì vault: giải bọc khoá thất bại — bỏ qua khoá", {
        keyId: r.id,
        kekVersion: r.kekVersion,
        loai: e instanceof OfflineCryptoError ? `crypto_${e.code}` : "unwrap_error",
      });
      return "giai_boc_loi";
    }
    const kekMoi = await (kekCua(keyring.active) as Promise<CryptoKey>);
    const wrapped = await bocDek(dek, kekMoi, aadCua(r, keyring.active));
    await c.query(
      `UPDATE offline_vault_keys SET wrapped_key = $1, kek_version = $2 WHERE id = $3::uuid`,
      [Buffer.from(wrapped), keyring.active, r.id],
    );
    return "ok";
  });
}

/**
 * Bọc lại mọi khoá còn dùng sang KEK active. Dry-run (`apply=false`) chỉ đếm (dòng thiếu KEK cũ
 * đếm vào `boQuaThieuKek`; lỗi giải bọc chỉ biết khi chạy thật). Dòng lỗi bị bỏ qua, không throw.
 */
export async function rewrapKhoaVault(
  pool: Pool,
  keyring: KekKeyring,
  opts: { apply: boolean; loSize?: number },
): Promise<KetQuaRewrap> {
  const loSize = opts.loSize ?? LO_REWRAP;
  const kq: KetQuaRewrap = {
    apply: opts.apply,
    kekActive: keyring.active,
    canRewrap: 0,
    daRewrap: 0,
    boQuaThieuKek: 0,
    boQuaGiaiBocLoi: 0,
  };
  const dem = await pool.query<{ kekVersion: string; n: number }>(
    `SELECT kek_version AS "kekVersion", COUNT(*)::int AS n FROM offline_vault_keys
      WHERE retired_at IS NULL AND kek_version <> $1 GROUP BY kek_version`,
    [keyring.active],
  );
  for (const d of dem.rows) {
    kq.canRewrap += d.n;
    if (!opts.apply && !keyring.secrets.has(d.kekVersion)) kq.boQuaThieuKek += d.n;
  }
  if (!opts.apply) return kq;

  const kekCache = new Map<string, Promise<CryptoKey>>();
  const kekCua = (v: string): Promise<CryptoKey> | null => {
    const secret = keyring.secrets.get(v);
    if (!secret) return null;
    let k = kekCache.get(v);
    if (!k) {
      k = danXuatKek(secret, v);
      kekCache.set(v, k);
    }
    return k;
  };

  // Phân trang theo id tăng dần: dòng bị bỏ qua vẫn khớp điều kiện nhưng không bị đọc lại.
  let sauId = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const { rows } = await pool.query<{ id: string; deviceId: string; projectId: number }>(
      `SELECT id::text AS id, device_id::text AS "deviceId", project_id AS "projectId"
         FROM offline_vault_keys
        WHERE retired_at IS NULL AND kek_version <> $1 AND id > $2::uuid
        ORDER BY id LIMIT $3`,
      [keyring.active, sauId, loSize],
    );
    if (rows.length === 0) break;
    for (const r of rows) {
      const ketQua = await rewrapMotDong(pool, r.id, r.deviceId, r.projectId, keyring, kekCua);
      if (ketQua === "ok") kq.daRewrap++;
      else if (ketQua === "thieu_kek") kq.boQuaThieuKek++;
      else if (ketQua === "giai_boc_loi") kq.boQuaGiaiBocLoi++;
    }
    sauId = rows[rows.length - 1].id;
  }
  return kq;
}

// ── Retire + hết hạn yêu cầu khôi phục ─────────────────────────────────────────────────────

export type KetQuaRetire = {
  apply: boolean;
  soNgay: number;
  yeuCauHetHan: number;
  khoaRetire: number;
};

/** Yêu cầu khôi phục còn "mở" sau khi hết hạn các pending quá cửa sổ ($1 = số ngày). */
const YEU_CAU_MO = `EXISTS (SELECT 1 FROM offline_vault_recovery_requests r
   WHERE r.old_device_id = d.id
     AND (r.status = 'approved'
       OR (r.status = 'pending' AND r.requested_at >= now() - make_interval(days => $1))))`;

const KHOA_CAN_RETIRE = `FROM offline_vault_keys k
  JOIN offline_devices d ON d.id = k.device_id
 WHERE k.retired_at IS NULL
   AND d.revoked_at < now() - make_interval(days => $1)
   AND NOT ${YEU_CAU_MO}`;

/**
 * Đổi yêu cầu `pending` quá cửa sổ → `expired`, rồi đánh dấu retired_at cho khoá của thiết bị thu
 * hồi quá cửa sổ mà không còn yêu cầu khôi phục mở trỏ tới (old_device_id). Dry-run chỉ đếm.
 */
export async function retireKhoaVault(
  pool: Pool,
  opts: { apply: boolean; soNgay: number },
): Promise<KetQuaRetire> {
  const { apply, soNgay } = opts;
  if (!apply) {
    const het = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM offline_vault_recovery_requests
        WHERE status = 'pending' AND requested_at < now() - make_interval(days => $1)`,
      [soNgay],
    );
    const khoa = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n ${KHOA_CAN_RETIRE}`, [
      soNgay,
    ]);
    return { apply, soNgay, yeuCauHetHan: het.rows[0].n, khoaRetire: khoa.rows[0].n };
  }
  return trongGiaoDich(pool, async (c) => {
    const het = await c.query(
      `UPDATE offline_vault_recovery_requests SET status = 'expired'
        WHERE status = 'pending' AND requested_at < now() - make_interval(days => $1)`,
      [soNgay],
    );
    const khoa = await c.query(
      `UPDATE offline_vault_keys SET retired_at = now()
        WHERE id IN (SELECT k.id ${KHOA_CAN_RETIRE})`,
      [soNgay],
    );
    return { apply, soNgay, yeuCauHetHan: het.rowCount ?? 0, khoaRetire: khoa.rowCount ?? 0 };
  });
}
