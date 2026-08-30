using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Layers;
using XBoss.Cad.Core.RulePack;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Đối chiếu LayerMapper C# với kết quả kỳ vọng của normalizeCadLayers() (TS) trên
/// cùng corpus tên layer thật — cùng bộ ca với tests/engineering-cad-rule-pack.test.ts.
/// Lệch bất kỳ ca nào = plugin đã trôi khỏi rule pack (ADR-0006 nguyên tắc 1).
/// </summary>
public class LayerMapperTests
{
    private static readonly LayerMapper Mapper = new(RepoPaths.LoadRulePack());

    [Theory]
    [InlineData("01_M_ONG_GIO_CAP_CHINH", "M-DUCT-SUPP")]
    [InlineData("02_M_ONG_GIO_HOI_AHU", "M-DUCT-RETN")]
    [InlineData("03_P_ONG_NUOC_LANH_CHW", "M-CHW-PIPE")]
    // Ca Việc 7.6: THOAT/THAI là token riêng, không được trúng nhầm nhóm HVAC qua "OA"/"EA".
    [InlineData("04_P_CAP_THOAT_NUOC_THAI", "P-PIPE-SANR")]
    // Thứ tự nhóm: DIEN phải trúng ELECTRICAL dù có token CAP (nghĩa ống nước ở nhóm PIPING).
    [InlineData("05_E_DIEN_MANG_CAP_PWR", "E-TRAY-PWRR")]
    [InlineData("06_F_PCCC_SPRINKLER", "F-SPRN-PIPE")]
    [InlineData("07_S_TRUC_COT_KET_CAU", "S-GRID-COLS")]
    [InlineData("08_G_GHI_CHU_DIM_TEXT", "G-ANNO-TEXT")]
    [InlineData("MANG_CAP_DIEN", "E-TRAY-PWRR")]
    [InlineData("THOAT", "P-PIPE-SANR")]
    // Không khớp nhóm nào → giữ nguyên (fallback keep-original).
    [InlineData("0", "0")]
    [InlineData("ZZZ_KHONG_KHOP_GI", "ZZZ_KHONG_KHOP_GI")]
    // Tên đã chuẩn hóa thì giữ nguyên (bất biến idempotent — vá 2026-08-25).
    [InlineData("M-CHW-PIPE", "M-CHW-PIPE")]
    [InlineData("M-DUCT-RETN", "M-DUCT-RETN")]
    [InlineData("M-DUCT-EXHT", "M-DUCT-EXHT")]
    [InlineData("P-PIPE-SANR", "P-PIPE-SANR")]
    [InlineData("F-SPRN-PIPE", "F-SPRN-PIPE")]
    [InlineData("ELV-CABL-TRAY", "ELV-CABL-TRAY")]
    // Layer nét biên M100 (<target>+drawTools.edgeLayerSuffix) — gộp về layer tim = bóc trùng KL.
    [InlineData("M-DUCT-SUPPEDGE", "M-DUCT-SUPPEDGE")]
    [InlineData("F-SPRN-PIPEEDGE", "F-SPRN-PIPEEDGE")]
    // Tên đã chuẩn nhưng viết thường → chỉ chuẩn hoá hoa/thường, không đổi hệ.
    [InlineData("m-duct-exht", "M-DUCT-EXHT")]
    public void Map_khop_ket_qua_normalizeCadLayers(string layer, string mongDoi)
    {
        Assert.Equal(mongDoi, Mapper.Map(layer));
    }

    /// <summary>
    /// Bất biến: Map(Map(x)) == Map(x) với MỌI layer đích khai trong rule pack + biến thể nét biên.
    /// Danh sách lấy từ chính rule pack, không hard-code — thêm hệ mới vào layerMap là ca tự phủ.
    /// </summary>
    [Fact]
    public void Map_idempotent_tren_moi_layer_dich_cua_rule_pack()
    {
        var pack = RepoPaths.LoadRulePack();
        var hauTo = pack.DrawTools?.EdgeLayerSuffix ?? "";
        Assert.False(string.IsNullOrEmpty(hauTo), "Rule pack hiện hành phải khai drawTools.edgeLayerSuffix");

        foreach (var target in pack.LayerMap.Groups.SelectMany(g => g.Branches).Select(b => b.Target).Distinct())
        {
            Assert.Equal(target, Mapper.Map(target));
            Assert.Equal(target + hauTo, Mapper.Map(target + hauTo));
        }
    }

    /// <summary>Idempotent cả trên tên bẩn: chuẩn hóa lần 2 không đổi kết quả lần 1.</summary>
    [Theory]
    [InlineData("01_M_ONG_GIO_CAP_CHINH")]
    [InlineData("04_P_CAP_THOAT_NUOC_THAI")]
    [InlineData("06_F_PCCC_SPRINKLER")]
    [InlineData("DIEN_NHE_ELV_CAMERA")]
    [InlineData("ZZZ_KHONG_KHOP_GI")]
    public void Map_lan_hai_khong_doi_ket_qua(string layer)
    {
        var lan1 = Mapper.Map(layer);
        Assert.Equal(lan1, Mapper.Map(lan1));
    }

    /// <summary>
    /// Rule pack v1–v3 không có khối <c>drawTools</c>: vẫn nạp được, vẫn miễn trừ layer đích;
    /// chỉ không biết hậu tố nét biên (chưa có lệnh vẽ M100 nên chưa có layer biên nào).
    /// </summary>
    [Fact]
    public void Map_chiu_duoc_rule_pack_khong_co_drawTools()
    {
        var v3 = RulePackLoader.Load(File.ReadAllText(RepoPaths.RulePackPathCua("v3.json")));
        Assert.Null(v3.DrawTools);

        var mapper = new LayerMapper(v3);
        Assert.Equal("M-DUCT-EXHT", mapper.Map("M-DUCT-EXHT"));
        Assert.Equal("F-SPRN-PIPE", mapper.Map("F-SPRN-PIPE"));
        Assert.Equal("M-DUCT-SUPP", mapper.Map("01_M_ONG_GIO_CAP_CHINH"));
    }

    /// <summary>
    /// Hai model cùng đọc khóa <c>drawTools.edgeLayerSuffix</c> (bản rút gọn cho LayerMapper và
    /// bản đầy đủ cho bộ lệnh vẽ) — phải luôn thấy CÙNG một giá trị, nếu không thì layer nét biên
    /// lệnh vẽ tạo ra sẽ khác layer mà bước chuẩn hóa miễn trừ.
    /// </summary>
    [Fact]
    public void Hau_to_net_bien_doc_tu_2_model_phai_khop()
    {
        var json = File.ReadAllText(RepoPaths.RulePackPath);
        Assert.Equal(
            DrawToolsConfig.Load(json).DrawTools.EdgeLayerSuffix,
            RulePackLoader.Load(json).DrawTools?.EdgeLayerSuffix);
    }

    [Fact]
    public void MapAll_chi_tra_layer_thuc_su_doi_ten()
    {
        var plan = Mapper.MapAll(["0", "01_M_ONG_GIO_CAP_CHINH", "M-DUCT-SUPP"]);
        Assert.Single(plan);
        Assert.Equal("M-DUCT-SUPP", plan["01_M_ONG_GIO_CAP_CHINH"]);
    }
}
