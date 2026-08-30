import "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
// tests/cad-schematic-tang2.test.ts — M117 PR2: TẦNG 2 (AI ngữ nghĩa) của đường đọc sơ đồ nguyên
// lý + hàng rào sửa/duyệt graph.
//
// KHÔNG gọi mạng: mọi ca ở đây kiểm phần THUẦN — công tắc bật/tắt (AC2), hàng rào giữa đầu ra mô
// hình và graph sẽ ghi xuống DB (AC3), và nội dung THẬT SỰ gửi lên mô hình (AC6). Cùng khuôn
// tests/cad-block-phan-loai-ai.test.ts của M108.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PHIEN_BAN_GRAPH,
  thongKe,
  type CanhSchematic,
  type GraphSchematic,
  type NutSchematic,
} from "@/lib/ky-thuat/cad/schematic";

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

function nut(p: Partial<NutSchematic> & { id: string }): NutSchematic {
  return {
    loai: "thiet_bi",
    kind: null,
    blockName: null,
    tag: null,
    systemId: null,
    x: 0,
    y: 0,
    nguon: "chua_quyet",
    doTinCay: null,
    lyDo: "",
    ...p,
  };
}

function canh(p: Partial<CanhSchematic> & { id: string }): CanhSchematic {
  return {
    from: "n1",
    to: "n2",
    size: null,
    nguon: "chua_quyet",
    doTinCay: null,
    thieu: ["size"],
    diem: [
      [0, 0],
      [1000, 0],
    ],
    lyDo: "",
    ...p,
  };
}

function graphMau(): GraphSchematic {
  const nodes = [
    nut({ id: "n1", blockName: "BLOCK-LA", x: 100, y: 200 }),
    nut({ id: "n2", kind: "equipment", nguon: "luat", blockName: "FCU-01", doTinCay: null }),
    nut({ id: "n3", loai: "dau_ho", x: 500, y: 0 }),
    nut({ id: "n4", loai: "dau_ho", x: 520, y: 0 }),
  ];
  const edges = [canh({ id: "e1", from: "n1", to: "n2" })];
  return { version: PHIEN_BAN_GRAPH, nodes, edges, thongKe: thongKe(nodes, edges), canhBao: [] };
}

// ── AC2: AI tắt thì pipeline vẫn chạy trọn ───────────────────────────────────

test("AC2: thiếu ANTHROPIC_API_KEY thì tầng 2 bỏ qua êm, graph tầng 1 nguyên vẹn", async () => {
  const { chayTang2Schematic } = await import("@/lib/dich-vu/cad");
  await voiEnv({ ANTHROPIC_API_KEY: undefined }, async () => {
    const g = graphMau();
    const kq = await chayTang2Schematic(g);
    assert.equal(kq.aiDaChay, false);
    assert.match(kq.lyDoKhongChay ?? "", /ANTHROPIC_API_KEY/);
    assert.equal(kq.graph.nodes[0].nguon, "chua_quyet", "phần chưa quyết giữ nguyên");
    assert.equal(kq.graph.edges[0].size, null);
  });
});

test("AC2: XBOSS_AI_BLOCK_CLASSIFY=0 tắt tầng 2 kể cả khi có khoá", async () => {
  const { chayTang2Schematic } = await import("@/lib/dich-vu/cad");
  await voiEnv({ ANTHROPIC_API_KEY: "sk-test", XBOSS_AI_BLOCK_CLASSIFY: "0" }, async () => {
    const kq = await chayTang2Schematic(graphMau());
    assert.equal(kq.aiDaChay, false);
    assert.match(kq.lyDoKhongChay ?? "", /XBOSS_AI_BLOCK_CLASSIFY/);
  });
});

test("AI bật nhưng graph không còn phần chưa quyết → không gọi mô hình", async () => {
  const { chayTang2Schematic } = await import("@/lib/dich-vu/cad");
  await voiEnv({ ANTHROPIC_API_KEY: "sk-test", XBOSS_AI_BLOCK_CLASSIFY: undefined }, async () => {
    const nodes = [nut({ id: "n1", kind: "equipment", nguon: "luat" })];
    const edges: CanhSchematic[] = [];
    const kq = await chayTang2Schematic({
      version: PHIEN_BAN_GRAPH,
      nodes,
      edges,
      thongKe: thongKe(nodes, edges),
      canhBao: [],
    });
    assert.equal(kq.aiDaChay, false);
    assert.match(kq.lyDoKhongChay ?? "", /không cần gọi AI/);
  });
});

// ── AC3: hàng rào giữa đầu ra mô hình và graph ───────────────────────────────

test("AC3: loại block ngoài enum → giữ chua_quyet, không ghi bừa", async () => {
  const { apKetQuaSchematic } = await import("@/lib/dich-vu/cad");
  const g = graphMau();
  const doi = apKetQuaSchematic(
    g,
    {
      nodes: [
        { id: "n1", kind: "ống gió", systemId: "HVAC", doTinCay: 0.99, lyDo: "chắc chắn lắm" },
      ],
      edges: [],
      noi: [],
    },
    ["n1"],
    [],
  );
  assert.equal(doi, 0);
  assert.equal(g.nodes[0].kind, null);
  assert.equal(g.nodes[0].nguon, "chua_quyet");
});

