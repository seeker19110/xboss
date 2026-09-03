import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LICH_SU_RONG,
  SO_BUOC_TOI_DA,
  ghiThaoTac,
  loDeHoanTac,
  loDeLamLai,
  mucDeHoanTac,
  mucDeLamLai,
  xacNhanHoanTac,
  xacNhanLamLai,
  type MucTick,
} from "@/app/components/grid/lichSuTick";

// M121 FR4/FR5 — ngăn xếp hoàn tác cho thao tác tick. Thuần, không React/fetch.

const muc = (dimIds: number[], truoc: boolean[], sau: boolean): MucTick => ({ dimIds, truoc, sau });

test("ghiThaoTac: xếp chồng theo thứ tự, thao tác mới xoá nhánh làm lại", () => {
  let ls = ghiThaoTac(LICH_SU_RONG, muc([1], [false], true));
  ls = xacNhanHoanTac(ls); // giả lập vừa hoàn tác → có mục trong ngăn làm lại
  assert.equal(ls.lamLai.length, 1);

  ls = ghiThaoTac(ls, muc([2], [false], true)); // rẽ nhánh mới
  assert.equal(ls.lamLai.length, 0, "đã rẽ nhánh mới thì nhánh cũ không nối tiếp được nữa");
  assert.equal(ls.hoanTac.length, 1);
});

test("ghiThaoTac: lô rỗng không tạo bước lịch sử (không có gì để hoàn tác)", () => {
  const ls = ghiThaoTac(LICH_SU_RONG, muc([], [], true));
  assert.equal(ls.hoanTac.length, 0);
});

test(`ghiThaoTac: giữ tối đa ${SO_BUOC_TOI_DA} bước, bỏ bước cũ nhất`, () => {
  let ls = LICH_SU_RONG;
  for (let i = 1; i <= SO_BUOC_TOI_DA + 10; i++) ls = ghiThaoTac(ls, muc([i], [false], true));
  assert.equal(ls.hoanTac.length, SO_BUOC_TOI_DA);
  assert.deepEqual(ls.hoanTac[0].dimIds, [11], "10 bước đầu bị đẩy ra khỏi ngăn xếp");
  assert.deepEqual(ls.hoanTac.at(-1)?.dimIds, [SO_BUOC_TOI_DA + 10]);
});

test("loDeHoanTac: AC4 — tách 2 lô khi thao tác trộn ô đang tick và chưa tick", () => {
  // "Tick cả hàng" trên hàng dở dang: ô 1,3 vốn đã tick; ô 2,4 vốn chưa. Hoàn tác không thể
  // gửi một giá trị duy nhất cho cả 4 ô.
  const lo = loDeHoanTac(muc([1, 2, 3, 4], [true, false, true, false], true));
  assert.equal(lo.length, 2);
  assert.deepEqual(
    lo.find((l) => l.installed)?.dimIds,
    [1, 3],
    "ô vốn đang tick phải được tick lại",
  );
  assert.deepEqual(
    lo.find((l) => !l.installed)?.dimIds,
    [2, 4],
    "ô vốn chưa tick phải được bỏ tick",
  );
});

test("loDeHoanTac: cả lô cùng giá trị trước → đúng 1 lô, không gửi request thừa", () => {
  const lo = loDeHoanTac(muc([1, 2, 3], [false, false, false], true));
  assert.deepEqual(lo, [{ dimIds: [1, 2, 3], installed: false }]);
});

test("loDeLamLai: luôn 1 lô với giá trị `sau` chung của thao tác", () => {
  assert.deepEqual(loDeLamLai(muc([1, 2], [true, false], true)), [
    { dimIds: [1, 2], installed: true },
  ]);
  assert.deepEqual(loDeLamLai(muc([], [], true)), []);
});

test("AC6 (FR5): mucDeHoanTac chỉ ĐỌC — không tự pop, server từ chối thì mục còn nguyên", () => {
  const ls = ghiThaoTac(LICH_SU_RONG, muc([7], [false], true));
  const m = mucDeHoanTac(ls);
  assert.deepEqual(m?.dimIds, [7]);
  // Chưa gọi xacNhanHoanTac (vì server từ chối) → ngăn xếp không đổi, người dùng thử lại được.
  assert.equal(ls.hoanTac.length, 1);
  assert.equal(ls.lamLai.length, 0);
});

test("xacNhanHoanTac / xacNhanLamLai: chuyển mục qua lại đúng ngăn", () => {
  let ls = ghiThaoTac(LICH_SU_RONG, muc([5], [true], false));
  ls = xacNhanHoanTac(ls);
  assert.equal(ls.hoanTac.length, 0);
  assert.equal(ls.lamLai.length, 1);
  assert.deepEqual(mucDeLamLai(ls)?.dimIds, [5]);

  ls = xacNhanLamLai(ls);
  assert.equal(ls.hoanTac.length, 1);
  assert.equal(ls.lamLai.length, 0);
});

test("xacNhan* trên ngăn rỗng là no-op, không throw", () => {
  assert.deepEqual(xacNhanHoanTac(LICH_SU_RONG), LICH_SU_RONG);
  assert.deepEqual(xacNhanLamLai(LICH_SU_RONG), LICH_SU_RONG);
  assert.equal(mucDeHoanTac(LICH_SU_RONG), null);
  assert.equal(mucDeLamLai(LICH_SU_RONG), null);
});

test("hoàn tác rồi làm lại đưa về đúng giá trị ban đầu (vòng tròn khép kín)", () => {
  const m = muc([1, 2], [true, false], true);
  let ls = ghiThaoTac(LICH_SU_RONG, m);

  // Hoàn tác: đưa ô 1 về true, ô 2 về false.
  assert.deepEqual(loDeHoanTac(mucDeHoanTac(ls)!), [
    { dimIds: [1], installed: true },
    { dimIds: [2], installed: false },
  ]);
  ls = xacNhanHoanTac(ls);

  // Làm lại: cả 2 ô về true (giá trị `sau` của thao tác gốc).
  assert.deepEqual(loDeLamLai(mucDeLamLai(ls)!), [{ dimIds: [1, 2], installed: true }]);
});
