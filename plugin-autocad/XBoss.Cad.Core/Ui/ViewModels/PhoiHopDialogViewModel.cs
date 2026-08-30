using System.ComponentModel;
using System.Globalization;
using System.Windows.Input;
using XBoss.Cad.Core.Coordination;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một dòng xung đột trong bảng phối hợp (M116 §6 bước 3–4). Kỹ sư đánh dấu từng dòng
/// <i>chấp nhận (tự sửa tay)</i> hoặc <i>bỏ qua có lý do</i> — trạng thái này Adapter ghi vào XData
/// marker nên các lần chạy sau vẫn còn (FR4/AC2).
///
/// Có trạng thái đổi được nên hiện thực <see cref="INotifyPropertyChanged"/>; vẫn thuần .NET,
/// không chạm WPF/AutoCAD (cùng khuôn <see cref="DongGiaoNgatNet"/> của M109).
/// </summary>
public sealed class DongXungDot : INotifyPropertyChanged
{
    private TrangThaiXungDot _trangThai;
    private string _lyDo;

    /// <param name="xungDot">Xung đột do <see cref="QuetXungDot"/> quét ra.</param>
    /// <param name="trangThai">Trạng thái đọc từ marker của lần chạy trước (AC2).</param>
    /// <param name="lyDo">Lý do bỏ qua đã ghi ở lần chạy trước.</param>
    /// <param name="daCoMarker">Bản vẽ đã có marker của đúng id này (không tạo marker thứ hai).</param>
    public DongXungDot(
        XungDot xungDot,
        TrangThaiXungDot trangThai = TrangThaiXungDot.ChuaXuLy,
        string lyDo = "",
        bool daCoMarker = false)
    {
        XungDot = xungDot;
        _trangThai = trangThai;
        _lyDo = lyDo;
        DaCoMarker = daCoMarker;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>Xung đột gốc — nguồn của mọi thứ hiện trên dòng (Core đã tính sẵn).</summary>
    public XungDot XungDot { get; }

    /// <summary>Id ổn định — khóa bám của marker và của trạng thái xử lý (FR1/FR4).</summary>
    public string Id => XungDot.Id;

    /// <summary>Bản vẽ đã có marker của id này từ lần chạy trước.</summary>
    public bool DaCoMarker { get; }

    public TrangThaiXungDot TrangThai
    {
        get => _trangThai;
        set
        {
            if (_trangThai == value) return;
            _trangThai = value;
            Bao(nameof(TrangThai), nameof(ChapNhan), nameof(BoQua), nameof(CanLyDo), nameof(Nhan));
        }
    }

    /// <summary>Ô "chấp nhận (tự sửa tay)"; bỏ tick = quay lại chưa xử lý.</summary>
    public bool ChapNhan
    {
        get => _trangThai == TrangThaiXungDot.ChapNhan;
        set => TrangThai = value
            ? TrangThaiXungDot.ChapNhan
            : _trangThai == TrangThaiXungDot.ChapNhan ? TrangThaiXungDot.ChuaXuLy : _trangThai;
    }

    /// <summary>Ô "bỏ qua có lý do"; bỏ tick = quay lại chưa xử lý.</summary>
    public bool BoQua
    {
        get => _trangThai == TrangThaiXungDot.BoQua;
        set => TrangThai = value
            ? TrangThaiXungDot.BoQua
            : _trangThai == TrangThaiXungDot.BoQua ? TrangThaiXungDot.ChuaXuLy : _trangThai;
    }

    /// <summary>Lý do bỏ qua — bắt buộc khi <see cref="BoQua"/>, để lần sau đọc lại còn hiểu.</summary>
    public string LyDo
    {
        get => _lyDo;
        set
        {
            var moi = value ?? "";
            if (string.Equals(_lyDo, moi, StringComparison.Ordinal)) return;
            _lyDo = moi;
            Bao(nameof(LyDo), nameof(CanLyDo), nameof(Nhan));
        }
    }

    /// <summary>Dòng đang BỎ QUA mà chưa ghi lý do — nút OK bị khóa vì cái này.</summary>
    public bool CanLyDo => _trangThai == TrangThaiXungDot.BoQua && string.IsNullOrWhiteSpace(_lyDo);

    /// <summary>Mức + lớp kiểm + mô tả — một dòng đọc được, dùng chung hộp thoại và dòng lệnh.</summary>
    public string Nhan =>
        $"[{NhanMuc(XungDot.Muc)}] {NhanLop(XungDot.Lop)} · {XungDot.MoTa} " +
        $"(id {Id}, trạng thái: {MaTrangThaiXungDot.Nhan(_trangThai)}" +
        (_trangThai == TrangThaiXungDot.BoQua && _lyDo.Length > 0 ? $" — {_lyDo}" : "") + ")";

    /// <summary>Đề xuất xử lý sinh từ bảng luật rule pack (FR3) — mỗi đề xuất một dòng.</summary>
    public string NhanDeXuat =>
        XungDot.DeXuat.Count == 0
            ? "Rule pack không khai luật nào cho ca này — kỹ sư quyết."
            : string.Join("\n", XungDot.DeXuat.Select(d => $"→ {d.MoTa}"));

    /// <summary>Nhãn tiếng Việt của mức nghiêm trọng.</summary>
    public static string NhanMuc(MucXungDot muc) => muc switch
    {
        MucXungDot.Cung => "CỨNG",
        MucXungDot.Mem => "MỀM",
        _ => "CẢNH BÁO",
    };

    /// <summary>Nhãn tiếng Việt của lớp kiểm.</summary>
    public static string NhanLop(LopKiem lop) => lop switch
    {
        LopKiem.GiaoCatCaoDo => "giao cắt cùng cao độ",
        LopKiem.TranhChapHanhLang => "tranh chấp hành lang",
        LopKiem.KhoangCachQuyPham => "khoảng cách quy phạm",
        _ => "giao cắt mặt bằng (thiếu cao độ)",
    };

    private void Bao(params string[] ten)
    {
        var xuLy = PropertyChanged;
        if (xuLy is null) return;
        foreach (var t in ten) xuLy(this, new PropertyChangedEventArgs(t));
    }
}

/// <summary>Một mục trong ô lọc theo mức; <see cref="Muc"/> null = "(tất cả mức)".</summary>
public sealed record LuaChonMucXungDot(string Nhan, MucXungDot? Muc);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_PHOIHOP</c> (M116 §6 bước 3–4, khung M106): bảng xung đột lọc theo
/// HỆ và theo MỨC, mỗi dòng bấm "Zoom tới" và đánh dấu chấp nhận / bỏ qua có lý do.
///
/// THUẦN .NET, không chạm AutoCAD ⇒ test trên CI Linux; hành vi zoom và việc ghi marker do Adapter
/// gắn vào. Bộ lọc CHỈ đổi thứ hiển thị — <see cref="KetQua"/> luôn trả về TOÀN BỘ dòng, để lọc
/// xong bấm OK không âm thầm bỏ mất trạng thái của các dòng đang ẩn.
/// </summary>
public sealed class PhoiHopDialogViewModel : DialogViewModelBase
{
    /// <summary>Số dòng hiện tối đa sau khi lọc — dài hơn thì kèm ghi chú, không cắt dữ liệu.</summary>
    private const int SoDongToiDa = 200;

