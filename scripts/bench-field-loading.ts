import { chromium, devices } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Đo phần việc chính của Hiện trường khi một nguồn phụ chậm có kiểm soát.
// Chỉ chạy trên production build local với PostgreSQL test/e2e/bench biệt lập.
function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? "") : fallback;
}

async function main() {
  const phase = option("--phase", "candidate");
  if (!["baseline", "candidate"].includes(phase))
    throw new Error("--phase phải là baseline hoặc candidate");
  const base = new URL(option("--url", "http://127.0.0.1:3148"));
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("Chỉ đo server HTTP loopback của DB test biệt lập");
  const database = new URL(process.env.E2E_DATABASE_URL ?? "postgres://invalid/invalid");
  if (
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    !/(?:^|_)(?:test|e2e|bench)(?:_|$)/.test(database.pathname.slice(1))
  )
    throw new Error("Cần E2E_DATABASE_URL của DB test/e2e/bench local biệt lập");
  const samples = Number(option("--samples", "5"));
  if (!Number.isInteger(samples) || samples < 1 || samples > 20)
    throw new Error("--samples phải từ 1 đến 20");
  const output = option("--out", `.autopilot/field-loading-${phase}.json`);
  const origin = base.origin;
  const browser = await chromium.launch();
  const rows: Record<string, unknown>[] = [];
  try {
    const login = await browser.newContext({ baseURL: origin, serviceWorkers: "block" });
    const loginResult = await login.request.post("/api/auth/login", {
      maxRedirects: 0,
      headers: { Origin: origin },
      data: {
        email: process.env.BENCH_FIELD_EMAIL ?? "engineer@xboss.vn",
        password: process.env.BENCH_FIELD_PASSWORD ?? "eng123",
      },
    });
    if (!loginResult.ok()) throw new Error("Test engineer login failed: " + loginResult.status());
    const storageState = await login.storageState();
    await login.close();
    const scenarios = [
      { name: "normal", endpoint: null },
      { name: "slow-notifications", endpoint: "/api/notifications?limit=20" },
      { name: "slow-sheets", endpoint: "/api/sheets" },
      { name: "slow-project", endpoint: "/api/project" },
    ];
    for (const scenario of scenarios) {
      for (let sample = 1; sample <= samples; sample++) {
        const context = await browser.newContext({
          ...devices["Pixel 5"],
          baseURL: origin,
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
            downloadThroughput: 200000,
            uploadThroughput: 93750,
          });
          await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
          if (scenario.endpoint) {
            await page.route(origin + scenario.endpoint, async (route) => {
              const response = await route.fetch();
              await new Promise((resolve) => setTimeout(resolve, 3000));
              await route.fulfill({ response }).catch(() => {});
            });
          }
          let count = 0,
            apiCount = 0;
          const pageErrors: string[] = [];
          page.on("request", (r) => {
            count++;
            if (new URL(r.url()).pathname.startsWith("/api/")) apiCount++;
          });
          page.on("pageerror", (error) => pageErrors.push(error.message));
          const started = performance.now();
          const primary = page
            .waitForResponse((r) => new URL(r.url()).pathname === "/api/my-tasks")
            .then(async (response) => {
              const body = await response.body();
              const payload = JSON.parse(body.toString()) as {
                tasks: unknown[];
                summary: { total: number };
              };
              if (response.status() !== 200) throw new Error("Primary status " + response.status());
              return {
                finishedMs: performance.now() - started,
                hash: createHash("sha256").update(body).digest("hex"),
                bytes: body.length,
                taskCount: payload.tasks.length,
                summaryTotal: payload.summary.total,
              };
            });
          await page.goto("/", { waitUntil: "domcontentloaded" });
          await page.getByText("Việc hôm nay", { exact: true }).waitFor({ timeout: 30000 });
          const readyMs = performance.now() - started;
          const data = await primary;
          if (pageErrors.length) throw new Error(pageErrors.join("\n"));
          rows.push({
            scenario: scenario.name,
            sample,
            readyMs: Math.round(readyMs),
            primaryFinishedMs: Math.round(data.finishedMs),
            waitAfterPrimaryMs: Math.round(readyMs - data.finishedMs),
            primaryHash: data.hash,
            primaryBytes: data.bytes,
            primaryTaskCount: data.taskCount,
            summaryTotal: data.summaryTotal,
            requestsAtReady: count,
            apiRequestsAtReady: apiCount,
          });
        } finally {
          await context.close();
        }
      }
    }
    const result = {
      phase,
      measuredAt: new Date().toISOString(),
      browser: browser.version(),
      node: process.version,
      fixture:
        "PostgreSQL16 disposable; same seed-sample/engineer assignment before and after; assigned task count recorded per sample",
      conditions: {
        viewport: `Pixel 5 ${devices["Pixel 5"].viewport.width}x${devices["Pixel 5"].viewport.height}`,
        cpuSlowdown: 4,
        latencyMs: 150,
        downloadBytesPerSecond: 200000,
        uploadBytesPerSecond: 93750,
        serviceWorkers: "blocked",
        secondaryDelayMs: 3000,
        samplesPerScenario: samples,
        note: "Controlled secondary latency lab; not field CWV or a claim about every page",
      },
      rows,
    };
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(result, null, 2) + "\n");
    for (const scenario of scenarios) {
      const selected = rows.filter((row) => row.scenario === scenario.name);
      const median = (key: string) => {
        const values = selected.map((row) => Number(row[key])).sort((a, b) => a - b);
        return (
          (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2
        );
      };
      console.log(
        scenario.name +
          ": ready median " +
          median("readyMs") +
          "ms; wait after primary " +
          median("waitAfterPrimaryMs") +
          "ms",
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Không đo được Hiện trường");
  process.exitCode = 1;
});
