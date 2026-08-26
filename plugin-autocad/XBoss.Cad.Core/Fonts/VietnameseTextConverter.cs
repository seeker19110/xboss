using System.Text;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Fonts;

/// <summary>
/// Giải mã text tiếng Việt font cũ → Unicode NFC theo fontMap của rule pack (M99 FR3):
/// TCVN3 thay theo TỪNG KÝ TỰ, VNI thay theo danh sách cặp CÓ THỨ TỰ (a61 phải
/// được thử trước a6 — thứ tự trong rule pack là hợp đồng, không sắp xếp lại),
/// rồi ký hiệu CAD (%%c → Ø, …), cuối cùng chuẩn hoá NFC.
/// Bảng mã lấy từ rule pack — Core không nhúng cứng quy tắc (ADR-0006 nguyên tắc 1).
/// </summary>
public sealed class VietnameseTextConverter
{
    private readonly Dictionary<char, string> _tcvn3;
    private readonly IReadOnlyList<(string Cu, string Moi)> _vniPairs;
    private readonly IReadOnlyList<(string Cu, string Moi)> _cadSymbols;
    /// <summary>Khóa TCVN3 đặc trưng — không trùng bất kỳ chữ nào xuất hiện trong giá trị
    /// Unicode của bảng (dò an toàn khi không biết font).</summary>
    private readonly HashSet<char> _tcvn3DacTrung;

    public VietnameseTextConverter(FontMapSection fontMap)
    {
        _tcvn3 = new Dictionary<char, string>();
        foreach (var (key, value) in fontMap.Tcvn3.Chars)
        {
            // Khóa TCVN3 là 1 ký tự đơn (bảng mã 8-bit) — khóa dài hơn là rule pack hỏng.
            if (key.Length != 1)
                throw new RulePackException($"fontMap.tcvn3.chars có khóa không phải 1 ký tự: \"{key}\"");
            _tcvn3[key[0]] = value;
        }
        _vniPairs = fontMap.Vni.Pairs.Select(p => (p[0], p[1])).ToList();
        _cadSymbols = fontMap.CadSymbols.Select(p => (p[0], p[1])).ToList();

        // Khóa TCVN3 đặc trưng = khóa không phải chữ tiếng Việt Unicode hợp lệ (kể cả hoa) —
        // chỉ những khóa này mới dò an toàn khi không biết font ('¶' '«' '§' '­'…);
        // khóa nhập nhằng ('è' 'ã' 'Ê'… vừa là mã TCVN3 vừa là chữ thật) bị loại.
        const string chuVietHopLe =
            "áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ";
        var hopLe = new HashSet<char>(chuVietHopLe);
        foreach (var c in chuVietHopLe.ToUpperInvariant()) hopLe.Add(c);
        _tcvn3DacTrung = new HashSet<char>(_tcvn3.Keys.Where(k => k >= 0x80 && !hopLe.Contains(k)));
    }

    /// <summary>Giải mã 1 chuỗi qua TRỌN chuỗi quy tắc (TCVN3 → VNI → ký hiệu CAD → NFC) —
    /// dùng cho test đối chiếu với rule pack. Khi áp lên bản vẽ thật, dùng bản có
    /// <see cref="LegacyFontKind"/> để không phá chuỗi hợp lệ (vd mã hàng "A1" ≠ VNI "Á").</summary>
    public string Convert(string text)
    {
        var kq = ApDungTcvn3(text);
        foreach (var (cu, moi) in _vniPairs) kq = kq.Replace(cu, moi, StringComparison.Ordinal);
        return ApDungCadSymbols(kq).Normalize(NormalizationForm.FormC);
    }

    /// <summary>Giải mã theo đúng bảng mã của font đang dùng (M99 §6.6 bước 3):
    /// font TCVN3 (.Vn*) chỉ áp bảng TCVN3; font VNI (VNI-*) chỉ áp bảng VNI;
    /// font không rõ chỉ áp ký hiệu CAD (%%c…) — VNI KHÔNG được áp mù vì "A1"/"E5"…
    /// là chuỗi hợp lệ trong mã hàng/tên trục.</summary>
    public string Convert(string text, LegacyFontKind kind)
    {
        var kq = kind switch
        {
            LegacyFontKind.Tcvn3 => ApDungTcvn3(text),
            LegacyFontKind.Vni => ApDungVni(text),
            _ => text,
        };
        return ApDungCadSymbols(kq).Normalize(NormalizationForm.FormC);
    }

