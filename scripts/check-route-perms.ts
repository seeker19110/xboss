// scripts/check-route-perms.ts — Cổng CI: chặn route ghi (POST/PATCH/PUT/DELETE) quên kiểm
// quyền. Lớp lỗi "route mới quên kiểm quyền" đã lặp ≥3 đợt audit (lần gần nhất: 14 file dưới
// `app/api/engineering/**`). Xem lý do đầy đủ + heuristic trong `scripts/lib/route-perms-scan.ts`.
//
// Chạy: npx tsx scripts/check-route-perms.ts
//  - THOÁT 1 (đỏ) nếu có handler ghi không tham chiếu bất kỳ cơ chế kiểm quyền nào đã biết
//    (CAN., canTouchTask, canTouchPackage, requireApiKey, isAdminOrPm, can*/require*(...),
//    so sánh .role trực tiếp) và không nằm trong WHITELIST.
import { timRoutePermViPham } from "./lib/route-perms-scan";

// key = "<đường dẫn thư mục route tính từ app/api>:<METHOD>". Mỗi mục PHẢI kèm lý do cụ thể —
// đã đọc từng file trước khi thêm, không whitelist cho tiện. Route MỚI rơi vào một trong các
// mẫu dưới vẫn phải tự thêm mục whitelist kèm lý do, không được "ăn theo" mục có sẵn.
const WHITELIST: Record<string, string> = {
  // ── Auth: nơi CẤP/THU HỒI phiên — chưa có phiên nên không có "quyền" để kiểm trước đó.
  "auth/login:POST": "Đăng nhập — cấp phiên, chưa có user để kiểm quyền.",
  "auth/login/2fa:POST": "Bước 2 của đăng nhập 2FA — cấp phiên, chưa có user để kiểm quyền.",
  "auth/logout:POST": "Đăng xuất — thu hồi phiên của chính mình, không cần kiểm vai trò.",
  "auth/password:PATCH": "Đổi mật khẩu của chính mình sau khi đã getCurrentUser() xác thực phiên.",
  "auth/totp/setup:POST": "Bật 2FA cho chính tài khoản đang đăng nhập.",
  "auth/totp/confirm:POST": "Xác nhận mã 2FA cho chính tài khoản đang đăng nhập.",
  "auth/totp:DELETE": "Tắt 2FA cho chính tài khoản đang đăng nhập.",

  // ── Ghép thiết bị AutoCAD (M99 PR2 — OAuth device flow): 2 bước TIỀN-xác-thực của plugin,
  // theo thiết kế không có phiên/token nào để kiểm (như auth/login). Bảo vệ bằng rate limit
  // theo IP (hitRateLimit) + bí mật device_code 256-bit chỉ lưu hash; quyền thật sự kiểm ở
  // bước confirm (session + CAN.manageDrawings) — không duyệt thì claim không bao giờ ra key.
  "devices/pair:POST": "Plugin xin mã ghép — chưa có gì để xác thực; rate limit IP 10/15'.",
  "devices/pair/claim:POST":
    "Plugin poll bằng device_code bí mật (DB chỉ giữ sha256) — key chỉ sinh SAU khi kỹ sư " +
    "duyệt qua confirm (CAN.manageDrawings); rate limit IP 300/15'.",

  // ── Webhook công khai: xác thực bằng secret/chữ ký riêng, không đi qua phiên đăng nhập
  // (đúng tiền lệ whitelist của tests/engineering-project-scope-invariant.test.ts).
  "telegram/webhook:POST":
    "Webhook công khai từ Telegram Bot API — xác thực bằng secret token qua " +
    "xacThucWebhookTelegram() (lib/bao-mat/webhook-inbound.ts), không có phiên đăng nhập.",
  "zalo/webhook:POST":
    "Webhook công khai từ Zalo OA — xác thực bằng chữ ký HMAC qua xacThucWebhookZalo() " +
    "(lib/bao-mat/webhook-inbound.ts), không có phiên đăng nhập.",
  "admin/traffic/ingest:POST":
    "Endpoint nội bộ giữa Edge middleware và Node runtime (ghi ring buffer traffic) — xác " +
    "thực bằng header bí mật nội bộ qua safeEqual(token, trafficToken()), không dùng phiên.",

  // ── Tự-phục vụ (self-service): route chỉ đọc/ghi đúng dữ liệu của CHÍNH user đang đăng
  // nhập (khoá theo user.id/userId trong WHERE), không có đường leo quyền hay đụng dữ liệu
  // người khác — getCurrentUser() (401 khi chưa đăng nhập) là đủ, không cần vai trò cụ thể.
  "notifications/[id]/read:PATCH":
    "Đánh dấu đã đọc — UPDATE có WHERE id = ? AND user_id = ?, chỉ tác động thông báo của " +
    "chính mình.",
  "notifications/prefs:PATCH": "Sửa tuỳ chọn thông báo của chính mình (khoá theo user_id).",
  "notifications:POST": "markAllRead — chỉ UPDATE thông báo WHERE user_id = ? của chính mình.",
  "presence:POST": "Heartbeat của chính user đang mở app, không ghi dữ liệu người khác.",
  "push/subscribe:POST": "Đăng ký thiết bị nhận push của chính mình (upsert theo user.id).",
  "push/subscribe:DELETE":
    "Huỷ đăng ký — DELETE có WHERE endpoint = ? AND user_id = ?, chỉ thiết bị của chính mình.",
  "telegram/link-otp:POST": "Sinh OTP liên kết Telegram cho chính tài khoản đang đăng nhập.",
  "telegram/simulate-voice:POST":
    "Trang giả lập chạy dưới phiên đăng nhập thật, tự đảm bảo binding cho chính user gọi " +
    "(mockChatId = 88880000 + user.id) — không tác động tài khoản/thiết bị khác. Có kiểm " +
    "phạm vi dự án qua chotProjectIdChoGhi (đã sửa ở W2.2), chỉ thiếu kiểm vai trò vì mọi " +
    "vai trò đã đăng nhập đều được thử tính năng giả lập của chính mình.",
  "zalo/link-otp:POST": "Sinh OTP liên kết Zalo cho chính tài khoản đang đăng nhập.",
  "zalo/simulate-action:POST":
    "Trang giả lập chạy dưới phiên đăng nhập thật, processIncomingZaloMessage() chỉ xử lý " +
    "Zalo ID đã liên kết & xác thực của chính user gọi — không tác động tài khoản khác.",
  "engineering/zero-error/challenge:POST":
    "Xác minh mã thử thách do chính user sinh (challenge ràng buộc theo user.id trong " +
    "generateFieldDynamicChallenge/verifyFieldProofChallenge) — không có đường leo quyền.",

  // ── Đã kiểm quyền, chỉ khác tên hàm so với 4 mẫu chính thức của cổng này.
  "project/select:POST":
    "Có kiểm quyền thật: đối chiếu projectId với visibleProjectIds(user), trả 403 nếu " +
    "không nằm trong danh sách dự án user được thấy — chỉ khác tên hàm so với CAN.*.",

  // ── Thiết kế nghiệp vụ cố ý mở cho mọi vai trò đã đăng nhập (không phải lỗ hổng).
  "ncrs:POST":
    "Ghi nhận điểm không phù hợp (NCR) mở cho MỌI vai trò đã đăng nhập theo đúng comment " +
    "trong route — ai phát hiện lỗi hiện trường cũng phải báo được, không giới hạn vai trò.",
};

