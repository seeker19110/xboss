// lib/ky-thuat/engineering-workflow-states.ts — hằng số THUẦN (không chạm DB) của máy trạng
// thái workflow ENG-3 (§11 docs/nang-cap/ENG-3-engineering-workflow-os.md), tách khỏi
// engineering-workflow.ts để component client (`app/engineering/*`) import được nhãn/quy tắc
// chuyển trạng thái mà không kéo `pg` vào bundle (CLAUDE.md — client không import module có
// `@/lib/db`). `engineering-workflow.ts` re-export lại từ đây để mọi caller cũ không đổi.

// ---------- §11 State machine ----------

export const WORKFLOW_STATES = [
  "draft",
  "validating",
  "awaiting_approval",
  "approved",
  "executing",
  "validating_result",
  "completed",
  "rejected",
  "cancelled",
  "blocked",
  "failed",
  "rolled_back",
  "superseded",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const WORKFLOW_STATE_LABELS: Record<WorkflowState, string> = {
  draft: "Nháp",
  validating: "Đang kiểm tự động",
  awaiting_approval: "Chờ duyệt",
  approved: "Đã duyệt",
  executing: "Đang thực hiện",
  validating_result: "Đang kiểm kết quả",
  completed: "Hoàn thành",
  rejected: "Bị từ chối",
  cancelled: "Đã huỷ",
  blocked: "Bị chặn",
  failed: "Thất bại",
  rolled_back: "Đã hoàn tác",
  superseded: "Bị thay thế",
};

export const ALLOWED_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  draft: ["validating", "cancelled"],
  validating: ["awaiting_approval", "blocked", "cancelled"],
  awaiting_approval: ["approved", "rejected", "cancelled", "blocked"],
  approved: ["executing", "cancelled", "superseded"],
  executing: ["validating_result", "failed"],
  validating_result: ["completed", "failed"],
  completed: [],
  rejected: [],
  cancelled: [],
  blocked: ["validating", "cancelled"],
  failed: ["rolled_back", "cancelled"],
  rolled_back: [],
  superseded: [],
};

export function canTransition(from: WorkflowState, to: WorkflowState): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}
