using System.ComponentModel;
using System.Globalization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một dòng nhập trong danh sách của hộp thoại (cao độ từng tuyến, thuộc tính khung tên…):
/// nhãn CHỈ ĐỌC + ô giá trị sửa được. Tự báo cho ViewModel cha mỗi lần đổi để nút OK và các con số
/// suy ra cập nhật ngay.
/// </summary>
public sealed class DongNhapDialog : INotifyPropertyChanged
{
    private readonly Action _khiDoi;
    private string _giaTri;

    public DongNhapDialog(string khoa, string nhan, string giaTri, Action khiDoi)
    {
        Khoa = khoa;
        Nhan = nhan;
        _giaTri = giaTri;
        _khiDoi = khiDoi;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>Khóa máy đọc (thẻ attribute, handle tuyến…) — không hiện lên màn hình.</summary>
    public string Khoa { get; }

    /// <summary>Nhãn tiếng Việt hiện trước ô nhập.</summary>
    public string Nhan { get; }

    public string GiaTri
    {
        get => _giaTri;
        set
        {
            var v = value ?? "";
            if (string.Equals(_giaTri, v, StringComparison.Ordinal)) return;
            _giaTri = v;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(GiaTri)));
            _khiDoi();
        }
    }
}

// ===================================================================================
// XBOSS_VE_THONGKE
// ===================================================================================

/// <summary>Ba loại bảng thống kê — đúng 3 keyword của đường dòng lệnh.</summary>
public enum LoaiBangThongKeUi
{
    /// <summary>Bảng thiết bị (từ attribute TAG/MODEL/SIZE).</summary>
    ThietBi,

    /// <summary>Bảng khối lượng theo hệ (từ trạng thái bóc của XBOSS_BOCKL).</summary>
    KhoiLuong,

    /// <summary>Bảng đốt theo kiểu nối (từ dấu chia đốt của XBOSS_VE_CHIADOT).</summary>
    ChiaDot,
}

