import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("tracking banner says offline edits are unsaved while the queue is quarantined", () => {
  const source = readFileSync("app/tracking/[sheet]/page.tsx", "utf8");

  assert.match(source, /import \{ OFFLINE_QUEUE_QUARANTINED \} from "@\/app\/components\/offlineQueue"/);
  assert.match(
    source,
    /OFFLINE_QUEUE_QUARANTINED \? \([\s\S]*?Thao tác chưa được lưu offline[\s\S]*?kết nối mạng để[\s\S]*?lưu thay đổi\./,
  );
  assert.match(
    source,
    /\) : online \? \([\s\S]*?Đang gửi lại[\s\S]*?thay đổi đã lưu offline/,
  );
});
