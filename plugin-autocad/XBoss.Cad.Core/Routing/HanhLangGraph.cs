using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Zoning;

namespace XBoss.Cad.Core.Routing;

/// <summary>
/// Một đoạn hành lang đầu vào (M114 FR2/FR3) — polyline tim ĐÃ được Adapter duỗi thành chuỗi đỉnh.
/// Số đo theo ĐƠN VỊ BẢN VẼ (quy ước M99 §6.7); riêng bề rộng/cao độ giữ mm như XData hành lang.
/// </summary>
/// <param name="HeChoPhep">Id hệ được phép đi qua; rỗng = mọi hệ (mặc định FR2).</param>
public sealed record HanhLangDauVao(
    string Id,
    IReadOnlyList<Diem2> Dinh,
    double BeRongMm = 0,
    double CotDayDamMm = 0,
    double CotTranMm = 0,
    IReadOnlyList<string>? HeChoPhep = null)
{
    /// <summary>Hành lang này có cho hệ <paramref name="heId"/> đi qua không (FR2).</summary>
    public bool ChoPhep(string heId) =>
        HeChoPhep is not { Count: > 0 } cho ||
        cho.Any(h => string.Equals(h, heId, StringComparison.Ordinal));
}

/// <summary>Một thiết bị đích cần nối về nguồn (M114 FR5) — <paramref name="CaoDoMm"/> dùng cho chế độ tự chảy.</summary>
public sealed record ThietBiDauVao(string Ten, Diem2 ViTri, double CaoDoMm = 0);

/// <summary>Nút đồ thị: đỉnh hành lang, giao điểm giữa 2 hành lang, hoặc điểm rẽ của một thiết bị.</summary>
public sealed record NutDoThi(int ChiSo, Diem2 ViTri);

/// <summary>Cạnh đồ thị = một mẩu hành lang giữa 2 nút liền kề; trọng số = chiều dài (FR6).</summary>
public sealed record CanhDoThi(int ChiSo, int Tu, int Den, double ChieuDai, string HanhLangId);

/// <summary>Điểm rẽ của một thiết bị: hình chiếu vuông góc lên hành lang gần nhất trong bán kính.</summary>
public sealed record DiemRe(string ThietBi, int Nut, string HanhLangId, double KhoangCach);

/// <summary>Một thiết bị không giải được, kèm lý do đếm được (guardrail 3 — không vẽ đại).</summary>
public sealed record KhongGiaiDuoc(string ThietBi, string LyDo, double? SoLieu = null);

/// <summary>
/// Đồ thị hành lang của MỘT hệ (M114 FR6) — THUẦN, không biết gì về AutoCAD, test trên CI Linux.
///
/// Cách dựng: cắt mỗi hành lang tại (a) đỉnh của chính nó, (b) giao điểm với hành lang khác,
/// (c) hình chiếu vuông góc của từng thiết bị (chỉ khi khoảng cách ≤ <c>snapRadius</c>). Mỗi mẩu
/// giữa 2 điểm cắt liền nhau thành một cạnh, trọng số = chiều dài. Cạnh có phần nằm trong VÙNG CẤM
/// bị loại khỏi đồ thị (FR7) — dùng lại <see cref="VungClipper"/> của M101 PR3.
///
/// Thiết bị không có hành lang nào trong bán kính KHÔNG bị vẽ đại một tuyến: nó vào
/// <see cref="KhongGiai"/> kèm khoảng cách thật tới hành lang gần nhất (AC4).
/// </summary>
public sealed class HanhLangGraph
{
    /// <summary>Hai điểm cách nhau dưới ngưỡng này coi là MỘT nút (đơn vị bản vẽ).</summary>
    public const double DungSaiNut = 1e-6;

    private readonly List<NutDoThi> _nut = [];
    private readonly List<CanhDoThi> _canh = [];
    private readonly List<List<int>> _canhCuaNut = [];
    private readonly List<DiemRe> _diemRe = [];
    private readonly List<KhongGiaiDuoc> _khongGiai = [];

    private HanhLangGraph() { }

    public IReadOnlyList<NutDoThi> Nut => _nut;
    public IReadOnlyList<CanhDoThi> Canh => _canh;
    /// <summary>Điểm rẽ theo thứ tự thiết bị đầu vào (thiết bị không giải được thì không có mục).</summary>
    public IReadOnlyList<DiemRe> DiemRe => _diemRe;
    public IReadOnlyList<KhongGiaiDuoc> KhongGiai => _khongGiai;

