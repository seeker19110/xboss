using System.ComponentModel;
using System.Globalization;
using XBoss.Cad.Core.Draw;

namespace XBoss.Cad.Core.Ui.ViewModels;

/// <summary>
/// Một đối tượng nguồn ứng viên chép sang tầng khác — dạng THUẦN (Adapter đọc sẵn khỏi bản vẽ
/// trong transaction CHỈ ĐỌC rồi mới mở hộp thoại; Core không biết gì về <c>ObjectId</c>).
/// </summary>
/// <param name="Handle">Handle của đối tượng nguồn — khóa của bảng ánh xạ handle (FR4).</param>
/// <param name="XData">XData <c>XBOSS_VE</c> đang có (vai trò + mọi liên kết handle).</param>
/// <param name="Tag">Giá trị thẻ <c>TAG</c> nếu là khối thiết bị/phụ kiện; null = không có tag.</param>
/// <param name="DaBoc">Đối tượng đang mang dấu đã bóc <c>XBOSS_BOCKL</c> (bản chép sẽ GỠ — FR8).</param>
/// <param name="VungBoc">Tên vùng bóc ghi trên dấu bóc; rỗng = bóc không chia vùng.</param>
/// <param name="DaiMm">Chiều dài tim (mm) — chỉ vai trò <see cref="VaiTroVe.Tim"/>, để xem trước FR3.</param>
public sealed record DoiTuongNhanTang(
    string Handle,
    VeXDataInfo XData,
    string? Tag = null,
    bool DaBoc = false,
    string VungBoc = "",
    double DaiMm = 0);

/// <summary>Số đối tượng bị bỏ qua vì vai trò KHÔNG nằm trong <c>floorPolicy.copyRoles</c> (FR7).</summary>
public sealed record DemVaiTroBoQua(VaiTroVe VaiTro, int So);

/// <summary>
/// Tóm tắt vùng chọn: cái gì KHÔNG được chép và vì sao (FR1/FR7). Mọi con số ở đây phải đếm
/// được — đối tượng biến mất im lặng khỏi bản chép là thứ kỹ sư không bao giờ tự phát hiện.
/// </summary>
/// <param name="SoKhongCoXData">Nền kiến trúc/đối tượng không do bộ lệnh vẽ sinh ra.</param>
/// <param name="SoThuocXref">Đối tượng của xref — plugin không bao giờ đụng (quy ước 2026-08-26).</param>
/// <param name="SoVonLaBanChep">Đối tượng trong vùng chọn vốn ĐÃ là bản chép của một tầng khác.</param>
/// <param name="VaiTroBoQua">Vai trò ngoài <c>copyRoles</c> (mặt cắt/bảng/revision… — dựng lại bằng lệnh riêng).</param>
public sealed record TomTatChonNhanTang(
    int SoKhongCoXData,
    int SoThuocXref,
    int SoVonLaBanChep,
    IReadOnlyList<DemVaiTroBoQua> VaiTroBoQua)
{
    /// <summary>Tổng số đối tượng của vùng chọn KHÔNG được chép.</summary>
    public int TongBoQua =>
        SoKhongCoXData + SoThuocXref + VaiTroBoQua.Sum(v => v.So);

    /// <summary>
    /// Lý do BỎ QUA từng phần của vùng chọn, tiếng Việt, hiện nguyên văn ở cả hộp thoại lẫn dòng
    /// lệnh (FR1/FR7) — đối tượng biến mất im lặng khỏi bản chép là thứ kỹ sư không bao giờ tự
    /// phát hiện được.
    /// </summary>
    public IReadOnlyList<string> DongBoQua
    {
        get
        {
            var dong = new List<string>();
            if (SoKhongCoXData > 0)
            {
                dong.Add(
                    $"{SoKhongCoXData} đối tượng không mang dữ liệu XBoss (nền kiến trúc, nét vẽ tay) — " +
                    "nền tầng do bản kiến trúc cung cấp, plugin không chép.");
            }
            if (SoThuocXref > 0)
                dong.Add($"{SoThuocXref} đối tượng thuộc xref — plugin không bao giờ đụng xref.");
            foreach (var v in VaiTroBoQua.OrderBy(v => v.VaiTro))
            {
                dong.Add(
                    $"{v.So} đối tượng vai trò {NhanTangDialogViewModel.NhanVaiTro(v.VaiTro)} — ngoài danh " +
                    "sách copyRoles của rule pack, dựng lại bằng lệnh của chúng sau khi chép.");
            }
            if (SoVonLaBanChep > 0)
            {
                dong.Add(
                    $"⚠ {SoVonLaBanChep} đối tượng trong vùng chọn VỐN LÀ bản chép của tầng khác — vẫn chép " +
                    "được, nhưng nên chép từ chính tầng điển hình gốc.");
            }
            return dong;
        }
    }
}

