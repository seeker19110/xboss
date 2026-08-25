using ClosedXML.Excel;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Excel;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>
/// M100 PR7 — lỗ chờ/sleeve (§6.8, FR9d, AC13): kích thước = size ống + khe hở rule pack,
/// vị trí theo trục gần nhất, và bảng builder's work (Table trong bản vẽ + Excel dùng chung
/// một bộ cột).
/// </summary>
public class SleeveScheduleTests
{
    // ===== AC13: size lỗ chờ =====

    [Theory]
    [InlineData("DN50", 25, "DN75")]
    [InlineData("DN100", 25, "DN125")]
    [InlineData("Ø80", 50, "Ø130")]
    [InlineData("300x200", 50, "350x250")]
    [InlineData("200", 50, "250")]
    public void AC13_size_lo_cho_bang_size_ong_cong_khe_ho(string ong, double kheHo, string mongDoi)
    {
        var kt = SleeveSchedule.KichThuoc(ong, kheHo);

        Assert.NotNull(kt);
        Assert.Equal(mongDoi, kt!.Nhan);
    }

    [Fact]
    public void Size_lo_cho_giu_ca_hai_chieu_cua_ong_chu_nhat()
    {
        var kt = SleeveSchedule.KichThuoc("300x200", 50);

        Assert.Equal(350, kt!.RongMm, 9);
        Assert.Equal(250, kt.CaoMm!.Value, 9);
    }

    [Fact]
    public void Khong_doc_duoc_size_thi_tra_null_khong_bia()
    {
        Assert.Null(SleeveSchedule.KichThuoc("", 25));
        Assert.Null(SleeveSchedule.KichThuoc("ống gió", 25));
        Assert.Null(SleeveSchedule.KichThuoc("DN50", -1));
    }

    [Fact]
    public void Danh_muc_ket_cau_co_tu_khoa_khong_dau_cho_dong_lenh()
    {
        Assert.Equal(3, SleeveSchedule.DanhMucKetCau.Count);
        Assert.All(SleeveSchedule.DanhMucKetCau, l =>
        {
            // Keyword AutoCAD chỉ nhận chữ/số ASCII — "Tường" phải có sẵn từ khóa "TUONG".
            Assert.All(l.TuKhoa, c => Assert.True(char.IsAsciiLetterOrDigit(c)));
            Assert.False(string.IsNullOrWhiteSpace(l.Ten));
        });
        Assert.Equal("Tường", SleeveSchedule.DanhMucKetCau[0].Ten);
    }

    // ===== Vị trí theo trục =====

    [Fact]
    public void Vi_tri_ghep_hai_truc_gan_nhat_khac_phuong()
    {
        List<MocTruc> truc = [new("A", new Diem2(0, 10)), new("3", new Diem2(10, 0))];

        Assert.Equal("3/A", SleeveSchedule.ViTriTheoTruc(new Diem2(2, 1), truc));
    }

    [Fact]
    public void Chi_co_mot_truc_thi_lay_dung_truc_do()
    {
        List<MocTruc> truc = [new("B", new Diem2(0, 10))];

        Assert.Equal("B", SleeveSchedule.ViTriTheoTruc(new Diem2(1, 1), truc));
    }

    [Fact]
    public void Hai_truc_cung_phuong_thi_khong_ghep_bua()
    {
        List<MocTruc> truc = [new("A", new Diem2(0, 10)), new("B", new Diem2(0, 20))];

        Assert.Equal("A", SleeveSchedule.ViTriTheoTruc(new Diem2(0, 1), truc));
    }

    [Fact]
    public void Ban_ve_khong_co_nhan_truc_thi_de_trong_chu_khong_bia_vi_tri()
    {
        Assert.Equal("", SleeveSchedule.ViTriTheoTruc(new Diem2(0, 0), []));
    }

    // ===== Bảng =====

    private static List<DongLoCho> BaDong() => SleeveSchedule.DanhSo(
    [
        new DongLoCho
        {
            HeId = "PIPING", ViTriTruc = "A/3", CaoDoMm = 2700, SizeOng = "DN50",
            SizeLoCho = "DN75", KetCau = "Tường", Handle = "2A1",
        },
        new DongLoCho
        {
            HeId = "PIPING", ViTriTruc = "B/3", CaoDoMm = 2700, SizeOng = "DN80",
            SizeLoCho = "DN105", KetCau = "Sàn", Handle = "2A2",
        },
        new DongLoCho
        {
            HeId = "HVAC", ViTriTruc = "C/4", CaoDoMm = 3000, SizeOng = "300x200",
            SizeLoCho = "350x250", KetCau = "Dầm", Handle = "2A3",
        },
    ]).ToList();

    [Fact]
    public void Danh_so_lai_lien_mach_tu_1()
    {
        Assert.Equal([1, 2, 3], BaDong().Select(d => d.Stt));
    }

    [Fact]
    public void O_cua_mot_dong_dung_thu_tu_cot()
    {
        var o = SleeveSchedule.O(BaDong()[0]);

        Assert.Equal(SleeveSchedule.TieuDe.Count, o.Count);
        Assert.Equal(["1", "PIPING", "A/3", "2700", "DN50", "DN75", "Tường", "2A1"], o);
    }

    [Fact]
    public void Cao_do_chua_nhap_thi_de_trong_chu_khong_ghi_0()
    {
        var o = SleeveSchedule.O(new DongLoCho { Stt = 1, SizeOng = "DN50" });

        Assert.Equal("", o[3]);
    }

    // ===== AC13: tệp Excel =====

    [Fact]
    public void AC13_excel_lo_cho_co_dung_so_dong_va_dung_cot()
    {
        var dong = BaDong();
        var stream = new MemoryStream();
        LoChoExcelWriter.Write(dong, Meta, stream);
        stream.Position = 0;

        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheet(LoChoExcelWriter.TenSheet);

        for (var i = 0; i < SleeveSchedule.TieuDe.Count; i++)
            Assert.Equal(SleeveSchedule.TieuDe[i], ws.Cell(6, i + 1).GetString());

        Assert.Equal(3, ws.LastRowUsed()!.RowNumber() - 6);
        Assert.Equal(1, ws.Cell(7, 1).GetDouble());          // STT ghi dạng SỐ
        Assert.Equal(2700, ws.Cell(7, 4).GetDouble(), 9);    // cao độ ghi dạng SỐ
        Assert.Equal("DN75", ws.Cell(7, 6).GetString());
        Assert.Equal("350x250", ws.Cell(9, 6).GetString());
    }

    [Fact]
    public void Excel_lo_cho_ghi_ro_cao_do_la_nhap_tay()
    {
        var stream = new MemoryStream();
        LoChoExcelWriter.Write(BaDong(), Meta, stream);
        stream.Position = 0;

        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheet(LoChoExcelWriter.TenSheet);

        Assert.Contains("NHẬP TAY", ws.Cell("B4").GetString());
    }

    private static readonly LoChoExcelMeta Meta = new()
    {
        TenDuAn = "BD1.6 - TT AVIO",
        TenBanVe = "MB-TANG-05.dwg",
        RulePackVersion = "v5",
        NguoiLap = "Kỹ sư A",
        NgayIso = "2026-08-25",
    };
}
