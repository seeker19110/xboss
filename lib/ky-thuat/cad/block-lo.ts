// lib/ky-thuat/cad/block-lo.ts — M108 PR1: NHẬN một lô block ứng viên (từ tệp tổng hợp) vào hàng
// chờ, và PHÁT HÀNH lô đã duyệt thành một version thư viện mới.
//
// Quan hệ với hai đường nạp đã có:
//   • M103 (`block-proposals.ts`) — 1 block/lần, plugin dựng sẵn gói ứng viên, có hàng chờ duyệt.
//   • M104 (`block-them-web.ts`)  — 1 block/lần từ web, phát hành thẳng, mô hình ĐA TỆP.
//   • M108 (tệp này)             — N block/lần, LUÔN qua hàng chờ duyệt (M108 §2 O3: không block
//     nào vào thư viện mà không qua mắt người).
//
// Tệp này tái dùng nguyên vẹn phần kiểm định + ghi sổ của `block-lib.ts` (`docManifest`,
// `kiemThuocTinhTheoLoai`, `ghiSoBlockLib`, `versionPhatHanhKeTiep`) và cùng advisory lock với hai
// đường kia — một chỗ sửa, ba đường cùng đúng.
import { query, queryOne, run, insertId, withTransaction } from "@/lib/db";
import { parseDxf, type DxfEntityRaw } from "@/lib/ky-thuat/cad/dxf-parser";
import { dungPreviewSvg } from "@/lib/ky-thuat/cad/block-preview-svg";
import {
  docManifest,
  kiemThuocTinhTheoLoai,
  ghiSoBlockLib,
  layBlockLibHienHanh,
  versionPhatHanhKeTiep,
  LOAI_BLOCK,
  type BlockLibManifest,
  type BlockManifestEntry,
  type LoaiBlock,
} from "@/lib/ky-thuat/cad/block-lib";
import {
  phanLoaiTheoLuat,
  type KetQuaPhanLoai,
  type NguonQuyetDinh,
  type UngVienBlock,
} from "@/lib/ky-thuat/cad/block-phan-loai-luat";

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

type DongDb = {
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

function veDong(r: DongDb): DongLo {
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
  const dong = await query<DongDb>(
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
      await query<DongDb>(
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