/// <summary>Một tầng đích trong danh sách tick của hộp thoại (FR2/FR9).</summary>
public sealed class MucTangDich : INotifyPropertyChanged
{
    private readonly Action _khiDoi;
    private bool _chon;

    public MucTangDich(string nhanTang, int soBanChepDaCo, Action khiDoi)
    {
        NhanTang = nhanTang;
        SoBanChepDaCo = soBanChepDaCo;
        _khiDoi = khiDoi;
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    /// <summary>Nhãn tầng dùng cho <c>{floor}</c> — CHUỖI, giữ nguyên số 0 đứng đầu.</summary>
    public string NhanTang { get; }

    /// <summary>Số đối tượng tầng này ĐÃ có do chính lệnh nhân tầng sinh ra (FR9).</summary>
    public int SoBanChepDaCo { get; }

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

    /// <summary>Nhãn hiện cạnh ô tick — nói thẳng tầng nào đã có bản chép, không để kỹ sư đoán.</summary>
    public string Nhan =>
        SoBanChepDaCo > 0
            ? $"Tầng {NhanTang} — ĐÃ có {SoBanChepDaCo} đối tượng do lệnh này chép trước đó"
            : $"Tầng {NhanTang}";
}

/// <summary>Tham số một lần chạy <c>XBOSS_VE_NHANTANG</c> (dùng chung hộp thoại và dòng lệnh).</summary>
/// <param name="TangNguon">Nhãn tầng của tập nguồn — ghi vào XData bản chép để truy nguồn gốc.</param>
/// <param name="TangDich">Nhãn các tầng đích, ĐÚNG thứ tự chép (quyết định vị trí đặt).</param>
/// <param name="ChinhSach">Chính sách đã áp lựa chọn của kỹ sư (kiểu dời + bước) — nguồn DUY NHẤT
/// để tính vị trí đặt, để xem trước và lúc ghi không thể lệch nhau.</param>
/// <param name="ChepDe">Tầng đích đã có bản chép: true = xóa bản cũ rồi chép lại, false = bỏ qua.</param>
public sealed record KetQuaHoiNhanTang(
    string TangNguon,
    IReadOnlyList<string> TangDich,
    FloorPolicySection ChinhSach,
    bool ChepDe);

/// <summary>
/// ViewModel hộp thoại <c>XBOSS_VE_NHANTANG</c> (M111 FR2/FR3, khung M106): khai tầng nguồn +
/// tick tầng đích + kiểu dời, và <b>bảng XEM TRƯỚC bắt buộc</b> (guardrail §2.4) — chép 20 tầng
/// sai là hỏng cả buổi làm việc, nên mọi con số phải hiện TRƯỚC khi ghi.
///
/// Xem trước gọi thẳng <see cref="FloorReplicator"/> — đúng bộ hàm mà lệnh dùng lúc ghi (vị trí
/// đặt, đổi tag, đổi tên vùng, kế hoạch ánh xạ handle), nên bảng xem trước và kết quả thật không
/// thể lệch nhau. Đường hỏi đáp dòng lệnh (FR11) cũng dựng chính ViewModel này rồi in các dòng
/// <see cref="DongXemTruoc"/> ra dòng lệnh: một bộ máy xem trước duy nhất, không có bản thứ hai.
///
/// THUẦN .NET như mọi ViewModel M106: không WPF, không AutoCAD, test được trên CI Linux. Riêng
/// <see cref="ZoomToiNguon"/> là một <see cref="Action"/> do Adapter cắm vào (FR3 "nút zoom tới
/// vùng nguồn") — Core vẫn không biết AutoCAD là gì.
/// </summary>
public sealed class NhanTangDialogViewModel : DialogViewModelBase
{
    /// <summary>Số dòng xem trước hiện tối đa — dài hơn thì gộp phần đuôi thành một dòng đếm.</summary>
    private const int SoDongXemTruocToiDa = 24;

