using System.Text.RegularExpressions;
using XBoss.Cad.Core.Inspection;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// Hai bất biến đúc kết từ hai sự cố THẬT trên bản vẽ MEP có xref (2026-08-26):
/// <c>XBOSS_VE_NEN</c> chết <c>eInvalidKey</c> và <c>XBOSS_BATCH</c> chết <c>eOnLockedLayer</c>.
///
/// <para>1. <b>Bỏ qua xref</b> — quy tắc dự án: plugin KHÔNG đụng bất cứ thứ gì thuộc xref. Bản
/// ghi bảng ký hiệu của xref mở ForWrite là ném <c>eInvalidKey</c> và rollback cả lệnh; nội dung
/// xref có sửa được cũng mất trắng ở lần reload. Cổng AcadShim chỉ biên dịch, KHÔNG chạy được
/// bản vẽ, nên lớp lỗi này phải canh bằng bất biến trên MÃ NGUỒN (cùng cách
/// <see cref="LenhCatalogTests"/> soi <c>[CommandMethod]</c>).</para>
///
/// <para>2. <b>Mở khóa tạm phải khóa lại</b> — pipeline chuẩn hóa mở khóa layer để sửa được thực
/// thể; quên <c>finally</c> là trả bản vẽ của kỹ sư về với layer mở toang.</para>
/// </summary>
public sealed class XrefVaKhoaLayerTests
{
    // ===== 1. Inspector nói rõ phạm vi kiểm khi đã bỏ qua phần xref =====

    private static DrawingSnapshot SnapshotRong(XrefBoQua? xref) => new()
    {
        Layers = [],
        Entities = [],
        InsUnits = 4, // mm
        XrefDaBoQua = xref,
    };

    private static InspectionReport Kiem(DrawingSnapshot snapshot) =>
        new Inspector(RepoPaths.LoadRulePack()).Run(snapshot);

