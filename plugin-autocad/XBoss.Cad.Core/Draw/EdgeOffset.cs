namespace XBoss.Cad.Core.Draw;

/// <summary>Đỉnh polyline 2D + bulge — đúng mô hình LWPOLYLINE của AutoCAD.</summary>
public readonly record struct DinhPolyline(double X, double Y, double Bulge)
{
    public Diem2 Diem => new(X, Y);
}

/// <summary>
/// Kết quả sinh nét biên: hoặc đủ 2 nét (trái/phải theo chiều vẽ), hoặc một lý do tiếng Việt
/// vì sao KHÔNG offset được — khi đó lệnh vẽ chỉ vẽ tim và cảnh báo, tuyệt đối không vẽ biên sai
/// (M100 §18 "nét biên lệch khi tuyến có cung phức tạp").
/// </summary>
public sealed class KetQuaOffset
{
    public bool ThanhCong => LyDo is null;
    public string? LyDo { get; private init; }
    public IReadOnlyList<DinhPolyline> Trai { get; private init; } = [];
    public IReadOnlyList<DinhPolyline> Phai { get; private init; } = [];

    public static KetQuaOffset Loi(string lyDo) => new() { LyDo = lyDo };

    public static KetQuaOffset Dat(IReadOnlyList<DinhPolyline> trai, IReadOnlyList<DinhPolyline> phai) =>
        new() { Trai = trai, Phai = phai };
}

/// <summary>
/// Sinh 2 nét biên từ polyline tim + bề rộng (M100 §6.1 bước 3, FR4) — THUẦN, không tham chiếu
/// AutoCAD (FR11), test trên CI Linux.
///
/// Nguyên lý: mỗi đoạn (thẳng hoặc cung) dịch đúng ±w/2 theo pháp tuyến trái của chính nó
/// (cung dịch đồng tâm nên GIỮ NGUYÊN bulge, bán kính đổi ±w/2); tại đỉnh nối, hai đoạn biên
/// gặp nhau ở điểm mitre = P + d·(n₁+n₂)/(1+n₁·n₂) — công thức này ĐÚNG TUYỆT ĐỐI cho nối
/// thẳng–thẳng và cho nối tiếp tuyến (n₁ = n₂, không có góc); với nối cung–thẳng KHÔNG tiếp
/// tuyến (hiếm trong tuyến MEP: chỗ ngoặt là phụ kiện, không phải cung gãy) điểm mitre là xấp xỉ
/// bậc nhất — sai số nằm trong phạm vi một đỉnh, KHÔNG lan ra cả tuyến.
///
/// Từ chối offset (trả lý do) khi: bề rộng ≤ 0; ít hơn 2 đỉnh phân biệt; tuyến tự cắt;
/// cung có bán kính ≤ w/2 (biên sẽ lộn ngược); đỉnh gấp gần 180°; đoạn quá ngắn so với bề rộng
/// khiến nét biên đảo chiều.
/// </summary>
public static class EdgeOffset
{
    /// <summary>Hai đỉnh cách nhau dưới ngưỡng này coi là trùng (đơn vị bản vẽ).</summary>
    public const double NguongTrungDinh = 1e-9;

    /// <summary>Ngưỡng của (1 + n₁·n₂): dưới ngưỡng = đỉnh gấp ngược ~180°, mitre chạy ra vô cực.</summary>
    private const double NguongMitre = 1e-6;