test('AC3: mô hình tự nhận "chua_ro" → giữ nguyên chưa quyết', async () => {
  const { apKetQuaSchematic } = await import("@/lib/dich-vu/cad");
  const g = graphMau();
  apKetQuaSchematic(
    g,
    {
      nodes: [{ id: "n1", kind: "chua_ro", systemId: null, doTinCay: 0.2, lyDo: "tên vô nghĩa" }],
      edges: [],
      noi: [],
    },
    ["n1"],
    [],
  );
  assert.equal(g.nodes[0].nguon, "chua_quyet");
});

test("AC3: hệ bịa bị bỏ, loại block hợp lệ vẫn giữ; doTinCay bị kẹp về [0,1]", async () => {
  const { apKetQuaSchematic } = await import("@/lib/dich-vu/cad");
  const g = graphMau();
  apKetQuaSchematic(
    g,
    {
      nodes: [
        {
          id: "n1",
          kind: "fitting",
          systemId: "HE-KHONG-CO-THAT",
          doTinCay: 42,
          lyDo: "hình cái van",
        },
      ],
      edges: [],
      noi: [],
    },
    ["n1"],
    [],
  );
  assert.equal(g.nodes[0].kind, "fitting");
  assert.equal(g.nodes[0].systemId, null, "hệ không có trong rule pack phải bị bỏ");
  assert.equal(g.nodes[0].doTinCay, 1);
  assert.equal(g.nodes[0].nguon, "ngu_nghia");
  assert.equal(g.nodes[0].canNguoiXem, false);
});

test("AC3: size sai mẫu bị loại; size đúng mẫu được chuẩn hoá và xoá khỏi danh sách thiếu", async () => {
  const { apKetQuaSchematic } = await import("@/lib/dich-vu/cad");
  const bay = graphMau();
  apKetQuaSchematic(
    bay,
    { nodes: [], edges: [{ id: "e1", size: "ống to", doTinCay: 1, lyDo: "…" }], noi: [] },
    [],
    ["e1"],
  );
  assert.equal(bay.edges[0].size, null, "chuỗi không đúng mẫu size phải bị loại thẳng");
  assert.equal(bay.edges[0].nguon, "chua_quyet");

  const g = graphMau();
  apKetQuaSchematic(
    g,
    {
      nodes: [],
      edges: [{ id: "e1", size: "600 X 300", doTinCay: 0.6, lyDo: "chữ gần cạnh" }],
      noi: [],
    },
    [],
    ["e1"],
  );
  assert.equal(g.edges[0].size, "600x300");
  assert.deepEqual(g.edges[0].thieu, []);
  assert.equal(g.edges[0].nguon, "ngu_nghia");
  assert.equal(g.edges[0].canNguoiXem, true, "doTinCay < 0.8 phải đánh dấu cần người xem");
});

test("cạnh còn thiếu mối nối thì điền được size vẫn CHƯA quyết xong", async () => {
  const { apKetQuaSchematic } = await import("@/lib/dich-vu/cad");
  const g = graphMau();
  g.edges[0].thieu = ["noi", "size"];
  apKetQuaSchematic(
    g,
    { nodes: [], edges: [{ id: "e1", size: "DN100", doTinCay: 0.95, lyDo: "…" }], noi: [] },
    [],
    ["e1"],
  );
  assert.equal(g.edges[0].size, "DN100");
  assert.deepEqual(g.edges[0].thieu, ["noi"]);
  assert.equal(g.edges[0].nguon, "chua_quyet");
});

test("AI KHÔNG được lật kết quả của luật, cũng không đụng phần tử ngoài mẻ", async () => {
  const { apKetQuaSchematic } = await import("@/lib/dich-vu/cad");
  const g = graphMau();
  apKetQuaSchematic(
    g,
    {
      nodes: [
        { id: "n2", kind: "sleeve", systemId: null, doTinCay: 1, lyDo: "lật kết quả luật" },
        { id: "n1", kind: "fitting", systemId: null, doTinCay: 1, lyDo: "ngoài mẻ" },
        { id: "khong-ton-tai", kind: "fitting", systemId: null, doTinCay: 1, lyDo: "bịa" },
      ],
      edges: [],
      noi: [],
    },
    ["n3"], // mẻ chỉ có n3
    [],
  );
  assert.equal(g.nodes[1].kind, "equipment", "nút đã chắc theo luật không bị lật");
  assert.equal(g.nodes[1].nguon, "luat");
  assert.equal(g.nodes[0].nguon, "chua_quyet", "nút ngoài mẻ không bị đụng");
  assert.equal(g.nodes.length, 4, "id bịa không đẻ thêm nút");
});