    [Fact]
    public void BaoSoLuongPhanXrefDaBoQua()
    {
        var baoCao = Kiem(SnapshotRong(new XrefBoQua { SoLayer = 12, SoKhoiChen = 3 }));

        var dong = Assert.Single(baoCao.CanhBao, c => c.Contains("xref", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("12 layer của xref", dong);
        Assert.Contains("3 khối chèn xref", dong);
        // Bỏ qua mà im lặng là để kỹ sư tưởng cả bản vẽ đã được kiểm — phải nói chỗ sửa thật.
        Assert.Contains("tệp tham chiếu", dong);
    }

    [Fact]
    public void KhongCoXrefThiKhongBaoGiDu()
    {
        Assert.DoesNotContain(Kiem(SnapshotRong(null)).CanhBao, c => c.Contains("xref", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(
            Kiem(SnapshotRong(new XrefBoQua())).CanhBao,
            c => c.Contains("xref", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void ChiCoMotLoaiThiChiKeLoaiDo()
    {
        var dong = Assert.Single(
            Kiem(SnapshotRong(new XrefBoQua { SoLayer = 5 })).CanhBao,
            c => c.Contains("xref", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("5 layer của xref", dong);
        Assert.DoesNotContain("khối chèn", dong);
    }

    // ===== 2. Bất biến trên mã nguồn Adapter =====

    private static string AdapterDir =>
        Path.Combine(Path.GetDirectoryName(RepoPaths.DoiChungDir)!, "XBoss.Cad.Acad");

    /// <summary>Lối thoát có khai báo: vòng lặp nào CỐ Ý không lọc xref phải giải thích tại chỗ
    /// bằng dấu này (xem <c>VeTranginCommands</c> — đóng băng layer theo viewport).</summary>
    private const string LoiThoat = "xref-ok";

    private static IEnumerable<string> TepAdapter() =>
        Directory.EnumerateFiles(AdapterDir, "*.cs", SearchOption.AllDirectories).Order();

    /// <summary>Tên biến đang giữ một bảng ký hiệu loại <paramref name="loaiBang"/> trong tệp.</summary>
    private static HashSet<string> BienBang(string ma, string loaiBang)
    {
        var bien = new HashSet<string>(StringComparer.Ordinal);
        foreach (Match m in Regex.Matches(ma, @"var\s+(\w+)\s*=\s*\(" + loaiBang + @"\)"))
            bien.Add(m.Groups[1].Value);
        return bien;
    }

    /// <summary>Thân của mỗi vòng <c>foreach (ObjectId x in &lt;bảng&gt;)</c> trong tệp (khớp ngoặc nhọn).</summary>
    private static IEnumerable<(int Dong, string Than)> ThanVongDuyet(string ma, IReadOnlySet<string> bang)
    {
        foreach (Match m in Regex.Matches(ma, @"foreach\s*\(\s*ObjectId\s+\w+\s+in\s+(\w+)\s*\)"))
        {
            if (!bang.Contains(m.Groups[1].Value)) continue;
            var dong = ma.Take(m.Index).Count(c => c == '\n') + 1;
            var mo = ma.IndexOf('{', m.Index + m.Length);
            if (mo < 0)
            {
                yield return (dong, "");
                continue;
            }
            var sau = ma[(m.Index + m.Length)..mo];
            if (sau.Trim().Length > 0)
            {
                // Vòng một câu lệnh không ngoặc — lấy tới hết câu lệnh đó.
                var chamPhay = ma.IndexOf(';', m.Index + m.Length);
                yield return (dong, chamPhay < 0 ? "" : ma[(m.Index + m.Length)..chamPhay]);
                continue;
            }
            var sauCung = mo;
            var mucLong = 0;
            for (var i = mo; i < ma.Length; i++)
            {
                if (ma[i] == '{') mucLong++;
                else if (ma[i] == '}' && --mucLong == 0) { sauCung = i; break; }
            }
            yield return (dong, ma[mo..sauCung]);
        }
    }

    [Fact]
    public void MoiVongDuyetBangLayerDeuBoQuaLayerCuaXref()
    {
        var thieu = new List<string>();
        foreach (var tep in TepAdapter())
        {
            var ma = File.ReadAllText(tep);
            var bang = BienBang(ma, "LayerTable");
            if (bang.Count == 0) continue;
            foreach (var (dong, than) in ThanVongDuyet(ma, bang))
            {
                if (than.Contains("IsDependent", StringComparison.Ordinal) ||
                    than.Contains(LoiThoat, StringComparison.Ordinal)) continue;
                thieu.Add($"{Path.GetFileName(tep)}:{dong}");
            }
        }
        Assert.True(thieu.Count == 0,
            "Vòng duyệt LayerTable không lọc layer của xref (IsDependent) — mở ForWrite là eInvalidKey, " +
            $"cả lệnh rollback. Thêm bộ lọc, hoặc chú thích \"{LoiThoat}: <lý do>\" tại chỗ: {string.Join(", ", thieu)}");
    }

    [Fact]
    public void MoiVongDuyetBangBlockDeuBoQuaDinhNghiaXref()
    {
        var thieu = new List<string>();
        foreach (var tep in TepAdapter())
        {
            var ma = File.ReadAllText(tep);
            var bang = BienBang(ma, "BlockTable");
            if (bang.Count == 0) continue;
            foreach (var (dong, than) in ThanVongDuyet(ma, bang))
            {
                if (than.Contains("IsFromExternalReference", StringComparison.Ordinal) ||
                    than.Contains("IsDependent", StringComparison.Ordinal) ||
                    than.Contains(LoiThoat, StringComparison.Ordinal)) continue;
                thieu.Add($"{Path.GetFileName(tep)}:{dong}");
            }
        }
        Assert.True(thieu.Count == 0,
            "Vòng duyệt BlockTable không lọc định nghĩa của xref (IsFromExternalReference) — sửa nội dung " +
            $"xref không lưu được về tệp gốc. Thêm bộ lọc, hoặc chú thích \"{LoiThoat}: <lý do>\": {string.Join(", ", thieu)}");
    }

    [Fact]
    public void PipelineChuanHoaMoKhoaTamVaLuonKhoaLaiTrongFinally()
    {
        var ma = File.ReadAllText(Path.Combine(AdapterDir, "Services", "StandardizePipeline.cs"));
        var run = Regex.Match(ma, @"internal void Run\(Database db, Transaction tr\)(.*?)\n    \}", RegexOptions.Singleline);
        Assert.True(run.Success, "Không tìm thấy StandardizePipeline.Run — đổi chữ ký thì cập nhật bất biến này.");

        var than = run.Groups[1].Value;
        Assert.Contains("VeLayerService.MoKhoaTam", than, StringComparison.Ordinal);
        var finallyIdx = than.IndexOf("finally", StringComparison.Ordinal);
        Assert.True(finallyIdx > 0,
            "Run phải khóa lại layer trong finally — pipeline ném giữa chừng mà không khóa lại là " +
            "trả bản vẽ của kỹ sư về với layer mở toang.");
        Assert.Contains("KhoaLai", than[finallyIdx..], StringComparison.Ordinal);
    }

    /// <summary>Thân của một phương thức lệnh (từ chữ ký tới dấu <c>}</c> thụt 4 dấu cách đầu tiên —
    /// mọi khối lồng bên trong đều thụt sâu hơn).</summary>
    private static string ThanHam(string ma, string ten)
    {
        var m = Regex.Match(ma, @"public void " + ten + @"\(\)(.*?)\n    \}", RegexOptions.Singleline);
        Assert.True(m.Success, $"Không tìm thấy {ten} trong XBossCommands.cs — đổi tên thì cập nhật bất biến này.");
        return m.Groups[1].Value;
    }

    /// <summary>
    /// Đường bóc khối lượng ghi lên thực thể (đánh dấu = đổi màu + XData, gỡ dấu = trả màu + xoá
    /// XData) nên gặp layer khóa là <c>eOnLockedLayer</c> — sự cố thật 2026-08-26. Người dùng chốt
    /// cho phép plugin tự mở khóa, nên bất biến ở đây là: mở khóa TẠM (đúng cặp hàm của pipeline,
    /// không cơ chế thứ hai), CHỈ những layer của các đối tượng sắp ghi, và LUÔN khóa lại trong
    /// <c>finally</c> — bỏ <c>finally</c> đi là trả bản vẽ của kỹ sư về với layer mở toang.
    /// </summary>
    [Theory]
    [InlineData("BocKhoiLuong", "MarkService.Mark(")]
    [InlineData("GoDanhDau", "MarkService.Unmark(")]
    public void DuongBocKhoiLuongMoKhoaTamVaLuonKhoaLaiTrongFinally(string ten, string loiGoiGhi)
    {
        var than = ThanHam(File.ReadAllText(Path.Combine(AdapterDir, "Commands", "XBossCommands.cs")), ten);

        var moKhoa = than.IndexOf("VeLayerService.MoKhoaTam", StringComparison.Ordinal);
        Assert.True(moKhoa > 0,
            $"{ten} phải mở khóa TẠM bằng VeLayerService.MoKhoaTam trước khi ghi — layer khóa là eOnLockedLayer.");
        // Chỉ mở đúng layer của các đối tượng sắp ghi, không mở toang cả bản vẽ.
        Assert.Contains("LayerCua(", than[moKhoa..], StringComparison.Ordinal);

        var ghi = than.IndexOf(loiGoiGhi, StringComparison.Ordinal);
        Assert.True(ghi > moKhoa, $"{ten} phải ghi ({loiGoiGhi}) SAU khi mở khóa tạm, không phải trước.");

        // Khớp khối `finally {` thật, không phải chữ "finally" trong một dòng chú thích.
        var khoiFinally = Regex.Match(than, @"\bfinally\s*\{");
        Assert.True(khoiFinally.Success && khoiFinally.Index > moKhoa,
            $"{ten} phải khóa lại trong finally — ghi ném giữa chừng mà không khóa lại là trả bản vẽ " +
            "của kỹ sư về với layer mở toang.");
        Assert.Contains("VeLayerService.KhoaLai", than[khoiFinally.Index..], StringComparison.Ordinal);
    }
}
