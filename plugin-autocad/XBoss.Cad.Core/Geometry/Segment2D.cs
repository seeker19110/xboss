namespace XBoss.Cad.Core.Geometry;

/// <summary>
/// Hình học đoạn thẳng 2D thuần (M101 §6.1 — nền cho phép kiểm 10/11/16).
/// Mọi số đo theo ĐƠN VỊ BẢN VẼ; quy đổi mm do caller làm (đúng quy ước M99 §6.7).
/// Cung tròn được Adapter duỗi thành chuỗi đoạn thẳng trước khi đưa xuống đây —
/// Core cố ý chỉ biết đoạn thẳng để test được trên CI Linux, không mượn API AutoCAD.
/// </summary>
public static class Segment2D
{
    /// <summary>Chiều dài đoạn.</summary>
    public static double ChieuDai((double X, double Y) a, (double X, double Y) b)
        => Math.Sqrt(BinhPhuongKhoangCach(a, b));

    private static double BinhPhuongKhoangCach((double X, double Y) a, (double X, double Y) b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        return dx * dx + dy * dy;
    }

    /// <summary>
    /// Giao điểm THẬT của hai đoạn (kể cả chạm ở đầu mút); song song/không cắt → null.
    /// Hai đoạn trùng phương (song song) cố ý KHÔNG trả giao điểm: trường hợp đó là chồng lấn,
    /// thuộc phép kiểm 10, không phải giao cắt khác hệ.
    /// </summary>
    public static (double X, double Y)? GiaoDiem(
        (double X, double Y) a1, (double X, double Y) a2,
        (double X, double Y) b1, (double X, double Y) b2)
    {
        var rX = a2.X - a1.X;
        var rY = a2.Y - a1.Y;
        var sX = b2.X - b1.X;
        var sY = b2.Y - b1.Y;
        var mau = rX * sY - rY * sX;
        if (Math.Abs(mau) < 1e-12) return null; // song song hoặc đoạn suy biến

        var qpX = b1.X - a1.X;
        var qpY = b1.Y - a1.Y;
        var t = (qpX * sY - qpY * sX) / mau;
        var u = (qpX * rY - qpY * rX) / mau;
        if (t < 0 || t > 1 || u < 0 || u > 1) return null;
        return (a1.X + t * rX, a1.Y + t * rY);
    }

    /// <summary>
    /// Góc giữa hai HƯỚNG, quy về khoảng 0..90 độ — góc GIAO của hai tuyến (chiều vẽ của polyline
    /// không đổi được kết quả nên phải gập về 0..90, không dùng góc có dấu). Hướng suy biến
    /// (độ dài 0) → 0 độ.
    /// </summary>
    public static double GocGiaoDeg((double X, double Y) u, (double X, double Y) v)
    {
        var duU = Math.Sqrt(u.X * u.X + u.Y * u.Y);
        var duV = Math.Sqrt(v.X * v.X + v.Y * v.Y);
        if (duU < 1e-12 || duV < 1e-12) return 0;
        var cos = Math.Abs(u.X * v.X + u.Y * v.Y) / (duU * duV);
        return Math.Acos(Math.Clamp(cos, -1, 1)) * 180 / Math.PI;
    }

