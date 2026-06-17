// CPM (Critical Path Method) ở cấp nhóm việc.
// Đầu vào: các nút có thời lượng (ngày) + cạnh phụ thuộc Finish-to-Start.
// Forward pass tính ES/EF, backward pass tính LS/LF → total float → đường găng (float ≈ 0).
// Đồ thị đã được đảm bảo không vòng lặp khi tạo phụ thuộc, nhưng vẫn topo bằng Kahn cho an toàn.

export type CpmNode = { id: number; duration: number };
export type CpmEdge = { id: number; predecessorId: number; successorId: number };

export type CpmResult = {
  criticalNodes: Set<number>; // id nhóm trên đường găng
  criticalEdges: Set<number>; // id cạnh phụ thuộc trên đường găng (việc trước ràng buộc trực tiếp việc sau)
  float: Map<number, number>; // độ trễ cho phép (ngày) của từng nhóm
};

const EPS = 0.5; // dung sai ngày để coi là "căng" (zero float)

export function computeCpm(nodes: CpmNode[], edges: CpmEdge[]): CpmResult {
  const dur = new Map<number, number>(nodes.map((n) => [n.id, Math.max(n.duration, 0)]));
  const ids = [...dur.keys()];

  const succ = new Map<number, CpmEdge[]>();
  const pred = new Map<number, CpmEdge[]>();
  const indeg = new Map<number, number>(ids.map((i) => [i, 0]));
  const degree = new Map<number, number>(ids.map((i) => [i, 0]));

  const validEdges = edges.filter((e) => dur.has(e.predecessorId) && dur.has(e.successorId));
  for (const e of validEdges) {
    (succ.get(e.predecessorId) ?? succ.set(e.predecessorId, []).get(e.predecessorId)!).push(e);
    (pred.get(e.successorId) ?? pred.set(e.successorId, []).get(e.successorId)!).push(e);
    indeg.set(e.successorId, (indeg.get(e.successorId) ?? 0) + 1);
    degree.set(e.predecessorId, (degree.get(e.predecessorId) ?? 0) + 1);
    degree.set(e.successorId, (degree.get(e.successorId) ?? 0) + 1);
  }

  // Không có phụ thuộc nào → không có "đường găng" có nghĩa.
  if (validEdges.length === 0)
    return { criticalNodes: new Set(), criticalEdges: new Set(), float: new Map() };

  // Topo (Kahn) — bỏ qua nút còn kẹt nếu lỡ có vòng (không nên xảy ra).
  const order: number[] = [];
  const q = ids.filter((i) => (indeg.get(i) ?? 0) === 0);
  const indegW = new Map(indeg);
  while (q.length) {
    const n = q.shift()!;
    order.push(n);
    for (const e of succ.get(n) ?? []) {
      indegW.set(e.successorId, (indegW.get(e.successorId) ?? 0) - 1);
      if ((indegW.get(e.successorId) ?? 0) === 0) q.push(e.successorId);
    }
  }

  // Forward: ES = max EF việc trước; EF = ES + duration.
  const ES = new Map<number, number>(), EF = new Map<number, number>();
  for (const n of order) {
    let es = 0;
    for (const e of pred.get(n) ?? []) es = Math.max(es, EF.get(e.predecessorId) ?? 0);
    ES.set(n, es);
    EF.set(n, es + (dur.get(n) ?? 0));
  }

  const projectEnd = Math.max(0, ...[...EF.values()]);

  // Backward: LF = min LS việc sau (nút cuối = projectEnd); LS = LF - duration.
  const LS = new Map<number, number>(), LF = new Map<number, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i];
    const outs = succ.get(n) ?? [];
    let lf = outs.length === 0 ? projectEnd : Infinity;
    for (const e of outs) lf = Math.min(lf, LS.get(e.successorId) ?? projectEnd);
    LF.set(n, lf);
    LS.set(n, lf - (dur.get(n) ?? 0));
  }

  const float = new Map<number, number>();
  const criticalNodes = new Set<number>();
  for (const n of ids) {
    const fl = (LS.get(n) ?? 0) - (ES.get(n) ?? 0);
    float.set(n, Math.round(fl * 10) / 10);
    // Đường găng: float ≈ 0 và nút có ít nhất 1 phụ thuộc (loại nút cô lập).
    if (fl <= EPS && (degree.get(n) ?? 0) > 0) criticalNodes.add(n);
  }

  // Cạnh găng: cả hai đầu đều găng và việc trước ràng buộc trực tiếp việc sau (EF≈ES).
  const criticalEdges = new Set<number>();
  for (const e of validEdges) {
    if (criticalNodes.has(e.predecessorId) && criticalNodes.has(e.successorId)
      && Math.abs((EF.get(e.predecessorId) ?? 0) - (ES.get(e.successorId) ?? 0)) <= EPS)
      criticalEdges.add(e.id);
  }

  return { criticalNodes, criticalEdges, float };
}
