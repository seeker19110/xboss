using XBoss.Cad.Core.Draw;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR3 — quy ước layer của bộ lệnh vẽ (FR4/FR9) kẹp trên rule pack v4 THẬT của repo:
/// hậu tố nét biên luôn đọc từ rule pack (không hard-code) và màu/nét luôn có trong bảng CTB
/// nên bản vẽ vẽ ra không sinh lỗi "lineweight lệch CTB" của XBOSS_KIEMTRA (AC2).
/// </summary>
public class VeLayerStyleTests
{
    private static DrawToolsPack Pack() => DrawToolsConfig.Load(File.ReadAllText(RepoPaths.RulePackPath));

    [Fact]
    public void Layer_net_bien_ghep_tu_hau_to_cua_rule_pack()
    {
        var pack = Pack();
        var hvac = pack.DrawTools.Systems.Single(s => s.Id == "HVAC");
        var duct = hvac.Lines.Single(l => l.ItemId == "duct-supp");

        var bien = VeLayerStyle.LayerNetBien(duct.Layer, pack.DrawTools.EdgeLayerSuffix);

        Assert.Equal("M-DUCT-SUPPEDGE", bien);
        Assert.NotEqual(duct.Layer, bien);
    }

    [Fact]
    public void Aci_tim_phu_thuoc_edgeStyle()
    {
        // Ống gió (có nét biên) → nét tim mảnh ACI 4; ống tròn (không biên) → nét ống ACI 2.
        Assert.Equal(VeLayerStyle.AciTimCoNetBien, VeLayerStyle.AciChoTim("double"));
        Assert.Equal(VeLayerStyle.AciTimTran, VeLayerStyle.AciChoTim("none"));
        Assert.Equal(VeLayerStyle.AciTimTran, VeLayerStyle.AciChoTim(null));
    }

    [Fact]
    public void Moi_aci_bo_lenh_ve_dung_deu_co_quy_dinh_net_trong_bang_CTB()
    {
        var bang = Pack().RulePack.LineweightMap;

        foreach (var aci in new[]
                 {
                     VeLayerStyle.AciTimCoNetBien, VeLayerStyle.AciTimTran,
                     VeLayerStyle.AciNetBien, VeLayerStyle.AciNhan,
                 })
        {
            var mm = VeLayerStyle.LineweightMm(bang, aci);
            Assert.True(mm is > 0, $"ACI {aci} không có lineweight trong lineweightMap — layer tạo ra sẽ lệch CTB.");
        }
    }

    [Fact]
    public void Aci_khong_co_trong_bang_thi_tra_null_chu_khong_bia_so()
    {
        Assert.Null(VeLayerStyle.LineweightMm(Pack().RulePack.LineweightMap, 999));
    }

    [Fact]
    public void Layer_net_bien_cua_moi_tuyen_double_deu_khac_layer_tim()
    {
        var pack = Pack();
        foreach (var he in pack.DrawTools.Systems)
        {
            foreach (var line in he.Lines.Where(l => l.EdgeStyle == "double"))
            {
                var bien = VeLayerStyle.LayerNetBien(line.Layer, pack.DrawTools.EdgeLayerSuffix);
                Assert.NotEqual(line.Layer, bien);
                Assert.StartsWith(line.Layer, bien, StringComparison.Ordinal);
            }
        }
    }
}