    private readonly FloorPolicySection _fp;
    private readonly string? _tagPattern;
    private readonly IReadOnlyList<DoiTuongNhanTang> _nguon;
    private readonly TomTatChonNhanTang _tomTat;
    private readonly IReadOnlyCollection<string> _vungDaCo;
    private readonly IReadOnlyCollection<string> _tagDaCo;
    private readonly int _soLoiKiemTra;
    private readonly Action? _zoom;

    private readonly IReadOnlyList<MucChon<KieuDatTang>> _cacKieuDat;
    private readonly IReadOnlyList<string> _vungNguon;

    private string _tangNguon;
    private KieuDatTang _kieuDat;
    private string _stepMm;
    private bool _chepDe;
    private string _thongBaoZoom = "";

    private IReadOnlyList<string> _dongXemTruoc = [];
    private IReadOnlyList<string> _dongVung = [];
    private IReadOnlyList<string> _tagKhongDoiDuoc = [];
    private IReadOnlyList<string> _vungTrung = [];
    private IReadOnlyList<string> _tagTrungSauChep = [];
    private int _soTangSeChep;
    private int _soDoiTuongMoiTang;

    /// <param name="fp">Khối <c>drawTools.floorPolicy</c> của rule pack (đã qua Validate).</param>
    /// <param name="tagPattern"><c>sheetSetup.tagPattern</c> — mẫu tách/dựng tag (FR5).</param>
    /// <param name="nguon">Các đối tượng SẼ được chép (Adapter đã lọc theo <c>copyRoles</c>).</param>
    /// <param name="tomTat">Phần vùng chọn KHÔNG chép, kèm lý do đếm được.</param>
    /// <param name="tangNguonGoiY">Tầng nguồn suy từ tag đang có; null = không suy được.</param>
    /// <param name="banChepDaCo">Nhãn tầng → số đối tượng bản chép đã có trong bản vẽ (FR9).</param>
    /// <param name="vungDaCo">Mọi tên vùng bóc đang có trong bản vẽ (FR6 — chống trùng tên).</param>
    /// <param name="tagDaCo">Mọi tag đang có trong bản vẽ (FR5 — kiểm trùng tag sau khi chép).</param>
    /// <param name="soLoiKiemTra">Số vị trí lỗi còn lại của lần <c>XBOSS_KIEMTRA</c> gần nhất —
    /// chỉ CẢNH BÁO, không chặn (chốt 2026-08-29).</param>
    /// <param name="zoomToiNguon">Adapter cắm hành vi zoom tới vùng nguồn; null = ẩn nút.</param>
    public NhanTangDialogViewModel(
        FloorPolicySection fp,
        string? tagPattern,
        IReadOnlyList<DoiTuongNhanTang> nguon,
        TomTatChonNhanTang tomTat,
        string? tangNguonGoiY,
        IReadOnlyDictionary<string, int> banChepDaCo,
        IReadOnlyCollection<string> vungDaCo,
        IReadOnlyCollection<string> tagDaCo,
        int soLoiKiemTra,
        Action? zoomToiNguon = null)
    {
        _fp = fp;
        _tagPattern = tagPattern;
        _nguon = nguon;
        _tomTat = tomTat;
        _vungDaCo = vungDaCo;
        _tagDaCo = tagDaCo;
        _soLoiKiemTra = soLoiKiemTra;
        _zoom = zoomToiNguon;

        _tangNguon = tangNguonGoiY ?? "";
        _kieuDat = FloorReplicator.DocKieuDat(fp.LayoutMode);
        _stepMm = SoThuan(fp.StepMm);
        _cacKieuDat =
        [
            new MucChon<KieuDatTang>(KieuDatTang.OffsetY, "Dời theo trục Y (xếp dọc)"),
            new MucChon<KieuDatTang>(KieuDatTang.OffsetX, "Dời theo trục X (xếp ngang)"),
            new MucChon<KieuDatTang>(KieuDatTang.Luoi, $"Xếp lưới {fp.GridColumns} cột"),
        ];

        // Tên vùng bóc của tập nguồn đọc từ DẤU BÓC (XBOSS_BOCKL) — đây là tên đã đi vào sheet
        // Tong-hop-vung, nên là tên duy nhất phải giữ trùng khít khi đổi theo zoneNamePattern.
        _vungNguon = nguon
            .Where(n => !string.IsNullOrWhiteSpace(n.VungBoc))
            .Select(n => n.VungBoc)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        CacTangDich = fp.Floors
            .Select(t => new MucTangDich(t, banChepDaCo.GetValueOrDefault(t), TinhLai))
            .ToList();

        TinhLai();
    }

