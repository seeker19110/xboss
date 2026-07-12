const MAX_EDGE = 1600;
const QUALITY = 0.82;

// Nén ảnh chụp hiện trường trước khi upload: resize theo cạnh dài tối đa rồi chuyển
// sang WebP ngay trên trình duyệt — giảm dung lượng đáng kể mà vẫn đủ nét để nhận
// dạng ở thumbnail. Trả về file gốc nếu không phải ảnh, trình duyệt không hỗ trợ,
// nén lỗi, hoặc kết quả nén không nhỏ hơn bản gốc — không bao giờ chặn việc upload.
export async function compressImageToWebp(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], newName, { type: "image/webp" });
  } catch {
    return file;
  }
}
