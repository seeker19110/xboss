// Đặt ở tầng nền (lib/nen) vì đây là so sánh THUẦN trên nhãn tầng, không chạm DB, và được
// dùng từ nhiều miền (tien-do, khoi-luong, UI) — để ở lib/tien-do sẽ tạo chu trình miền
// khoi-luong → tien-do → khoi-luong (ADR-0007, npm run check:lib-layers).
// Thứ tự tầng dùng chung cho sort dropdown lọc tầng + ma trận dashboard.
// RF (tầng mái) cao nhất, tầng số theo giá trị, B_nF (hầm) âm theo độ sâu —
// parseInt("RF")/"B1F" = NaN nên không thể sort trực tiếp bằng parseInt.
export function floorOrder(f: string): number {
  const up = f.toUpperCase();
  if (up === "RF") return 9999;
  if (up.startsWith("B")) return -parseInt(up.slice(1)) || -1; // B1F → -1, B2F → -2
  return parseInt(f) || 0;
}

export const sortFloorsAsc = (a: string, b: string): number => floorOrder(a) - floorOrder(b);
export const sortFloorsDesc = (a: string, b: string): number => floorOrder(b) - floorOrder(a);
