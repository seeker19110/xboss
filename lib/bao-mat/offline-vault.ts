// Dịch vụ khoá vault offline (QUALITY-FINAL-1 S05 — DATA-CONTRACTS §4, DATA-MIGRATIONS §2/§4/§5).
//
// Bất biến:
// - Server chỉ lưu DEK đã BỌC (AES-256-GCM, KEK có version dẫn xuất từ XBOSS_OFFLINE_KEK, AAD gắn
//   key/manifest/owner/org/project/device/version). Khoá thô chỉ xuất hiện trong phản hồi no-store
//   cho đúng chủ, không ghi log, không lưu DB.
// - Mỗi khoá gắn MỘT manifest bất biến. Cấp lẫn mở khoá đều kiểm TOÀN BỘ tài nguyên trong manifest
//   với quyền + phân công HIỆN HÀNH: một task bị thu hồi → không trả khoá của manifest đó (các
//   manifest độc lập vẫn mở được). Không sửa manifest tại chỗ — thêm tài nguyên = khoá mới.
// - Xoay KEK: khoá mới bọc bằng version đang dùng; khoá cũ vẫn mở bằng version cũ còn trong keyring
//   (xoay KEK/đổi mật khẩu/thu hồi phiên KHÔNG làm mất bản nháp). Version cũ bị gỡ khỏi keyring →
//   khoá đó "locked" (giữ nguyên ciphertext + wrapped_key, gắn lại version là mở được).
import { randomUUID } from "node:crypto";
import { query, queryOne, withTransaction } from "@/lib/db";
import { CAN, type User } from "@/lib/bao-mat/auth";
import { log } from "@/lib/nen/log";
import { DIARY_EDIT_ROLES } from "@/lib/nen/roles";
import { damBaoNguCanhActor, LoiOffline, type ThietBiOffline } from "@/lib/bao-mat/offline-devices";
import { vanTayQuyen } from "@/lib/bao-mat/offline-context";
import {
  aadBocKhoa,
  base64urlEncode,
  bocDek,
  danXuatKek,
  moDek,
  OfflineCryptoError,
  taoDek,
  type KekKeyring,
} from "@/lib/nen/offline-crypto";
import {
  bamManifest,
  chuanHoaManifest,
  chuoiManifest,
  docManifestDaLuu,
  type OfflineManifest,
} from "@/lib/nen/offline-manifest";

/** Vai trò lập/sửa nhật ký — cùng nguồn với PUT /api/diaries/:date (lib/nen/roles.ts). */
const VAI_TRO_NHAT_KY = new Set<string>(DIARY_EDIT_ROLES);
/** Trần số khoá trả trong 1 lần mở. */
const MAX_KHOA_MOI_LAN = 500;

export type KhoaVaultMo = {
  keyId: string;
  keyVersion: number;
  manifestHash: string;
  manifest: OfflineManifest;
  /** DEK thô base64url — client nhập thành CryptoKey không xuất được, chỉ giữ trong bộ nhớ. */
  dek: string;
  retired: boolean;
  createdAt: string;
};

type DongKhoa = {
  id: string;
  keyVersion: number;
  manifest: unknown;
  manifestHash: string;
  wrappedKey: Buffer;
  kekVersion: string;
  createdAt: Date;
  retiredAt: Date | null;
};

const COT_KHOA = `id, key_version AS "keyVersion", resource_manifest AS manifest,
  manifest_hash AS "manifestHash", wrapped_key AS "wrappedKey", kek_version AS "kekVersion",
  created_at AS "createdAt", retired_at AS "retiredAt"`;

/** Kiểm quyền hiện hành cho một hoặc nhiều manifest (cùng dự án) bằng MỘT truy vấn task. */
type KiemManifest = (m: OfflineManifest) => boolean;

/**
 * Manifest còn được phép TOÀN BỘ với quyền hiện hành? Task: CAN.editProgress + mọi task thuộc
 * đúng dự án/org (+ subcon: mọi task được giao cho chính mình). Nhật ký: vai trò lập nhật ký.
 * Nạp gộp mọi task của các manifest trong 1 truy vấn (mở nhiều khoá không N+1).
 */
async function boKiemManifest(user: User, manifests: OfflineManifest[]): Promise<KiemManifest> {
  const ids = [...new Set(manifests.flatMap((m) => m.tasks))];
  const giao = new Map<number, number | null>();
  const coQuyenTask = CAN.editProgress(user.role);
  if (ids.length > 0 && coQuyenTask) {
    const theoDuAn = new Map<number, number[]>();
    for (const m of manifests) {
      const ds = theoDuAn.get(m.projectId) ?? [];
      theoDuAn.set(m.projectId, ds.concat(m.tasks));
    }
    for (const [projectId, ds] of theoDuAn) {
      const rows = await query<{ id: number; assignedTo: number | null }>(
        `SELECT t.id, t.assigned_to AS "assignedTo"
           FROM tasks t
           JOIN work_packages wp ON wp.id = t.package_id
           JOIN sheet_types st ON st.id = wp.sheet_type_id
           JOIN towers tw ON tw.id = st.tower_id
           JOIN projects p ON p.id = tw.project_id
          WHERE t.id = ANY(?::int[]) AND tw.project_id = ? AND p.org_id = ?`,
        [...new Set(ds)],
        projectId,
        user.orgId,
      );
      for (const r of rows) giao.set(r.id, r.assignedTo);
    }
  }
  return (m) => {
    if (m.taskActions.length > 0) {
      if (!coQuyenTask) return false;
      for (const id of m.tasks) {
        if (!giao.has(id)) return false;
        if (user.role === "subcon" && giao.get(id) !== user.id) return false;
      }
    }
    if (m.diary && !VAI_TRO_NHAT_KY.has(user.role)) return false;
    return true;
  };
}

