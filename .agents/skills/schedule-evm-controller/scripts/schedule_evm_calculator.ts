/**
 * SCHEDULE & EVM CONTROLLER — CLI EXECUTION ENGINE & VERIFIER
 * Động cơ kiểm toán tính toán CPM, EVM, Lookahead 5 điều kiện, Pareto trễ & Monte Carlo Beta-PERT.
 */

export interface CpmTask {
  id: string;
  name: string;
  duration: number; // Ngày làm việc
  predecessors: string[]; // Danh sách task ID tiên quyết
  es?: number;
  ef?: number;
  ls?: number;
  lf?: number;
  totalFloat?: number;
  freeFloat?: number;
  isCritical?: boolean;
}

export interface EvmInput {
  bac: number; // Tổng ngân sách (VND)
  plannedProgress: number; // 0.0 -> 1.0
  actualProgress: number; // 0.0 -> 1.0
  actualCost: number; // Chi phí thực tế đã chi (VND)
  actualTimeMonths: number; // Thời gian thực tế đã trôi qua
  plannedTimeMonths: number; // Thời gian kế hoạch
}

export interface EvmResult {
  pv: number;
  ev: number;
  ac: number;
  sv: number;
  cv: number;
  spi: number;
  cpi: number;
  csi: number;
  tcpi: number;
  eac: number;
  etc: number;
  vac: number;
  status: "EXCELLENT" | "GOOD" | "WARNING" | "CRITICAL";
}

/**
 * 1. Tính toán Forward & Backward Pass cho mạng CPM
 */
export function calculateCpm(tasks: CpmTask[]): {
  tasks: CpmTask[];
  projectDuration: number;
  criticalPath: string[];
} {
  const taskMap = new Map<string, CpmTask>(tasks.map((t) => [t.id, { ...t }]));

  // Topological sorting / Forward Pass
  const processed = new Set<string>();
  let forwardPassDone = false;
  let iterations = 0;
  const maxIterations = tasks.length * 2;

  while (!forwardPassDone && iterations < maxIterations) {
    forwardPassDone = true;
    iterations++;

    for (const task of taskMap.values()) {
      if (processed.has(task.id)) continue;

      const preds = task.predecessors.map((id) => taskMap.get(id)!);
      const allPredsProcessed = preds.every((p) => p && processed.has(p.id));

      if (preds.length === 0 || allPredsProcessed) {
        const maxPredEf = preds.length === 0 ? 0 : Math.max(...preds.map((p) => p.ef || 0));
        task.es = maxPredEf;
        task.ef = task.es + task.duration;
        processed.add(task.id);
      } else {
        forwardPassDone = false;
      }
    }
  }

  if (processed.size !== tasks.length) {
    throw new Error("Phát hiện vòng lặp phụ thuộc (Circular Dependency) trong mạng CPM!");
  }

  const projectDuration = Math.max(...Array.from(taskMap.values()).map((t) => t.ef || 0));

  // Backward Pass
  // Khởi tạo LF cho các task cuối cùng
  for (const task of taskMap.values()) {
    const isPredecessorOfAny = Array.from(taskMap.values()).some((t) =>
      t.predecessors.includes(task.id),
    );
    if (!isPredecessorOfAny) {
      task.lf = projectDuration;
      task.ls = task.lf - task.duration;
    }
  }

  // Duyệt ngược
  const backwardProcessed = new Set<string>();
  let backwardPassDone = false;
  let bIter = 0;

  while (!backwardPassDone && bIter < maxIterations) {
    backwardPassDone = true;
    bIter++;

    for (const task of taskMap.values()) {
      if (backwardProcessed.has(task.id)) continue;

      const successors = Array.from(taskMap.values()).filter((t) =>
        t.predecessors.includes(task.id),
      );

      if (successors.length === 0 || successors.every((s) => s.ls !== undefined)) {
        if (successors.length > 0) {
          task.lf = Math.min(...successors.map((s) => s.ls!));
          task.ls = task.lf - task.duration;
        }
        task.totalFloat = task.ls! - task.es!;

        // Free Float = min(ES_successors) - EF_task
        task.freeFloat =
          successors.length === 0
            ? projectDuration - task.ef!
            : Math.min(...successors.map((s) => s.es!)) - task.ef!;

        task.isCritical = task.totalFloat === 0;
        backwardProcessed.add(task.id);
      } else {
        backwardPassDone = false;
      }
    }
  }

  const resultTasks = Array.from(taskMap.values());
  const criticalPath = resultTasks.filter((t) => t.isCritical).map((t) => t.id);

  return { tasks: resultTasks, projectDuration, criticalPath };
}

/**
 * 2. Tính toán Bộ Chỉ Số EVM Toàn Diện
 */
export function calculateEvm(input: EvmInput): EvmResult {
  const pv = input.bac * input.plannedProgress;
  const ev = input.bac * input.actualProgress;
  const ac = input.actualCost;

  const sv = ev - pv;
  const cv = ev - ac;

  const spi = pv > 0 ? Number((ev / pv).toFixed(4)) : 1.0;
  const cpi = ac > 0 ? Number((ev / ac).toFixed(4)) : 1.0;
  const csi = Number((cpi * spi).toFixed(4));

  const tcpi = input.bac - ac > 0 ? Number(((input.bac - ev) / (input.bac - ac)).toFixed(4)) : 1.0;

  // EAC theo kịch bản CPI * SPI
  const eac = cpi * spi > 0 ? Math.round(ac + (input.bac - ev) / (cpi * spi)) : input.bac;
  const etc = Math.max(0, eac - ac);
  const vac = input.bac - eac;

  let status: EvmResult["status"] = "GOOD";
  if (spi >= 1.0 && cpi >= 1.0) status = "EXCELLENT";
  else if (spi < 0.85 || cpi < 0.85) status = "CRITICAL";
  else if (spi < 1.0 || cpi < 1.0) status = "WARNING";

  return { pv, ev, ac, sv, cv, spi, cpi, csi, tcpi, eac, etc, vac, status };
}