console.log("=== Kiểm route ghi có kiểm quyền (app/api/**) ===");

const viPham = timRoutePermViPham().filter((v) => !(`${v.key}:${v.method}` in WHITELIST));

if (viPham.length) {
  console.error(`\n[LỖI] ${viPham.length} handler ghi không tham chiếu cơ chế kiểm quyền nào:`);
  for (const v of viPham) console.error(`  - app/api/${v.key}/route.ts  ${v.method}`);
  console.error(
    "\nThêm CAN.<quyền>(user.role) (hoặc canTouchTask/canTouchPackage/requireApiKey) trước khi " +
      "ghi dữ liệu, hoặc bổ sung mục WHITELIST trong scripts/check-route-perms.ts kèm lý do " +
      "cụ thể nếu route thật sự không cần (auth/webhook có xác thực riêng/tự-phục vụ).",
  );
  process.exit(1);
}

// Whitelist không có mục thừa — route đã hết lý do (sửa xong hoặc xoá) phải gỡ khỏi danh sách.
const tatCaViPhamThoBoWhitelist = timRoutePermViPham();
const thua = Object.keys(WHITELIST).filter((key) => {
  const i = key.lastIndexOf(":");
  const routeKey = key.slice(0, i);
  const method = key.slice(i + 1);
  return !tatCaViPhamThoBoWhitelist.some((v) => v.key === routeKey && v.method === method);
});
if (thua.length) {
  console.error(`\n[LỖI] WHITELIST có mục đã hết lý do (route hiện đã tự kiểm quyền) — gỡ:`);
  for (const k of thua) console.error(`  - ${k}`);
  process.exit(1);
}

console.log(
  `\n[OK] Mọi handler ghi đều kiểm quyền hoặc nằm trong WHITELIST có lý do (${
    Object.keys(WHITELIST).length
  } mục).`,
);