    /// <summary>Mục "không lọc" của cả hai ô lọc.</summary>
    public const string TatCaHe = "(tất cả hệ)";

    private readonly IReadOnlyList<DongXungDot> _dong;
    private string _heLoc = TatCaHe;
    private LuaChonMucXungDot _mucLoc;

    /// <param name="dong">Mọi xung đột quét được, kèm trạng thái đọc từ marker cũ.</param>
    /// <param name="chinhSach">Khối <c>coordinationPolicy</c> đang áp — chỉ để hiện tham số.</param>
    public PhoiHopDialogViewModel(IReadOnlyList<DongXungDot> dong, CoordinationPolicySection chinhSach)
    {
        _dong = dong;
        ChinhSach = chinhSach;
        CacMuc =
        [
            new LuaChonMucXungDot("(tất cả mức)", null),
            new LuaChonMucXungDot(DongXungDot.NhanMuc(MucXungDot.Cung), MucXungDot.Cung),
            new LuaChonMucXungDot(DongXungDot.NhanMuc(MucXungDot.Mem), MucXungDot.Mem),
            new LuaChonMucXungDot(DongXungDot.NhanMuc(MucXungDot.CanhBao), MucXungDot.CanhBao),
        ];
        _mucLoc = CacMuc[0];
        CacHe =
        [
            TatCaHe,
            .. _dong
                .SelectMany(d => d.XungDot.HeLienQuan)
                .Distinct(StringComparer.Ordinal)
                .OrderBy(h => h, StringComparer.Ordinal),
        ];

        LenhZoom = new LenhUyNhiem(m =>
        {
            if (m is DongXungDot d) ZoomToi?.Invoke(d);
        });
        foreach (var d in _dong) d.PropertyChanged += (_, _) => TinhLai();
        KiemLai();
    }

