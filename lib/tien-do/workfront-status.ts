// Hằng số/kiểu thuần của mặt bằng thi công (M14) — KHÔNG import `@/lib/db` để client
// component dùng được mà không kéo `pg` vào bundle. `workfronts.ts` re-export lại.

export const WORK_FRONT_STATUSES = ["pending", "handed_over", "in_progress", "returned"] as const;
export type WorkFrontStatus = (typeof WORK_FRONT_STATUSES)[number];
export const WORK_FRONT_STATUS_LABEL: Record<WorkFrontStatus, string> = {
  pending: "Chưa bàn giao",
  handed_over: "Đã bàn giao",
  in_progress: "Đang thi công",
  returned: "Đã trả",
};

// Thứ tự tuần tự hợp lệ — chỉ Admin được nhảy ngược (sửa sai).
export const STEP_ORDER: Record<WorkFrontStatus, number> = {
  pending: 0,
  handed_over: 1,
  in_progress: 2,
  returned: 3,
};

export function isForwardTransition(from: WorkFrontStatus, to: WorkFrontStatus): boolean {
  return STEP_ORDER[to] >= STEP_ORDER[from];
}
