import { stageMissingList } from "@/lib/tien-do/constructionStages";

// Gợi ý EOT cho claim (miền tài chính) từ số ngày chờ mặt bằng (miền tiến độ) — logic ≥ 2 miền
// nên đặt ở lib/dich-vu (ADR-0008). Trước đây nằm ở lib/tai-chinh/claims.ts và dynamic-import
// lib/tien-do, tạo chu trình tien-do ↔ tai-chinh mà check:lib-layers không bắt (AUD-ARCH-001).

export type EotEvidenceSuggestion = { suggestedDays: number; waitingFloors: number };

// Tái dùng số ngày chờ mặt bằng luỹ kế (stageMissingList — cùng công thức dashboard/notification
// stage_missing, model tầng×công tác M46). Chỉ là GỢI Ý — người dùng tự nhập số cuối. `projectId`
// BẮT BUỘC (AUDIT-S16 null-scope: null từng làm stageMissingList chạy toàn hệ, cộng mọi tổ chức).
export async function eotEvidenceSuggestion(projectId: number): Promise<EotEvidenceSuggestion> {
  const items = await stageMissingList(projectId);
  return {
    suggestedDays: items.reduce((sum, it) => sum + it.waitingDays, 0),
    waitingFloors: items.length,
  };
}
