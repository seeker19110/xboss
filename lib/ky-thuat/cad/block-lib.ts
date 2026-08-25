// M100 PR2 — Thư viện block chuẩn có version cho bộ lệnh vẽ XBOSS_VE_* (M100 §6.10/§7 FR2/§10).
/**
 * Cùng nguyên tắc với rule pack (ADR-0006 nguyên tắc 1): thư viện block là **dữ liệu phát hành**,
 * không phải mã nguồn — thêm/sửa block = phát hành version mới, plugin tự tải về, không build lại.
 *
 * Server **không đọc DWG** (M100 §12, kế thừa M99/ADR-0006): tệp `.dwg` chỉ được lưu nguyên vẹn +
 * băm sha256. Việc "manifest khai block nào thì block đó phải có thật" được kiểm qua **bản DXF
 * sidecar** người phát hành nộp kèm, bằng đúng parser tầng 3 đã dùng cho `plugin-upload.ts`.
 *
 * Kiểm định chia hai mức, đúng M100 §10:
 *   - `errors`   → chặn phát hành (422), không ghi dòng nào;
 *   - `warnings` → cho phát hành nhưng hiện cho người phát hành thấy (rủi ro "trôi tên" giữa
 *     manifest ↔ `takeoff.blockNameMatchAny` là rủi ro số 1 của M100 §18, nhưng chặn cứng sẽ khoá
 *     việc phát hành block chưa có item takeoff — item đó thuộc rule pack, phát hành đường khác).
 */
import { createHash } from "node:crypto";
import { query, queryOne, insertId } from "@/lib/db";
import { storagePut, storageGet } from "@/lib/nen/storage";
import { newBlockLibFileName } from "@/lib/nen/photos";
import { validateDxf, parseDxf, hasAnyToken } from "@/lib/ky-thuat/cad/dxf-parser";
import { getCurrentRulePack } from "@/lib/ky-thuat/cad/rule-pack";

/**
 * Thư viện block là tài nguyên **toàn cục** (M100 §18 đã chốt) nên không gắn org nào; khoá lưu trữ
 * vẫn cần một org để dựng prefix khi backend là S3 (`lib/nen/storage.ts`) → dùng cố định org gốc
 * cho cả ghi lẫn đọc, nếu không máy đọc thuộc org khác sẽ trỏ sai key. Đổi sang thư viện theo
 * dự án/tổ chức (M100 §20) thì thêm cột org_id và bỏ hằng số này.
 */
const ORG_THU_VIEN_BLOCK = 1;

/** Loại block trong thư viện (M100 §11 + §6.7–6.9 bổ sung `support`/`sleeve`). */
export const LOAI_BLOCK = ["fitting", "equipment", "titleblock", "support", "sleeve"] as const;
export type LoaiBlock = (typeof LOAI_BLOCK)[number];

export type BlockManifestEntry = {
  /** Id dùng trong rule pack `drawTools.systems[].fittings/equipment` và `sheetSetup.titleblockId`. */
  id: string;
  /** Tên block THẬT trong tệp `.dwg` — nguồn khớp duy nhất với `takeoff.blockNameMatchAny`. */
  blockName: string;
  kind: LoaiBlock;
  /** Hệ sở hữu block (khớp `layerMap.groups[].id`); khung tên không thuộc hệ nào. */
  system?: string;
  scaleBySize?: boolean;
  rotateToPath?: boolean;
  /** Thẻ thuộc tính bắt buộc khi chèn (TAG/MODEL/SIZE, khung tên: DU_AN/TI_LE/…). */
  attributes?: string[];
  /** Item takeoff mà block này được đếm vào (`measure: count`). */
  takeoffItemId?: string;
  /** Khổ giấy của khung tên (chỉ `kind: titleblock`). */
  paper?: string;
};

export type BlockLibManifest = {
  version: string;
  dwgSha256: string;
  blocks: BlockManifestEntry[];
};

export type KiemDinhBlockLib = {
  ok: boolean;
  /** Lỗi chặn — không phát hành. */
  errors: string[];
  /** Cảnh báo không chặn — lưu kèm để người phát hành thấy. */
  warnings: string[];
  /** Số liệu đo được từ DXF sidecar (đối chứng với manifest). */
  stats?: { blocksTrongDxf: number; blocksKhaiManifest: number };
};

