import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { clearXBossCacheThenReload } from "@/app/error";

test("error recovery waits for scoped cache ACK before reloading", async () => {
  const sequence: string[] = [];
  await clearXBossCacheThenReload(
    async () => {
      sequence.push("xBoss-cache-ack");
    },
    () => sequence.push("reload"),
  );
  assert.deepEqual(sequence, ["xBoss-cache-ack", "reload"]);
});

test("error recovery does not reload when cache purge fails", async () => {
  let reloads = 0;
  await assert.rejects(
    clearXBossCacheThenReload(
      async () => {
        throw new Error("cache ACK timeout");
      },
      () => reloads++,
    ),
    /cache ACK timeout/,
  );
  assert.equal(reloads, 0);
});

test("error recovery never unregisters workers or clears unrelated storage", () => {
  const source = readFileSync("app/error.tsx", "utf8");
  assert.match(source, /clearXBossCacheThenReload\(\)/);
  assert.match(source, /clearServiceWorkerCache/);
  assert.doesNotMatch(source, /getRegistrations\s*\(|\.unregister\s*\(/);
  assert.doesNotMatch(source, /caches\.keys\s*\(|caches\.delete\s*\(/);
  assert.doesNotMatch(source, /sessionStorage\.clear\s*\(|localStorage\.removeItem\s*\(/);
});
