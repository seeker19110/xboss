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

// Nạp route ZIP thật (transpile + require giả) với `query` trả `rows` và `storageGet` đọc từ
// `buffers`; `daDoc` ghi lại các file route đã đọc (để kiểm route không đọc file khi vượt trần).
function napRouteZip(
  rows: Record<string, unknown>[],
  buffers: Map<string, Buffer>,
  daDoc: string[] = [],
): { GET(req: unknown): Promise<Response> } {
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
      storageGet: async (_orgId: number, fileName: string) => {
        daDoc.push(fileName);
        return buffers.get(fileName);
      },
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
  return mod.exports as { GET(req: unknown): Promise<Response> };
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
  const route = napRouteZip(rows, buffers);
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

// Đợt tối ưu 3 (G2): route gom mọi file vào RAM — vượt trần (500 tệp hoặc 500 MB theo
// size_bytes đã lưu) phải trả 413 kèm hướng dẫn lọc, TRƯỚC khi đọc bất kỳ file nào.
test("ZIP hồ sơ: vượt trần số tệp hoặc tổng dung lượng → 413, không đọc file nào", async () => {
  const request = { nextUrl: new URL("https://example.invalid/api/qc/documents/export/zip") };
  const nhieuTep = Array.from({ length: 501 }, (_, i) => ({
    taskCode: `A${i}`,
    fileName: `stored-${i}.pdf`,
    originalName: `bb-${i}.pdf`,
    sizeBytes: 1000,
  }));
  const daDoc: string[] = [];
  const res = await napRouteZip(nhieuTep, new Map(), daDoc).GET(request);
  assert.equal(res.status, 413);
  assert.match((await res.json()).error, /lọc theo hệ, tầng hoặc loại hồ sơ/);
  assert.equal(daDoc.length, 0);

  const nangQua = [
    { taskCode: "A1", fileName: "a.pdf", originalName: "a.pdf", sizeBytes: 300 * 1024 * 1024 },
    { taskCode: "A2", fileName: "b.pdf", originalName: "b.pdf", sizeBytes: 300 * 1024 * 1024 },
  ];
  const res2 = await napRouteZip(nangQua, new Map(), daDoc).GET(request);
  assert.equal(res2.status, 413);
  assert.equal(daDoc.length, 0);

  // Đúng trần (500 tệp, dòng thiếu size tính 0; dòng không có file không tính) → vẫn nén bình thường.
  const vuaDu = [
    ...nhieuTep.slice(0, 500).map((r) => ({ ...r, sizeBytes: null })),
    { taskCode: "B", fileName: null, originalName: null, sizeBytes: null },
  ];
  const buffers = new Map(
    vuaDu.flatMap((r) => (r.fileName ? [[r.fileName, Buffer.from("x")]] : [])) as [
      string,
      Buffer,
    ][],
  );
  const res3 = await napRouteZip(vuaDu, buffers, daDoc).GET(request);
  assert.equal(res3.status, 200);
  assert.equal(entries(Buffer.from(await res3.arrayBuffer())).length, 500);
});
