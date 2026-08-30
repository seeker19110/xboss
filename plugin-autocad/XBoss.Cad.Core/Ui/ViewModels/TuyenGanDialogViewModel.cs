using System.Globalization;
using System.Windows.Input;
using XBoss.Cad.Core.Draw;
using XBoss.Cad.Core.Matching;
using XBoss.Cad.Core.RulePack;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một tuyến tim trong vùng chọn của <c>XBOSS_TUYEN_GAN</c>, ĐÃ ĐỌC SẴN ở transaction chỉ-đọc
/// (M115 §6 bước 2) — bản ghi THUẦN: Adapter đọc bản vẽ, hộp thoại chỉ hiển thị và lọc.
/// </summary>
/// <param name="Handle">Handle DWG — hiện trong danh sách và là khóa để zoom tới đối tượng.</param>
/// <param name="Layer">Layer HIỆN TẠI của tuyến — nguồn suy hệ qua <c>layerMap</c> (FR1).</param>
/// <param name="HeIdCu">Hệ đã gán trước đó (XData <c>XBOSS_VE</c>); null = chưa gán.</param>
/// <param name="SizeCu">Cỡ đã gán trước đó; null/rỗng = chưa gán.</param>
/// <param name="CaoDoMmCu">Cao độ tim (mm) đã gán trước đó; null = chưa gán.</param>
/// <param name="KieuNoiCu">Kiểu nối đã gán trước đó; null = chưa gán.</param>
public sealed record TuyenTrongVungChon(
    string Handle,
    string Layer,
    string? HeIdCu = null,
    string? SizeCu = null,
    double? CaoDoMmCu = null,
    string? KieuNoiCu = null)
{
    /// <summary>Thuộc tính BẮT BUỘC còn thiếu (hệ, cỡ, cao độ) — theo đúng bộ lỗi chặn của KiemTuyen.</summary>
    public IReadOnlyList<string> ThuocTinhThieu
    {
        get
        {
            var ra = new List<string>();
            if (string.IsNullOrWhiteSpace(HeIdCu)) ra.Add("hệ");
            if (string.IsNullOrWhiteSpace(SizeCu)) ra.Add("cỡ");
            if (CaoDoMmCu is null) ra.Add("cao độ");
            return ra;
        }
    }

    /// <summary>Tuyến này còn thiếu thuộc tính bắt buộc nào không.</summary>
    public bool ConThieu => ThuocTinhThieu.Count > 0;

    /// <summary>Một dòng tiếng Việt cho danh sách "còn thiếu" trong hộp thoại (FR1).</summary>
    public string Nhan =>
        $"handle {Handle} · layer {Layer} · thiếu: " +
        (ConThieu ? string.Join(", ", ThuocTinhThieu) : "không thiếu gì");
}

/// <summary>Một dòng trong danh sách tuyến còn thiếu thuộc tính — bấm để zoom tới đối tượng.</summary>
public sealed class MucTuyenThieu(TuyenTrongVungChon tuyen)
{
    /// <summary>Tuyến gốc — Adapter dùng lại chính đối tượng này để tra ObjectId mà zoom.</summary>
    public TuyenTrongVungChon Tuyen { get; } = tuyen;

    public string Nhan => Tuyen.Nhan;
}

/// <summary>Tham số một lần chạy <c>XBOSS_TUYEN_GAN</c> — áp cho TOÀN BỘ tuyến đang chọn.</summary>
/// <param name="CaoDoMm">Cao độ tim (mm) — cùng đơn vị với XData <c>caodomm</c>.</param>
/// <param name="VatLieu">Vật liệu tuyến, kỹ sư gõ tay (rule pack không khai danh mục); null = bỏ trống.</param>
/// <param name="CachNhiet">Cách nhiệt, kỹ sư gõ tay; null = bỏ trống.</param>
/// <param name="KieuNoi">Khóa của <c>jointRules.hardware</c>; null = tuyến không khai kiểu nối.</param>
public sealed record KetQuaTuyenGan(
    DrawSystem He,
    DrawLine Tuyen,
    string Size,
    bool SizeTuNhap,
    double CaoDoMm,
    string? VatLieu,
    string? CachNhiet,
    string? KieuNoi);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_TUYEN_GAN</c> (M115 §6 bước 2, FR1): gán thuộc tính tuyến tim cho