    /// <summary>Chỉ số các cạnh nối vào một nút.</summary>
    public IReadOnlyList<int> CanhTaiNut(int nut) =>
        nut >= 0 && nut < _canhCuaNut.Count ? _canhCuaNut[nut] : [];

    /// <summary>Đầu kia của cạnh khi đi từ <paramref name="tu"/>.</summary>
    public int DauKia(int canh, int tu) => _canh[canh].Tu == tu ? _canh[canh].Den : _canh[canh].Tu;

    /// <summary>Chỉ số nút tại một tọa độ; thêm nút mới nếu chưa có.</summary>
    public int NutTai(Diem2 diem)
    {
        for (var i = 0; i < _nut.Count; i++)
        {
            if (_nut[i].ViTri.KhoangCach(diem) <= DungSaiNut) return i;
        }
        _nut.Add(new NutDoThi(_nut.Count, diem));
        _canhCuaNut.Add([]);
        return _nut.Count - 1;
    }

    /// <summary>
    /// Dựng đồ thị cho hệ <paramref name="heId"/> (FR6).
    /// </summary>
    /// <param name="hanhLang">Các đoạn hành lang trong bản vẽ (hành lang không cho hệ này đi qua bị bỏ).</param>
    /// <param name="thietBi">Thiết bị đích của hệ.</param>
    /// <param name="snapRadius">Bán kính rẽ nhánh, ĐƠN VỊ BẢN VẼ (đổi từ <c>routingPolicy.snapRadiusMm</c>).</param>
    /// <param name="vungCam">Vùng cấm (M101 PR3) — cạnh chạm vào bị loại.</param>
    public static HanhLangGraph Dung(
        IReadOnlyList<HanhLangDauVao> hanhLang,
        IReadOnlyList<ThietBiDauVao> thietBi,
        double snapRadius,
        string heId = "",
        IReadOnlyList<RanhGioiVung>? vungCam = null)
    {
        var g = new HanhLangGraph();
        var duocDi = hanhLang.Where(h => h.Dinh.Count >= 2 && h.ChoPhep(heId)).ToList();

        // (1) Điểm cắt trên từng đoạn thẳng của từng hành lang: 2 đầu mút + giao với hành lang khác.
        var diemCat = new Dictionary<(int HanhLang, int Doan), List<double>>();
        for (var i = 0; i < duocDi.Count; i++)
        {
            for (var d = 0; d + 1 < duocDi[i].Dinh.Count; d++) diemCat[(i, d)] = [0, 1];
        }

        for (var i = 0; i < duocDi.Count; i++)
        {
            for (var j = i + 1; j < duocDi.Count; j++)
            {
                for (var di = 0; di + 1 < duocDi[i].Dinh.Count; di++)
                {
                    for (var dj = 0; dj + 1 < duocDi[j].Dinh.Count; dj++)
                    {
                        var giao = GiaoDoan(
                            duocDi[i].Dinh[di], duocDi[i].Dinh[di + 1],
                            duocDi[j].Dinh[dj], duocDi[j].Dinh[dj + 1]);
                        if (giao is not { } t) continue;
                        diemCat[(i, di)].Add(t.TrenA);
                        diemCat[(j, dj)].Add(t.TrenB);
                    }
                }
            }
        }

        // (2) Điểm rẽ của thiết bị — hình chiếu vuông góc lên hành lang GẦN NHẤT trong bán kính.
        var reTheoThietBi = new List<(ThietBiDauVao Tb, int HanhLang, int Doan, double T, Diem2 Diem, double KhoangCach)>();
        foreach (var tb in thietBi)
        {
            (int HanhLang, int Doan, double T, Diem2 Diem, double KhoangCach)? tot = null;
            foreach (var (h, i) in duocDi.Select((h, i) => (h, i)))
            {
                for (var d = 0; d + 1 < h.Dinh.Count; d++)
                {
                    var (t, diem) = ChieuLenDoan(tb.ViTri, h.Dinh[d], h.Dinh[d + 1]);
                    var kc = diem.KhoangCach(tb.ViTri);
                    if (tot is null || kc < tot.Value.KhoangCach) tot = (i, d, t, diem, kc);
                }
            }

            if (tot is not { } r)
            {
                g._khongGiai.Add(new KhongGiaiDuoc(
                    tb.Ten, "Bản vẽ không có hành lang nào cho hệ này đi qua."));
                continue;
            }
            if (r.KhoangCach > snapRadius)
            {
                g._khongGiai.Add(new KhongGiaiDuoc(
                    tb.Ten,
                    $"Cách hành lang gần nhất {r.KhoangCach:0.###} (đơn vị bản vẽ) — quá bán kính rẽ nhánh {snapRadius:0.###}.",
                    r.KhoangCach));
                continue;
            }
            diemCat[(r.HanhLang, r.Doan)].Add(r.T);
            reTheoThietBi.Add((tb, r.HanhLang, r.Doan, r.T, r.Diem, r.KhoangCach));
        }

        // (3) Chia từng đoạn tại các điểm cắt → cạnh; cạnh đụng vùng cấm bị loại (FR7).
        for (var i = 0; i < duocDi.Count; i++)
        {
            var h = duocDi[i];
            for (var d = 0; d + 1 < h.Dinh.Count; d++)
            {
                var moc = diemCat[(i, d)].Distinct().OrderBy(t => t).ToList();
                for (var k = 0; k + 1 < moc.Count; k++)
                {
                    var p0 = NoiSuy(h.Dinh[d], h.Dinh[d + 1], moc[k]);
                    var p1 = NoiSuy(h.Dinh[d], h.Dinh[d + 1], moc[k + 1]);
                    var dai = p0.KhoangCach(p1);
                    if (dai <= DungSaiNut) continue;
                    if (QuaVungCam(p0, p1, vungCam)) continue;
                    var tu = g.NutTai(p0);
                    var den = g.NutTai(p1);
                    if (tu == den) continue;
                    var canh = new CanhDoThi(g._canh.Count, tu, den, dai, h.Id);
                    g._canh.Add(canh);
                    g._canhCuaNut[tu].Add(canh.ChiSo);
                    g._canhCuaNut[den].Add(canh.ChiSo);
                }
            }
        }

        // (4) Ghi nút điểm rẽ — sau bước (3) nên nút đã có sẵn, chỉ tra lại chỉ số.
        foreach (var r in reTheoThietBi)
        {
            var nut = g.NutTai(r.Diem);
            if (g.CanhTaiNut(nut).Count == 0)
            {
                g._khongGiai.Add(new KhongGiaiDuoc(
                    r.Tb.Ten,
                    $"Điểm rẽ trên hành lang \"{duocDi[r.HanhLang].Id}\" bị cô lập — đoạn hành lang tại đó nằm trong vùng cấm.",
                    r.KhoangCach));
                continue;
            }
            g._diemRe.Add(new DiemRe(r.Tb.Ten, nut, duocDi[r.HanhLang].Id, r.KhoangCach));
        }
        return g;
    }