export type PhatHanhKetQua =
  | { status: "invalid"; kiemDinh: KiemDinhBlockLib }
  | { status: "version-conflict"; message: string }
  | { status: "created" | "idempotent"; kiemDinh: KiemDinhBlockLib; id: number; version: string };

export type BlockLibRow = {
  id: number;
  version: string;
  manifest: BlockLibManifest;
  storageKey: string;
  dwgSha256: string;
  nguoiPhatHanh: string | null;
  createdAt: string | null;
};

const SHA256_HEX = /^[0-9a-f]{64}$/;

// ── Kiểm định (thuần, không chạm DB — test đơn vị được) ──────────────────────

/**
 * Ép dữ liệu manifest thô (JSON người phát hành nộp) về đúng hình dạng M100 §11.
 * Trả `null` kèm lỗi khi hình dạng sai — không "sửa hộ" dữ liệu.
 */
export function docManifest(tho: unknown): { manifest: BlockLibManifest | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof tho !== "object" || tho === null || Array.isArray(tho)) {
    return { manifest: null, errors: ["Manifest không phải một đối tượng JSON."] };
  }
  const o = tho as Record<string, unknown>;
  const version = typeof o.version === "string" ? o.version.trim() : "";
  const dwgSha256 = typeof o.dwgSha256 === "string" ? o.dwgSha256.trim().toLowerCase() : "";
  if (!version) errors.push('Manifest thiếu "version" (nhãn phiên bản thư viện, vd "b1").');
  if (!SHA256_HEX.test(dwgSha256)) {
    errors.push('Manifest thiếu "dwgSha256" hợp lệ (64 ký tự hex của tệp .dwg).');
  }
  if (!Array.isArray(o.blocks) || o.blocks.length === 0) {
    errors.push('Manifest thiếu "blocks" hoặc danh sách rỗng — thư viện không có block nào.');
    return { manifest: null, errors };
  }

  const blocks: BlockManifestEntry[] = [];
  const idDaGap = new Set<string>();
  const tenDaGap = new Set<string>();
  o.blocks.forEach((btho, i) => {
    const nhan = `blocks[${i}]`;
    if (typeof btho !== "object" || btho === null || Array.isArray(btho)) {
      errors.push(`${nhan} không phải một đối tượng JSON.`);
      return;
    }
    const b = btho as Record<string, unknown>;
    const id = typeof b.id === "string" ? b.id.trim() : "";
    const blockName = typeof b.blockName === "string" ? b.blockName.trim() : "";
    const kind = typeof b.kind === "string" ? b.kind.trim() : "";
    if (!id) errors.push(`${nhan} thiếu "id".`);
    else if (idDaGap.has(id)) errors.push(`${nhan}: id trùng "${id}".`);
    else idDaGap.add(id);
    if (!blockName) errors.push(`${nhan}${id ? ` ("${id}")` : ""} thiếu "blockName".`);
    // Tên block trong AutoCAD KHÔNG phân biệt hoa thường: hai mục khai cùng tên khác kiểu chữ sẽ
    // trỏ về đúng một định nghĩa trong DWG — lỗi im lặng (bản C# BlockManifestLoader kiểm y hệt).
    else if (tenDaGap.has(blockName.toUpperCase())) {
      errors.push(
        `${nhan}${id ? ` ("${id}")` : ""}: tên block "${blockName}" đã được một mục khác dùng (AutoCAD không phân biệt hoa thường).`,
      );
    } else tenDaGap.add(blockName.toUpperCase());
    if (!(LOAI_BLOCK as readonly string[]).includes(kind)) {
      errors.push(
        `${nhan}${id ? ` ("${id}")` : ""}: kind "${kind}" lạ — chỉ nhận ${LOAI_BLOCK.join(" | ")}.`,
      );
    }
    const attributes = Array.isArray(b.attributes)
      ? b.attributes.filter((a): a is string => typeof a === "string").map((a) => a.trim())
      : undefined;
    if (b.attributes !== undefined && !Array.isArray(b.attributes)) {
      errors.push(`${nhan}${id ? ` ("${id}")` : ""}: "attributes" phải là danh sách chuỗi.`);
    }
    blocks.push({
      id,
      blockName,
      kind: kind as LoaiBlock,
      system: typeof b.system === "string" ? b.system.trim() : undefined,
      scaleBySize: b.scaleBySize === true ? true : undefined,
      rotateToPath: b.rotateToPath === true ? true : undefined,
      attributes,
      takeoffItemId: typeof b.takeoffItemId === "string" ? b.takeoffItemId.trim() : undefined,
      paper: typeof b.paper === "string" ? b.paper.trim() : undefined,
    });
  });

  if (errors.length > 0) return { manifest: null, errors };
  return { manifest: { version, dwgSha256, blocks }, errors };
}