    /// <summary>
    /// Mọi giao điểm giữa hai chuỗi đỉnh (tim đã duỗi thành đoạn thẳng): dùng chung cho phép kiểm 11
    /// của <c>XBOSS_KIEMTRA</c> (chỉ cần toạ độ) và lệnh <c>XBOSS_VE_NGATNET</c> của M109 (cần thêm
    /// hướng hai đoạn + góc giao để dựng vùng che/cầu vượt). MỘT thuật toán duy nhất cho cả hai —
    /// bộ dò giao cắt thứ hai là đúng cách để 2 lệnh trôi khỏi nhau (M109 §1).
    /// </summary>
    public static IEnumerable<GiaoDiemChuoi> GiaoDiemGiuaHaiChuoi(
        IReadOnlyList<(double X, double Y)> a, IReadOnlyList<(double X, double Y)> b)
    {
        for (var i = 0; i + 1 < a.Count; i++)
        {
            for (var j = 0; j + 1 < b.Count; j++)
            {
                var d = Segment2D.GiaoDiem(a[i], a[i + 1], b[j], b[j + 1]);
                if (d is not { } diem) continue;
                var huongA = (a[i + 1].X - a[i].X, a[i + 1].Y - a[i].Y);
                var huongB = (b[j + 1].X - b[j].X, b[j + 1].Y - b[j].Y);
                yield return new GiaoDiemChuoi(
                    diem.X, diem.Y, i, j, huongA, huongB, GocGiaoDeg(huongA, huongB));
            }
        }
    }

    /// <summary>
    /// Hình chiếu vuông góc của điểm lên ĐOẠN (tham số kẹp trong [0;1]) — trả cả tham số lẫn tọa độ.
    /// Đoạn suy biến (hai đầu trùng nhau) → (0, a).
    ///
    /// Dựng đồ thị tuyến (M115) cần chính THAM SỐ này để biết cắt đoạn ở đâu, không chỉ khoảng cách
    /// như <see cref="KhoangCachDiemToiDoan"/>.
    /// </summary>
    public static (double T, (double X, double Y) Diem) ChieuLenDoan(
        (double X, double Y) p, (double X, double Y) a, (double X, double Y) b)
    {
        var l2 = BinhPhuongKhoangCach(a, b);
        if (l2 < 1e-18) return (0, a);
        var t = Math.Clamp(((p.X - a.X) * (b.X - a.X) + (p.Y - a.Y) * (b.Y - a.Y)) / l2, 0, 1);
        return (t, (a.X + t * (b.X - a.X), a.Y + t * (b.Y - a.Y)));
    }

    /// <summary>Khoảng cách từ điểm tới đoạn (không phải tới đường thẳng vô hạn).</summary>
    public static double KhoangCachDiemToiDoan((double X, double Y) p, (double X, double Y) a, (double X, double Y) b)
    {
        var l2 = BinhPhuongKhoangCach(a, b);
        if (l2 < 1e-18) return ChieuDai(p, a);
        var t = ((p.X - a.X) * (b.X - a.X) + (p.Y - a.Y) * (b.Y - a.Y)) / l2;
        t = Math.Clamp(t, 0, 1);
        return ChieuDai(p, (a.X + t * (b.X - a.X), a.Y + t * (b.Y - a.Y)));
    }

    /// <summary>
    /// Chiều dài phần CHỒNG LẤN của đoạn B trên đoạn A khi B nằm trọn trong dải rộng
    /// ±<paramref name="dungSaiNgang"/> dọc theo A (phép kiểm 10). Không nằm trong dải → 0.
    ///
    /// Cố ý dùng điều kiện "cả hai đầu B đều trong dải" thay vì so góc: hai tuyến vẽ đè nhau
    /// ngoài đời luôn gần song song, còn hai tuyến cắt chéo thì ít nhất một đầu văng ra khỏi dải —
    /// một tiêu chí duy nhất, không cần dung sai góc thứ hai.
    /// </summary>
    public static double ChongLanSongSong(
        (double X, double Y) a1, (double X, double Y) a2,
        (double X, double Y) b1, (double X, double Y) b2,
        double dungSaiNgang)
    {
        var dai = ChieuDai(a1, a2);
        if (dai < 1e-9) return 0;
        var uX = (a2.X - a1.X) / dai;
        var uY = (a2.Y - a1.Y) / dai;

        // Chiếu dọc trục (t) và lệch ngang (d) của 2 đầu B so với A.
        var (t1, d1) = ChieuLen(b1);
        var (t2, d2) = ChieuLen(b2);
        if (Math.Abs(d1) > dungSaiNgang || Math.Abs(d2) > dungSaiNgang) return 0;

        var tu = Math.Max(0, Math.Min(t1, t2));
        var den = Math.Min(dai, Math.Max(t1, t2));
        return Math.Max(0, den - tu);

        (double T, double D) ChieuLen((double X, double Y) p)
        {
            var vX = p.X - a1.X;
            var vY = p.Y - a1.Y;
            return (vX * uX + vY * uY, vX * uY - vY * uX);
        }
    }

