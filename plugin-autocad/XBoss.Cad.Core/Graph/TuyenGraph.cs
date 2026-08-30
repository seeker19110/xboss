using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Geometry;

namespace XBoss.Cad.Core.Graph;

/// <summary>
/// Một TUYẾN TIM kỹ sư đã vẽ (line/pline đã được Adapter duỗi thành chuỗi đỉnh) kèm thuộc tính gán
/// ở bước 2 của M115 §6. Core KHÔNG đọc XData: Adapter điền các trường này ở PR2, ở đây chỉ là DTO.
///
/// Toạ độ theo ĐƠN VỊ BẢN VẼ (quy ước M99 §6.7); riêng <paramref name="CaoDoMm"/> giữ mm như XData —
/// cùng cách <c>HanhLangDauVao</c> của M114 giữ bề rộng/cao độ ở mm.
/// </summary>
/// <param name="Id">Định danh tuyến do Adapter đặt (handle DWG) — hiện trong mọi thông báo lỗi.</param>
/// <param name="Dinh">Chuỗi đỉnh; dưới 2 đỉnh thì tuyến bị bỏ qua khi dựng đồ thị.</param>
/// <param name="HeId">Id hệ theo <c>drawTools.systems[].id</c>; null = chưa gán thuộc tính.</param>
/// <param name="Size">Cỡ nguyên văn (<c>300x200</c>/<c>DN50</c>); null/rỗng = chưa gán.</param>
/// <param name="CaoDoMm">Cao độ tim (mm); null = chưa gán.</param>
/// <param name="KieuNoi">Kiểu kết nối (khóa của <c>jointRules.hardware</c>); null = chưa gán.</param>
public sealed record TuyenDauVao(
    string Id,
    IReadOnlyList<Diem2> Dinh,
    string? HeId = null,
    string? Size = null,
    double? CaoDoMm = null,
    string? KieuNoi = null);

/// <summary>
/// Một block thiết bị đã đặt sẵn trên bản vẽ (M115 §6 bước 3 — đầu tuyến snap vào thiết bị).
/// </summary>
/// <param name="Id">Định danh block do Adapter đặt (handle DWG).</param>
/// <param name="Tam">Tâm block, ĐƠN VỊ BẢN VẼ.</param>
/// <param name="Kind">
/// <c>kind</c> trong manifest thư viện block (M108/M113) — <c>equipment</c>, <c>fitting</c>…
/// </param>
/// <param name="HeId">Hệ sở hữu block; null = block chưa khai hệ (cảnh báo, không phải lỗi chặn).</param>
/// <param name="Tag">Tag thiết bị, chỉ để hiện trong danh sách duyệt/lỗi.</param>
public sealed record ThietBiDatSan(
    string Id,
    Diem2 Tam,
    string Kind,
    string? HeId = null,
    string? Tag = null);

/// <summary>
/// Tham số dựng đồ thị, đọc ra từ <c>drawTools.completionPolicy</c>. Hai ngưỡng khoảng cách theo
/// ĐƠN VỊ BẢN VẼ (caller quy đổi từ mm — quy ước M99 §6.7), dung sai cao độ giữ mm vì cao độ trong
/// XData vốn là mm.
/// </summary>
public sealed record ThamSoDoThi(
    double DungSaiNut,
    double BanKinhChamThietBi,
    double DungSaiCaoDoMm,
    double GocDoiHuongToiThieuDeg)
{
    /// <summary>
    /// Đọc từ rule pack. <paramref name="donViTrenMm"/> = số đơn vị bản vẽ ứng với 1 mm (bản vẽ đơn
    /// vị mm thì bằng 1, bản vẽ đơn vị mét thì bằng 0,001 — Adapter tính từ INSUNITS).
    /// </summary>
    public static ThamSoDoThi Tu(CompletionPolicySection cp, double donViTrenMm = 1) => new(
        cp.NodeToleranceMm * donViTrenMm,
        cp.EquipmentSnapMm * donViTrenMm,
        cp.ElevationToleranceMm,
        cp.MinTurnAngleDeg);
}

/// <summary>Một nút của đồ thị tuyến — điểm đã gộp mọi đầu/giao/chạm trong dung sai.</summary>
public sealed record NutTuyen(int ChiSo, Diem2 ViTri);

/// <summary>
/// Một cạnh = mẩu tuyến giữa 2 nút liền kề, mang nguyên thuộc tính của tuyến gốc.
/// Sau khi định chiều, <paramref name="Tu"/> → <paramref name="Den"/> là CHIỀU DÒNG tính từ nguồn.
/// </summary>
public sealed record CanhTuyen(
    int ChiSo,
    int Tu,
    int Den,
    string TuyenId,
    double ChieuDai,
    string? HeId,
    string? Size,
    double? CaoDoMm,
    string? KieuNoi);