/** Yêu cầu thuộc tính tối thiểu theo loại block (M100 §11 + FR6/FR9a). */
function kiemThuocTinhTheoLoai(b: BlockManifestEntry, errors: string[]): void {
  if (b.kind === "equipment" && !(b.attributes ?? []).includes("TAG")) {
    errors.push(
      `Block "${b.id}" (thiết bị) phải khai thuộc tính "TAG" — XBOSS_VE_THIETBI bắt nhập tag lúc chèn (FR6).`,
    );
  }
  if (b.kind === "titleblock") {
    if (!b.paper) {
      errors.push(`Block "${b.id}" (khung tên) thiếu "paper" — mỗi khổ giấy một khung tên (FR9a).`);
    }
    if ((b.attributes ?? []).length === 0) {
      errors.push(
        `Block "${b.id}" (khung tên) chưa khai "attributes" — XBOSS_VE_TRANGIN cần thẻ để điền tên dự án/tỉ lệ/ngày.`,
      );
    }
  }
}

/**
 * Kiểm định một lượt phát hành thư viện block (M100 §10) — thuần, không chạm DB.
 *
 * @param manifestTho manifest JSON đã parse (chưa tin hình dạng)
 * @param dwg         nội dung tệp `.dwg` (chỉ băm, KHÔNG đọc nội dung)
 * @param dxfText     bản DXF sidecar của chính thư viện, để đối chiếu block khai ↔ block có thật
 */
