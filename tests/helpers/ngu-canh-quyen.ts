// Chạy hàm dịch vụ trong ngữ cảnh quyền giống request thật đã qua `getCurrentUser()`.
//
// Từ đợt vá D01 (PR #544), `CAN.x(role)` chỉ dùng mặc định khi snapshot quyền đã được nạp
// cho đúng actor/org trong request hiện tại; thiếu snapshot thì từ chối (fail-closed). Test
// gọi thẳng service (không qua route) phải dựng lại đúng hai bước đó, nếu không mọi quyền
// đều là false và test kiểm nhầm một trạng thái không xảy ra ở production.
import { runWithRequestContext } from "@/lib/nen/request-context";
import { invalidatePermissionCache } from "@/lib/bao-mat/permissions";
import type { Role } from "@/lib/nen/roles";

export type ActorQuyen = { id: number; role: Role; orgId: number };

export function chayVoiQuyen<T>(
  actor: ActorQuyen,
  projectId: number | null,
  fn: () => Promise<T>,
): Promise<T> {
  return runWithRequestContext(
    { userId: actor.id, role: actor.role, orgId: actor.orgId, projectId: projectId ?? undefined },
    async () => {
      await invalidatePermissionCache(actor.orgId);
      return fn();
    },
  );
}