/// <summary>Một đầu tuyến bắt vào block thiết bị (M115 §6 bước 3).</summary>
/// <param name="KhopHe">Hệ của block trùng hệ của tuyến tại nút — sai là lỗi CHẶN (KiemTuyen).</param>
public sealed record KetNoiThietBi(
    int Nut,
    string ThietBiId,
    string? HeId,
    string? Tag,
    double KhoangCach,
    bool KhopHe);

/// <summary>
/// Đồ thị tuyến–thiết bị dựng từ line/pline tim kỹ sư vẽ (M115 §7 FR2) — THUẦN, không biết gì về
/// AutoCAD, test trên CI Linux.
///
/// Cách dựng (mọi bước đều tất định, không có lựa chọn ngẫu nhiên):
/// <list type="number">
/// <item>Cắt mỗi đoạn của mỗi tuyến tại: 2 đầu mút, giao điểm với đoạn của tuyến KHÁC, và hình
/// chiếu của mọi ĐỈNH tuyến khác nằm trong <see cref="ThamSoDoThi.DungSaiNut"/> — bước cuối là
/// thứ bắt được nhánh kỹ sư vẽ chạm hụt vài mm vào tuyến chính (giao điểm hình học không có).</item>
/// <item>Mỗi mẩu giữa 2 điểm cắt liền nhau thành một cạnh; hai đầu mẩu tra về nút qua
/// <see cref="NutTai"/> — hai điểm trong dung sai gộp thành MỘT nút, nên mẩu quá ngắn tự triệt
/// tiêu mà KHÔNG làm đứt liên thông.</item>
/// <item>Định chiều dòng bằng BFS từ nút gần <c>diemNguon</c> nhất; cạnh nào BFS không với tới
/// được thì giữ nguyên chiều vẽ và vào <see cref="CanhChuaDinhChieu"/> (KiemTuyen cảnh báo).</item>
/// <item>Mỗi block thiết bị bắt vào nút gần nhất trong <see cref="ThamSoDoThi.BanKinhChamThietBi"/>;
/// không có nút nào trong bán kính thì block đó KHÔNG có kết nối (đầu tuyến tương ứng sẽ bị
/// KiemTuyen báo tuyến hở) — plugin không nối đại.</item>
/// </list>
///
/// KHÔNG tái dùng <c>Routing/HanhLangGraph</c>: nó dựng đồ thị để plugin TỰ CHỌN đường đi, còn ở
/// đây đường đi là do kỹ sư vẽ và tuyệt đối không được đụng tới (guardrail M115 §2a). Chỉ dùng
/// chung hình học <see cref="Segment2D"/>.
/// </summary>
public sealed class TuyenGraph
{
    private readonly List<NutTuyen> _nut = [];
    private readonly List<CanhTuyen> _canh = [];
    private readonly List<List<int>> _canhCuaNut = [];
    private readonly List<KetNoiThietBi> _thietBi = [];
    private readonly List<int> _chuaDinhChieu = [];
    private double _dungSaiNut = 1e-9;

    private TuyenGraph() { }

    public IReadOnlyList<NutTuyen> Nut => _nut;
    public IReadOnlyList<CanhTuyen> Canh => _canh;
    public IReadOnlyList<KetNoiThietBi> ThietBi => _thietBi;

    /// <summary>Cạnh BFS không với tới được từ nguồn — chiều dòng của chúng chưa xác định.</summary>
    public IReadOnlyList<int> CanhChuaDinhChieu => _chuaDinhChieu;

    /// <summary>Nút gần điểm nguồn nhất; -1 khi đồ thị rỗng.</summary>
    public int NutNguon { get; private set; } = -1;

    /// <summary>Tuyến đầu vào (kể cả tuyến bị bỏ vì dưới 2 đỉnh) — KiemTuyen soi thuộc tính từ đây.</summary>
    public IReadOnlyList<TuyenDauVao> TuyenGoc { get; private set; } = [];

    public ThamSoDoThi ThamSo { get; private set; } = new(1e-9, 1e-9, 0, 5);

    /// <summary>Chỉ số các cạnh nối vào một nút.</summary>
    public IReadOnlyList<int> CanhTaiNut(int nut) =>
        nut >= 0 && nut < _canhCuaNut.Count ? _canhCuaNut[nut] : [];

