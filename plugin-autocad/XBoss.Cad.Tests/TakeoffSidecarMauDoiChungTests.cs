using System.Text.Json;
using XBoss.Cad.Core.Reporting;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M101 PR5 — đóng lỗ hổng đối chứng 2 tầng cho sidecar `takeoff.json`. Trước test này, chỉ tầng 3
/// (TS, <c>tests/cad-takeoff-sidecar-doi-chung-2-tang.test.ts</c>) nạp lại
/// <c>plugin-autocad/doi-chung/takeoff-sidecar-mau.json</c>; tầng 2 (plugin, chính là bên SINH RA
/// sidecar này qua <see cref="TakeoffJsonReport"/>) chưa hề đối chiếu ngược lại tệp mẫu — đổi tên
/// một <c>[JsonPropertyName]</c> ở đây không bị bắt cho tới khi ra thực địa. Test này khẳng định cả
/// hai chiều, giống triết lý <c>BlockManifestTests</c>:
///   (a) tệp mẫu deserialize đủ vào model (mọi khoá bắt buộc có mặt, đúng kiểu);
///   (b) serialize lại (<see cref="TakeoffJsonReport.ToJson"/>) sinh đủ mọi khoá mà tệp mẫu có.
/// </summary>
public class TakeoffSidecarMauDoiChungTests
{
    private static string MauPath => Path.Combine(RepoPaths.DoiChungDir, "takeoff-sidecar-mau.json");

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    [Fact]
    public void Tep_mau_deserialize_dung_vao_TakeoffJsonReport()
    {
        var json = File.ReadAllText(MauPath);
        var report = JsonSerializer.Deserialize<TakeoffJsonReport>(json, JsonOpts);

        Assert.NotNull(report);
        Assert.Equal("2.0.0", report!.RulePackVersion);
        Assert.Equal("BD1.6 - TT AVIO", report.TenDuAn);
        Assert.Equal("ACMV", report.GoiThau);
        Assert.Equal("MB-TANG-05.dwg", report.TenBanVe);
        Assert.Equal("Kỹ sư A", report.NguoiBoc);
        Assert.Equal("2026-08-24", report.NgayIso);
        Assert.Equal(2, report.Lines.Count);
        Assert.Single(report.CanhBao);

        var dong0 = report.Lines[0];
        Assert.Equal("duct-supp", dong0.ItemId);
        Assert.Equal("M.01.01", dong0.BoqCode);
        Assert.Equal("HVAC", dong0.Group);
        Assert.Equal("Ống gió cấp", dong0.Ten);
        Assert.Equal("300x200", dong0.QuyCach);
        Assert.Equal("m", dong0.DonVi);
        Assert.Equal(1, dong0.SoDoiTuong);
        Assert.Equal(20.0, dong0.KhoiLuong);
        Assert.Equal(["D1"], dong0.Handles);
        Assert.Equal("300x200", dong0.Size);
        Assert.Equal("XData", dong0.NguonSize);
        Assert.Equal("Tầng 5", dong0.Vung);
        Assert.False(dong0.DanXuat);

        var dong1 = report.Lines[1];
        Assert.Equal("duct-cachnhiet", dong1.ItemId);
        Assert.True(dong1.DanXuat);
        Assert.Equal(1.6, dong1.HeSoQuyDoi);
        Assert.Equal(32.0, dong1.KlQuyDoi);
        Assert.Equal("đọc từ nhãn", dong1.NguonSize);
    }

    /// <summary>
    /// Serialize lại (<see cref="TakeoffJsonReport.ToJson"/>) phải sinh đủ MỌI khoá mà tệp mẫu có,
    /// ở cả hai cấp báo cáo/dòng — đổi tên <c>[JsonPropertyName]</c> phía C# mà không đổi tệp mẫu
    /// theo thì assert dưới đây đỏ ngay (thay vì đợi tầng TS report lỗi sau).
    /// </summary>
    [Fact]
    public void Serialize_lai_sinh_du_moi_khoa_ma_tep_mau_co()
    {
        var mauJson = File.ReadAllText(MauPath);
        using var mauDoc = JsonDocument.Parse(mauJson);
        var mauRoot = mauDoc.RootElement;

        var report = JsonSerializer.Deserialize<TakeoffJsonReport>(mauJson, JsonOpts)!;
        using var laiDoc = JsonDocument.Parse(report.ToJson());
        var lai = laiDoc.RootElement;

        foreach (var thuocTinh in mauRoot.EnumerateObject())
        {
            Assert.True(
                lai.TryGetProperty(thuocTinh.Name, out _),
                $"thiếu khoá cấp báo cáo \"{thuocTinh.Name}\" sau khi serialize lại");
        }

        var mauDong0 = mauRoot.GetProperty("lines").EnumerateArray().First();
        var laiDong0 = lai.GetProperty("lines").EnumerateArray().First();
        foreach (var thuocTinh in mauDong0.EnumerateObject())
        {
            Assert.True(
                laiDong0.TryGetProperty(thuocTinh.Name, out _),
                $"thiếu khoá cấp dòng \"{thuocTinh.Name}\" sau khi serialize lại");
        }
    }
}