    public override string TieuDe => "XBOSS_VE_NHANTANG — Nhân bản tầng điển hình";

    public override string MoTa =>
        "Chép hệ của tầng điển hình sang các tầng khác, giữ nguyên dữ liệu XBoss và tự đổi tag " +
        "theo tầng. Xem kỹ bảng bên dưới trước khi bấm OK — lệnh ghi cả N tầng trong một lần.";

    // ===== Vùng chọn =====

    /// <summary>Mô tả tập nguồn: bao nhiêu đối tượng theo từng vai trò.</summary>
    public string MoTaVungChon =>
        _nguon.Count == 0
            ? "Vùng chọn không có đối tượng nào chép được."
            : $"Sẽ chép {_nguon.Count} đối tượng: " +
              string.Join(
                  ", ",
                  _nguon.GroupBy(n => n.XData.VaiTro)
                      .OrderBy(g => g.Key)
                      .Select(g => $"{NhanVaiTro(g.Key)} {g.Count()}")) +
              $" · {SoTuyen} tuyến · tổng dài {So(TongDaiMm)}mm mỗi tầng.";

    /// <summary>Lý do BỎ QUA từng phần của vùng chọn (FR1/FR7) — hiện nguyên văn, không gộp im lặng.</summary>
    public IReadOnlyList<string> DongBoQua => _tomTat.DongBoQua;

    /// <summary>Nút "zoom tới vùng nguồn" có hiện không (FR3) — Adapter không cắm thì ẩn.</summary>
    public bool CoNutZoom => _zoom is not null;

    /// <summary>Kết quả lần bấm zoom gần nhất (rỗng = chưa bấm).</summary>
    public string ThongBaoZoom
    {
        get => _thongBaoZoom;
        private set => Dat(ref _thongBaoZoom, value);
    }

    /// <summary>
    /// Bấm nút "zoom tới vùng nguồn". Hành vi thật nằm ở Adapter (đổi khung nhìn) — hộp thoại
    /// vẫn KHÔNG đọc/ghi bản vẽ (guardrail M106 §2.1). Lỗi được nuốt kèm thông báo tiếng Việt:
    /// không nhìn được vùng nguồn thì bất tiện, chứ không được làm chết lệnh.
    /// </summary>
    public void ZoomToiNguon()
    {
        if (_zoom is null) return;
        try
        {
            _zoom();
            ThongBaoZoom = "Đã zoom tới vùng nguồn.";
        }
        catch (Exception e)
        {
            ThongBaoZoom = $"Không zoom được ({e.GetType().Name}) — kéo bản vẽ bằng tay, lệnh vẫn chạy bình thường.";
        }
    }

    // ===== Tham số =====