    /// <summary>Số nhánh nối vào một nút.</summary>
    public int Bac(int nut) => CanhTaiNut(nut).Count;

    /// <summary>Đầu kia của cạnh khi đi từ <paramref name="tu"/>.</summary>
    public int DauKia(int canh, int tu) => _canh[canh].Tu == tu ? _canh[canh].Den : _canh[canh].Tu;

    /// <summary>Hướng ĐI RA khỏi <paramref name="nut"/> của một cạnh (vector chưa chuẩn hóa).</summary>
    public Diem2 HuongRaKhoiNut(int canh, int nut)
    {
        var c = _canh[canh];
        var kia = c.Tu == nut ? c.Den : c.Tu;
        return _nut[kia].ViTri - _nut[nut].ViTri;
    }

    /// <summary>Kết nối thiết bị tại một nút; null = nút không bắt vào thiết bị nào.</summary>
    public KetNoiThietBi? ThietBiTaiNut(int nut) => _thietBi.FirstOrDefault(t => t.Nut == nut);

    /// <summary>Chỉ số nút tại một tọa độ; thêm nút mới nếu chưa có nút nào trong dung sai.</summary>
    public int NutTai(Diem2 diem)
    {
        for (var i = 0; i < _nut.Count; i++)
        {
            if (_nut[i].ViTri.KhoangCach(diem) <= _dungSaiNut) return i;
        }
        _nut.Add(new NutTuyen(_nut.Count, diem));
        _canhCuaNut.Add([]);
        return _nut.Count - 1;
    }

    /// <summary>Dựng đồ thị (M115 §6 bước 3).</summary>
    /// <param name="tuyen">Tuyến tim kỹ sư đã vẽ.</param>
    /// <param name="thietBi">Block thiết bị đã đặt trên bản vẽ.</param>
    /// <param name="diemNguon">Điểm nguồn kỹ sư bấm — gốc của chiều dòng.</param>
    /// <param name="thamSo">Dung sai/ngưỡng đọc từ <c>completionPolicy</c>.</param>
    public static TuyenGraph Dung(
        IReadOnlyList<TuyenDauVao> tuyen,
        IReadOnlyList<ThietBiDatSan> thietBi,
        Diem2 diemNguon,
        ThamSoDoThi thamSo)
    {
        var g = new TuyenGraph
        {
            _dungSaiNut = Math.Max(thamSo.DungSaiNut, 1e-9),
            TuyenGoc = tuyen,
            ThamSo = thamSo,
        };
        var duocDung = tuyen.Where(t => t.Dinh.Count >= 2).ToList();

        // (1) Điểm cắt trên từng đoạn: 2 đầu mút.
        var diemCat = new Dictionary<(int Tuyen, int Doan), List<double>>();
        for (var i = 0; i < duocDung.Count; i++)
        {
            for (var d = 0; d + 1 < duocDung[i].Dinh.Count; d++) diemCat[(i, d)] = [0, 1];
        }

        // (2) Giao điểm hình học giữa đoạn của 2 tuyến khác nhau.
        for (var i = 0; i < duocDung.Count; i++)
        {
            for (var j = i + 1; j < duocDung.Count; j++)
            {
                for (var di = 0; di + 1 < duocDung[i].Dinh.Count; di++)
                {
                    for (var dj = 0; dj + 1 < duocDung[j].Dinh.Count; dj++)
                    {
                        var (a1, a2) = DoanCua(duocDung[i], di);
                        var (b1, b2) = DoanCua(duocDung[j], dj);
                        if (Segment2D.GiaoDiem(a1, a2, b1, b2) is not { } giao) continue;
                        diemCat[(i, di)].Add(Segment2D.ChieuLenDoan(giao, a1, a2).T);
                        diemCat[(j, dj)].Add(Segment2D.ChieuLenDoan(giao, b1, b2).T);
                    }
                }
            }
        }

        // (3) Chạm: đỉnh của tuyến này nằm sát (≤ dung sai) một đoạn của tuyến khác. Đây là ca
        // "nhánh kỹ sư vẽ chạm hụt vài mm vào tuyến chính" — không có giao điểm hình học nào.
        for (var i = 0; i < duocDung.Count; i++)
        {
            foreach (var dinh in duocDung[i].Dinh)
            {
                for (var j = 0; j < duocDung.Count; j++)
                {
                    if (j == i) continue;
                    for (var dj = 0; dj + 1 < duocDung[j].Dinh.Count; dj++)
                    {
                        var (b1, b2) = DoanCua(duocDung[j], dj);
                        var (t, chieu) = Segment2D.ChieuLenDoan((dinh.X, dinh.Y), b1, b2);
                        if (Segment2D.ChieuDai(chieu, (dinh.X, dinh.Y)) > g._dungSaiNut) continue;
                        diemCat[(j, dj)].Add(t);
                    }
                }
            }
        }

        // (4) Chia đoạn tại các điểm cắt → cạnh.
        for (var i = 0; i < duocDung.Count; i++)
        {
            var t = duocDung[i];
            for (var d = 0; d + 1 < t.Dinh.Count; d++)
            {
                var moc = diemCat[(i, d)].Distinct().OrderBy(v => v).ToList();
                for (var k = 0; k + 1 < moc.Count; k++)
                {
                    var p0 = NoiSuy(t.Dinh[d], t.Dinh[d + 1], moc[k]);
                    var p1 = NoiSuy(t.Dinh[d], t.Dinh[d + 1], moc[k + 1]);
                    var tu = g.NutTai(p0);
                    var den = g.NutTai(p1);
                    if (tu == den) continue; // hai mốc rơi vào cùng một nút — liên thông vẫn giữ
                    var canh = new CanhTuyen(
                        g._canh.Count, tu, den, t.Id, g._nut[tu].ViTri.KhoangCach(g._nut[den].ViTri),
                        t.HeId, t.Size, t.CaoDoMm, t.KieuNoi);
                    g._canh.Add(canh);
                    g._canhCuaNut[tu].Add(canh.ChiSo);
                    g._canhCuaNut[den].Add(canh.ChiSo);
                }
            }
        }

        g.DinhChieuTuNguon(diemNguon);
        g.BatThietBi(thietBi);
        return g;
    }

