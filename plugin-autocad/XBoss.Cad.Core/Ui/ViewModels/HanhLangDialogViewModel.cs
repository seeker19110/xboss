using System.ComponentModel;
using System.Globalization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Bốn chế độ của <c>XBOSS_VE_HANHLANG</c> (M114 FR1/FR4) — đúng 4 keyword của dòng lệnh.</summary>
public enum CheDoHanhLang
{
    /// <summary>Vẽ mới polyline tim hành lang (FR1).</summary>
    VeMoi,

    /// <summary>Nhận polyline CÓ SẴN thành hành lang — chỉ gán XData + đổi layer (FR1, khuôn M107).</summary>
    Nhan,

    /// <summary>Sửa bề rộng/cao độ/hệ được phép của hành lang đã có (FR4).</summary>
    Sua,

    /// <summary>Xóa hành lang (FR4) — còn hệ đang đi qua thì hỏi lại kèm tên hệ.</summary>
    Xoa,
}

/// <summary>Vì sao một đối tượng trong vùng chọn KHÔNG nhận được thành hành lang (M114 FR1).</summary>
public enum LyDoBoQuaHanhLang
{
    /// <summary>Không phải <c>Polyline</c>/<c>Line</c> — arc, spline, text, block…</summary>
    KhongPhaiPolyline,

    /// <summary>Polyline có đoạn CUNG: đồ thị hành lang chỉ làm việc trên đoạn thẳng.</summary>
    CoDoanCung,

    /// <summary>Thuộc xref — plugin không đụng bản vẽ tham chiếu.</summary>
    ThuocXref,

    /// <summary>Là tuyến/nét biên/nhãn do XBoss sinh — không biến tuyến thành hành lang.</summary>
    DoiTuongXBoss,

    /// <summary>Không phải hành lang XBoss (chế độ Sửa/Xóa chỉ làm việc trên hành lang đã nhận).</summary>
    KhongPhaiHanhLang,
}

/// <summary>
/// Vùng chọn của <c>XBOSS_VE_HANHLANG</c> sau khi lọc — bản ghi THUẦN: Adapter đọc bản vẽ rồi đếm,
/// hộp thoại lẫn tóm tắt cuối lệnh dùng chung đúng bộ số này nên hai đường (hộp thoại / dòng lệnh)
/// không bao giờ báo lệch nhau (cùng khuôn <see cref="TomTatChonNhanTuyen"/> của M107).
/// </summary>
/// <param name="SoNhanMoi">Polyline/line chưa phải hành lang — sẽ nhận mới.</param>
/// <param name="SoDaLaHanhLang">Đã là hành lang XBoss — nhận lại/sửa thì ghi đè thuộc tính.</param>
public sealed record TomTatChonHanhLang(
    int SoNhanMoi = 0,
    int SoDaLaHanhLang = 0,
    int SoKhongPhaiPolyline = 0,
    int SoCoDoanCung = 0,
    int SoThuocXref = 0,
    int SoDoiTuongXBoss = 0,
    int SoKhongPhaiHanhLang = 0)
{
    /// <summary>Tổng số đối tượng lệnh sẽ xử lý trong lần chạy này.</summary>
    public int TongXuLy => SoNhanMoi + SoDaLaHanhLang;

    /// <summary>Tổng số đối tượng bị bỏ qua kèm lý do.</summary>
    public int TongBoQua =>
        SoKhongPhaiPolyline + SoCoDoanCung + SoThuocXref + SoDoiTuongXBoss + SoKhongPhaiHanhLang;

    /// <summary>Nhãn tiếng Việt của một lý do bỏ qua (dùng chung cho hộp thoại và dòng lệnh).</summary>
    public static string Nhan(LyDoBoQuaHanhLang lyDo) => lyDo switch
    {
        LyDoBoQuaHanhLang.KhongPhaiPolyline =>
            "không phải polyline/line (arc, spline, text, block… — hành lang phải là chuỗi đoạn thẳng)",
        LyDoBoQuaHanhLang.CoDoanCung =>
            "polyline có đoạn CUNG (đồ thị hành lang chỉ làm việc trên đoạn thẳng — chia lại bằng đoạn thẳng rồi nhận)",
        LyDoBoQuaHanhLang.ThuocXref =>
            "thuộc xref (plugin không sửa bản vẽ tham chiếu — bind/detach xref rồi chạy lại nếu cần)",
        LyDoBoQuaHanhLang.DoiTuongXBoss =>
            "là tuyến/nét biên/nhãn do XBoss sinh (tuyến không phải hành lang — vẽ hành lang riêng)",
        LyDoBoQuaHanhLang.KhongPhaiHanhLang =>
            "không phải hành lang XBoss (chế độ Sửa/Xóa chỉ làm việc trên hành lang đã nhận)",
        _ => lyDo.ToString(),
    };

    /// <summary>Mỗi lý do bỏ qua một dòng "n đối tượng: lý do" (bỏ dòng có số 0).</summary>
    public IReadOnlyList<string> DongBoQua
    {
        get
        {
            var ra = new List<string>();
            void Them(int so, LyDoBoQuaHanhLang lyDo)
            {
                if (so > 0) ra.Add($"{so} đối tượng: {Nhan(lyDo)}.");
            }
            Them(SoKhongPhaiPolyline, LyDoBoQuaHanhLang.KhongPhaiPolyline);
            Them(SoCoDoanCung, LyDoBoQuaHanhLang.CoDoanCung);
            Them(SoThuocXref, LyDoBoQuaHanhLang.ThuocXref);
            Them(SoDoiTuongXBoss, LyDoBoQuaHanhLang.DoiTuongXBoss);
            Them(SoKhongPhaiHanhLang, LyDoBoQuaHanhLang.KhongPhaiHanhLang);
            return ra;
        }
    }

    /// <summary>Một dòng mô tả những gì sẽ xử lý (chỉ đọc).</summary>
    public string MoTaSeXuLy
    {
        get
        {
            if (TongXuLy == 0) return "Không có đối tượng nào dùng được trong vùng chọn.";
            var phan = new List<string>();
            if (SoNhanMoi > 0) phan.Add($"{SoNhanMoi} polyline nhận mới (tọa độ đỉnh giữ nguyên)");
            if (SoDaLaHanhLang > 0) phan.Add($"{SoDaLaHanhLang} hành lang đã có (ghi đè thuộc tính)");
            return $"{TongXuLy} đối tượng: {string.Join(", ", phan)}.";
        }
    }
}

