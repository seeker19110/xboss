using System.ComponentModel;
using System.Globalization;
using System.Windows.Input;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Lệnh đơn giản cho nút bấm trong hộp thoại (M106) — THUẦN .NET: <see cref="ICommand"/> nằm ở
/// thư viện nền (System.ObjectModel), không kéo theo WPF nên Core vẫn test được không cần AutoCAD.
/// Dùng cho nút "Zoom tới" của <see cref="RevisionDialogViewModel"/> (M110 FR1): hành vi zoom thật
/// do Adapter gắn vào, ViewModel chỉ biết "kỹ sư vừa bấm vào dòng nào".
/// </summary>
public sealed class LenhUyNhiem(Action<object?> chay, Func<object?, bool>? choPhep = null) : ICommand
{
    public event EventHandler? CanExecuteChanged
    {
        add { }
        remove { }
    }

    public bool CanExecute(object? parameter) => choPhep is null || choPhep(parameter);

    public void Execute(object? parameter)
    {
        if (CanExecute(parameter)) chay(parameter);
    }
}

/// <summary>
/// Một dòng đề xuất khoanh revision (M110 FR1) — <see cref="Chon"/> tick được nên phải báo đổi
/// cho giao diện; phần còn lại là dữ liệu đọc từ mốc, không đổi trong đời hộp thoại.
/// </summary>
public sealed class MucDeXuatRevision : INotifyPropertyChanged
{
    private bool _chon = true;

    public MucDeXuatRevision(ThayDoiRevision thayDoi)
    {
        ThayDoi = thayDoi;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>Thay đổi gốc (Core tính từ mốc) — Adapter dùng lại chính đối tượng này để vẽ.</summary>
    public ThayDoiRevision ThayDoi { get; }

    /// <summary>Có khoanh dòng này không (mặc định CÓ — kỹ sư bỏ tick chỗ không muốn khoanh).</summary>
    public bool Chon
    {
        get => _chon;
        set
        {
            if (_chon == value) return;
            _chon = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Chon)));
        }
    }

    /// <summary>Nhãn tiếng Việt một dòng: loại · hệ · cỡ · handle · tâm vùng (để gõ thẳng vào AutoCAD).</summary>
    public string Nhan =>
        $"{NhanLoai(ThayDoi.Loai)} · {(string.IsNullOrWhiteSpace(ThayDoi.HeId) ? "(không rõ hệ)" : ThayDoi.HeId)}" +
        $"/{ThayDoi.ItemId} {ThayDoi.Size} · handle {ThayDoi.Handle} · tâm " +
        $"{So((ThayDoi.Vung.MinX + ThayDoi.Vung.MaxX) / 2)},{So((ThayDoi.Vung.MinY + ThayDoi.Vung.MaxY) / 2)}";

    /// <summary>Nhãn tiếng Việt của loại thay đổi (dùng chung hộp thoại và dòng lệnh).</summary>
    public static string NhanLoai(LoaiThayDoi loai) => loai switch
    {
        LoaiThayDoi.Them => "THÊM MỚI",
        LoaiThayDoi.Xoa => "ĐÃ XÓA (khoanh tại vị trí cũ)",
        _ => "ĐÃ ĐỔI",
    };

    private static string So(double v) => v.ToString("0.##", CultureInfo.InvariantCulture);
}

