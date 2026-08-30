namespace XBoss.Cad.Core.Draw;

/// <summary>Điểm 2D thuần (mặt phẳng vẽ) — Core không được biết Point2d của AutoCAD.</summary>
public readonly record struct Diem2(double X, double Y)
{
    public static Diem2 operator +(Diem2 a, Diem2 b) => new(a.X + b.X, a.Y + b.Y);
    public static Diem2 operator -(Diem2 a, Diem2 b) => new(a.X - b.X, a.Y - b.Y);
    public static Diem2 operator *(Diem2 a, double k) => new(a.X * k, a.Y * k);

    public double DoDai => Math.Sqrt(X * X + Y * Y);
    public double KhoangCach(Diem2 khac) => (this - khac).DoDai;
}

/// <summary>
/// Hình học cung tròn theo quy ước <c>bulge</c> của polyline AutoCAD (M100 §6.1 bước 3):
/// bulge = tan(Δθ/4), dương = ngược chiều kim đồng hồ. THUẦN — không tham chiếu AutoCAD,
/// test trên CI Linux (M100 FR11).
///
/// Quy ước góc: mọi góc tính bằng radian, đo ngược chiều kim từ trục +X.
/// Tiếp tuyến đầu đoạn = góc dây cung − Δθ/2; tiếp tuyến cuối đoạn = góc dây cung + Δθ/2.
/// </summary>
public static class BulgeMath
{
    /// <summary>Dưới ngưỡng này coi bulge = 0 (đoạn thẳng) — bằng sai số làm tròn của AutoCAD.</summary>
    public const double NguongThang = 1e-12;

    public static bool LaThang(double bulge) => Math.Abs(bulge) <= NguongThang;

    /// <summary>Góc mở Δθ (radian, có dấu) của cung mang <paramref name="bulge"/>.</summary>
    public static double GocMo(double bulge) => 4 * Math.Atan(bulge);

    /// <summary>Góc của dây cung (radian) từ <paramref name="dau"/> tới <paramref name="cuoi"/>.</summary>
    public static double GocDayCung(Diem2 dau, Diem2 cuoi) => Math.Atan2(cuoi.Y - dau.Y, cuoi.X - dau.X);

    /// <summary>Hướng tiếp tuyến tại ĐẦU đoạn (radian).</summary>
    public static double HuongDauDoan(Diem2 dau, Diem2 cuoi, double bulge) =>
        GocDayCung(dau, cuoi) - GocMo(bulge) / 2;

    /// <summary>Hướng tiếp tuyến tại CUỐI đoạn (radian).</summary>
    public static double HuongCuoiDoan(Diem2 dau, Diem2 cuoi, double bulge) =>
        GocDayCung(dau, cuoi) + GocMo(bulge) / 2;

    /// <summary>Pháp tuyến TRÁI (đơn vị) của hướng đi <paramref name="huong"/> — quay +90°.</summary>
    public static Diem2 PhapTuyenTrai(double huong) => new(-Math.Sin(huong), Math.Cos(huong));

    /// <summary>Tâm + bán kính (dương) + chiều của cung; null khi đoạn là đường thẳng hoặc suy biến.</summary>
    public static (Diem2 Tam, double BanKinh, bool NguocKim)? Cung(Diem2 dau, Diem2 cuoi, double bulge)
    {
        if (LaThang(bulge)) return null;
        var day = cuoi - dau;
        var c = day.DoDai;
        if (c <= 0) return null; // hai đỉnh trùng nhau — không dựng được cung

        var gocMo = GocMo(bulge);
        var sin = Math.Sin(gocMo / 2);
        if (Math.Abs(sin) < 1e-15) return null;
        var banKinhCoDau = c / (2 * sin);                 // âm khi cung đi thuận chiều kim
        var giua = dau + day * 0.5;
        var phap = PhapTuyenTrai(GocDayCung(dau, cuoi));  // pháp tuyến trái của dây cung
        var tam = giua + phap * (banKinhCoDau * Math.Cos(gocMo / 2));
        return (tam, Math.Abs(banKinhCoDau), bulge > 0);
    }

    /// <summary>Chiều dài đoạn (thẳng hoặc cung).</summary>
    public static double ChieuDaiDoan(Diem2 dau, Diem2 cuoi, double bulge)
    {
        if (LaThang(bulge)) return dau.KhoangCach(cuoi);
        if (Cung(dau, cuoi, bulge) is not { } cung) return dau.KhoangCach(cuoi);
        return cung.BanKinh * Math.Abs(GocMo(bulge));
    }

    /// <summary>
    /// Bulge của cung ĐI TIẾP tiếp tuyến với hướng hiện tại (đúng cách PLINE chế độ Arc nối
    /// tiếp đoạn trước): cung xuất phát từ <paramref name="dau"/> theo hướng
    /// <paramref name="huongVao"/> và kết thúc tại <paramref name="cuoi"/>.
    /// Null khi điểm cuối nằm ngược đúng hướng vào (không có cung nào đi qua).
    /// </summary>
    public static double? BulgeTiepTuyen(Diem2 dau, double huongVao, Diem2 cuoi)
    {
        var day = cuoi - dau;
        if (day.DoDai <= 0) return null;
        var lech = ChuanHoaGoc(GocDayCung(dau, cuoi) - huongVao); // α trong (-π, π]
        if (Math.Abs(Math.Abs(lech) - Math.PI) < 1e-9) return null;
        return Math.Tan(lech / 2); // Δθ = 2α ⇒ bulge = tan(Δθ/4) = tan(α/2)
    }

    /// <summary>Đưa góc về khoảng (-π, π].</summary>
    public static double ChuanHoaGoc(double goc)
    {
        var g = goc % (2 * Math.PI);
        if (g > Math.PI) g -= 2 * Math.PI;
        if (g <= -Math.PI) g += 2 * Math.PI;
        return g;
    }

    /// <summary>Chia nhỏ một đoạn thành chuỗi điểm (cung chia theo bước ≤15°) — phục vụ dò tự cắt.</summary>
    public static List<Diem2> ChiaNho(Diem2 dau, Diem2 cuoi, double bulge)
    {
        var diem = new List<Diem2> { dau };
        if (LaThang(bulge) || Cung(dau, cuoi, bulge) is not { } cung)
        {
            diem.Add(cuoi);
            return diem;
        }
        var gocMo = GocMo(bulge);
        var soPhan = Math.Max(1, (int)Math.Ceiling(Math.Abs(gocMo) / (Math.PI / 12)));
        var gocDau = Math.Atan2(dau.Y - cung.Tam.Y, dau.X - cung.Tam.X);
        for (var i = 1; i <= soPhan; i++)
        {
            var g = gocDau + gocMo * i / soPhan;
            diem.Add(new Diem2(
                cung.Tam.X + cung.BanKinh * Math.Cos(g),
                cung.Tam.Y + cung.BanKinh * Math.Sin(g)));
        }
        diem[^1] = cuoi; // khép đúng điểm cuối, tránh sai số tích lũy
        return diem;
    }
}