    public override string TieuDe => "XBOSS_PHOIHOP — Phối hợp xung đột liên hệ";

    public override string MoTa =>
        "Danh sách xung đột giữa các hệ trên bản vẽ (kể cả tuyến đọc từ xref). Plugin KHÔNG tự sửa " +
        "tuyến: mỗi dòng kèm đề xuất theo rule pack, kỹ sư đánh dấu chấp nhận (tự sửa tay) hoặc bỏ " +
        "qua có lý do — trạng thái được ghi vào bản vẽ nên chạy lại lệnh vẫn giữ nguyên.";

    /// <summary>Chính sách đang áp — chỉ đọc, để hộp thoại nói rõ đang quét theo tham số nào.</summary>
    public CoordinationPolicySection ChinhSach { get; }

    public ICommand LenhZoom { get; }

    /// <summary>Adapter gắn: zoom màn hình tới vị trí xung đột của dòng đang bấm.</summary>
    public Action<DongXungDot>? ZoomToi { get; set; }

    // ===== Bộ lọc =====

    /// <summary>Danh mục hệ có trong kết quả quét, kèm mục "(tất cả hệ)" ở đầu.</summary>
    public IReadOnlyList<string> CacHe { get; }

    /// <summary>Danh mục mức nghiêm trọng, kèm mục "(tất cả mức)" ở đầu.</summary>
    public IReadOnlyList<LuaChonMucXungDot> CacMuc { get; }

    public string HeLoc
    {
        get => _heLoc;
        set
        {
            if (!Dat(ref _heLoc, string.IsNullOrWhiteSpace(value) ? TatCaHe : value)) return;
            TinhLai();
        }
    }

    public LuaChonMucXungDot MucLoc
    {
        get => _mucLoc;
        set
        {
            if (!Dat(ref _mucLoc, value ?? CacMuc[0])) return;
            TinhLai();
        }
    }

    /// <summary>Các dòng khớp bộ lọc (đã cắt còn <see cref="SoDongToiDa"/> dòng đầu để hộp thoại gọn).</summary>
    public IReadOnlyList<DongXungDot> DanhSach => LocDay().Take(SoDongToiDa).ToList();

    /// <summary>Toàn bộ dòng khớp bộ lọc, KHÔNG cắt bớt — nguồn của mọi con số tóm tắt.</summary>
    public IReadOnlyList<DongXungDot> LocDay() =>
        _dong
            .Where(d => _heLoc == TatCaHe || d.XungDot.HeLienQuan.Contains(_heLoc, StringComparer.Ordinal))
            .Where(d => _mucLoc.Muc is not { } m || d.XungDot.Muc == m)
            .ToList();

    public string GhiChuDanhSach
    {
        get
        {
            var loc = LocDay().Count;
            return loc > SoDongToiDa
                ? $"Hiện {SoDongToiDa} dòng đầu trong {loc} dòng khớp bộ lọc — các dòng còn lại vẫn được " +
                  "đánh dấu trên bản vẽ, chỉ không hiện hết ở đây."
                : "";
        }
    }

    // ===== Tóm tắt =====

