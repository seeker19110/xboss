// Hạ tầng test cho ROUTE HANDLER — gọi handler thật thay vì đoán nó làm gì.
//
// VÌ SAO CẦN: route handler gọi `getCurrentUser()` / `getCurrentProjectId()`, hai hàm này đọc
// cookie qua `next/headers`. Ngoài request scope của Next, `cookies()` ném lỗi, nên trước đây
// test route trong repo phải né bằng một trong hai cách — tái hiện lại câu SQL của route trong
// test, hoặc `assert.match` trên MÃ NGUỒN route (grep chuỗi "status: 403"). Cả hai đều KHÔNG
// thực thi route: chúng không bắt được lỗi thật trong route, và không đóng góp coverage nào cho
// hơn 450 file `app/api/**/route.ts`. Chúng cũng dễ mục ruỗng — grep vẫn xanh khi logic đã sai.
//
// Cách làm ở đây: mock `next/headers` một lần cho cả tiến trình test, rồi ký cookie phiên THẬT
// bằng chính `makeToken()` của sản phẩm. Nghĩa là toàn bộ đường xác thực (chữ ký HMAC, pwFrag,
// session_version, orgId trong token) vẫn chạy đúng như production — chỉ thay đúng lớp vận
// chuyển cookie. Sai chữ ký, đổi mật khẩu hay thu hồi phiên vẫn cho 401 y như thật.
//
// Cờ `--experimental-test-module-mocks` đã bật sẵn cho mọi tiến trình test (scripts/test-flags.mjs).
import { mock } from "node:test";
import { COOKIE, makeToken } from "@/lib/bao-mat/session-token";

/** Cookie chọn dự án — khớp PROJECT_COOKIE của lib/ha-tang/projects.ts. */
export const COOKIE_DU_AN = "xboss_project";

/** Kho cookie hiện tại của "phiên" đang giả lập. Đổi qua dangNhap/dangXuat/datCookie. */
const kho = new Map<string, string>();

/** Header hiện tại (vd x-request-id do middleware gắn thật). */
const headerHienTai = new Map<string, string>();

// mock.module chỉ đặt được MỘT LẦN cho mỗi module trong một tiến trình, nên mock ngay khi
// helper được import và điều khiển nội dung qua hai Map ở trên.
mock.module("next/headers", {
  namedExports: {
    cookies: async () => ({
      get: (ten: string) => (kho.has(ten) ? { name: ten, value: kho.get(ten)! } : undefined),
      getAll: () => [...kho].map(([name, value]) => ({ name, value })),
      has: (ten: string) => kho.has(ten),
      set: (ten: string, gia: string) => void kho.set(ten, gia),
      delete: (ten: string) => void kho.delete(ten),
    }),
    headers: async () => ({
      get: (ten: string) => headerHienTai.get(ten.toLowerCase()) ?? null,
      has: (ten: string) => headerHienTai.has(ten.toLowerCase()),
    }),
  },
});

export type NguoiDungTest = {
  id: number;
  passwordHash: string;
  sessionVersion?: number;
  orgId?: number;
  mustSetup2fa?: boolean;
};

/**
 * Đặt cookie phiên đã KÝ THẬT cho user — mọi lời gọi handler sau đó chạy dưới danh nghĩa user đó.
 * `projectId` (tuỳ chọn) đặt luôn cookie chọn dự án.
 */
export function dangNhap(user: NguoiDungTest, projectId?: number | null): void {
  kho.set(
    COOKIE,
    makeToken(
      user.id,
      user.passwordHash,
      user.mustSetup2fa ?? false,
      user.sessionVersion ?? 0,
      user.orgId ?? 1,
    ),
  );
  if (projectId != null) kho.set(COOKIE_DU_AN, String(projectId));
  else kho.delete(COOKIE_DU_AN);
}

/** Xoá sạch phiên — dùng để kiểm nhánh 401 "chưa đăng nhập" của route. */
export function dangXuat(): void {
  kho.clear();
  headerHienTai.clear();
}

/** Đặt một cookie tuỳ ý (vd token hỏng để kiểm nhánh từ chối). */
export function datCookie(ten: string, gia: string): void {
  kho.set(ten, gia);
}

/** Đặt header cho lời gọi kế tiếp (vd x-request-id). */
export function datHeader(ten: string, gia: string): void {
  headerHienTai.set(ten.toLowerCase(), gia);
}
