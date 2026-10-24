// Benchmark lookup thuần, không DOM/DB/network. Chạy bằng Node 24 + tsx, ghi stdout JSON:
// npx tsx scripts/bench-work-front-lookup.ts > /tmp/xboss-work-front-lookup.json
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { buildWorkFrontIndex } from "../lib/hien-truong/work-front-index";

const SAMPLE_COUNT = 31;
const WARMUP_COUNT = 30;
let checksumSink = 0;

function fixture(floorCount: number, activeStages: number, hiddenStages = 0) {
  const floors = Array.from({ length: floorCount }, (_, i) => `${floorCount - i}F`);
  const allStages = Array.from({ length: activeStages + hiddenStages }, (_, i) => ({
    id: 101 + i,
    name: `Công tác ${i + 1}`,
    sortOrder: i + 1,
    active: i < activeStages,
    durationDays: 3,
  }));
  let id = 1;
  const fronts = floors
    .flatMap((floorLabel) =>
      allStages.map((stage) => ({
        id: id++,
        floorLabel,
        stageId: stage.id,
        receivedAt: stage.id % 3 === 0 ? "2026-10-24" : null,
        handedOverAt: null,
        plannedReceivedAt: stage.id === 101 ? "2026-10-23" : null,
        plannedHandedOverAt: "2026-10-27",
        note: null,
        updatedAt: "2026-10-24T00:00:00Z",
        outgoingSupplierId: null,
        incomingSupplierId: null,
        transitionStageId: null,
        outgoingRepName: null,
        incomingRepName: null,
      })),
    )
    // Cùng kiểu ORDER BY floor_label, stage_id; thứ tự render tầng vẫn giảm dần.
    .sort((a, b) =>
      a.floorLabel < b.floorLabel ? -1 : a.floorLabel > b.floorLabel ? 1 : a.stageId - b.stageId,
    );
  return { floors, stages: allStages.filter((stage) => stage.active), fronts };
}

type Fixture = ReturnType<typeof fixture>;
type Front = Fixture["fronts"][number];

function findLookup(data: Fixture): number {
  let hash = 2166136261;
  for (const floor of data.floors) {
    for (const stage of data.stages) {
      const front = data.fronts.find((row) => row.floorLabel === floor && row.stageId === stage.id);
      hash = Math.imul(hash ^ (front?.id ?? 0), 16777619);
    }
  }
  return hash >>> 0;
}

function indexedLookup(data: Fixture, index: Map<string, Map<number, Front>>): number {
  let hash = 2166136261;
  for (const floor of data.floors) {
    for (const stage of data.stages) {
      const front = index.get(floor)?.get(stage.id);
      hash = Math.imul(hash ^ (front?.id ?? 0), 16777619);
    }
  }
  return hash >>> 0;
}

function selectedRows(data: Fixture, index?: Map<string, Map<number, Front>>) {
  return data.floors.flatMap((floor) =>
    data.stages.map((stage) =>
      index
        ? index.get(floor)?.get(stage.id)
        : data.fronts.find((row) => row.floorLabel === floor && row.stageId === stage.id),
    ),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function measure(run: () => number, iterations: number): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) checksumSink = (checksumSink + run()) >>> 0;
  return (performance.now() - start) / iterations;
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (fraction: number) =>
    Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(6));
  return { p50Ms: percentile(0.5), p95Ms: percentile(0.95) };
}

function runScenario(floorCount: number, activeStageCount: number, hiddenStageCount = 0) {
  const data = fixture(floorCount, activeStageCount, hiddenStageCount);
  const index = buildWorkFrontIndex(data.fronts);
  const before = selectedRows(data);
  const after = selectedRows(data, index);
  assert.equal(before.length, after.length);
  assert.ok(
    before.every((row, i) => row === after[i]),
    "Mỗi ô phải giữ cùng object row",
  );
  const selectedBeforeSha256 = sha256(JSON.stringify(before));
  const selectedAfterSha256 = sha256(JSON.stringify(after));
  assert.equal(selectedBeforeSha256, selectedAfterSha256);
  const checksumBefore = findLookup(data);
  const checksumAfter = indexedLookup(data, index);
  assert.equal(checksumBefore, checksumAfter);

  const variants = {
    findMs: () => findLookup(data),
    buildAndLookupMs: () => indexedLookup(data, buildWorkFrontIndex(data.fronts)),
    memoizedLookupMs: () => indexedLookup(data, index),
  };
  type Variant = keyof typeof variants;
  for (let i = 0; i < WARMUP_COUNT; i++) {
    for (const run of Object.values(variants)) checksumSink = (checksumSink + run()) >>> 0;
  }
  // Batching giảm nhiễu timer ở fixture nhỏ; mỗi mẫu giữ đủ cả ba cách và đảo thứ tự.
  const estimate = measure(variants.findMs, 3);
  const iterations = Math.min(2000, Math.max(1, Math.ceil(15 / Math.max(estimate, 0.001))));
  const rawSamples: {
    order: Variant[];
    findMs: number;
    buildAndLookupMs: number;
    memoizedLookupMs: number;
  }[] = [];
  for (let sample = 0; sample < SAMPLE_COUNT; sample++) {
    const order: Variant[] = ["findMs", "buildAndLookupMs", "memoizedLookupMs"];
    if (sample % 2) order.reverse();
    const timings = { findMs: 0, buildAndLookupMs: 0, memoizedLookupMs: 0 };
    for (const key of order) timings[key] = measure(variants[key], iterations);
    rawSamples.push({ order, ...timings });
  }
  return {
    floorCount,
    activeStageCount,
    hiddenStageCount,
    returnedFronts: data.fronts.length,
    renderedCells: floorCount * activeStageCount,
    inputSha256: sha256(JSON.stringify(data)),
    identicalRowReferences: true,
    checksumBefore,
    checksumAfter,
    selectedBeforeSha256,
    selectedAfterSha256,
    iterationsPerSample: iterations,
    find: summarize(rawSamples.map((sample) => sample.findMs)),
    buildAndLookup: summarize(rawSamples.map((sample) => sample.buildAndLookupMs)),
    memoizedLookup: summarize(rawSamples.map((sample) => sample.memoizedLookupMs)),
    rawSamples,
  };
}

const scenarios = [runScenario(30, 7), runScenario(80, 40), runScenario(80, 40, 20)];
console.log(
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      environment: {
        node: process.versions.node,
        v8: process.versions.v8,
        arch: process.arch,
        cpu: cpus()[0]?.model,
        logicalCpus: cpus().length,
      },
      sources: {
        helperSha256: sha256(
          readFileSync(new URL("../lib/hien-truong/work-front-index.ts", import.meta.url), "utf8"),
        ),
        scriptSha256: sha256(readFileSync(new URL(import.meta.url), "utf8")),
      },
      method: {
        samples: SAMPLE_COUNT,
        warmupsPerVariant: WARMUP_COUNT,
        pairedAlternatingOrder: true,
        unit: "ms mỗi lượt lookup toàn ma trận",
        buildAndLookupIncludesIndexCreation: true,
        percentile: "nearest rank",
      },
      limitations: [
        "Fixture synthetic hợp lệ theo schema, không phải kích thước dự án production đã quan sát.",
        "Chỉ đo lookup; không đo DOM, React render, API, DB hoặc Core Web Vitals.",
        "Không đặt threshold thời gian vào test hoặc gate.",
      ],
      scenarios,
      checksumSink,
    },
    null,
    2,
  ),
);