/// <summary>Tham số một lần chạy <c>XBOSS_VE_REV</c>.</summary>
/// <param name="TuChonVung">true = kỹ sư tự chọn vùng bằng chuột sau khi đóng hộp thoại.</param>
/// <param name="DaChon">Các đề xuất đã tick (rỗng khi <paramref name="TuChonVung"/>).</param>
public sealed record KetQuaHoiRevision(bool TuChonVung, IReadOnlyList<ThayDoiRevision> DaChon);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_REV</c> (M110 FR1): số revision đang mở, danh sách đề xuất theo
/// mốc (§4) có tick + nút "Zoom tới", và 2 đường vào — khoanh theo đề xuất đã tick, hoặc tự chọn
/// vùng bằng chuột.
///
/// THUẦN: không biết gì về AutoCAD. Hành vi zoom do Adapter gắn qua <see cref="ZoomToi"/>; bản vẽ
/// chưa từng chốt revision (không có mốc) thì hộp thoại chỉ còn đường "tự chọn vùng" và nói rõ lý do.
/// </summary>
public sealed class RevisionDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<MucDeXuatRevision> _deXuat;
    private readonly string? _lyDoKhongDeXuat;
    private bool _tuChonVung;

    /// <param name="soRevisionDangMo">Số revision đang mở = mốc gần nhất + 1 (M110 FR1).</param>
    /// <param name="deXuat">Thay đổi phát hiện được khi so mốc (rỗng = không có/không so được).</param>
    /// <param name="lyDoKhongDeXuat">
    /// Lý do tiếng Việt khi không đề xuất được (chưa từng chốt revision, hoặc mốc đã vô hiệu vì
    /// bản vẽ bị WBLOCK/copy — M110 §11). null = so mốc bình thường.
    /// </param>
    public RevisionDialogViewModel(
        int soRevisionDangMo, IReadOnlyList<ThayDoiRevision> deXuat, string? lyDoKhongDeXuat = null)
    {
        SoRevisionDangMo = soRevisionDangMo;
        _deXuat = deXuat.Select(d => new MucDeXuatRevision(d)).ToList();
        _lyDoKhongDeXuat = lyDoKhongDeXuat;
        _tuChonVung = _deXuat.Count == 0;
        LenhZoom = new LenhUyNhiem(m =>
        {
            if (m is MucDeXuatRevision muc) ZoomToi?.Invoke(muc);
        });
        foreach (var m in _deXuat) m.PropertyChanged += (_, _) => KiemLai();
        KiemLai();
    }

    public int SoRevisionDangMo { get; }

    public override string TieuDe => "XBOSS_VE_REV — Khoanh revision cloud";

    public override string MoTa =>
        $"Revision đang mở: R{SoRevisionDangMo.ToString(CultureInfo.InvariantCulture)}. " +
        "Tick các vùng cần khoanh, hoặc chọn tự khoanh bằng chuột.";

    /// <summary>Đề xuất theo mốc (§4) — mỗi dòng một thay đổi thêm/xóa/đổi.</summary>
    public IReadOnlyList<MucDeXuatRevision> CacDeXuat => _deXuat;

    /// <summary>Nút "Zoom tới" của từng dòng; hành vi thật do Adapter gắn qua <see cref="ZoomToi"/>.</summary>
    public ICommand LenhZoom { get; }

    /// <summary>Adapter gắn: đưa màn hình về vùng của dòng đang xem (FR1).</summary>
    public Action<MucDeXuatRevision>? ZoomToi { get; set; }

    /// <summary>Radio "khoanh theo đề xuất đã tick".</summary>
    public bool TheoDeXuat
    {
        get => !_tuChonVung;
        set
        {
            if (value) TuChonVung = false;
        }
    }

    /// <summary>Radio "tự chọn vùng bằng chuột" (đường duy nhất khi không có đề xuất).</summary>
    public bool TuChonVung
    {
        get => _tuChonVung;
        set
        {
            if (!Dat(ref _tuChonVung, value)) return;
            Bao(nameof(TheoDeXuat));
            KiemLai();
        }
    }

    /// <summary>Ghi chú dưới danh sách: nói thật giới hạn của mốc (M110 §11).</summary>
    public string GhiChuDeXuat =>
        _lyDoKhongDeXuat is { Length: > 0 } lyDo
            ? lyDo
            : $"{_deXuat.Count} thay đổi so với mốc revision gần nhất. Mốc chỉ theo dõi đối tượng do " +
              "bộ lệnh XBoss vẽ (có XData) — hình vẽ tay phải tự khoanh bằng chuột.";

    public string TomTat =>
        _deXuat.Count == 0
            ? "Không có đề xuất nào — dùng đường tự chọn vùng bằng chuột."
            : $"Đang tick {SoDaTick}/{_deXuat.Count} vùng.";

    private int SoDaTick => _deXuat.Count(m => m.Chon);

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (!_tuChonVung && SoDaTick == 0)
        {
            loi.Add(
                _deXuat.Count == 0
                    ? "Không có đề xuất nào để khoanh — chọn \"tự chọn vùng bằng chuột\"."
                    : "Chưa tick vùng nào — tick ít nhất một dòng, hoặc chọn tự khoanh bằng chuột.");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (_lyDoKhongDeXuat is { Length: > 0 } lyDo) canhBao.Add(lyDo);
        return canhBao;
    }

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ.</summary>
    public KetQuaHoiRevision? KetQua() =>
        CoTheOk
            ? new KetQuaHoiRevision(
                _tuChonVung,
                _tuChonVung ? [] : _deXuat.Where(m => m.Chon).Select(m => m.ThayDoi).ToList())
            : null;
}

