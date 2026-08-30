// lib/ky-thuat/cad/block.ts — Thư viện block chuẩn: phát hành, nạp lô, đề xuất, phân loại, xem trước
/**
 * Một họ chức năng, một tệp (gộp `block-lib` + `block-phan-loai-luat` + `block-preview-svg` +
 * `block-lo` + `block-proposals` + `block-them-web`):
 *
 *   • Thư viện & manifest — đọc/kiểm/phát hành version thư viện block (M103/M104/M113).
 *   • Phân loại theo luật — tầng 1 tất định, không mạng (M108); tầng AI nằm ở `lib/dich-vu/cad.ts`.
 *   • Ảnh xem trước SVG — dựng từ hình học DXF của định nghĩa block.
 *   • Lô nạp — hàng chờ ứng viên từ plugin/web rồi duyệt thành version mới.
 *   • Đề xuất — đường nộp gói .dwg + manifest từ ngoài vào, có kiểm định 2 bước.
 *   • Thêm block lẻ từ web — nộp một block, phát hành ngay.
 *
 * Thứ tự trong tệp là thứ tự phụ thuộc: nền (thư viện/manifest) → luật phân loại → xem trước →
 * các đường nạp. Đừng chèn khối mới lên trước phần nền.
 */

import { createHash } from "node:crypto";
import { query, queryOne, insertId, withProjectScope, run, withTransaction } from "@/lib/db";
import { storagePut, storageGet, storageDelete } from "@/lib/nen/storage";
import { newBlockLibFileName } from "@/lib/nen/photos";
import {
  validateDxf,
  parseDxf,
  hasAnyToken,
  type DxfEntityRaw,
} from "@/lib/ky-thuat/cad/dxf-parser";
import { getCurrentRulePack, type CadRulePack } from "@/lib/ky-thuat/cad/rule-pack";

// ===== block-lib.ts =====
// M100 PR2 — Thư viện block chuẩn có version cho bộ lệnh vẽ XBOSS_VE_* (M100 §6.10/§7 FR2/§10).
/**
 * Cùng nguyên tắc với rule pack (ADR-0006 nguyên tắc 1): thư viện block là **dữ liệu phát hành**,
 * không phải mã nguồn — thêm/sửa block = phát hành version mới, plugin tự tải về, không build lại.
 *
 * Server **không đọc DWG** (M100 §12, kế thừa M99/ADR-0006): tệp `.dwg` chỉ được lưu nguyên vẹn +
 * băm sha256. Việc "manifest khai block nào thì block đó phải có thật" được kiểm qua **bản DXF
 * sidecar** người phát hành nộp kèm, bằng đúng parser tầng 3 đã dùng cho `lib/ky-thuat/cad/dashboard.ts`.
 *
 * Kiểm định chia hai mức, đúng M100 §10:
 *   - `errors`   → chặn phát hành (422), không ghi dòng nào;
 *   - `warnings` → cho phát hành nhưng hiện cho người phát hành thấy (rủi ro "trôi tên" giữa
 *     manifest ↔ `takeoff.blockNameMatchAny` là rủi ro số 1 của M100 §18, nhưng chặn cứng sẽ khoá
 *     việc phát hành block chưa có item takeoff — item đó thuộc rule pack, phát hành đường khác).
 */

/**
 * Thư viện block là tài nguyên **toàn cục** (M100 §18 đã chốt) nên không gắn org nào; khoá lưu trữ
 * vẫn cần một org để dựng prefix khi backend là S3 (`lib/nen/storage.ts`) → dùng cố định org gốc
 * cho cả ghi lẫn đọc, nếu không máy đọc thuộc org khác sẽ trỏ sai key. Đổi sang thư viện theo
 * dự án/tổ chức (M100 §20) thì thêm cột org_id và bỏ hằng số này.
 */
export const ORG_THU_VIEN_BLOCK = 1;

/**
 * Loại block trong thư viện (M100 §11 + §6.7–6.9 bổ sung `support`/`sleeve`; M110 §5 bổ sung
 * `annotation`).
 *
 * `annotation` = ký hiệu CHÚ THÍCH thuần (tam giác số revision của `XBOSS_VE_REV`…): không thuộc
 * hệ nào, **không bao giờ đi vào khối lượng** — nó cố ý vắng mặt trong `KIND_DEM_KHOI_LUONG`
 * (`lib/ky-thuat/cad/block.ts`) và trong `doiChieuTakeoff` phía dưới (chỉ soi
 * `equipment`), đúng guardrail 1 của M110: khoanh revision không được đổi con số `XBOSS_BOCKL`.
 */
export const LOAI_BLOCK = [
  "fitting",
  "equipment",
  "titleblock",
  "support",
  "sleeve",
  "annotation",
] as const;
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
  /**
   * M104 §1 — khoá tệp `.dwg` RIÊNG của block trong kho lưu trữ (block thêm thẳng từ web:
   * máy chủ không chạy AutoCAD nên không gộp được vào `blocks.dwg` nền). Vắng trường này =
   * block nằm trong `blocks.dwg` như cũ (mọi manifest đã phát hành trước M104 không đổi).
   * Plugin tải tệp lẻ qua `GET /api/engineering/cad/block-lib?file=<fileKey>`.
   */
  fileKey?: string;
  /** Hash sha256 của tệp lẻ ở `fileKey` — plugin kiểm y như kiểm tệp nền. Đi cặp với `fileKey`. */
  fileSha256?: string;
  /** Ảnh xem trước (SVG thuần, dựng từ DXF lúc thêm) để web hiển thị — không ảnh hưởng plugin. */
  previewSvg?: string;
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

/**
 * Dạng hợp lệ của `fileKey` (M104 §1) — đúng khuôn tên do `newBlockLibFileName` sinh
 * (`blocklib-<nhãn>-<ts>-<hex>.dwg`). Ràng khuôn chặt vì `GET ?file=` sẽ đọc đúng khoá này khỏi
 * kho lưu trữ: manifest là dữ liệu người phát hành nộp, không được để nó trỏ tới tệp bất kỳ
 * trong `data/uploads/` (lớp chống path traversal của `lib/nen/storage.ts` chặn `/` `..` nhưng
 * không chặn "đọc nhầm tệp phẳng khác").
 */
const KHOA_TEP_BLOCK = /^blocklib-[A-Za-z0-9._-]{1,160}\.dwg$/;

/** Trần độ dài chuỗi SVG xem trước lưu trong manifest (JSONB) — ảnh nhận diện, không phải bản vẽ. */
const TRAN_PREVIEW_SVG = 200_000;

/** `fileKey` có đúng khuôn tên tệp do máy chủ sinh không (dùng cho cả route `GET ?file=`). */
export function laKhoaTepBlockHopLe(fileKey: string): boolean {
  return KHOA_TEP_BLOCK.test(fileKey);
}

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
    if (b.attributes !== undefined && !Array.isArray(b.attributes)) {
      errors.push(`${nhan}${id ? ` ("${id}")` : ""}: "attributes" phải là danh sách chuỗi.`);
      // Bỏ qua block này ở các bước kiểm sau (kiemThuocTinhTheoLoai) — nếu vẫn đẩy vào `blocks`
      // với attributes rỗng, bước 3 sẽ tưởng block không khai thuộc tính và sinh thêm lỗi "thiếu
      // TAG"/"thiếu attributes" chồng lên đúng 1 lỗi gốc về kiểu dữ liệu ở trên.
      return;
    }
    const attributes = Array.isArray(b.attributes)
      ? b.attributes.filter((a): a is string => typeof a === "string").map((a) => a.trim())
      : undefined;

    // M104 §1 — bộ ba tuỳ chọn của block nằm ở tệp .dwg RIÊNG. Vắng cả ba = block trong tệp nền
    // (tương thích ngược: manifest phát hành trước M104 không có trường nào trong nhóm này).
    const fileKey = typeof b.fileKey === "string" ? b.fileKey.trim() : "";
    const fileSha256 = typeof b.fileSha256 === "string" ? b.fileSha256.trim().toLowerCase() : "";
    const previewSvg = typeof b.previewSvg === "string" ? b.previewSvg.trim() : "";
    const nhanB = `${nhan}${id ? ` ("${id}")` : ""}`;
    if (fileKey && !KHOA_TEP_BLOCK.test(fileKey)) {
      errors.push(
        `${nhanB}: "fileKey" không đúng khuôn tên tệp do máy chủ sinh (blocklib-….dwg) — không nhận khoá tự đặt.`,
      );
    }
    if (fileKey && !SHA256_HEX.test(fileSha256)) {
      errors.push(`${nhanB}: có "fileKey" thì phải kèm "fileSha256" (64 ký tự hex của tệp lẻ).`);
    }
    if (!fileKey && fileSha256) {
      errors.push(
        `${nhanB}: khai "fileSha256" nhưng thiếu "fileKey" — hash không trỏ tới tệp nào.`,
      );
    }
    if (previewSvg && (!previewSvg.startsWith("<svg") || previewSvg.length > TRAN_PREVIEW_SVG)) {
      errors.push(
        `${nhanB}: "previewSvg" phải là chuỗi SVG (bắt đầu bằng <svg) và ngắn hơn ${TRAN_PREVIEW_SVG} ký tự.`,
      );
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
      fileKey: fileKey || undefined,
      fileSha256: fileSha256 || undefined,
      previewSvg: previewSvg || undefined,
    });
  });

  if (errors.length > 0) return { manifest: null, errors };
  return { manifest: { version, dwgSha256, blocks }, errors };
}

/**
 * Yêu cầu thuộc tính tối thiểu theo loại block (M100 §11 + FR6/FR9a). Export để đường thêm block
 * từ web (M104) áp đúng một luật này cho entry mới thay vì chép lại.
 */
