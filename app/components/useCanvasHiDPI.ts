"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Chuẩn hoá phần thiết lập `<canvas>` dùng chung cho các trình xem 2D
 * (`/engineering/spatial-viewer`) — audit 2026-08-25 §3.7, đề xuất #8.
 *
 * VÌ SAO không gộp thành một component viewer chung: ba trang vẽ ba thứ khác hẳn nhau
 * (đẳng trục 3D xoay/zoom, mặt bằng 2D pan/zoom cắm ghim, camera yaw/pitch). Phần thật sự
 * TRÙNG chỉ là mấy dòng thiết lập canvas — và chính mấy dòng đó đang SAI giống nhau ở cả ba:
 *
 *  1. Canvas khai kích thước cố định (`width={800} height={550}`) nhưng CSS kéo giãn
 *     `h-full w-full` → hình mờ trên mọi màn hình HiDPI (tức mọi điện thoại).
 *  2. Không nhân `devicePixelRatio` → mờ thêm một bậc nữa.
 *  3. Toạ độ chuột tính từ `getBoundingClientRect()` (đơn vị CSS) rồi dùng thẳng làm toạ độ
 *     canvas. Khi bề rộng hiển thị khác bề rộng khai báo — gần như luôn luôn — điểm bấm
 *     lệch. Ở `spatial-viewer` lỗi này làm **ghim hiện trường cắm sai chỗ**.
 *
 * Hook trả về:
 *  - `size`: kích thước LOGIC (CSS px) để code vẽ dùng thay cho `canvas.width/height`
 *    (sau khi nhân DPR thì `canvas.width` là pixel thiết bị, không còn dùng để tính bố cục).
 *  - `toCanvasCoords(e)`: đổi toạ độ chuột sang **toạ độ logic của canvas**, đã tính cả
 *    trường hợp CSS scale — dùng cho mọi phép bắt điểm.
 *
 * Context đã được `setTransform(dpr,…)` sẵn mỗi lần đổi kích thước, nên code vẽ cứ vẽ theo
 * toạ độ logic như thường.
 */
export function useCanvasHiDPI(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  logicalSize: { width: number; height: number },
) {
  const [size, setSize] = useState(logicalSize);
  // Giữ tỉ lệ khung để tính lại chiều cao khi bề rộng container đổi.
  const tyLe = useRef(logicalSize.height / logicalSize.width);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dat = () => {
      const cha = canvas.parentElement;
      const rongCss = cha?.clientWidth || logicalSize.width;
      // Container có chiều cao cố định (vd `h-[480px]`) thì bám theo nó; không thì suy ra
      // từ tỉ lệ khung ban đầu để không bóp méo hình.
      const caoCha = cha?.clientHeight ?? 0;
      const caoCss = caoCha > 0 ? caoCha : Math.round(rongCss * tyLe.current);
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(rongCss * dpr);
      canvas.height = Math.round(caoCss * dpr);
      canvas.style.width = `${rongCss}px`;
      canvas.style.height = `${caoCss}px`;

      const ctx = canvas.getContext("2d");
      // Vẽ theo toạ độ LOGIC; DPR chỉ nằm trong ma trận biến đổi.
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

      setSize({ width: rongCss, height: caoCss });
    };

    dat();
    // Container co giãn theo bố cục (sidebar mở/đóng, xoay điện thoại) chứ không chỉ theo
    // cửa sổ, nên theo dõi bằng ResizeObserver thay vì sự kiện `resize`.
    const theoDoi = new ResizeObserver(dat);
    if (canvas.parentElement) theoDoi.observe(canvas.parentElement);
    return () => theoDoi.disconnect();
  }, [canvasRef, logicalSize.width, logicalSize.height]);

  /** Toạ độ chuột → toạ độ LOGIC của canvas (không phải pixel thiết bị). */
  const toCanvasCoords = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      // rect là kích thước HIỂN THỊ; size là kích thước logic đang vẽ. Bình thường hai cái
      // bằng nhau, nhưng nếu CSS ngoài kéo giãn thêm thì tỉ lệ này giữ điểm bấm đúng chỗ.
      const heSoX = rect.width > 0 ? size.width / rect.width : 1;
      const heSoY = rect.height > 0 ? size.height / rect.height : 1;
      return { x: (e.clientX - rect.left) * heSoX, y: (e.clientY - rect.top) * heSoY };
    },
    [canvasRef, size.width, size.height],
  );

  return { size, toCanvasCoords };
}