    /// <summary>Đoạn có phần nào nằm trong vùng cấm không (kiểm cả 2 đầu + trung điểm và giao biên).</summary>
    private static bool QuaVungCam(Diem2 p0, Diem2 p1, IReadOnlyList<RanhGioiVung>? vungCam)
    {
        if (vungCam is not { Count: > 0 }) return false;
        var phan = VungClipper.Cat([new DoanTuyen(p0, p1)], vungCam);
        return phan.Any(p => p.Vung != VungClipper.NgoaiVung && p.ChieuDai > DungSaiNut);
    }

    private static Diem2 NoiSuy(Diem2 a, Diem2 b, double t) =>
        new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);

    /// <summary>Hình chiếu vuông góc của điểm lên đoạn (kẹp trong [0;1]) — trả tham số + tọa độ.</summary>
    public static (double T, Diem2 Diem) ChieuLenDoan(Diem2 diem, Diem2 a, Diem2 b)
    {
        var vx = b.X - a.X;
        var vy = b.Y - a.Y;
        var mau = vx * vx + vy * vy;
        if (mau <= 0) return (0, a);
        var t = ((diem.X - a.X) * vx + (diem.Y - a.Y) * vy) / mau;
        t = Math.Clamp(t, 0, 1);
        return (t, NoiSuy(a, b, t));
    }

    /// <summary>Giao 2 đoạn thẳng; trả tham số trên mỗi đoạn. null = song song/không cắt.</summary>
    private static (double TrenA, double TrenB)? GiaoDoan(Diem2 a1, Diem2 a2, Diem2 b1, Diem2 b2)
    {
        var rX = a2.X - a1.X;
        var rY = a2.Y - a1.Y;
        var sX = b2.X - b1.X;
        var sY = b2.Y - b1.Y;
        var mau = rX * sY - rY * sX;
        if (Math.Abs(mau) < 1e-12) return null;
        var qpX = b1.X - a1.X;
        var qpY = b1.Y - a1.Y;
        var t = (qpX * sY - qpY * sX) / mau;
        var u = (qpX * rY - qpY * rX) / mau;
        if (t is < 0 or > 1 || u is < 0 or > 1) return null;
        return (t, u);
    }
}
