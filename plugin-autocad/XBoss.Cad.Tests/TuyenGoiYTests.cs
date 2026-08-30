using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Routing;
using XBoss.Cad.Core.Schematic;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M117 PR4 — phần THUẦN của <c>XBOSS_TUYEN_GOIY</c>: đọc graph sơ đồ nguyên lý, ánh xạ nút thiết
/// bị ↔ block trên mặt bằng, lập kế hoạch sinh tuyến nháp (routing M114) và luật idempotency theo
/// id graph (§8 AC4/AC5). Lệnh AutoCAD không chạy được trên CI nên mọi quyết định "sinh gì / xóa
/// gì" nằm ở Core và được kẹp tại đây; phần bấm điểm/ghi thực thể nằm ở mục verify tay của
/// <c>VERIFY-VA-PHAT-HANH.md</c>.
///
/// Mọi số đo là mm, bản vẽ coi như đơn vị mm (toMm = 1).
/// </summary>
public class TuyenGoiYTests
{
    private static readonly ThamSoDinhTuyen ThamSo = new(Elbow: 3000, CongestionMoiDonVi: 0.5, ReuseFactor: 0.35);

    private static RoutingPolicySection ChinhSach() =>
        DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath)).DrawTools.RoutingPolicy!;

    private static HanhLangChoTuyen HL(string id, double x1, double y1, double x2, double y2) =>
        new(
            new HanhLangDauVao(id, [new Diem2(x1, y1), new Diem2(x2, y2)], 2400, 3100, 2600),
            []);

    private static List<HanhLangChoTuyen> TangMau() =>
    [
        HL("HL-TRUC", 0, 0, 30000, 0),
        HL("HL-N1", 10000, 0, 10000, 8000),
        HL("HL-N2", 20000, 0, 20000, 8000),
    ];

    private static NutGoiY Nut(
        string id, string? tag, string? blockName = null, string? kind = null, string loai = "thiet_bi") =>
        new() { Id = id, Loai = loai, Tag = tag, BlockName = blockName, Kind = kind, SystemId = "HVAC" };

    private static BlockMatBang Block(
        string handle, string? tag, double x, double y, string? blockName = null,
        string? kind = null, string he = "HVAC") =>
        new(handle, tag, blockName, kind, he, new Diem2(x, y));

    private static BanGoiY BanMau(IEnumerable<NutGoiY> nut, IEnumerable<CanhGoiY> canh, string trangThai = "da_duyet") =>
        new()
        {
            Id = 7,
            ProjectId = 1,
            SystemId = "HVAC",
            TrangThai = trangThai,
            Graph = new GraphGoiY { Version = 1, Nodes = [.. nut], Edges = [.. canh] },
        };

    private static CanhGoiY Canh(string id, string tu, string den, string? size = null) =>
        new() { Id = id, From = tu, To = den, Size = size };

    private static KetQuaGoiY Lap(
        BanGoiY ban,
        IReadOnlyList<BlockMatBang> block,
        IReadOnlyList<HanhLangChoTuyen>? hanhLang = null,
        IReadOnlyList<NhapCuGoiY>? nhapCu = null) =>
        KeHoachGoiY.Lap(
            ban,
            block,
            hanhLang ?? TangMau(),
            nhapCu ?? [],
            ChinhSach(),
            new Diem2(0, 0),
            snapRadius: 4000,
            ThamSo,
            beRongTuyenMm: 600,
            caoThietDienMm: 300);

    // ===== Đọc JSON máy chủ (hợp đồng §9) =====

    [Fact]
    public void Doc_dung_JSON_may_chu_tra_ve_va_bo_qua_khoa_la()
    {
        const string json = """
        {
          "id": 12, "projectId": 3, "systemId": "HVAC", "trangThai": "da_duyet",
          "duyetLuc": "2026-08-30T02:00:00.000Z",
          "graph": {
            "version": 1,
            "nodes": [
              {"id":"n1","loai":"thiet_bi","kind":"equipment","blockName":"FCU","tag":"FCU-01",
               "systemId":"HVAC","x":10,"y":20,"nguon":"luat","doTinCay":null,"lyDo":"khớp thư viện"},
              {"id":"n2","loai":"nut_re","kind":null,"blockName":null,"tag":null,
               "systemId":null,"x":0,"y":0,"nguon":"luat","doTinCay":null,"lyDo":"giao 3 nhánh"}
            ],
            "edges": [
              {"id":"e1","from":"n2","to":"n1","size":"DN50","nguon":"luat","thieu":[],
               "diem":[[0,0],[10,20]],"lyDo":"chạm hai đầu"}
            ],
            "thongKe": {"tongNut": 2}, "canhBao": ["khoá lạ không được nuốt im lặng"]
          }
        }
        """;

        var ban = BanGoiY.TuJson(json);

        Assert.Equal(12, ban.Id);
        Assert.True(ban.DaDuyet);
        Assert.Equal("goiy-12", ban.MaPhien);
        Assert.Equal(12, BanGoiY.IdTuMaPhien("goiy-12"));
        Assert.Null(BanGoiY.IdTuMaPhien("HVAC-20260830-101010")); // mã phiên của XBOSS_VE_TUYENTUDONG
        Assert.Equal(2, ban.Graph.Nodes.Count);
        Assert.True(ban.Graph.Nodes[0].LaThietBi);
        Assert.False(ban.Graph.Nodes[1].LaThietBi);
        Assert.Equal("FCU-01", ban.Graph.Nodes[0].Nhan);
        Assert.Equal("DN50", ban.Graph.SizeCuaNut("n1"));
        Assert.Null(ban.Graph.SizeCuaNut("khong-co"));
    }

    // ===== Ánh xạ nút ↔ block (M117 §6 bước 5) =====

    [Fact]
    public void Anh_xa_theo_tag_truoc_roi_moi_theo_ten_block()
    {
        var graph = BanMau(
            [Nut("n1", "FCU-01"), Nut("n2", null, blockName: "AHU")],
            []).Graph;

        var kq = AnhXaThietBiGoiY.Khop(
            graph, "HVAC",
            [Block("A1", "fcu-01", 8000, 3000), Block("B2", null, 12000, 6000, blockName: "AHU")]);

        Assert.Equal(2, kq.Cap.Count);
        Assert.Equal("A1", kq.Cap[0].Block.Handle);
        Assert.Equal("theo tag", kq.Cap[0].CachKhop);
        Assert.Equal("B2", kq.Cap[1].Block.Handle);
        Assert.Equal("theo tên block", kq.Cap[1].CachKhop);
        Assert.Empty(kq.Thieu);
    }

    [Fact]
    public void Block_khac_he_va_block_da_dung_khong_bi_gan_lai()
    {
        var graph = BanMau([Nut("n1", "FCU-01"), Nut("n2", "FCU-01")], []).Graph;

        var kq = AnhXaThietBiGoiY.Khop(
            graph, "HVAC",
            [Block("A1", "FCU-01", 8000, 3000), Block("C3", "FCU-01", 9000, 3000, he: "PCCC")]);

        // Chỉ 1 block cùng hệ ⇒ nút thứ hai KHÔNG được mượn lại chính block đó.
        var cap = Assert.Single(kq.Cap);
        Assert.Equal("A1", cap.Block.Handle);
        var thieu = Assert.Single(kq.Thieu);
        Assert.Equal("n2", thieu.Nut.Id);
    }

    [Fact]
    public void Nhieu_block_cung_khop_thi_khong_doan_va_liet_ke_ly_do()
    {
        var graph = BanMau([Nut("n1", null, blockName: "FCU")], []).Graph;

        var kq = AnhXaThietBiGoiY.Khop(
            graph, "HVAC",
            [Block("A1", null, 8000, 3000, blockName: "FCU"), Block("A2", null, 12000, 6000, blockName: "FCU")]);

        Assert.Empty(kq.Cap);
        var thieu = Assert.Single(kq.Thieu);
        Assert.Contains("2 block", thieu.LyDo);
        Assert.Contains("XBOSS_VE_TAG", thieu.LyDo);
    }

    [Fact]
    public void Nut_khong_phai_thiet_bi_khong_vao_danh_sach_anh_xa()
    {
        var graph = BanMau(
            [Nut("n1", "FCU-01"), Nut("n2", null, loai: "nut_re"), Nut("n3", null, loai: "dau_ho")],
            []).Graph;

        var kq = AnhXaThietBiGoiY.Khop(graph, "HVAC", [Block("A1", "FCU-01", 8000, 3000)]);

        Assert.Single(kq.Cap);
        Assert.Empty(kq.Thieu);
        Assert.Equal(1, kq.TongThietBi);
    }

    // ===== Kế hoạch sinh nháp (AC4) =====

    [Fact]
    public void Sinh_nhanh_cho_thiet_bi_anh_xa_duoc_va_dien_san_co_tu_graph()
    {
        var ban = BanMau(
            [Nut("n1", "FCU-01"), Nut("n2", "FCU-02")],
            [Canh("e1", "nguon", "n1", "DN50"), Canh("e2", "nguon", "n2")]);

        var kq = Lap(ban, [Block("A1", "FCU-01", 8000, 3000), Block("A2", "FCU-02", 12000, 6000)]);

        Assert.Null(kq.LoiChan);
        Assert.Equal("goiy-7", kq.MaPhien);
        Assert.Equal(2, kq.AnhXa.Cap.Count);
        Assert.Equal(2, kq.KeHoach.SoNoiDuoc);
        Assert.NotEmpty(kq.Nhanh);
        // Nhánh của n1 mang cỡ đọc từ cạnh schematic; n2 không có cỡ ⇒ null (lệnh dùng cỡ kỹ sư khai).
        Assert.All(kq.Nhanh.Where(n => n.NutId == "n1"), n => Assert.Equal("DN50", n.Size));
        Assert.All(kq.Nhanh.Where(n => n.NutId == "n2"), n => Assert.Null(n.Size));
        Assert.Contains(kq.Nhanh, n => n.Nhan == "FCU-01");
        Assert.All(kq.Nhanh, n => Assert.True(n.Diem.Count >= 2));
    }

    [Fact]
    public void Thieu_anh_xa_van_sinh_phan_tim_duoc()
    {
        var ban = BanMau([Nut("n1", "FCU-01"), Nut("n2", "FCU-99")], [Canh("e1", "n1", "n2")]);

        var kq = Lap(ban, [Block("A1", "FCU-01", 8000, 3000)]);

        Assert.Null(kq.LoiChan);
        Assert.Single(kq.AnhXa.Cap);
        Assert.Single(kq.AnhXa.Thieu);
        Assert.NotEmpty(kq.Nhanh);
    }

    [Fact]
    public void Chua_co_hanh_lang_thi_dung_sach_kem_cau_chay_XBOSS_VE_HANHLANG()
    {
        var ban = BanMau([Nut("n1", "FCU-01")], []);

        var kq = Lap(ban, [Block("A1", "FCU-01", 8000, 3000)], hanhLang: []);

        Assert.NotNull(kq.LoiChan);
        Assert.Contains("XBOSS_VE_HANHLANG", kq.LoiChan!);
        Assert.Empty(kq.Nhanh);
    }

    [Fact]
    public void Graph_chua_chot_thi_khong_lap_ke_hoach()
    {
        var ban = BanMau([Nut("n1", "FCU-01")], [], trangThai: "nhap");

        var kq = Lap(ban, [Block("A1", "FCU-01", 8000, 3000)]);

        Assert.NotNull(kq.LoiChan);
        Assert.Contains("Chốt graph", kq.LoiChan!);
        Assert.Empty(kq.Nhanh);
    }

    [Fact]
    public void Khong_anh_xa_duoc_thiet_bi_nao_thi_khong_ve_dai_mot_tuyen()
    {
        var ban = BanMau([Nut("n1", "FCU-01")], []);

        var kq = Lap(ban, [Block("A1", "FCU-99", 8000, 3000)]);

        Assert.NotNull(kq.LoiChan);
        Assert.Contains("Không ánh xạ được thiết bị nào", kq.LoiChan!);
        Assert.Empty(kq.Nhanh);
    }

    // ===== Idempotency theo id graph (AC5) =====

    [Fact]
    public void Chay_lai_xoa_dung_nhap_cua_graph_do_va_khong_dung_thuc_the_khac()
    {
        var ban = BanMau([Nut("n1", "FCU-01")], [Canh("e1", "nguon", "n1", "DN50")]);
        var nhapCu = new List<NhapCuGoiY>
        {
            new("H1", "goiy-7", false),   // nháp của chính sơ đồ này
            new("H2", "goiy-7", true),    // nháp của sơ đồ này, kỹ sư đã sửa hình học
            new("H3", "goiy-9", false),   // nháp của SƠ ĐỒ KHÁC — không được đụng
        };

        var kq = Lap(ban, [Block("A1", "FCU-01", 8000, 3000)], nhapCu: nhapCu);

        Assert.Equal(["H1", "H2"], kq.XoaHandle);
        Assert.Equal(["H2"], kq.HandleDaSuaTay);
        Assert.DoesNotContain("H3", kq.XoaHandle);
    }

    [Fact]
    public void Chay_hai_lan_cho_cung_so_nhanh_khong_nhan_doi()
    {
        var ban = BanMau(
            [Nut("n1", "FCU-01"), Nut("n2", "FCU-02")],
            [Canh("e1", "nguon", "n1", "DN50"), Canh("e2", "nguon", "n2", "DN50")]);
        var block = new List<BlockMatBang>
        {
            Block("A1", "FCU-01", 8000, 3000),
            Block("A2", "FCU-02", 12000, 6000),
        };

        var lan1 = Lap(ban, block);
        // Lần 2: bản vẽ đang có đúng các nháp lần 1.
        var nhapCu = lan1.Nhanh
            .Select((_, i) => new NhapCuGoiY($"H{i}", "goiy-7", false))
            .ToList();
        var lan2 = Lap(ban, block, nhapCu: nhapCu);

        Assert.Equal(lan1.Nhanh.Count, lan2.Nhanh.Count);
        Assert.Equal(nhapCu.Count, lan2.XoaHandle.Count); // xóa hết nháp cũ rồi mới dựng lại
        Assert.Equal(
            lan1.Nhanh.Select(n => n.Diem.Count),
            lan2.Nhanh.Select(n => n.Diem.Count));
    }

    [Fact]
    public void Loc_nhap_theo_id_graph_dung_cho_lenh_xoa()
    {
        var nhapCu = new List<NhapCuGoiY>
        {
            new("H1", "goiy-7", false),
            new("H2", "goiy-9", false),
            new("H3", null, false),
        };

        Assert.Equal(["H1"], KeHoachGoiY.NhapCuaGraph(nhapCu, 7).Select(n => n.Handle));
        Assert.Equal(["H2"], KeHoachGoiY.NhapCuaGraph(nhapCu, 9).Select(n => n.Handle));
        Assert.Empty(KeHoachGoiY.NhapCuaGraph(nhapCu, 11));
    }

    [Fact]
    public void Layer_nhap_la_layer_rieng_khong_lan_tuyen_that()
    {
        Assert.Equal("XBOSS-GOIY", KeHoachGoiY.LayerNhap);
    }
}