export function kiemThuocTinhTheoLoai(b: BlockManifestEntry, errors: string[]): void {
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
        // M104 §1: block có `fileKey` nằm ở tệp .dwg RIÊNG, không nằm trong tệp nền — sidecar này
        // mô tả tệp nền nên không thể (và không cần) chứa nó. Tính toàn vẹn của tệp lẻ được canh
        // bằng `fileSha256`, và định nghĩa block được kiểm ngay lúc thêm (khối `block-them-web` phía dưới).
        if (b.fileKey) continue;
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

type DongBlockLibDb = {
  id: number;
  version: string;
  manifest: BlockLibManifest;
  storage_key: string;
  dwg_sha256: string;
  nguoi: string | null;
  created_at: string | null;
};

function veRow(r: DongBlockLibDb): BlockLibRow {
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

/**
 * Version hiện hành = bản phát hành mới nhất của ĐÚNG MỘT TẦNG (append-only nên id lớn nhất là
 * mới nhất). Không truyền `projectId` → bộ **toàn cục** (`project_id IS NULL`), y hệt hành vi
 * trước M113 (guardrail 1: plugin bản cũ không gửi `?project=` vẫn nhận đúng thư viện cũ).
 * Có `projectId` → bộ **của dự án đó**, `null` khi dự án chưa phát hành bộ riêng.
 */
export async function layBlockLibHienHanh(projectId?: number): Promise<BlockLibRow | null> {
  const r =
    projectId === undefined
      ? await queryOne<DongBlockLibDb>(
          `${CHON} WHERE b.project_id IS NULL ORDER BY b.id DESC LIMIT 1`,
        )
      : await queryOne<DongBlockLibDb>(
          `${CHON} WHERE b.project_id = ? ORDER BY b.id DESC LIMIT 1`,
          projectId,
        );
  return r ? veRow(r) : null;
}

/** Nguồn của một block trong kết quả trộn hai tầng (M113 §4.3). */
export type NguonBlock = "global" | "project";

/**
 * Một mục manifest sau khi trộn: giữ NGUYÊN hợp đồng M100 §11, chỉ **thêm** nguồn và version của
 * bộ chứa nó — plugin cần biết tải tệp `.dwg` từ bộ nào (hash kiểm theo TỪNG bộ, không trộn) và
 * kỹ sư cần thấy block này là của dự án hay toàn cục.
 */
export type BlockTronEntry = BlockManifestEntry & { nguon: NguonBlock; libVersion: string };

/**
 * Trộn hai tầng thư viện block (M113 §4) — **chỗ duy nhất** biết luật đè, thuần, không chạm DB.
 *
 * Trộn theo `blocks[].id`: id có ở cả hai bộ → **bản của dự án thắng**; id chỉ có ở một bên → giữ.
 * Thứ tự giữ theo bộ toàn cục trước (block bị đè nằm đúng chỗ cũ), block riêng của dự án nối sau.
 * Dự án chưa có bộ riêng → kết quả **trùng khít** thư viện toàn cục (guardrail 1).
 */
export function tronThuVienBlock(
  toanCuc: BlockLibRow | null,
  cuaDuAn: BlockLibRow | null,
): BlockTronEntry[] {
  const duAn = new Map<string, BlockTronEntry>(
    (cuaDuAn?.manifest.blocks ?? []).map((b) => [
      b.id,
      { ...b, nguon: "project" as const, libVersion: cuaDuAn!.version },
    ]),
  );
  const ketQua: BlockTronEntry[] = [];
  const daDung = new Set<string>();
  for (const b of toanCuc?.manifest.blocks ?? []) {
    const deLen = duAn.get(b.id);
    if (deLen) {
      ketQua.push(deLen);
      daDung.add(b.id);
    } else {
      ketQua.push({ ...b, nguon: "global", libVersion: toanCuc!.version });
    }
  }
  for (const [id, b] of duAn) if (!daDung.has(id)) ketQua.push(b);
  return ketQua;
}

/**
 * Xung đột **tên block AutoCAD** giữa bộ của dự án và bộ toàn cục hiện hành (M113 §4) — thuần.
 *
 * Hai entry khác `id` mà cùng `blockName` thì sau khi trộn sẽ có hai định nghĩa cùng tên trong một
 * bản vẽ — điều AutoCAD không cho phép. Bắt **lúc phát hành bộ dự án**, không phải lúc dùng: người
 * phát hành là người sửa được, còn kỹ sư đang vẽ thì không. Cùng `id` (dự án đè bản toàn cục) là
 * chuyện bình thường, không phải xung đột. Tên block KHÔNG phân biệt hoa thường.
 */
export function kiemXungDotBlockName(
  blocksDuAn: readonly BlockManifestEntry[],
  toanCuc: BlockLibRow | null,
): string[] {
  if (!toanCuc) return [];
  const theoTen = new Map(
    toanCuc.manifest.blocks.map((b) => [b.blockName.toUpperCase(), b] as const),
  );
  const loi: string[] = [];
  for (const b of blocksDuAn) {
    const dung = theoTen.get(b.blockName.toUpperCase());
    if (!dung || dung.id === b.id) continue;
    loi.push(
      `Block "${b.id}" của dự án dùng tên block "${b.blockName}" đã thuộc block "${dung.id}" của ` +
        `bộ toàn cục ${toanCuc.version} — hai định nghĩa cùng tên không cùng tồn tại trong một bản vẽ. ` +
        `Đổi tên block, hoặc dùng đúng id "${dung.id}" nếu muốn ĐÈ block toàn cục đó.`,
    );
  }
  return loi;
}

/**
 * ETag của **kết quả trộn** (M113 §4.6): băm cặp (id bộ toàn cục, id bộ dự án) — đổi một trong hai
 * bộ thì client tải lại. Khác `etagBlockLib` (ETag của MỘT bộ, dùng cho tệp `.dwg` vì hash kiểm
 * theo từng bộ, không trộn).
 */
export function etagBlockLibTron(toanCuc: BlockLibRow | null, cuaDuAn: BlockLibRow | null): string {
  const cap = `${toanCuc?.id ?? 0}-${cuaDuAn?.id ?? 0}`;
  return `"tron-${createHash("sha256").update(cap).digest("hex").slice(0, 32)}"`;
}

/**
 * Chạy một khối thao tác trong đúng **tầng** của thư viện: không có dự án → giữ nguyên đường cũ
 * (ngoài mọi phạm vi dự án, đúng nhánh WITH CHECK "GUC rỗng" của 0145); có dự án → trong
 * `withProjectScope(projectId)` như mọi đường đọc/ghi theo dự án khác.
 */
function trongTang<T>(projectId: number | undefined, fn: () => Promise<T>): Promise<T> {
  return projectId === undefined ? fn() : withProjectScope(projectId, fn, { readOnly: false });
}

/** Lịch sử phát hành (mới → cũ) cho bảng điều khiển web. */
export async function layLichSuBlockLib(limit = 20): Promise<BlockLibRow[]> {
  const rows = await query<DongBlockLibDb>(`${CHON} ORDER BY b.id DESC LIMIT ?`, limit);
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
  /** M113 §6 — phát hành bộ **của dự án này**; vắng = bộ toàn cục, y hệt hôm nay (guardrail 1). */
  projectId?: number;
}): Promise<PhatHanhKetQua> {
  const { manifest, ...kiemDinh } = kiemDinhManifest(input.manifestTho, input.dwg, input.dxfText);
  if (!kiemDinh.ok || !manifest) return { status: "invalid", kiemDinh };

  // M113 §4/FR3 — bộ dự án phải kiểm thêm xung đột tên block với bộ toàn cục hiện hành. Đọc bộ
  // toàn cục NGOÀI phạm vi dự án (dòng project_id IS NULL ai cũng đọc được, nhưng giữ đúng tầng).
  if (input.projectId !== undefined) {
    const xungDot = kiemXungDotBlockName(manifest.blocks, await layBlockLibHienHanh());
    if (xungDot.length > 0) {
      return {
        status: "invalid",
        kiemDinh: { ...kiemDinh, ok: false, errors: [...kiemDinh.errors, ...xungDot] },
      };
    }
  }

  const hash = createHash("sha256").update(input.dwg).digest("hex");
  return trongTang(input.projectId, async () => {
    // Nhãn version chỉ duy nhất TRONG một tầng (0145): dự án A và dự án B cùng đặt 'b1' là hợp lệ.
    const daCo = await queryOne<{ id: number; dwg_sha256: string }>(
      `SELECT id, dwg_sha256 FROM cad_block_libs
        WHERE version = ? AND project_id IS NOT DISTINCT FROM ?`,
      manifest.version,
      input.projectId ?? null,
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

    const id = await ghiSoBlockLib({
      version: manifest.version,
      manifest,
      storageKey,
      dwgSha256: hash,
      userId: input.userId,
      projectId: input.projectId,
    });
    return { status: "created", kiemDinh, id, version: manifest.version };
  });
}

/**
 * Bước GHI SỔ của đường phát hành — tách riêng khỏi `phatHanhBlockLib` để M103 (duyệt đề xuất
 * block) tái dùng nguyên vẹn: gói ứng viên đã được kiểm định + lưu trữ từ lúc NHẬN đề xuất, lúc
 * duyệt chỉ còn việc ghi thành version mới. Không kiểm định lại ở đây — người gọi chịu trách
 * nhiệm (phatHanhBlockLib kiểm ngay trên, block-proposals kiểm lúc nhận).
 */
export async function ghiSoBlockLib(input: {
  version: string;
  manifest: BlockLibManifest;
  storageKey: string;
  dwgSha256: string;
  userId: number;
  /** Bộ của dự án (M113); vắng/null = bộ toàn cục. Người gọi phải đang ở đúng tầng (RLS 0145). */
  projectId?: number | null;
}): Promise<number> {
  return insertId(
    `INSERT INTO cad_block_libs (version, manifest, storage_key, dwg_sha256, published_by, project_id)
     VALUES (?, ?::jsonb, ?, ?, ?, ?)`,
    input.version,
    // Manifest lưu NGUYÊN dạng đã chuẩn hoá (không nhét kết quả kiểm định vào) — cột này chính là
    // thứ plugin tải về qua `?manifest=1`, phải đúng hợp đồng M100 §11.
    JSON.stringify(input.manifest),
    input.storageKey,
    input.dwgSha256,
    input.userId,
    input.projectId ?? null,
  );
}

/**
 * Quy ước tăng version thư viện: tăng **cụm chữ số cuối cùng** trong nhãn, giữ nguyên phần chữ
 * (`b1` → `b2`, `b9` → `b10`, `b0-mau` → `b1-mau`). Nhãn không có chữ số nào thì nối `-2`
 * (`beta` → `beta-2`) — vẫn là một nhãn mới, không bao giờ đè version đã phát hành (M100 §17).
 */
export function versionKeTiep(version: string): string {
  const m = /^(.*?)(\d+)(\D*)$/.exec(version);
  if (!m) return `${version}-2`;
  return `${m[1]}${String(Number(m[2]) + 1)}${m[3]}`;
}

/**
 * Version kế tiếp **chắc chắn chưa dùng**: `version` là UNIQUE nên nếu ai đó đã phát hành tay
 * đúng nhãn kế tiếp, INSERT sẽ nổ giữa transaction duyệt. Nhảy tiếp tới nhãn còn trống.
 */
export async function versionPhatHanhKeTiep(hienHanh: string, projectId?: number): Promise<string> {
  let ung = versionKeTiep(hienHanh);
  for (let i = 0; i < 50; i++) {
    // Nhãn duy nhất theo TỪNG tầng (0145) — nhãn dự án A đang dùng không chặn dự án B/toàn cục.
    const da = await queryOne<{ id: number }>(
      `SELECT id FROM cad_block_libs WHERE version = ? AND project_id IS NOT DISTINCT FROM ?`,
      ung,
      projectId ?? null,
    );
    if (!da) return ung;
    ung = versionKeTiep(ung);
  }
  throw new Error(`Không tìm được nhãn version trống sau "${hienHanh}"`);
}

// ===== block-phan-loai-luat.ts =====
// M108 §7 FR3, TẦNG 1: phân loại block bằng LUẬT TẤT
// ĐỊNH, thuần, không mạng, không DB. Đây là tầng chạy được cả khi không có mạng/không có khoá AI
// (M108 FR9) và là số nền để đo phần AI thật sự đóng góp (§15.4).
//
// NGUYÊN TẮC XUYÊN SUỐT — không đoán:
//   • Mọi suy luận đều bắt nguồn từ RULE PACK đang phát hành, không hard-code danh sách tên trong
//     code. Rule pack đổi thì phân loại đổi theo, không phải sửa file này (ADR-0006 nguyên tắc 1).
//   • Không suy được `kind` thì trả `chua_quyet` — TUYỆT ĐỐI không hạ xuống "giá trị gần đúng"
//     (M108 FR6/AC5). `kind` sai làm hỏng cả `drawTools` lẫn bóc tách, mà lỗi chỉ lộ ra lúc vẽ/bóc.
//   • Dùng ĐÚNG bộ matcher token-boundary dùng chung (`hasAnyToken` của `dxf-parser`) — cùng thuật
//     toán mà `layerMap`/`takeoff` đang dùng, để phân loại không bao giờ lệch với lúc bóc thật.

/** Nguồn ra quyết định của một dòng — khớp CHECK của cột `nguon_quyet_dinh` (migration 0144). */
export const NGUON_QUYET_DINH = [
  "luat",
  "ngu_nghia",
  "hinh_anh",
  "nguoi_sua",
  "chua_quyet",
] as const;
export type NguonQuyetDinh = (typeof NGUON_QUYET_DINH)[number];

/** Những gì đọc được từ một định nghĩa block, trước khi phân loại. */
export type UngVienBlock = {
  blockName: string;
  /** Layer của định nghĩa block (nếu đọc được) — chỉ dùng để suy HỆ, không bao giờ suy `kind`. */
  layer?: string;
  /** Thẻ ATTDEF có thật trong định nghĩa (đã chữ hoa). */
  attributes?: readonly string[];
};

export type KetQuaPhanLoai = {
  kind: LoaiBlock | null;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  nguon: NguonQuyetDinh;
  /** 0..1 — chỉ có nghĩa với nguồn suy đoán (tầng 2/3). Tầng 1 khớp rule pack là chắc chắn ⇒ null. */
  doTinCay: number | null;
  /** Một dòng tiếng Việt giải thích vì sao — hiện thẳng trên bảng duyệt, không phải log. */
  lyDo: string;
};

/**
 * `kind` suy từ VỊ TRÍ của item trong rule pack, không từ tên block người ngoài đặt:
 *   • id trùng `sheetSetup.titleblockId`           → `titleblock`
 *   • id nằm trong `drawTools.systems[].equipment` → `equipment`
 *   • id nằm trong `drawTools.systems[].fittings`  → `support` / `sleeve` / `fitting`
 *
 * Hai lưu ý về hình dạng thật của rule pack v9:
 *
 * 1. `support`/`sleeve` phải tách khỏi `fitting` vì rule pack xếp chung cả ba vào mảng `fittings`
 *    (`support-duct`, `sleeve-wall` đứng cạnh `elbow-duct`), trong khi `LOAI_BLOCK` phân biệt ba
 *    loại — nên đọc thêm token trong chính id.
 * 2. Có item `measure: "count"` **cố ý KHÔNG** nằm trong `drawTools`: `support-hanger` và
 *    `sleeve-opening` (group `COMMON`) là hai hạng mục ĐẾM giá đỡ/lỗ chờ do `XBOSS_VE_GIADO`/
 *    `_LOCHO` sinh ra (M100 PR7), không phải id block thư viện. Khớp tên vào đây vẫn suy được
 *    `kind` từ token của id — KHÔNG được coi là rule pack thiếu nhất quán.
 *
 * Đây là chỗ duy nhất trong tệp dựa vào chuỗi, và chuỗi đó là id do rule pack đặt.
 */
function kindTheoViTriTrongRulePack(itemId: string, pack: CadRulePack): LoaiBlock | null {
  if (pack.sheetSetup?.titleblockId === itemId) return "titleblock";
  for (const heTho of pack.drawTools?.systems ?? []) {
    // `typeof rulePackV9` suy mảng rỗng trong JSON thành `never[]` (vd hệ chưa khai thiết bị nào)
    // nên phải nới về `readonly string[]` mới so sánh được — nới KIỂU, không nới dữ liệu.
    const he = heTho as { equipment?: readonly string[]; fittings?: readonly string[] };
    if ((he.equipment ?? []).includes(itemId)) return "equipment";
    if ((he.fittings ?? []).includes(itemId)) return kindTheoTokenCuaId(itemId) ?? "fitting";
  }
  // Không nằm trong `drawTools` — vẫn suy được với giá đỡ/lỗ chờ (lưu ý 2 ở trên); còn lại thì
  // chịu, vì `equipment` với `fitting` không phân biệt được nếu chỉ nhìn id.
  return kindTheoTokenCuaId(itemId);
}

/** `support`/`sleeve` đọc từ token trong chính id của item (từ vựng do rule pack đặt). */
function kindTheoTokenCuaId(itemId: string): LoaiBlock | null {
  const id = itemId.toLowerCase();
  if (id.includes("support") || id.includes("hanger") || id.includes("giado")) return "support";
  if (id.includes("sleeve") || id.includes("opening") || id.includes("locho")) return "sleeve";
  return null;
}

/** Hệ (`layerMap.groups[].id`) sở hữu một item bóc tách — `group` của item chính là id hệ. */
function heCuaItem(itemId: string, pack: CadRulePack): string | null {
  const item = pack.takeoff.items.find((i) => i.id === itemId);
  return item?.group ?? null;
}

/**
 * Hệ suy từ tên layer chứa block, qua `layerMap.groups[].matchAny` — chỉ suy được HỆ, không bao
 * giờ suy `kind` (một layer HVAC chứa đủ cả cút, van, thiết bị, giá đỡ).
 */
function heTheoLayer(layer: string | undefined, pack: CadRulePack): string | null {
  if (!layer) return null;
  const l = layer.toUpperCase();
  for (const g of pack.layerMap.groups) {
    const tokens = (g.matchAny ?? []).map((t) => t.toUpperCase());
    if (tokens.length > 0 && hasAnyToken(l, tokens)) return g.id;
  }
  return null;
}

/** Thẻ thuộc tính bắt buộc của khung tên, đọc từ rule pack (không hard-code DU_AN/TI_LE trong code). */
function theKhungTen(pack: CadRulePack): string[] {
  const the = (pack.sheetSetup as { titleblockAttributes?: readonly string[] } | undefined)
    ?.titleblockAttributes;
  return (the ?? []).map((t) => t.toUpperCase());
}

/**
 * TẦNG 1 — phân loại một block ứng viên bằng luật tất định.
 *
 * Thứ tự tín hiệu, mạnh trước, **dừng ngay khi đủ chắc**:
 *   1. Tên block khớp `takeoff.items[].blockNameMatchAny` (item `measure: "count"`) → suy được
 *      cả `takeoffItemId`, `kind` (theo vị trí trong `drawTools`) lẫn hệ. Đây là tín hiệu chắc
 *      nhất vì nó chính là thứ `XBOSS_BOCKL` dùng để đếm block khi bóc thật.
 *   2. Khung tên: tên block khớp `sheetSetup.titleblockId`, hoặc mang đủ thẻ thuộc tính khung tên.
 *   3. Không khớp gì → `chua_quyet`, nhưng vẫn trả hệ suy được từ layer (nếu có) để người duyệt
 *      đỡ phải gõ lại, và để tầng 2/3 (PR2) có điểm tựa.
 */
export function phanLoaiTheoLuat(
  ungVien: UngVienBlock,
  pack: CadRulePack = getCurrentRulePack(),
): KetQuaPhanLoai {
  const ten = ungVien.blockName.toUpperCase();
  const the = (ungVien.attributes ?? []).map((t) => t.toUpperCase());
  const heTuLayer = heTheoLayer(ungVien.layer, pack);

  // (1) Khớp item bóc tách theo tên block — first-match đúng thứ tự khai trong rule pack, cùng
  //     quy ước với `takeoff` lúc bóc thật (M99 §6.5 bước 2).
  for (const item of pack.takeoff.items) {
    if (item.measure !== "count") continue;
    const tokens = (item.blockNameMatchAny ?? []).map((t) => t.toUpperCase());
    if (tokens.length === 0 || !hasAnyToken(ten, tokens)) continue;

    const kind = kindTheoViTriTrongRulePack(item.id, pack);
    if (!kind) {
      // Khớp được hạng mục bóc tách nhưng không suy được LOẠI block: `equipment` và `fitting`
      // không phân biệt nổi nếu item không nằm trong `drawTools`. Trả hạng mục + hệ đã biết cho
      // người duyệt chọn nốt loại — không tự đoán (FR6).
      return {
        kind: null,
        systemId: heCuaItem(item.id, pack) ?? heTuLayer,
        takeoffItemId: item.id,
        paperSize: null,
        nguon: "chua_quyet",
        doTinCay: null,
        lyDo:
          `Tên khớp hạng mục bóc tách "${item.id}" (rule pack ${pack.version}) nên đã suy được hạng ` +
          `mục và hệ, nhưng chưa suy được LOẠI block — chọn loại giúp.`,
      };
    }
    return {
      kind,
      systemId: heCuaItem(item.id, pack) ?? heTuLayer,
      takeoffItemId: item.id,
      paperSize: null,
      nguon: "luat",
      doTinCay: null,
      lyDo:
        `Tên block khớp "blockNameMatchAny" của hạng mục bóc tách "${item.id}" ` +
        `(rule pack ${pack.version}) — cùng luật mà XBOSS_BOCKL dùng để đếm.`,
    };
  }

  // (2) Khung tên — không thuộc hệ nào và không đếm khối lượng.
  const idKhungTen = pack.sheetSetup?.titleblockId;
  const theCanCo = theKhungTen(pack);
  const duTheKhungTen = theCanCo.length > 0 && theCanCo.every((t) => the.includes(t));
  if ((idKhungTen && hasAnyToken(ten, [idKhungTen.toUpperCase()])) || duTheKhungTen) {
    return {
      kind: "titleblock",
      systemId: null,
      takeoffItemId: null,
      // Khổ giấy KHÔNG suy được từ tên/thuộc tính — người duyệt phải khai (kiemThuocTinhTheoLoai
      // sẽ chặn nếu để trống). Không đoán "A1" chỉ vì rule pack đang đặt khung tên mặc định là A1.
      paperSize: null,
      nguon: "luat",
      doTinCay: null,
      lyDo: duTheKhungTen
        ? `Mang đủ thẻ thuộc tính khung tên (${theCanCo.join(", ")}) theo rule pack ${pack.version}.`
        : `Tên block khớp "sheetSetup.titleblockId" (${idKhungTen}) của rule pack ${pack.version}.`,
    };
  }

  // (3) Không đủ căn cứ — trả thẳng, không đoán.
  return {
    kind: null,
    systemId: heTuLayer,
    takeoffItemId: null,
    paperSize: null,
    nguon: "chua_quyet",
    doTinCay: null,
    lyDo: heTuLayer
      ? `Tên block không khớp luật nào của rule pack ${pack.version}; chỉ suy được hệ "${heTuLayer}" từ layer "${ungVien.layer}".`
      : `Tên block không khớp luật nào của rule pack ${pack.version} và layer cũng không cho biết hệ.`,
  };
}

/** Phân loại cả lô. Thuần, không I/O — thứ tự kết quả giữ đúng thứ tự đầu vào. */
export function phanLoaiLoTheoLuat(
  ungViens: readonly UngVienBlock[],
  pack: CadRulePack = getCurrentRulePack(),
): KetQuaPhanLoai[] {
  return ungViens.map((u) => phanLoaiTheoLuat(u, pack));
}

/** Số liệu để đo AC3 — bao nhiêu dòng tầng 1 quyết được, bao nhiêu còn treo cho tầng 2/3. */
export function thongKePhanLoai(ketQua: readonly KetQuaPhanLoai[]): {
  tong: number;
  quyetDuoc: number;
  chuaQuyet: number;
} {
  const quyetDuoc = ketQua.filter((k) => k.kind !== null).length;
  return { tong: ketQua.length, quyetDuoc, chuaQuyet: ketQua.length - quyetDuoc };
}

// ===== block-preview-svg.ts =====
// M103 §3 — dựng ảnh xem trước (SVG) cho một định nghĩa block lấy từ DXF sidecar.
/**
 * Module **thuần**: nhận thực thể đã parse (`DxfEntityRaw` của `lib/ky-thuat/cad/dxf-parser`) và
 * trả về chuỗi SVG — không chạm DB, không chạm tệp, test đơn vị được.
 *
 * Vì sao chỉ vẽ được một phần: đây là ảnh **nhận diện** để người duyệt biết mình đang duyệt cái
 * gì, không phải bộ dựng hình CAD. Nên chọn đúng nhóm thực thể hình học phổ biến trong block MEP
 * (LINE / LWPOLYLINE / POLYLINE / CIRCLE / ARC / TEXT / MTEXT); thực thể lạ (HATCH, SPLINE,
 * INSERT lồng…) **bỏ qua im lặng** thay vì làm hỏng cả ảnh — đúng tinh thần "best-effort, lỗi thì
 * preview = null, KHÔNG chặn đề xuất" của M103 §3.
 *
 * Quy ước hiển thị:
 *   - Toạ độ CAD có trục Y hướng LÊN, SVG hướng XUỐNG → mọi điểm ghi ra dùng `y' = -y` (không bọc
 *     `transform="scale(1,-1)"` vì làm vậy chữ sẽ bị lộn ngược).
 *   - Nét vẽ dùng `currentColor`, **không hardcode mã màu** (CLAUDE.md: dark-first, light mode đảo
 *     màu qua biến CSS — ảnh phải ăn theo màu chữ của khối chứa nó ở cả hai theme).
 *   - `viewBox` tự khớp khung bao nội dung nên block to/nhỏ bao nhiêu cũng vừa khung.
 */

/** Trần số thực thể đưa vào ảnh — block khung tên có thể có vài nghìn nét, vẽ hết thì chuỗi SVG
 *  lưu trong cột `preview_svg` phình vô ích (ảnh xem trước chỉ cần nhận ra hình dáng). */
const TRAN_THUC_THE = 4000;

/** Số điểm lấy mẫu trên một cung tròn khi tính khung bao (chỉ dùng để đo, không dùng để vẽ). */
const MAU_CUNG = 24;

type Diem = [number, number];

type Hinh =
  | { loai: "duong"; diem: Diem[]; kin: boolean }
  | { loai: "tron"; tam: Diem; r: number }
  | { loai: "cung"; tam: Diem; r: number; gocDau: number; gocCuoi: number }
  | { loai: "chu"; diem: Diem; cao: number; noiDung: string; xoay: number };

function diemHopLe(p: readonly number[] | undefined): Diem | null {
  if (!p || p.length < 2) return null;
  const [x, y] = p;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/** Gom thực thể DXF về tập hình vẽ được. Thực thể không hiểu / thiếu toạ độ → bỏ qua. */
function gomHinh(entities: readonly DxfEntityRaw[]): Hinh[] {
  const hinh: Hinh[] = [];
  for (const e of entities) {
    if (hinh.length >= TRAN_THUC_THE) break;
    const c = e.coordinates ?? {};
    switch (e.type) {
      case "LINE": {
        const a = diemHopLe(c.start);
        const b = diemHopLe(c.end);
        if (a && b) hinh.push({ loai: "duong", diem: [a, b], kin: false });
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        // Bulge (cung trong đa tuyến) bị bỏ qua — vẽ dây cung thay cho cung; sai lệch không đáng
        // kể ở cỡ ảnh xem trước.
        const diem = (c.points ?? []).map(diemHopLe).filter((p): p is Diem => p !== null);
        if (diem.length >= 2) hinh.push({ loai: "duong", diem, kin: c.closed === true });
        break;
      }
      case "CIRCLE": {
        const tam = diemHopLe(c.center);
        const r = c.radius;
        if (tam && typeof r === "number" && Number.isFinite(r) && r > 0) {
          hinh.push({ loai: "tron", tam, r });
        }
        break;
      }
      case "ARC": {
        const tam = diemHopLe(c.center);
        const r = c.radius;
        const gocDau = c.startAngle;
        const gocCuoi = c.endAngle;
        if (
          tam &&
          typeof r === "number" &&
          Number.isFinite(r) &&
          r > 0 &&
          typeof gocDau === "number" &&
          typeof gocCuoi === "number" &&
          Number.isFinite(gocDau) &&
          Number.isFinite(gocCuoi)
        ) {
          hinh.push({ loai: "cung", tam, r, gocDau, gocCuoi });
        }
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const diem = diemHopLe(c.center);
        const noiDung = (e.decodedText || e.textValue || "").trim();
        if (diem && noiDung) {
          const cao = typeof e.textHeight === "number" && e.textHeight > 0 ? e.textHeight : 2.5;
          const xoay =
            typeof e.rotation === "number" && Number.isFinite(e.rotation) ? e.rotation : 0;
          hinh.push({ loai: "chu", diem, cao, noiDung, xoay });
        }
        break;
      }
      default:
        break; // thực thể lạ: bỏ qua im lặng (best-effort)
    }
  }
  return hinh;
}

type Khung = { minX: number; minY: number; maxX: number; maxY: number };

function moRong(k: Khung, x: number, y: number): void {
  if (x < k.minX) k.minX = x;
  if (y < k.minY) k.minY = y;
  if (x > k.maxX) k.maxX = x;
  if (y > k.maxY) k.maxY = y;
}

/** Khung bao của tập hình (toạ độ CAD, Y hướng lên). */
function khungBao(hinh: readonly Hinh[]): Khung {
  const k: Khung = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const h of hinh) {
    if (h.loai === "duong") {
      for (const [x, y] of h.diem) moRong(k, x, y);
    } else if (h.loai === "tron") {
      moRong(k, h.tam[0] - h.r, h.tam[1] - h.r);
      moRong(k, h.tam[0] + h.r, h.tam[1] + h.r);
    } else if (h.loai === "cung") {
      // Lấy mẫu dọc cung thay vì lấy cả hình tròn: cung 1/4 nằm lọt trong khung nhỏ hơn nhiều,
      // dùng cả đường tròn sẽ đẩy ảnh thu nhỏ vô cớ.
      const quet = quetCung(h.gocDau, h.gocCuoi);
      for (let i = 0; i <= MAU_CUNG; i++) {
        const goc = ((h.gocDau + (quet * i) / MAU_CUNG) * Math.PI) / 180;
        moRong(k, h.tam[0] + h.r * Math.cos(goc), h.tam[1] + h.r * Math.sin(goc));
      }
    } else {
      // Chữ: bề rộng ước lượng theo số ký tự (chỉ để ảnh không bị cắt), không cần chính xác.
      moRong(k, h.diem[0], h.diem[1]);
      moRong(k, h.diem[0] + h.cao * 0.6 * h.noiDung.length, h.diem[1] + h.cao);
    }
  }
  return k;
}

/** Góc quét của cung theo chiều ngược kim đồng hồ của AutoCAD, luôn thuộc (0, 360]. */
function quetCung(gocDau: number, gocCuoi: number): number {
  const d = (((gocCuoi - gocDau) % 360) + 360) % 360;
  return d === 0 ? 360 : d;
}

/** Số làm tròn 3 chữ số thập phân cho chuỗi SVG gọn. */
function s(v: number): string {
  return String(Math.round(v * 1000) / 1000);
}

function thoatXml(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function veHinh(h: Hinh): string {
  if (h.loai === "duong") {
    const diem = h.diem.map(([x, y]) => `${s(x)},${s(-y)}`).join(" ");
    return h.kin ? `<polygon points="${diem}"/>` : `<polyline points="${diem}"/>`;
  }
  if (h.loai === "tron") {
    return `<circle cx="${s(h.tam[0])}" cy="${s(-h.tam[1])}" r="${s(h.r)}"/>`;
  }
  if (h.loai === "cung") {
    const rad = (g: number) => (g * Math.PI) / 180;
    const x1 = h.tam[0] + h.r * Math.cos(rad(h.gocDau));
    const y1 = h.tam[1] + h.r * Math.sin(rad(h.gocDau));
    const x2 = h.tam[0] + h.r * Math.cos(rad(h.gocCuoi));
    const y2 = h.tam[1] + h.r * Math.sin(rad(h.gocCuoi));
    const quet = quetCung(h.gocDau, h.gocCuoi);
    const cungLon = quet > 180 ? 1 : 0;
    // sweep-flag = 0: cung AutoCAD chạy ngược kim đồng hồ, sau khi lật trục Y thì thành thuận
    // kim đồng hồ trong hệ toạ độ SVG.
    return `<path d="M ${s(x1)} ${s(-y1)} A ${s(h.r)} ${s(h.r)} 0 ${cungLon} 0 ${s(x2)} ${s(-y2)}"/>`;
  }
  // Chữ tô đặc thay vì viền nét (kế thừa `stroke` của thẻ `svg` sẽ làm chữ nhỏ bết lại).
  const [x, y] = h.diem;
  const xoay = h.xoay ? ` transform="rotate(${s(-h.xoay)} ${s(x)} ${s(-y)})"` : "";
  return (
    `<text x="${s(x)}" y="${s(-y)}" font-size="${s(h.cao)}" fill="currentColor" stroke="none"` +
    `${xoay}>${thoatXml(h.noiDung)}</text>`
  );
}

/**
 * Dựng SVG xem trước từ danh sách thực thể của **một định nghĩa block**.
 *
 * @returns chuỗi SVG, hoặc `null` khi không có thực thể nào vẽ được (gọi phía trên coi như
 *          "chưa có ảnh xem trước" và hiển thị icon khối thay thế — M103 §5).
 */
export function dungPreviewSvg(
  entities: readonly DxfEntityRaw[] | undefined,
  nhan?: string,
): string | null {
  if (!entities || entities.length === 0) return null;
  const hinh = gomHinh(entities);
  if (hinh.length === 0) return null;

  const k = khungBao(hinh);
  if (!Number.isFinite(k.minX) || !Number.isFinite(k.minY)) return null;

  const rong = Math.max(k.maxX - k.minX, 1e-6);
  const cao = Math.max(k.maxY - k.minY, 1e-6);
  const lon = Math.max(rong, cao);
  const le = lon * 0.05;
  // Nét vẽ tỉ lệ theo cỡ hình để block cỡ mm hay cỡ mét đều nhìn được (không có nét cố định nào
  // hợp cho cả hai). `vector-effect` giữ nét không dày lên khi ảnh bị phóng to trong trang.
  const netVe = lon * 0.004;

  const viewBox = [s(k.minX - le), s(-k.maxY - le), s(rong + le * 2), s(cao + le * 2)].join(" ");

  const than = hinh.map(veHinh).join("");
  const aria = nhan ? ` role="img" aria-label="${thoatXml(`Xem trước block ${nhan}`)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"${aria} ` +
    `fill="none" stroke="currentColor" stroke-width="${s(netVe)}" vector-effect="non-scaling-stroke" ` +
    `stroke-linecap="round" stroke-linejoin="round">${than}</svg>`
  );
}

// ===== block-lo.ts =====
// M108 PR1: NHẬN một lô block ứng viên (từ tệp tổng hợp) vào hàng
// chờ, và PHÁT HÀNH lô đã duyệt thành một version thư viện mới.
//
// Quan hệ với hai đường nạp đã có:
//   • M103 (khối `block-proposals`) — 1 block/lần, plugin dựng sẵn gói ứng viên, có hàng chờ duyệt.
//   • M104 (khối `block-them-web`)  — 1 block/lần từ web, phát hành thẳng, mô hình ĐA TỆP.
//   • M108 (tệp này)             — N block/lần, LUÔN qua hàng chờ duyệt (M108 §2 O3: không block
//     nào vào thư viện mà không qua mắt người).
//
// Khối này tái dùng nguyên vẹn phần kiểm định + ghi sổ của khối `block-lib` (`docManifest`,
// `kiemThuocTinhTheoLoai`, `ghiSoBlockLib`, `versionPhatHanhKeTiep`) và cùng advisory lock với hai
// đường kia — một chỗ sửa, ba đường cùng đúng.

/** Trần một lô — M108 NFR4. Vượt thì từ chối KÈM SỐ ĐO THẬT, không cắt âm thầm. */
export const TRAN_BLOCK_MOI_LO = 500;

/** Lý do một block trong tệp bị loại khỏi lô — hiện nguyên văn cho người nạp (M108 §6.1 bước 3). */
export type LyDoBoQua = { blockName: string; lyDo: string };

export type DongLo = {
  id: number;
  blockName: string;
  kind: LoaiBlock | null;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  attributes: string[];
  fileKey: string | null;
  fileSha256: string | null;
  previewSvg: string | null;
  nguonQuyetDinh: NguonQuyetDinh;
  doTinCay: number | null;
  lyDo: string | null;
  chon: boolean;
};

export type LoBlock = {
  id: number;
  nguon: "plugin" | "web";
  baseLibVersion: string;
  status: string;
  rejectReason: string | null;
  publishedVersion: string | null;
  aiEnabled: boolean;
  createdAt: string | null;
};

export type NhanLoKetQua =
  | { status: "invalid"; errors: string[] }
  | { status: "conflict"; message: string; versionHienHanh?: string }
  | { status: "created"; loId: number; tong: number; boQua: LyDoBoQua[] };

/**
 * Ứng viên đọc được từ tệp tổng hợp, kèm phần tệp lẻ (đường web đa tệp — M104 §1).
 * Đường plugin gộp chung một gói nên `fileKey`/`fileSha256` để trống.
 */
export type UngVienLo = UngVienBlock & {
  fileKey?: string;
  fileSha256?: string;
  previewSvg?: string;
};

/**
 * Lọc ứng viên trước khi dựng lô — trả về (giữ lại, bỏ qua kèm lý do).
 *
 * Thuần, không DB: phần trùng tên với THƯ VIỆN được lọc riêng bên trong transaction của
 * `nhanLoBlock` (phải đọc thư viện hiện hành dưới khoá mới đúng).
 */
export function locUngVien(ungViens: readonly UngVienLo[]): {
  giuLai: UngVienLo[];
  boQua: LyDoBoQua[];
} {
  const giuLai: UngVienLo[] = [];
  const boQua: LyDoBoQua[] = [];
  const daThay = new Set<string>();

  for (const u of ungViens) {
    const ten = (u.blockName ?? "").trim();
    if (!ten) {
      boQua.push({ blockName: "(không tên)", lyDo: "Định nghĩa block không có tên." });
      continue;
    }
    // Block ẩn danh do hatch/khối động/explode sinh ra — không có tên nghĩa lý để đưa vào thư viện
    // (cùng luật với M103 `BlockUngVienBuilder.DocDinhNghia`).
    if (ten.startsWith("*")) {
      boQua.push({
        blockName: ten,
        lyDo: "Block ẩn danh (do hatch/khối động sinh ra) — không có tên để đưa vào thư viện.",
      });
      continue;
    }
    // Không gian layout, không phải block thư viện.
    if (/^\*?(MODEL_SPACE|PAPER_SPACE)/i.test(ten)) {
      boQua.push({ blockName: ten, lyDo: "Là không gian layout, không phải block thư viện." });
      continue;
    }
    const khoa = ten.toUpperCase();
    if (daThay.has(khoa)) {
      boQua.push({ blockName: ten, lyDo: "Trùng tên với một định nghĩa khác trong cùng tệp." });
      continue;
    }
    daThay.add(khoa);
    giuLai.push({ ...u, blockName: ten });
  }
  return { giuLai, boQua };
}

/** Thẻ ATTDEF có thật trong định nghĩa block — nguồn duy nhất cho `attributes` (cùng luật M104). */
function thuocTinhTuDxf(hinhHoc: readonly DxfEntityRaw[] | undefined): string[] {
  const the = new Set<string>();
  for (const e of hinhHoc ?? []) {
    if (e.type !== "ATTDEF" || !e.attributeTag) continue;
    const t = String(e.attributeTag).trim().toUpperCase();
    if (t) the.add(t);
  }
  return [...the];
}

/**
 * Đọc MỌI định nghĩa block trong một tệp DXF tổng hợp thành danh sách ứng viên.
 *
 * Đây là con mắt của đường web: máy chủ không chạy AutoCAD nên DXF là thứ duy nhất đọc được
 * (ADR-0006). Ảnh xem trước dựng best-effort — hỏng thì ứng viên vẫn vào lô, chỉ mất đầu vào của
 * tầng hình học.
 *
 * Ném lỗi khi DXF không parse được — người gọi bắt và trả 422 kèm nguyên văn lý do.
 */
export function docUngVienTuDxf(dxfText: string): UngVienLo[] {
  const dxf = parseDxf(dxfText);
  return dxf.blocks.map((b) => {
    let previewSvg: string | undefined;
    try {
      previewSvg = dungPreviewSvg(b.entities, b.name) ?? undefined;
    } catch {
      previewSvg = undefined;
    }
    // Layer của block lấy từ layer của thực thể đầu tiên trong định nghĩa — chỉ dùng để GỢI Ý hệ,
    // không bao giờ dùng suy loại block, nên xấp xỉ thế này là đủ và không gây hại.
    const layer = (b.entities ?? []).find((e) => e.layer)?.layer;
    return {
      blockName: b.name,
      layer,
      attributes: thuocTinhTuDxf(b.entities),
      previewSvg,
    };
  });
}

/**
 * Nhận một lô ứng viên vào hàng chờ: lọc → phân loại tầng 1 → ghi `cad_block_batches` +
 * `cad_block_batch_items`. KHÔNG phát hành gì — thư viện chỉ đổi khi có người duyệt.
 *
 * Trùng tên với thư viện hiện hành hoặc với đề xuất M103 đang chờ → **bỏ qua kèm lý do**
 * (quyết định người dùng 2026-08-26, M108 §4), không phải lỗi cả lô.
 */
export async function nhanLoBlock(input: {
  userId: number;
  nguon: "plugin" | "web";
  ungViens: readonly UngVienLo[];
  candidateStorageKey?: string;
  candidateDwgSha256?: string;
  /**
   * Kết quả phân loại tính sẵn, khớp theo TÊN BLOCK (không theo thứ tự — `locUngVien` có thể đã
   * bỏ bớt dòng). Vắng ⇒ tự chạy tầng 1.
   *
   * Vì sao truyền vào thay vì gọi thẳng: cỗ máy 4 tầng nằm ở `lib/dich-vu/` (tầng 5) vì phối
   * `ky-thuat` với `nen/ai`, mà tệp này ở tầng 4 — tầng 4 import tầng 5 là ngược hướng, ADR-0007
   * cấm. Nên tầng 5 tính rồi đưa xuống, không phải tầng 4 với lên.
   */
  phanLoai?: ReadonlyMap<string, KetQuaPhanLoai>;
  /** Lô này có thực sự gọi AI không — ghi vào `cad_block_batches.ai_enabled`. */
  aiDaChay?: boolean;
}): Promise<NhanLoKetQua> {
  if (input.ungViens.length === 0) {
    return { status: "invalid", errors: ["Tệp không có định nghĩa block nào để nạp."] };
  }
  const { giuLai, boQua } = locUngVien(input.ungViens);
  // Trần tính trên số block THẬT SỰ nạp được, không phải số định nghĩa thô: một tệp 600 định nghĩa
  // mà 400 là block ẩn danh vẫn nằm gọn trong trần, chặn nó là chặn oan.
  if (giuLai.length > TRAN_BLOCK_MOI_LO) {
    return {
      status: "invalid",
      errors: [
        `Tệp có ${giuLai.length} block nạp được (trong ${input.ungViens.length} định nghĩa), vượt trần ` +
          `${TRAN_BLOCK_MOI_LO} block một lô — tách tệp rồi nạp lại.`,
      ],
    };
  }

  return withTransaction<NhanLoKetQua>(async () => {
    // Cùng khoá với hai đường phát hành kia — đọc thư viện hiện hành ổn định trong suốt lượt nhận.
    await run(`SELECT pg_advisory_xact_lock(hashtext('cad_block_libs'))`);

    const hienHanhRow = await layBlockLibHienHanh();
    if (!hienHanhRow) {
      return {
        status: "conflict",
        message:
          "Chưa phát hành thư viện block nền nào — Admin/PM phát hành bản nền trước, rồi mới nạp lô.",
      };
    }
    const { manifest: hienHanh, errors: loiHienHanh } = docManifest(hienHanhRow.manifest);
    if (!hienHanh) {
      return {
        status: "invalid",
        errors: [
          `Manifest của thư viện hiện hành (${hienHanhRow.version}) không đọc được: ${loiHienHanh.join(" · ")}`,
        ],
      };
    }

    const tenDaCo = new Set(hienHanh.blocks.map((b) => b.blockName.toUpperCase()));
    const choDuyet = await query<{ block_name: string }>(
      `SELECT block_name FROM cad_block_proposals WHERE status = 'pending'`,
    );
    const tenChoDuyet = new Set(choDuyet.map((r) => r.block_name.toUpperCase()));

    const nhan: UngVienLo[] = [];
    for (const u of giuLai) {
      const khoa = u.blockName.toUpperCase();
      if (tenDaCo.has(khoa)) {
        boQua.push({
          blockName: u.blockName,
          lyDo: `Thư viện ${hienHanhRow.version} đã có block cùng tên.`,
        });
        continue;
      }
      if (tenChoDuyet.has(khoa)) {
        boQua.push({
          blockName: u.blockName,
          lyDo: "Đã có đề xuất đang chờ duyệt cho block cùng tên.",
        });
        continue;
      }
      nhan.push(u);
    }

    if (nhan.length === 0) {
      return {
        status: "invalid",
        errors: [
          `Không còn block nào đủ điều kiện nạp (${boQua.length} block bị bỏ qua) — xem danh sách lý do rồi xử lý trước khi nạp lại.`,
        ],
      };
    }

    const loId = await insertId(
      `INSERT INTO cad_block_batches
         (nguon, base_lib_version, candidate_storage_key, candidate_dwg_sha256, ai_enabled, proposed_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.nguon,
      hienHanhRow.version,
      input.candidateStorageKey ?? null,
      input.candidateDwgSha256 ?? null,
      input.aiDaChay ?? false,
      input.userId,
    );

    for (const u of nhan) {
      const kq = input.phanLoai?.get(u.blockName.toUpperCase()) ?? phanLoaiTheoLuat(u);
      await run(
        `INSERT INTO cad_block_batch_items
           (batch_id, block_name, kind, system_id, takeoff_item_id, paper_size, attributes,
            file_key, file_sha256, preview_svg, nguon_quyet_dinh, do_tin_cay, ly_do)
         VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?)`,
        loId,
        u.blockName,
        kq.kind,
        kq.systemId,
        kq.takeoffItemId,
        kq.paperSize,
        JSON.stringify((u.attributes ?? []).map((t) => t.toUpperCase())),
        u.fileKey ?? null,
        u.fileSha256 ?? null,
        u.previewSvg ?? null,
        kq.nguon,
        kq.doTinCay,
        kq.lyDo,
      );
    }

    return { status: "created", loId, tong: nhan.length, boQua };
  });
}

type DongUngVienLoDb = {
  id: number;
  block_name: string;
  kind: string | null;
  system_id: string | null;
  takeoff_item_id: string | null;
  paper_size: string | null;
  attributes: string[] | null;
  file_key: string | null;
  file_sha256: string | null;
  preview_svg: string | null;
  nguon_quyet_dinh: NguonQuyetDinh;
  do_tin_cay: number | null;
  ly_do: string | null;
  chon: boolean;
};

function veDong(r: DongUngVienLoDb): DongLo {
  return {
    id: r.id,
    blockName: r.block_name,
    kind: (r.kind as LoaiBlock | null) ?? null,
    systemId: r.system_id,
    takeoffItemId: r.takeoff_item_id,
    paperSize: r.paper_size,
    attributes: r.attributes ?? [],
    fileKey: r.file_key,
    fileSha256: r.file_sha256,
    previewSvg: r.preview_svg,
    nguonQuyetDinh: r.nguon_quyet_dinh,
    doTinCay: r.do_tin_cay,
    lyDo: r.ly_do,
    chon: r.chon,
  };
}

export async function layLo(loId: number): Promise<{ lo: LoBlock; dong: DongLo[] } | null> {
  const row = await queryOne<{
    id: number;
    nguon: "plugin" | "web";
    base_lib_version: string;
    status: string;
    reject_reason: string | null;
    published_version: string | null;
    ai_enabled: boolean;
    created_at: string | null;
  }>(
    `SELECT id, nguon, base_lib_version, status, reject_reason, published_version, ai_enabled, created_at
       FROM cad_block_batches WHERE id = ?`,
    loId,
  );
  if (!row) return null;
  const dong = await query<DongUngVienLoDb>(
    `SELECT id, block_name, kind, system_id, takeoff_item_id, paper_size, attributes,
            file_key, file_sha256, preview_svg, nguon_quyet_dinh, do_tin_cay, ly_do, chon
       FROM cad_block_batch_items WHERE batch_id = ? ORDER BY id`,
    loId,
  );
  return {
    lo: {
      id: row.id,
      nguon: row.nguon,
      baseLibVersion: row.base_lib_version,
      status: row.status,
      rejectReason: row.reject_reason,
      publishedVersion: row.published_version,
      aiEnabled: row.ai_enabled,
      createdAt: row.created_at,
    },
    dong: dong.map(veDong),
  };
}

/** Sửa của người duyệt cho một dòng — mọi trường metadata đều sửa được (M108 FR11). */
export type SuaDong = {
  id: number;
  kind?: LoaiBlock | null;
  systemId?: string | null;
  takeoffItemId?: string | null;
  paperSize?: string | null;
  chon?: boolean;
};

/**
 * Ép body của route duyệt về đúng hình dạng `SuaDong[]`.
 *
 * Nằm ở lib chứ không trong route vì route chỉ là ranh giới HTTP (ADR-0008) — và vì đây là logic
 * kiểm đầu vào, thứ bắt buộc phải test được mà không cần dựng request scope của Next.
 */
export function docSuaDong(tho: unknown): { sua: SuaDong[] } | { loi: string } {
  if (tho == null) return { sua: [] };
  if (!Array.isArray(tho)) return { loi: "Trường 'dong' phải là mảng." };
  const sua: SuaDong[] = [];
  for (const d of tho) {
    if (typeof d !== "object" || d === null) {
      return { loi: "Mỗi phần tử của 'dong' phải là object." };
    }
    const o = d as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id) || id <= 0) return { loi: "Mỗi dòng phải có id là số nguyên dương." };
    const m: SuaDong = { id };
    if ("kind" in o) {
      const k = o.kind;
      if (k !== null && !(LOAI_BLOCK as readonly string[]).includes(String(k))) {
        return { loi: `Loại block "${String(k)}" không hợp lệ.` };
      }
      m.kind = k === null ? null : (String(k) as LoaiBlock);
    }
    if ("systemId" in o) m.systemId = o.systemId == null ? null : String(o.systemId);
    if ("takeoffItemId" in o) {
      m.takeoffItemId = o.takeoffItemId == null ? null : String(o.takeoffItemId);
    }
    if ("paperSize" in o) m.paperSize = o.paperSize == null ? null : String(o.paperSize);
    if ("chon" in o) m.chon = Boolean(o.chon);
    sua.push(m);
  }
  return { sua };
}

export type DuyetLoKetQua =
  | { status: "invalid"; errors: string[] }
  | { status: "stale"; message: string }
  | { status: "not-found" }
  | { status: "idempotent"; version: string }
  | { status: "created"; version: string; soBlockThem: number };

/** Id entry manifest sinh từ tên block, bảo đảm không đụng id nào đã có (cùng luật M104). */
function idTuTenBlock(blockName: string, daCo: ReadonlySet<string>): string {
  const goc =
    blockName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "block";
  let id = goc;
  for (let i = 2; daCo.has(id); i++) id = `${goc}-${i}`;
  return id;
}

/**
 * Duyệt lô → phát hành MỘT version thư viện mới chứa mọi dòng được chọn (M108 FR12).
 *
 * Idempotent: lô đã `approved` thì trả lại đúng version đã phát hành, không sinh version thứ hai
 * (AC7 — người duyệt bấm đúp là chuyện thường).
 * Chống đua: `base_lib_version` lệch thư viện hiện hành → đánh dấu `stale`, chặn duyệt (AC8),
 * đúng cơ chế M103 §1 AC4.
 */
export async function duyetLo(input: {
  userId: number;
  loId: number;
  sua?: readonly SuaDong[];
}): Promise<DuyetLoKetQua> {
  return withTransaction<DuyetLoKetQua>(async () => {
    await run(`SELECT pg_advisory_xact_lock(hashtext('cad_block_libs'))`);

    const lo = await queryOne<{
      id: number;
      base_lib_version: string;
      status: string;
      published_version: string | null;
    }>(
      `SELECT id, base_lib_version, status, published_version FROM cad_block_batches WHERE id = ?`,
      input.loId,
    );
    if (!lo) return { status: "not-found" };
    if (lo.status === "approved" && lo.published_version) {
      return { status: "idempotent", version: lo.published_version };
    }
    if (lo.status !== "pending") {
      return {
        status: "stale",
        message: `Lô #${lo.id} đang ở trạng thái "${lo.status}" — chỉ lô đang chờ mới duyệt được.`,
      };
    }

    const hienHanhRow = await layBlockLibHienHanh();
    if (!hienHanhRow) {
      return {
        status: "invalid",
        errors: ["Thư viện block nền đã biến mất — không phát hành được."],
      };
    }
    if (hienHanhRow.version !== lo.base_lib_version) {
      await run(`UPDATE cad_block_batches SET status = 'stale' WHERE id = ?`, lo.id);
      return {
        status: "stale",
        message:
          `Thư viện đã lên version ${hienHanhRow.version} trong lúc lô #${lo.id} chờ duyệt ` +
          `(lô dựng trên ${lo.base_lib_version}) — nạp lại lô trên thư viện mới.`,
      };
    }
    const { manifest: hienHanh, errors: loiHienHanh } = docManifest(hienHanhRow.manifest);
    if (!hienHanh) {
      return {
        status: "invalid",
        errors: [`Manifest thư viện hiện hành không đọc được: ${loiHienHanh.join(" · ")}`],
      };
    }

    // Áp sửa của người duyệt lên từng dòng TRƯỚC khi kiểm — người sửa thì nguồn quyết định đổi
    // thành `nguoi_sua` (AC9), độ tin cậy của máy không còn nghĩa gì nữa nên xoá.
    for (const s of input.sua ?? []) {
      const dat: string[] = [];
      const val: unknown[] = [];
      if (s.kind !== undefined) {
        if (s.kind !== null && !(LOAI_BLOCK as readonly string[]).includes(s.kind)) {
          return { status: "invalid", errors: [`Loại block "${s.kind}" không hợp lệ.`] };
        }
        dat.push("kind = ?");
        val.push(s.kind);
      }
      if (s.systemId !== undefined) (dat.push("system_id = ?"), val.push(s.systemId));
      if (s.takeoffItemId !== undefined)
        (dat.push("takeoff_item_id = ?"), val.push(s.takeoffItemId));
      if (s.paperSize !== undefined) (dat.push("paper_size = ?"), val.push(s.paperSize));
      if (s.chon !== undefined) (dat.push("chon = ?"), val.push(s.chon));
      if (dat.length === 0) continue;
      dat.push("nguon_quyet_dinh = 'nguoi_sua'", "do_tin_cay = NULL");
      val.push(s.id, input.loId);
      await run(
        `UPDATE cad_block_batch_items SET ${dat.join(", ")} WHERE id = ? AND batch_id = ?`,
        ...val,
      );
    }

    const dong = (
      await query<DongUngVienLoDb>(
        `SELECT id, block_name, kind, system_id, takeoff_item_id, paper_size, attributes,
                file_key, file_sha256, preview_svg, nguon_quyet_dinh, do_tin_cay, ly_do, chon
           FROM cad_block_batch_items WHERE batch_id = ? AND chon = TRUE ORDER BY id`,
        input.loId,
      )
    ).map(veDong);

    if (dong.length === 0) {
      return { status: "invalid", errors: ["Không có dòng nào được chọn để nạp."] };
    }

    const idDaCo = new Set(hienHanh.blocks.map((b) => b.id));
    const tenDaCo = new Set(hienHanh.blocks.map((b) => b.blockName.toUpperCase()));
    const them: BlockManifestEntry[] = [];
    const loi: string[] = [];

    for (const d of dong) {
      if (!d.kind) {
        loi.push(`Block "${d.blockName}": chưa khai loại — chọn loại hoặc bỏ chọn dòng này.`);
        continue;
      }
      // Thư viện có thể đã đổi giữa lúc nhận và lúc duyệt bởi một đường khác — kiểm lại lần nữa.
      if (tenDaCo.has(d.blockName.toUpperCase())) {
        loi.push(`Block "${d.blockName}": thư viện đã có block cùng tên — bỏ chọn dòng này.`);
        continue;
      }
      const entry: BlockManifestEntry = {
        id: idTuTenBlock(d.blockName, idDaCo),
        blockName: d.blockName,
        kind: d.kind,
        system: d.systemId ?? undefined,
        attributes: d.attributes.length > 0 ? d.attributes : undefined,
        takeoffItemId: d.takeoffItemId ?? undefined,
        paper: d.paperSize ?? undefined,
        fileKey: d.fileKey ?? undefined,
        fileSha256: d.fileSha256 ?? undefined,
        previewSvg: d.previewSvg ?? undefined,
      };
      // Cùng luật metadata với hai đường nạp kia — không có đường vòng nào qua mặt được (FR7).
      const loiThuocTinh: string[] = [];
      kiemThuocTinhTheoLoai(entry, loiThuocTinh);
      if (loiThuocTinh.length > 0) {
        loi.push(...loiThuocTinh);
        continue;
      }
      idDaCo.add(entry.id);
      tenDaCo.add(entry.blockName.toUpperCase());
      them.push(entry);
    }

    if (loi.length > 0) return { status: "invalid", errors: loi };

    const versionMoi = await versionPhatHanhKeTiep(hienHanhRow.version);
    // Tệp nền KHÔNG đổi (máy chủ không chạy AutoCAD nên không gộp được) — mô hình đa tệp M104 §1.
    const manifestMoi: BlockLibManifest = {
      ...hienHanh,
      version: versionMoi,
      dwgSha256: hienHanhRow.dwgSha256,
      blocks: [...hienHanh.blocks, ...them],
    };
    await ghiSoBlockLib({
      version: versionMoi,
      manifest: manifestMoi,
      storageKey: hienHanhRow.storageKey,
      dwgSha256: hienHanhRow.dwgSha256,
      userId: input.userId,
    });
    await run(
      `UPDATE cad_block_batches
          SET status = 'approved', published_version = ?, decided_by = ?, decided_at = now()
        WHERE id = ?`,
      versionMoi,
      input.userId,
      input.loId,
    );
    return { status: "created", version: versionMoi, soBlockThem: them.length };
  });
}

