using System.Globalization;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một mục trong combo/danh sách của hộp thoại: giá trị thật + nhãn tiếng Việt hiện lên màn hình.
/// Dùng chung cho mọi ViewModel của M106 PR3 thay vì mỗi lệnh tự bịa một record riêng — combo của
/// WPF bind <c>SelectedItem</c> theo tham chiếu nên chỉ cần một kiểu mục là đủ.
/// </summary>
public sealed record MucChon<T>(T GiaTri, string Nhan);

/// <summary>
/// Tỉ lệ in 1:x — CÙNG một luật đọc/ghi mà <c>VeContext.HoiTiLeIn</c> dùng ở dòng lệnh
/// (danh mục <c>sheetSetup.scales</c>, cho gõ tay, phải là số dương). Đặt ở một chỗ để hộp thoại
/// của <c>XBOSS_VE_NHAN</c>, <c>XBOSS_VE_THONGKE</c>, <c>XBOSS_VE_MATCAT</c> và
/// <c>XBOSS_VE_TRANGIN</c> không trôi khỏi nhau (M106 FR4 — một cơ chế nhớ duy nhất).
/// </summary>
public static class TiLeInDialog
{
    /// <summary>Danh mục tỉ lệ hiện trong combo, đúng thứ tự rule pack khai.</summary>
    public static IReadOnlyList<string> DanhMuc(IReadOnlyList<double> scales) =>
        scales.Select(So).ToList();

    /// <summary>Giá trị mặc định: tỉ lệ đang dùng của phiên, chưa có thì mục đầu danh mục.</summary>
    public static string MacDinh(IReadOnlyList<double> scales, double? cuaPhien)
    {
        if (cuaPhien is { } v && v > 0) return So(v);
        return scales.Count > 0 ? So(scales[0]) : "";
    }

    /// <summary>Số tỉ lệ đọc từ ô nhập; null khi trống/không phải số dương.</summary>
    public static double? PhanTich(string? nhap) =>
        double.TryParse((nhap ?? "").Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var so) && so > 0
            ? so
            : null;

    /// <summary>Lý do khóa OK vì tỉ lệ; null = hợp lệ.</summary>
    public static string? LyDo(string? nhap) =>
        (nhap ?? "").Trim().Length == 0
            ? "Chưa nhập tỉ lệ in — chọn trong danh mục hoặc gõ số (vd 50 cho tỉ lệ 1:50)."
            : PhanTich(nhap) is null
                ? $"Tỉ lệ \"{(nhap ?? "").Trim()}\" không hợp lệ — nhập số dương (vd 50 cho tỉ lệ 1:50)."
                : null;

    /// <summary>Cảnh báo không chặn khi tỉ lệ nằm ngoài danh mục rule pack; null = không có gì.</summary>
    public static string? CanhBao(IReadOnlyList<double> scales, string? nhap)
    {
        if (PhanTich(nhap) is not { } so) return null;
        if (scales.Count == 0) return "Rule pack không khai sheetSetup.scales — tỉ lệ đang nhập tay.";
        return scales.Any(s => Math.Abs(s - so) < 1e-9)
            ? null
            : $"Tỉ lệ 1:{So(so)} ngoài danh mục rule pack — vẫn dùng được, kiểm lại trước khi in.";
    }

    /// <summary>Số hiện trên giao diện (không dấu phân cách nghìn, tối đa 2 chữ số thập phân).</summary>
    public static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