    /// <summary>
    /// Chỗ HAI ĐOẠN gần nhau nhất: khoảng cách ngắn nhất giữa chúng (đoạn thẳng, không phải đường
    /// thẳng vô hạn) kèm điểm giữa của cặp điểm gần nhau nhất — hai đoạn cắt nhau → (0, giao điểm).
    /// Dùng cho lớp kiểm khoảng cách quy phạm của <c>XBOSS_PHOIHOP</c> (M116 §6 bước 2 lớp 3): cần
    /// cả số đo lẫn CHỖ để đánh dấu/nhảy tới trên bản vẽ.
    ///
    /// Đặt ở đây thay vì trong <c>Coordination/</c> vì là hình học thuần, cùng họ với
    /// <see cref="KhoangCachDiemToiDoan"/>; thêm THUẦN TÚY, không đụng hàm nào sẵn có.
    /// </summary>
    public static (double KhoangCach, (double X, double Y) Diem) GanNhatHaiDoan(
        (double X, double Y) a1, (double X, double Y) a2,
        (double X, double Y) b1, (double X, double Y) b2)
    {
        if (GiaoDiem(a1, a2, b1, b2) is { } giao) return (0, giao);

        // Không cắt nhau ⇒ cặp điểm gần nhau nhất luôn có ít nhất một ĐẦU MÚT của một trong hai đoạn.
        var tot = (KhoangCach: double.MaxValue, Diem: a1);
        foreach (var (p, q1, q2) in new[]
                 {
                     (a1, b1, b2), (a2, b1, b2), (b1, a1, a2), (b2, a1, a2),
                 })
        {
            var (_, hinhChieu) = ChieuLenDoan(p, q1, q2);
            var d = ChieuDai(p, hinhChieu);
            if (d >= tot.KhoangCach) continue;
            tot = (d, ((p.X + hinhChieu.X) / 2, (p.Y + hinhChieu.Y) / 2));
        }
        return tot;
    }

    /// <summary>Khoảng cách từ điểm tới hình chữ nhật trục toạ độ; điểm nằm trong → 0.</summary>
    public static double KhoangCachDiemToiHinhChuNhat(
        (double X, double Y) p, (double X, double Y) min, (double X, double Y) max)
    {
        var dx = Math.Max(Math.Max(min.X - p.X, 0), p.X - max.X);
        var dy = Math.Max(Math.Max(min.Y - p.Y, 0), p.Y - max.Y);
        return Math.Sqrt(dx * dx + dy * dy);
    }

    /// <summary>Hai hình chữ nhật trục toạ độ có giao nhau khi nới rộng thêm <paramref name="noiRong"/>?</summary>
    public static bool BaoGiaoNhau(
        (double X, double Y) min1, (double X, double Y) max1,
        (double X, double Y) min2, (double X, double Y) max2,
        double noiRong)
        => min1.X - noiRong <= max2.X && max1.X + noiRong >= min2.X
           && min1.Y - noiRong <= max2.Y && max1.Y + noiRong >= min2.Y;
}

/// <summary>
/// Một giao điểm giữa hai chuỗi đỉnh: toạ độ, chỉ số đoạn của mỗi bên, hướng hai đoạn tại chỗ giao
/// và góc giao (0..90 độ).
/// </summary>
public readonly record struct GiaoDiemChuoi(
    double X, double Y,
    int ChiSoDoanA, int ChiSoDoanB,
    (double X, double Y) HuongA, (double X, double Y) HuongB,
    double GocDeg);
