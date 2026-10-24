// Index thuần cho ô tầng × công tác. Giữ row đầu tiên như Array.find, không sao chép DTO.
export function buildWorkFrontIndex<T extends { floorLabel: string; stageId: number }>(
  fronts: readonly T[],
): Map<string, Map<number, T>> {
  const byFloor = new Map<string, Map<number, T>>();
  for (const front of fronts) {
    let byStage = byFloor.get(front.floorLabel);
    if (!byStage) {
      byStage = new Map<number, T>();
      byFloor.set(front.floorLabel, byStage);
    }
    if (!byStage.has(front.stageId)) byStage.set(front.stageId, front);
  }
  return byFloor;
}
