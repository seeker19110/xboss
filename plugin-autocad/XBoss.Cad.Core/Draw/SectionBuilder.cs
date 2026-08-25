namespace XBoss.Cad.Core.Draw;

/// <summary>Loại ký hiệu mặt cắt của một tuyến (M100 §6.4 bước 2).</summary>
public enum LoaiKyHieuMatCat
{
    /// <summary>Ống gió: chữ nhật đúng W×H.</summary>
    ChuNhat,
    /// <summary>Ống tròn: đường tròn đúng DN.</summary>
    Tron,
    /// <summary>Máng cáp: chữ nhật W×H kèm nét đáy máng.</summary>
    MangCap,
}

/// <summary>
/// Một tuyến tim ứng viên của mặt cắt — Adapter đọc từ model space (polyline + XData
/// <c>XBOSS_VE</c>), Core chỉ nhận dữ liệu thuần.
/// </summary>
public sealed record TimMatCat
{
    /// <summary>Handle AutoCAD của polyline tim (dùng trong cảnh báo + XData snapshot).</summary>
    public required string Handle { get; init; }

    public string HeId { get; init; } = "";
    public string ItemId { get; init; } = "";

    /// <summary>Chuỗi size nguyên văn trong XData (<c>300x200</c>, <c>DN50</c>).</summary>
    public string Size { get; init; } = "";

    /// <summary><c>WxH</c> / <c>DN</c> từ rule pack; rỗng = không tra được loại tuyến.</summary>
    public string SizeKind { get; init; } = "";

    public string Layer { get; init; } = "";

    /// <summary>Độ dốc trong XData (<c>2%</c>) — in kèm nhãn ký hiệu; null = tuyến không có độ dốc.</summary>
    public string? DoDoc { get; init; }

    public required IReadOnlyList<DinhPolyline> Dinh { get; init; }
    public bool Kin { get; init; }
}

/// <summary>Một ký hiệu mặt cắt đã tính xong hình học (chưa có cao độ — cao độ nhập tay ở Adapter).</summary>
public sealed record KyHieuMatCat
{
    public required TimMatCat Tim { get; init; }
    public required LoaiKyHieuMatCat Loai { get; init; }

    /// <summary>Khoảng cách từ điểm ĐẦU tuyến cắt tới giao điểm (đơn vị bản vẽ).</summary>
    public required double KhoangCachDoc { get; init; }

    /// <summary>
    /// Hoành độ trong hình cắt = khoảng cách ngang THẬT so với ký hiệu trái nhất (AC11) —
    /// ký hiệu đầu tiên nằm đúng điểm kỹ sư bấm đặt hình cắt.
    /// </summary>
    public required double LechNgang { get; init; }

    /// <summary>Giao điểm trong mặt bằng (để Adapter chấm dấu/kiểm khi cần).</summary>
    public required Diem2 GiaoDiem { get; init; }

    /// <summary>Bề rộng ký hiệu (đơn vị bản vẽ); ống tròn = đường kính.</summary>
    public required double RongDv { get; init; }

    /// <summary>Chiều cao ký hiệu (đơn vị bản vẽ); ống tròn = đường kính.</summary>
    public required double CaoDv { get; init; }

    /// <summary>Nhãn size lấy NGUYÊN VĂN từ XData (M100 §13 — không tự chế format).</summary>
    public required string Nhan { get; init; }
}

/// <summary>Kết quả dựng mặt cắt: các ký hiệu đã xếp thứ tự + cảnh báo tiếng Việt cho kỹ sư.</summary>
public sealed record KetQuaMatCat(IReadOnlyList<KyHieuMatCat> KyHieu, IReadOnlyList<string> CanhBao);

/// <summary>
/// Dựng khung mặt cắt từ tuyến cắt (2 điểm) × các tuyến tim đã vẽ bằng <c>XBOSS_VE</c>
/// (M100 §6.4, FR9b, AC11) — THUẦN, không tham chiếu AutoCAD (FR11), test trên CI Linux.
///
/// Ranh giới cố ý (M100 §5 non-goals): Core CHỈ tính giao điểm, thứ tự chiếu lên tuyến cắt,
/// loại + kích thước ký hiệu và khoảng cách ngang thật. **Cao độ KHÔNG nằm ở đây** — bản vẽ 2D
/// không chứa cao độ lắp đặt, kỹ sư nhập tay từng tuyến rồi Adapter ghép qua
/// <see cref="ToaDoKyHieu"/>. Không có giá trị cao độ ngầm ở bất kỳ đâu trong lớp này.
///
/// Tuyến (gần) song song tuyến cắt bị BỎ QUA kèm cảnh báo: cắt dọc theo tuyến thì bề rộng đọc
/// được trên hình cắt không còn là kích thước thật, thà thiếu còn hơn vẽ sai.
/// </summary>
public static class SectionBuilder
{
    /// <summary>Dưới góc này coi tuyến là song song tuyến cắt (độ).</summary>
    public const double GocSongSongDo = 5.0;

