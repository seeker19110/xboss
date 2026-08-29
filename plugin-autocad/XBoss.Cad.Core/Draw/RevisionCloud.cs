namespace XBoss.Cad.Core.Draw;

/// <summary>
/// Bao hình chữ nhật (đơn vị bản vẽ) — dùng để mô tả vùng cần khoanh revision (M110 §4/FR2).
/// Thuần: Core không được biết <c>Extents3d</c> của AutoCAD.
/// </summary>
public readonly record struct BaoHinh(double MinX, double MinY, double MaxX, double MaxY)
{
    public double Rong => MaxX - MinX;
    public double Cao => MaxY - MinY;

    /// <summary>Góc trên phải — chỗ đặt tam giác revision (FR2).</summary>
    public Diem2 GocTrenPhai => new(MaxX, MaxY);

    /// <summary>Bao hình của một chùm điểm; danh sách rỗng → null (không khoanh được gì).</summary>
    public static BaoHinh? TuDiem(IEnumerable<Diem2> diem)
    {
        double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;
        var co = false;
        foreach (var d in diem)
        {
            co = true;
            minX = Math.Min(minX, d.X);
            minY = Math.Min(minY, d.Y);
            maxX = Math.Max(maxX, d.X);
            maxY = Math.Max(maxY, d.Y);
        }
        return co ? new BaoHinh(minX, minY, maxX, maxY) : null;
    }

    /// <summary>Hợp 2 bao hình — vùng của đối tượng ĐỔI = hợp bao hình cũ + mới (M110 §4).</summary>
    public BaoHinh Hop(BaoHinh khac) => new(
        Math.Min(MinX, khac.MinX), Math.Min(MinY, khac.MinY),
        Math.Max(MaxX, khac.MaxX), Math.Max(MaxY, khac.MaxY));

    /// <summary>Nới đều 4 phía (<c>revisionPolicy.boundingPaddingMm</c>).</summary>
    public BaoHinh NoiRong(double padding) =>
        new(MinX - padding, MinY - padding, MaxX + padding, MaxY + padding);
}

/// <summary>Kết quả dựng một revision cloud: polyline kín + chỗ đặt tam giác (M110 FR2).</summary>
/// <param name="Dinh">Đỉnh polyline KÍN (đỉnh cuối nối về đỉnh đầu), mỗi đỉnh mang bulge của cung theo sau.</param>
/// <param name="ViTriTamGiac">Góc trên phải cloud — chỗ chèn block tam giác mang số revision.</param>
/// <param name="SoCung">Tổng số cung của cả 4 cạnh (kiểm nhanh trong test/báo cáo).</param>
public sealed record BoTriRevisionCloud(
    IReadOnlyList<DinhPolyline> Dinh, Diem2 ViTriTamGiac, int SoCung, BaoHinh Vung);

/// <summary>
/// Hình học revision cloud quanh một bao hình (M110 FR2) — THUẦN, không tham chiếu AutoCAD
/// (M99 FR17), test chạy CI Linux. Adapter chỉ đổ danh sách đỉnh vào một <c>Polyline</c>.
///
/// Cách dựng: nới bao hình theo <c>boundingPaddingMm</c>, đi vòng chữ nhật NGƯỢC chiều kim đồng hồ,
/// mỗi cạnh chia thành các cung dài xấp xỉ <c>cloudArcMm × tỉ lệ in</c> (ít nhất 1 cung mỗi cạnh),
/// bụng cung quay RA NGOÀI — đúng dáng cloud của lệnh <c>REVCLOUD</c>.
/// </summary>
public static class RevisionCloud
{
    /// <summary>
    /// Độ cong mỗi cung (bulge = tan(Δθ/4)): 0,5 ⇒ góc mở ≈ 106°, bụng cung ≈ ¼ dây — dáng cloud
    /// quen mắt của AutoCAD. Đi NGƯỢC chiều kim nên bulge ÂM là bụng quay ra ngoài.
    /// </summary>
    public const double BulgeCung = 0.5;

    /// <summary>Số cung của một cạnh dài <paramref name="daiCanh"/> với cung dài <paramref name="daiCung"/>.</summary>
    /// <remarks>Làm tròn về số cung gần nhất, tối thiểu 1 — cạnh ngắn hơn một cung vẫn phải có cung.</remarks>
    public static int SoCungCanh(double daiCanh, double daiCung)
    {
        if (daiCung <= 0) throw new ArgumentOutOfRangeException(nameof(daiCung), "Chiều dài cung cloud phải dương.");
        if (daiCanh <= 0) return 1;
        return Math.Max(1, (int)Math.Round(daiCanh / daiCung, MidpointRounding.AwayFromZero));
    }

    /// <summary>
    /// Dựng cloud quanh <paramref name="bao"/>.
    /// </summary>
    /// <param name="bao">Bao hình vùng đã đổi (đơn vị bản vẽ).</param>
    /// <param name="paddingMm"><c>revisionPolicy.boundingPaddingMm</c> — nới đều 4 phía.</param>
    /// <param name="cungMm"><c>revisionPolicy.cloudArcMm</c> (ở tỉ lệ 1:1).</param>
    /// <param name="tiLeIn">Tỉ lệ in của phiên vẽ (<c>VeContext.TiLeIn</c>) — cung thật = cungMm × tỉ lệ.</param>
    public static BoTriRevisionCloud Dung(BaoHinh bao, double paddingMm, double cungMm, double tiLeIn)
    {
        if (cungMm <= 0) throw new ArgumentOutOfRangeException(nameof(cungMm), "cloudArcMm phải dương.");
        if (tiLeIn <= 0) throw new ArgumentOutOfRangeException(nameof(tiLeIn), "Tỉ lệ in phải dương.");
        if (paddingMm < 0) throw new ArgumentOutOfRangeException(nameof(paddingMm), "boundingPaddingMm không được âm.");

        var vung = bao.NoiRong(paddingMm);
        var daiCung = cungMm * tiLeIn;

        // 4 góc, đi ngược chiều kim đồng hồ.
        var goc = new[]
        {
            new Diem2(vung.MinX, vung.MinY),
            new Diem2(vung.MaxX, vung.MinY),
            new Diem2(vung.MaxX, vung.MaxY),
            new Diem2(vung.MinX, vung.MaxY),
        };

        var dinh = new List<DinhPolyline>();
        var tong = 0;
        for (var i = 0; i < goc.Length; i++)
        {
            var dau = goc[i];
            var cuoi = goc[(i + 1) % goc.Length];
            var n = SoCungCanh(dau.KhoangCach(cuoi), daiCung);
            tong += n;
            for (var k = 0; k < n; k++)
            {
                var t = (double)k / n;
                var diem = dau + (cuoi - dau) * t;
                dinh.Add(new DinhPolyline(diem.X, diem.Y, -BulgeCung));
            }
        }

        return new BoTriRevisionCloud(dinh, vung.GocTrenPhai, tong, vung);
    }
}
