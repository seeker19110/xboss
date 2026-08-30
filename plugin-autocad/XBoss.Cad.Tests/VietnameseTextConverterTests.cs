using System.Text;
using XBoss.Cad.Core.Fonts;
using Xunit;

namespace XBoss.Cad.Tests;

public class VietnameseTextConverterTests
{
    private static readonly VietnameseTextConverter Converter = new(RepoPaths.LoadRulePack().FontMap);

    [Fact]
    public void Tcvn3_moi_ky_tu_trong_rule_pack_deu_giai_dung()
    {
        var chars = RepoPaths.LoadRulePack().FontMap.Tcvn3.Chars;
        Assert.True(chars.Count > 60, "Bảng TCVN3 quá ít mục — nghi nạp thiếu");
        foreach (var (cu, moi) in chars)
        {
            Assert.Equal(moi.Normalize(NormalizationForm.FormC), Converter.Convert(cu, LegacyFontKind.Tcvn3));
        }
    }

    [Fact]
    public void Vni_moi_cap_trong_rule_pack_deu_giai_dung()
    {
        var pairs = RepoPaths.LoadRulePack().FontMap.Vni.Pairs;
        Assert.True(pairs.Count > 100, "Bảng VNI quá ít mục — nghi nạp thiếu");
        foreach (var p in pairs)
        {
            Assert.Equal(p[1].Normalize(NormalizationForm.FormC), Converter.Convert(p[0], LegacyFontKind.Vni));
        }
    }

    [Theory]
    // Thứ tự cặp VNI là hợp đồng: a61 phải ăn trước a6.
    [InlineData("ba61t", "bất")]
    [InlineData("d9a5i", "đại")]
    [InlineData("OÁng gioù", "OÁng gioù")] // chuỗi không chứa mã VNI dạng chữ+số → giữ nguyên
    public void Vni_thay_theo_thu_tu(string vao, string mongDoi)
    {
        Assert.Equal(mongDoi.Normalize(NormalizationForm.FormC), Converter.Convert(vao, LegacyFontKind.Vni));
    }

    [Fact]
    public void CadSymbols_ap_cho_moi_bang_ma_ke_ca_font_khong_ro()
    {
        Assert.Equal("Ø21", Converter.Convert("%%c21", LegacyFontKind.None));
        Assert.Equal("±5°", Converter.Convert("%%p5%%d", LegacyFontKind.Tcvn3));
    }

    [Fact]
    public void Khong_ap_vni_mu_len_font_khong_ro_de_bao_ve_ma_hang()
    {
        // "A1" là mã hàng ODNN hợp lệ — VNI mù sẽ phá thành "Á".
        Assert.Equal("Khu A1", Converter.Convert("Khu A1", LegacyFontKind.None));
        Assert.False(Converter.ContainsLegacyEncoding("Khu A1"));
        // Nhưng khi font là VNI thật thì phải giải.
        Assert.Equal("Khu Á", Converter.Convert("Khu A1", LegacyFontKind.Vni));
        Assert.True(Converter.ContainsLegacyEncoding("Khu A1", "VNI-Times"));
    }

    [Theory]
    [InlineData(".VnTime", LegacyFontKind.Tcvn3)]
    [InlineData(".VnArial Narrow", LegacyFontKind.Tcvn3)]
    [InlineData("VNI-Helve", LegacyFontKind.Vni)]
    [InlineData("Arial", LegacyFontKind.None)]
    [InlineData("txt.shx", LegacyFontKind.None)]
    [InlineData(null, LegacyFontKind.None)]
    public void DetectFontKind_theo_quy_uoc_ten_font(string? font, LegacyFontKind mongDoi)
    {
        Assert.Equal(mongDoi, VietnameseTextConverter.DetectFontKind(font));
    }

    [Fact]
    public void Ket_qua_luon_chuan_NFC()
    {
        var giai = Converter.Convert("b¶n vÏ thi c«ng", LegacyFontKind.Tcvn3);
        Assert.True(giai.IsNormalized(NormalizationForm.FormC));
        Assert.Equal("bản vĩ thi công", giai); // 'Ï' → 'ĩ' theo đúng bảng rule pack v1
    }

    [Fact]
    public void ContainsLegacyEncoding_font_khong_ro_chi_do_ky_tu_dac_trung_tcvn3()
    {
        // '¶'/'Ï' là ký tự đặc trưng TCVN3 (không phải chữ tiếng Việt hợp lệ) → dò được.
        Assert.True(Converter.ContainsLegacyEncoding("B¶n vÏ sè 1"));
        // Text Unicode chuẩn KHÔNG được nhận nhầm dù 'ó'/'ô' trùng khóa TCVN3.
        Assert.False(Converter.ContainsLegacyEncoding("Ống gió cấp"));
        // TCVN3 toàn ký tự nhập nhằng ('è' 'ã' 'Ê' đều là chữ hợp lệ) + font không rõ →
        // chấp nhận bỏ qua (bảo thủ, không phá text đúng); có font .Vn* thì bắt được.
        Assert.False(Converter.ContainsLegacyEncoding("èng giã cÊp"));
        Assert.True(Converter.ContainsLegacyEncoding("èng giã cÊp", ".VnTime"));
    }

    [Fact]
    public void KindDeSua_dung_CHUNG_tieu_chi_voi_phep_kiem_bao_gi_thi_sua_duoc_nay()
    {
        // Bất biến chống lặp vô tận cho kỹ sư: phép kiểm 4 BÁO chuỗi nào thì bước 3 phải SỬA được
        // chuỗi đó. Trước 2026-08-26 hai bên lệch nhau (kiểm dò nội dung, sửa chỉ nhìn tên font)
        // nên bản vẽ thật báo 141 text mà chuẩn hóa sửa 0.
        string[] mauCanSua = ["B¶n vÏ sè 1", "èng giã cÊp"];
        string?[] font = [null, ".VnTime"];
        foreach (var chu in mauCanSua)
        {
            foreach (var f in font)
            {
                var bao = Converter.ContainsLegacyEncoding(chu, f);
                var suaDuoc = Converter.KindDeSua(chu, f) != LegacyFontKind.None &&
                              !string.Equals(
                                  Converter.Convert(chu, Converter.KindDeSua(chu, f)),
                                  chu,
                                  StringComparison.Ordinal);
                Assert.Equal(bao, suaDuoc);
            }
        }
    }

    [Fact]
    public void KindDeSua_khong_doan_VNI_mu_de_khong_pha_ma_hang()
    {
        // "A1"/"E5" là mã hàng/tên trục hợp lệ — đoán VNI khi không biết font sẽ phá chúng.
        Assert.Equal(LegacyFontKind.None, Converter.KindDeSua("A1 E5 D60"));
        // Có tên font VNI thì mới áp bảng VNI.
        Assert.Equal(LegacyFontKind.Vni, Converter.KindDeSua("A1 E5 D60", "VNI-Times"));
        // Text Unicode chuẩn: không đụng tới.
        Assert.Equal(LegacyFontKind.None, Converter.KindDeSua("Ống gió cấp"));
    }
}