/// 1..n line/pline trong MỘT form — hệ, loại tuyến, cỡ, cao độ (mm), vật liệu/cách nhiệt, kiểu nối —
/// kèm danh sách CHỈ ĐỌC các tuyến còn thiếu thuộc tính bắt buộc (bấm dòng để zoom tới đối tượng).
///
/// THUẦN .NET, không chạm AutoCAD ⇒ test trên CI Linux (cùng ràng buộc M106 §4). Hành vi zoom do
/// Adapter gắn qua <see cref="ZoomToi"/>.
///
/// Hai điểm bám đúng đặc tả:
/// <list type="bullet">
/// <item>Layer của tuyến khớp <c>layerMap.groups[].matchAny</c> ⇒ hệ được ĐIỀN SẴN, kỹ sư vẫn sửa
/// lại được (FR1) — plugin gợi ý, không quyết thay người.</item>
/// <item>Danh mục kiểu nối lấy từ <c>jointRules.hardware</c> của ĐÚNG loại tuyến đang chọn (khóa
/// mà <c>TuyenDauVao.KieuNoi</c> mong đợi) — tuyến chưa khai jointRules thì không có gì để chọn,
/// nói rõ lý do chứ không bịa danh mục.</item>
/// </list>
///
/// Một bộ thuộc tính áp cho TOÀN BỘ vùng chọn (cùng quy ước <see cref="NhanTuyenDialogViewModel"/>):
/// không có ô nào cho từng tuyến riêng, nên cũng không có đường nào để hộp thoại ghi ra thứ khác
/// đường dòng lệnh.
/// </summary>
public sealed class TuyenGanDialogViewModel : DialogViewModelBase
{
    private readonly DrawToolsPack _pack;
    private readonly IReadOnlyList<TuyenTrongVungChon> _tuyen;
    private readonly IReadOnlyList<MucTuyenThieu> _thieu;
    private readonly string? _heSuyTuLayer;

    private DrawSystem? _he;
    private DrawLine? _loaiTuyen;
    private string _size = "";
    private string _caoDo = "";
    private string _vatLieu = "";
    private string _cachNhiet = "";
    private string _kieuNoi = "";

    /// <param name="pack">Rule pack v4+ đang nạp.</param>
    /// <param name="tuyen">Tuyến trong vùng chọn (Adapter đã lọc, đọc XData sẵn).</param>
    /// <param name="heId">Hệ của phiên; null = suy từ layer, không suy được thì hệ đầu danh mục.</param>
    /// <param name="itemId">Loại tuyến của phiên.</param>
    /// <param name="size">Cỡ lần trước (giữ nguyên kể cả ngoài danh mục).</param>
    /// <param name="caoDoMm">Cao độ lần trước (mm).</param>
    /// <param name="kieuNoi">Kiểu nối lần trước.</param>
    public TuyenGanDialogViewModel(
        DrawToolsPack pack,
        IReadOnlyList<TuyenTrongVungChon> tuyen,
        string? heId = null,
        string? itemId = null,
        string? size = null,
        double? caoDoMm = null,
        string? kieuNoi = null)
    {
        _pack = pack;
        _tuyen = tuyen;
        _thieu = tuyen.Where(t => t.ConThieu).Select(t => new MucTuyenThieu(t)).ToList();
        _heSuyTuLayer = SuyHeTuLayer(pack, tuyen);

        _he = CacHe.FirstOrDefault(s => string.Equals(s.Id, heId, StringComparison.Ordinal))
              ?? CacHe.FirstOrDefault(s => string.Equals(s.Id, _heSuyTuLayer, StringComparison.Ordinal))
              ?? CacHe.FirstOrDefault();
        _loaiTuyen = CacLoaiTuyen.FirstOrDefault(l => string.Equals(l.ItemId, itemId, StringComparison.Ordinal))
                     ?? CacLoaiTuyen.FirstOrDefault();
        _size = GiuHoacDau(CacSize, size);
        _caoDo = caoDoMm is { } cd ? So(cd) : "";
        _kieuNoi = GiuHoacDau(CacKieuNoi, kieuNoi);

        LenhZoom = new LenhUyNhiem(m =>
        {
            if (m is MucTuyenThieu muc) ZoomToi?.Invoke(muc);
        });
        KiemLai();
    }

    public override string TieuDe => "XBOSS_TUYEN_GAN — Gán thuộc tính tuyến tim";

