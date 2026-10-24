import { chromium, devices } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ADMIN_EMAIL, ADMIN_PW } from "../e2e/constants";

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`Thiếu giá trị ${name}`);
  return args[index + 1];
}

function positiveNumber(name: string, fallback: number, maximum: number): number {
  const value = Number(option(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error(`${name} phải là số nguyên từ 1 đến ${maximum}`);
  return value;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return Math.round((sorted[Math.ceil(sorted.length * fraction) - 1] ?? 0) * 100) / 100;
}

async function main() {
  const base = new URL(option("--url", "http://127.0.0.1:3147"));
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw new Error("Chỉ đo server local của DB test biệt lập, không nhận URL ngoài loopback");
  if (!process.env.E2E_DATABASE_URL)
    throw new Error("Cần E2E_DATABASE_URL của server test; không chạy trên production");
  const database = new URL(process.env.E2E_DATABASE_URL);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    !/(?:^|_)(?:test|e2e|bench)(?:_|$)/.test(database.pathname.slice(1))
  )
    throw new Error("E2E_DATABASE_URL phải là DB test/e2e/bench local biệt lập");
  const samples = positiveNumber("--samples", 3, 100);
  const concurrency = positiveNumber("--concurrency", 5, 50);
  const output = option("--out", ".autopilot/upgrade-app-bench.json");
  const phase = option("--phase", "candidate");
  const browser = await chromium.launch({ executablePath: process.env.PW_EXECUTABLE_PATH });
  try {
    const login = await browser.newContext({ baseURL: base.origin, serviceWorkers: "block" });
    const auth = await login.request.post("/api/auth/login", {
      headers: { Origin: base.origin },
      data: {
        email: process.env.BENCH_APP_EMAIL ?? ADMIN_EMAIL,
        password: process.env.BENCH_APP_PASSWORD ?? ADMIN_PW,
      },
    });
    if (!auth.ok()) throw new Error(`Đăng nhập benchmark thất bại: HTTP ${auth.status()}`);
    const storageState = await login.storageState();
    const apiResults: Record<string, unknown>[] = [];
    for (const endpoint of [
      "/api/dashboard",
      "/api/dashboard?range=week",
      "/api/tasks?sheet=ogtd",
    ]) {
      const durations: number[] = [];
      const sizes: number[] = [];
      const statuses: Record<number, number> = {};
      const responseHashes = new Set<string>();
      const warm = await login.request.get(endpoint);
      if (!warm.ok()) throw new Error(`Warmup ${endpoint}: HTTP ${warm.status()}`);
      for (let round = 0; round < samples; round += 1) {
        await Promise.all(
          Array.from({ length: concurrency }, async () => {
            const startedAt = performance.now();
            const response = await login.request.get(endpoint);
            const body = await response.body();
            durations.push(performance.now() - startedAt);
            sizes.push(body.length);
            responseHashes.add(createHash("sha256").update(body).digest("hex"));
            statuses[response.status()] = (statuses[response.status()] ?? 0) + 1;
            if (!response.ok()) throw new Error(`${endpoint}: HTTP ${response.status()}`);
          }),
        );
      }
      apiResults.push({
        endpoint,
        requests: durations.length,
        concurrency,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        medianBodyBytes: percentile(sizes, 0.5),
        statuses,
        responseHashes: [...responseHashes],
      });
    }
    await login.close();

    const pages: Record<string, unknown>[] = [];
    for (const path of ["/", "/tracking/ogtd"]) {
      for (let sample = 0; sample < samples; sample += 1) {
        const context = await browser.newContext({
          ...devices["Pixel 5"],
          baseURL: base.origin,
          storageState,
          serviceWorkers: "block",
        });
        try {
          const page = await context.newPage();
          const session = await context.newCDPSession(page);
          await session.send("Network.enable");
          await session.send("Network.emulateNetworkConditions", {
            offline: false,
            latency: 150,
            downloadThroughput: 200_000,
            uploadThroughput: 93_750,
          });
          await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          await page.addInitScript(() => {
            const metrics = { lcp: 0, cls: 0 };
            Object.assign(window, { __xbossBench: metrics });
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
            }).observe({ type: "largest-contentful-paint", buffered: true });
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const shift = entry as PerformanceEntry & {
                  hadRecentInput: boolean;
                  value: number;
                };
                if (!shift.hadRecentInput) metrics.cls += shift.value;
              }
            }).observe({ type: "layout-shift", buffered: true });
          });
          let requests = 0;
          let apiRequests = 0;
          const sizes: Promise<number>[] = [];
          page.on("request", (request) => {
            requests += 1;
            if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests += 1;
          });
          page.on("requestfinished", (request) => {
            sizes.push(
              request
                .sizes()
                .then((size) => size.responseBodySize)
                .catch(() => 0),
            );
          });
          const startedAt = performance.now();
          await page.goto(path, { waitUntil: "domcontentloaded" });
          if (path === "/")
            await page.getByText("Tiến độ tổng", { exact: true }).waitFor({ timeout: 60_000 });
          else await page.getByRole("button", { name: /In PDF/ }).waitFor({ timeout: 60_000 });
          const readyMs = Math.round(performance.now() - startedAt);
          await page.waitForTimeout(500);
          const metrics = await page.evaluate(
            () => (window as Window & { __xbossBench?: { lcp: number; cls: number } }).__xbossBench,
          );
          pages.push({
            path,
            sample: sample + 1,
            readyMs,
            requests,
            apiRequests,
            responseBodyBytes: (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0),
            lcpAtReadyMs: Math.round(metrics?.lcp ?? 0),
            clsAtReady: metrics?.cls ?? 0,
          });
        } finally {
          await context.close();
        }
      }
    }
    const result = {
      phase,
      measuredAt: new Date().toISOString(),
      node: process.version,
      browser: browser.version(),
      samples,
      fixture: "E2E PostgreSQL disposable; seed-sample",
      conditions: {
        viewport: `Pixel 5 (${devices["Pixel 5"].viewport.width}×${devices["Pixel 5"].viewport.height})`,
        latencyMs: 150,
        downloadBytesPerSecond: 200_000,
        uploadBytesPerSecond: 93_750,
        cpuSlowdown: 4,
        serviceWorkers: "blocked",
        note: "Lab tại lúc dữ liệu chính sẵn sàng; không phải Core Web Vitals người dùng thật",
      },
      api: apiResults,
      pages,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(
      `Đã ghi benchmark ${phase}: ${apiResults.length} API, ${pages.length} lượt trang → ${output}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Benchmark thất bại");
  process.exitCode = 1;
});