/// <summary>
/// Một hệ trong danh sách "hệ được phép đi qua" của hộp thoại (M114 FR2) — có ô tick riêng nên
/// phải tự phát <see cref="INotifyPropertyChanged"/> như <c>DongGiaoNgatNet</c> của M109.
/// </summary>
public sealed class DongHeChoPhep : INotifyPropertyChanged
{
    private readonly Action _khiDoi;
    private bool _chon;

    public DongHeChoPhep(string id, string nhan, bool chon, Action khiDoi)
    {
        Id = id;
        Nhan = nhan;
        _chon = chon;
        _khiDoi = khiDoi;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>Id hệ theo <c>drawTools.systems[].id</c>.</summary>
    public string Id { get; }

    /// <summary>Nhãn hiện cạnh ô tick.</summary>
    public string Nhan { get; }

    public bool Chon
    {
        get => _chon;
        set
        {
            if (_chon == value) return;
            _chon = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Chon)));
            _khiDoi();
        }
    }
}

/// <summary>Thuộc tính hành lang thu được từ hộp thoại/dòng lệnh (M114 FR2).</summary>
/// <param name="HeChoPhep">Id hệ được phép đi qua; RỖNG = mọi hệ (mặc định FR2/FR3).</param>
public sealed record KetQuaHanhLang(
    double BeRongMm,
    double CotDayDamMm,
    double CotTranMm,
    IReadOnlyList<string> HeChoPhep);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_HANHLANG</c> (M114 FR2, khung M106): bề rộng khả dụng, cao độ
