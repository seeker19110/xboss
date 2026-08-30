using XBoss.Cad.Core.Api;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M118 PR3 (FR3) — <see cref="SoSanhPhienBan.SoLechPhienBan"/>: so version của plugin đang
/// chạy với version server phát hành. Server là NGUỒN SỰ THẬT — so KHÁC chuỗi sau chuẩn hoá,
/// KHÔNG so lớn/nhỏ; null/rỗng một trong hai vế ⇒ "chưa rõ", không bao giờ báo lệch khi không
/// chắc (AC5).
/// </summary>
public sealed class PhienBanPluginTests
{
    [Fact]
    public void Lech_KhiHaiVersionKhacNhau()
    {
        Assert.Equal(LechPhienBan.Lech, SoSanhPhienBan.SoLechPhienBan("1.0.0", "1.2.0"));
    }

    [Fact]
    public void Khop_KhiHaiVersionGiongHet()
    {
        Assert.Equal(LechPhienBan.Khop, SoSanhPhienBan.SoLechPhienBan("1.2.0", "1.2.0"));
    }

    [Theory]
    [InlineData(null, "1.2.0")]
    [InlineData("1.0.0", null)]
    [InlineData(null, null)]
    [InlineData("", "1.2.0")]
    [InlineData("1.0.0", "   ")]
    public void ChuaRo_KhiMotVeThieuHoacRong(string? cuaPlugin, string? cuaServer)
    {
        Assert.Equal(LechPhienBan.ChuaRo, SoSanhPhienBan.SoLechPhienBan(cuaPlugin, cuaServer));
    }

    [Fact]
    public void Khop_BoQuaHauToBuildMetadataSauDauCong()
    {
        // SourceLink có thể gắn "+<hash>" — không phải khác version thật.
        Assert.Equal(LechPhienBan.Khop, SoSanhPhienBan.SoLechPhienBan("1.2.0+abc123def", "1.2.0"));
        Assert.Equal(LechPhienBan.Khop, SoSanhPhienBan.SoLechPhienBan("1.2.0", "1.2.0+xyz789"));
        Assert.Equal(LechPhienBan.Khop, SoSanhPhienBan.SoLechPhienBan("1.2.0+aaa", "1.2.0+bbb"));
    }

    [Fact]
    public void Lech_VanLechSauKhiBoHauToBuildMetadata()
    {
        Assert.Equal(LechPhienBan.Lech, SoSanhPhienBan.SoLechPhienBan("1.0.0+abc", "1.2.0+def"));
    }

    [Fact]
    public void ChuanHoa_CatKhoangTrangHaiDau()
    {
        Assert.Equal(LechPhienBan.Khop, SoSanhPhienBan.SoLechPhienBan("  1.2.0  ", "1.2.0"));
    }
}
