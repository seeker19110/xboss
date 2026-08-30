using System.Text.RegularExpressions;
using XBoss.Cad.Core.Ui;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M102 — danh mục lệnh <see cref="LenhCatalog"/> (nguồn sự thật của Ribbon/bảng điều khiển)
/// phải khớp TUYỆT ĐỐI với các <c>[CommandMethod("...")]</c> khai trong mã Adapter.
/// Thêm/xóa/đổi tên lệnh mà quên cập nhật danh mục → test này đỏ (chống trôi UI ↔ lệnh,
/// cùng tinh thần đối chứng 2 tầng của ADR-0006).
/// </summary>
public sealed class LenhCatalogTests
{
    private static readonly Regex MauCommandMethod = new("\\[CommandMethod\\(\"([A-Z0-9_]+)\"", RegexOptions.Compiled);

    private static string AdapterDir =>
        Path.Combine(Path.GetDirectoryName(RepoPaths.DoiChungDir)!, "XBoss.Cad.Acad");

    private static HashSet<string> LenhTrongAdapter()
    {
        var lenh = new HashSet<string>(StringComparer.Ordinal);
        foreach (var tep in Directory.EnumerateFiles(AdapterDir, "*.cs", SearchOption.AllDirectories))
        {
            foreach (Match m in MauCommandMethod.Matches(File.ReadAllText(tep)))
                lenh.Add(m.Groups[1].Value);
        }
        Assert.NotEmpty(lenh); // dò nhầm thư mục thì fail rõ ràng, không xanh giả
        return lenh;
    }

    [Fact]
    public void DanhMucKhopVoiCommandMethodTrongAdapter()
    {
        var trongAdapter = LenhTrongAdapter();
        var trongCatalog = LenhCatalog.TatCa.Select(l => l.Ten).ToHashSet(StringComparer.Ordinal);

        var thieuTrongCatalog = trongAdapter.Except(trongCatalog).Order().ToList();
        var thuaTrongCatalog = trongCatalog.Except(trongAdapter).Order().ToList();

        Assert.True(thieuTrongCatalog.Count == 0,
            $"Lệnh có trong Adapter nhưng thiếu trong LenhCatalog (Ribbon sẽ thiếu nút): {string.Join(", ", thieuTrongCatalog)}");
        Assert.True(thuaTrongCatalog.Count == 0,
            $"Lệnh có trong LenhCatalog nhưng không tồn tại trong Adapter (nút Ribbon chết): {string.Join(", ", thuaTrongCatalog)}");
    }

    [Fact]
    public void MoiLenhCoNhanVaMoTaTiengVietKhongRong()
    {
        foreach (var l in LenhCatalog.TatCa)
        {
            Assert.False(string.IsNullOrWhiteSpace(l.Nhan), $"{l.Ten}: nhãn rỗng");
            Assert.False(string.IsNullOrWhiteSpace(l.MoTa), $"{l.Ten}: mô tả (tooltip) rỗng");
        }
    }

    [Fact]
    public void TenLenhVaNhanKhongTrung()
    {
        Assert.Equal(LenhCatalog.TatCa.Count, LenhCatalog.TatCa.Select(l => l.Ten).Distinct().Count());
        Assert.Equal(LenhCatalog.TatCa.Count, LenhCatalog.TatCa.Select(l => l.Nhan).Distinct().Count());
    }

    [Fact]
    public void MoiNhomCoDungMotLenhChinh()
    {
        foreach (var nhom in LenhCatalog.TheoNhom())
        {
            Assert.True(nhom.Count(l => l.LenhChinh) == 1,
                $"Nhóm {nhom.Key} phải có đúng 1 lệnh chính (nút to trên Ribbon)");
        }
    }
}
