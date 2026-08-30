namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>Phạm vi bóc/gỡ dấu — đúng 2 keyword <c>ToanBo</c>/<c>ChonVung</c> của dòng lệnh.</summary>
public enum PhamViBoc
{
    /// <summary>Toàn bộ model space.</summary>
    ToanBo,

    /// <summary>Chọn vùng sau khi đóng hộp thoại.</summary>
    ChonVung,
}

/// <summary>Tham số <c>XBOSS_BOCKL</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaBocKl(PhamViBoc PhamVi, bool ChiaVung);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_BOCKL</c> (M106 §7.2): phạm vi + có bóc theo vùng (tầng/zone) không
/// — đúng hai câu hỏi keyword mở đầu lệnh.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "hệ cần bóc". Lệnh THẬT không lọc theo hệ —
/// nó quét mọi đối tượng khớp <c>takeoff.items</c> của rule pack trong phạm vi; thêm ô chọn hệ là
/// dựng một cách bóc thứ hai mà đường dòng lệnh không có (§2.4). Câu xác nhận "đánh dấu n đối
/// tượng đã bóc" vẫn ở dòng lệnh vì con số chỉ có SAU khi bóc xong.
/// </summary>
public sealed class BocKlDialogViewModel : DialogViewModelBase
{
    private readonly string _rulePackVersion;
    private PhamViBoc _phamVi = PhamViBoc.ToanBo;
    private bool _chiaVung;

    public BocKlDialogViewModel(string rulePackVersion)
    {
        _rulePackVersion = rulePackVersion;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_BOCKL — Bóc khối lượng";

    public override string MoTa => $"Bóc theo quy tắc của rule pack {_rulePackVersion}.";

    public PhamViBoc PhamVi
    {
        get => _phamVi;
        set
        {
            if (!Dat(ref _phamVi, value)) return;
            Bao(nameof(LaToanBo), nameof(LaChonVung), nameof(MoTaViecTiepTheo));
            KiemLai();
        }
    }

    public bool LaToanBo
    {
        get => _phamVi == PhamViBoc.ToanBo;
        set { if (value) PhamVi = PhamViBoc.ToanBo; }
    }

    public bool LaChonVung
    {
        get => _phamVi == PhamViBoc.ChonVung;
        set { if (value) PhamVi = PhamViBoc.ChonVung; }
    }

    /// <summary>Bóc theo vùng (tầng/zone) — mặc định KHÔNG, giữ nguyên thói quen cũ.</summary>
    public bool ChiaVung
    {
        get => _chiaVung;
        set
        {
            if (!Dat(ref _chiaVung, value)) return;
            Bao(nameof(MoTaViecTiepTheo));
            KiemLai();
        }
    }

    /// <summary>Việc kỹ sư phải làm ngay sau khi bấm OK — CHỈ ĐỌC (FR6).</summary>
    public string MoTaViecTiepTheo =>
        (_phamVi == PhamViBoc.ChonVung ? "Sau OK: quét chọn các đối tượng cần bóc. " : "") +
        (_chiaVung
            ? "Sau đó: chọn polyline ranh giới rồi đặt tên từng vùng — tên vùng ghi vào XData để bảng xuất " +
              "tách được theo tầng/zone."
            : "Không chia vùng — kết quả gộp chung cả phạm vi.") +
        " Kết quả hiện trên dòng lệnh trước, chỉ đánh dấu vào bản vẽ khi bạn xác nhận.";

    public KetQuaBocKl? KetQua() => CoTheOk ? new KetQuaBocKl(_phamVi, _chiaVung) : null;

    protected override IReadOnlyList<string> Kiem() => [];
}

/// <summary>Tham số <c>XBOSS_BOCKL_XOA</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaBocKlXoa(PhamViBoc PhamVi);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_BOCKL_XOA</c> (M106 §7.2): phạm vi gỡ dấu bóc — đúng câu hỏi
/// keyword duy nhất của lệnh.
/// </summary>
public sealed class BocKlXoaDialogViewModel : DialogViewModelBase
{
    private PhamViBoc _phamVi = PhamViBoc.ToanBo;

    public BocKlXoaDialogViewModel() => KiemLai();

    public override string TieuDe => "XBOSS_BOCKL_XOA — Gỡ đánh dấu bóc";

    public override string MoTa =>
        "Gỡ dấu bóc (trả đúng màu trước khi bóc) để XBOSS_BOCKL nhìn thấy lại các đối tượng đó.";

    public PhamViBoc PhamVi
    {
        get => _phamVi;
        set
        {
            if (!Dat(ref _phamVi, value)) return;
            Bao(nameof(LaToanBo), nameof(LaChonVung), nameof(MoTaViecTiepTheo));
            KiemLai();
        }
    }

    public bool LaToanBo
    {
        get => _phamVi == PhamViBoc.ToanBo;
        set { if (value) PhamVi = PhamViBoc.ToanBo; }
    }