/** Từ chối cả lô kèm lý do (M108 §6.3). */
export async function tuChoiLo(input: {
  userId: number;
  loId: number;
  lyDo: string;
}): Promise<{ ok: boolean; message?: string }> {
  const lyDo = input.lyDo.trim();
  if (!lyDo) return { ok: false, message: "Phải nêu lý do từ chối." };
  const lo = await queryOne<{ status: string }>(
    `SELECT status FROM cad_block_batches WHERE id = ?`,
    input.loId,
  );
  if (!lo) return { ok: false, message: "Không tìm thấy lô." };
  if (lo.status !== "pending") {
    return { ok: false, message: `Lô đang ở trạng thái "${lo.status}" — không từ chối được.` };
  }
  await run(
    `UPDATE cad_block_batches
        SET status = 'rejected', reject_reason = ?, decided_by = ?, decided_at = now()
      WHERE id = ? AND status = 'pending'`,
    lyDo,
    input.userId,
    input.loId,
  );
  return { ok: true };
}

// ===== block-proposals.ts =====
// M103 — đề xuất block vào thư viện từ AutoCAD: hàng chờ + duyệt (M103 §1–§3).
/**
 * Nguyên tắc nền (M100 §18, giữ nguyên): thư viện block là **dữ liệu phát hành có version toàn
 * cục**. Đề xuất KHÔNG sửa thư viện; duyệt mới sinh version mới. Server không chạy AutoCAD nên
 * không gộp DWG được → plugin dựng sẵn "thư viện ứng viên" hoàn chỉnh (blocks.dwg + manifest đầy
 * đủ + sidecar DXF), server chỉ **kiểm định lại** rồi xếp hàng chờ; lúc duyệt chỉ còn thao tác
 * dữ liệu thuần: chép nguyên gói ứng viên thành một version `cad_block_libs` mới.
 *
 * Chống đua version (M103 §1 / AC4): mỗi đề xuất mang `base_lib_version`; server so với version
 * hiện hành cả lúc NHẬN lẫn lúc DUYỆT — lệch thì 409 và đánh dấu `stale`, người đề xuất chạy lại
 * lệnh. Nhờ đó hai đề xuất cùng base không bao giờ phát hành đè mất block của nhau.
 *
 * Kiểm định tái dùng nguyên khối `block-lib` (`kiemDinhManifest` + đường ghi sổ `ghiSoBlockLib`),
 * không chép lại logic — một chỗ sửa, hai đường phát hành cùng đúng.
 */

