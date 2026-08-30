using XBoss.Cad.Core.Matching;
using Xunit;

namespace XBoss.Cad.Tests;

public class TokenMatcherTests
{
    [Theory]
    // Ca lỗi Việc 7.6: "THOAT" chứa substring "OA" nhưng KHÔNG được khớp token "OA".
    [InlineData("04_P_CAP_THOAT_NUOC_THAI", "OA", false)]
    [InlineData("04_P_CAP_THOAT_NUOC_THAI", "THOAT", true)]
    [InlineData("04_P_CAP_THOAT_NUOC_THAI", "THAI", true)]
    [InlineData("04_P_CAP_THOAT_NUOC_THAI", "CAP", true)]
    // Ranh giới là ký tự không phải [A-Z0-9] hoặc đầu/cuối chuỗi.
    [InlineData("M-DUCT-SUPP", "DUCT", true)]
    [InlineData("MDUCTS", "DUCT", false)]
    [InlineData("RA", "RA", true)]
    [InlineData("TRAY", "RA", false)]
    // Xuất hiện nhiều lần: lần sau mới đứng đúng ranh giới vẫn phải khớp.
    [InlineData("XRAX_RA", "RA", true)]
    [InlineData("", "RA", false)]
    public void HasToken_theo_ranh_gioi_token(string chuoi, string token, bool mongDoi)
    {
        Assert.Equal(mongDoi, TokenMatcher.HasToken(chuoi, token));
    }

    [Fact]
    public void HasToken_token_rong_khong_khop()
    {
        Assert.False(TokenMatcher.HasToken("ABC", ""));
    }

    [Fact]
    public void MatchesAny_khong_phan_biet_hoa_thuong()
    {
        Assert.True(TokenMatcher.MatchesAny("m-duct-supp", ["M-DUCT-SUPP"]));
        Assert.False(TokenMatcher.MatchesAny("m-duct-supp2x", ["M-DUCT-SUPP2XY"]));
    }
}
