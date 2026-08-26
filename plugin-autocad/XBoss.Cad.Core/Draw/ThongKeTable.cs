using System.Globalization;
using XBoss.Cad.Core.Takeoff;

namespace XBoss.Cad.Core.Draw;

/// <summary>Loại bảng thống kê sinh trong bản vẽ (M100 §6.9 / FR9f).</summary>
public enum LoaiBangThongKe
{
    /// <summary>Bảng thiết bị — dữ liệu từ attribute TAG/MODEL/SIZE của khối đã chèn.</summary>
    ThietBi,

    /// <summary>Bảng khối lượng theo hệ — dữ liệu từ trạng thái bóc XData <c>XBOSS_BOCKL</c>.</summary>
    KhoiLuong,

    /// <summary>
    /// Bảng đốt (M105 §5) — dữ liệu từ dấu chia đốt trên XData tim (<c>XBOSS_VE_CHIADOT</c>).
    /// Bảng RIÊNG, cấu trúc cột khác hẳn 2 bảng trên nên không gộp vào chúng.
    /// </summary>
    ChiaDot,
}

/// <summary>Một thiết bị đọc từ bản vẽ (Adapter điền từ attribute + XData của bộ lệnh vẽ).</summary>
public sealed record ThietBiThongKe(string Tag, string Model, string Size, string HeId, string BlockName);

/// <summary>
/// Một tuyến đã chia đốt, đọc từ dấu chia đốt trên XData tim (M105 FR6). Bảng đốt gộp các tuyến
/// CÙNG (hệ, loại tuyến, cỡ, kiểu nối) lại thành một dòng — xưởng đặt gia công theo cụm đó.
/// </summary>
public sealed record DotThongKe(
    string HeId, string ItemId, string Size, string KieuNoi, int SoDot, int SoMoi, double TongDaiMm);

/// <summary>Bảng đã dựng xong: tiêu đề + hàng tiêu đề cột + các hàng dữ liệu (đều là chuỗi).</summary>
public sealed record BangThongKe(
    LoaiBangThongKe Loai,
    string TieuDe,
    IReadOnlyList<string> Cot,
    IReadOnlyList<IReadOnlyList<string>> Dong)
{
    public int SoHang => Dong.Count + 2; // 1 hàng tiêu đề bảng + 1 hàng tên cột
}

/// <summary>
/// Dựng nội dung bảng thống kê trong bản vẽ (M100 §6.9, FR9f) — THUẦN, không tham chiếu AutoCAD
/// (FR11), test trên CI Linux. Adapter chỉ đổ chuỗi vào đối tượng <c>Table</c> của AutoCAD, nên
/// nội dung/thứ tự/cách gộp đều bị kẹp bằng test ở đây.
///
/// Dữ liệu LẤY TỪ BẢN VẼ, không nhập tay: bảng thiết bị đọc attribute, bảng khối lượng đọc trạng
/// thái bóc của <c>XBOSS_BOCKL</c> (appname đó chỉ ĐỌC — M100 §11).
/// </summary>
public static class ThongKeTable
{
    public static BangThongKe ThietBi(IReadOnlyList<ThietBiThongKe> danhSach)
    {
        var dong = danhSach
            .OrderBy(t => t.HeId, StringComparer.Ordinal)
            .ThenBy(t => t.Tag, StringComparer.OrdinalIgnoreCase)
            .ThenBy(t => t.BlockName, StringComparer.OrdinalIgnoreCase)
            .Select((t, i) => (IReadOnlyList<string>)
            [
                (i + 1).ToString(CultureInfo.InvariantCulture),
                string.IsNullOrWhiteSpace(t.Tag) ? "(chưa đánh tag)" : t.Tag,
                t.Model,
                t.Size,
                t.HeId,
                t.BlockName,
            ])
            .ToList();

        return new BangThongKe(
            LoaiBangThongKe.ThietBi,
            $"BẢNG THỐNG KÊ THIẾT BỊ ({dong.Count})",
            ["STT", "TAG", "MODEL", "SIZE", "HỆ", "BLOCK"],
            dong);
    }