/// đáy dầm, cao độ trần và danh sách hệ được phép đi qua trong MỘT form, kèm phần CHỈ ĐỌC nói rõ
/// lệnh sắp làm gì với vùng chọn.
///
/// Thuần .NET, không chạm AutoCAD ⇒ test trên CI Linux. Giữ đúng ba luật của các hộp thoại vẽ
/// khác: danh mục đúng rule pack, số suy ra chỉ hiển thị, rule pack khai thiếu thì cho LÝ DO rõ.
///
/// Ranh giới cứng M100 §6.3 (<b>hỏi, không suy</b>): cao độ đáy dầm/trần LUÔN do kỹ sư nhập — bản
/// vẽ 2D không chứa cao độ thật, hộp thoại chỉ mồi sẵn giá trị lần trước trong phiên.
/// </summary>
public sealed class HanhLangDialogViewModel : DialogViewModelBase
{
    private readonly CheDoHanhLang _cheDo;
    private readonly TomTatChonHanhLang _tomTat;
    private readonly RoutingPolicySection _chinhSach;
    private readonly IReadOnlyList<LanChiem> _lanDaCap;

    private string _beRong;
    private string _cotDayDam;
    private string _cotTran;

    /// <param name="cheDo">Chế độ đang chạy (quyết định câu dẫn + phần kiểm).</param>
    /// <param name="tomTat">Vùng chọn đã lọc (Adapter đếm trước khi mở hộp thoại).</param>
    /// <param name="chinhSach">Khối <c>drawTools.routingPolicy</c> đang phát hành.</param>
    /// <param name="cacHe">Danh mục hệ của rule pack.</param>
    /// <param name="beRongMm">Bề rộng mồi sẵn: hành lang đang sửa, hoặc lần trước trong phiên.</param>
    /// <param name="cotDayDamMm">Cao độ đáy dầm mồi sẵn.</param>
    /// <param name="cotTranMm">Cao độ trần mồi sẵn.</param>
    /// <param name="heChoPhep">Hệ được phép mồi sẵn; rỗng = mọi hệ.</param>
    /// <param name="lanDaCap">Sổ chiếm chỗ của hành lang đang sửa (FR3) — chỉ hiển thị/cảnh báo.</param>
    public HanhLangDialogViewModel(
        CheDoHanhLang cheDo,
        TomTatChonHanhLang tomTat,
        RoutingPolicySection chinhSach,
        IReadOnlyList<DrawSystem> cacHe,
        double? beRongMm = null,
        double? cotDayDamMm = null,
        double? cotTranMm = null,
        IReadOnlyList<string>? heChoPhep = null,
        IReadOnlyList<LanChiem>? lanDaCap = null)
    {
        _cheDo = cheDo;
        _tomTat = tomTat;
        _chinhSach = chinhSach;
        _lanDaCap = lanDaCap ?? [];

        _beRong = beRongMm is { } br ? So(br) : "";
        _cotDayDam = cotDayDamMm is { } cdd ? So(cdd) : "";
        _cotTran = cotTranMm is { } ct ? So(ct) : "";

        // Rỗng = mọi hệ (FR2) ⇒ mặc định tick hết, kỹ sư bỏ tick hệ nào thì hành lang cấm hệ đó.
        var cho = heChoPhep ?? [];
        CacHe = cacHe
            .Select(h => new DongHeChoPhep(
                h.Id,
                $"{h.Id} — {h.Name}",
                cho.Count == 0 || cho.Any(c => string.Equals(c, h.Id, StringComparison.Ordinal)),
                TinhLai))
            .ToList();
        KiemLai();
    }

    public override string TieuDe => _cheDo switch
    {
        CheDoHanhLang.VeMoi => "XBOSS_VE_HANHLANG — Vẽ hành lang mới",
        CheDoHanhLang.Nhan => "XBOSS_VE_HANHLANG — Nhận hành lang có sẵn",
        _ => "XBOSS_VE_HANHLANG — Sửa hành lang",
    };

    public override string MoTa => _cheDo switch
    {
        CheDoHanhLang.VeMoi =>
            "Khai thuộc tính hành lang rồi bấm điểm tim hành lang trên bản vẽ (sau khi bấm OK).",
        CheDoHanhLang.Nhan =>
            "Khai thuộc tính cho các polyline đang chọn. Hình học GIỮ NGUYÊN — lệnh chỉ đổi layer và " +
            "ghi dữ liệu hành lang.",
        _ =>
            "Sửa thuộc tính các hành lang đang chọn. Sổ chiếm làn của hệ đã đi qua được GIỮ NGUYÊN.",
    };

    // ===== Thuộc tính hành lang (FR2) =====