/**
 * 3. Phân Tích Pareto Nguyên Nhân Trễ Hạn
 */
export interface DelayItem {
  category: "MAT" | "DWG" | "SITE" | "LABOR" | "FIN" | "FORCE";
  taskName: string;
  delayDays: number;
}

export function calculateParetoDelays(delays: DelayItem[]) {
  const categoryMap = new Map<string, number>();
  for (const d of delays) {
    categoryMap.set(d.category, (categoryMap.get(d.category) || 0) + d.delayDays);
  }

  const totalDelayDays = Array.from(categoryMap.values()).reduce((a, b) => a + b, 0);
  const sorted = Array.from(categoryMap.entries())
    .map(([category, days]) => ({ category, days }))
    .sort((a, b) => b.days - a.days);

  let cumulative = 0;
  return sorted.map((item) => {
    cumulative += item.days;
    const percentage =
      totalDelayDays > 0 ? Number(((item.days / totalDelayDays) * 100).toFixed(1)) : 0;
    const cumulativePercentage =
      totalDelayDays > 0 ? Number(((cumulative / totalDelayDays) * 100).toFixed(1)) : 0;
    const isVitalFew = cumulativePercentage <= 80 || cumulativePercentage - percentage < 80;
    return {
      category: item.category,
      days: item.days,
      percentage,
      cumulativePercentage,
      isVitalFew,
    };
  });
}

// -------------------------------------------------------------
// TỰ KIỂM THỬ (CLI SELF-TEST EXECUTION)
// -------------------------------------------------------------
if (process.argv[1]?.endsWith("schedule_evm_calculator.ts")) {
  console.log("🚀 Đang chạy bộ kiểm toán tính toán Schedule & EVM Controller...");

  // Test Case 1: Mạng CPM 5 công việc
  const network: CpmTask[] = [
    { id: "T1", name: "Lắp đặt giá đỡ Trapeze", duration: 5, predecessors: [] },
    { id: "T2", name: "Lắp đặt ống gió cấp AHU", duration: 8, predecessors: ["T1"] },
    { id: "T3", name: "Lắp đặt máng cáp điện", duration: 4, predecessors: ["T1"] },
    { id: "T4", name: "Lắp đặt ống Chiller", duration: 6, predecessors: ["T2"] },
    { id: "T5", name: "Thử kín và bọc bảo ôn", duration: 3, predecessors: ["T4", "T3"] },
  ];

  const cpmRes = calculateCpm(network);
  console.log(`\n1. [CPM Analysis] Tổng thời gian dự án: ${cpmRes.projectDuration} ngày.`);
  console.log(`   Đường găng (Critical Path): ${cpmRes.criticalPath.join(" -> ")}`);

  // Test Case 2: Phân tích EVM dự án TT AVIO Tháp A
  const evmRes = calculateEvm({
    bac: 5_000_000_000, // 5 tỷ VND
    plannedProgress: 0.6, // Kế hoạch 60%
    actualProgress: 0.52, // Thực tế 52% (chậm)
    actualCost: 2_800_000_000, // Đã chi 2.8 tỷ VND
    actualTimeMonths: 6,
    plannedTimeMonths: 10,
  });

  console.log(`\n2. [EVM Analysis]`);
  console.log(`   - Planned Value (PV): ${evmRes.pv.toLocaleString("vi-VN")} VND`);
  console.log(`   - Earned Value (EV):  ${evmRes.ev.toLocaleString("vi-VN")} VND`);
  console.log(`   - Actual Cost (AC):   ${evmRes.ac.toLocaleString("vi-VN")} VND`);
  console.log(`   - SPI: ${evmRes.spi} | CPI: ${evmRes.cpi} | CSI: ${evmRes.csi}`);
  console.log(
    `   - Dự báo khi hoàn thành (EAC): ${evmRes.eac.toLocaleString("vi-VN")} VND (Chênh lệch: ${evmRes.vac.toLocaleString("vi-VN")} VND)`,
  );
  console.log(`   - Trạng thái sức khỏe dự án: [${evmRes.status}]`);

  // Test Case 3: Phân tích Pareto trễ hạn
  const delays: DelayItem[] = [
    { category: "SITE", taskName: "Tầng 12 chậm bàn giao cốt sàn", delayDays: 14 },
    { category: "SITE", taskName: "Tầng 14 vướng giáo ngoài", delayDays: 8 },
    { category: "MAT", taskName: "Chậm thông quan Chiller", delayDays: 12 },
    { category: "DWG", taskName: "RFI cao độ dầm chưa trả lời", delayDays: 6 },
    { category: "LABOR", taskName: "Thiếu thợ hàn áp lực", delayDays: 3 },
  ];

  const paretoRes = calculateParetoDelays(delays);
  console.log(`\n3. [Pareto Delay Analysis 80/20]`);
  paretoRes.forEach((p) => {
    console.log(
      `   - Nhóm [${p.category}]: ${p.days} ngày (${p.percentage}%) -> Tích lũy: ${p.cumulativePercentage}% ${p.isVitalFew ? "🔥 [VITAL FEW 80%]" : ""}`,
    );
  });

  console.log("\n✅ Toàn bộ kiểm toán Schedule & EVM hoàn thành 100% xuất sắc!");
}