/// <summary>Một revision đang có cloud trong bản vẽ — mục chọn hiện/ẩn (M110 FR6).</summary>
public sealed class MucHienThiRevision : INotifyPropertyChanged
{
    private bool _hien;

    public MucHienThiRevision(int so, int soDoiTuong, string layer, bool hien)
    {
        So = so;
        SoDoiTuong = soDoiTuong;
        Layer = layer;
        _hien = hien;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public int So { get; }
    public int SoDoiTuong { get; }

    /// <summary>Layer con <c>&lt;layer&gt;-R{n}</c> chứa cloud + tam giác của revision này.</summary>
    public string Layer { get; }

    public bool Hien
    {
        get => _hien;
        set
        {
            if (_hien == value) return;
            _hien = value;
            PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(Hien)));
        }
    }

    public string Nhan =>
        $"R{So.ToString(CultureInfo.InvariantCulture)} — {SoDoiTuong.ToString(CultureInfo.InvariantCulture)} " +
        $"đối tượng (layer {Layer})";
}

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_REV_HIENTHI</c> (M110 FR6): bật/tắt hiển thị cloud theo từng
/// revision. Mặc định đưa vào là "revision hiện hành hiện, các revision cũ tắt" — Adapter tính sẵn.
/// </summary>
public sealed class HienThiRevisionDialogViewModel : DialogViewModelBase
{
    private readonly IReadOnlyList<MucHienThiRevision> _cacRevision;

    public HienThiRevisionDialogViewModel(IReadOnlyList<MucHienThiRevision> cacRevision)
    {
        _cacRevision = cacRevision;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_VE_REV_HIENTHI — Hiện/ẩn revision cloud";

    public override string MoTa =>
        "Chọn các revision cần HIỆN trên bản vẽ; bản in nộp thường chỉ khoanh lần sửa mới nhất.";

    public IReadOnlyList<MucHienThiRevision> CacRevision => _cacRevision;

    public string GhiChu =>
        "Mỗi revision nằm trên một layer con riêng, tắt/bật chỉ đổi hiển thị — cloud cũ vẫn còn " +
        "nguyên trong bản vẽ để tra ngược hồ sơ.";

    protected override IReadOnlyList<string> Kiem() =>
        _cacRevision.Count == 0
            ? ["Bản vẽ chưa có revision cloud nào — chạy XBOSS_VE_REV để khoanh vùng sửa trước."]
            : [];

    /// <summary>Số revision cần HIỆN sau khi bấm OK.</summary>
    public IReadOnlyList<int> KetQua() => _cacRevision.Where(r => r.Hien).Select(r => r.So).ToList();
}
