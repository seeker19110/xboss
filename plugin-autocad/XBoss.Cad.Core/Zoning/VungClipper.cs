using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Zoning;

/// <summary>Một đoạn của tuyến (đỉnh đầu/cuối + bulge như polyline AutoCAD).</summary>
public sealed record DoanTuyen(Diem2 Dau, Diem2 Cuoi, double Bulge = 0);

/// <summary>Ranh giới một vùng bóc: polyline KÍN (đoạn cuối tự khép về đỉnh đầu nếu chưa khép).</summary>
public sealed record RanhGioiVung(string Ten, IReadOnlyList<DoanTuyen> Bien);

/// <summary>Một phần liên tục của tuyến nằm trong đúng một vùng (hoặc ngoài mọi vùng).</summary>
public sealed record PhanTuyen(string Vung, double ChieuDai, Diem2 Dau, Diem2 Cuoi);

/// <summary>
/// Cắt tuyến theo ranh giới vùng (M101 §6.3 "bóc theo vùng") — THUẦN, không biết gì về AutoCAD,
/// test trên CI Linux. Số đo theo ĐƠN VỊ BẢN VẼ; quy đổi mm do caller làm (quy ước M99 §6.7).
///
/// Cách làm: chia nhỏ mọi cung (cả tuyến lẫn ranh giới) thành chuỗi dây cung ≤ <see cref="BuocCungDo"/>,
/// cắt tại giao điểm với biên, xét điểm giữa từng mẩu để biết nó thuộc vùng nào (ray casting),
/// rồi gộp các mẩu liền nhau cùng vùng. Chiều dài mẩu cung lấy theo CHIỀU DÀI CUNG THẬT
/// (bán kính × góc mở) chia theo tỉ lệ dây cung, không dùng chiều dài dây — sai số &lt; 0,01%
/// với bước 5°, đủ chặt cho bóc khối lượng (làm tròn cuối cùng vẫn ở tổng mỗi dòng).
///
/// Tuyến nằm ngoài mọi vùng KHÔNG bị bỏ rơi: phần đó trả về với tên vùng <see cref="NgoaiVung"/>,
/// tổng chiều dài các phần luôn bằng chiều dài tuyến (không mất mét nào — M101 §18 minh bạch số liệu).
/// Vùng chồng nhau: mẩu thuộc vùng ĐẦU TIÊN chứa nó (first-match, cùng triết lý rule pack).
/// </summary>
public static class VungClipper
{
    /// <summary>Tên vùng của phần tuyến không nằm trong vùng nào.</summary>
    public const string NgoaiVung = "";

    /// <summary>Bước chia cung khi tuyến tính hóa (độ).</summary>
    public const double BuocCungDo = 5;

    private const double DungSaiThamSo = 1e-9;

    /// <summary>Cắt tuyến theo danh sách vùng; trả các phần liên tục theo thứ tự đi dọc tuyến.</summary>
    public static IReadOnlyList<PhanTuyen> Cat(
        IReadOnlyList<DoanTuyen> tuyen, IReadOnlyList<RanhGioiVung> vung)
    {
        var bien = vung.Select(v => (v.Ten, Dinh: TuyenTinhHoaKin(v.Bien))).ToList();
        var ketQua = new List<PhanTuyen>();

        foreach (var (p0, p1, dai) in ChiaMau(tuyen))
        {
            if (dai <= 0) continue;
            foreach (var (tu, den) in CatTheoGiaoDiem(p0, p1, bien))
            {
                var giua = NoiSuy(p0, p1, (tu + den) / 2);
                var ten = TenVungChua(giua, bien);
                var dauMau = NoiSuy(p0, p1, tu);
                var cuoiMau = NoiSuy(p0, p1, den);
                var daiMau = dai * (den - tu);
                if (ketQua.Count > 0 && ketQua[^1].Vung == ten)
                {
                    ketQua[^1] = ketQua[^1] with
                    {
                        ChieuDai = ketQua[^1].ChieuDai + daiMau,
                        Cuoi = cuoiMau,
                    };
                }
                else
                {
                    ketQua.Add(new PhanTuyen(ten, daiMau, dauMau, cuoiMau));
                }
            }
        }
        return ketQua;
    }

    /// <summary>Tổng chiều dài theo tên vùng (giữ thứ tự gặp trên tuyến).</summary>
    public static IReadOnlyList<(string Vung, double ChieuDai)> GopTheoVung(IEnumerable<PhanTuyen> phan)
    {
        var thuTu = new List<string>();
        var tong = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (var p in phan)
        {
            if (!tong.ContainsKey(p.Vung)) thuTu.Add(p.Vung);
            tong[p.Vung] = tong.GetValueOrDefault(p.Vung) + p.ChieuDai;
        }
        return thuTu.Select(v => (v, tong[v])).ToList();
    }

    /// <summary>Vùng chứa một điểm (dùng cho block/hatch — không cắt được thì xét điểm đại diện).</summary>
    public static string VungChuaDiem(Diem2 diem, IReadOnlyList<RanhGioiVung> vung) =>
        TenVungChua(diem, vung.Select(v => (v.Ten, Dinh: TuyenTinhHoaKin(v.Bien))).ToList());

    // ===== Nội bộ =====