// ── Hằng số & nhãn tiếng Việt ────────────────────────────────────────────────

export const TRANG_THAI_DE_XUAT = [
  "pending",
  "approved",
  "rejected",
  "stale",
  "withdrawn",
] as const;
export type TrangThaiDeXuat = (typeof TRANG_THAI_DE_XUAT)[number];

export const NHAN_TRANG_THAI_DE_XUAT: Record<TrangThaiDeXuat, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  stale: "Lỗi thời",
  withdrawn: "Đã thu hồi",
};

export const NHAN_LOAI_BLOCK: Record<LoaiBlock, string> = {
  fitting: "Phụ kiện",
  equipment: "Thiết bị",
  titleblock: "Khung tên",
  support: "Giá đỡ",
  sleeve: "Ống lồng",
  annotation: "Ký hiệu chú thích",
};

/**
 * Kind đếm khối lượng theo block (M103 §2) — bắt buộc khai `takeoff_item_id`.
 * `titleblock` và `annotation` (M110) đứng ngoài: khung tên và ký hiệu chú thích không phải khối
 * lượng thi công, ép khai `takeoff_item_id` chỉ tạo ra hạng mục ma trong BOQ.
 */
const KIND_DEM_KHOI_LUONG: readonly LoaiBlock[] = ["fitting", "equipment", "support", "sleeve"];

