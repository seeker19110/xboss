"use client";
import { useCallback, useState } from "react";
import { normalizeRect, type Rect } from "@/lib/tien-do/grid";

// Chọn vùng chữ nhật trên lưới (M121 FR2) — dùng chung, không biết gì về dữ liệu bên trong ô.
// Toạ độ là (hàng, cột) theo thứ tự HIỂN THỊ; lớp gọi tự ánh xạ sang dữ liệu của mình.
//
// Dùng Pointer Events chứ không Mouse Events: một đường code chạy cả chuột lẫn ngón tay, thay
// vì viết hai nhánh rồi lệch nhau. `SpreadsheetGrid` (component cũ) chỉ có mouse nên không
// chọn vùng được trên điện thoại — mà điện thoại mới là nơi kỹ sư tick ngoài công trường.

export type ViTri = { r: number; c: number };

/** Chạm giữ bao lâu thì vào chế độ chọn trên cảm ứng (M121 D1, chốt 2026-09-03). */
export const NGUONG_CHAM_GIU_MS = 400;

export function useVungChon() {
  const [neo, setNeo] = useState<ViTri | null>(null);
  const [dau, setDau] = useState<ViTri | null>(null);
  const [dangKeo, setDangKeo] = useState(false);

  const vung: Rect | null = neo && dau ? normalizeRect(neo, dau) : null;

  const batDau = useCallback((r: number, c: number) => {
    setNeo({ r, c });
    setDau({ r, c });
    setDangKeo(true);
  }, []);

  // Kéo tới ô khác — chỉ có tác dụng khi đang trong một lượt kéo, để rê chuột ngang lưới lúc
  // không chọn gì không vô tình tạo vùng.
  const keoToi = useCallback(
    (r: number, c: number) => {
      if (!dangKeo) return;
      setDau({ r, c });
    },
    [dangKeo],
  );

  const ketThucKeo = useCallback(() => setDangKeo(false), []);

  // Shift+click: giữ neo, dời đầu kia — mở rộng vùng đang có. Chưa có neo thì coi như bấm thường.
  const moRongToi = useCallback((r: number, c: number) => {
    setNeo((n) => n ?? { r, c });
    setDau({ r, c });
  }, []);

  const chonTatCa = useCallback((soHang: number, soCot: number) => {
    if (soHang <= 0 || soCot <= 0) return;
    setNeo({ r: 0, c: 0 });
    setDau({ r: soHang - 1, c: soCot - 1 });
    setDangKeo(false);
  }, []);

  const boChon = useCallback(() => {
    setNeo(null);
    setDau(null);
    setDangKeo(false);
  }, []);

  const oTrongVung = useCallback(
    (r: number, c: number) =>
      !!vung && r >= vung.r0 && r <= vung.r1 && c >= vung.c0 && c <= vung.c1,
    [vung],
  );

  return { vung, dangKeo, batDau, keoToi, ketThucKeo, moRongToi, chonTatCa, boChon, oTrongVung };
}
