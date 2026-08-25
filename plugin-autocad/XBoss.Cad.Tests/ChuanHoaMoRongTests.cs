using System.Text.Json.Nodes;
using XBoss.Cad.Core.Layers;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Standardize;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 PR2 — 4 bước chuẩn hóa mới của rule pack v7 (§6.2, bước 8 style / 9 xref / 10 hatch /
/// 11 layout). Mỗi bước có ca DƯƠNG (đúng thay đổi cần làm) và ca ÂM (tắt / dữ liệu đã chuẩn →
/// KHÔNG đụng vào bản vẽ), cộng bằng chứng then chốt: **v7 để mặc định cho kết quả y HỆT v6**
/// trên cùng một hiện trạng (M101 §7 FR3).
/// Mọi rule pack trong test đều đi qua validator thật (không dựng pack giả trong bộ nhớ).
/// </summary>
public class ChuanHoaMoRongTests
{
    private static readonly CadRulePack V7 = RepoPaths.LoadRulePack();

    private static readonly CadRulePack V6 =
        RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v6.json")));

    /// <summary>Nạp lại rule pack đang phát hành sau khi chỉnh một khối — vẫn qua validator thật.</summary>
    private static CadRulePack PackChinh(string khoiGoc, Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc[khoiGoc]!.AsObject());
        return RulePackLoader.Load(goc.ToJsonString());
    }

    // ===== Bằng chứng "v7 mặc định = v6" =====

    /// <summary>Hiện trạng "bẩn" đủ để MỌI bước mới có việc phải làm nếu chúng được bật.</summary>
    private static readonly IReadOnlyList<KieuChuHienCo> KieuChuBan =
        [new() { Ten = "Standard", Font = "txt.shx" }, new() { Ten = "VNI-STYLE", Font = "VNI-Times" }];

    private static readonly IReadOnlyList<KieuKichThuocHienCo> KieuDimBan =
        [new() { Ten = "ISO-25", TenKieuChu = "Standard" }];

    private static readonly IReadOnlyList<ThucTheDungStyle> ThucTheBan =
    [
        new() { Handle = "1A", Loai = LoaiStyle.KieuChu, TenStyle = "VNI-STYLE" },
        new() { Handle = "1B", Loai = LoaiStyle.KieuKichThuoc, TenStyle = "ISO-25" },
    ];

    private static readonly IReadOnlyList<XrefHienCo> XrefBan =
        [new() { Ten = "MB-KIENTRUC", DuongDanLuu = @"C:\DA\XREF\KT.dwg" }];

    private static readonly IReadOnlyList<HatchHienCo> HatchBan =
        [new() { Handle = "2A", Layer = "M-DUCT-SUPP", TenMau = "ANSI37", TiLe = 3 }];

    private static readonly IReadOnlyList<LayoutChuanHoa> LayoutBan =
        [new() { Ten = "Layout1" }, new() { Ten = "Layout2", SoViewport = 1 }];

    private static (bool Style, int Xref, int Hatch, bool Layout) ChayHetBonBuoc(CadRulePack pack) =>
    (
        !ChuanHoaMoRong.LapKeHoachStyle(
            pack.InspectionPolicy.StyleDeviation, pack.StyleMap, KieuChuBan, KieuDimBan, ThucTheBan, 1).Rong,
        ChuanHoaMoRong.LapKeHoachXref(pack.XrefPolicy, XrefBan, @"C:\DA\Ban-ve").ThayDoi.Count,
        ChuanHoaMoRong.LapKeHoachHatch(pack.HatchMap, HatchBan).ThayDoi.Count,
        !ChuanHoaMoRong.LapKeHoachLayout(pack.LayoutPolicy, LayoutBan).Rong
    );

    [Fact]
    public void V7_mac_dinh_cho_ket_qua_y_het_v6()
    {
        Assert.Equal(ChayHetBonBuoc(V6), ChayHetBonBuoc(V7));
        // …và cụ thể là KHÔNG bước nào đụng vào bản vẽ.
        Assert.Equal((false, 0, 0, false), ChayHetBonBuoc(V7));
    }

    [Fact]
    public void V7_phat_hanh_tat_ca_4_buoc_moi_deu_tat()
    {
        Assert.False(V7.XrefPolicy.Enabled);
        Assert.False(V7.HatchMap.Enabled);
        Assert.False(V7.LayoutPolicy.Enabled);
        // Bước 8 không có cờ riêng: dùng chung công tắc với phép kiểm 14, cũng đang tắt.
        Assert.False(V7.InspectionPolicy.StyleDeviation.Enabled);
        // styleMap của v7 phải y hệt v6 — bước 8 DÙNG LẠI khối này, không khai trùng.
        Assert.Equal(V6.StyleMap.TextStyle.Name, V7.StyleMap.TextStyle.Name);
        Assert.Equal(V6.StyleMap.DimStyle.Name, V7.StyleMap.DimStyle.Name);
    }

    [Fact]
    public void Rule_pack_v6_van_nap_duoc_sau_khi_phat_hanh_v7()
    {
        Assert.Equal("v6", V6.Version);
        Assert.Equal("", V6.XrefPolicy.PathPolicy);
        Assert.Empty(V6.HatchMap.ByLayer);
        Assert.Equal("", V6.LayoutPolicy.NamePattern);
    }

    // ===== (8) Style map =====

    private static CadRulePack PackBatStyle() =>
        PackChinh("inspectionPolicy", ip => ip["styleDeviation"]!["enabled"] = true);

    [Fact]
    public void Buoc8_dua_text_va_dim_ve_bo_chuan_va_tao_style_con_thieu()
    {
        var pack = PackBatStyle();
        var kh = ChuanHoaMoRong.LapKeHoachStyle(
            pack.InspectionPolicy.StyleDeviation, pack.StyleMap, KieuChuBan, KieuDimBan, ThucTheBan, 1);

        Assert.True(kh.TaoKieuChuChuan);        // XBOSS-TEXT chưa có trong bảng
        Assert.True(kh.TaoKieuKichThuocChuan);  // XBOSS-DIM chưa có
        Assert.Equal(2, kh.DoiStyle.Count);
        Assert.Equal(new ThayDoiStyle("1A", LoaiStyle.KieuChu, "XBOSS-TEXT"), kh.DoiStyle[0]);
        Assert.Equal(new ThayDoiStyle("1B", LoaiStyle.KieuKichThuoc, "XBOSS-DIM"), kh.DoiStyle[1]);
    }

    [Fact]
    public void Buoc8_khong_dung_style_nam_trong_acceptAlso()
    {
        var pack = PackBatStyle();
        // "Standard" nằm trong acceptAlso của cả textStyle lẫn dimStyle → giữ nguyên.
        var kh = ChuanHoaMoRong.LapKeHoachStyle(
            pack.InspectionPolicy.StyleDeviation, pack.StyleMap,
            [new() { Ten = "XBOSS-TEXT", Font = "arial.ttf", HeSoRong = 1 }],
            [new() { Ten = "XBOSS-DIM", TenKieuChu = "XBOSS-TEXT" }],
            [
                new() { Handle = "1A", Loai = LoaiStyle.KieuChu, TenStyle = "Standard" },
                new() { Handle = "1B", Loai = LoaiStyle.KieuKichThuoc, TenStyle = "Standard" },
                new() { Handle = "1C", Loai = LoaiStyle.KieuChu, TenStyle = "xboss-text" },
            ],
            1);

        Assert.True(kh.Rong);
    }

    [Fact]
    public void Buoc8_chua_chot_bo_chuan_thi_khong_lam_gi()
    {
        var pack = PackChinh("styleMap", sm =>
        {
            sm["textStyle"]!["name"] = "";
            sm["dimStyle"]!["name"] = "";
            sm["dimStyle"]!["textStyleName"] = "";
        });
        // Bật công tắc trên chính pack đó là vô nghĩa (validator chặn), nên kiểm bằng chính sách bật thủ công.
        var kh = ChuanHoaMoRong.LapKeHoachStyle(
            new ToggleCheckPolicy { Enabled = true }, pack.StyleMap, KieuChuBan, KieuDimBan, ThucTheBan, 1);
        Assert.True(kh.Rong);
    }

    [Fact]
    public void Buoc8_sua_kieu_chu_chuan_khi_font_hoac_chieu_cao_lech()
    {
        var pack = PackBatStyle();
        var kh = ChuanHoaMoRong.LapKeHoachStyle(
            pack.InspectionPolicy.StyleDeviation, pack.StyleMap,
            [new() { Ten = "XBOSS-TEXT", Font = "romans.shx", HeSoRong = 0.8 }],
            [new() { Ten = "XBOSS-DIM", TenKieuChu = "XBOSS-TEXT" }],
            [],
            1);

        Assert.False(kh.TaoKieuChuChuan);
        Assert.True(kh.SuaKieuChuChuan);
        Assert.Equal(0, kh.ChieuCaoChuanDonViBanVe); // fixedHeightMm = 0 (không cố định chiều cao)
    }

    [Fact]
    public void Buoc8_bao_khi_dimstyle_chuan_dang_tro_kieu_chu_la()
    {
        var pack = PackBatStyle();
        var kh = ChuanHoaMoRong.LapKeHoachStyle(
            pack.InspectionPolicy.StyleDeviation, pack.StyleMap,
            [new() { Ten = "XBOSS-TEXT", Font = "arial.ttf", HeSoRong = 1 }],
            [new() { Ten = "XBOSS-DIM", TenKieuChu = "VNI-STYLE" }],
            [],
            1);

        Assert.Contains(kh.CanhBao, c => c.Contains("VNI-STYLE") && c.Contains("KHÔNG tự đổi"));
    }

    [Fact]
    public void Buoc8_quy_doi_chieu_cao_mm_sang_don_vi_ban_ve()
    {
        var pack = PackChinh("styleMap", sm => sm["textStyle"]!["fixedHeightMm"] = 2.5);
        // Bản vẽ đơn vị mét: toMm = 1000 → chiều cao đích 0.0025 đơn vị bản vẽ.
        var kh = ChuanHoaMoRong.LapKeHoachStyle(
            new ToggleCheckPolicy { Enabled = true }, pack.StyleMap, [], [], [], 1000);
        Assert.Equal(0.0025, kh.ChieuCaoChuanDonViBanVe, 9);
    }

    // ===== (9) Xref =====

    private static CadRulePack PackBatXref(Action<JsonObject>? chinh = null) =>
        PackChinh("xrefPolicy", xp =>
        {
            xp["enabled"] = true;
            chinh?.Invoke(xp);
        });

    [Theory]
    [InlineData(@"C:\DA\Ban-ve", @"C:\DA\Ban-ve\XREF\KT.dwg", @".\XREF\KT.dwg")]
    [InlineData(@"C:\DA\Ban-ve", @"C:\DA\XREF\KT.dwg", @"..\XREF\KT.dwg")]
    [InlineData(@"C:\DA\Ban-ve\M", @"C:\DA\Ban-ve\E\DIEN.dwg", @"..\E\DIEN.dwg")]
    [InlineData(@"C:/DA/Ban-ve", @"C:/DA/Ban-ve/XREF/KT.dwg", @".\XREF\KT.dwg")]
    [InlineData(@"\\NAS\DuAn\Ban-ve", @"\\NAS\DuAn\XREF\KT.dwg", @"..\XREF\KT.dwg")]
    public void Buoc9_tuong_doi_hoa_dung_dang_AutoCAD(string thuMuc, string xref, string mongDoi) =>
        Assert.Equal(mongDoi, ChuanHoaMoRong.DuongDanTuongDoi(thuMuc, xref));

    [Fact]
    public void Buoc9_khac_o_dia_thi_khong_tuong_doi_hoa_duoc()
    {
        Assert.Null(ChuanHoaMoRong.DuongDanTuongDoi(@"C:\DA\Ban-ve", @"D:\KHO\KT.dwg"));

        var kh = ChuanHoaMoRong.LapKeHoachXref(
            PackBatXref().XrefPolicy,
            [new() { Ten = "KT", DuongDanLuu = @"D:\KHO\KT.dwg" }],
            @"C:\DA\Ban-ve");
        Assert.Empty(kh.ThayDoi);
        Assert.Contains(kh.CanhBao, c => c.Contains("khác ổ đĩa"));
    }

    [Fact]
    public void Buoc9_doi_duong_dan_tuyet_doi_sang_tuong_doi_va_khong_bind()
    {
        var kh = ChuanHoaMoRong.LapKeHoachXref(PackBatXref().XrefPolicy, XrefBan, @"C:\DA\Ban-ve");
        var td = Assert.Single(kh.ThayDoi);
        Assert.Equal(@"..\XREF\KT.dwg", td.DuongDanMoi);
        Assert.False(td.Bind); // bindMatchAny rỗng ở bản phát hành → KHÔNG bind
    }

    [Fact]
    public void Buoc9_duong_dan_da_tuong_doi_thi_giu_nguyen()
    {
        var kh = ChuanHoaMoRong.LapKeHoachXref(
            PackBatXref().XrefPolicy,
            [new() { Ten = "KT", DuongDanLuu = @".\XREF\KT.dwg" }],
            @"C:\DA\Ban-ve");
        Assert.Empty(kh.ThayDoi);
        Assert.Empty(kh.CanhBao);
    }

    [Fact]
    public void Buoc9_xref_dut_duong_dan_chi_bao_khong_sua()
    {
        var kh = ChuanHoaMoRong.LapKeHoachXref(
            PackBatXref().XrefPolicy,
            [new() { Ten = "KT-CU", DuongDanLuu = @"C:\MAY-CU\KT.dwg", DutDuongDan = true }],
            @"C:\DA\Ban-ve");
        Assert.Empty(kh.ThayDoi);
        Assert.Contains(kh.CanhBao, c => c.Contains("ĐỨT đường dẫn"));
    }

    [Fact]
    public void Buoc9_chi_bind_xref_khop_bindMatchAny()
    {
        var pack = PackBatXref(xp => xp["bindMatchAny"] = new JsonArray("KT"));
        var kh = ChuanHoaMoRong.LapKeHoachXref(
            pack.XrefPolicy,
            [
                new() { Ten = "KT", DuongDanLuu = @".\KT.dwg" },
                new() { Ten = "DIEN", DuongDanLuu = @".\DIEN.dwg" },
            ],
            @"C:\DA\Ban-ve");

        var td = Assert.Single(kh.ThayDoi);
        Assert.Equal("KT", td.Ten);
        Assert.True(td.Bind);
        Assert.Contains(kh.CanhBao, c => c.Contains("BIND"));
    }

    [Fact]
    public void Buoc9_pathPolicy_keep_thi_khong_dong_duong_dan()
    {
        var pack = PackBatXref(xp => xp["pathPolicy"] = "keep");
        Assert.Empty(ChuanHoaMoRong.LapKeHoachXref(pack.XrefPolicy, XrefBan, @"C:\DA\Ban-ve").ThayDoi);
    }

    // ===== (10) Hatch =====

    private static CadRulePack PackBatHatch(string layer = "M-DUCT-SUPP", string mau = "ANSI31", double tiLe = 25) =>
        PackChinh("hatchMap", hm =>
        {
            hm["enabled"] = true;
            hm["byLayer"] = new JsonArray(new JsonObject
            {
                ["layerMatchAny"] = new JsonArray(layer),
                ["pattern"] = mau,
                ["scale"] = tiLe,
            });
        });

    [Fact]
    public void Buoc10_doi_mau_va_ti_le_hatch_theo_layer()
    {
        var kh = ChuanHoaMoRong.LapKeHoachHatch(PackBatHatch().HatchMap, HatchBan);
        var td = Assert.Single(kh.ThayDoi);
        Assert.Equal(new ThayDoiHatch("2A", "ANSI31", 25), td);
    }

    [Fact]
    public void Buoc10_khong_dung_hatch_solid_gradient_va_layer_ngoai_bang()
    {
        var kh = ChuanHoaMoRong.LapKeHoachHatch(PackBatHatch().HatchMap,
        [
            new() { Handle = "S1", Layer = "M-DUCT-SUPP", TenMau = "SOLID", TiLe = 1, LaSolid = true },
            new() { Handle = "S2", Layer = "M-DUCT-SUPP", TenMau = "ANSI31", TiLe = 25 }, // đã đúng chuẩn
            new() { Handle = "S3", Layer = "E-TRAY-PWRR", TenMau = "ANSI37", TiLe = 3 },  // layer không có quy định
        ]);

        Assert.Empty(kh.ThayDoi);
        Assert.Contains(kh.CanhBao, c => c.Contains("hatch tô đặc"));
    }

    [Fact]
    public void Buoc10_khop_layer_theo_ranh_gioi_token_nhu_layerMap()
    {
        // Quy định cho token "SUPP": "M-DUCT-SUPP" khớp, "M-DUCT-SUPPEDGE" (layer nét biên) KHÔNG.
        var kh = ChuanHoaMoRong.LapKeHoachHatch(PackBatHatch(layer: "SUPP").HatchMap,
        [
            new() { Handle = "H1", Layer = "M-DUCT-SUPP", TenMau = "ANSI37", TiLe = 3 },
            new() { Handle = "H2", Layer = "M-DUCT-SUPPEDGE", TenMau = "ANSI37", TiLe = 3 },
        ]);

        Assert.Equal("H1", Assert.Single(kh.ThayDoi).Handle);
    }

    // ===== (11) Layout =====

    private static CadRulePack PackBatLayout(bool doiTen = false) =>
        PackChinh("layoutPolicy", lp =>
        {
            lp["enabled"] = true;
            lp["renameLayouts"] = doiTen;
        });

    [Fact]
    public void Buoc11_xoa_layout_rong_va_giu_layout_co_viewport()
    {
        var kh = ChuanHoaMoRong.LapKeHoachLayout(PackBatLayout().LayoutPolicy,
        [
            new() { Ten = "Layout1" },                          // rỗng hoàn toàn
            new() { Ten = "SHOP-HVAC-01", SoViewport = 2 },     // có viewport
            new() { Ten = "GHI-CHU", SoDoiTuong = 12 },         // không viewport nhưng có đối tượng
        ]);

        Assert.Equal(["Layout1"], kh.XoaLayout);
        Assert.Empty(kh.DoiTen);
    }

    [Fact]
    public void Buoc11_luon_giu_lai_it_nhat_mot_layout()
    {
        var kh = ChuanHoaMoRong.LapKeHoachLayout(PackBatLayout().LayoutPolicy,
            [new() { Ten = "Layout1" }, new() { Ten = "Layout2" }]);

        Assert.Equal(["Layout2"], kh.XoaLayout);
        Assert.Contains(kh.CanhBao, c => c.Contains("ít nhất một layout"));
    }

    [Fact]
    public void Buoc11_doi_ten_theo_namePattern_2_chu_so_va_bo_qua_ten_da_dung()
    {
        var kh = ChuanHoaMoRong.LapKeHoachLayout(PackBatLayout(doiTen: true).LayoutPolicy,
        [
            new() { Ten = "TRANG-01", SoViewport = 1 },
            new() { Ten = "Ban ve 2", SoViewport = 1 },
            new() { Ten = "Layout9" },                 // rỗng → bị xóa, không tính vào số thứ tự
            new() { Ten = "Ban ve 3", SoViewport = 1 },
        ]);

        Assert.Equal(["Layout9"], kh.XoaLayout);
        Assert.Equal(
            [new DoiTenLayout("Ban ve 2", "TRANG-02"), new DoiTenLayout("Ban ve 3", "TRANG-03")],
            kh.DoiTen);
    }

    [Fact]
    public void Buoc11_tat_renameLayouts_thi_khong_doi_ten_gi()
    {
        var kh = ChuanHoaMoRong.LapKeHoachLayout(PackBatLayout().LayoutPolicy,
            [new() { Ten = "Ban ve 2", SoViewport = 1 }]);
        Assert.Empty(kh.DoiTen);
    }

    // ===== Nợ kỹ thuật đã đóng: gộp layer theo LayerTable.Has (không phân biệt hoa/thường) =====

    [Fact]
    public void Layer_chi_lech_hoa_thuong_thi_DOI_TEN_chu_khong_gop()
    {
        // LayerTable.Has("M-DUCT-SUPP") trả TRUE khi bản vẽ đang có "m-duct-supp" (Has không phân
        // biệt hoa/thường) — tin thẳng vào Has là gộp rồi Erase() chính layer đang chứa thực thể.
        Assert.Equal(
            HanhDongLayer.DoiTen,
            LayerMapper.QuyetDinh("m-duct-supp", "M-DUCT-SUPP", dichDaTonTai: true));
    }

    [Fact]
    public void Layer_khac_ten_that_su_thi_van_gop_nhu_cu()
    {
        Assert.Equal(
            HanhDongLayer.Gop,
            LayerMapper.QuyetDinh("01_M_ONG_GIO_CAP", "M-DUCT-SUPP", dichDaTonTai: true));
        Assert.Equal(
            HanhDongLayer.DoiTen,
            LayerMapper.QuyetDinh("01_M_ONG_GIO_CAP", "M-DUCT-SUPP", dichDaTonTai: false));
    }

    [Fact]
    public void Ke_hoach_anh_xa_layer_van_sinh_ra_ca_chi_lech_hoa_thuong()
    {
        // Bằng chứng ca nguy hiểm CÓ THẬT: MapAll trả cặp (m-duct-supp → M-DUCT-SUPP) vì so tên
        // theo Ordinal, và chính cặp đó là thứ rơi vào nhánh gộp nếu không có LayerMapper.QuyetDinh.
        var plan = new LayerMapper(V7).MapAll(["m-duct-supp"]);
        Assert.Equal("M-DUCT-SUPP", plan["m-duct-supp"]);
    }
}