// ── Đọc & kiểm metadata (thuần, không chạm DB) ───────────────────────────────

/** Metadata đề xuất — khoá JSON theo đúng hợp đồng M103 §3 (snake_case). */
export type MetaDeXuat = MetaBlockCoBan & {
  baseLibVersion: string;
  candidateManifest: unknown;
  sha256: string;
};

/**
 * Phần metadata **mô tả chính block** — dùng chung cho cả đường đề xuất từ AutoCAD (M103 §3) lẫn
 * đường thêm thẳng từ web (M104 §2), để hai đường không bao giờ lệch luật bắt buộc theo kind.
 */
export type MetaBlockCoBan = {
  blockName: string;
  kind: LoaiBlock;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  note: string | null;
};

/** `block_name` → `blockName` — hợp đồng M103 dùng snake_case, M104 §2 dùng camelCase. */
function camel(khoa: string): string {
  return khoa.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Đọc chuỗi theo khoá snake_case, chấp nhận cả biến thể camelCase cùng nghĩa. */
function chuoi(o: Record<string, unknown>, khoa: string): string {
  const v = o[khoa] ?? o[camel(khoa)];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Ép phần metadata mô tả block về đúng hình dạng, kèm kiểm **metadata đủ theo kind**
 * (M103 §2/§3d): hệ bắt buộc trừ khung tên, item bóc tách bắt buộc với kind đếm khối lượng,
 * khổ giấy chỉ (và bắt buộc) với khung tên.
 */
export function docMetaBlockCoBan(tho: unknown): { meta: MetaBlockCoBan | null; errors: string[] } {
  const errors: string[] = [];
  if (typeof tho !== "object" || tho === null || Array.isArray(tho)) {
    return { meta: null, errors: ["meta không phải một đối tượng JSON."] };
  }
  const o = tho as Record<string, unknown>;

  const blockName = chuoi(o, "block_name");
  const kind = chuoi(o, "kind");
  const systemId = chuoi(o, "system_id");
  const takeoffItemId = chuoi(o, "takeoff_item_id");
  const paperSize = chuoi(o, "paper_size");
  const note = chuoi(o, "note");

  if (!blockName) errors.push('Thiếu "block_name" — tên block trong tệp .dwg.');
  else if (blockName.length > 255) errors.push('"block_name" dài quá 255 ký tự.');
  if (!(LOAI_BLOCK as readonly string[]).includes(kind)) {
    errors.push(`"kind" lạ — chỉ nhận ${LOAI_BLOCK.join(" | ")}.`);
  }
  if (kind !== "titleblock") {
    if (!systemId) {
      errors.push('Thiếu "system_id" — mọi block trừ khung tên đều phải thuộc một hệ.');
    }
    if (paperSize) {
      errors.push('"paper_size" chỉ dành cho khung tên (kind = titleblock).');
    }
  } else if (!paperSize) {
    errors.push('Khung tên thiếu "paper_size" — mỗi khổ giấy một khung tên (M100 FR9a).');
  }
  if ((KIND_DEM_KHOI_LUONG as readonly string[]).includes(kind) && !takeoffItemId) {
    errors.push(
      `Thiếu "takeoff_item_id" — block loại ${kind} được đếm khối lượng, phải trỏ tới một item bóc tách.`,
    );
  }

  if (errors.length > 0) return { meta: null, errors };
  return {
    meta: {
      blockName,
      kind: kind as LoaiBlock,
      systemId: systemId || null,
      takeoffItemId: takeoffItemId || null,
      paperSize: paperSize || null,
      note: note || null,
    },
    errors,
  };
}

/**
 * Metadata gói đề xuất từ AutoCAD = phần mô tả block (chung với M104) + 3 trường riêng của đường
 * đề xuất: version nền, manifest ứng viên, hash tệp ứng viên.
 */
export function docMetaDeXuat(tho: unknown): { meta: MetaDeXuat | null; errors: string[] } {
  const { meta: coBan, errors: loiCoBan } = docMetaBlockCoBan(tho);
  const errors = [...loiCoBan];
  if (typeof tho !== "object" || tho === null || Array.isArray(tho)) {
    return { meta: null, errors };
  }
  const o = tho as Record<string, unknown>;

  const baseLibVersion = chuoi(o, "base_lib_version");
  const sha256 = chuoi(o, "sha256").toLowerCase();
  if (!baseLibVersion) {
    errors.push('Thiếu "base_lib_version" — version thư viện mà ứng viên được dựng lên.');
  }
  if (!SHA256_HEX.test(sha256)) {
    errors.push('Thiếu "sha256" hợp lệ (64 ký tự hex của tệp .dwg ứng viên).');
  }
  const candidateManifest = o.candidate_manifest;
  if (
    typeof candidateManifest !== "object" ||
    candidateManifest === null ||
    Array.isArray(candidateManifest)
  ) {
    errors.push('Thiếu "candidate_manifest" — manifest ĐẦY ĐỦ của thư viện sau khi thêm block.');
  }

  if (errors.length > 0 || !coBan) return { meta: null, errors };
  return { meta: { ...coBan, baseLibVersion, candidateManifest, sha256 }, errors };
}

/** So sánh hai mục manifest đã chuẩn hoá — JSONB không giữ thứ tự khoá nên không so bằng chuỗi. */
function mucBangNhau(a: BlockManifestEntry, b: BlockManifestEntry): boolean {
  const attr = (x?: string[]) => (x ?? []).join("\u0000");
  return (
    a.id === b.id &&
    a.blockName === b.blockName &&
    a.kind === b.kind &&
    (a.system ?? null) === (b.system ?? null) &&
    (a.scaleBySize ?? false) === (b.scaleBySize ?? false) &&
    (a.rotateToPath ?? false) === (b.rotateToPath ?? false) &&
    (a.takeoffItemId ?? null) === (b.takeoffItemId ?? null) &&
    (a.paper ?? null) === (b.paper ?? null) &&
    attr(a.attributes) === attr(b.attributes)
  );
}

/**
 * Manifest ứng viên phải **đúng bằng manifest hiện hành cộng đúng 1 entry mới** mang tên
 * `blockName` (M103 §3b). Đề xuất là đường THÊM block, không phải đường sửa/xoá block đã phát
 * hành — sửa/xoá vẫn đi đường phát hành thư viện của Admin/PM.
 */
export function soSanhManifestUngVien(
  hienHanh: BlockLibManifest,
  ungVien: BlockLibManifest,
  blockName: string,
): string[] {
  const errors: string[] = [];
  const cu = new Map(hienHanh.blocks.map((b) => [b.id, b]));
  const moi = new Map(ungVien.blocks.map((b) => [b.id, b]));

  for (const [id, b] of cu) {
    const t = moi.get(id);
    if (!t) {
      errors.push(
        `Manifest ứng viên thiếu block "${id}" của thư viện hiện hành — đề xuất chỉ được THÊM block, không được bỏ bớt.`,
      );
    } else if (!mucBangNhau(b, t)) {
      errors.push(
        `Block "${id}" bị sửa so với thư viện hiện hành — đề xuất chỉ được THÊM block mới, sửa block cũ đi đường phát hành thư viện.`,
      );
    } else if (
      (b.fileKey ?? null) !== (t.fileKey ?? null) ||
      (b.fileSha256 ?? null) !== (t.fileSha256 ?? null)
    ) {
      // M104 §1: block thêm từ web nằm ở tệp .dwg riêng. Ứng viên phải GIỮ NGUYÊN `fileKey` của
      // chúng — bỏ đi thì version mới sẽ trỏ block đó vào tệp nền (không có định nghĩa) và cả
      // thư viện hỏng theo. `mucBangNhau` không so nhóm này nên kiểm riêng, thông điệp rõ ràng.
      errors.push(
        `Block "${id}" mất/đổi "fileKey" so với thư viện hiện hành — manifest ứng viên phải giữ nguyên các block thêm từ web.`,
      );
    }
  }

  const themMoi = [...moi.keys()].filter((id) => !cu.has(id));
  if (themMoi.length === 0) {
    errors.push("Manifest ứng viên không thêm block nào so với thư viện hiện hành.");
  } else if (themMoi.length > 1) {
    errors.push(
      `Manifest ứng viên thêm ${themMoi.length} block (${themMoi.join(", ")}) — mỗi lần chỉ đề xuất đúng 1 block.`,
    );
  } else {
    const themVao = moi.get(themMoi[0]) as BlockManifestEntry;
    if (themVao.blockName.toUpperCase() !== blockName.toUpperCase()) {
      errors.push(
        `Block mới trong manifest tên "${themVao.blockName}" nhưng meta khai "${blockName}" — hai chỗ phải khớp.`,
      );
    }
  }
  return errors;
}

// ── Nhận đề xuất (chạm DB) ───────────────────────────────────────────────────

export type NhanDeXuatKetQua =
  | { status: "invalid"; errors: string[] }
  | {
      status: "conflict";
      loai: "trung-ten" | "stale" | "chua-co-thu-vien";
      message: string;
      versionHienHanh?: string;
    }
  | { status: "created" | "idempotent"; id: number; coPreview: boolean };

type DongDeXuat = {
  id: number;
  block_name: string;
  kind: string;
  system_id: string | null;
  takeoff_item_id: string | null;
  paper_size: string | null;
  note: string | null;
  base_lib_version: string;
  candidate_manifest: BlockLibManifest;
  candidate_storage_key: string;
  candidate_dwg_sha256: string;
  preview_svg: string | null;
  status: string;
  reject_reason: string | null;
  published_version: string | null;
  proposed_by: number;
  nguoi_de_xuat: string | null;
  decided_by: number | null;
  nguoi_quyet_dinh: string | null;
  decided_at: string | null;
  created_at: string | null;
};

export type DeXuatBlock = {
  id: number;
  blockName: string;
  kind: string;
  kindNhan: string;
  systemId: string | null;
  takeoffItemId: string | null;
  paperSize: string | null;
  note: string | null;
  baseLibVersion: string;
  dwgSha256: string;
  previewSvg: string | null;
  status: string;
  statusNhan: string;
  rejectReason: string | null;
  publishedVersion: string | null;
  nguoiDeXuat: string | null;
  nguoiDeXuatId: number;
  nguoiQuyetDinh: string | null;
  decidedAt: string | null;
  createdAt: string | null;
};

function veDeXuat(r: DongDeXuat): DeXuatBlock {
  return {
    id: r.id,
    blockName: r.block_name,
    kind: r.kind,
    kindNhan: NHAN_LOAI_BLOCK[r.kind as LoaiBlock] ?? r.kind,
    systemId: r.system_id,
    takeoffItemId: r.takeoff_item_id,
    paperSize: r.paper_size,
    note: r.note,
    baseLibVersion: r.base_lib_version,
    dwgSha256: r.candidate_dwg_sha256,
    previewSvg: r.preview_svg,
    status: r.status,
    statusNhan: NHAN_TRANG_THAI_DE_XUAT[r.status as TrangThaiDeXuat] ?? r.status,
    rejectReason: r.reject_reason,
    publishedVersion: r.published_version,
    nguoiDeXuat: r.nguoi_de_xuat,
    nguoiDeXuatId: r.proposed_by,
    nguoiQuyetDinh: r.nguoi_quyet_dinh,
    decidedAt: r.decided_at,
    createdAt: r.created_at,
  };
}

const CHON_DE_XUAT = `SELECT p.id, p.block_name, p.kind, p.system_id, p.takeoff_item_id,
                             p.paper_size, p.note, p.base_lib_version, p.candidate_manifest,
                             p.candidate_storage_key, p.candidate_dwg_sha256, p.preview_svg,
                             p.status, p.reject_reason, p.published_version, p.proposed_by,
                             u.name AS nguoi_de_xuat, p.decided_by, d.name AS nguoi_quyet_dinh,
                             p.decided_at, p.created_at
                        FROM cad_block_proposals p
                        LEFT JOIN users u ON u.id = p.proposed_by
                        LEFT JOIN users d ON d.id = p.decided_by`;

/**
 * Nhận một gói đề xuất từ plugin. Thứ tự kiểm bám M103 §3: metadata → toàn vẹn tệp → base version
 * → idempotency → trùng tên → manifest ứng viên → sidecar. Chỉ khi qua hết mới lưu tệp và ghi
 * dòng — không có đề xuất nửa vời.
 */
export async function nhanDeXuat(input: {
  userId: number;
  metaTho: unknown;
  dwg: Buffer;
  dxfText: string;
}): Promise<NhanDeXuatKetQua> {
  // (d) Metadata đủ theo kind — kiểm thuần trước, rẻ nhất.
  const { meta, errors: loiMeta } = docMetaDeXuat(input.metaTho);
  if (!meta) return { status: "invalid", errors: loiMeta };

  // (a) sha256 khai trong meta khớp tệp DWG nộp kèm.
  const hash = createHash("sha256").update(input.dwg).digest("hex");
  if (hash !== meta.sha256) {
    return {
      status: "invalid",
      errors: [
        `sha256 khai trong meta (${meta.sha256.slice(0, 12)}…) không khớp tệp .dwg ứng viên (${hash.slice(0, 12)}…).`,
      ],
    };
  }

  // (e) base_lib_version phải là version hiện hành.
  const hienHanhRow = await layBlockLibHienHanh();
  if (!hienHanhRow) {
    return {
      status: "conflict",
      loai: "chua-co-thu-vien",
      message:
        "Chưa phát hành thư viện block nền nào — Admin/PM phát hành bản nền trước, rồi mới đề xuất thêm block.",
    };
  }
  if (hienHanhRow.version !== meta.baseLibVersion) {
    return {
      status: "conflict",
      loai: "stale",
      message:
        `Thư viện đã sang version ${hienHanhRow.version} trong khi đề xuất dựng trên ${meta.baseLibVersion} — ` +
        `chạy lại lệnh XBOSS_VE_DEXUAT để plugin tải thư viện mới rồi dựng lại ứng viên.`,
      versionHienHanh: hienHanhRow.version,
    };
  }

  // Idempotent theo (block_name, sha256, pending): plugin gửi lại đúng gói này (mất mạng giữa
  // chừng) trả lại dòng cũ thay vì tạo đôi — phải kiểm TRƯỚC luật trùng tên, nếu không chính bản
  // gửi lại sẽ bị chính nó chặn 409.
  const daCo = await queryOne<{ id: number; co_preview: boolean }>(
    `SELECT id, (preview_svg IS NOT NULL) AS co_preview FROM cad_block_proposals
      WHERE upper(block_name) = upper(?) AND candidate_dwg_sha256 = ? AND status = 'pending'`,
    meta.blockName,
    hash,
  );
  if (daCo) return { status: "idempotent", id: daCo.id, coPreview: daCo.co_preview };

  // (c) Trùng tên với thư viện hiện hành hoặc một đề xuất pending khác → 409, bắt đổi tên.
  //     Tên block trong AutoCAD KHÔNG phân biệt hoa thường.
  const { manifest: hienHanh, errors: loiHienHanh } = docManifest(hienHanhRow.manifest);
  if (!hienHanh) {
    return {
      status: "invalid",
      errors: [
        `Manifest của thư viện hiện hành (${hienHanhRow.version}) không đọc được: ${loiHienHanh.join(" · ")}`,
      ],
    };
  }
  if (hienHanh.blocks.some((b) => b.blockName.toUpperCase() === meta.blockName.toUpperCase())) {
    return {
      status: "conflict",
      loai: "trung-ten",
      message: `Thư viện ${hienHanhRow.version} đã có block tên "${meta.blockName}" — đặt tên khác rồi gửi lại.`,
      versionHienHanh: hienHanhRow.version,
    };
  }
  const trungCho = await queryOne<{ id: number }>(
    `SELECT id FROM cad_block_proposals WHERE upper(block_name) = upper(?) AND status = 'pending'`,
    meta.blockName,
  );
  if (trungCho) {
    return {
      status: "conflict",
      loai: "trung-ten",
      message: `Đã có đề xuất #${trungCho.id} đang chờ duyệt cho block tên "${meta.blockName}" — đặt tên khác rồi gửi lại.`,
      versionHienHanh: hienHanhRow.version,
    };
  }

  // (b) Manifest ứng viên hợp lệ (tái dùng nguyên validator phát hành: hash, chữ ký DWG, thuộc
  //     tính theo loại, đối chiếu DXF sidecar) và đúng bằng "hiện hành + 1 entry mới".
  const kiemDinh = kiemDinhManifest(meta.candidateManifest, input.dwg, input.dxfText);
  if (!kiemDinh.ok || !kiemDinh.manifest) {
    return { status: "invalid", errors: kiemDinh.errors };
  }
  const loiSoSanh = soSanhManifestUngVien(hienHanh, kiemDinh.manifest, meta.blockName);
  if (loiSoSanh.length > 0) return { status: "invalid", errors: loiSoSanh };

  // (f) Sidecar DXF phải có định nghĩa block mang đúng tên đó. `kiemDinhManifest` đã phủ luật này
  //     cho MỌI block khai trong manifest; kiểm lại ở đây để (1) thông điệp trỏ đúng block đang
  //     đề xuất và (2) lấy hình học dựng ảnh xem trước.
  let coDinhNghia = false;
  let hinhHoc: DxfEntityRaw[] | undefined;
  try {
    const dxf = parseDxf(input.dxfText);
    const dinhNghia = dxf.blocks.find((b) => b.name.toUpperCase() === meta.blockName.toUpperCase());
    if (dinhNghia) {
      coDinhNghia = true;
      hinhHoc = dinhNghia.entities;
    }
  } catch {
    coDinhNghia = false;
  }
  if (!coDinhNghia) {
    return {
      status: "invalid",
      errors: [
        `DXF sidecar không có định nghĩa block "${meta.blockName}" — xuất lại sidecar từ chính thư viện ứng viên.`,
      ],
    };
  }

  // Ảnh xem trước là best-effort: hỏng thì lưu null, KHÔNG làm hỏng đề xuất (M103 §3).
  let previewSvg: string | null = null;
  try {
    previewSvg = dungPreviewSvg(hinhHoc, meta.blockName);
  } catch {
    previewSvg = null;
  }

  const storageKey = newBlockLibFileName(`dx-${meta.blockName}`);
  await storagePut(ORG_THU_VIEN_BLOCK, storageKey, input.dwg);
  // Sidecar đặt cạnh tệp .dwg cùng quy ước tên như đường phát hành — kiểm định lại được về sau
  // mà không cần AutoCAD.
  await storagePut(
    ORG_THU_VIEN_BLOCK,
    `${storageKey}.sidecar.dxf`,
    Buffer.from(input.dxfText, "utf8"),
  );

  const id = await insertId(
    `INSERT INTO cad_block_proposals
       (block_name, kind, system_id, takeoff_item_id, paper_size, note, base_lib_version,
        candidate_manifest, candidate_storage_key, candidate_dwg_sha256, preview_svg,
        status, proposed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, 'pending', ?)`,
    meta.blockName,
    meta.kind,
    meta.systemId,
    meta.takeoffItemId,
    meta.paperSize,
    meta.note,
    meta.baseLibVersion,
    JSON.stringify(kiemDinh.manifest),
    storageKey,
    hash,
    previewSvg,
    input.userId,
  );
  return { status: "created", id, coPreview: previewSvg !== null };
}

// ── Đọc danh sách ────────────────────────────────────────────────────────────

/**
 * Hàng chờ + lịch sử đề xuất. `chiNguoiDeXuat` khác `undefined` thì chỉ trả đề xuất của người đó
 * (engineer chỉ thấy của mình — Admin/PM thấy tất cả, ranh giới quyền do route quyết).
 */
export async function layDanhSachDeXuat(opts?: {
  status?: string;
  chiNguoiDeXuat?: number;
  limit?: number;
}): Promise<DeXuatBlock[]> {
  const dieuKien: string[] = [];
  const thamSo: unknown[] = [];
  if (opts?.status && (TRANG_THAI_DE_XUAT as readonly string[]).includes(opts.status)) {
    dieuKien.push(`p.status = ?`);
    thamSo.push(opts.status);
  }
  if (opts?.chiNguoiDeXuat !== undefined) {
    dieuKien.push(`p.proposed_by = ?`);
    thamSo.push(opts.chiNguoiDeXuat);
  }
  const where = dieuKien.length > 0 ? ` WHERE ${dieuKien.join(" AND ")}` : "";
  const rows = await query<DongDeXuat>(
    `${CHON_DE_XUAT}${where} ORDER BY p.id DESC LIMIT ?`,
    ...thamSo,
    Math.min(Math.max(opts?.limit ?? 100, 1), 500),
  );
  return rows.map(veDeXuat);
}

// ── Tải tệp ứng viên (bổ sung — người duyệt đang duyệt "mù", chỉ có preview SVG best-effort) ──

export type LayTepUngVienKetQua =
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "missing-file" }
  | { status: "ok"; blockName: string; sha256: string; buf: Buffer };

/**
 * Đọc tệp .dwg ứng viên của một đề xuất (`candidate_storage_key`) — cho người duyệt/chính người
 * đề xuất tải về đối chiếu trước khi Duyệt & Phát Hành, thay vì chỉ tin ảnh xem trước SVG dựng
 * best-effort từ sidecar DXF. Quyền do caller (route) tự quyết định qua `coQuyenDuyet`
 * (`CAN.approve`) — hàm này chỉ so thêm `proposed_by` khi không có quyền duyệt.
 */
export async function layTepUngVien(input: {
  id: number;
  userId: number;
  coQuyenDuyet: boolean;
}): Promise<LayTepUngVienKetQua> {
  const dx = await queryOne<{
    block_name: string;
    candidate_storage_key: string;
    candidate_dwg_sha256: string;
    proposed_by: number;
  }>(
    `SELECT block_name, candidate_storage_key, candidate_dwg_sha256, proposed_by
       FROM cad_block_proposals WHERE id = ?`,
    input.id,
  );
  if (!dx) return { status: "not-found" };
  if (!input.coQuyenDuyet && dx.proposed_by !== input.userId) return { status: "forbidden" };

  // `candidate_storage_key` luôn do server sinh lúc `nhanDeXuat` (không nhận từ input client) —
  // đọc thẳng qua storageGet, không ghép chuỗi/đường dẫn nào từ tham số route.
  const buf = await storageGet(ORG_THU_VIEN_BLOCK, dx.candidate_storage_key);
  if (!buf) return { status: "missing-file" };
  return { status: "ok", blockName: dx.block_name, sha256: dx.candidate_dwg_sha256, buf };
}

// ── Duyệt / từ chối ──────────────────────────────────────────────────────────

export type QuyetDinhKetQua =
  | { status: "not-found" }
  | { status: "conflict"; loai: "stale" | "khong-cho-duyet"; message: string }
  | { status: "approved"; version: string; libId: number }
  | { status: "rejected" };

/**
 * Duyệt = phát hành: chép nguyên gói ứng viên thành version thư viện mới. Toàn bộ nằm trong 1
 * transaction, khoá dòng đề xuất (`FOR UPDATE`) để hai người duyệt cùng lúc không phát hành đôi.
 * Re-check `base_lib_version` ngay trước khi ghi — lệch thì đánh dấu `stale` và 409 (AC4).
 */
export async function duyetDeXuat(input: {
  id: number;
  userId: number;
}): Promise<Exclude<QuyetDinhKetQua, { status: "rejected" }>> {
  return withTransaction(async () => {
    // Khoá advisory theo bảng thư viện: 2 giao dịch duyệt song song sẽ xếp hàng, giao dịch sau
    // đọc được version vừa phát hành → rơi đúng nhánh 409 stale thay vì nổ UNIQUE(version) 500.
    await run(`SELECT pg_advisory_xact_lock(hashtext('cad_block_libs'))`);
    const dx = await queryOne<{
      id: number;
      status: string;
      base_lib_version: string;
      candidate_manifest: BlockLibManifest;
      candidate_storage_key: string;
      candidate_dwg_sha256: string;
    }>(
      `SELECT id, status, base_lib_version, candidate_manifest, candidate_storage_key,
              candidate_dwg_sha256
         FROM cad_block_proposals WHERE id = ? FOR UPDATE`,
      input.id,
    );
    if (!dx) return { status: "not-found" };
    if (dx.status !== "pending") {
      return {
        status: "conflict",
        loai: "khong-cho-duyet",
        message: `Đề xuất #${dx.id} không còn ở trạng thái chờ duyệt (đang "${NHAN_TRANG_THAI_DE_XUAT[dx.status as TrangThaiDeXuat] ?? dx.status}").`,
      };
    }

    const hienHanh = await layBlockLibHienHanh();
    if (!hienHanh || hienHanh.version !== dx.base_lib_version) {
      await run(`UPDATE cad_block_proposals SET status = 'stale' WHERE id = ?`, dx.id);
      return {
        status: "conflict",
        loai: "stale",
        message:
          `Thư viện đã sang version ${hienHanh?.version ?? "(chưa có)"} trong khi đề xuất dựng trên ` +
          `${dx.base_lib_version} — đề xuất đã đánh dấu lỗi thời, người đề xuất chạy lại lệnh XBOSS_VE_DEXUAT.`,
      };
    }

    const versionMoi = await versionPhatHanhKeTiep(hienHanh.version);
    // Nhãn version nằm trong CẢ cột `version` lẫn manifest (plugin đọc `manifest.version` sau khi
    // tải về) — đồng bộ hai chỗ, nếu không client sẽ tưởng cache còn mới.
    const manifest: BlockLibManifest = {
      ...dx.candidate_manifest,
      version: versionMoi,
      dwgSha256: dx.candidate_dwg_sha256,
    };
    const libId = await ghiSoBlockLib({
      version: versionMoi,
      manifest,
      storageKey: dx.candidate_storage_key,
      dwgSha256: dx.candidate_dwg_sha256,
      userId: input.userId,
    });
    await run(
      `UPDATE cad_block_proposals
          SET status = 'approved', published_version = ?, decided_by = ?, decided_at = now()
        WHERE id = ?`,
      versionMoi,
      input.userId,
      dx.id,
    );
    return { status: "approved", version: versionMoi, libId };
  });
}

/** Từ chối một đề xuất — lý do bắt buộc (người đề xuất cần biết phải sửa gì). */
export async function tuChoiDeXuat(input: {
  id: number;
  userId: number;
  reason: string;
}): Promise<Exclude<QuyetDinhKetQua, { status: "approved" }>> {
  const lyDo = input.reason.trim();
  const kq = await run(
    `UPDATE cad_block_proposals
        SET status = 'rejected', reject_reason = ?, decided_by = ?, decided_at = now()
      WHERE id = ? AND status = 'pending'`,
    lyDo,
    input.userId,
    input.id,
  );
  if (kq.changes > 0) return { status: "rejected" };

  const dx = await queryOne<{ status: string }>(
    `SELECT status FROM cad_block_proposals WHERE id = ?`,
    input.id,
  );
  if (!dx) return { status: "not-found" };
  return {
    status: "conflict",
    loai: "khong-cho-duyet",
    message: `Đề xuất #${input.id} không còn ở trạng thái chờ duyệt (đang "${NHAN_TRANG_THAI_DE_XUAT[dx.status as TrangThaiDeXuat] ?? dx.status}").`,
  };
}

// ── Thu hồi (người đề xuất tự rút lại) ───────────────────────────────────────

export type ThuHoiKetQua =
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "conflict"; message: string }
  | { status: "withdrawn" };

