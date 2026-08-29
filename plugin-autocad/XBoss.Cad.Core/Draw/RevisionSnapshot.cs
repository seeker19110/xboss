using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace XBoss.Cad.Core.Draw;

/// <summary>Loại thay đổi phát hiện được khi so với mốc revision (M110 §4).</summary>
public enum LoaiThayDoi
{
    /// <summary>Handle không có trong mốc.</summary>
    Them,
    /// <summary>Handle có trong mốc nhưng không còn trong bản vẽ.</summary>
    Xoa,
    /// <summary>Cùng handle, khác hash hình học hoặc khác size.</summary>
    Doi,
}

/// <summary>
/// Một dòng của mốc <c>XBOSS_REV_SNAPSHOT</c> (M110 §4): mô tả gọn một thực thể mang XData
/// <c>XBOSS_VE</c> tại thời điểm chốt revision. Lưu BĂM hình học chứ không lưu tọa độ đầy đủ để
/// Xrecord không phình (NFR1), kèm bao hình để còn khoanh được vùng của đối tượng ĐÃ BỊ XÓA.
/// </summary>
public sealed record MucMoc(
    string Handle,
    VaiTroVe VaiTro,
    string HeId,
    string ItemId,
    string Size,
    string HashHinhHoc,
    BaoHinh Bao);

/// <summary>Một thay đổi cần khoanh cloud — đầu vào của danh sách đề xuất (M110 FR1).</summary>
/// <param name="Vung">Vùng đề xuất khoanh: thêm = bao hình mới, xóa = bao hình CŨ trong mốc, đổi = hợp cũ + mới.</param>
public sealed record ThayDoiRevision(
    LoaiThayDoi Loai,
    string Handle,
    VaiTroVe VaiTro,
    string HeId,
    string ItemId,
    string Size,
    BaoHinh Vung);

/// <summary>
/// Mốc so sánh revision (M110 §4) — THUẦN, không tham chiếu AutoCAD (NFR2): băm hình học, so mốc,
/// phân loại thêm/xóa/đổi, mã hóa/giải mã mốc thành dòng chữ để Adapter cất vào Xrecord.
/// </summary>
public static class RevisionSnapshot
{
    /// <summary>Vai trò được theo dõi trong mốc (M110 §4) — chú thích không tính là "bản vẽ đã đổi".</summary>
    public static readonly IReadOnlyList<VaiTroVe> VaiTroTheoDoi =
        [VaiTroVe.Tim, VaiTroVe.PhuKien, VaiTroVe.ThietBi, VaiTroVe.LoCho];

    public static bool TheoDoi(VaiTroVe vaiTro) => VaiTroTheoDoi.Contains(vaiTro);

    /// <summary>Bước làm tròn tọa độ trước khi băm: 0,1 mm (M110 §4).</summary>
    public const double BuocLamTron = 0.1;

    /// <summary>
    /// Băm SHA-256 chuỗi tọa độ đỉnh đã làm tròn tới 0,1 mm. CÓ thứ tự: đảo thứ tự đỉnh là hash đổi
    /// (đảo chiều polyline cũng là một thay đổi hình học đáng khoanh).
    /// </summary>
    public static string BamHinhHoc(IEnumerable<Diem2> dinh)
    {
        var sb = new StringBuilder();
        foreach (var d in dinh)
        {
            sb.Append(LamTron(d.X)).Append(',').Append(LamTron(d.Y)).Append(';');
        }
        var bam = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexString(bam).ToLowerInvariant();
    }

    private static string LamTron(double v)
    {
        var r = Math.Round(v / BuocLamTron, MidpointRounding.AwayFromZero) * BuocLamTron;
        if (r == 0) r = 0; // gộp -0 và 0 về một chuỗi
        return r.ToString("0.0", CultureInfo.InvariantCulture);
    }