    /// <summary>Nhãn tầng của tập nguồn (chuỗi — giữ số 0 đứng đầu như hồ sơ).</summary>
    public string TangNguon
    {
        get => _tangNguon;
        set
        {
            if (!Dat(ref _tangNguon, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Danh sách tầng khai trong rule pack để tick (FR2).</summary>
    public IReadOnlyList<MucTangDich> CacTangDich { get; }

    public IReadOnlyList<MucChon<KieuDatTang>> CacKieuDat => _cacKieuDat;

    public MucChon<KieuDatTang>? MucKieuDatChon
    {
        get => _cacKieuDat.FirstOrDefault(m => m.GiaTri == _kieuDat);
        set
        {
            if (value is null || value.GiaTri == _kieuDat) return;
            _kieuDat = value.GiaTri;
            Bao(nameof(MucKieuDatChon));
            TinhLai();
        }
    }

    /// <summary>Bước dời giữa 2 tầng liền nhau (mm) — mặc định rule pack, sửa được (FR2).</summary>
    public string StepMm
    {
        get => _stepMm;
        set
        {
            if (!Dat(ref _stepMm, (value ?? "").Trim())) return;
            TinhLai();
        }
    }

    /// <summary>Có tầng đích nào ĐÃ mang bản chép của lệnh này không (FR9).</summary>
    public bool CoTangDaChep => CacTangDich.Any(t => t.Chon && t.SoBanChepDaCo > 0);

    /// <summary>Tầng đã có bản chép: xóa bản cũ rồi chép lại. Mặc định FALSE = bỏ qua (FR9).</summary>
    public bool ChepDe
    {
        get => _chepDe;
        set
        {
            if (!Dat(ref _chepDe, value)) return;
            TinhLai();
        }
    }

    public string MoTaChepDe =>
        CoTangDaChep
            ? "Các tầng đánh dấu ở trên đã có bản chép. Bỏ trống = BỎ QUA tầng đó (mặc định); " +
              "tick = xóa bản chép cũ CỦA ĐÚNG tầng đó rồi chép lại (không nhân đôi)."
            : "Chưa tầng đích nào có bản chép của lệnh này.";

    // ===== Xem trước (FR3 — guardrail §2.4) =====

    /// <summary>Mỗi dòng một tầng đích: vị trí đặt, số đối tượng, ví dụ tag trước → sau.</summary>
    public IReadOnlyList<string> DongXemTruoc => _dongXemTruoc;

    /// <summary>Kế hoạch đổi tên vùng bóc (FR6) — rỗng khi tập nguồn chưa bóc lần nào.</summary>
    public IReadOnlyList<string> DongVung => _dongVung;

    public bool CoVung => _dongVung.Count > 0;

    public string TomTatXemTruoc =>
        _soTangSeChep == 0
            ? "Chưa chọn tầng đích nào — chưa có gì được ghi."
            : $"Sẽ ghi {_soTangSeChep} tầng × {_soDoiTuongMoiTang} đối tượng = " +
              $"{_soTangSeChep * _soDoiTuongMoiTang} đối tượng mới, tổng dài thêm " +
              $"{So(_soTangSeChep * TongDaiMm)}mm. Tất cả trong MỘT lần ghi — một lần UNDO hoàn tác hết.";

    protected override IReadOnlyList<string> Kiem()
    {
        var loi = new List<string>();
        if (_nguon.Count == 0)
        {
            loi.Add(
                "Vùng chọn không có đối tượng nào chép được — chỉ chép đối tượng do bộ lệnh XBOSS_VE " +
                "sinh ra và có vai trò nằm trong copyRoles của rule pack.");
            return loi;
        }
        if (_tangNguon.Length == 0)
        {
            loi.Add("Chưa khai tầng NGUỒN — cần biết {floor} hiện tại mới đổi tag sang tầng đích được.");
        }

        var tangDich = TangDichDaChon();
        if (tangDich.Count == 0) loi.Add("Chưa tick tầng đích nào.");
        if (tangDich.Contains(_tangNguon, StringComparer.Ordinal))
        {
            loi.Add(
                $"Tầng đích trùng tầng nguồn ({_tangNguon}) — chép chồng lên chính tầng nguồn là hỏng " +
                "cả tầng điển hình. Bỏ tick tầng đó.");
        }

        if (DocStepMm() is not { } step)
            loi.Add($"Bước dời \"{_stepMm}\" không hợp lệ — nhập số dương (mm), vd 30000.");
        else if (step <= 0)
            loi.Add("Bước dời phải dương — hai tầng sẽ chồng khít lên nhau.");

        if (_vungTrung.Count > 0)
        {
            // FR6/AC9 — KHÔNG tự thêm hậu tố: tên vùng đi thẳng vào sheet Excel Tong-hop-vung.
            loi.Add(
                "Tên vùng bóc của bản chép TRÙNG vùng đã có: " + string.Join(", ", _vungTrung.Take(5)) +
                (_vungTrung.Count > 5 ? $" (và {_vungTrung.Count - 5} tên nữa)" : "") +
                " — đổi zoneNamePattern hoặc dọn vùng cũ, lệnh không tự thêm hậu tố.");
        }

        if (tangDich.Count > 0 && _soTangSeChep == 0)
        {
            loi.Add(
                "Mọi tầng đã tick đều đã có bản chép và đang ở chế độ BỎ QUA — lệnh sẽ không ghi gì. " +
                "Tick \"chép đè\" nếu muốn chép lại.");
        }
        return loi;
    }

    protected override IReadOnlyList<string> KiemCanhBao()
    {
        var canhBao = new List<string>();

        // Chốt 2026-08-29: tầng nguồn đang đỏ KIEMTRA thì CẢNH BÁO, KHÔNG CHẶN — bản vẽ của người
        // khác gần như luôn có lỗi tồn đọng, chặn là khóa kỹ sư khỏi chính tính năng họ cần.
        if (_soLoiKiemTra > 0)
        {
            canhBao.Add(
                $"⚠ Bản vẽ còn {_soLoiKiemTra} vị trí lỗi khoanh tròn từ lần XBOSS_KIEMTRA gần nhất — " +
                $"chép sang {Math.Max(_soTangSeChep, 1)} tầng là nhân số lỗi đó lên. Nên chạy XBOSS_KIEMTRA " +
                "và sửa tầng nguồn trước; lệnh vẫn chạy nếu bạn quyết định chép ngay.");
        }

        if (_tagKhongDoiDuoc.Count > 0)
        {
            canhBao.Add(
                $"{_tagKhongDoiDuoc.Count} tag không khớp mẫu rule pack nên GIỮ NGUYÊN (không đoán bừa): " +
                string.Join(", ", _tagKhongDoiDuoc.Take(5)) +
                (_tagKhongDoiDuoc.Count > 5 ? "…" : "") + ".");
        }

        if (_tagTrungSauChep.Count > 0)
        {
            canhBao.Add(
                $"Sau khi chép sẽ có {_tagTrungSauChep.Count} tag TRÙNG với tag đang có: " +
                string.Join(", ", _tagTrungSauChep.Take(5)) +
                (_tagTrungSauChep.Count > 5 ? "…" : "") +
                " — chạy XBOSS_VE_TAG để đánh lại sau khi chép.");
        }

        var soGo = SoLienKetSeGo;
        if (soGo > 0)
        {
            canhBao.Add(
                $"{soGo} liên kết trong dữ liệu XBoss trỏ RA NGOÀI vùng chọn (nhãn/biên/mặt cắt không " +
                "được chọn) — bản chép sẽ GỠ các liên kết đó, tuyệt đối không để trỏ ngược về tầng nguồn.");
        }

        var soBoc = _nguon.Count(n => n.DaBoc);
        if (soBoc > 0)
        {
            canhBao.Add(
                $"{soBoc} đối tượng nguồn đang mang dấu đã bóc — bản chép sẽ được GỠ dấu bóc " +
                "(tầng mới chưa bóc lần nào), chạy XBOSS_BOCKL cho tầng mới.");
        }

        var boQuaTang = CacTangDich.Where(t => t.Chon && t.SoBanChepDaCo > 0).ToList();
        if (boQuaTang.Count > 0)
        {
            canhBao.Add(
                (_chepDe
                    ? "CHÉP ĐÈ: sẽ xóa bản chép cũ rồi chép lại các tầng "
                    : "BỎ QUA: giữ nguyên bản chép cũ, không ghi gì cho các tầng ") +
                string.Join(", ", boQuaTang.Select(t => t.NhanTang)) + ".");
        }

        if (_tomTat.VaiTroBoQua.Count > 0)
        {
            canhBao.Add(
                "Hồ sơ/trình bày không được chép — sau khi chép nhớ chạy lại XBOSS_VE_THONGKE, " +
                "XBOSS_VE_MATCAT, XBOSS_VE_NGATNET cho các tầng mới.");
        }
        return canhBao;
    }

    /// <summary>Tham số để lệnh chạy; null khi form chưa hợp lệ.</summary>
    public KetQuaHoiNhanTang? KetQua() =>
        CoTheOk && DocStepMm() is { } step
            ? new KetQuaHoiNhanTang(
                _tangNguon,
                TangDichSeChep(),
                FloorReplicator.VoiKieuDat(_fp, _kieuDat, step),
                _chepDe)
            : null;

    // ===== Nội bộ =====

    /// <summary>Số tuyến tim trong tập nguồn (con số kỹ sư đối chiếu nhanh nhất).</summary>
    private int SoTuyen => _nguon.Count(n => n.XData.VaiTro == VaiTroVe.Tim);

    /// <summary>Tổng chiều dài tim của một tầng (mm) — mỗi tầng chép thêm đúng ngần này.</summary>
    private double TongDaiMm => _nguon.Sum(n => n.DaiMm);

    /// <summary>
    /// Số liên kết handle sẽ bị GỠ vì trỏ ra ngoài vùng chọn (guardrail §2.2). Tính bằng CHÍNH
    /// <see cref="FloorReplicator.AnhXaXData"/> mà lệnh dùng lúc ghi, với bảng ánh xạ "mỗi handle
    /// nguồn trỏ về chính nó" — cùng một hàm, nên xem trước không thể lệch kết quả thật.
    /// </summary>
    private int SoLienKetSeGo
    {
        get
        {
            var trongTap = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var n in _nguon) trongTap[n.Handle] = n.Handle;
            return _nguon.Sum(n => FloorReplicator.AnhXaXData(n.XData, trongTap, "", "").HandleDaGo.Count);
        }
    }

    /// <summary>Tầng đích đang tick (theo đúng thứ tự rule pack khai).</summary>
    private List<string> TangDichDaChon() =>
        CacTangDich.Where(t => t.Chon).Select(t => t.NhanTang).ToList();

    /// <summary>Tầng THỰC SỰ sẽ ghi: bỏ các tầng đã có bản chép khi đang ở chế độ bỏ qua (FR9).</summary>
    private List<string> TangDichSeChep() =>
        CacTangDich
            .Where(t => t.Chon && (_chepDe || t.SoBanChepDaCo == 0))
            .Select(t => t.NhanTang)
            .ToList();

    /// <summary>Bước dời kỹ sư gõ; null = không đọc được. Nhận cả dạng có dấu phân cách nghìn
    /// (kỹ sư hay chép lại đúng chuỗi đang hiện trong bảng xem trước).</summary>
    private double? DocStepMm() =>
        double.TryParse(
            _stepMm, NumberStyles.Float | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var v)
            ? v
            : null;

    /// <summary>Chính sách đã áp lựa chọn của kỹ sư; null khi bước dời chưa hợp lệ.</summary>
    private FloorPolicySection? ChinhSachHieuLuc() =>
        DocStepMm() is { } step && step > 0 ? FloorReplicator.VoiKieuDat(_fp, _kieuDat, step) : null;

    /// <summary>Tính lại toàn bộ xem trước rồi báo giao diện + chạy bộ kiểm.</summary>
    private void TinhLai()
    {
        var seChep = TangDichSeChep();
        _soTangSeChep = seChep.Count;
        _soDoiTuongMoiTang = _nguon.Count;

        XemTruocLai(seChep);
        Bao(
            nameof(MoTaVungChon), nameof(DongBoQua), nameof(CoTangDaChep), nameof(MoTaChepDe),
            nameof(DongXemTruoc), nameof(DongVung), nameof(CoVung), nameof(TomTatXemTruoc));
        KiemLai();
    }

    private void XemTruocLai(IReadOnlyList<string> seChep)
    {
        var dong = new List<string>();
        var vung = new List<string>();
        var vungTrung = new List<string>();
        var tagKhong = new List<string>();
        var tagTrung = new List<string>();

        var fp = ChinhSachHieuLuc();
        if (fp is null || seChep.Count == 0)
        {
            _dongXemTruoc = dong;
            _dongVung = vung;
            _vungTrung = vungTrung;
            _tagKhongDoiDuoc = tagKhong;
            _tagTrungSauChep = tagTrung;
            return;
        }

        var tags = _nguon
            .Where(n => !string.IsNullOrWhiteSpace(n.Tag))
            .Select(n => new TagHienCo(n.Handle, n.Tag!, "", n.XData.TagKhoa))
            .ToList();

        // Tên vùng đã dùng lớn dần theo từng tầng: hai tầng đích cho ra cùng một tên vùng cũng là
        // trùng (sheet Tong-hop-vung sẽ gộp nhầm), không chỉ trùng với vùng đã có sẵn.
        var vungDaDung = new List<string>(_vungDaCo);
        var tagSeCo = new List<string>(_tagDaCo);

        // Ô cố định theo nhãn tầng (không phụ thuộc lần này tick bao nhiêu tầng) — cùng phép tính
        // mà lệnh dùng lúc ghi, xem FloorReplicator.LapKeHoachDat(fp, tangNguon, tangDich).
        foreach (var kh in FloorReplicator.LapKeHoachDat(fp, _tangNguon, seChep))
        {
            var keHoachTag = FloorReplicator.LapKeHoachDoiTag(_tagPattern, tags, kh.NhanTang);
            foreach (var t in keHoachTag.KhongDoiDuoc)
            {
                if (!tagKhong.Contains(t, StringComparer.Ordinal)) tagKhong.Add(t);
            }
            foreach (var g in keHoachTag.Doi)
            {
                if (tagSeCo.Contains(g.TagMoi, StringComparer.OrdinalIgnoreCase) &&
                    !tagTrung.Contains(g.TagMoi, StringComparer.OrdinalIgnoreCase))
                {
                    tagTrung.Add(g.TagMoi);
                }
                tagSeCo.Add(g.TagMoi);
            }

            var viDu = keHoachTag.Doi.Count > 0
                ? $" · tag {keHoachTag.Doi[0].TagCu} → {keHoachTag.Doi[0].TagMoi}"
                : "";
            var daCo = CacTangDich.First(t => t.NhanTang == kh.NhanTang).SoBanChepDaCo;
            var ghiChu = daCo > 0 ? $" · CHÉP ĐÈ (xóa {daCo} đối tượng cũ)" : "";
            if (dong.Count < SoDongXemTruocToiDa)
            {
                dong.Add(
                    $"Tầng {kh.NhanTang}: dời ({So(kh.Doi.X)}; {So(kh.Doi.Y)}) mm · " +
                    $"{_nguon.Count} đối tượng{viDu}{ghiChu}");
            }

            if (_vungNguon.Count > 0)
            {
                var keHoachVung = FloorReplicator.LapKeHoachDoiTenVung(fp, _vungNguon, vungDaDung, kh.NhanTang);
                foreach (var (cu, moi) in keHoachVung.Doi)
                {
                    vung.Add($"Tầng {kh.NhanTang}: vùng \"{cu}\" → \"{moi}\"");
                    vungDaDung.Add(moi);
                }
                vungTrung.AddRange(keHoachVung.Trung);
            }
        }
        if (seChep.Count > dong.Count)
            dong.Add($"… và {seChep.Count - dong.Count} tầng nữa.");

        _dongXemTruoc = dong;
        _dongVung = vung;
        _vungTrung = vungTrung;
        _tagKhongDoiDuoc = tagKhong;
        _tagTrungSauChep = tagTrung;
    }

    /// <summary>Nhãn tiếng Việt của vai trò — chỉ dùng để hiển thị, không vào dữ liệu.</summary>
    public static string NhanVaiTro(VaiTroVe vaiTro) => vaiTro switch
    {
        VaiTroVe.Tim => "tim tuyến",
        VaiTroVe.Bien => "nét biên",
        VaiTroVe.Nhan => "nhãn",
        VaiTroVe.TuyenCat => "tuyến cắt",
        VaiTroVe.MatCat => "mặt cắt",
        VaiTroVe.PhuKien => "phụ kiện",
        VaiTroVe.ThietBi => "thiết bị",
        VaiTroVe.DinhNghiaBlock => "định nghĩa block",
        VaiTroVe.GiaDo => "giá đỡ",
        VaiTroVe.LoCho => "lỗ chờ",
        VaiTroVe.BangThongKe => "bảng thống kê",
        VaiTroVe.VachChia => "vạch chia đốt",
        VaiTroVe.NhanDot => "tag đốt",
        _ => vaiTro.ToString(),
    };

    /// <summary>Số hiện trên bảng xem trước (có dấu phân cách nghìn — đọc nhanh hơn ở cỡ 30000).</summary>
    private static string So(double v) => v.ToString("#,##0.##", CultureInfo.InvariantCulture);

    /// <summary>Số đưa vào Ô NHẬP: không dấu phân cách nghìn để gõ/sửa lại cho gọn.</summary>
    private static string SoThuan(double v) => v.ToString("0.######", CultureInfo.InvariantCulture);
}