/**
 * Người gửi đề xuất tự thu hồi đề xuất SAI của chính mình, khi còn `pending` (Admin/PM vẫn dùng
 * `tuChoiDeXuat` như cũ để từ chối đề xuất của người khác kèm lý do). UPDATE điều kiện
 * `proposed_by`+`status` là 1 câu lệnh nguyên tử (CAS) — không cần transaction/khoá riêng, cùng
 * cách `tuChoiDeXuat` đang làm.
 */
export async function thuHoiDeXuat(input: { id: number; userId: number }): Promise<ThuHoiKetQua> {
  const kq = await run(
    `UPDATE cad_block_proposals
        SET status = 'withdrawn', decided_by = ?, decided_at = now()
      WHERE id = ? AND proposed_by = ? AND status = 'pending'`,
    input.userId,
    input.id,
    input.userId,
  );
  if (kq.changes > 0) return { status: "withdrawn" };

  const dx = await queryOne<{ status: string; proposed_by: number }>(
    `SELECT status, proposed_by FROM cad_block_proposals WHERE id = ?`,
    input.id,
  );
  if (!dx) return { status: "not-found" };
  if (dx.proposed_by !== input.userId) return { status: "forbidden" };
  return {
    status: "conflict",
    message: `Đề xuất #${input.id} không còn ở trạng thái chờ duyệt (đang "${NHAN_TRANG_THAI_DE_XUAT[dx.status as TrangThaiDeXuat] ?? dx.status}") — không thu hồi được.`,
  };
}

