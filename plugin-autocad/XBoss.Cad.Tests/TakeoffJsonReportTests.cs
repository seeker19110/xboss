using System.Text.Json;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Reporting;
using XBoss.Cad.Core.RulePack;
using XBoss.Cad.Core.Takeoff;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>Sidecar JSON của XBOSS_BOCKL_XUAT — cùng nguồn dữ liệu với Excel,
/// máy đọc được (chuẩn bị PR5 gửi kèm upload). Version rule pack trong mọi báo cáo (FR1).</summary>
public class TakeoffJsonReportTests
{
    [Fact]
    public void Sidecar_JSON_phan_anh_dung_ket_qua_boc()
    {
        var pack = RepoPaths.LoadRulePack();
        var may = new TakeoffCalculator(pack.Takeoff, pack.Version);
        var kq = may.Compute(
        [
            new MeasuredObject { Handle = "D1", Layer = "M-DUCT-SUPP", Kind = MeasuredKind.Curve, RawLength = 20_000 },
        ], insUnits: 4, xrefSkippedCount: 1);
        var meta = new BoqExcelMeta
        {
            TenDuAn = "BD1.6 - TT AVIO",
            GoiThau = "ACMV",
            TenBanVe = "MB-TANG-05.dwg",
            RulePackVersion = pack.Version,
            NguoiBoc = "Kỹ sư A",
            NgayIso = "2026-08-24",
        };

        var root = JsonDocument.Parse(TakeoffJsonReport.TuKetQua(kq, meta).ToJson()).RootElement;
        Assert.Equal(pack.Version, root.GetProperty("rulePackVersion").GetString());
        Assert.Equal("BD1.6 - TT AVIO", root.GetProperty("tenDuAn").GetString());
        Assert.Equal("MB-TANG-05.dwg", root.GetProperty("tenBanVe").GetString());
        var line = Assert.Single(root.GetProperty("lines").EnumerateArray());
        Assert.Equal("duct-supp", line.GetProperty("itemId").GetString());
        Assert.Equal(20.0, line.GetProperty("khoiLuong").GetDouble());
        Assert.Equal(1, line.GetProperty("soDoiTuong").GetInt32());
        Assert.Equal("D1", line.GetProperty("handles")[0].GetString());
    }
}
