// Helvetica mặc định của @react-pdf/renderer chỉ có bảng mã WinAnsi — không hiển thị được
// dấu tiếng Việt (chữ bị vỡ ký tự khi export). Đăng ký DejaVu Sans (giấy phép Bitstream Vera,
// tự do phân phối — xem assets/fonts/LICENSE.txt) phủ đủ Unicode tiếng Việt.
import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

export const FONT_REGULAR = "DejaVu";
export const FONT_BOLD = "DejaVu-Bold";

let registered = false;

export function registerVietnameseFonts() {
  if (registered) return;
  const dir = join(process.cwd(), "assets", "fonts");
  Font.register({ family: FONT_REGULAR, src: join(dir, "DejaVuSans-Regular.ttf") });
  Font.register({ family: FONT_BOLD, src: join(dir, "DejaVuSans-Bold.ttf") });
  registered = true;
}