    /// <summary>
    /// Tính 2 nét biên cách tim <paramref name="beRong"/>/2 mỗi bên.
    /// <paramref name="beRong"/> tính theo ĐƠN VỊ BẢN VẼ (caller tự quy đổi mm → đơn vị bản vẽ).
    /// </summary>
    public static KetQuaOffset Tinh(IReadOnlyList<DinhPolyline> tim, double beRong, bool kin = false)
    {
        if (beRong <= 0) return KetQuaOffset.Loi("Bề rộng tuyến phải lớn hơn 0 mới sinh được nét biên.");

        var dinh = BoDinhTrung(tim);
        if (dinh.Count < 2) return KetQuaOffset.Loi("Tuyến tim có ít hơn 2 đỉnh phân biệt — không sinh được nét biên.");
        if (kin && dinh.Count < 3) return KetQuaOffset.Loi("Tuyến kín cần ít nhất 3 đỉnh phân biệt.");
        if (TuCat(dinh, kin))
            return KetQuaOffset.Loi("Tuyến tim tự cắt — nét biên sẽ sai, hãy tách thành nhiều tuyến.");

        var d = beRong / 2;
        var trai = MotBen(dinh, d, kin);
        if (trai.Loi is { } loiTrai) return KetQuaOffset.Loi(loiTrai);
        var phai = MotBen(dinh, -d, kin);
        if (phai.Loi is { } loiPhai) return KetQuaOffset.Loi(loiPhai);
        return KetQuaOffset.Dat(trai.Dinh!, phai.Dinh!);
    }

    /// <summary>Bỏ các đỉnh trùng liên tiếp (giữ bulge của đỉnh được giữ lại).</summary>
    private static List<DinhPolyline> BoDinhTrung(IReadOnlyList<DinhPolyline> tim)
    {
        var ra = new List<DinhPolyline>();
        foreach (var d in tim)
        {
            if (ra.Count > 0 && ra[^1].Diem.KhoangCach(d.Diem) <= NguongTrungDinh)
            {
                // Đỉnh trùng: giữ bulge khác 0 nếu có (đỉnh sau mang thông tin cung).
                if (!BulgeMath.LaThang(d.Bulge)) ra[^1] = ra[^1] with { Bulge = d.Bulge };
                continue;
            }
            ra.Add(d);
        }
        return ra;
    }

    /// <summary>Offset về một bên: <paramref name="d"/> &gt; 0 = bên trái theo chiều vẽ.</summary>
    private static (List<DinhPolyline>? Dinh, string? Loi) MotBen(List<DinhPolyline> dinh, double d, bool kin)
    {
        var soDoan = kin ? dinh.Count : dinh.Count - 1;

        // Pháp tuyến trái tại đầu/cuối từng đoạn + kiểm bán kính cung sau khi offset.
        var phapDau = new Diem2[soDoan];
        var phapCuoi = new Diem2[soDoan];
        for (var i = 0; i < soDoan; i++)
        {
            var a = dinh[i];
            var b = dinh[(i + 1) % dinh.Count];
            phapDau[i] = BulgeMath.PhapTuyenTrai(BulgeMath.HuongDauDoan(a.Diem, b.Diem, a.Bulge));
            phapCuoi[i] = BulgeMath.PhapTuyenTrai(BulgeMath.HuongCuoiDoan(a.Diem, b.Diem, a.Bulge));

            if (BulgeMath.LaThang(a.Bulge)) continue;
            if (BulgeMath.Cung(a.Diem, b.Diem, a.Bulge) is not { } cung)
                return (null, $"Đoạn cung thứ {i + 1} suy biến — không sinh được nét biên.");
            // Dịch sang trái: cung ngược kim thu bán kính lại, cung thuận kim nở ra.
            var banKinhMoi = cung.BanKinh - d * (cung.NguocKim ? 1 : -1);
            if (banKinhMoi <= NguongTrungDinh)
            {
                return (null,
                    $"Cung ở đoạn thứ {i + 1} có bán kính {cung.BanKinh:0.##} nhỏ hơn nửa bề rộng " +
                    $"{Math.Abs(d):0.##} — nét biên sẽ lộn ngược.");
            }
        }

        var ra = new List<DinhPolyline>(dinh.Count);
        for (var i = 0; i < dinh.Count; i++)
        {
            var laDinhDau = i == 0;
            var laDinhCuoi = i == dinh.Count - 1;
            Diem2 lech;
            if (!kin && laDinhDau)
            {
                lech = phapDau[0] * d;
            }
            else if (!kin && laDinhCuoi)
            {
                lech = phapCuoi[soDoan - 1] * d;
            }
            else
            {
                // Đỉnh nối: mitre giữa pháp tuyến cuối đoạn trước và pháp tuyến đầu đoạn sau.
                var truoc = kin ? (i - 1 + soDoan) % soDoan : i - 1;
                var n1 = phapCuoi[truoc];
                var n2 = phapDau[i % soDoan];
                var mau = 1 + (n1.X * n2.X + n1.Y * n2.Y);
                if (mau <= NguongMitre)
                {
                    return (null,
                        $"Tuyến gấp ngược gần 180° tại đỉnh thứ {i + 1} — không sinh được nét biên " +
                        "(tách thành 2 tuyến riêng).");
                }
                lech = (n1 + n2) * (d / mau);
            }

            var goc = dinh[i];
            var diem = goc.Diem + lech;
            // Cung offset đồng tâm giữ nguyên góc mở ⇒ giữ nguyên bulge.
            ra.Add(new DinhPolyline(diem.X, diem.Y, goc.Bulge));
        }

        // Đoạn thẳng bị đảo chiều = bề rộng nuốt mất đoạn ngắn → biên sai, từ chối.
        for (var i = 0; i < soDoan; i++)
        {
            if (!BulgeMath.LaThang(dinh[i].Bulge)) continue;
            var goc = dinh[(i + 1) % dinh.Count].Diem - dinh[i].Diem;
            var moi = ra[(i + 1) % ra.Count].Diem - ra[i].Diem;
            if (goc.X * moi.X + goc.Y * moi.Y < 0)
            {
                return (null,
                    $"Đoạn thứ {i + 1} quá ngắn so với bề rộng tuyến — nét biên bị đảo chiều. " +
                    "Chọn size nhỏ hơn hoặc kéo dài đoạn.");
            }
        }

        return (ra, null);
    }