    public int TongSo => _dong.Count;
    public int SoCung => _dong.Count(d => d.XungDot.Muc == MucXungDot.Cung);
    public int SoMem => _dong.Count(d => d.XungDot.Muc == MucXungDot.Mem);
    public int SoCanhBao => _dong.Count(d => d.XungDot.Muc == MucXungDot.CanhBao);
    public int SoThieuCaoDo => _dong.Count(d => d.XungDot.ThieuCaoDo);
    public int SoChuaXuLy => _dong.Count(d => d.TrangThai == TrangThaiXungDot.ChuaXuLy);
    public int SoChapNhan => _dong.Count(d => d.TrangThai == TrangThaiXungDot.ChapNhan);
    public int SoBoQua => _dong.Count(d => d.TrangThai == TrangThaiXungDot.BoQua);

    /// <summary>Xung đột CỨNG chưa được kỹ sư quyết gì — thứ đáng lo nhất của bảng này.</summary>
    public int SoCungChuaXuLy =>
        _dong.Count(d => d.XungDot.Muc == MucXungDot.Cung && d.TrangThai == TrangThaiXungDot.ChuaXuLy);

    public string TomTat =>
        _dong.Count == 0
            ? "Không phát hiện xung đột nào trong phạm vi đã quét."
            : $"{TongSo} xung đột: {SoCung} cứng, {SoMem} mềm, {SoCanhBao} cảnh báo · đã đánh dấu " +
              $"{SoChapNhan} chấp nhận, {SoBoQua} bỏ qua, còn {SoChuaXuLy} chưa xử lý.";

    public string GhiChu =>
        "Đề xuất chỉ sinh từ bảng luật rule pack (thứ tự nhường theo crossingPolicy.priority, khoảng " +
        $"bảo trì {So(ChinhSach.MaintenanceGapMm)} mm, {ChinhSach.MinClearancePairsMm.Count} cặp hệ khai " +
        "khoảng cách tối thiểu). Plugin không tự sửa tuyến: sửa cao độ bằng XBOSS_TUYEN_GAN rồi chạy " +
        "lại XBOSS_HOANTHIEN và XBOSS_PHOIHOP.";

    /// <summary>Danh sách dòng SAU khi kỹ sư đánh dấu (toàn bộ, không phụ thuộc bộ lọc); null khi form chưa hợp lệ.</summary>
    public IReadOnlyList<DongXungDot>? KetQua() => CoTheOk ? _dong : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        var thieuLyDo = _dong.Count(d => d.CanLyDo);
        if (thieuLyDo > 0)
        {
            loi.Add(
                $"{thieuLyDo} dòng đang BỎ QUA mà chưa ghi lý do — lý do được lưu vào bản vẽ để lần " +
                "phối hợp sau biết vì sao chỗ đó bỏ qua, không bỏ trống được.");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();
        if (SoCungChuaXuLy > 0)
        {
            canhBao.Add(
                $"{SoCungChuaXuLy} xung đột CỨNG chưa xử lý — các chỗ đó chắc chắn va nhau ngoài công " +
                "trường, đánh dấu xong hãy phát hành bản vẽ.");
        }
        if (SoThieuCaoDo > 0)
        {
            canhBao.Add(
                $"{SoThieuCaoDo} xung đột chỉ kiểm được trên MẶT BẰNG vì tuyến liên quan thiếu cao độ — " +
                "gán cao độ bằng XBOSS_TUYEN_GAN rồi quét lại mới kết luận được có va nhau hay không.");
        }
        return canhBao;
    }

    /// <summary>Một dòng đổi trạng thái / đổi bộ lọc ⇒ tính lại tóm tắt và kiểm lại.</summary>
    private void TinhLai()
    {
        Bao(
            nameof(DanhSach), nameof(GhiChuDanhSach), nameof(TomTat), nameof(SoChuaXuLy),
            nameof(SoChapNhan), nameof(SoBoQua), nameof(SoCungChuaXuLy));
        KiemLai();
    }

    private static string So(double v) => v.ToString("0.###", CultureInfo.InvariantCulture);
}
