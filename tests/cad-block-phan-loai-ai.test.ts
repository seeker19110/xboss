import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// M108 PR2 — tầng 2/3 (AI) và hàng rào giữa đầu ra mô hình với cơ sở dữ liệu.
//
// KHÔNG gọi mạng: mọi ca ở đây kiểm phần THUẦN — công tắc bật/tắt, hàng rào ép kiểu đầu ra, và
// logic ghép kết quả theo tên. Phần gọi mạng thật thuộc về đo AC3 trên bộ đối chứng (§15.4), là
// việc chạy tay có khoá API, không phải việc của cổng CI.
import { test } from "node:test";
import assert from "node:assert/strict";

/** Đặt biến môi trường cho một ca rồi trả lại nguyên trạng — không rò sang ca khác. */
async function voiEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const cu: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    cu[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const { _resetAiClient } = await import("@/lib/nen/ai");
  _resetAiClient();
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(cu)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    _resetAiClient();
  }
}

// ── Công tắc ─────────────────────────────────────────────────────────────────

test("AC4: thiếu ANTHROPIC_API_KEY thì AI tắt, kèm lý do đọc được bằng tiếng Việt", async () => {
  const { aiKhaDung, lyDoAiTat } = await import("@/lib/nen/ai");
  await voiEnv({ ANTHROPIC_API_KEY: undefined, XBOSS_AI_BLOCK_CLASSIFY: undefined }, () => {
    assert.equal(aiKhaDung(), false);
    assert.match(lyDoAiTat() ?? "", /ANTHROPIC_API_KEY/);
  });
});

test("FR10: XBOSS_AI_BLOCK_CLASSIFY=0 tắt AI kể cả khi có khoá (công tắc dừng khẩn)", async () => {
  const { aiKhaDung, lyDoAiTat } = await import("@/lib/nen/ai");
  await voiEnv({ ANTHROPIC_API_KEY: "sk-test", XBOSS_AI_BLOCK_CLASSIFY: "0" }, () => {
    assert.equal(aiKhaDung(), false);
    assert.match(lyDoAiTat() ?? "", /XBOSS_AI_BLOCK_CLASSIFY/);
  });
  await voiEnv({ ANTHROPIC_API_KEY: "sk-test", XBOSS_AI_BLOCK_CLASSIFY: undefined }, () => {
    assert.equal(aiKhaDung(), true);
    assert.equal(lyDoAiTat(), null);
  });
});

test("FR9: AI tắt thì phân loại lô vẫn ra kết quả tầng 1 đầy đủ, không ném lỗi", async () => {
  const { phanLoaiLo } = await import("@/lib/dich-vu/cad-block-phan-loai");
  await voiEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
    const kq = await phanLoaiLo([{ blockName: "FCU-01" }, { blockName: "BLOCK1" }]);
    assert.equal(kq.aiDaChay, false);
    assert.ok(kq.lyDoKhongChay);
    assert.equal(kq.ketQua[0].kind, "equipment", "tầng 1 vẫn chạy bình thường");
    assert.equal(kq.ketQua[1].kind, null);
  });
});

// ── Hàng rào giữa đầu ra mô hình và cơ sở dữ liệu ────────────────────────────

test("AC5: mô hình trả loại ngoài danh sách → CHƯA QUYẾT, không sửa thành giá trị gần đúng", async () => {
  const { epDongTraVe } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const kq = epDongTraVe(
    {
      blockName: "X",
      kind: "ống gió", // giá trị lạ, không nằm trong LOAI_BLOCK
      systemId: "HVAC",
      takeoffItemId: "fcu-unit",
      doTinCay: 0.99,
      lyDo: "chắc chắn lắm",
    },
    "ngu_nghia",
  );
  assert.equal(kq.kind, null);
  assert.equal(kq.nguon, "chua_quyet");
  assert.match(kq.lyDo, /ống gió/, "lý do phải nói rõ mô hình đã trả giá trị gì");
});

test("mô hình tự nhận không đủ căn cứ (chua_ro) → chưa quyết, giữ nguyên lý do của nó", async () => {
  const { epDongTraVe } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const kq = epDongTraVe(
    {
      blockName: "X",
      kind: "chua_ro",
      systemId: null,
      takeoffItemId: null,
      doTinCay: 0.2,
      lyDo: "Tên vô nghĩa.",
    },
    "ngu_nghia",
  );
  assert.equal(kq.kind, null);
  assert.equal(kq.nguon, "chua_quyet");
  assert.equal(kq.lyDo, "Tên vô nghĩa.");
});

test("hệ và hạng mục bịa bị loại bỏ, loại block hợp lệ vẫn giữ", async () => {
  const { epDongTraVe } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const kq = epDongTraVe(
    {
      blockName: "X",
      kind: "equipment",
      systemId: "HE-KHONG-CO-THAT",
      takeoffItemId: "item-bia-dat",
      doTinCay: 0.9,
      lyDo: "…",
    },
    "ngu_nghia",
  );
  assert.equal(kq.kind, "equipment");
  assert.equal(kq.systemId, null, "hệ không có trong rule pack phải bị bỏ");
  assert.equal(kq.takeoffItemId, null, "hạng mục không có trong rule pack phải bị bỏ");
});