/// <summary>Tham số <c>XBOSS_VE_THONGKE</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaThongKe(LoaiBangThongKeUi Loai, double TiLeIn);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_THONGKE</c> (M106 §7.2): loại bảng + tỉ lệ in (để quy đổi chiều
/// cao chữ trong bảng).
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "vị trí đặt". Vị trí là ĐIỂM BẤM trên bản vẽ —
/// hỏi bằng toạ độ gõ tay thì không ai dùng; và khi bảng cũ đã có, lệnh cập nhật TẠI CHỖ nên không
/// hỏi vị trí nữa. Phần đó nằm ở dòng CHỈ ĐỌC (FR6).
/// </summary>
public sealed class ThongKeDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<double> _scales;
    private readonly bool _coBangCu;
    private string _tiLe;
    private LoaiBangThongKeUi _loai = LoaiBangThongKeUi.ThietBi;

    /// <param name="coBangCu">Bản vẽ đã có bảng cùng loại do plugin sinh chưa (chỉ để hiện).</param>
    public ThongKeDialogViewModel(IReadOnlyList<double> scales, double? tiLeCuaPhien, bool coBangCu = false)
    {
        _scales = scales;
        _coBangCu = coBangCu;
        _tiLe = TiLeInDialog.MacDinh(scales, tiLeCuaPhien);
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_THONGKE — Bảng thống kê trong bản vẽ";

    public override string MoTa => "Chọn nguồn dữ liệu của bảng và tỉ lệ in (để quy đổi chiều cao chữ).";

    public LoaiBangThongKeUi Loai
    {
        get => _loai;
        set
        {
            if (!Dat(ref _loai, value)) return;
            Bao(nameof(LaThietBi), nameof(LaKhoiLuong), nameof(LaChiaDot), nameof(MoTaNguon));
            KiemLai();
        }
    }

    public bool LaThietBi
    {
        get => _loai == LoaiBangThongKeUi.ThietBi;
        set { if (value) Loai = LoaiBangThongKeUi.ThietBi; }
    }

    public bool LaKhoiLuong
    {
        get => _loai == LoaiBangThongKeUi.KhoiLuong;
        set { if (value) Loai = LoaiBangThongKeUi.KhoiLuong; }
    }

    public bool LaChiaDot
    {
        get => _loai == LoaiBangThongKeUi.ChiaDot;
        set { if (value) Loai = LoaiBangThongKeUi.ChiaDot; }
    }

    public IReadOnlyList<string> CacTiLe => TiLeInDialog.DanhMuc(_scales);

    public string TiLe
    {
        get => _tiLe;
        set
        {
            if (!Dat(ref _tiLe, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    /// <summary>Nguồn dữ liệu + nơi đặt bảng — CHỈ ĐỌC (FR6).</summary>
    public string MoTaNguon =>
        (_loai switch
        {
            LoaiBangThongKeUi.KhoiLuong => "Đọc trạng thái bóc của XBOSS_BOCKL (chỉ ĐỌC, không đánh dấu thêm).",
            LoaiBangThongKeUi.ChiaDot => "Đọc dấu chia đốt trên XData tim của XBOSS_VE_CHIADOT (không tính lại).",
            _ => "Đọc attribute TAG/MODEL/SIZE của các khối thiết bị trong bản vẽ.",
        }) +
        (_coBangCu
            ? " Bảng cùng loại đã có sẵn — lệnh sẽ CẬP NHẬT tại chỗ, không hỏi vị trí, không sinh bảng đôi."
            : " Sau khi bấm OK: bấm điểm đặt bảng (góc trên-trái).");

    public KetQuaThongKe? KetQua() =>
        CoTheOk && TiLeInDialog.PhanTich(_tiLe) is { } tl ? new KetQuaThongKe(_loai, tl) : null;

    protected override IReadOnlyList<string> Kiem() =>
        TiLeInDialog.LyDo(_tiLe) is { } l ? [l] : [];

    protected override IReadOnlyList<string> KiemCanhBao() =>
        TiLeInDialog.CanhBao(_scales, _tiLe) is { } c ? [c] : [];
}

// ===================================================================================
// XBOSS_VE_MATCAT
// ===================================================================================

/// <summary>Một tuyến bị tuyến cắt đi qua, theo đúng thứ tự trái → phải của hình cắt.</summary>
public sealed record TuyenCatQua(string Handle, string ItemId, string Size);

/// <summary>Tham số <c>XBOSS_VE_MATCAT</c>: tỉ lệ in + cao độ tim từng tuyến (mm), cùng thứ tự.</summary>
public sealed record KetQuaHoiMatCat(double TiLeIn, IReadOnlyList<double> CaoDoMm);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_MATCAT</c> (M106 §7.2): tỉ lệ in + cao độ tim TỪNG tuyến trong
/// một form, thay chuỗi câu hỏi "cao độ tim &lt;tuyến&gt;" lặp lại n lần trên dòng lệnh.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "cao độ trần/sàn, tên mặt cắt". Lệnh THẬT hỏi
/// cao độ của TỪNG TUYẾN (không phải cao độ trần/sàn) và TỰ ĐÁNH tên mặt cắt theo
/// <c>sectionNamePattern</c>, bỏ qua tên đã dùng — cho gõ tên tay là mở đường đặt trùng tên mặt
/// cắt. Tên hiện dạng CHỈ ĐỌC (FR6).
///
/// Ranh giới cứng của M100 §18 giữ nguyên: bản vẽ 2D không chứa cao độ thật nên cao độ LUÔN do kỹ
/// sư nhập, hộp thoại không suy đoán — chỉ mồi sẵn giá trị lần trước / danh mục
/// <c>defaultElevations</c> đúng như dòng lệnh.
/// </summary>
public sealed class MatCatDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<double> _scales;
    private readonly IReadOnlyList<TuyenCatQua> _tuyen;
    private readonly string _tenMatCat;
    private string _tiLe;

    /// <param name="tuyen">Các tuyến tuyến cắt đi qua (Core <c>SectionBuilder</c> đã dựng).</param>
    /// <param name="tenMatCat">Tên mặt cắt plugin tự đánh (chỉ hiển thị).</param>
    /// <param name="caoDoMacDinh">Cao độ mồi sẵn (mm): lần trước trong phiên, hoặc defaultElevations[0].</param>
    public MatCatDialogViewModel(
        IReadOnlyList<double> scales,
        double? tiLeCuaPhien,
        IReadOnlyList<TuyenCatQua> tuyen,
        string tenMatCat,
        double? caoDoMacDinh)
    {
        _scales = scales;
        _tuyen = tuyen;
        _tenMatCat = tenMatCat;
        _tiLe = TiLeInDialog.MacDinh(scales, tiLeCuaPhien);

        var mac = caoDoMacDinh is { } c ? So(c) : "";
        CacCaoDo = tuyen
            .Select(t => new DongNhapDialog(t.Handle, $"{t.ItemId} {t.Size} (handle {t.Handle})", mac, KiemLai))
            .ToList();
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_MATCAT — Dựng mặt cắt";

    public override string MoTa =>
        $"Tuyến cắt đi qua {_tuyen.Count} tuyến. Nhập cao độ TIM từng tuyến (mm so với điểm đặt hình cắt).";

    public IReadOnlyList<string> CacTiLe => TiLeInDialog.DanhMuc(_scales);

    public string TiLe
    {
        get => _tiLe;
        set
        {
            if (!Dat(ref _tiLe, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    /// <summary>Một dòng cao độ cho mỗi tuyến, đúng thứ tự trái → phải của hình cắt.</summary>
    public IReadOnlyList<DongNhapDialog> CacCaoDo { get; }

    /// <summary>Tên mặt cắt + ranh giới cứng về cao độ — CHỈ ĐỌC (FR6).</summary>
    public string MoTaTenMatCat =>
        $"Tên mặt cắt: {_tenMatCat} (plugin tự đánh theo rule pack, bỏ qua tên đã dùng). Bản vẽ 2D không " +
        "chứa cao độ thật — cao độ là giá trị NHẬP TAY, kiểm tra lại tại hiện trường.";

    public KetQuaHoiMatCat? KetQua()
    {
        if (!CoTheOk || TiLeInDialog.PhanTich(_tiLe) is not { } tl) return null;
        var cao = new List<double>(CacCaoDo.Count);
        foreach (var d in CacCaoDo)
        {
            if (DocSo(d.GiaTri) is not { } v) return null;
            cao.Add(v);
        }
        return new KetQuaHoiMatCat(tl, cao);
    }

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_tuyen.Count == 0)
        {
            loi.Add("Tuyến cắt không cắt qua tuyến nào do XBOSS_VE vẽ — chưa dựng được mặt cắt.");
            return loi;
        }
        if (TiLeInDialog.LyDo(_tiLe) is { } l) loi.Add(l);
        var xau = CacCaoDo.Where(d => DocSo(d.GiaTri) is null).ToList();
        if (xau.Count > 0)
        {
            loi.Add(
                $"Cao độ chưa hợp lệ ở {xau.Count} tuyến ({xau[0].Nhan}) — nhập số mm, vd 2700 hoặc -150.");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao() =>
        TiLeInDialog.CanhBao(_scales, _tiLe) is { } c ? [c] : [];

    private static double? DocSo(string? s) =>
        double.TryParse((s ?? "").Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}

// ===================================================================================
// XBOSS_VE_TRANGIN
// ===================================================================================

/// <summary>Phạm vi VP-freeze của trang in — đúng 3 keyword của đường dòng lệnh.</summary>
public enum CheDoAnLayerTrangIn
{
    /// <summary>Chỉ ẩn layer tuyến của các hệ MEP khác (nền kiến trúc vẫn thấy) — mặc định.</summary>
    HeKhac,

    /// <summary>Ẩn mọi layer không thuộc hệ đang in.</summary>
    NgoaiHe,

    /// <summary>Không ẩn gì.</summary>
    Khong,
}

/// <summary>
/// Khung tên ứng với một khổ giấy: Adapter tra manifest thư viện SẴN cho mọi khổ trước khi mở hộp
/// thoại, để đổi khổ giấy trong hộp thoại là danh sách thẻ attribute đổi theo mà không phải chạm
/// tệp thư viện từ trong UI (guardrail M106 §2).
/// </summary>
public sealed record KhungTenTheoKho(string Kho, string? TenBlock, IReadOnlyList<string> The, string? Loi);

/// <summary>Tham số <c>XBOSS_VE_TRANGIN</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaTrangIn(
    DrawSystem He,
    string KhoGiay,
    double TiLeIn,
    CheDoAnLayerTrangIn CheDoAn,
    string? Ctb,
    IReadOnlyDictionary<string, string> ThuocTinhKhungTen);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_TRANGIN</c> (M106 §7.2): hệ → khổ giấy → tỉ lệ → phạm vi ẩn
/// layer → bảng nét in CTB → thông tin khung tên, gộp 6 chặng hỏi đáp vào một form.
///
/// Vùng in vẫn BẤM trên bản vẽ sau khi đóng hộp thoại (2 góc hoặc chọn polyline ranh giới) — đó là
/// thao tác chọn hình học, không phải tham số gõ được.
/// </summary>
public sealed class TrangInDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<DrawSystem> _cacHe;
    private readonly IReadOnlyList<string> _khoGiay;
    private readonly IReadOnlyList<double> _scales;
    private readonly IReadOnlyList<KhungTenTheoKho> _khungTen;
    private readonly IReadOnlyDictionary<string, string> _thuocTinhDaNho;

    /// <summary>Mục "giữ CTB mặc định của layout" — cùng nhãn với danh mục dòng lệnh.</summary>
    public const string GiuCtbMacDinh = "(giữ mặc định)";

    private DrawSystem? _he;
    private string _kho;
    private string _tiLe;
    private CheDoAnLayerTrangIn _cheDoAn = CheDoAnLayerTrangIn.HeKhac;
    private string _ctb;
    private IReadOnlyList<DongNhapDialog> _cacThe = [];

    /// <param name="khungTen">Khung tên tra sẵn theo từng khổ giấy.</param>
    /// <param name="danhSachCtb">CTB có trên máy (đã có mục "(giữ mặc định)" ở đầu do ViewModel thêm).</param>
    /// <param name="ctbDaNho">CTB chọn lần trước (trang-in.json).</param>
    /// <param name="thuocTinhDaNho">Giá trị attribute khung tên nhập lần trước.</param>
    public TrangInDialogViewModel(
        IReadOnlyList<DrawSystem> cacHe,
        IReadOnlyList<string> khoGiay,
        IReadOnlyList<double> scales,
        IReadOnlyList<KhungTenTheoKho> khungTen,
        IReadOnlyList<string> danhSachCtb,
        double? tiLeCuaPhien,
        string? khoDaNho = null,
        string? ctbDaNho = null,
        IReadOnlyDictionary<string, string>? thuocTinhDaNho = null,
        string? heId = null)
    {
        _cacHe = cacHe;
        _khoGiay = khoGiay;
        _scales = scales;
        _khungTen = khungTen;
        _thuocTinhDaNho = thuocTinhDaNho ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        CacCtb = [GiuCtbMacDinh, .. danhSachCtb];
        _he = cacHe.FirstOrDefault(s => string.Equals(s.Id, heId, StringComparison.Ordinal)) ?? cacHe.FirstOrDefault();
        _kho = khoDaNho is { Length: > 0 } k && khoGiay.Contains(k, StringComparer.OrdinalIgnoreCase)
            ? k
            : khoGiay.FirstOrDefault() ?? "";
        _tiLe = TiLeInDialog.MacDinh(scales, tiLeCuaPhien);
        _ctb = ctbDaNho is { Length: > 0 } c && danhSachCtb.Contains(c, StringComparer.OrdinalIgnoreCase)
            ? c
            : danhSachCtb.FirstOrDefault(s => s.Contains("xboss", StringComparison.OrdinalIgnoreCase)) ?? GiuCtbMacDinh;

        DungCacThe();
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_TRANGIN — Dựng trang in";

    public override string MoTa =>
        "Điền thông tin trang in rồi bấm OK; sau đó khoanh vùng mặt bằng cần in trên bản vẽ.";

    // ===== Hệ =====

    public IReadOnlyList<DrawSystem> CacHe => _cacHe;

    public DrawSystem? He
    {
        get => _he;
        set
        {
            if (!Dat(ref _he, value)) return;
            Bao(nameof(MoTaAnLayer));
            KiemLai();
        }
    }

    // ===== Khổ giấy =====

    public IReadOnlyList<string> CacKhoGiay => _khoGiay;

    public string KhoGiay
    {
        get => _kho;
        set
        {
            if (!Dat(ref _kho, (value ?? "").Trim())) return;
            DungCacThe();
            Bao(nameof(CacThe), nameof(MoTaKhungTen));
            KiemLai();
        }
    }

    // ===== Tỉ lệ =====

    public IReadOnlyList<string> CacTiLe => TiLeInDialog.DanhMuc(_scales);

    public string TiLe
    {
        get => _tiLe;
        set
        {
            if (!Dat(ref _tiLe, (value ?? "").Trim())) return;
            Bao(nameof(MoTaTiLe));
            KiemLai();
        }
    }

    /// <summary>Tỉ lệ dùng chung cả phiên — CHỈ ĐỌC (FR6).</summary>
    public string MoTaTiLe =>
        TiLeInDialog.PhanTich(_tiLe) is { } tl
            ? $"Viewport sẽ KHÓA ở tỉ lệ 1:{TiLeInDialog.So(tl)} — cùng giá trị với chiều cao chữ nhãn " +
              "(XBOSS_VE_NHAN) và mặt cắt, nên mặt bằng và trang in không lệch nhau."
            : "Nhập tỉ lệ in để khóa viewport đúng tỉ lệ.";

    // ===== Ẩn layer theo viewport =====

    public CheDoAnLayerTrangIn CheDoAn
    {
        get => _cheDoAn;
        set
        {
            if (!Dat(ref _cheDoAn, value)) return;
            Bao(nameof(AnHeKhac), nameof(AnNgoaiHe), nameof(KhongAn), nameof(MoTaAnLayer));
            KiemLai();
        }
    }

    public bool AnHeKhac
    {
        get => _cheDoAn == CheDoAnLayerTrangIn.HeKhac;
        set { if (value) CheDoAn = CheDoAnLayerTrangIn.HeKhac; }
    }

    public bool AnNgoaiHe
    {
        get => _cheDoAn == CheDoAnLayerTrangIn.NgoaiHe;
        set { if (value) CheDoAn = CheDoAnLayerTrangIn.NgoaiHe; }
    }

    public bool KhongAn
    {
        get => _cheDoAn == CheDoAnLayerTrangIn.Khong;
        set { if (value) CheDoAn = CheDoAnLayerTrangIn.Khong; }
    }

    public string MoTaAnLayer => _cheDoAn switch
    {
        CheDoAnLayerTrangIn.NgoaiHe =>
            $"Ẩn mọi layer không thuộc hệ {_he?.Id} (chỉ còn hệ này + layer chú thích).",
        CheDoAnLayerTrangIn.Khong => "Không ẩn layer nào — trang in thấy đúng như model space.",
        _ => "Chỉ ẩn tuyến của các hệ MEP khác, giữ nền kiến trúc/trục. VP freeze KHÔNG đổi trạng thái " +
             "layer toàn cục.",
    };

    // ===== CTB =====

    public IReadOnlyList<string> CacCtb { get; }

    public string Ctb
    {
        get => _ctb;
        set
        {
            if (!Dat(ref _ctb, value ?? GiuCtbMacDinh)) return;
            KiemLai();
        }
    }

    // ===== Khung tên =====

    /// <summary>Thẻ attribute của khung tên ứng với khổ giấy đang chọn.</summary>
    public IReadOnlyList<DongNhapDialog> CacThe => _cacThe;

    public string MoTaKhungTen
    {
        get
        {
            var kt = KhungTenCua(_kho);
            if (kt is null)
                return $"Chưa tra được khung tên cho khổ {_kho} — vẫn tạo layout + viewport, chèn khung tên sau.";
            if (kt.Loi is { Length: > 0 } loi)
                return $"{loi} — vẫn tạo layout + viewport, chèn khung tên sau.";
            return $"Khung tên: {kt.TenBlock}. Thẻ TI_LE và NGAY do plugin tự điền, không hỏi.";
        }
    }

    public KetQuaTrangIn? KetQua()
    {
        if (!CoTheOk || _he is not { } he || TiLeInDialog.PhanTich(_tiLe) is not { } tl) return null;
        var the = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var d in _cacThe) the[d.Khoa] = d.GiaTri.Trim();
        return new KetQuaTrangIn(
            he,
            _kho,
            tl,
            _cheDoAn,
            string.Equals(_ctb, GiuCtbMacDinh, StringComparison.Ordinal) ? null : _ctb,
            the);
    }

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_khoGiay.Count == 0 || _scales.Count == 0)
        {
            loi.Add(
                "Rule pack chưa khai sheetSetup.paperSizes/scales — không dựng được trang in. " +
                "Phát hành rule pack mới rồi chạy XBOSS_LOGIN/XBOSS_RULEPACK.");
            return loi;
        }
        if (_cacHe.Count == 0)
        {
            loi.Add("Rule pack không khai hệ nào (drawTools.systems rỗng).");
            return loi;
        }
        if (_he is null) loi.Add("Chưa chọn hệ cần in.");
        if (_kho.Length == 0) loi.Add("Chưa chọn khổ giấy.");
        if (TiLeInDialog.LyDo(_tiLe) is { } l) loi.Add(l);
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (TiLeInDialog.CanhBao(_scales, _tiLe) is { } c) canhBao.Add(c);
        var kt = KhungTenCua(_kho);
        if (kt is null || kt.Loi is { Length: > 0 })
        {
            canhBao.Add(
                kt?.Loi ?? $"Chưa có khung tên cho khổ {_kho} trong thư viện block — layout vẫn tạo, chèn khung tên sau.");
        }
        return canhBao;
    }

    private KhungTenTheoKho? KhungTenCua(string kho) =>
        _khungTen.FirstOrDefault(k => string.Equals(k.Kho, kho, StringComparison.OrdinalIgnoreCase));

    /// <summary>Dựng lại danh sách ô nhập khung tên theo khổ giấy đang chọn, giữ giá trị đã gõ.</summary>
    private void DungCacThe()
    {
        var cu = _cacThe.ToDictionary(d => d.Khoa, d => d.GiaTri, StringComparer.OrdinalIgnoreCase);
        var kt = KhungTenCua(_kho);
        _cacThe = (kt?.The ?? [])
            .Select(t => new DongNhapDialog(
                t,
                t,
                cu.TryGetValue(t, out var v) ? v : _thuocTinhDaNho.GetValueOrDefault(t, ""),
                KiemLai))
            .ToList();
    }
}
