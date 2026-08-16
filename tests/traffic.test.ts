import { test } from "node:test";
import assert from "node:assert/strict";
import { recordTraffic, getRecent, subscribeTraffic, latestId } from "@/lib/traffic";

// Lưu ý: `lib/traffic.ts` giữ state ở cấp module (seq/buf/listeners) — tồn tại
// xuyên suốt mọi test TRONG file này (cùng 1 process). Không giả định buffer
// rỗng; luôn lấy mốc `latestId()` trước rồi lọc bằng `getRecent(moc)`.

function makeEntry(overrides: Partial<Parameters<typeof recordTraffic>[0]> = {}) {
  return {
    ts: Date.now(),
    method: "GET",
    path: "/api/test",
    ip: "127.0.0.1",
    ua: "node-test",
    ...overrides,
  };
}

test("recordTraffic: id tăng dần chặt, giữ nguyên các field khác", () => {
  const moc = latestId();
  const input = makeEntry({ method: "POST", path: "/api/foo", ip: "1.2.3.4", ua: "curl" });
  const entry = recordTraffic(input);
  assert.ok(entry.id > moc);
  assert.equal(entry.method, "POST");
  assert.equal(entry.path, "/api/foo");
  assert.equal(entry.ip, "1.2.3.4");
  assert.equal(entry.ua, "curl");
  assert.equal(entry.ts, input.ts);

  const entry2 = recordTraffic(makeEntry());
  assert.ok(entry2.id > entry.id);
});

test("getRecent() không tham số: trả về mảng sao chép, mutate không ảnh hưởng buffer nội bộ", () => {
  recordTraffic(makeEntry());
  const first = getRecent();
  const lenBefore = first.length;
  first.push({ id: -1, ...makeEntry({ path: "/gia" }) });
  first.pop();
  first.pop();

  const second = getRecent();
  assert.equal(second.length, lenBefore);
});

test("getRecent(since): chỉ trả entry có id > since", () => {
  const moc = latestId();
  const e1 = recordTraffic(makeEntry({ path: "/a" }));
  const e2 = recordTraffic(makeEntry({ path: "/b" }));
  const e3 = recordTraffic(makeEntry({ path: "/c" }));

  const recent = getRecent(moc);
  assert.deepEqual(
    recent.map((e) => e.id),
    [e1.id, e2.id, e3.id],
  );

  const recentFromE1 = getRecent(e1.id);
  assert.deepEqual(
    recentFromE1.map((e) => e.id),
    [e2.id, e3.id],
  );

  const recentFromE3 = getRecent(e3.id);
  assert.deepEqual(recentFromE3, []);
});

test("ring buffer giới hạn MAX=500: ghi vượt quá thì entry cũ nhất bị loại theo FIFO", () => {
  const written: ReturnType<typeof recordTraffic>[] = [];
  for (let i = 0; i < 520; i++) {
    written.push(recordTraffic(makeEntry({ path: `/batch/${i}` })));
  }

  const all = getRecent();
  assert.equal(all.length, 500);

  // 520 entry vừa ghi, buffer giữ tối đa 500 → 20 entry đầu tiên trong lô này
  // (và có thể cả entry từ test trước) đã bị loại; phần tử cũ nhất còn lại
  // trong buffer phải khớp đúng phần tử thứ 21 (index 20) của lô vừa ghi.
  const oldestRemaining = all[0];
  assert.equal(oldestRemaining.id, written[20].id);
  assert.equal(oldestRemaining.path, "/batch/20");
});

test("subscribeTraffic: chỉ nhận entry ghi sau khi đăng ký, huỷ đăng ký thì dừng nhận", () => {
  // Ghi 1 entry TRƯỚC khi subscribe — không được gọi lại cho entry này.
  recordTraffic(makeEntry({ path: "/before" }));

  const received: string[] = [];
  const unsubscribe = subscribeTraffic((e) => {
    received.push(e.path);
  });

  const e1 = recordTraffic(makeEntry({ path: "/after-1" }));
  assert.deepEqual(received, ["/after-1"]);

  unsubscribe();
  recordTraffic(makeEntry({ path: "/after-2" }));
  // Sau khi huỷ đăng ký, không nhận thêm entry mới.
  assert.deepEqual(received, ["/after-1"]);
  assert.ok(e1.id > 0);
});

test("subscribeTraffic: listener lỗi không làm hỏng luồng chính hay các listener khác", () => {
  const calledSecond: string[] = [];
  const unsub1 = subscribeTraffic(() => {
    throw new Error("listener hỏng");
  });
  const unsub2 = subscribeTraffic((e) => {
    calledSecond.push(e.path);
  });

  let entry: ReturnType<typeof recordTraffic> | undefined;
  assert.doesNotThrow(() => {
    entry = recordTraffic(makeEntry({ path: "/loi-listener" }));
  });

  assert.ok(entry);
  assert.equal(entry!.path, "/loi-listener");
  assert.deepEqual(calledSecond, ["/loi-listener"]);

  unsub1();
  unsub2();
});