// ===== block-them-web.ts =====
// M104 — thêm block vào thư viện THẲNG từ web (không qua hàng chờ duyệt của M103).
/**
 * Vì sao đường này tồn tại song song với M103: đề xuất từ AutoCAD (M103) dựng sẵn cả "thư viện
 * ứng viên" (blocks.dwg gộp) nên phải qua bước duyệt; còn từ web, người dùng chỉ có **một block
 * lẻ** (.dwg + .dxf cùng nội dung). Máy chủ không chạy AutoCAD → không gộp được vào tệp nền, nên
 * mô hình thư viện chuyển sang **đa tệp** (M104 §1): entry manifest mang `fileKey` trỏ tới tệp
 * `.dwg` riêng của chính block đó, tệp nền `blocks.dwg` giữ nguyên (cả `storage_key` lẫn
 * `dwg_sha256` của version mới đều chép từ version hiện hành).
 *
 * Kiểm định tái dùng nguyên vẹn M103/M100 — `docMetaBlockCoBan` (luật metadata theo kind),
 * `kiemThuocTinhTheoLoai` (thuộc tính bắt buộc theo loại), `parseDxf`, `dungPreviewSvg` — và ghi
 * sổ qua đúng `ghiSoBlockLib` như hai đường phát hành kia: một chỗ sửa, ba đường cùng đúng.
 *
 * Nguyên tử: toàn bộ bước phát hành nằm trong 1 transaction có `pg_advisory_xact_lock` trên
 * `cad_block_libs` (cùng khoá với đường duyệt M103) — hai lượt thêm song song xếp hàng, lượt sau
 * đọc được manifest vừa phát hành nên nối tiếp version thay vì đè mất block của lượt trước. Mọi
 * lỗi sau khi đã ghi tệp đều dọn tệp lại, không để tệp mồ côi trong kho lưu trữ.
 */