    /// <summary>
    /// So bản vẽ hiện tại với mốc gần nhất, trả danh sách thay đổi theo bảng M110 §4.
    /// Thứ tự ổn định: các mục thêm/đổi theo thứ tự <paramref name="hienTai"/>, rồi các mục xóa
    /// theo thứ tự trong <paramref name="moc"/>.
    /// </summary>
    public static IReadOnlyList<ThayDoiRevision> SoMoc(
        IReadOnlyList<MucMoc> moc, IReadOnlyList<MucMoc> hienTai)
    {
        var theoHandle = new Dictionary<string, MucMoc>(StringComparer.Ordinal);
        foreach (var m in moc) theoHandle[m.Handle] = m;

        var conSong = new HashSet<string>(hienTai.Select(h => h.Handle), StringComparer.Ordinal);
        var ra = new List<ThayDoiRevision>();

        foreach (var nay in hienTai)
        {
            if (!theoHandle.TryGetValue(nay.Handle, out var cu))
            {
                ra.Add(Tao(LoaiThayDoi.Them, nay, nay.Bao));
                continue;
            }
            var doi = !string.Equals(cu.HashHinhHoc, nay.HashHinhHoc, StringComparison.Ordinal)
                      || !string.Equals(cu.Size, nay.Size, StringComparison.Ordinal);
            if (doi) ra.Add(Tao(LoaiThayDoi.Doi, nay, cu.Bao.Hop(nay.Bao)));
        }

        foreach (var cu in moc)
        {
            if (!conSong.Contains(cu.Handle)) ra.Add(Tao(LoaiThayDoi.Xoa, cu, cu.Bao));
        }

        return ra;
    }

    private static ThayDoiRevision Tao(LoaiThayDoi loai, MucMoc muc, BaoHinh vung) =>
        new(loai, muc.Handle, muc.VaiTro, muc.HeId, muc.ItemId, muc.Size, vung);

    /// <summary>
    /// Mốc đã vô hiệu chưa: có mốc, có đối tượng, nhưng KHÔNG handle nào trùng — dấu hiệu bản vẽ
    /// đã bị WBLOCK/copy sang tệp khác (M110 §11). Gặp thì phải báo và đề nghị chốt lại mốc chứ
    /// không đề xuất bừa "thêm mới toàn bộ".
    /// </summary>
    public static bool MocVoHieu(IReadOnlyList<MucMoc> moc, IReadOnlyList<MucMoc> hienTai)
    {
        if (moc.Count == 0 || hienTai.Count == 0) return false;
        var handle = new HashSet<string>(moc.Select(m => m.Handle), StringComparer.Ordinal);
        return !hienTai.Any(h => handle.Contains(h.Handle));
    }

    /// <summary>Mã hóa mốc thành các dòng chữ (mỗi mục một dòng) để Adapter cất vào Xrecord.</summary>
    public static IReadOnlyList<string> MaHoa(IEnumerable<MucMoc> moc) =>
        moc.Select(m => string.Join('|',
            m.Handle,
            m.VaiTro.ToString(),
            m.HeId,
            m.ItemId,
            m.Size,
            m.HashHinhHoc,
            So(m.Bao.MinX), So(m.Bao.MinY), So(m.Bao.MaxX), So(m.Bao.MaxY))).ToList();

    /// <summary>Giải mã mốc; dòng hỏng/thiếu trường bị BỎ QUA (mốc cũ vẫn dùng được phần lành).</summary>
    public static IReadOnlyList<MucMoc> GiaiMa(IEnumerable<string> dong)
    {
        var ra = new List<MucMoc>();
        foreach (var d in dong)
        {
            var p = d.Split('|');
            if (p.Length < 10) continue;
            if (!Enum.TryParse<VaiTroVe>(p[1], out var vaiTro)) continue;
            if (!Doc(p[6], out var minX) || !Doc(p[7], out var minY)
                || !Doc(p[8], out var maxX) || !Doc(p[9], out var maxY)) continue;
            ra.Add(new MucMoc(p[0], vaiTro, p[2], p[3], p[4], p[5], new BaoHinh(minX, minY, maxX, maxY)));
        }
        return ra;
    }

    private static string So(double v) => v.ToString("0.######", CultureInfo.InvariantCulture);

    private static bool Doc(string s, out double v) =>
        double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v);
}
