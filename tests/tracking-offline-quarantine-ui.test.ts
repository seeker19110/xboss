import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// S07: banner tracking phân biệt "chưa lưu được offline" (vault chưa mở/không có khoá) với "đã lưu
// trên thiết bị, chưa lên máy chủ" (D03 — không gọi bản lưu thiết bị là sao lưu server).
test("banner tracking: chưa sẵn sàng offline → nói rõ chưa lưu; có hàng đợi → 'trên thiết bị'", () => {
  const source = readFileSync("app/tracking/[sheet]/page.tsx", "utf8");
  assert.match(source, /import \{ offlineQueue \} from "@\/app\/components\/offlineQueue"/);
  assert.match(
    source,
    /!offlineReady && offlinePending === 0 \? \([\s\S]*?Thao tác chưa được lưu offline[\s\S]*?kết nối mạng để[\s\S]*?lưu thay đổi\./,
  );
  assert.match(source, /\) : online \? \([\s\S]*?lưu trên thiết bị, chờ gửi lên máy chủ/);
  assert.match(source, /Mất mạng — thao tác được lưu trên thiết bị[\s\S]*?chưa lên máy chủ/);
  // Khoá vault được xin khi CÓ mạng, trước khi mất mạng.
  assert.match(
    source,
    /offlineQueue\.chuanBiTracking\(data\.packages\.flatMap\(\(p\) => p\.tasks\)\)/,
  );
});
