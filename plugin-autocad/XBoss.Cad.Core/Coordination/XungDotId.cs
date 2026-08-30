using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace XBoss.Cad.Core.Coordination;

/// <summary>
/// Id ỔN ĐỊNH của một xung đột phối hợp (M116 §7 FR1) — băm từ (lớp kiểm + handle các tuyến ĐÃ
/// SẮP THỨ TỰ + mốc vị trí đã làm tròn theo mm).
///
/// Vì sao phải ổn định: kỹ sư chạy <c>XBOSS_PHOIHOP</c> nhiều lần trong một buổi phối hợp. Id đổi
/// mỗi lần quét thì bảng xung đột nhân đôi và trạng thái "bỏ qua có lý do" (XData marker, FR4) mất
/// chỗ bám — đúng ca AC2.
///
/// Ba quy ước giữ tính ổn định:
/// <list type="bullet">
/// <item>Handle SẮP theo thứ tự ordinal ⇒ quét A×B hay B×A đều ra một id.</item>
/// <item>Toạ độ LÀM TRÒN về mm nguyên ⇒ sai số dấu phẩy động lần quét sau không đổi id.</item>
/// <item>Băm SHA-256 rồi cắt 16 ký tự hex ⇒ id ngắn, chép tay được vào biên bản họp.</item>
/// </list>
/// </summary>
public static class XungDotId
{
    /// <summary>Tiền tố để nhìn là biết id của XBoss (báo cáo/biên bản họp phối hợp).</summary>
    public const string TienTo = "xd-";

    /// <summary>
    /// Id của một xung đột.
    /// </summary>
    /// <param name="lop">Lớp kiểm sinh ra xung đột — hai lớp khác nhau tại cùng chỗ là hai dòng.</param>
    /// <param name="handleTuyen">Handle các tuyến liên quan (thứ tự truyền vào KHÔNG quan trọng).</param>
    /// <param name="moc">
    /// Mốc vị trí đã chuẩn hoá: <see cref="MocToaDo"/> cho xung đột tại một điểm,
    /// <see cref="MocHanhLang"/> cho tranh chấp hành lang.
    /// </param>
    public static string Tao(LopKiem lop, IEnumerable<string> handleTuyen, string moc)
    {
        var handle = handleTuyen
            .Where(h => !string.IsNullOrWhiteSpace(h))
            .Select(h => h.Trim())
            .Distinct(StringComparer.Ordinal)
            .OrderBy(h => h, StringComparer.Ordinal);

        var khoa = $"{lop}|{string.Join(",", handle)}|{moc}";
        var bam = SHA256.HashData(Encoding.UTF8.GetBytes(khoa));
        return TienTo + Convert.ToHexString(bam)[..16].ToLowerInvariant();
    }

    /// <summary>Mốc vị trí điểm — toạ độ mm làm tròn về số nguyên (sai số dưới 1 mm không đổi id).</summary>
    public static string MocToaDo(double xMm, double yMm) => $"{LamTron(xMm)}:{LamTron(yMm)}";

    /// <summary>Mốc của tranh chấp hành lang — id hành lang + cao độ tầng (mm, làm tròn).</summary>
    public static string MocHanhLang(string hanhLangId, double caoDoMm) =>
        $"{hanhLangId}@{LamTron(caoDoMm)}";

    /// <summary>Làm tròn nửa đơn vị LÊN (như <c>Math.round</c> của JS) — một quy ước duy nhất.</summary>
    private static string LamTron(double v) =>
        Math.Floor(v + 0.5).ToString("0", CultureInfo.InvariantCulture);
}