    /// <summary>Sai số hình học tương đối trên chiều dài tuyến cắt.</summary>
    private const double Eps = 1e-9;

    /// <summary>
    /// Tính các ký hiệu mặt cắt. <paramref name="mmMoiDonVi"/> = số mm của 1 đơn vị bản vẽ
    /// (<c>DrawingUnits.TuInsUnits</c>) — size trong rule pack luôn là mm.
    /// </summary>
    public static KetQuaMatCat Dung(
        Diem2 dauTuyenCat,
        Diem2 cuoiTuyenCat,
        IReadOnlyList<TimMatCat> danhSachTim,
        double mmMoiDonVi)
    {
        var canhBao = new List<string>();
        if (mmMoiDonVi <= 0)
            return new KetQuaMatCat([], ["Đơn vị bản vẽ không hợp lệ — không dựng được mặt cắt."]);

        var huong = cuoiTuyenCat - dauTuyenCat;
        var chieuDai = huong.DoDai;
        if (chieuDai <= Eps)
            return new KetQuaMatCat([], ["Tuyến cắt quá ngắn (hai điểm trùng nhau) — chưa dựng được mặt cắt."]);
        var don = huong * (1 / chieuDai);
        var sinNguong = Math.Sin(GocSongSongDo * Math.PI / 180);

        var tho = new List<KyHieuMatCat>();
        foreach (var tim in danhSachTim)
        {
            var (giao, coSongSong) = GiaoVoiTim(dauTuyenCat, don, chieuDai, tim, sinNguong, mmMoiDonVi);
            if (giao.Count == 0)
            {
                if (coSongSong)
                {
                    canhBao.Add(
                        $"Tuyến {MoTa(tim)} chạy song song tuyến cắt — bỏ qua (mặt cắt dọc tuyến không đọc được " +
                        "kích thước thật; kẻ tuyến cắt vuông góc rồi chạy lại).");
                }
                continue;
            }

            var kichThuoc = DrawSize.PhanTich(tim.Size);
            if (kichThuoc is null)
            {
                canhBao.Add(
                    $"Tuyến {MoTa(tim)}: không đọc được kích thước từ size \"{tim.Size}\" — bỏ qua " +
                    "(plugin không bịa kích thước ký hiệu mặt cắt).");
                continue;
            }

            var rong = kichThuoc.RongMm / mmMoiDonVi;
            var cao = (kichThuoc.CaoMm ?? kichThuoc.RongMm) / mmMoiDonVi;
            var loai = kichThuoc.CaoMm is null
                ? LoaiKyHieuMatCat.Tron
                : LaMangCap(tim) ? LoaiKyHieuMatCat.MangCap : LoaiKyHieuMatCat.ChuNhat;

            foreach (var (t, diem) in giao)
            {
                tho.Add(new KyHieuMatCat
                {
                    Tim = tim,
                    Loai = loai,
                    KhoangCachDoc = t,
                    LechNgang = 0, // đặt lại sau khi biết ký hiệu trái nhất
                    GiaoDiem = diem,
                    RongDv = rong,
                    CaoDv = cao,
                    Nhan = tim.Size,
                });
            }
        }

        if (tho.Count == 0) return new KetQuaMatCat([], canhBao);

        // Thứ tự chiếu lên tuyến cắt (trái → phải theo chiều kẻ tuyến cắt); trùng vị trí thì
        // xếp theo handle để kết quả ổn định giữa các lần chạy.
        var xep = tho
            .OrderBy(k => k.KhoangCachDoc)
            .ThenBy(k => k.Tim.Handle, StringComparer.Ordinal)
            .ToList();
        var goc = xep[0].KhoangCachDoc;
        var kyHieu = xep.Select(k => k with { LechNgang = k.KhoangCachDoc - goc }).ToList();

        return new KetQuaMatCat(kyHieu, canhBao);
    }

