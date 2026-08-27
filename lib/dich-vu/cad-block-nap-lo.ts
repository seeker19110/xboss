// lib/dich-vu/cad-block-nap-lo.ts — M108 PR2: điểm vào DUY NHẤT của việc nạp một lô block.
//
// Ở tầng 5 vì nối cỗ máy phân loại (`cad-block-phan-loai.ts`, có chạm `nen/ai`) với lớp ghi hàng
// chờ ở miền `ky-thuat` (`block-lo.ts`). Route HTTP chỉ gọi hàm này rồi bọc `NextResponse` — không
// tự ghép hai mảnh, để hai đường nạp (plugin/web) không bao giờ lệch nhau.
import { docManifest, layBlockLibHienHanh } from "@/lib/ky-thuat/cad/block-lib";
import {
  locUngVien,
  nhanLoBlock,
  TRAN_BLOCK_MOI_LO,
  type NhanLoKetQua,
  type UngVienLo,
} from "@/lib/ky-thuat/cad/block-lo";
import { phanLoaiLo } from "@/lib/dich-vu/cad-block-phan-loai";
import type { KetQuaPhanLoai } from "@/lib/ky-thuat/cad/block-phan-loai-luat";

export type NapLoKetQua = NhanLoKetQua & { lyDoAiKhongChay?: string | null };

/**
 * Nạp lô: lọc ứng viên → phân loại 4 tầng → ghi hàng chờ.
 *
 * Phân loại chạy TRƯỚC transaction (gọi mạng, có thể lâu) — trong transaction chỉ còn việc ghi.
 * Đổi lại, phần lọc trùng tên với thư viện vẫn nằm trong transaction của `nhanLoBlock` (phải đọc
 * dưới khoá mới đúng), nên vài dòng có thể bị bỏ qua SAU khi đã tốn công phân loại. Chấp nhận:
 * giữ transaction ngắn quan trọng hơn tiết kiệm một ít token.
 */
export async function napLoBlock(input: {
  userId: number;
  nguon: "plugin" | "web";
  ungViens: readonly UngVienLo[];
  candidateStorageKey?: string;
  candidateDwgSha256?: string;
}): Promise<NapLoKetQua> {
  // Chỉ phân loại phần chắc chắn sẽ vào lô — block ẩn danh/layout/trùng trong tệp thì bỏ ngay,
  // không tốn token.
  const { giuLai } = locUngVien(input.ungViens);
  // Chặn vượt trần TRƯỚC khi phân loại: gọi mô hình cho 600 block rồi mới từ chối lô là đốt tiền
  // vô ích. `nhanLoBlock` vẫn kiểm lại — nó là hàng rào thật, đây chỉ là lối ra sớm cho rẻ.
  if (giuLai.length > TRAN_BLOCK_MOI_LO) {
    return {
      status: "invalid",
      errors: [
        `Tệp có ${giuLai.length} block nạp được (trong ${input.ungViens.length} định nghĩa), vượt trần ` +
          `${TRAN_BLOCK_MOI_LO} block một lô — tách tệp rồi nạp lại.`,
      ],
    };
  }

  // Block đã có trong thư viện là "mẫu đối chiếu cách đặt tên của chính dự án này" — tín hiệu tốt
  // nhất cho tầng 2. Thư viện chưa có thì cỗ máy vẫn chạy, chỉ kém chính xác hơn.
  const hienHanhRow = await layBlockLibHienHanh();
  const blocksDaCo = hienHanhRow ? (docManifest(hienHanhRow.manifest).manifest?.blocks ?? []) : [];

  const { ketQua, aiDaChay, lyDoKhongChay } = await phanLoaiLo(giuLai, blocksDaCo);

  const theoTen = new Map<string, KetQuaPhanLoai>();
  giuLai.forEach((u, i) => theoTen.set(u.blockName.toUpperCase(), ketQua[i]));

  const kq = await nhanLoBlock({ ...input, phanLoai: theoTen, aiDaChay });
  return { ...kq, lyDoAiKhongChay: lyDoKhongChay };
}
