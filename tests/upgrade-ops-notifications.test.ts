import { test } from "node:test";
import assert from "node:assert/strict";
import { createVisiblePoll } from "@/app/lib/visiblePoll";

class Visibility extends EventTarget {
  hidden = false;
  show(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}

async function settle() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

test("chuông: tab ẩn không tải, hiện lại tải ngay và không chạy hai request đồng thời", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility = new Visibility();
  visibility.hidden = true;
  let calls = 0;
  let done: ((value: number) => void) | undefined;
  const seen: number[] = [];
  const poll = createVisiblePoll({
    visibility,
    everyMs: 30_000,
    load: () => {
      calls++;
      return new Promise<number>((resolve) => (done = resolve));
    },
    onData: (value) => seen.push(value),
  });
  t.after(poll.dispose);
  t.mock.timers.tick(90_000);
  assert.equal(calls, 0);
  visibility.show(false);
  await settle();
  assert.equal(calls, 1);
  poll.refresh();
  poll.refresh();
  t.mock.timers.tick(90_000);
  assert.equal(calls, 1, "request chậm không được chồng với tick hoặc làm mới");
  done!(1);
  await settle();
  assert.deepEqual(seen, [1]);
  assert.equal(calls, 2, "các lần làm mới khi đang tải được gộp thành một lượt sau đó");
  done!(2);
  await settle();
  t.mock.timers.tick(30_000);
  await settle();
  assert.equal(calls, 3);
});

test("chuông: ẩn tab hủy request; kết quả cũ không cập nhật và quay lại vẫn tải mới", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility = new Visibility();
  const signals: AbortSignal[] = [];
  const resolves: ((value: number) => void)[] = [];
  const seen: number[] = [];
  const poll = createVisiblePoll({
    visibility,
    everyMs: 30_000,
    load: (signal) => {
      signals.push(signal);
      return new Promise<number>((resolve) => resolves.push(resolve));
    },
    onData: (value) => seen.push(value),
  });
  t.after(poll.dispose);
  await settle();
  visibility.show(true);
  assert.equal(signals[0].aborted, true);
  visibility.show(false);
  await settle();
  assert.equal(signals.length, 1, "đợi request cũ kết thúc kể cả khi transport bỏ qua abort");
  resolves[0](1);
  await settle();
  assert.deepEqual(seen, []);
  assert.equal(signals.length, 2);
  resolves[1](2);
  await settle();
  assert.deepEqual(seen, [2]);
});

test("chuông: unmount hủy request và listener/timer, không nhận kết quả muộn", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility = new Visibility();
  let signal: AbortSignal | undefined;
  let done: ((value: string) => void) | undefined;
  let calls = 0;
  const seen: string[] = [];
  const poll = createVisiblePoll({
    visibility,
    everyMs: 30_000,
    load: (s) => {
      signal = s;
      calls++;
      return new Promise<string>((resolve) => (done = resolve));
    },
    onData: (value) => seen.push(value),
  });
  await settle();
  poll.dispose();
  assert.equal(signal?.aborted, true);
  done!("muộn");
  await settle();
  visibility.show(true);
  visibility.show(false);
  poll.refresh();
  t.mock.timers.tick(90_000);
  await settle();
  assert.equal(calls, 1);
  assert.deepEqual(seen, []);
});

test("chuông: lỗi tải không thành dữ liệu rỗng, chu kỳ sau vẫn thử lại", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const visibility = new Visibility();
  let calls = 0;
  const seen: number[] = [];
  const errors: unknown[] = [];
  const poll = createVisiblePoll({
    visibility,
    everyMs: 30_000,
    load: async () => {
      if (++calls === 1) throw new Error("mạng lỗi");
      return 2;
    },
    onData: (value) => seen.push(value),
    onError: (error) => errors.push(error),
  });
  t.after(poll.dispose);
  await settle();
  assert.equal(errors.length, 1);
  assert.deepEqual(seen, []);
  t.mock.timers.tick(30_000);
  await settle();
  assert.deepEqual(seen, [2]);
});