    /// <summary>Bề rộng khả dụng của hành lang (mm) — ô nhập, phải là số dương.</summary>
    public string BeRong
    {
        get => _beRong;
        set
        {
            if (!Dat(ref _beRong, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Cao độ đáy dầm (mm) — HỎI, không suy (M100 §6.3).</summary>
    public string CotDayDam
    {
        get => _cotDayDam;
        set
        {
            if (!Dat(ref _cotDayDam, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Cao độ trần (mm) — HỎI, không suy.</summary>
    public string CotTran
    {
        get => _cotTran;
        set
        {
            if (!Dat(ref _cotTran, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Danh sách hệ kèm ô tick "được phép đi qua" (FR2).</summary>
    public IReadOnlyList<DongHeChoPhep> CacHe { get; }

    // ===== Phần chỉ đọc =====

    /// <summary>Vùng chọn đã lọc — chỉ đọc.</summary>
    public TomTatChonHanhLang TomTat => _tomTat;

    /// <summary>Dòng "sẽ xử lý bao nhiêu đối tượng, loại nào".</summary>
    public string MoTaSeXuLy => _cheDo == CheDoHanhLang.VeMoi
        ? "Vẽ 1 hành lang mới — bấm điểm sau khi đóng hộp thoại."
        : _tomTat.MoTaSeXuLy;

    /// <summary>Các đối tượng bị bỏ qua, mỗi lý do một dòng.</summary>
    public IReadOnlyList<string> DongBoQua => _tomTat.DongBoQua;

    /// <summary>Layer đích của hành lang (<c>routingPolicy.corridorLayer</c>) — lệnh tạo nếu chưa có.</summary>
    public string LayerDich => _chinhSach.CorridorLayer;

    /// <summary>Chiều cao khoảng trần (đáy dầm − trần, mm); null = chưa nhập đủ số.</summary>
    public double? ChieuCaoThongThuyMm =>
        DocSo(_cotDayDam) is { } d && DocSo(_cotTran) is { } t ? d - t : null;

    /// <summary>Sổ chiếm chỗ hiện có của hành lang đang sửa — CHỈ ĐỌC (FR3/FR4).</summary>
    public IReadOnlyList<string> DongChiemCho => _lanDaCap
        .Select(l =>
            $"{l.HeId} · {l.TierId} · làn {So(l.LanTuMm)}–{So(l.LanDenMm)}mm · cao độ {So(l.CaoDoMm)}mm")
        .ToList();

    /// <summary>Hành lang đang sửa đã có hệ đi qua chưa (quyết định hiện khối "làn đã cấp").</summary>
    public bool CoChiemCho => _lanDaCap.Count > 0;

    /// <summary>Việc lệnh sẽ làm với thuộc tính đang khai — CHỈ ĐỌC.</summary>
    public string MoTaViecSeLam
    {
        get
        {
            var he = HeChoPhepDaChon();
            var moTaHe = he.Count == 0
                ? "mọi hệ được đi qua"
                : $"chỉ {string.Join(", ", he)} được đi qua";
            var cao = ChieuCaoThongThuyMm is { } h
                ? $"khoảng trần cao {So(h)}mm"
                : "khoảng trần chưa tính được (chưa đủ cao độ)";
            var viec = _cheDo switch
            {
                CheDoHanhLang.VeMoi => $"Vẽ tim hành lang trên layer {LayerDich}",
                CheDoHanhLang.Nhan => $"Đổi layer sang {LayerDich}, ghi dữ liệu hành lang, giữ nguyên từng đỉnh",
                _ => "Ghi đè thuộc tính, giữ nguyên hình học và sổ chiếm làn",
            };
            return $"{viec}; {moTaHe}; {cao}.";
        }
    }

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ (nút OK đang khóa).</summary>
    public KetQuaHanhLang? KetQua() =>
        CoTheOk && DocSo(_beRong) is { } br && DocSo(_cotDayDam) is { } cdd && DocSo(_cotTran) is { } ct
            ? new KetQuaHanhLang(br, cdd, ct, HeChoPhepDaChon())
            : null;

    /// <summary>Hệ được phép đi qua; tick HẾT ⇒ danh sách RỖNG = mọi hệ (quy ước FR2/FR3).</summary>
    private IReadOnlyList<string> HeChoPhepDaChon() =>
        CacHe.All(h => h.Chon) ? [] : CacHe.Where(h => h.Chon).Select(h => h.Id).ToList();

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_cheDo != CheDoHanhLang.VeMoi && _tomTat.TongXuLy == 0)
        {
            loi.Add(
                _cheDo == CheDoHanhLang.Nhan
                    ? "Không có polyline nào nhận được trong vùng chọn — chọn polyline đoạn thẳng của bản vẽ " +
                      "(không thuộc xref) rồi chạy lại."
                    : "Không có hành lang XBoss nào trong vùng chọn — chọn hành lang đã nhận rồi chạy lại.");
            return loi;
        }
        if (DocSo(_beRong) is not { } br)
        {
            loi.Add("Chưa nhập bề rộng khả dụng của hành lang — nhập số mm, vd 600.");
        }
        else if (br <= 0)
        {
            loi.Add($"Bề rộng khả dụng \"{_beRong}\" phải là số dương (mm) — vd 600.");
        }
        if (DocSo(_cotDayDam) is null)
            loi.Add("Chưa nhập cao độ đáy dầm — nhập số mm, vd 3200 (bản vẽ 2D không chứa cao độ, phải khai tay).");
        if (DocSo(_cotTran) is null)
            loi.Add("Chưa nhập cao độ trần — nhập số mm, vd 2800.");
        if (CacHe.Count > 0 && CacHe.All(h => !h.Chon))
        {
            loi.Add(
                "Chưa chọn hệ nào được đi qua hành lang — tick ít nhất một hệ (tick hết = mọi hệ, " +
                "đúng mặc định của rule pack).");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (CacHe.Count == 0)
        {
            canhBao.Add(
                "Rule pack không khai hệ nào (drawTools.systems rỗng) — hành lang sẽ ghi \"mọi hệ được đi qua\".");
        }
        if (ChieuCaoThongThuyMm is { } cao)
        {
            if (cao <= 0)
            {
                canhBao.Add(
                    $"Cao độ đáy dầm không cao hơn cao độ trần (chênh {So(cao)}mm) — kiểm lại, tầng ống " +
                    "được cấp theo khoảng cách tính từ đáy dầm xuống.");
            }
            else if (SauNhatMm() is { } sau && cao < sau)
            {
                canhBao.Add(
                    $"Khoảng trần chỉ cao {So(cao)}mm trong khi tầng thấp nhất của rule pack nằm cách đáy dầm " +
                    $"{So(sau)}mm — hệ ở tầng đó sẽ không có chỗ, soát lại cao độ trước khi đi tuyến.");
            }
        }
        if (_lanDaCap.Count > 0)
        {
            var mepPhai = _lanDaCap.Max(l => Math.Max(l.LanTuMm, l.LanDenMm));
            canhBao.Add(
                $"Hành lang đang có {_lanDaCap.Count} làn đã cấp cho " +
                $"{string.Join(", ", _lanDaCap.Select(l => l.HeId).Distinct(StringComparer.Ordinal))} — " +
                "sổ chiếm làn được giữ nguyên, KHÔNG cấp lại theo bề rộng mới.");
            if (DocSo(_beRong) is { } br && br > 0 && br < mepPhai)
            {
                canhBao.Add(
                    $"Bề rộng mới {So(br)}mm NHỎ HƠN mép làn đã cấp ({So(mepPhai)}mm) — các tuyến đã đi qua " +
                    "đang nằm ngoài hành lang, chạy lại XBOSS_VE_TUYENTUDONG cho các hệ đó.");
            }
        }
        return canhBao;
    }

    /// <summary>Khoảng cách lớn nhất từ đáy dầm xuống một tầng của rule pack; null = không khai tầng nào.</summary>
    private double? SauNhatMm()
    {
        var offset = _chinhSach.Tiers
            .Select(t => t.OffsetFromBeamMm)
            .Where(v => v is { })
            .Select(v => v!.Value)
            .ToList();
        return offset.Count > 0 ? offset.Max() : null;
    }

    /// <summary>Báo lại mọi thứ suy ra từ các ô nhập rồi kiểm lại.</summary>
    private void TinhLai()
    {
        Bao(nameof(ChieuCaoThongThuyMm), nameof(MoTaViecSeLam));
        KiemLai();
    }

    private static double? DocSo(string? s) =>
        double.TryParse((s ?? "").Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}