test("độ tin cậy bị kẹp về [0,1] và khổ giấy không bao giờ do mô hình quyết", async () => {
  const { epDongTraVe } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const cao = epDongTraVe(
    {
      blockName: "X",
      kind: "titleblock",
      systemId: null,
      takeoffItemId: null,
      doTinCay: 42,
      lyDo: "…",
    },
    "hinh_anh",
  );
  assert.equal(cao.doTinCay, 1);
  assert.equal(cao.paperSize, null, "khổ giấy phải do người khai");
  const am = epDongTraVe(
    {
      blockName: "X",
      kind: "fitting",
      systemId: null,
      takeoffItemId: null,
      doTinCay: -5,
      lyDo: "…",
    },
    "ngu_nghia",
  );
  assert.equal(am.doTinCay, 0);
});

// ── Ghép kết quả theo tên ────────────────────────────────────────────────────

test("ghép theo TÊN chứ không theo thứ tự; mô hình đảo thứ tự vẫn đúng dòng", async () => {
  const { ghepKetQuaMoHinh } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const { phanLoaiLoTheoLuat } = await import("@/lib/ky-thuat/cad/block-phan-loai-luat");
  const ungViens = [{ blockName: "AAA" }, { blockName: "BBB" }];
  const ketQua = phanLoaiLoTheoLuat(ungViens);

  ghepKetQuaMoHinh(
    ungViens,
    ketQua,
    [0, 1],
    [
      {
        blockName: "BBB",
        kind: "support",
        systemId: null,
        takeoffItemId: null,
        doTinCay: 0.9,
        lyDo: "b",
      },
      {
        blockName: "AAA",
        kind: "fitting",
        systemId: "HVAC",
        takeoffItemId: null,
        doTinCay: 0.8,
        lyDo: "a",
      },
    ],
    "ngu_nghia",
  );
  assert.equal(ketQua[0].kind, "fitting");
  assert.equal(ketQua[1].kind, "support");
});

test("mô hình bỏ sót dòng hoặc thêm dòng thừa đều không làm lệch dữ liệu", async () => {
  const { ghepKetQuaMoHinh } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const { phanLoaiLoTheoLuat } = await import("@/lib/ky-thuat/cad/block-phan-loai-luat");
  const ungViens = [{ blockName: "AAA" }, { blockName: "BBB" }];
  const ketQua = phanLoaiLoTheoLuat(ungViens);

  ghepKetQuaMoHinh(
    ungViens,
    ketQua,
    [0, 1],
    [
      {
        blockName: "AAA",
        kind: "fitting",
        systemId: null,
        takeoffItemId: null,
        doTinCay: 0.8,
        lyDo: "a",
      },
      {
        blockName: "KHONG-TON-TAI",
        kind: "equipment",
        systemId: null,
        takeoffItemId: null,
        doTinCay: 1,
        lyDo: "x",
      },
    ],
    "ngu_nghia",
  );
  assert.equal(ketQua[0].kind, "fitting");
  assert.equal(ketQua[1].kind, null, "dòng bị mô hình bỏ sót phải giữ nguyên chưa quyết");
  assert.equal(ketQua.length, 2, "dòng thừa của mô hình không được chèn thêm vào lô");
});

test("hệ suy được từ layer ở tầng 1 không bị mô hình xoá mất", async () => {
  const { ghepKetQuaMoHinh } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const { phanLoaiLoTheoLuat } = await import("@/lib/ky-thuat/cad/block-phan-loai-luat");
  const ungViens = [{ blockName: "BLOCK9", layer: "M-DUCT-SUPP" }];
  const ketQua = phanLoaiLoTheoLuat(ungViens);
  assert.equal(ketQua[0].systemId, "HVAC");

  ghepKetQuaMoHinh(
    ungViens,
    ketQua,
    [0],
    [
      {
        blockName: "BLOCK9",
        kind: "fitting",
        systemId: null,
        takeoffItemId: null,
        doTinCay: 0.7,
        lyDo: "…",
      },
    ],
    "hinh_anh",
  );
  assert.equal(ketQua[0].kind, "fitting");
  assert.equal(ketQua[0].systemId, "HVAC", "mô hình không đưa ra hệ thì giữ hệ của tầng 1");
  assert.equal(ketQua[0].nguon, "hinh_anh");
});

test("AI không bao giờ được lật kết quả đã chắc của tầng 1", async () => {
  const { ghepKetQuaMoHinh } = await import("@/lib/dich-vu/cad-block-phan-loai");
  const { phanLoaiLoTheoLuat } = await import("@/lib/ky-thuat/cad/block-phan-loai-luat");
  const ungViens = [{ blockName: "FCU-01" }];
  const ketQua = phanLoaiLoTheoLuat(ungViens);
  assert.equal(ketQua[0].kind, "equipment");
  assert.equal(ketQua[0].nguon, "luat");

  // `phanLoaiLo` chỉ đưa vào `chiSo` những dòng CHƯA quyết — dòng này không nằm trong đó.
  ghepKetQuaMoHinh(
    ungViens,
    ketQua,
    [], // đúng như cỗ máy làm: dòng tầng 1 đã quyết thì không gửi lên mô hình
    [
      {
        blockName: "FCU-01",
        kind: "sleeve",
        systemId: null,
        takeoffItemId: null,
        doTinCay: 1,
        lyDo: "sai",
      },
    ],
    "ngu_nghia",
  );
  assert.equal(ketQua[0].kind, "equipment", "kết quả của luật tất định phải nguyên vẹn");
  assert.equal(ketQua[0].nguon, "luat");
});