export function kiemDinhManifest(
  manifestTho: unknown,
  dwg: Buffer,
  dxfText: string,
): KiemDinhBlockLib & { manifest: BlockLibManifest | null } {
  const { manifest, errors: loiHinhDang } = docManifest(manifestTho);
  const errors = [...loiHinhDang];
  const warnings: string[] = [];
  if (!manifest) return { ok: false, errors, warnings, manifest: null };

  // 1. Toàn vẹn tệp: hash khai trong manifest phải khớp tệp .dwg nộp kèm (M100 §7 FR2 — client
  //    cũng kiểm đúng hash này trước khi nhập block vào bản vẽ).
  const hashThat = createHash("sha256").update(dwg).digest("hex");
  if (hashThat !== manifest.dwgSha256) {
    errors.push(
      `dwgSha256 trong manifest (${manifest.dwgSha256.slice(0, 12)}…) không khớp tệp .dwg nộp kèm (${hashThat.slice(0, 12)}…).`,
    );
  }

  // 2. Tệp nộp lên đúng là DWG. Chỉ soi 4 byte chữ ký ("AC10.." — mọi đời DWG từ R14 tới 2026),
  //    KHÔNG parse nội dung (M100 §12: server không đọc DWG). Bắt đúng lỗi thật hay gặp: nộp
  //    nhầm bản DXF sidecar vào ô tệp .dwg.
  if (dwg.subarray(0, 4).toString("ascii") !== "AC10") {
    errors.push(
      "Tệp nộp ở ô .dwg không mang chữ ký DWG — lưu thư viện sang định dạng DWG rồi nộp lại (DXF nộp ở ô sidecar).",
    );
  }

  // 3. Thuộc tính bắt buộc theo loại block.
  for (const b of manifest.blocks) kiemThuocTinhTheoLoai(b, errors);

  // 4. DXF sidecar: cấu trúc hợp lệ rồi mới đối chiếu tên block.
  const cauTruc = validateDxf(dxfText);
  if (!cauTruc.valid) {
    errors.push(...cauTruc.errors.map((e) => `DXF sidecar lỗi cấu trúc: ${e}`));
    return { ok: false, errors, warnings, manifest };
  }

  let stats: KiemDinhBlockLib["stats"];
  try {
    const dxf = parseDxf(dxfText);
    // Tên block trong AutoCAD không phân biệt hoa thường → so ở dạng chữ hoa.
    const coTrongDxf = new Map(dxf.blocks.map((b) => [b.name.toUpperCase(), b]));
    stats = { blocksTrongDxf: dxf.blocks.length, blocksKhaiManifest: manifest.blocks.length };

    for (const b of manifest.blocks) {
      const trongDxf = coTrongDxf.get(b.blockName.toUpperCase());
      if (!trongDxf) {
        // M100 §6.10: manifest khai block không có thật → CHẶN ngay lúc phát hành, vì client
        // coi thư viện như vậy là hỏng và từ chối dùng toàn bộ.
        errors.push(
          `Block "${b.id}": manifest khai tên "${b.blockName}" nhưng DXF sidecar không có định nghĩa block đó.`,
        );
        continue;
      }
      // Thuộc tính khai trong manifest nên có ATTDEF tương ứng trong định nghĩa block. Chỉ CẢNH
      // BÁO: block động/annotative có thể sinh thẻ theo cách parser tầng 3 chưa mô hình hết —
      // chặn cứng sẽ khoá việc phát hành vì lý do không thuộc lỗi của người phát hành.
      const theTrongDxf = new Set(
        (trongDxf.entities ?? [])
          .filter((e) => e.type === "ATTDEF" && e.attributeTag)
          .map((e) => (e.attributeTag as string).toUpperCase()),
      );
      for (const thuocTinh of b.attributes ?? []) {
        if (!theTrongDxf.has(thuocTinh.toUpperCase())) {
          warnings.push(
            `Block "${b.id}" (${b.blockName}) khai thuộc tính "${thuocTinh}" nhưng DXF sidecar không thấy ATTDEF tương ứng.`,
          );
        }
      }
    }
  } catch (e) {
    errors.push(`Không parse được DXF sidecar: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, errors, warnings, manifest };
  }

  // 5. Đối chiếu chéo với rule pack đang phát hành (M100 §18 — rủi ro "trôi tên" số 1).
  warnings.push(...doiChieuTakeoff(manifest));

  return { ok: errors.length === 0, errors, warnings, stats, manifest };
}

/**
 * Đối chiếu tên block trong manifest với `takeoff.blockNameMatchAny` của rule pack hiện hành —
 * chỉ trả CẢNH BÁO (M100 §10). Dùng đúng bộ khớp token-boundary của `dxf-parser` (một matcher duy
 * nhất cho cả layerMap lẫn takeoff, khớp bản C# `TokenMatcher`).
 */
export function doiChieuTakeoff(manifest: BlockLibManifest): string[] {
  const canhBao: string[] = [];
  const items = getCurrentRulePack().takeoff.items as ReadonlyArray<{
    id: string;
    measure: string;
    blockNameMatchAny?: readonly string[];
  }>;

  for (const b of manifest.blocks) {
    if (b.kind !== "equipment") continue;
    if (!b.takeoffItemId) {
      canhBao.push(
        `Block thiết bị "${b.id}" chưa khai "takeoffItemId" — XBOSS_BOCKL sẽ không đếm được block này.`,
      );
      continue;
    }
    const item = items.find((it) => it.id === b.takeoffItemId);
    if (!item) {
      canhBao.push(
        `Block "${b.id}" trỏ tới item takeoff "${b.takeoffItemId}" không có trong rule pack đang phát hành.`,
      );
      continue;
    }
    if (item.measure !== "count") {
      canhBao.push(
        `Block "${b.id}" trỏ tới item takeoff "${item.id}" có measure="${item.measure}" (phải là "count" mới đếm được block).`,
      );
      continue;
    }
    const tokens = (item.blockNameMatchAny ?? []).map((t) => t.toUpperCase());
    if (tokens.length === 0 || !hasAnyToken(b.blockName.toUpperCase(), tokens)) {
      canhBao.push(
        `Tên block "${b.blockName}" không khớp blockNameMatchAny [${(item.blockNameMatchAny ?? []).join(", ")}] ` +
          `của item "${item.id}" — XBOSS_BOCKL sẽ bóc sót.`,
      );
    }
  }
  return canhBao;
}

// ── Phát hành + đọc (chạm DB) ────────────────────────────────────────────────

type DongDb = {
  id: number;
  version: string;
  manifest: BlockLibManifest;
  storage_key: string;
  dwg_sha256: string;
  nguoi: string | null;
  created_at: string | null;
};

function veRow(r: DongDb): BlockLibRow {
  return {
    id: r.id,
    version: r.version,
    manifest: r.manifest,
    storageKey: r.storage_key,
    dwgSha256: r.dwg_sha256,
    nguoiPhatHanh: r.nguoi,
    createdAt: r.created_at,
  };
}

const CHON = `SELECT b.id, b.version, b.manifest, b.storage_key, b.dwg_sha256,
                     u.name AS nguoi, b.created_at
                FROM cad_block_libs b
                LEFT JOIN users u ON u.id = b.published_by`;

/** Version hiện hành = bản phát hành mới nhất (append-only nên id lớn nhất là mới nhất). */
export async function layBlockLibHienHanh(): Promise<BlockLibRow | null> {
  const r = await queryOne<DongDb>(`${CHON} ORDER BY b.id DESC LIMIT 1`);
  return r ? veRow(r) : null;
}

/** Lịch sử phát hành (mới → cũ) cho bảng điều khiển web. */
export async function layLichSuBlockLib(limit = 20): Promise<BlockLibRow[]> {
  const rows = await query<DongDb>(`${CHON} ORDER BY b.id DESC LIMIT ?`, limit);
  return rows.map(veRow);
}

/** Nội dung tệp `.dwg` của một bản phát hành — `null` khi tệp đã mất trên kho lưu trữ. */
export async function docTepBlockLib(row: BlockLibRow): Promise<Buffer | null> {
  return storageGet(ORG_THU_VIEN_BLOCK, row.storageKey);
}

/** ETag mạnh theo version + hash tệp — plugin cache cục bộ và hỏi lại bằng `If-None-Match`. */
export function etagBlockLib(row: BlockLibRow): string {
  return `"${row.version}-${row.dwgSha256.slice(0, 32)}"`;
}

/**
 * Phát hành một version thư viện block. Kiểm định trước, đạt mới ghi (M100 §10).
 *
 * Idempotent theo (version, hash tệp): phát hành lại đúng tệp cũ trả về đúng dòng cũ; cùng version
 * nhưng nội dung khác → xung đột, bắt tăng version (append-only, M100 §17 — không sửa version đã
 * phát hành vì máy kỹ sư đã cache theo ETag).
 */
export async function phatHanhBlockLib(input: {
  userId: number;
  manifestTho: unknown;
  dwg: Buffer;
  dxfText: string;
}): Promise<PhatHanhKetQua> {
  const { manifest, ...kiemDinh } = kiemDinhManifest(input.manifestTho, input.dwg, input.dxfText);
  if (!kiemDinh.ok || !manifest) return { status: "invalid", kiemDinh };

  const hash = createHash("sha256").update(input.dwg).digest("hex");
  const daCo = await queryOne<{ id: number; dwg_sha256: string }>(
    `SELECT id, dwg_sha256 FROM cad_block_libs WHERE version = ?`,
    manifest.version,
  );
  if (daCo) {
    if (daCo.dwg_sha256 === hash) {
      return { status: "idempotent", kiemDinh, id: daCo.id, version: manifest.version };
    }
    return {
      status: "version-conflict",
      message:
        `Version "${manifest.version}" đã phát hành với nội dung khác — thư viện là append-only, ` +
        `tăng version (vd "${manifest.version}" → kế tiếp) rồi phát hành lại.`,
    };
  }

  const storageKey = newBlockLibFileName(manifest.version);
  await storagePut(ORG_THU_VIEN_BLOCK, storageKey, input.dwg);
  // DXF sidecar đặt cạnh tệp .dwg cùng quy ước tên như plugin-upload — kiểm định lại được về sau
  // mà không cần AutoCAD.
  await storagePut(
    ORG_THU_VIEN_BLOCK,
    `${storageKey}.sidecar.dxf`,
    Buffer.from(input.dxfText, "utf8"),
  );

  const id = await insertId(
    `INSERT INTO cad_block_libs (version, manifest, storage_key, dwg_sha256, published_by)
     VALUES (?, ?::jsonb, ?, ?, ?)`,
    manifest.version,
    // Manifest lưu NGUYÊN dạng đã chuẩn hoá (không nhét kết quả kiểm định vào) — cột này chính là
    // thứ plugin tải về qua `?manifest=1`, phải đúng hợp đồng M100 §11.
    JSON.stringify(manifest),
    storageKey,
    hash,
    input.userId,
  );
  return { status: "created", kiemDinh, id, version: manifest.version };
}