    public bool LaChonVung
    {
        get => _phamVi == PhamViBoc.ChonVung;
        set { if (value) PhamVi = PhamViBoc.ChonVung; }
    }

    public string MoTaViecTiepTheo =>
        _phamVi == PhamViBoc.ChonVung
            ? "Sau OK: quét chọn các đối tượng cần gỡ dấu. Hoàn tác: UNDO 1 lần."
            : "Gỡ dấu trên TOÀN BỘ model space. Hoàn tác: UNDO 1 lần.";

    public KetQuaBocKlXoa? KetQua() => CoTheOk ? new KetQuaBocKlXoa(_phamVi) : null;

    protected override IReadOnlyList<string> Kiem() => [];
}

/// <summary>Tham số <c>XBOSS_BOCKL_XUAT</c> thu được từ hộp thoại.</summary>
public sealed record KetQuaBocKlXuat(string TenDuAn, string GoiThau, bool DoiChieuBoq);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_BOCKL_XUAT</c> (M106 §7.2): tên dự án + gói thầu (đầu trang Excel)
/// và có kéo KL BOQ hợp đồng từ máy chủ để dựng sheet "Doi-chieu" không — đúng ba câu hỏi của
/// đường dòng lệnh.
///
/// <b>Lệch có chủ đích với bảng §7.2</b>: bảng ghi "đường dẫn tệp Excel". Lệnh THẬT lấy đường dẫn
/// bằng <c>SaveFileDialog</c> của AutoCAD (đã là chuột, và là hộp thoại hệ thống) sau khi in bảng
/// kết quả ra dòng lệnh — giữ nguyên.
/// </summary>
public sealed class BocKlXuatDialogViewModel : DialogViewModelBase
{
    private readonly bool _daGhepThietBi;
    private string _tenDuAn;
    private string _goiThau;
    private bool _doiChieu;

    /// <param name="tenDuAn">Tên dự án nhớ lần trước (ExcelMetaStore).</param>
    /// <param name="goiThau">Gói thầu nhớ lần trước.</param>
    /// <param name="daGhepThietBi">Máy đã có server + token chưa (quyết định có kéo BOQ được không).</param>
    public BocKlXuatDialogViewModel(string? tenDuAn, string? goiThau, bool daGhepThietBi)
    {
        _tenDuAn = (tenDuAn ?? "").Trim();
        _goiThau = (goiThau ?? "").Trim();
        _daGhepThietBi = daGhepThietBi;
        KiemLai();
    }

    public override string TieuDe => "XBOSS_BOCKL_XUAT — Xuất bảng bóc khối lượng";

    public override string MoTa =>
        "Thông tin đầu trang Excel; bấm OK rồi chọn nơi lưu tệp .xlsx.";

    public string TenDuAn
    {
        get => _tenDuAn;
        set
        {
            if (!Dat(ref _tenDuAn, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    public string GoiThau
    {
        get => _goiThau;
        set
        {
            if (!Dat(ref _goiThau, (value ?? "").Trim())) return;
            KiemLai();
        }
    }

    /// <summary>Kéo KL BOQ hợp đồng từ máy chủ để dựng sheet <c>Doi-chieu</c> (mặc định KHÔNG).</summary>
    public bool DoiChieuBoq
    {
        get => _doiChieu;
        set
        {
            if (!Dat(ref _doiChieu, value)) return;
            Bao(nameof(MoTaDoiChieu));
            KiemLai();
        }
    }

    /// <summary>Điều kiện + đường lui của sheet đối chiếu — CHỈ ĐỌC (FR6).</summary>
    public string MoTaDoiChieu =>
        !_doiChieu
            ? "Chỉ bảng bóc như cũ (cột G = khối lượng bóc từ bản vẽ; QS điền cột F)."
            : _daGhepThietBi
                ? "Sẽ gọi máy chủ lấy KL BOQ hợp đồng. Mất mạng/token hết hạn chỉ CẢNH BÁO — Excel vẫn xuất."
                : "Máy chưa ghép thiết bị (chạy XBOSS_LOGIN) — lệnh sẽ bỏ qua sheet đối chiếu, Excel vẫn xuất.";

    public KetQuaBocKlXuat? KetQua() =>
        CoTheOk ? new KetQuaBocKlXuat(_tenDuAn, _goiThau, _doiChieu) : null;

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_tenDuAn.Length == 0) loi.Add("Chưa nhập tên dự án (hiện ở đầu trang Excel).");
        if (_goiThau.Length == 0) loi.Add("Chưa nhập gói thầu.");
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao() =>
        _doiChieu && !_daGhepThietBi
            ? ["Chưa ghép thiết bị với máy chủ — sheet đối chiếu sẽ bị bỏ qua, bảng bóc vẫn xuất bình thường."]
            : [];
}
