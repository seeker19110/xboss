import "./setup"; // không dùng DB hoặc tệp production
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { inflateRawSync } from "node:zlib";
import { ZipArchive } from "archiver";
import ts from "typescript";

// Đọc tên từ central directory thật thay vì nhờ extractor tự lọc traversal giúp test.
function entries(zip: Buffer): { name: string; data: Buffer }[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0);
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const result: { name: string; data: Buffer }[] = [];
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(offset), 0x02014b50);
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + compressedSize);
    assert.ok(method === 0 || method === 8);
    result.push({
      name: zip.toString("utf8", offset + 46, offset + 46 + nameLength),
      data: method === 8 ? inflateRawSync(compressed) : compressed,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

test("ZIP hồ sơ: chặn path traversal, khử trùng tên an toàn và giữ nguyên từng byte", async () => {
  const rows = [
    { taskCode: "group/../../outside", originalName: "report.pdf" },
    { taskCode: "A1", originalName: "Bản vẽ tầng 1.pdf" },
    { taskCode: "name", originalName: "a/b.pdf" },
    { taskCode: "name", originalName: "a\\b.pdf" },
    { taskCode: "2_name", originalName: "a_b.pdf" },
    { taskCode: "bad:\u0000", originalName: "../bad\r\n.pdf" },
  ].map((row, i) => ({ ...row, fileName: `stored-${i}.pdf` }));
  const buffers = new Map(rows.map((row, i) => [row.fileName, Buffer.from([i, 0, 255, 37, 80])]));
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    archiver: { ZipArchive },
    "@/lib/db": { query: async () => rows },
    "@/lib/bao-mat/auth": {
      getCurrentUser: async () => ({ id: 1, orgId: 1, role: "pm" }),
      CAN: { export: () => true },
    },
    "@/lib/ha-tang/projects": { getCurrentProjectId: async () => 1 },
    "@/lib/ky-thuat/qaqc": { DOC_CATEGORIES: [] },
    "@/lib/nen/storage": {
      storageGet: async (_orgId: number, fileName: string) => buffers.get(fileName),
    },
  };
  const file = resolve("app/api/qc/documents/export/zip/route.ts");
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const mod = { exports: {} };
  runInNewContext(outputText, {
    module: mod,
    exports: mod.exports,
    Buffer,
    require: (name: string) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error(`Chưa stub dependency: ${name}`);
    },
  });
  const route = mod.exports as { GET(req: unknown): Promise<Response> };
  const request = { nextUrl: new URL("https://example.invalid/api/qc/documents/export/zip") };
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  const files = entries(Buffer.from(await response.arrayBuffer()));
  assert.equal(files.length, rows.length);
  for (const entry of files) {
    assert.doesNotMatch(entry.name, /[\\/:]|\p{Cc}/u);
    assert.ok(entry.name !== "." && entry.name !== "..");
  }
  assert.equal(new Set(files.map((entry) => entry.name)).size, rows.length);
  assert.ok(files.some((entry) => entry.name === "A1_Bản vẽ tầng 1.pdf"));
  assert.deepEqual(
    files.map((entry) => entry.data),
    rows.map((row) => buffers.get(row.fileName)),
  );

  const repeated = await route.GET(request);
  assert.deepEqual(
    entries(Buffer.from(await repeated.arrayBuffer())).map((entry) => entry.name),
    files.map((entry) => entry.name),
  );
});