test("đề xuất nối chỉ nhận giữa hai ĐẦU HỞ trong mẻ, không sinh cạnh mới", async () => {
  const { apKetQuaSchematic } = await import("@/lib/dich-vu/cad");
  const g = graphMau();
  apKetQuaSchematic(
    g,
    {
      nodes: [],
      edges: [],
      noi: [
        { tu: "n3", den: "n4", doTinCay: 0.9, lyDo: "hai đầu hở đối diện nhau" },
        { tu: "n3", den: "n2", doTinCay: 0.9, lyDo: "n2 không phải đầu hở" },
        { tu: "n3", den: "n3", doTinCay: 1, lyDo: "tự nối chính mình" },
        { tu: "n4", den: "n3", doTinCay: 0.5, lyDo: "trùng cặp đã có" },
      ],
    },
    ["n3", "n4"],
    [],
  );
  assert.equal(g.edges.length, 1, "AI không được sinh cạnh — chỉ đề xuất");
  assert.deepEqual(
    (g.goiYNoi ?? []).map((x) => [x.tu, x.den]),
    [["n3", "n4"]],
  );
});

// ── AC6: nội dung thật sự gửi lên mô hình ────────────────────────────────────

test("AC6: prompt không mang tên dự án, mã dự án hay dữ liệu tài chính", async () => {
  const { chiDanSchematic, noiDungSchematic, chayTang2Schematic } =
    await import("@/lib/dich-vu/cad");
  const g = graphMau();
  const payload = [
    chiDanSchematic([
      { id: "van-chan", blockName: "XB-VAN", kind: "fitting", system: "HVAC" },
    ] as never),
    noiDungSchematic(g, ["n1", "n3", "n4"], ["e1"]),
  ].join("\n");

  for (const cam of [
    "project",
    "projectId",
    "project_id",
    "đơn giá",
    "thành tiền",
    "hợp đồng",
    "VNĐ",
    "boq",
  ]) {
    assert.ok(
      !payload.toLowerCase().includes(cam.toLowerCase()),
      `payload gửi AI không được chứa "${cam}"`,
    );
  }
  // Chốt bằng chữ ký hàm: tầng 2 không hề nhận id dự án nên không có đường nào rò tên dự án ra.
  // (`length` = 1 vì tham số `thuVien` có giá trị mặc định.)
  assert.equal(
    chayTang2Schematic.length,
    1,
    "chayTang2Schematic(graph, thuVien?) — không hề nhận projectId",
  );
  assert.match(payload, /HVAC/, "chỉ gửi từ vựng kỹ thuật: id hệ của rule pack");
  assert.match(payload, /n1/, "và id nút/cạnh đã ẩn danh");
});

// ── Sửa/duyệt tay (hàng rào ở cửa PATCH) ─────────────────────────────────────

test("docSuaGraph chặn loại block lạ, hệ lạ và size sai mẫu ngay ở cửa", async () => {
  const { docSuaGraph } = await import("@/lib/dich-vu/cad");
  assert.ok("loi" in docSuaGraph({ nodes: [{ id: "n1", kind: "ống gió" }] }));
  assert.ok("loi" in docSuaGraph({ nodes: [{ id: "n1", systemId: "KHONG-CO" }] }));
  assert.ok("loi" in docSuaGraph({ edges: [{ id: "e1", size: "to" }] }));
  assert.ok("loi" in docSuaGraph({ nodes: [{ kind: "fitting" }] }), "thiếu id phải bị chặn");
  assert.ok("loi" in docSuaGraph("chuỗi"));
  assert.deepEqual(docSuaGraph(undefined), { sua: { nodes: [], edges: [] } });

  const ok = docSuaGraph({
    nodes: [{ id: "n1", kind: "fitting", systemId: "HVAC", tag: " V-01 " }],
    edges: [{ id: "e1", size: "dn100" }],
  });
  assert.ok(!("loi" in ok));
  assert.deepEqual(ok.sua.nodes[0], {
    id: "n1",
    kind: "fitting",
    systemId: "HVAC",
    tag: "V-01",
  });
  assert.equal(ok.sua.edges[0].size, "DN100", "size của người sửa cũng qua bộ chuẩn hoá tầng 1");
});

test("apSuaGraph: người duyệt đè lên mọi nguồn, phần tử thành nguoi_sua và hết phỏng đoán", async () => {
  const { apSuaGraph } = await import("@/lib/dich-vu/cad");
  const g = graphMau();
  g.nodes[0].doTinCay = 0.4;
  g.nodes[0].canNguoiXem = true;
  const doi = apSuaGraph(g, {
    nodes: [{ id: "n2", kind: "sleeve" }],
    edges: [{ id: "e1", size: "Ø32" }],
  });
  assert.equal(doi, 2);
  assert.equal(g.nodes[1].kind, "sleeve");
  assert.equal(g.nodes[1].nguon, "nguoi_sua");
  assert.equal(g.edges[0].size, "Ø32");
  assert.deepEqual(g.edges[0].thieu, []);
  assert.equal(g.edges[0].nguon, "nguoi_sua");
  assert.equal(g.edges[0].doTinCay, null);

  // Xoá size lại đưa cạnh về "thiếu size" — không để trạng thái nói dối.
  apSuaGraph(g, { nodes: [], edges: [{ id: "e1", size: null }] });
  assert.deepEqual(g.edges[0].thieu, ["size"]);
  assert.equal(g.thongKe.canhCoSize, 0, "thống kê được tính lại sau mỗi lần sửa");
});
