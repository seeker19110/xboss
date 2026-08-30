using ClosedXML.Excel;
using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Excel;
using XBoss.Cad.Core.Ui.ViewModels;
using Xunit;

namespace XBoss.Cad.Tests;

/// <summary>M116 PR3 §6 bước 5 / AC5 — bảng Excel phối hợp đúng cột brief yêu cầu.</summary>
public class PhoiHopExcelWriterTests
{
    private static readonly PhoiHopExcelMeta Meta = new()
    {
        TenBanVe = "MB-TANG-05.dwg",
        RulePackVersion = "0.17.0",
        NguoiLap = "Kỹ sư A",
        NgayIso = "2026-08-30",
    };

    private static XungDot Xd() => new(
        "xd-1", LopKiem.GiaoCatCaoDo, MucXungDot.Cung, ["a", "b"], ["HVAC", "PIPING"],
        "Giao cắt cùng cao độ", new Diem2(1000, 2000), 100, false,
        [new DeXuat(LoaiDeXuat.NhuongCaoDo, "PIPING", "Hạ cao độ hệ PIPING xuống 2500 mm", 2500)]);

    [Fact]
    public void Write_DungCot_DungMa()
    {
        var dong = new List<DongXungDot>
        {
            new(Xd()),
            new(Xd() with { Id = "xd-2", Lop = LopKiem.KhoangCachQuyPham, Muc = MucXungDot.CanhBao },
                TrangThaiXungDot.BoQua, "Đã họp thống nhất giữ nguyên"),
        };

        var stream = new MemoryStream();
        PhoiHopExcelWriter.Write(dong, Meta, stream);
        stream.Position = 0;
        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheet(PhoiHopExcelWriter.TenSheet);

        Assert.Equal("STT", ws.Cell(5, 1).GetString());
        Assert.Equal("LỚP KIỂM", ws.Cell(5, 2).GetString());
        Assert.Equal("HỆ A", ws.Cell(5, 3).GetString());
        Assert.Equal("HỆ B", ws.Cell(5, 4).GetString());
        Assert.Equal("VỊ TRÍ", ws.Cell(5, 5).GetString());
        Assert.Equal("MỨC", ws.Cell(5, 6).GetString());
        Assert.Equal("ĐỀ XUẤT XỬ LÝ", ws.Cell(5, 7).GetString());
        Assert.Equal("TRẠNG THÁI", ws.Cell(5, 8).GetString());

        // Dòng 1 (giao cắt cùng cao độ) — sắp theo lớp kiểm trước.
        Assert.Equal(1, ws.Cell(6, 1).GetValue<int>());
        Assert.Equal("giao cắt cùng cao độ", ws.Cell(6, 2).GetString());
        Assert.Equal("HVAC", ws.Cell(6, 3).GetString());
        Assert.Equal("PIPING", ws.Cell(6, 4).GetString());
        Assert.Contains("1000", ws.Cell(6, 5).GetString());
        Assert.Equal("CỨNG", ws.Cell(6, 6).GetString());
        Assert.Contains("Hạ cao độ", ws.Cell(6, 7).GetString());
        Assert.Equal("chua_xu_ly", ws.Cell(6, 8).GetString());

        // Dòng 2 (khoảng cách quy phạm) — trạng thái bỏ qua kèm lý do.
        Assert.Equal("khoảng cách quy phạm", ws.Cell(7, 2).GetString());
        Assert.Equal("CẢNH BÁO", ws.Cell(7, 6).GetString());
        Assert.Contains("bo_qua", ws.Cell(7, 8).GetString());
        Assert.Contains("Đã họp thống nhất", ws.Cell(7, 8).GetString());
    }

    [Fact]
    public void Write_RongKhongLoi()
    {
        var stream = new MemoryStream();
        PhoiHopExcelWriter.Write([], Meta, stream);
        stream.Position = 0;
        using var wb = new XLWorkbook(stream);
        var ws = wb.Worksheet(PhoiHopExcelWriter.TenSheet);
        Assert.Contains("Không phát hiện", ws.Cell(6, 1).GetString());
    }
}