export async function manifestConHieuLuc(user: User, m: OfflineManifest): Promise<boolean> {
  return (await boKiemManifest(user, [m]))(m);
}

function kekCua(keyring: KekKeyring, version: string): Promise<CryptoKey> | null {
  const secret = keyring.secrets.get(version);
  return secret ? danXuatKek(secret, version) : null;
}

type BoiCanh = { user: User; thietBi: ThietBiOffline; projectId: number };

const aadCua = (b: BoiCanh, keyId: string, hash: string, keyVersion: number, kekVersion: string) =>
  aadBocKhoa({
    keyId,
    manifestHash: hash,
    userId: b.user.id,
    orgId: b.user.orgId,
    projectId: b.projectId,
    deviceId: b.thietBi.id,
    keyVersion,
    kekVersion,
  });

/** Manifest đã lưu của 1 dòng khoá: dạng chuẩn + hash khớp, sai → null (khoá bị sửa trong DB). */
async function manifestCuaDong(b: BoiCanh, row: DongKhoa): Promise<OfflineManifest | null> {
  const m = docManifestDaLuu(row.manifest, b.projectId);
  return m && (await bamManifest(m)) === row.manifestHash ? m : null;
}

/**
 * Mở 1 dòng khoá: manifest (đã đọc bởi `manifestCuaDong`) + quyền hiện hành + KEK có trong keyring
 * + AAD. Thiếu version KEK / giải bọc lỗi → log.warn (chỉ keyId, kekVersion, loại lỗi — không khoá)
 * để vận hành thấy; client chỉ thấy `locked`.
 */