export type ThemBlockKetQua =
  | { status: "invalid"; errors: string[] }
  | {
      status: "conflict";
      loai: "trung-ten" | "chua-co-thu-vien";
      message: string;
      versionHienHanh?: string;
    }
  | { status: "created"; version: string; libId: number; coPreview: boolean };

/**
 * Khoá advisory theo TẦNG thư viện (M113 §6): tầng toàn cục giữ nguyên chuỗi khoá cũ để vẫn xếp
 * hàng cùng đường duyệt đề xuất M103; mỗi dự án một khoá riêng nên hai dự án không chặn nhau.
 */
function khoaTang(projectId?: number): string {
  return projectId === undefined ? "cad_block_libs" : `cad_block_libs:${projectId}`;
}

/**
 * Thêm một block vào thư viện hiện hành và phát hành ngay version mới (M104 §2).
 *
 * Thứ tự kiểm bám đặc tả: metadata đủ theo kind → tệp .dwg đúng định dạng → DXF parse được và có
 * định nghĩa block đúng tên → thuộc tính bắt buộc theo loại → (trong khoá) chưa có thư viện nền /
 * trùng tên → lưu tệp + phát hành. Các bước thuần đứng trước để giữ khoá ngắn nhất có thể.
 */
export async function themBlockTuWeb(input: {
  userId: number;
  metaTho: unknown;
  dwg: Buffer;
  dxfText: string;
  /** M113 §6 — thêm vào bộ **của dự án này**; vắng = bộ toàn cục, y hệt hôm nay (guardrail 1). */
  projectId?: number;
}): Promise<ThemBlockKetQua> {
  const { meta, errors: loiMeta } = docMetaBlockCoBan(input.metaTho);
  if (!meta) return { status: "invalid", errors: loiMeta };

  // Chỉ soi 4 byte chữ ký ("AC10.." — mọi đời DWG từ R14 tới 2026), KHÔNG đọc nội dung (M100 §12).
  // Bắt đúng lỗi thật hay gặp: kéo nhầm bản .dxf vào ô .dwg.
  if (input.dwg.subarray(0, 4).toString("ascii") !== "AC10") {
    return {
      status: "invalid",
      errors: [
        "Tệp nộp ở ô .dwg không mang chữ ký DWG — lưu block sang định dạng DWG rồi nộp lại (bản DXF nộp ở ô còn lại).",
      ],
    };
  }

  // Định nghĩa block phải có thật trong bản DXF kèm theo — đây là thứ duy nhất máy chủ đọc được.
  let hinhHoc: DxfEntityRaw[] | undefined;
  let coDinhNghia = false;
  try {
    const dxf = parseDxf(input.dxfText);
    const dinhNghia = dxf.blocks.find((b) => b.name.toUpperCase() === meta.blockName.toUpperCase());
    if (dinhNghia) {
      coDinhNghia = true;
      hinhHoc = dinhNghia.entities;
    }
  } catch (e) {
    return {
      status: "invalid",
      errors: [`Không parse được tệp .dxf: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
  if (!coDinhNghia) {
    return {
      status: "invalid",
      errors: [
        `Tệp .dxf không có định nghĩa block "${meta.blockName}" — kiểm lại tên block, hoặc xuất DXF từ chính bản vẽ chứa block đó.`,
      ],
    };
  }

  const hash = createHash("sha256").update(input.dwg).digest("hex");
  // Ảnh xem trước là best-effort (M103 §3): hỏng thì entry không có `previewSvg`, KHÔNG chặn thêm.
  let previewSvg: string | null = null;
  try {
    previewSvg = dungPreviewSvg(hinhHoc, meta.blockName);
  } catch {
    previewSvg = null;
  }

  const fileKey = newBlockLibFileName(`blk${meta.blockName}`);
  let daLuuTep = false;

  // Bộ toàn cục hiện hành: đọc TRƯỚC transaction để kiểm xung đột tên block khi thêm vào bộ dự án
  // (M113 §4) — bộ toàn cục không đổi trong lúc thêm block cho một dự án.
  const toanCucRow = input.projectId === undefined ? null : await layBlockLibHienHanh();

  const than = async (): Promise<ThemBlockKetQua> => {
    // Cùng khoá với đường duyệt đề xuất (M103) — hai đường phát hành không bao giờ chạy chồng.
    // M113: khoá tách theo TẦNG, bộ toàn cục và bộ của dự án A không chặn nhau (chuỗi khoá của
    // tầng toàn cục giữ nguyên để vẫn xếp hàng với đường duyệt M103).
    await run(`SELECT pg_advisory_xact_lock(hashtext(?))`, khoaTang(input.projectId));

    const hienHanhRow = await layBlockLibHienHanh(input.projectId);
    if (!hienHanhRow) {
      return {
        status: "conflict",
        loai: "chua-co-thu-vien",
        message:
          input.projectId === undefined
            ? "Chưa phát hành thư viện block nền nào — Admin/PM phát hành bản nền trước, rồi mới thêm block từ web."
            : "Dự án này chưa phát hành bộ block riêng nào — phát hành bộ nền của dự án trước, rồi mới thêm block lẻ.",
      };
    }
    const { manifest: hienHanh, errors: loiHienHanh } = docManifest(hienHanhRow.manifest);
    if (!hienHanh) {
      return {
        status: "invalid",
        errors: [
          `Manifest của thư viện hiện hành (${hienHanhRow.version}) không đọc được: ${loiHienHanh.join(" · ")}`,
        ],
      };
    }

    // Trùng tên với thư viện hiện hành hoặc một đề xuất M103 đang chờ duyệt → bắt đổi tên.
    // Tên block trong AutoCAD KHÔNG phân biệt hoa thường.
    if (hienHanh.blocks.some((b) => b.blockName.toUpperCase() === meta.blockName.toUpperCase())) {
      return {
        status: "conflict",
        loai: "trung-ten",
        message: `Thư viện ${hienHanhRow.version} đã có block tên "${meta.blockName}" — đặt tên khác rồi thêm lại.`,
        versionHienHanh: hienHanhRow.version,
      };
    }
    // M113 §4/FR3 — block thêm vào bộ dự án không được trùng TÊN với block của bộ toàn cục
    // (id sinh mới nên chắc chắn khác id ⇒ hai định nghĩa cùng tên trong một bản vẽ).
    const xungDotToanCuc = kiemXungDotBlockName(
      [{ id: "", blockName: meta.blockName, kind: meta.kind }],
      toanCucRow,
    );
    if (xungDotToanCuc.length > 0) {
      return {
        status: "conflict",
        loai: "trung-ten",
        message: `Bộ toàn cục ${toanCucRow?.version} đã có block tên "${meta.blockName}" — đặt tên khác rồi thêm lại.`,
        versionHienHanh: hienHanhRow.version,
      };
    }
    const trungCho = await queryOne<{ id: number }>(
      `SELECT id FROM cad_block_proposals WHERE upper(block_name) = upper(?) AND status = 'pending'`,
      meta.blockName,
    );
    if (trungCho) {
      return {
        status: "conflict",
        loai: "trung-ten",
        message: `Đã có đề xuất #${trungCho.id} đang chờ duyệt cho block tên "${meta.blockName}" — đặt tên khác rồi thêm lại.`,
        versionHienHanh: hienHanhRow.version,
      };
    }

    // `attributes` lấy từ chính ATTDEF trong DXF (không có ô nhập nào cho người dùng gõ tay) —
    // nhờ vậy thẻ khai trong manifest luôn khớp thẻ có thật trong block.
    const thuocTinh = thuocTinhTuDxf(hinhHoc);
    const entry: BlockManifestEntry = {
      id: idTuTenBlock(meta.blockName, new Set(hienHanh.blocks.map((b) => b.id))),
      blockName: meta.blockName,
      kind: meta.kind,
      system: meta.systemId ?? undefined,
      attributes: thuocTinh.length > 0 ? thuocTinh : undefined,
      takeoffItemId: meta.takeoffItemId ?? undefined,
      paper: meta.paperSize ?? undefined,
      fileKey,
      fileSha256: hash,
      previewSvg: previewSvg ?? undefined,
    };
    const loiThuocTinh: string[] = [];
    kiemThuocTinhTheoLoai(entry, loiThuocTinh);
    if (loiThuocTinh.length > 0) return { status: "invalid", errors: loiThuocTinh };

    // Tệp lẻ + bản DXF kèm (đặt cạnh nhau cùng quy ước tên như hai đường phát hành kia, để
    // kiểm định lại được về sau mà không cần AutoCAD).
    await storagePut(ORG_THU_VIEN_BLOCK, fileKey, input.dwg);
    daLuuTep = true;
    await storagePut(
      ORG_THU_VIEN_BLOCK,
      `${fileKey}.sidecar.dxf`,
      Buffer.from(input.dxfText, "utf8"),
    );

    const versionMoi = await versionPhatHanhKeTiep(hienHanhRow.version, input.projectId);
    // Tệp nền KHÔNG đổi: `storage_key`/`dwg_sha256` (và `manifest.dwgSha256`) chép nguyên của
    // version hiện hành — plugin đang cache tệp nền theo hash sẽ không phải tải lại.
    const manifestMoi: BlockLibManifest = {
      ...hienHanh,
      version: versionMoi,
      dwgSha256: hienHanhRow.dwgSha256,
      blocks: [...hienHanh.blocks, entry],
    };
    const libId = await ghiSoBlockLib({
      version: versionMoi,
      manifest: manifestMoi,
      storageKey: hienHanhRow.storageKey,
      dwgSha256: hienHanhRow.dwgSha256,
      userId: input.userId,
      projectId: input.projectId,
    });
    return { status: "created", version: versionMoi, libId, coPreview: previewSvg !== null };
  };

  try {
    return input.projectId === undefined
      ? await withTransaction<ThemBlockKetQua>(than)
      : await withProjectScope<ThemBlockKetQua>(input.projectId, than, { readOnly: false });
  } catch (e) {
    // Transaction đã rollback → dòng thư viện không tồn tại; dọn nốt tệp vừa ghi để không mồ côi.
    if (daLuuTep) {
      await storageDelete(ORG_THU_VIEN_BLOCK, fileKey).catch(() => {});
      await storageDelete(ORG_THU_VIEN_BLOCK, `${fileKey}.sidecar.dxf`).catch(() => {});
    }
    throw e;
  }
}

export type BlockLeTrongThuVien = { version: string; entry: BlockManifestEntry };

/**
 * Tra một tệp block lẻ theo `fileKey` (M104 §2 — `GET /api/engineering/cad/block-lib?file=`).
 *
 * Chỉ trả về khi khoá **có mặt trong manifest của một version** — đó là hàng rào chặn việc đọc
 * tệp tuỳ ý trong kho lưu trữ; khuôn tên cũng được kiểm trước để không truy vấn khoá rác.
 */
export async function timBlockLeTheoKhoa(
  fileKey: string,
  opts?: { projectId?: number; libVersion?: string },
): Promise<BlockLeTrongThuVien | null> {
  if (!fileKey || !laKhoaTepBlockHopLe(fileKey)) return null;
  // M113 §6 — tìm trong ĐÚNG tầng: không có dự án ⇒ bộ toàn cục (tương thích ngược, plugin bản cũ);
  // có dự án ⇒ chỉ các bộ của dự án đó. `libVersion` (tuỳ chọn) khoá thêm về đúng bộ chứa block.
  const row = await queryOne<{ version: string; manifest: BlockLibManifest }>(
    `SELECT version, manifest FROM cad_block_libs
      WHERE manifest -> 'blocks' @> ?::jsonb
        AND project_id IS NOT DISTINCT FROM ?
        AND (?::text IS NULL OR version = ?::text)
      ORDER BY id DESC LIMIT 1`,
    JSON.stringify([{ fileKey }]),
    opts?.projectId ?? null,
    opts?.libVersion ?? null,
    opts?.libVersion ?? null,
  );
  if (!row) return null;
  const entry = (row.manifest?.blocks ?? []).find((b) => b.fileKey === fileKey);
  return entry ? { version: row.version, entry } : null;
}

/** Nội dung tệp `.dwg` lẻ — `null` khi tệp đã mất trên kho lưu trữ. */
export async function docTepBlockLe(fileKey: string): Promise<Buffer | null> {
  return storageGet(ORG_THU_VIEN_BLOCK, fileKey);
}