    /// <summary>Chia tuyến thành các mẩu thẳng kèm chiều dài THẬT (cung tính theo bán kính × góc).</summary>
    private static IEnumerable<(Diem2 Dau, Diem2 Cuoi, double ChieuDai)> ChiaMau(IReadOnlyList<DoanTuyen> tuyen)
    {
        foreach (var doan in tuyen)
        {
            var diem = ChiaDoan(doan);
            var daiThat = BulgeMath.ChieuDaiDoan(doan.Dau, doan.Cuoi, doan.Bulge);
            var soMau = diem.Count - 1;
            if (soMau <= 0) continue;
            for (var i = 0; i < soMau; i++)
            {
                // Cung chia đều theo GÓC nên mọi mẩu dài bằng nhau; đoạn thẳng chỉ có 1 mẩu.
                yield return (diem[i], diem[i + 1], daiThat / soMau);
            }
        }
    }

    /// <summary>Chuỗi đỉnh của một đoạn (cung chia theo bước <see cref="BuocCungDo"/>).</summary>
    private static List<Diem2> ChiaDoan(DoanTuyen doan)
    {
        if (BulgeMath.LaThang(doan.Bulge) ||
            BulgeMath.Cung(doan.Dau, doan.Cuoi, doan.Bulge) is not { } cung)
        {
            return [doan.Dau, doan.Cuoi];
        }
        var gocMo = BulgeMath.GocMo(doan.Bulge);
        var buoc = BuocCungDo * Math.PI / 180;
        var soPhan = Math.Max(1, (int)Math.Ceiling(Math.Abs(gocMo) / buoc));
        var gocDau = Math.Atan2(doan.Dau.Y - cung.Tam.Y, doan.Dau.X - cung.Tam.X);
        var diem = new List<Diem2> { doan.Dau };
        for (var i = 1; i <= soPhan; i++)
        {
            var g = gocDau + gocMo * i / soPhan;
            diem.Add(new Diem2(cung.Tam.X + cung.BanKinh * Math.Cos(g), cung.Tam.Y + cung.BanKinh * Math.Sin(g)));
        }
        diem[^1] = doan.Cuoi; // khép đúng điểm cuối, tránh sai số tích lũy
        return diem;
    }

    /// <summary>Đỉnh của ranh giới sau khi tuyến tính hóa, đã khép kín.</summary>
    private static List<Diem2> TuyenTinhHoaKin(IReadOnlyList<DoanTuyen> bien)
    {
        var diem = new List<Diem2>();
        foreach (var doan in bien)
        {
            var phan = ChiaDoan(doan);
            for (var i = 0; i < phan.Count; i++)
            {
                if (diem.Count > 0 && diem[^1].KhoangCach(phan[i]) < 1e-12) continue;
                diem.Add(phan[i]);
            }
        }
        if (diem.Count > 1 && diem[0].KhoangCach(diem[^1]) > 1e-12) diem.Add(diem[0]);
        return diem;
    }

    /// <summary>Các khoảng tham số [t0,t1] của mẩu sau khi cắt tại mọi giao điểm với biên.</summary>
    private static List<(double Tu, double Den)> CatTheoGiaoDiem(
        Diem2 p0, Diem2 p1, List<(string Ten, List<Diem2> Dinh)> bien)
    {
        var moc = new List<double> { 0, 1 };
        foreach (var (_, dinh) in bien)
        {
            for (var i = 0; i + 1 < dinh.Count; i++)
            {
                if (ThamSoGiao(p0, p1, dinh[i], dinh[i + 1]) is { } t && t > DungSaiThamSo && t < 1 - DungSaiThamSo)
                    moc.Add(t);
            }
        }
        moc.Sort();

        var khoang = new List<(double, double)>();
        for (var i = 0; i + 1 < moc.Count; i++)
        {
            if (moc[i + 1] - moc[i] > DungSaiThamSo) khoang.Add((moc[i], moc[i + 1]));
        }
        return khoang.Count > 0 ? khoang : [(0, 1)];
    }

    /// <summary>Tham số t trên đoạn a (0..1) tại giao điểm với đoạn b; null khi không cắt/song song.</summary>
    private static double? ThamSoGiao(Diem2 a0, Diem2 a1, Diem2 b0, Diem2 b1)
    {
        var rX = a1.X - a0.X;
        var rY = a1.Y - a0.Y;
        var sX = b1.X - b0.X;
        var sY = b1.Y - b0.Y;
        var mau = rX * sY - rY * sX;
        if (Math.Abs(mau) < 1e-15) return null; // song song hoặc suy biến
        var qpX = b0.X - a0.X;
        var qpY = b0.Y - a0.Y;
        var t = (qpX * sY - qpY * sX) / mau;
        var u = (qpX * rY - qpY * rX) / mau;
        if (t < 0 || t > 1 || u < 0 || u > 1) return null;
        return t;
    }

    private static Diem2 NoiSuy(Diem2 a, Diem2 b, double t) => new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

    private static string TenVungChua(Diem2 diem, List<(string Ten, List<Diem2> Dinh)> bien)
    {
        foreach (var (ten, dinh) in bien)
        {
            if (TrongDaGiac(diem, dinh)) return ten;
        }
        return NgoaiVung;
    }

    /// <summary>Ray casting (even-odd) — đa giác đã khép kín.</summary>
    private static bool TrongDaGiac(Diem2 p, List<Diem2> dinh)
    {
        var trong = false;
        for (int i = 0, j = dinh.Count - 1; i < dinh.Count; j = i++)
        {
            var a = dinh[i];
            var b = dinh[j];
            if (a.Y > p.Y != b.Y > p.Y &&
                p.X < (b.X - a.X) * (p.Y - a.Y) / (b.Y - a.Y) + a.X)
            {
                trong = !trong;
            }
        }
        return trong;
    }
}
