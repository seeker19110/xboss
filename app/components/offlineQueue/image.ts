// Nén ảnh phía client trước khi xếp hàng offline: resize cạnh dài xuống ~1920px qua
// <canvas> rồi mã hoá JPEG. Server đằng nào cũng giới hạn 10MB/ảnh (lib/photos.ts
// MAX_PHOTO_BYTES) nên nén trước vừa đỡ chiếm hạn mức hàng đợi, vừa gửi nhanh hơn khi
// có mạng lại. Chỉ chạy phía trình duyệt.
const MAX_EDGE = 1920;
const JPEG_QUALITY = 0.82;

// Trả blob đã nén + mime; lỗi giải mã/không có canvas → trả nguyên blob gốc (không chặn
// người dùng, server vẫn kiểm mime/size cuối cùng).
export async function compressImage(
  file: Blob,
  maxEdge: number = MAX_EDGE,
  quality: number = JPEG_QUALITY,
): Promise<{ blob: Blob; mime: string }> {
  const fallbackMime = file.type || "image/jpeg";
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (longest > maxEdge) {
      const scale = maxEdge / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return { blob: file, mime: fallbackMime };
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    // Nén xong to hơn gốc (ảnh đã nhỏ/đã nén tốt) → giữ gốc.
    if (out && out.size < file.size) return { blob: out, mime: "image/jpeg" };
    return { blob: file, mime: fallbackMime };
  } catch {
    return { blob: file, mime: fallbackMime };
  }
}