async function moMotKhoa(
  b: BoiCanh,
  keyring: KekKeyring,
  row: DongKhoa,
  m: OfflineManifest | null,
  duocPhep: KiemManifest,
): Promise<KhoaVaultMo | null> {
  if (!m) return null;
  if (!duocPhep(m)) return null;
  const kek = kekCua(keyring, row.kekVersion);
  if (!kek) {
    log.warn("Vault offline: thiếu version KEK trong keyring — khoá bị locked", {
      keyId: row.id,
      kekVersion: row.kekVersion,
      loai: "kek_version_missing",
    });
    return null;
  }
  try {
    const dek = await moDek(
      new Uint8Array(row.wrappedKey),
      await kek,
      aadCua(b, row.id, row.manifestHash, row.keyVersion, row.kekVersion),
    );
    return {
      keyId: row.id,
      keyVersion: row.keyVersion,
      manifestHash: row.manifestHash,
      manifest: m,
      dek: base64urlEncode(dek),
      retired: row.retiredAt != null,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  } catch (e) {
    // AAD/ciphertext/KEK sai — không fallback, khoá bị coi là không mở được.
    log.warn("Vault offline: giải bọc khoá thất bại — khoá bị locked", {
      keyId: row.id,
      kekVersion: row.kekVersion,
      loai: e instanceof OfflineCryptoError ? `crypto_${e.code}` : "unwrap_error",
    });
    return null;
  }
}

/**
 * Cấp khoá cho manifest client đề xuất (dự án = dự án đã chốt bởi server). Cùng manifest đã có
 * khoá còn dùng trên thiết bị/dự án này → trả lại khoá đó (idempotent, không nhân bản).
 */
export async function capKhoaVault(
  b: BoiCanh,
  keyring: KekKeyring,
  manifestInput: unknown,
): Promise<{ khoa: KhoaVaultMo; moi: boolean }> {
  damBaoNguCanhActor(b.user, b.projectId);
  const kq = chuanHoaManifest(manifestInput, b.projectId);
  if (!kq.ok) throw new LoiOffline(422, "manifest_invalid", kq.error);
  const m = kq.manifest;
  if (!(await manifestConHieuLuc(b.user, m)))
    throw new LoiOffline(
      403,
      "manifest_forbidden",
      "Không có quyền thao tác offline trên tài nguyên đã chọn",
    );
  const hash = await bamManifest(m);
  const vanTay = vanTayQuyen(b.user, b.projectId);

  return withTransaction(async () => {
    // Tuần tự hoá cấp khoá theo (thiết bị, dự án): dedupe manifest + cấp key_version kế tiếp
    // không đua nhau (xboss_app không có quyền FOR UPDATE trên offline_devices).
    await queryOne(
      `SELECT pg_advisory_xact_lock(hashtextextended(?, 0))`,
      `offline-vault|${b.thietBi.id}|${b.projectId}`,
    );
    const daCo = await queryOne<DongKhoa>(
      `SELECT ${COT_KHOA} FROM offline_vault_keys
        WHERE device_id = ?::uuid AND user_id = ? AND org_id = ? AND project_id = ?
          AND manifest_hash = ? AND retired_at IS NULL
        ORDER BY key_version DESC LIMIT 1`,
      b.thietBi.id,
      b.user.id,
      b.user.orgId,
      b.projectId,
      hash,
    );
    if (daCo) {
      const mo = await moMotKhoa(b, keyring, daCo, await manifestCuaDong(b, daCo), () => true);
      if (mo) return { khoa: mo, moi: false };
      // Khoá cũ không mở được (vd KEK cũ đã gỡ) → cấp khoá mới, giữ nguyên khoá cũ.
    }
    const ke = await queryOne<{ v: number }>(
      `SELECT COALESCE(MAX(key_version), 0) + 1 AS v FROM offline_vault_keys
        WHERE device_id = ?::uuid AND user_id = ? AND org_id = ? AND project_id = ?`,
      b.thietBi.id,
      b.user.id,
      b.user.orgId,
      b.projectId,
    );
    const keyVersion = Number(ke?.v ?? 1);
    const keyId = randomUUID();
    const kekVersion = keyring.active;
    const dek = taoDek();
    const kek = await (kekCua(keyring, kekVersion) as Promise<CryptoKey>);
    const wrapped = await bocDek(dek, kek, aadCua(b, keyId, hash, keyVersion, kekVersion));
    const row = await queryOne<DongKhoa>(
      `INSERT INTO offline_vault_keys
         (id, device_id, user_id, org_id, project_id, key_version, resource_manifest,
          manifest_hash, permission_fingerprint, wrapped_key, kek_version)
       VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)
       RETURNING ${COT_KHOA}`,
      keyId,
      b.thietBi.id,
      b.user.id,
      b.user.orgId,
      b.projectId,
      keyVersion,
      chuoiManifest(m),
      hash,
      vanTay,
      Buffer.from(wrapped),
      kekVersion,
    );
    if (!row) throw new Error("Không ghi được khoá vault");
    return {
      khoa: {
        keyId,
        keyVersion,
        manifestHash: hash,
        manifest: m,
        dek: base64urlEncode(dek),
        retired: false,
        createdAt: new Date(row.createdAt).toISOString(),
      },
      moi: true,
    };
  });
}

/**
 * Mở khoá vault của chính actor trên thiết bị + dự án này. `keyIds` null → các khoá MỚI NHẤT
 * (key_version giảm dần) tối đa MAX_KHOA_MOI_LAN, `truncated: true` khi còn khoá cũ hơn chưa trả.
 * Khoá không mở được (manifest có tài nguyên bị thu hồi, KEK đã gỡ, dữ liệu bị sửa, không tồn
 * tại/không phải của mình) đều chỉ báo `locked` theo keyId — không nêu lý do để không lộ tài
 * nguyên bị cấm.
 */
export async function moKhoaVault(
  b: BoiCanh,
  keyring: KekKeyring,
  keyIds: string[] | null,
): Promise<{ keys: KhoaVaultMo[]; locked: { keyId: string }[]; truncated: boolean }> {
  damBaoNguCanhActor(b.user, b.projectId);
  const rows = await withTransaction(
    () =>
      query<DongKhoa>(
        `SELECT ${COT_KHOA} FROM offline_vault_keys
          WHERE device_id = ?::uuid AND user_id = ? AND org_id = ? AND project_id = ?
            AND (?::uuid[] IS NULL OR id = ANY(?::uuid[]))
          ORDER BY key_version DESC
          LIMIT ${MAX_KHOA_MOI_LAN + 1}`,
        b.thietBi.id,
        b.user.id,
        b.user.orgId,
        b.projectId,
        keyIds,
        keyIds,
      ),
    { readOnly: true },
  );
  const truncated = rows.length > MAX_KHOA_MOI_LAN;
  const trang = truncated ? rows.slice(0, MAX_KHOA_MOI_LAN) : rows;
  const manifests = await Promise.all(trang.map((r) => manifestCuaDong(b, r)));
  const duocPhep = await boKiemManifest(
    b.user,
    manifests.filter((m): m is OfflineManifest => m != null),
  );
  const keys: KhoaVaultMo[] = [];
  const locked: { keyId: string }[] = [];
  for (const [i, row] of trang.entries()) {
    const mo = await moMotKhoa(b, keyring, row, manifests[i], duocPhep);
    if (mo) keys.push(mo);
    else locked.push({ keyId: row.id });
  }
  const thay = new Set(trang.map((r) => r.id));
  for (const id of keyIds ?? []) if (!thay.has(id)) locked.push({ keyId: id });
  return { keys, locked, truncated };
}
