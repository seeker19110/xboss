namespace XBoss.Cad.Core.Matching;

/// <summary>
/// Bộ khớp từ khóa theo RANH GIỚI TOKEN — bản cài C# duy nhất, dùng chung cho
/// layerMap lẫn takeoff (M99 FR2). Phải y hệt <c>hasToken()</c> trong
/// <c>lib/ky-thuat/cad/dxf-parser.ts</c> (rule pack layerMap.matchingNote):
/// một từ khóa chỉ khớp khi ký tự liền trước/sau nó (nếu có) KHÔNG thuộc [A-Z0-9].
/// Ví dụ: layer "THOAT" không được xem là khớp "OA" dù chứa substring "OA".
/// </summary>
public static class TokenMatcher
{
    private static bool LaKyTuTrongTu(char c) => (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');

    /// <summary>Khớp <paramref name="token"/> trong <paramref name="chuoi"/> theo ranh giới token.
    /// Cả hai được so ở dạng CHỮ HOA — caller tự UpperInvariant trước (giữ đúng hợp đồng TS).</summary>
    public static bool HasToken(string chuoi, string token)
    {
        if (token.Length == 0) return false;
        var from = 0;
        while (true)
        {
            var at = chuoi.IndexOf(token, from, StringComparison.Ordinal);
            if (at < 0) return false;
            var truoc = at > 0 ? chuoi[at - 1] : '\0';
            var sau = at + token.Length < chuoi.Length ? chuoi[at + token.Length] : '\0';
            if (!LaKyTuTrongTu(truoc) && !LaKyTuTrongTu(sau)) return true;
            from = at + 1;
        }
    }

    /// <summary>Chuỗi (đã UpperInvariant bên trong) khớp BẤT KỲ từ khóa nào trong danh sách.</summary>
    public static bool MatchesAny(string chuoi, IReadOnlyList<string> tokens)
    {
        var hoa = chuoi.ToUpperInvariant();
        foreach (var t in tokens)
        {
            if (HasToken(hoa, t.ToUpperInvariant())) return true;
        }
        return false;
    }
}