    /// <summary>Nhận diện bảng mã từ tên font của text style: quy ước đặt tên phổ biến
    /// của bộ font TCVN3 (".VnTime", ".VnArial"…) và VNI ("VNI-Times"…).</summary>
    public static LegacyFontKind DetectFontKind(string? fontName)
    {
        if (string.IsNullOrWhiteSpace(fontName)) return LegacyFontKind.None;
        var t = fontName.Trim();
        if (t.StartsWith(".VN", StringComparison.OrdinalIgnoreCase) ||
            t.Contains("TCVN", StringComparison.OrdinalIgnoreCase))
        {
            return LegacyFontKind.Tcvn3;
        }
        if (t.StartsWith("VNI", StringComparison.OrdinalIgnoreCase)) return LegacyFontKind.Vni;
        return LegacyFontKind.None;
    }

    /// <summary>Chuỗi có chứa mã font cũ không — phép kiểm 4 của XBOSS_KIEMTRA (M99 §6.4).
    /// Font rõ bảng mã → so với bản giải mã của bảng đó. Font không rõ → chỉ dò các
    /// KÝ TỰ ĐẶC TRƯNG TCVN3 (khóa trong bảng mà bản thân KHÔNG phải chữ tiếng Việt hợp lệ,
    /// vd '¶' '«' '§') — vì TCVN3 tái dùng cả ký tự Latin-1 có dấu ('ó' TCVN3 nghĩa là 'ú'),
    /// so bản giải mã mù sẽ nhận nhầm text Unicode chuẩn là font cũ. KHÔNG dò VNI mù
    /// ("A1"/"E5"… là chuỗi hợp lệ trong mã hàng/tên trục).</summary>
    /// <summary>
    /// Bảng mã DÙNG ĐỂ SỬA một chuỗi: giống hệt tiêu chí của <see cref="ContainsLegacyEncoding"/>
    /// nên phép kiểm và bước chuẩn hóa không bao giờ lệch nhau.
    ///
    /// Vì sao phải có: bản vẽ thật hay khai text style bằng font Unicode (hoặc bỏ trống) trong khi
    /// nội dung vẫn là mã TCVN3. Trước đây phép kiểm dò theo NỘI DUNG nên báo "141 text font cũ",
    /// còn bước 3 chỉ nhìn TÊN FONT nên không sửa gì — kỹ sư chạy XBOSS_CHUANHOA xong, chạy lại
    /// XBOSS_KIEMTRA vẫn thấy đúng 141 lỗi đó, một vòng lặp không lối ra (bản vẽ thật, 2026-08-26).
    ///
    /// Chỉ suy ra TCVN3 từ nội dung, KHÔNG suy ra VNI: ký tự đặc trưng TCVN3 là mã ≥ 0x80 mà bản
    /// thân không phải chữ Việt hợp lệ nên gần như chắc chắn là mã cũ, còn VNI ghép từ ký tự ASCII
    /// ("A1", "E5") — đoán mù sẽ phá mã hàng và tên trục.
    /// </summary>
    public LegacyFontKind KindDeSua(string text, string? fontName = null)
    {
        var kind = DetectFontKind(fontName);
        if (kind != LegacyFontKind.None) return kind;
        foreach (var c in text)
        {
            if (_tcvn3DacTrung.Contains(c)) return LegacyFontKind.Tcvn3;
        }
        return LegacyFontKind.None;
    }

    public bool ContainsLegacyEncoding(string text, string? fontName = null)
    {
        var kind = DetectFontKind(fontName);
        if (kind == LegacyFontKind.None)
        {
            foreach (var c in text)
            {
                if (_tcvn3DacTrung.Contains(c)) return true;
            }
            return false;
        }
        return !string.Equals(Convert(text, kind), text.Normalize(NormalizationForm.FormC), StringComparison.Ordinal);
    }

    private string ApDungTcvn3(string text)
    {
        var sb = new StringBuilder(text.Length);
        foreach (var c in text)
        {
            if (_tcvn3.TryGetValue(c, out var thay)) sb.Append(thay);
            else sb.Append(c);
        }
        return sb.ToString();
    }

    private string ApDungVni(string text)
    {
        var kq = text;
        foreach (var (cu, moi) in _vniPairs) kq = kq.Replace(cu, moi, StringComparison.Ordinal);
        return kq;
    }

    private string ApDungCadSymbols(string text)
    {
        var kq = text;
        foreach (var (cu, moi) in _cadSymbols) kq = kq.Replace(cu, moi, StringComparison.Ordinal);
        return kq;
    }
}

/// <summary>Bảng mã font cũ nhận diện được từ tên font.</summary>
public enum LegacyFontKind
{
    None,
    Tcvn3,
    Vni,
}
