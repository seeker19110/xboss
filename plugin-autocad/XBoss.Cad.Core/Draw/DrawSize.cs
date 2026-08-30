using System.Globalization;

namespace XBoss.Cad.Core.Draw;

/// <summary>Kích thước đọc ra từ chuỗi size của rule pack (mm) — cao = null với ống tròn/DN.</summary>
public sealed record KichThuocTuyen(double RongMm, double? CaoMm);

/// <summary>
/// Diễn giải chuỗi size trong <c>drawTools.systems[].lines[].sizes[]</c> (M100 §13: định dạng
/// thống nhất <c>300x200</c> / <c>DN50</c> — KHÔNG tự chế format) và dựng nội dung nhãn.
/// THUẦN, test trên CI Linux (M100 FR11).
/// </summary>
public static class DrawSize
{
    /// <summary>
    /// Bề rộng/chiều cao (mm) của một size. Nhận: <c>300x200</c> (x/X/*), <c>DN50</c> (DN/Ø/D),
    /// hoặc số trần <c>350</c> (size kỹ sư tự nhập). Không đọc được → null (lệnh vẽ chỉ vẽ tim).
    /// </summary>
    public static KichThuocTuyen? PhanTich(string? size)
    {
        if (string.IsNullOrWhiteSpace(size)) return null;
        var s = size.Trim().ToUpperInvariant().Replace(" ", "");

        var viTri = s.IndexOfAny(['X', '*']);
        if (viTri > 0)
        {
            var rong = DocSo(s[..viTri]);
            var cao = DocSo(s[(viTri + 1)..]);
            if (rong is > 0 && cao is > 0) return new KichThuocTuyen(rong.Value, cao.Value);
            return null;
        }

        // DN50 / Ø50 / D50 / 50 — đường kính danh nghĩa, dùng làm bề rộng khi cần
        // (DocSo bỏ mọi ký tự không phải chữ số nên tiền tố DN/Ø tự rụng).
        var so = DocSo(s);
        return so is > 0 ? new KichThuocTuyen(so.Value, null) : null;
    }

    private static double? DocSo(string chuoi)
    {
        var sach = new string(chuoi.Where(c => char.IsDigit(c) || c is '.' or ',').ToArray()).Replace(',', '.');
        return double.TryParse(sach, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;
    }

    /// <summary>
    /// Nội dung nhãn tuyến (M100 FR7/FR9g): size lấy nguyên văn từ XData, kèm <c>i=2%</c> khi
    /// tuyến có độ dốc. Không gõ tay, không tự chế format.
    /// </summary>
    public static string NhanTuyen(string size, string? doDoc) =>
        string.IsNullOrWhiteSpace(doDoc) ? size : $"{size}  i={doDoc.Trim()}";
}