    /// <summary>
    /// Tâm ký hiệu trong hình cắt: hoành độ giữ đúng khoảng cách ngang thật, tung độ là
    /// <b>cao độ tim tuyến do kỹ sư nhập tay</b> (đơn vị bản vẽ) so với điểm đặt = cao độ 0.
    /// </summary>
    public static Diem2 ToaDoKyHieu(KyHieuMatCat kyHieu, Diem2 diemDat, double caoDoDv) =>
        new(diemDat.X + kyHieu.LechNgang, diemDat.Y + caoDoDv);

    /// <summary>4 góc chữ nhật quanh tâm (thứ tự ngược chiều kim từ góc dưới–trái).</summary>
    public static IReadOnlyList<Diem2> KhungChuNhat(Diem2 tam, double rong, double cao)
    {
        var nx = rong / 2;
        var ny = cao / 2;
        return
        [
            new Diem2(tam.X - nx, tam.Y - ny),
            new Diem2(tam.X + nx, tam.Y - ny),
            new Diem2(tam.X + nx, tam.Y + ny),
            new Diem2(tam.X - nx, tam.Y + ny),
        ];
    }

    /// <summary>
    /// Nét đáy máng cáp (mặt cắt máng = chữ nhật W×H + nét lớp cáp nằm ở 1/4 chiều cao tính từ
    /// đáy) — đủ để phân biệt máng với ống gió trên bản in mà không cần block riêng.
    /// </summary>
    public static (Diem2 Trai, Diem2 Phai) NetDayMang(Diem2 tam, double rong, double cao)
    {
        var y = tam.Y - cao / 4;
        return (new Diem2(tam.X - rong / 2, y), new Diem2(tam.X + rong / 2, y));
    }

    // ===== Nội bộ =====

    private static string MoTa(TimMatCat tim) =>
        $"{(string.IsNullOrWhiteSpace(tim.ItemId) ? "?" : tim.ItemId)} {tim.Size} (handle {tim.Handle})";

    /// <summary>
    /// Máng cáp nhận diện qua itemId (rule pack v4 chỉ có <c>sizeKind</c>/<c>edgeStyle</c>, không
    /// khai loại ký hiệu mặt cắt): itemId chứa <c>tray</c> hoặc <c>cabl</c>. Không nhận ra thì vẽ
    /// chữ nhật đúng W×H — vẫn đúng kích thước, chỉ thiếu nét đáy máng.
    /// </summary>
    private static bool LaMangCap(TimMatCat tim)
    {
        var id = tim.ItemId.ToLowerInvariant();
        return id.Contains("tray") || id.Contains("cabl");
    }

    /// <summary>Giao điểm của tuyến cắt với một tim: trả (khoảng cách dọc, điểm) + cờ song song.</summary>
    private static (List<(double T, Diem2 Diem)> Giao, bool CoSongSong) GiaoVoiTim(
        Diem2 dau, Diem2 don, double chieuDai, TimMatCat tim, double sinNguong, double mmMoiDonVi)
    {
        var giao = new List<(double T, Diem2 Diem)>();
        var songSong = false;

        var dinh = tim.Dinh;
        if (dinh.Count < 2) return (giao, false);
        var soDoan = tim.Kin ? dinh.Count : dinh.Count - 1;

        for (var i = 0; i < soDoan; i++)
        {
            var a = dinh[i].Diem;
            var b = dinh[(i + 1) % dinh.Count].Diem;
            var bulge = dinh[i].Bulge;

            if (BulgeMath.LaThang(bulge) || BulgeMath.Cung(a, b, bulge) is not { } cung)
                GiaoDoanThang(dau, don, chieuDai, a, b, sinNguong, giao, ref songSong, tim, mmMoiDonVi);
            else
                GiaoCung(dau, don, chieuDai, a, b, bulge, cung, sinNguong, giao, ref songSong);
        }

        // Hai đoạn kề chung đỉnh nằm trên tuyến cắt sinh 2 giao điểm trùng — gộp lại.
        var gop = new List<(double T, Diem2 Diem)>();
        foreach (var g in giao.OrderBy(g => g.T))
        {
            if (gop.Count > 0 && Math.Abs(gop[^1].T - g.T) <= chieuDai * 1e-6) continue;
            gop.Add(g);
        }
        return (gop, songSong);
    }

