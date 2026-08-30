using System.Text.Json.Nodes;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Standardize;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M102 §6.1/§6.2 — 2 bước chuẩn hóa mới của rule pack v8 (12 đóng polyline gần kín, 13 quy block
/// lạc chuẩn về thư viện). Kiểm kế hoạch THUẦN do Core lập, không đụng AutoCAD: ca sửa đúng, ca
/// giữ nguyên (không bịa hình học), ca chỉ-báo, và bằng chứng "mặc định tắt = v7".
/// </summary>
public class ChuanHoaV8Tests
{
    private const double ToMm = 1.0; // bản vẽ đơn vị mm

    private static CadRulePack Pack(string khoi, Action<JsonObject> chinh)
    {
        var goc = JsonNode.Parse(File.ReadAllText(RepoPaths.RulePackPath))!.AsObject();
        chinh(goc[khoi]!.AsObject());
        return RulePackLoader.Load(goc.ToJsonString());
    }

    private static PolylineClosePolicySection ChinhSachDong(
        double nguongMm = 5, bool chiBaoCao = false, params string[] layers) =>
        Pack("polylineClosePolicy", o =>
        {
            o["enabled"] = true;
            o["gapCloseToleranceMm"] = nguongMm;
            o["reportOnly"] = chiBaoCao;
            o["onlyOnLayersMatchAny"] = new JsonArray(layers.Select(l => (JsonNode)l!).ToArray());
        }).PolylineClosePolicy;

    private static PolylineHienCo Pl(string handle, double khe, int soDinh = 4, string layer = "M-DUCT-SUPP") =>
        new() { Handle = handle, Layer = layer, KhoangCachDauCuoi = khe, SoDinh = soDinh };

    private static BlockMapSection ChinhSachBlock(bool chiBaoCao, params (string Target, string Alias)[] rules) =>
        Pack("blockMap", o =>
        {
            o["enabled"] = true;
            o["reportOnly"] = chiBaoCao;
            o["rules"] = new JsonArray(rules
                .Select(r => (JsonNode)new JsonObject
                {
                    ["target"] = r.Target,
                    ["aliasMatchAny"] = new JsonArray(r.Alias),
                })
                .ToArray());
        }).BlockMap;

    private static BlockRefHienCo Br(string handle, string ten, bool nacDanh = false) =>
        new() { Handle = handle, TenBlock = ten, LaNacDanh = nacDanh };

    // ===== Mặc định: v8 = v7 =====

    [Fact]
    public void Mac_dinh_tat_thi_ca_hai_buoc_tra_ke_hoach_rong()
    {
        var pack = RepoPaths.LoadRulePack();

        var dong = ChuanHoaMoRong.LapKeHoachDongPolyline(pack.PolylineClosePolicy, [Pl("A1", 3)], ToMm);
        var block = ChuanHoaMoRong.LapKeHoachBlock(pack.BlockMap, [Br("B1", "FCU_OLD")]);

        Assert.True(dong.Rong);
        Assert.True(block.Rong);
    }

    // ===== (12) Đóng polyline gần kín =====

    [Fact]
    public void AC1_khe_duoi_nguong_thi_dong_khe_tren_nguong_thi_giu_nguyen()
    {
        var kh = ChuanHoaMoRong.LapKeHoachDongPolyline(
            ChinhSachDong(nguongMm: 5), [Pl("A1", 3), Pl("A2", 8)], ToMm);

        var thayDoi = Assert.Single(kh.ThayDoi);
        Assert.Equal("A1", thayDoi.Handle);
        Assert.Equal(CachDong.NoiThemDoan, thayDoi.Cach);
        Assert.Equal(3, thayDoi.KhoangCachMm);
        Assert.Contains(kh.CanhBao, c => c.Contains("khe lớn hơn 5mm", StringComparison.Ordinal));
    }

    [Fact]
    public void Hai_dau_gan_trung_thi_chi_bat_co_Closed_khong_them_hinh_hoc()
    {
        var kh = ChuanHoaMoRong.LapKeHoachDongPolyline(ChinhSachDong(), [Pl("A1", 0.0005)], ToMm);

        Assert.Equal(CachDong.BatCoClosed, Assert.Single(kh.ThayDoi).Cach);
    }

    [Fact]
    public void Polyline_da_kin_khe_bang_0_thi_khong_dung_toi()
    {
        var kh = ChuanHoaMoRong.LapKeHoachDongPolyline(ChinhSachDong(), [Pl("A1", 0)], ToMm);
        Assert.True(kh.Rong);
    }

    [Fact]
    public void Duoi_3_dinh_thi_khong_dong_vi_doan_noi_chong_len_chinh_no()
    {
        var kh = ChuanHoaMoRong.LapKeHoachDongPolyline(ChinhSachDong(), [Pl("A1", 2, soDinh: 2)], ToMm);

        Assert.True(kh.Rong);
        Assert.Contains(kh.CanhBao, c => c.Contains("dưới 3 đỉnh", StringComparison.Ordinal));
    }

    [Fact]
    public void Loc_theo_layer_thi_layer_ngoai_danh_sach_khong_bi_dung_toi()
    {
        var kh = ChuanHoaMoRong.LapKeHoachDongPolyline(
            ChinhSachDong(layers: "M-DUCT-SUPP"),
            [Pl("A1", 2), Pl("A2", 2, layer: "P-PIPE-DOMW")],
            ToMm);

        Assert.Equal("A1", Assert.Single(kh.ThayDoi).Handle);
    }

    [Fact]
    public void Nguong_khai_bang_mm_van_dung_khi_ban_ve_ve_bang_met()
    {
        // Bản vẽ đơn vị mét: khe 0.003 đơn vị bản vẽ = 3mm → dưới ngưỡng 5mm.
        var kh = ChuanHoaMoRong.LapKeHoachDongPolyline(ChinhSachDong(), [Pl("A1", 0.003)], toMm: 1000);

        Assert.Equal(3, Assert.Single(kh.ThayDoi).KhoangCachMm);
    }

    [Fact]
    public void AC2_reportOnly_van_liet_ke_du_nhung_danh_dau_chi_bao_cao()
    {
        var kh = ChuanHoaMoRong.LapKeHoachDongPolyline(
            ChinhSachDong(chiBaoCao: true), [Pl("A1", 3)], ToMm);

        Assert.True(kh.ChiBaoCao);
        Assert.Single(kh.ThayDoi);
    }

    // ===== (13) Quy block lạc chuẩn =====

    [Fact]
    public void AC3_block_lac_chuan_duoc_liet_ke_va_mac_dinh_chi_bao()
    {
        var kh = ChuanHoaMoRong.LapKeHoachBlock(
            ChinhSachBlock(chiBaoCao: true, ("FCU-STD", "FCU_OLD")),
            [Br("B1", "FCU_OLD"), Br("B2", "FCU-STD")]);

        var thayDoi = Assert.Single(kh.ThayDoi);
        Assert.Equal(("B1", "FCU_OLD", "FCU-STD"), (thayDoi.Handle, thayDoi.TenCu, thayDoi.TenMoi));
        Assert.True(kh.ChiBaoCao);
        Assert.Contains(kh.CanhBao, c => c.Contains("Chỉ BÁO", StringComparison.Ordinal));
    }

    [Fact]
    public void Block_nac_danh_khong_bao_gio_bi_thay()
    {
        var kh = ChuanHoaMoRong.LapKeHoachBlock(
            ChinhSachBlock(chiBaoCao: false, ("FCU-STD", "FCU_OLD")),
            [Br("B1", "*U12", nacDanh: true)]);

        Assert.True(kh.Rong);
        Assert.Contains(kh.CanhBao, c => c.Contains("nặc danh", StringComparison.Ordinal));
    }

    [Fact]
    public void Khop_theo_ranh_gioi_token_khong_phai_substring_tho()
    {
        // "FCU" là token trong "FCU_OLD" nhưng KHÔNG phải token trong "FCUX" — cùng luật với layerMap.
        var kh = ChuanHoaMoRong.LapKeHoachBlock(
            ChinhSachBlock(chiBaoCao: false, ("FCU-STD", "FCU")),
            [Br("B1", "FCU_OLD"), Br("B2", "FCUX")]);

        Assert.Equal("B1", Assert.Single(kh.ThayDoi).Handle);
    }

    [Fact]
    public void Block_khong_khop_quy_dinh_nao_thi_khong_dung_toi()
    {
        var kh = ChuanHoaMoRong.LapKeHoachBlock(
            ChinhSachBlock(chiBaoCao: false, ("FCU-STD", "FCU_OLD")),
            [Br("B1", "AHU_CU")]);

        Assert.True(kh.Rong);
    }
}
