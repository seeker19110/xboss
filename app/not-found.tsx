import { FileQuestion } from "lucide-react";
import { ButtonLink } from "@/app/components/ui";

// Trang 404 riêng của app. Trước đây không có file này nên Next dùng trang 404 mặc định:
// nền TRẮNG cắm cứng, trong khi footer/nền của app vẫn theo theme đang chọn — chữ zinc-400
// trên nền trắng chỉ đạt 1,6-2,6:1 (axe bắt "serious" ở mọi theme tối). Trang này dùng
// đúng token theme nên hợp lệ ở cả 5 giao diện.
export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <FileQuestion className="w-12 h-12 text-zinc-400" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="text-lg font-semibold">Không tìm thấy trang</h1>
      <p className="text-sm text-zinc-400 max-w-sm">
        Đường dẫn bạn mở không tồn tại hoặc đã đổi. Kiểm tra lại liên kết, hoặc quay về trang chủ để
        đi tiếp từ menu.
      </p>
      <ButtonLink href="/" variant="primary">
        Về trang chủ
      </ButtonLink>
    </main>
  );
}