    public static BangThongKe KhoiLuong(TakeoffResult ketQua)
    {
        var dong = ketQua.Lines
            .Select((l, i) => (IReadOnlyList<string>)
            [
                (i + 1).ToString(CultureInfo.InvariantCulture),
                l.Item.Group,
                string.IsNullOrWhiteSpace(l.Item.BoqCode) ? "" : l.Item.BoqCode,
                l.Item.Name,
                l.Item.Unit,
                l.Quantity.ToString("#,##0.00", CultureInfo.InvariantCulture),
            ])
            .ToList();

        return new BangThongKe(
            LoaiBangThongKe.KhoiLuong,
            $"BẢNG KHỐI LƯỢNG THEO HỆ — rule pack {ketQua.RulePackVersion}",
            ["STT", "HỆ", "MÃ BOQ", "HẠNG MỤC", "ĐVT", "KHỐI LƯỢNG"],
            dong);
    }

    /// <summary>
    /// Bảng đốt trong bản vẽ (M105 §5): gộp theo (hệ, loại tuyến, cỡ, kiểu nối) rồi cộng số đốt /
    /// số mối / tổng dài. Chiều dài ghi bằng <b>mm</b> — đơn vị của toàn bộ tham số chia đốt trong
    /// rule pack và của phiếu gia công ở xưởng (bảng khối lượng dùng m là chuyện của BOQ).
    /// </summary>
    public static BangThongKe ChiaDot(IReadOnlyList<DotThongKe> danhSach)
    {
        var gop = danhSach
            .GroupBy(d => (d.HeId, d.ItemId, d.Size, d.KieuNoi))
            .Select(g => new DotThongKe(
                g.Key.HeId, g.Key.ItemId, g.Key.Size, g.Key.KieuNoi,
                g.Sum(d => d.SoDot), g.Sum(d => d.SoMoi), g.Sum(d => d.TongDaiMm)))
            .OrderBy(d => d.HeId, StringComparer.Ordinal)
            .ThenBy(d => d.ItemId, StringComparer.Ordinal)
            .ThenBy(d => d.Size, StringComparer.Ordinal)
            .ThenBy(d => d.KieuNoi, StringComparer.Ordinal)
            .ToList();

        var dong = gop
            .Select((d, i) => (IReadOnlyList<string>)
            [
                (i + 1).ToString(CultureInfo.InvariantCulture),
                d.HeId,
                d.ItemId,
                d.Size,
                d.KieuNoi,
                d.SoDot.ToString(CultureInfo.InvariantCulture),
                d.SoMoi.ToString(CultureInfo.InvariantCulture),
                d.TongDaiMm.ToString("#,##0.0", CultureInfo.InvariantCulture),
            ])
            .ToList();

        return new BangThongKe(
            LoaiBangThongKe.ChiaDot,
            $"BẢNG ĐỐT THEO KIỂU NỐI ({gop.Sum(d => d.SoDot)} đốt / {gop.Sum(d => d.SoMoi)} mối)",
            ["STT", "HỆ", "TUYẾN", "CỠ", "KIỂU NỐI", "SỐ ĐỐT", "SỐ MỐI", "TỔNG DÀI (mm)"],
            dong);
    }

    /// <summary>Mã loại bảng lưu trong XData (đọc lại để cập nhật ĐÚNG bảng cũ tại chỗ — FR9f).</summary>
    public static string Ma(LoaiBangThongKe loai) => loai switch
    {
        LoaiBangThongKe.KhoiLuong => "khoiluong",
        LoaiBangThongKe.ChiaDot => "chiadot",
        _ => "thietbi",
    };

    /// <summary>Nghịch đảo của <see cref="Ma"/>; null khi chuỗi không phải mã bảng.</summary>
    public static LoaiBangThongKe? TuMa(string? ma) => ma switch
    {
        "khoiluong" => LoaiBangThongKe.KhoiLuong,
        "thietbi" => LoaiBangThongKe.ThietBi,
        "chiadot" => LoaiBangThongKe.ChiaDot,
        _ => null,
    };
}