    private static void GiaoDoanThang(
        Diem2 dau, Diem2 don, double chieuDai, Diem2 a, Diem2 b, double sinNguong,
        List<(double T, Diem2 Diem)> giao, ref bool songSong, TimMatCat tim, double mmMoiDonVi)
    {
        var r = b - a;
        var doDai = r.DoDai;
        if (doDai <= Eps) return;

        var cheo = Cheo(don, r) / doDai; // sin(góc giữa tuyến cắt và đoạn)
        if (Math.Abs(cheo) < sinNguong)
        {
            // Chỉ coi là "song song đáng cảnh báo" khi đoạn nằm SÁT tuyến cắt (cắt dọc thân
            // tuyến); tuyến song song ở xa thì im lặng — không làm nhiễu bảng cảnh báo.
            if (KhoangCachDoanDoan(dau, dau + don * chieuDai, a, b) <= NuaBeRong(tim, mmMoiDonVi))
                songSong = true;
            return;
        }

        var w = a - dau;
        var s = Cheo(w, r) / Cheo(don, r);
        var u = Cheo(w, don) / Cheo(don, r);
        if (s < -Eps || s > chieuDai + Eps) return;
        if (u < -Eps || u > 1 + Eps) return;
        giao.Add((s, dau + don * s));
    }

    private static void GiaoCung(
        Diem2 dau, Diem2 don, double chieuDai, Diem2 a, Diem2 b, double bulge,
        (Diem2 Tam, double BanKinh, bool NguocKim) cung, double sinNguong,
        List<(double T, Diem2 Diem)> giao, ref bool songSong)
    {
        var f = dau - cung.Tam;
        var doc = f.X * don.X + f.Y * don.Y;
        var delta = doc * doc - (f.X * f.X + f.Y * f.Y - cung.BanKinh * cung.BanKinh);
        if (delta < 0) return;

        var canDelta = Math.Sqrt(Math.Max(delta, 0));
        var gocDau = Math.Atan2(a.Y - cung.Tam.Y, a.X - cung.Tam.X);
        var gocMo = BulgeMath.GocMo(bulge);

        foreach (var s in new[] { -doc - canDelta, -doc + canDelta })
        {
            if (s < -Eps || s > chieuDai + Eps) continue;
            var diem = dau + don * s;

            // Điểm có nằm trong phần cung thật không (không phải phần còn lại của đường tròn).
            var gocDiem = Math.Atan2(diem.Y - cung.Tam.Y, diem.X - cung.Tam.X);
            var quet = gocMo > 0
                ? ChuanHoa0Den2Pi(gocDiem - gocDau)
                : ChuanHoa0Den2Pi(gocDau - gocDiem);
            if (quet > Math.Abs(gocMo) + 1e-9) continue;

            // Tiếp tuyến tại giao điểm: vuông góc bán kính, chiều theo chiều quét của cung.
            var bk = new Diem2((diem.X - cung.Tam.X) / cung.BanKinh, (diem.Y - cung.Tam.Y) / cung.BanKinh);
            var tiep = cung.NguocKim ? new Diem2(-bk.Y, bk.X) : new Diem2(bk.Y, -bk.X);
            if (Math.Abs(Cheo(don, tiep)) < sinNguong)
            {
                songSong = true; // tuyến cắt tiếp xúc/men theo cung — không cho kích thước thật
                continue;
            }
            giao.Add((s, diem));
        }
    }

    private static double NuaBeRong(TimMatCat tim, double mmMoiDonVi)
    {
        var kt = DrawSize.PhanTich(tim.Size);
        return kt is null ? 0 : kt.RongMm / mmMoiDonVi / 2;
    }

    private static double Cheo(Diem2 a, Diem2 b) => a.X * b.Y - a.Y * b.X;

    private static double ChuanHoa0Den2Pi(double goc)
    {
        var g = goc % (2 * Math.PI);
        if (g < 0) g += 2 * Math.PI;
        return g;
    }

    /// <summary>Khoảng cách nhỏ nhất giữa 2 đoạn thẳng (dùng cho cặp đoạn song song).</summary>
    private static double KhoangCachDoanDoan(Diem2 p1, Diem2 p2, Diem2 q1, Diem2 q2) =>
        Math.Min(
            Math.Min(KhoangCachDiemDoan(p1, q1, q2), KhoangCachDiemDoan(p2, q1, q2)),
            Math.Min(KhoangCachDiemDoan(q1, p1, p2), KhoangCachDiemDoan(q2, p1, p2)));

    private static double KhoangCachDiemDoan(Diem2 p, Diem2 a, Diem2 b)
    {
        var ab = b - a;
        var dai2 = ab.X * ab.X + ab.Y * ab.Y;
        if (dai2 <= Eps) return p.KhoangCach(a);
        var t = Math.Clamp(((p - a).X * ab.X + (p - a).Y * ab.Y) / dai2, 0, 1);
        return p.KhoangCach(a + ab * t);
    }
}
