// Ngữ cảnh của request hiện tại (ai/vai trò/dự án/request-id), giữ qua AsyncLocalStorage.
// Mục đích: để withTransaction (lib/db) truyền actor xuống Postgres bằng SET LOCAL, nhờ đó
// trigger audit (migration 0049) ghi được ai đã thay đổi — MỘT điểm chạm duy nhất, không
// phải sửa từng route (xem docs/nang-cap/M43-audit-trail.md).
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  userId?: number;
  role?: string;
  projectId?: number;
  requestId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Chạy fn với một ngữ cảnh request mới. Dùng trong test hoặc khi muốn bọc tường minh. */
export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run({ ...ctx }, fn);
}

/** Ngữ cảnh request hiện tại (undefined nếu chưa thiết lập). */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

// Cập nhật ngữ cảnh request hiện tại — getCurrentUser()/getCurrentProjectId() gọi.
// Nếu chưa có store (App Router không có middleware Node bọc mọi route handler trong một
// runWithRequestContext), dùng enterWith để thiết lập store cho nhánh async hiện tại trở đi.
// Mỗi lần xử lý request là một async context riêng nên store không rò rỉ sang request khác.
export function patchRequestContext(patch: Partial<RequestContext>): void {
  const store = storage.getStore();
  if (store) {
    Object.assign(store, patch);
  } else {
    storage.enterWith({ ...patch });
  }
}
