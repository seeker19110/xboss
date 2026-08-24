using XBoss.Cad.Core.Layers;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Đối chiếu LayerMapper C# với kết quả kỳ vọng của normalizeCadLayers() (TS) trên
/// cùng corpus tên layer thật — cùng bộ ca với tests/engineering-cad-rule-pack.test.ts.
/// Lệch bất kỳ ca nào = plugin đã trôi khỏi rule pack (ADR-0006 nguyên tắc 1).
/// </summary>
public class LayerMapperTests
{
    private static readonly LayerMapper Mapper = new(RepoPaths.LoadRulePackV2().LayerMap);

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
    // Known issue đã ghi trong rule pack: áp lại tên đã chuẩn hóa (không idempotent chủ đích).
    [InlineData("M-CHW-PIPE", "M-CHW-PIPE")]
    [InlineData("M-DUCT-RETN", "M-DUCT-RETN")]
    public void Map_khop_ket_qua_normalizeCadLayers(string layer, string mongDoi)
    {
        Assert.Equal(mongDoi, Mapper.Map(layer));
    }

    [Fact]
    public void MapAll_chi_tra_layer_thuc_su_doi_ten()
    {
        var plan = Mapper.MapAll(["0", "01_M_ONG_GIO_CAP_CHINH", "M-DUCT-SUPP"]);
        Assert.Single(plan);
        Assert.Equal("M-DUCT-SUPP", plan["01_M_ONG_GIO_CAP_CHINH"]);
    }
}