    /// <summary>BFS từ nút gần điểm nguồn nhất, lật cạnh về đúng chiều dòng.</summary>
    private void DinhChieuTuNguon(Diem2 diemNguon)
    {
        if (_nut.Count == 0) return;
        NutNguon = _nut.OrderBy(n => n.ViTri.KhoangCach(diemNguon)).First().ChiSo;

        var daTham = new bool[_canh.Count];
        var hangDoi = new Queue<int>();
        var daVaoHang = new bool[_nut.Count];
        hangDoi.Enqueue(NutNguon);
        daVaoHang[NutNguon] = true;

        while (hangDoi.Count > 0)
        {
            var u = hangDoi.Dequeue();
            foreach (var e in _canhCuaNut[u])
            {
                if (daTham[e]) continue;
                daTham[e] = true;
                var c = _canh[e];
                if (c.Tu != u) _canh[e] = c with { Tu = c.Den, Den = c.Tu };
                var kia = _canh[e].Den;
                if (daVaoHang[kia]) continue;
                daVaoHang[kia] = true;
                hangDoi.Enqueue(kia);
            }
        }

        for (var e = 0; e < _canh.Count; e++)
        {
            if (!daTham[e]) _chuaDinhChieu.Add(e);
        }
    }

    /// <summary>Bắt mỗi block thiết bị vào nút gần nhất trong bán kính chạm.</summary>
    private void BatThietBi(IReadOnlyList<ThietBiDatSan> thietBi)
    {
        foreach (var tb in thietBi)
        {
            var gan = _nut
                .Select(n => (n.ChiSo, KhoangCach: n.ViTri.KhoangCach(tb.Tam)))
                .Where(x => x.KhoangCach <= ThamSo.BanKinhChamThietBi)
                .OrderBy(x => x.KhoangCach)
                .ThenBy(x => x.ChiSo)
                .ToList();
            if (gan.Count == 0) continue;

            var nut = gan[0].ChiSo;
            var heTaiNut = CanhTaiNut(nut)
                .Select(e => _canh[e].HeId)
                .Where(h => !string.IsNullOrWhiteSpace(h))
                .ToList();
            var khopHe = tb.HeId is { Length: > 0 } he &&
                         heTaiNut.Any(h => string.Equals(h, he, StringComparison.Ordinal));
            _thietBi.Add(new KetNoiThietBi(nut, tb.Id, tb.HeId, tb.Tag, gan[0].KhoangCach, khopHe));
        }
    }

    private static ((double X, double Y) A, (double X, double Y) B) DoanCua(TuyenDauVao t, int doan) =>
        ((t.Dinh[doan].X, t.Dinh[doan].Y), (t.Dinh[doan + 1].X, t.Dinh[doan + 1].Y));

    private static Diem2 NoiSuy(Diem2 a, Diem2 b, double t) =>
        new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t);
}