    public override string MoTa =>
        "Khai hệ/cỡ/cao độ/kiểu nối cho các tuyến tim đang chọn. Hình học GIỮ NGUYÊN tuyệt đối — " +
        "lệnh chỉ ghi dữ liệu XBoss lên chính đối tượng kỹ sư đã vẽ (không đổi layer, không đổi tọa độ).";

    // ===== Hệ =====

    public IReadOnlyList<DrawSystem> CacHe => _pack.DrawTools.Systems;

    public DrawSystem? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            // Đổi hệ ⇒ loại tuyến/cỡ/kiểu nối cũ không còn ý nghĩa (đúng như VeContext.HoiHe).
            _loaiTuyen = CacLoaiTuyen.FirstOrDefault();
            _size = ChonMacDinh(CacSize, null);
            _kieuNoi = ChonMacDinh(CacKieuNoi, null);
            Bao(nameof(CacLoaiTuyen), nameof(Tuyen));
            TinhLai();
        }
    }

    /// <summary>Hệ suy được từ layer của vùng chọn (FR1); null = không layer nào khớp layerMap.</summary>
    public string? HeSuyTuLayer => _heSuyTuLayer;

    /// <summary>Câu giải thích việc điền sẵn hệ — nói rõ đây là GỢI Ý, kỹ sư sửa lại được.</summary>
    public string MoTaSuyHe =>
        _heSuyTuLayer is { Length: > 0 } he
            ? $"Layer của tuyến đang chọn khớp layerMap nhóm \"{he}\" — hệ đã được điền sẵn, đổi lại được."
            : "Không layer nào của vùng chọn khớp layerMap — chọn hệ bằng tay.";

    // ===== Loại tuyến =====

    public IReadOnlyList<DrawLine> CacLoaiTuyen => _he?.Lines ?? [];

    /// <summary>
    /// Loại tuyến quyết định <c>itemId</c> ghi vào XData (để <c>XBOSS_BOCKL</c> bóc đúng) và danh
    /// mục kiểu nối — nên vẫn phải chọn, dù bước 2 của đặc tả chỉ nêu "hệ".
    /// </summary>
    public DrawLine? Tuyen
    {
        get => _loaiTuyen;
        set
        {
            if (!Dat(ref _loaiTuyen, value)) return;
            _size = ChonMacDinh(CacSize, null);
            _kieuNoi = ChonMacDinh(CacKieuNoi, _kieuNoi);
            TinhLai();
        }
    }

    // ===== Cỡ =====

    public IReadOnlyList<string> CacSize => _loaiTuyen?.Sizes ?? [];

    public string Size
    {
        get => _size;
        set
        {
            if (!Dat(ref _size, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Cỡ ngoài danh mục rule pack ⇒ XData đánh dấu <c>custom</c> (M100 §4).</summary>
    public bool SizeTuNhap =>
        _size.Length > 0 && !CacSize.Any(s => string.Equals(s, _size, StringComparison.OrdinalIgnoreCase));

    // ===== Cao độ =====

    /// <summary>Cao độ tim (mm) — chuỗi vì ô nhập tay; đọc số qua <see cref="CaoDoMm"/>.</summary>
    public string CaoDo
    {
        get => _caoDo;
        set
        {
            if (!Dat(ref _caoDo, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Cao độ đã đọc được (mm); null = ô trống hoặc không phải số.</summary>
    public double? CaoDoMm =>
        double.TryParse(_caoDo, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;

    // ===== Vật liệu / cách nhiệt =====

    /// <summary>Vật liệu tuyến — rule pack không khai danh mục nên là ô gõ tay, được để trống.</summary>
    public string VatLieu
    {
        get => _vatLieu;
        set
        {
            if (!Dat(ref _vatLieu, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    /// <summary>Cách nhiệt — ô gõ tay, được để trống.</summary>
    public string CachNhiet
    {
        get => _cachNhiet;
        set
        {
            if (!Dat(ref _cachNhiet, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    // ===== Kiểu nối =====

    /// <summary>Danh mục kiểu nối của loại tuyến đang chọn = khóa <c>jointRules.hardware</c>.</summary>
    public IReadOnlyList<string> CacKieuNoi =>
        _loaiTuyen?.JointRules?.Hardware.Keys.OrderBy(k => k, StringComparer.Ordinal).ToList() ?? [];

    public string KieuNoi
    {
        get => _kieuNoi;
        set
        {
            if (!Dat(ref _kieuNoi, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    // ===== Phần chỉ đọc =====

    /// <summary>Số tuyến lệnh sẽ ghi thuộc tính.</summary>
    public int SoTuyen => _tuyen.Count;

    /// <summary>Tuyến còn thiếu thuộc tính bắt buộc — mỗi dòng bấm được để zoom (FR1).</summary>
    public IReadOnlyList<MucTuyenThieu> CacTuyenThieu => _thieu;

    /// <summary>Nút "Zoom tới" của từng dòng; hành vi thật do Adapter gắn qua <see cref="ZoomToi"/>.</summary>
    public ICommand LenhZoom { get; }

    /// <summary>Adapter gắn: đưa màn hình về tuyến của dòng đang xem.</summary>
    public Action<MucTuyenThieu>? ZoomToi { get; set; }

    public string TomTat =>
        _thieu.Count == 0
            ? $"{SoTuyen} tuyến đang chọn — không tuyến nào thiếu thuộc tính bắt buộc."
            : $"{_thieu.Count}/{SoTuyen} tuyến đang thiếu thuộc tính bắt buộc (hệ/cỡ/cao độ). " +
              "Bấm OK là gán cho TẤT CẢ tuyến đang chọn, kể cả tuyến đã có thuộc tính.";

    public string MoTaViecSeLam =>
        _loaiTuyen is not { } lt
            ? "Chưa chọn loại tuyến."
            : $"Ghi dữ liệu XBoss ({lt.Name} {_size}, cao độ {(_caoDo.Length > 0 ? _caoDo : "?")} mm" +
              $"{(KieuNoiKetQua is { } kn ? $", kiểu nối {kn}" : "")}) vào {SoTuyen} tuyến. " +
              "Layer, kiểu thực thể và từng tọa độ đỉnh giữ nguyên — lệnh này KHÔNG chuyển line thành " +
              "polyline và KHÔNG sinh nét biên.";

    /// <summary>Kiểu nối sẽ ghi; null khi loại tuyến không khai jointRules hoặc kỹ sư để trống.</summary>
    private string? KieuNoiKetQua => _kieuNoi.Length > 0 ? _kieuNoi : null;

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ (nút OK đang khóa).</summary>
    public KetQuaTuyenGan? KetQua() =>
        CoTheOk && _he is { } he && _loaiTuyen is { } lt && CaoDoMm is { } caoDo
            ? new KetQuaTuyenGan(
                he, lt, _size, SizeTuNhap, caoDo,
                _vatLieu.Length > 0 ? _vatLieu : null,
                _cachNhiet.Length > 0 ? _cachNhiet : null,
                KieuNoiKetQua)
            : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_tuyen.Count == 0)
        {
            loi.Add(
                "Không có tuyến nào trong vùng chọn — chọn line/polyline tuyến tim (không thuộc xref) " +
                "rồi chạy lại.");
            return loi;
        }
        if (CacHe.Count == 0)
        {
            loi.Add(
                $"Rule pack {_pack.RulePack.Version} không khai hệ nào để vẽ (drawTools.systems rỗng) — " +
                "nạp lại rule pack có khối drawTools.");
            return loi;
        }
        if (_he is null)
        {
            loi.Add("Chưa chọn hệ.");
            return loi;
        }
        if (CacLoaiTuyen.Count == 0)
        {
            loi.Add(
                $"Hệ {_he.Name} ({_he.Id}) không khai loại tuyến nào trong rule pack " +
                $"{_pack.RulePack.Version} — chọn hệ khác hoặc bổ sung drawTools.systems[].lines.");
            return loi;
        }
        if (_loaiTuyen is null) loi.Add("Chưa chọn loại tuyến.");
        if (_size.Length == 0)
            loi.Add("Chưa chọn cỡ tuyến — chọn trong danh mục hoặc gõ cỡ khác vào ô cỡ.");
        if (_caoDo.Length == 0)
        {
            loi.Add(
                "Chưa nhập cao độ tim (mm) — thiếu cao độ thì bước dựng đồ thị không phân biệt được " +
                "đoạn lên/xuống với chỗ rẽ nhánh.");
        }
        else if (CaoDoMm is null)
        {
            loi.Add($"Cao độ \"{_caoDo}\" không phải số (mm) — nhập số, dùng dấu chấm thập phân.");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (_loaiTuyen is { } lt && CacSize.Count == 0)
        {
            canhBao.Add(
                $"Loại tuyến {lt.Name} không khai cỡ nào trong rule pack — gõ cỡ tay, XData sẽ đánh " +
                "dấu \"custom\".");
        }
        else if (SizeTuNhap)
        {
            canhBao.Add($"Cỡ \"{_size}\" ngoài danh mục rule pack — vẫn gán, XData đánh dấu \"custom\".");
        }
        if (_loaiTuyen is { } lt2 && CacKieuNoi.Count == 0)
        {
            canhBao.Add(
                $"Loại tuyến {lt2.Name} chưa khai jointRules trong rule pack — không có danh mục kiểu " +
                "nối để chọn; bỏ trống thì bước chia đốt sau vẫn phải khai lại.");
        }
        var daCo = _tuyen.Count(t => !string.IsNullOrWhiteSpace(t.HeIdCu));
        if (daCo > 0)
        {
            canhBao.Add(
                $"{daCo} tuyến đã có thuộc tính XBoss — lệnh GHI ĐÈ bằng giá trị đang khai trong form " +
                "(nét biên/nhãn/liên kết cũ của chúng giữ nguyên).");
        }
        return canhBao;
    }

    /// <summary>
    /// Hệ suy từ layer của vùng chọn qua <c>layerMap.groups[].matchAny</c> (FR1): lấy nhóm khớp
    /// NHIỀU tuyến nhất và nhóm đó phải là một <c>drawTools.systems[].id</c>. Nhiều nhóm hòa nhau
    /// ⇒ không suy (trả null): thà để kỹ sư chọn còn hơn điền sẵn một hệ ngẫu nhiên.
    /// </summary>
    public static string? SuyHeTuLayer(DrawToolsPack pack, IReadOnlyList<TuyenTrongVungChon> tuyen)
    {
        var heHopLe = pack.DrawTools.Systems.Select(s => s.Id).ToHashSet(StringComparer.Ordinal);
        var dem = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var t in tuyen)
        {
            foreach (var g in NhomKhop(pack.RulePack.LayerMap.Groups, t.Layer, heHopLe))
                dem[g] = dem.TryGetValue(g, out var n) ? n + 1 : 1;
        }
        if (dem.Count == 0) return null;
        var xep = dem.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key, StringComparer.Ordinal).ToList();
        if (xep.Count > 1 && xep[0].Value == xep[1].Value) return null;
        return xep[0].Key;
    }

    private static IEnumerable<string> NhomKhop(
        IReadOnlyList<LayerGroup> groups, string layer, IReadOnlyCollection<string> heHopLe)
    {
        foreach (var g in groups)
        {
            if (!heHopLe.Contains(g.Id)) continue;
            if (TokenMatcher.MatchesAny(layer, g.MatchAny)) yield return g.Id;
        }
    }

    /// <summary>Báo lại mọi thứ suy ra từ lựa chọn rồi kiểm lại.</summary>
    private void TinhLai()
    {
        Bao(
            nameof(CacSize), nameof(Size), nameof(SizeTuNhap), nameof(CacKieuNoi), nameof(KieuNoi),
            nameof(CaoDo), nameof(CaoDoMm), nameof(MoTaViecSeLam));
        KiemLai();
    }

    /// <summary>Giá trị đầu danh mục (rỗng khi rule pack không khai gì).</summary>
    private static string ChonMacDinh(IReadOnlyList<string> danhMuc, string? cu)
    {
        var c = (cu ?? "").Trim();
        if (c.Length > 0 && danhMuc.Any(v => string.Equals(v, c, StringComparison.OrdinalIgnoreCase))) return c;
        return danhMuc.Count > 0 ? danhMuc[0] : "";
    }

    /// <summary>Giữ nguyên lựa chọn cũ (kể cả ngoài danh mục); chưa có gì thì lấy mục đầu danh mục.</summary>
    private static string GiuHoacDau(IReadOnlyList<string> danhMuc, string? cu)
    {
        var c = (cu ?? "").Trim();
        return c.Length > 0 ? c : (danhMuc.Count > 0 ? danhMuc[0] : "");
    }

    private static string So(double v) => v.ToString("0.######", CultureInfo.InvariantCulture);
}