    /// <summary>
    /// Tuyến có tự cắt không (cung được chia nhỏ ≤15° để kiểm). Chỉ tính giao cắt ở phần TRONG
    /// hai đoạn — hai đoạn kề nhau chạm nhau ở đỉnh chung là bình thường, không tính.
    /// </summary>
    public static bool TuCat(IReadOnlyList<DinhPolyline> dinh, bool kin = false)
    {
        var doan = new List<(Diem2 A, Diem2 B)>();
        var soDoan = kin ? dinh.Count : dinh.Count - 1;
        for (var i = 0; i < soDoan; i++)
        {
            var a = dinh[i];
            var b = dinh[(i + 1) % dinh.Count];
            var chia = BulgeMath.ChiaNho(a.Diem, b.Diem, a.Bulge);
            for (var k = 0; k + 1 < chia.Count; k++) doan.Add((chia[k], chia[k + 1]));
        }
        for (var i = 0; i < doan.Count; i++)
        {
            for (var j = i + 2; j < doan.Count; j++)
            {
                if (CatNhau(doan[i], doan[j])) return true;
            }
        }
        return false;
    }

    /// <summary>Hai đoạn thẳng cắt nhau ở phần trong của cả hai (không tính chạm đầu mút).</summary>
    private static bool CatNhau((Diem2 A, Diem2 B) p, (Diem2 A, Diem2 B) q)
    {
        const double eps = 1e-9;
        var r = p.B - p.A;
        var s = q.B - q.A;
        var mau = r.X * s.Y - r.Y * s.X;
        if (Math.Abs(mau) < 1e-15) return false; // song song/trùng — không kết luận tự cắt
        var chenh = q.A - p.A;
        var t = (chenh.X * s.Y - chenh.Y * s.X) / mau;
        var u = (chenh.X * r.Y - chenh.Y * r.X) / mau;
        return t > eps && t < 1 - eps && u > eps && u < 1 - eps;
    }
}
